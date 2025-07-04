from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from azure.cosmos import CosmosClient, exceptions as cosmos_exceptions
from azure.identity import DefaultAzureCredential
from openai import AsyncAzureOpenAI
from typing import List, Optional, Dict
from uuid import uuid4
import logging
import json
import redis
import os
import time
from datetime import datetime

from .models import FeedbackDocument
from .config import (
    COSMOSDB_ENDPOINT,
    DATABASE_NAME,
    OFFICIAL_DOCUMENTS_CONTAINER_NAME,
    UNOFFICIAL_PARTNER_FEEDBACK_HELPFUL_CONTAINER_NAME,
    UNOFFICIAL_PARTNER_FEEDBACK_UNHELPFUL_CONTAINER_NAME,
    UNOFFICIAL_USER_FEEDBACK_HELPFUL_CONTAINER_NAME,
    UNOFFICIAL_USER_FEEDBACK_UNHELPFUL_CONTAINER_NAME,
    NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME,
    NBA_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME,
    MLB_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME,
    CONTAINER_DISPLAY_NAMES,
    OPENAI_ENDPOINT,
    OPENAI_API_VERSION,
    OPENAI_DEPLOYMENT,
    AVAILABLE_DATABASES
)
from .postgres_service import postgres_service

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Allowed container names to prevent unauthorized access
ALLOWED_CONTAINERS = {
    OFFICIAL_DOCUMENTS_CONTAINER_NAME,
    MLB_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME,
    NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME,
    NBA_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME,
    # Keep legacy containers for backwards compatibility
    UNOFFICIAL_PARTNER_FEEDBACK_HELPFUL_CONTAINER_NAME,
    UNOFFICIAL_PARTNER_FEEDBACK_UNHELPFUL_CONTAINER_NAME,
    UNOFFICIAL_USER_FEEDBACK_HELPFUL_CONTAINER_NAME,
    UNOFFICIAL_USER_FEEDBACK_UNHELPFUL_CONTAINER_NAME,
}

def validate_container_name(container_name: str) -> None:
    """Ensure the provided container name is one of the expected values."""
    if container_name not in ALLOWED_CONTAINERS:
        logger.warning(f"Attempted access to invalid container: {container_name}")
        raise HTTPException(status_code=400, detail="Invalid container name")

# Initialize Redis client if REDIS_URL is set
redis_client = redis.from_url(os.getenv("REDIS_URL")) if os.getenv("REDIS_URL") else None

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_embedding(client: AsyncAzureOpenAI, text: str, model: str) -> List[float]:
    """Generate embeddings for a given text using Azure OpenAI."""
    try:
        response = await client.embeddings.create(
            model=model,
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"Error generating embedding: {e}")
        return None

def get_container_client(container_name: str):
    """Get a container client with error handling."""
    validate_container_name(container_name)
    try:
        credential = DefaultAzureCredential()
        cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container_name)
        # Test if container exists
        container_client.read()
        return container_client
    except cosmos_exceptions.CosmosResourceNotFoundError:
        logger.error(f"Container not found: {container_name}")
        raise HTTPException(
            status_code=404,
            detail=f"Container '{container_name}' not found"
        )
    except Exception as e:
        logger.error(f"Error getting container client: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/feedback/documents", response_model=List[FeedbackDocument])
async def get_documents(
    page: int = 1,
    limit: int = 20,
    container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Container name to fetch documents from")
):
    validate_container_name(container)
    try:
        logger.info(f"Attempting to fetch documents from container: {container}")
        start_time = time.time()

        # Try to get from cache first
        cache_key = f"feedback_documents:{container}:page_{page}"
        if redis_client:
            cached_data = redis_client.get(cache_key)
            if cached_data:
                logger.info(f"Retrieved documents from cache for {container}")
                return json.loads(cached_data)

        container_client = get_container_client(container)
        
        query = """
            SELECT * FROM c 
            ORDER BY c._ts DESC 
            OFFSET @offset LIMIT @limit
        """
        parameters = [
            {"name": "@offset", "value": (page - 1) * limit},
            {"name": "@limit", "value": limit}
        ]
        
        items = list(container_client.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        # Cache the results for 5 minutes
        if redis_client:
            redis_client.setex(
                cache_key,
                300,  # 5 minutes
                json.dumps(items)
            )
        
        end_time = time.time()
        logger.info(f"Documents fetch completed in {end_time - start_time:.2f} seconds")
        logger.info(f"Retrieved {len(items)} documents from {container}")
        
        return items
    except Exception as e:
        logger.error(f"Error in get_documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/feedback/documents/search", response_model=List[FeedbackDocument])
async def search_documents(
    q: str = Query(..., description="Search term"),
    container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Container name to search in"),
    field: str = Query("UserPrompt", description="Document field to search")
):
    validate_container_name(container)
    try:
        if field not in {"UserPrompt", "Query"}:
            raise HTTPException(status_code=400, detail="Invalid field")

        credential = DefaultAzureCredential()
        cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container)

        query = f"""
            SELECT * FROM c
            WHERE CONTAINS(LOWER(c.{field}), LOWER(@search_term))
            ORDER BY c._ts DESC
        """
        parameters = [
            {"name": "@search_term", "value": q.lower()}
        ]

        items = list(container_client.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/feedback/documents", response_model=FeedbackDocument)
async def create_document(
    document: FeedbackDocument,
    container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Container name to create document in")
):
    validate_container_name(container)
    try:
        credential = DefaultAzureCredential()
        cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container)
        
        doc_dict = document.model_dump(exclude_unset=True)
        doc_dict["id"] = str(uuid4())
        
        response = container_client.create_item(doc_dict)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/feedback/documents/{doc_id}", response_model=FeedbackDocument)
