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
from dotenv import load_dotenv
load_dotenv()

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
from .azure_search_service import azure_search_service
from .cache_service import cache_service

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

app = FastAPI(
    title="Blitz Sports API",
    description="Memory-optimized sports data API",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Frontend dev server
        "http://localhost:5174",  # Alternative dev server port
        "https://main.d12z6l6ulzfbg.amplifyapp.com",  # Production frontend on Amplify
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request size limiting middleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
import asyncio

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_size: int = 10 * 1024 * 1024):  # 10MB limit
        super().__init__(app)
        self.max_size = max_size

    async def dispatch(self, request: Request, call_next):
        if request.headers.get("content-length"):
            content_length = int(request.headers["content-length"])
            if content_length > self.max_size:
                return JSONResponse(
                    status_code=413,
                    content={"error": "Request too large", "max_size_mb": self.max_size // (1024 * 1024)}
                )
        return await call_next(request)

app.add_middleware(RequestSizeLimitMiddleware, max_size=10 * 1024 * 1024)  # 10MB limit

@app.on_event("startup")
async def startup_event():
    """Initialize application without memory-intensive operations."""
    logger.info("Application startup - memory-optimized mode")
    if cache_service.cache_enabled:
        logger.info("Cache service ready - warming will happen on-demand")
    else:
        logger.info("Cache service disabled - Redis not configured")

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

def get_cosmos_client():
    """Get a Cosmos DB client with proper authentication."""
    # Try connection string first, then key authentication, then DefaultAzureCredential
    cosmos_connection_string = os.getenv("COSMOS_CONNECTION_STRING")
    cosmos_key = os.getenv("COSMOS_DB_KEY") or os.getenv("COSMOS_KEY") or os.getenv("AZURE_COSMOS_KEY")
    cosmos_endpoint = os.getenv("COSMOS_DB_ENDPOINT") or COSMOSDB_ENDPOINT
    
    if cosmos_connection_string:
        logger.info("Using Cosmos DB connection string")
        return CosmosClient.from_connection_string(cosmos_connection_string)
    elif cosmos_key:
        logger.info("Using Cosmos DB key authentication")
        return CosmosClient(cosmos_endpoint, credential=cosmos_key)
    else:
        logger.info("Using DefaultAzureCredential")
        credential = DefaultAzureCredential()
        return CosmosClient(cosmos_endpoint, credential=credential)

def get_container_client(container_name: str):
    """Get a container client with error handling."""
    validate_container_name(container_name)
    try:
        cosmos_client = get_cosmos_client()
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

        # Try to get from enhanced cache first
        cached_data = cache_service.get_page_cache(container, page, limit)
        if cached_data:
            logger.info(f"Retrieved documents from cache for {container} (page {page})")
            return cached_data

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

        # Cache the results using enhanced cache service
        cache_service.set_page_cache(container, page, items, limit)
        
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

        # Try to get from cache first
        cached_data = cache_service.get_search_cache(container, q, field)
        if cached_data:
            logger.info(f"Retrieved search results from cache for '{q}' in {field}")
            return cached_data

        cosmos_client = get_cosmos_client()
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

        # Cache the search results
        cache_service.set_search_cache(container, q, field, items)
        logger.info(f"Search completed for '{q}' in {field}: {len(items)} results")

        return items
    except Exception as e:
        logger.error(f"Error in search_documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/feedback/documents/all", response_model=List[FeedbackDocument])
async def get_all_documents(
    container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Container name to fetch all documents from"),
    limit: int = Query(1000, description="Maximum number of documents to return (default: 1000, max: 5000)")
):
    """Get documents from a container with memory-safe limits."""
    validate_container_name(container)
    
    # Enforce maximum limit to prevent memory issues
    if limit > 5000:
        limit = 5000
        logger.warning(f"Limit reduced to 5000 to prevent memory issues")
    
    try:
        logger.info(f"Attempting to fetch up to {limit} documents from container: {container}")
        start_time = time.time()

        # Try to get from enhanced cache first (only if reasonable limit)
        if limit <= 1000:
            cached_data = cache_service.get_all_cache(container)
            if cached_data:
                logger.info(f"Retrieved documents from cache for {container}")
                return cached_data[:limit]  # Return only requested amount

        container_client = get_container_client(container)
        
        query = """
            SELECT * FROM c 
            ORDER BY c._ts DESC
            OFFSET 0 LIMIT @limit
        """
        parameters = [{"name": "@limit", "value": limit}]
        
        items = list(container_client.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))

        # Only cache if result is reasonable size
        if len(items) <= 1000:
            cache_service.set_all_cache(container, items)
        
        end_time = time.time()
        logger.info(f"Limited documents fetch completed in {end_time - start_time:.2f} seconds")
        logger.info(f"Retrieved {len(items)} documents from {container} (limit: {limit})")
        
        return items
    except Exception as e:
        logger.error(f"Error in get_all_documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/feedback/documents", response_model=FeedbackDocument)
async def create_document(
    document: FeedbackDocument,
    container: str = Query(OFFICIAL_DOCUMENTS_CONTAINER_NAME, description="Container name to create document in")
):
    validate_container_name(container)
    try:
        cosmos_client = get_cosmos_client()
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container)
        
        doc_dict = document.model_dump(exclude_unset=True)
        doc_dict["id"] = str(uuid4())

        # Generate embeddings if creating in official container
        if container in [OFFICIAL_DOCUMENTS_CONTAINER_NAME, NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME]:
            openai_client = AsyncAzureOpenAI(
                azure_endpoint=OPENAI_ENDPOINT,
                api_version=OPENAI_API_VERSION,
                api_key=os.getenv("AZURE_OPENAI_API_KEY")
            )
            # Generate embeddings using text-embedding-ada-002 model
            if doc_dict.get("UserPrompt"):
                user_prompt_vec = await get_embedding(openai_client, doc_dict["UserPrompt"], "text-embedding-ada-002")
                if user_prompt_vec is None:
                    raise HTTPException(status_code=500, detail="Failed to generate UserPromptVector embedding. Check Azure OpenAI configuration and logs.")
                doc_dict["UserPromptVector"] = user_prompt_vec
            if doc_dict.get("Query"):
                query_vec = await get_embedding(openai_client, doc_dict["Query"], "text-embedding-ada-002")
                if query_vec is None:
                    raise HTTPException(status_code=500, detail="Failed to generate QueryVector embedding. Check Azure OpenAI configuration and logs.")
                doc_dict["QueryVector"] = query_vec

        response = container_client.create_item(doc_dict)
        
        # Invalidate cache for this container since we added a new document
        cache_service.invalidate_container_cache(container)
        logger.info(f"Created document and invalidated cache for container: {container}")
        
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
        cosmos_client = get_cosmos_client()
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container)
        
        doc_dict = document.model_dump()
        doc_dict["id"] = doc_id

        # Regenerate embeddings if updating in official container
        if container in [OFFICIAL_DOCUMENTS_CONTAINER_NAME, NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME]:
            openai_client = AsyncAzureOpenAI(
                azure_endpoint=OPENAI_ENDPOINT,
                api_version=OPENAI_API_VERSION,
                api_key=os.getenv("AZURE_OPENAI_API_KEY")
            )
            if doc_dict.get("UserPrompt"):
                user_prompt_vec = await get_embedding(openai_client, doc_dict["UserPrompt"], "text-embedding-ada-002")
                if user_prompt_vec is None:
                    raise HTTPException(status_code=500, detail="Failed to generate UserPromptVector embedding. Check Azure OpenAI configuration and logs.")
                doc_dict["UserPromptVector"] = user_prompt_vec
            if doc_dict.get("Query"):
                query_vec = await get_embedding(openai_client, doc_dict["Query"], "text-embedding-ada-002")
                if query_vec is None:
                    raise HTTPException(status_code=500, detail="Failed to generate QueryVector embedding. Check Azure OpenAI configuration and logs.")
                doc_dict["QueryVector"] = query_vec

        response = container_client.upsert_item(doc_dict)
        
        # Invalidate cache for this container since we updated a document
        cache_service.invalidate_container_cache(container)
        logger.info(f"Updated document and invalidated cache for container: {container}")
        
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
        cosmos_client = get_cosmos_client()
        database = cosmos_client.get_database_client(DATABASE_NAME)
        container_client = database.get_container_client(container)
        
        # Delete from CosmosDB
        container_client.delete_item(item=doc_id, partition_key=doc_id)
        logger.info(f"Successfully deleted document {doc_id} from CosmosDB container {container}")
        
        # Also delete from Azure Search index if this is the NBA Official container
        if container == NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME:
            if azure_search_service.is_configured():
                search_deletion_success = await azure_search_service.delete_document(doc_id)
                if search_deletion_success:
                    logger.info(f"Successfully deleted document {doc_id} from Azure Search index")
                else:
                    logger.warning(f"Failed to delete document {doc_id} from Azure Search index, but CosmosDB deletion succeeded")
            else:
                logger.warning("Azure Search not configured, skipping search index deletion")
        
        # Invalidate cache for this container since we deleted a document
        cache_service.invalidate_container_cache(container)
        logger.info(f"Deleted document and invalidated cache for container: {container}")
        
        return {"status": "success", "message": "Document deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting document {doc_id} from container {container}: {str(e)}")
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
            
            # Generate embeddings using text-embedding-ada-002 model
            if doc.get("UserPrompt"):
                logger.info("Generating embedding for UserPrompt")
                doc["UserPromptVector"] = await get_embedding(openai_client, doc["UserPrompt"], "text-embedding-ada-002")
            if doc.get("Query"):
                logger.info("Generating embedding for Query")  
                doc["QueryVector"] = await get_embedding(openai_client, doc["Query"], "text-embedding-ada-002")
            
            logger.info("Embeddings generated successfully")
        
        # Create in target container
        response = target_container_client.create_item(doc)
        
        # Delete from source container
        source_container_client.delete_item(item=doc_id, partition_key=doc_id)
        
        # Invalidate caches for both containers
        cache_service.invalidate_container_cache(source_container)
        cache_service.invalidate_container_cache(target_container)
        
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