async def update_document(
    doc_id: str,
    document: FeedbackDocument,
    container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Container name to update document in")
):
    validate_container_name(container)
    try:
        credential = DefaultAzureCredential()
        cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container)
        
        doc_dict = document.model_dump()
        doc_dict["id"] = doc_id
        
        response = container_client.upsert_item(doc_dict)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/feedback/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Container name to delete document from")
):
    validate_container_name(container)
    try:
        credential = DefaultAzureCredential()
        cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container)
        
        container_client.delete_item(item=doc_id, partition_key=doc_id)
        return {"status": "success", "message": "Document deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/feedback/documents/{doc_id}/transfer")
async def transfer_document(
    doc_id: str,
    source_container: str = Query(..., description="Source container name"),
    target_container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Target container name")
):
    validate_container_name(source_container)
    validate_container_name(target_container)
    try:
        logger.info(f"Transferring document {doc_id} from {source_container} to {target_container}")
        
        # Get container clients
        source_container_client = get_container_client(source_container)
        target_container_client = get_container_client(target_container)
        
        # Get the document from source container
        doc = source_container_client.read_item(item=doc_id, partition_key=doc_id)
        
        # Generate new ID for the target document
        doc["id"] = str(uuid4())
        
        # If transferring to official container, generate embeddings
        is_official_target = target_container in ["mlb", "nba-official"]
        if is_official_target:
            openai_client = AsyncAzureOpenAI(
                azure_endpoint=OPENAI_ENDPOINT,
                api_version=OPENAI_API_VERSION,
                api_key=os.getenv("AZURE_OPENAI_API_KEY")
            )
            
            logger.info(f"Generating embeddings for transfer to official container: {target_container}")
            
            # Generate embeddings using text-embeddings-ada-002 model
            if doc.get("UserPrompt"):
                logger.info("Generating embedding for UserPrompt")
                doc["userpromptvector"] = await get_embedding(openai_client, doc["UserPrompt"], "text-embedding-ada-002")
            if doc.get("Query"):
                logger.info("Generating embedding for Query")  
                doc["queryvector"] = await get_embedding(openai_client, doc["Query"], "text-embedding-ada-002")
            
            logger.info("Embeddings generated successfully")
        
        # Create in target container
        response = target_container_client.create_item(doc)
        
        # Delete from source container
        source_container_client.delete_item(item=doc_id, partition_key=doc_id)
        
        # Invalidate caches
        if redis_client:
            # Invalidate source container cache
            source_keys = redis_client.keys(f"feedback_documents:{source_container}:page_*")
            if source_keys:
                redis_client.delete(*source_keys)
            
            # Invalidate target container cache
            target_keys = redis_client.keys(f"feedback_documents:{target_container}:page_*")
            if target_keys:
                redis_client.delete(*target_keys)
        
        logger.info(f"Successfully transferred document {doc_id}")
        return response
    except Exception as e:
        logger.error(f"Error in transfer_document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/feedback/containers")
async def get_feedback_containers():
    """Get list of available feedback containers with display names."""
    return {
        "containers": [
            {"value": "mlb", "label": "MLB Official"},
            {"value": "mlb-unofficial", "label": "MLB Unofficial"},
            {"value": "nba-official", "label": "NBA Official"},
            {"value": "nba-unofficial", "label": "NBA Unofficial"}
        ]
    }

# PostgreSQL Query Endpoints

@app.get("/api/databases")
async def get_available_databases():
    """Get list of available databases for queries."""
    try:
        databases = postgres_service.get_available_databases()
        return {"databases": databases}
    except Exception as e:
        logger.error(f"Error getting available databases: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/query")
async def execute_query(
    request: Dict[str, str]
):
    """Execute a SQL query against the specified database."""
    try:
        database = request.get("database")
        query = request.get("query")
        
        if not database:
            raise HTTPException(status_code=400, detail="Database is required")
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        if not postgres_service.validate_database(database):
            raise HTTPException(status_code=400, detail=f"Invalid database: {database}")
        
        logger.info(f"Executing query on {database}: {query[:100]}...")
        result = postgres_service.execute_query(database, query)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing query: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/databases/{database}/test")
async def test_database_connection(database: str):
    """Test connection to a specific database."""
    try:
        if not postgres_service.validate_database(database):
            raise HTTPException(status_code=400, detail=f"Invalid database: {database}")
        
        result = postgres_service.test_connection(database)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing database connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/databases/{database}/tables")
async def get_database_tables(database: str):
    """Get list of tables in the specified database."""
    try:
        if not postgres_service.validate_database(database):
            raise HTTPException(status_code=400, detail=f"Invalid database: {database}")
        
        result = postgres_service.get_tables(database)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting database tables: {e}")
        raise HTTPException(status_code=500, detail=str(e)) 