# Cache Management Endpoints

@app.post("/api/feedback/cache/warm/{container}")
async def warm_cache(
    container: str,
    limit: int = Query(1000, description="Maximum number of documents to cache (default: 1000, max: 2000)")
):
    """Warm cache for a specific container with memory-safe limits."""
    validate_container_name(container)
    
    # Enforce maximum limit to prevent memory issues
    if limit > 2000:
        limit = 2000
        logger.warning(f"Cache warming limit reduced to 2000 to prevent memory issues")
    
    try:
        logger.info(f"Warming cache for container: {container} (limit: {limit})")
        start_time = time.time()
        
        # Fetch limited documents to warm the cache
        container_client = get_container_client(container)
        query = "SELECT * FROM c ORDER BY c._ts DESC OFFSET 0 LIMIT @limit"
        parameters = [{"name": "@limit", "value": limit}]
        
        items = list(container_client.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        # Warm the cache with limited documents and paginated results
        cache_service.warm_cache_for_container(container, items)
        
        end_time = time.time()
        logger.info(f"Cache warming completed for {container} in {end_time - start_time:.2f} seconds")
        
        return {
            "status": "success",
            "message": f"Cache warmed for {container} (limited to {limit} documents)",
            "document_count": len(items),
            "limit_applied": limit,
            "duration_seconds": round(end_time - start_time, 2)
        }
    except Exception as e:
        logger.error(f"Error warming cache for {container}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/feedback/cache/stats")
async def get_cache_stats():
    """Get cache statistics."""
    try:
        stats = cache_service.get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/feedback/cache/{container}")
async def invalidate_cache(container: str):
    """Invalidate cache for a specific container."""
    validate_container_name(container)
    try:
        cache_service.invalidate_container_cache(container)
        return {"status": "success", "message": f"Cache invalidated for {container}"}
    except Exception as e:
        logger.error(f"Error invalidating cache for {container}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Health and monitoring endpoints

@app.get("/api/health")
async def health_check():
    """Health check endpoint with basic memory monitoring."""
    import psutil
    import os
    
    try:
        # Get current process info
        process = psutil.Process(os.getpid())
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024  # Convert to MB
        
        # Check if we're approaching memory limits (warn at 400MB, critical at 480MB)
        memory_status = "healthy"
        if memory_mb > 480:
            memory_status = "critical"
        elif memory_mb > 400:
            memory_status = "warning"
        
        return {
            "status": "healthy",
            "memory": {
                "used_mb": round(memory_mb, 2),
                "status": memory_status,
                "limit_mb": 512
            },
            "cache": {
                "enabled": cache_service.cache_enabled,
                "stats": cache_service.get_cache_stats() if cache_service.cache_enabled else None
            },
            "databases": {
                "available": postgres_service.get_available_databases(),
                "engines_initialized": len(postgres_service.engines)
            }
        }
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return {
            "status": "error",
            "error": str(e)
        } 