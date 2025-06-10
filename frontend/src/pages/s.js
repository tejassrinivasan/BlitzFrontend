// # Add these models
// class MLBDocument(BaseModel):
//     id: Optional[str] = None
//     UserPrompt: str = ""
//     Query: str = ""
//     AssistantPrompt: str = ""
//     UserPromptVector: Optional[List[float]] = None
//     QueryVector: Optional[List[float]] = None
//     AssistantPromptVector: Optional[List[float]] = None

//     class Config:
//         allow_population_by_partial_obj = True

// @app.get("/api/mlb-official-feedback-documents")
// async def get_mlb_documents(
//     current_user: dict = Depends(get_current_user),
//     page: int = 1,
//     limit: int = 20
// ):
//     try:
//         print("Starting MLB documents fetch...")
//         start_time = time.time()

//         # Try to get from cache first
//         cache_key = f"mlb_documents:page_{page}"
//         if redis_client:
//             cached_data = redis_client.get(cache_key)
//             if cached_data:
//                 print("Retrieved documents from cache")
//                 return json.loads(cached_data)

//         # If not in cache, get from CosmosDB
//         credential = DefaultAzureCredential()
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb")
        
//         # Query documents with pagination and sorting
//         query = """
//             SELECT * FROM c 
//             ORDER BY c._ts DESC 
//             OFFSET @offset LIMIT @limit
//         """
//         parameters = [
//             {"name": "@offset", "value": (page - 1) * limit},
//             {"name": "@limit", "value": limit}
//         ]
        
//         items = list(container.query_items(
//             query=query,
//             parameters=parameters,
//             enable_cross_partition_query=True
//         ))
        
//         # Cache the results for 5 minutes
//         if redis_client:
//             redis_client.setex(
//                 cache_key,
//                 300,  # 5 minutes
//                 json.dumps(items)
//             )
        
//         end_time = time.time()
//         print(f"MLB documents fetch completed in {end_time - start_time:.2f} seconds")
//         print(f"Retrieved {len(items)} documents")
        
//         return items

//     except Exception as e:
//         print(f"Error fetching MLB documents: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.put("/api/mlb-official-feedback-documents/{doc_id}")
// async def update_mlb_document(
//     doc_id: str,
//     document: MLBDocument,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         # Get Azure credential
//         credential = DefaultAzureCredential()
        
//         # Initialize CosmosDB client
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb")
        
//         # Initialize OpenAI client for embeddings
//         openai_client = AsyncAzureOpenAI(
//             azure_endpoint=OPENAI_ENDPOINT,
//             api_version=OPENAI_API_VERSION,
//             api_key=os.getenv("AZURE_OPENAI_API_KEY")
//         )
        
//         # Generate new embeddings if text fields changed
//         doc_dict = document.dict()
        
//         # Check if we need to update UserPromptVector
//         if document.UserPrompt:
//             doc_dict["UserPromptVector"] = await get_embedding(openai_client, document.UserPrompt, "text-embedding-ada-002")
            
//         # Check if we need to update QueryVector
//         if document.Query:
//             doc_dict["QueryVector"] = await get_embedding(openai_client, document.Query, "text-embedding-ada-002")
            
//         # Check if we need to update AssistantPromptVector
//         if document.AssistantPrompt:
//             doc_dict["AssistantPromptVector"] = await get_embedding(openai_client, document.AssistantPrompt, "text-embedding-ada-002")
        
//         # Update the document
//         response = container.upsert_item(doc_dict)
        
//         # Invalidate cache after updating
//         invalidate_document_cache()
        
//         return response
//     except HTTPException as e:
//         raise e
//     except Exception as e:
//         print(f"Error updating MLB document: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.post("/api/helpful")
// async def toggle_helpful_doc(data: dict, current_user: dict = Depends(get_current_user)):
//     """
//     Toggle a doc in CosmosDB. 
//     If data['helpful'] is True, create (or check for) the doc. 
//     If False, delete by doc_id.
//     """
//     try:
//         print(f"Starting toggle_helpful_doc with data: {data}")
//         print(f"Current user: {current_user}")
        
//         # Use API key for CosmosDB authentication
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=os.getenv("AZURE_COSMOS_API_KEY"))
//         print(f"Created CosmosClient with endpoint: {COSMOSDB_ENDPOINT}")
        
//         db = cosmos_client.get_database_client(DATABASE_NAME)
//         print(f"Got database client for: {DATABASE_NAME}")
        
//         container = db.get_container_client(CONTAINER_NAME)
//         print(f"Got container client for: {CONTAINER_NAME}")

//         openai_client = AsyncAzureOpenAI(
//             azure_endpoint=OPENAI_ENDPOINT,
//             api_version=OPENAI_API_VERSION,
//             api_key=os.getenv("AZURE_OPENAI_API_KEY")
//         )
//         print("Created OpenAI client")
        
//         helpful = data.get("helpful", False)
//         doc_id = data.get("doc_id")
//         print(f"Helpful: {helpful}, Doc ID: {doc_id}")
        
//         if helpful:
//             user_prompt = data.get("userPrompt", "")
//             sql_query = data.get("sqlQuery", "")
//             print(f"User prompt: {user_prompt}")
//             print(f"SQL query: {sql_query}")

//             # First, check if doc_id exists and try to delete it to avoid duplicates
//             if doc_id:
//                 try:
//                     print(f"Attempting to delete existing document with ID: {doc_id}")
//                     container.delete_item(item=doc_id, partition_key=doc_id)
//                     print("Successfully deleted existing document")
//                 except Exception as e:
//                     print(f"Error deleting existing document: {e}")

//             # Create new document
//             query_str = f"SELECT * FROM c WHERE c.UserPrompt = @prompt"
//             print(f"Checking for existing documents with query: {query_str}")
//             existing_docs = list(container.query_items(
//                 query=query_str, 
//                 parameters=[{"name":"@prompt","value": user_prompt}],
//                 enable_cross_partition_query=True
//             ))
//             print(f"Found {len(existing_docs)} existing documents")

//             if existing_docs:
//                 print("Document already exists, returning existing doc")
//                 return {
//                     "status": "exists", 
//                     "doc_id": existing_docs[0]["id"],
//                     "message": "Document with the same userPrompt already exists."
//                 }

//             # Generate embeddings for new document
//             print("Generating embeddings for new document")
//             user_prompt_vector = await get_embedding(openai_client, user_prompt, "text-embedding-ada-002")
//             query_vector = await get_embedding(openai_client, sql_query, "text-embedding-ada-002") if sql_query else []
//             print("Generated embeddings successfully")
            
//             new_doc_id = str(uuid4())
//             doc = {
//                 "id": new_doc_id,
//                 "UserPrompt": user_prompt,
//                 "Query": sql_query,
//                 "AssistantPrompt": "",
//                 "UserPromptVector": user_prompt_vector,
//                 "QueryVector": query_vector,
//                 "AssistantPromptVector": [],
//             }
//             print(f"Creating new document with ID: {new_doc_id}")
//             container.create_item(doc)
//             print("Successfully created new document")
//             return {"status": "created", "doc_id": new_doc_id}
        
//         else:
//             # Unclick helpful => remove doc by doc_id
//             if not doc_id:
//                 print("No doc_id provided for deletion")
//                 raise HTTPException(status_code=400, detail="No doc_id provided for deletion")

//             try:
//                 print(f"Attempting to delete document with ID: {doc_id}")
//                 container.delete_item(item=doc_id, partition_key=doc_id)
//                 print("Successfully deleted document")
//                 return {"status": "deleted", "doc_id": doc_id}
//             except Exception as e:
//                 print(f"Error deleting document: {e}")
//                 raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")
            
//     except HTTPException:
//         raise
//     except Exception as e:
//         print(f"Error in toggle_helpful_doc: {e}")
//         print(f"Error type: {type(e)}")
//         print(f"Error details: {str(e)}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.post("/api/unhelpful")
// async def toggle_unhelpful_doc(data: dict, current_user: dict = Depends(get_current_user)):
//     """
//     Toggle a doc in the unhelpful CosmosDB container.
//     If data['unhelpful'] is True, create (or check for) the doc.
//     If False, delete by doc_id.
//     """
//     try:
//         print(f"Starting toggle_unhelpful_doc with data: {data}")
//         print(f"Current user: {current_user}")

//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=os.getenv("AZURE_COSMOS_API_KEY"))
//         print(f"Created CosmosClient with endpoint: {COSMOSDB_ENDPOINT}")

//         db = cosmos_client.get_database_client(DATABASE_NAME)
//         print(f"Got database client for: {DATABASE_NAME}")

//         container = db.get_container_client(UNHELPFUL_CONTAINER_NAME)
//         print(f"Got container client for: {UNHELPFUL_CONTAINER_NAME}")

//         openai_client = AsyncAzureOpenAI(
//             azure_endpoint=OPENAI_ENDPOINT,
//             api_version=OPENAI_API_VERSION,
//             api_key=os.getenv("AZURE_OPENAI_API_KEY")
//         )
//         print("Created OpenAI client")

//         unhelpful = data.get("unhelpful", False)
//         doc_id = data.get("doc_id")
//         print(f"Unhelpful: {unhelpful}, Doc ID: {doc_id}")

//         if unhelpful:
//             user_prompt = data.get("userPrompt", "")
//             sql_query = data.get("sqlQuery", "")
//             print(f"User prompt: {user_prompt}")
//             print(f"SQL query: {sql_query}")

//             if doc_id:
//                 try:
//                     print(f"Attempting to delete existing document with ID: {doc_id}")
//                     container.delete_item(item=doc_id, partition_key=doc_id)
//                     print("Successfully deleted existing document")
//                 except Exception as e:
//                     print(f"Error deleting existing document: {e}")

//             query_str = f"SELECT * FROM c WHERE c.UserPrompt = @prompt"
//             print(f"Checking for existing documents with query: {query_str}")
//             existing_docs = list(container.query_items(
//                 query=query_str,
//                 parameters=[{"name": "@prompt", "value": user_prompt}],
//                 enable_cross_partition_query=True,
//             ))
//             print(f"Found {len(existing_docs)} existing documents")

//             if existing_docs:
//                 print("Document already exists, returning existing doc")
//                 return {
//                     "status": "exists",
//                     "doc_id": existing_docs[0]["id"],
//                     "message": "Document with the same userPrompt already exists.",
//                 }

//             print("Generating embeddings for new document")
//             user_prompt_vector = await get_embedding(openai_client, user_prompt, "text-embedding-ada-002")
//             query_vector = await get_embedding(openai_client, sql_query, "text-embedding-ada-002") if sql_query else []
//             print("Generated embeddings successfully")

//             new_doc_id = str(uuid4())
//             doc = {
//                 "id": new_doc_id,
//                 "UserPrompt": user_prompt,
//                 "Query": sql_query,
//                 "AssistantPrompt": "",
//                 "UserPromptVector": user_prompt_vector,
//                 "QueryVector": query_vector,
//                 "AssistantPromptVector": [],
//             }
//             print(f"Creating new document with ID: {new_doc_id}")
//             container.create_item(doc)
//             print("Successfully created new document")
//             return {"status": "created", "doc_id": new_doc_id}

//         else:
//             if not doc_id:
//                 print("No doc_id provided for deletion")
//                 raise HTTPException(status_code=400, detail="No doc_id provided for deletion")

//             try:
//                 print(f"Attempting to delete document with ID: {doc_id}")
//                 container.delete_item(item=doc_id, partition_key=doc_id)
//                 print("Successfully deleted document")
//                 return {"status": "deleted", "doc_id": doc_id}
//             except Exception as e:
//                 print(f"Error deleting document: {e}")
//                 raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

//     except HTTPException:
//         raise
//     except Exception as e:
//         print(f"Error in toggle_unhelpful_doc: {e}")
//         print(f"Error type: {type(e)}")
//         print(f"Error details: {str(e)}")
//         raise HTTPException(status_code=500, detail=str(e))

// # Add a new endpoint to update message feedback
// class FeedbackUpdate(BaseModel):
//     feedback: bool

// @app.put("/api/messages/{message_id}/feedback")
// async def update_message_feedback(
//     message_id: int,
//     feedback_data: FeedbackUpdate,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         async with app.state.user_pool.acquire() as conn:
//             # First verify the message exists and belongs to a conversation owned by the user
//             message = await conn.fetchrow("""
//                 SELECT m.id 
//                 FROM messages m
//                 JOIN conversations c ON m.conversation_id = c.id
//                 WHERE m.id = $1 
//                 AND c.user_id = $2
//             """, message_id, current_user["id"])
            
//             if not message:
//                 raise HTTPException(status_code=404, detail="Message not found")

//             # Then update the feedback - cast the boolean to text
//             await conn.execute("""
//                 UPDATE messages 
//                 SET feedback = $1::boolean
//                 WHERE id = $2
//             """, feedback_data.feedback, message_id)
            
//             print(f"Updated feedback for message {message_id} to {feedback_data.feedback}")
//             return {"status": "success"}
            
//     except Exception as e:
//         print(f"Error updating message feedback: {e}")
//         raise HTTPException(
//             status_code=500,
//             detail="Error updating message feedback"
//         )

// # Add this new POST endpoint
// @app.post("/api/mlb-official-feedback-documents")
// async def create_mlb_document(
//     document: MLBDocument,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         # Get Azure credential
//         credential = DefaultAzureCredential()
        
//         # Initialize CosmosDB client
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb")
        
//         # For new empty documents, skip embedding generation
//         doc_dict = document.dict(exclude_unset=True)
//         doc_dict["id"] = str(uuid4())
        
//         # Initialize empty vectors - we'll generate them only when content is added
//         doc_dict["UserPromptVector"] = []
//         doc_dict["QueryVector"] = []
//         doc_dict["AssistantPromptVector"] = []
        
//         # Create the document in CosmosDB
//         response = container.create_item(doc_dict)
        
//         # Invalidate cache after creating
//         invalidate_document_cache()
        
//         return response
//     except Exception as e:
//         print(f"Error creating MLB document: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.delete("/api/mlb-official-feedback-documents/{doc_id}")
// async def delete_mlb_document(
//     doc_id: str,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         # Get Azure credential
//         credential = DefaultAzureCredential()
        
//         # Initialize CosmosDB client
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb")
        
//         # Delete the document
//         container.delete_item(item=doc_id, partition_key=doc_id)
        
//         # Invalidate cache after deleting
//         invalidate_document_cache()
        
//         return {"status": "success", "message": "Document deleted successfully"}
//     except Exception as e:
//         print(f"Error deleting MLB document: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// def invalidate_document_cache():
//     """Helper function to invalidate the document cache"""
//     if redis_client:
//         # Get all keys matching the pattern
//         keys = redis_client.keys("mlb_documents:page_*")
//         if keys:
//             redis_client.delete(*keys)
//             print("Document cache invalidated")

// @app.get("/api/mlb-official-feedback-documents/search")
// async def search_mlb_documents(
//     q: str,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         print(f"Searching documents with query: {q}")
        
//         # Get Azure credential
//         credential = DefaultAzureCredential()
        
//         # Initialize CosmosDB client
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb")
        
//         # Query documents that contain the search term (case-insensitive)
//         query = """
//             SELECT * FROM c 
//             WHERE CONTAINS(LOWER(c.UserPrompt), LOWER(@search_term))
//             ORDER BY c._ts DESC
//         """
//         parameters = [
//             {"name": "@search_term", "value": q.lower()}
//         ]
        
//         items = list(container.query_items(
//             query=query,
//             parameters=parameters,
//             enable_cross_partition_query=True
//         ))
        
//         print(f"Found {len(items)} matching documents")
//         return items
//     except Exception as e:
//         print(f"Error searching MLB documents: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// # Add this new endpoint
// @app.get("/api/mentions/search")
// async def search_mentions(
//     query: str = Query(None),
//     type: Optional[str] = Query(None),
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         if not query or len(query.strip()) < 2:
//             return []
            
//         cleaned_query = query.strip().lower()
//         print(f"\n=== Processing mention search for: {cleaned_query} ===")
//         results = []
//         max_results = 5
        
//         # Use cached data for faster searching
//         if redis_client:
//             print("Redis client available, checking cache...")
            
//             # Search players if no type specified or type is 'player'
//             if not type or type == "player":
//                 print("Checking player cache...")
//                 cached_players = redis_client.get('cached_players')
//                 if cached_players:
//                     try:
//                         players = json.loads(cached_players)
//                         print(f"Found {len(players)} players in cache")
//                         if isinstance(players, list):
//                             matching_players = [
//                                 p for p in players 
//                                 if cleaned_query in p['name'].lower()
//                             ][:max_results]
//                             print(f"Found {len(matching_players)} matching players")
//                             results.extend(matching_players)
//                     except json.JSONDecodeError:
//                         print("Error decoding cached players")
//                 else:
//                     print("No players found in cache")
                    
//             # Search teams if no type specified or type is 'team'
//             if not type or type == "team":
//                 print("Checking team cache...")
//                 cached_teams = redis_client.get('cached_teams')
//                 if cached_teams:
//                     try:
//                         teams = json.loads(cached_teams)
//                         print(f"Found {len(teams)} teams in cache")
//                         if isinstance(teams, list):
//                             matching_teams = [
//                                 t for t in teams 
//                                 if cleaned_query in t['name'].lower() or 
//                                    cleaned_query in t['abbreviation'].lower()
//                             ][:max_results]
//                             print(f"Found {len(matching_teams)} matching teams")
//                             results.extend(matching_teams)
//                     except json.JSONDecodeError:
//                         print("Error decoding cached teams")
//                 else:
//                     print("No teams found in cache")

//             # Search sportsbooks if no type specified or type is 'sportsbook'
//             if not type or type == "sportsbook":
//                 print("Checking sportsbook cache...")
//                 cached_sportsbooks = redis_client.get('cached_sportsbooks')
//                 if cached_sportsbooks:
//                     try:
//                         sportsbooks = json.loads(cached_sportsbooks)
//                         print(f"Found {len(sportsbooks)} sportsbooks in cache")
//                         if isinstance(sportsbooks, list):
//                             matching_sportsbooks = [
//                                 s for s in sportsbooks 
//                                 if cleaned_query in s['name'].lower()
//                             ][:max_results]
//                             print(f"Found {len(matching_sportsbooks)} matching sportsbooks")
//                             results.extend(matching_sportsbooks)
//                     except json.JSONDecodeError:
//                         print("Error decoding cached sportsbooks")
//                 else:
//                     print("No sportsbooks found in cache")
            
//             print(f"Total results found: {len(results)}")
//             print("=== Mention search complete ===\n")
//             return results[:max_results] if results else []
            
//         else:
//             print("Redis client not available, skipping cache")
//             return []
        
//     except Exception as e:
//         print(f"Error in mention search: {str(e)}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.get("/api/mlb-unofficial-feedback-documents")
// async def get_unofficial_mlb_documents(
//     current_user: dict = Depends(get_current_user),
//     page: int = 1,
//     limit: int = 20
// ):
//     try:
//         print("Starting unofficial MLB documents fetch...")
//         start_time = time.time()

//         # Try to get from cache first
//         cache_key = f"mlb_unofficial_documents:page_{page}"
//         if redis_client:
//             cached_data = redis_client.get(cache_key)
//             if cached_data:
//                 print("Retrieved unofficial documents from cache")
//                 return json.loads(cached_data)

//         # If not in cache, get from CosmosDB
//         credential = DefaultAzureCredential()
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb-user-feedback")
        
//         # Query documents with pagination and sorting
//         query = """
//             SELECT * FROM c 
//             ORDER BY c._ts DESC 
//             OFFSET @offset LIMIT @limit
//         """
//         parameters = [
//             {"name": "@offset", "value": (page - 1) * limit},
//             {"name": "@limit", "value": limit}
//         ]
        
//         items = list(container.query_items(
//             query=query,
//             parameters=parameters,
//             enable_cross_partition_query=True
//         ))
        
//         # Cache the results for 5 minutes
//         if redis_client:
//             redis_client.setex(
//                 cache_key,
//                 300,  # 5 minutes
//                 json.dumps(items)
//             )
        
//         end_time = time.time()
//         print(f"Unofficial MLB documents fetch completed in {end_time - start_time:.2f} seconds")
//         print(f"Retrieved {len(items)} documents")
        
//         return items

//     except Exception as e:
//         print(f"Error fetching unofficial MLB documents: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.post("/api/mlb-unofficial-feedback-documents/{doc_id}/transfer")
// async def transfer_unofficial_document(
//     doc_id: str,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         # Get Azure credential
//         credential = DefaultAzureCredential()
        
//         # Initialize CosmosDB client
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         unofficial_container = database.get_container_client("mlb-user-feedback")
//         official_container = database.get_container_client("mlb")
        
//         # Get the document from unofficial container
//         doc = unofficial_container.read_item(item=doc_id, partition_key=doc_id)
        
//         # Generate new ID for the official document
//         doc["id"] = str(uuid4())
        
//         # Initialize OpenAI client for embeddings
//         openai_client = AsyncAzureOpenAI(
//             azure_endpoint=OPENAI_ENDPOINT,
//             api_version=OPENAI_API_VERSION,
//             api_key=os.getenv("AZURE_OPENAI_API_KEY")
//         )
        
//         # Generate embeddings for the document
//         if doc.get("UserPrompt"):
//             doc["UserPromptVector"] = await get_embedding(openai_client, doc["UserPrompt"], "text-embedding-ada-002")
//         if doc.get("Query"):
//             doc["QueryVector"] = await get_embedding(openai_client, doc["Query"], "text-embedding-ada-002")
//         if doc.get("AssistantPrompt"):
//             doc["AssistantPromptVector"] = await get_embedding(openai_client, doc["AssistantPrompt"], "text-embedding-ada-002")
        
//         # Create the document in the official container
//         official_container.create_item(doc)
        
//         # Delete the document from the unofficial container
//         unofficial_container.delete_item(item=doc_id, partition_key=doc_id)
        
//         # Invalidate both caches
//         if redis_client:
//             # Invalidate unofficial documents cache
//             unofficial_keys = redis_client.keys("mlb_unofficial_documents:page_*")
//             if unofficial_keys:
//                 redis_client.delete(*unofficial_keys)
            
//             # Invalidate official documents cache
//             official_keys = redis_client.keys("mlb_documents:page_*")
//             if official_keys:
//                 redis_client.delete(*official_keys)
        
//         return {"status": "success", "message": "Document transferred successfully"}
//     except HTTPException:
//         raise
//     except Exception as e:
//         print(f"Error transferring document: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.delete("/api/mlb-unofficial-feedback-documents/{doc_id}")
// async def delete_unofficial_document(
//     doc_id: str,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         credential = DefaultAzureCredential()
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb-user-feedback")
        
//         # Delete the document
//         container.delete_item(item=doc_id, partition_key=doc_id)
        
//         # Invalidate cache
//         if redis_client:
//             redis_client.delete("mlb_unofficial_documents:page_1")
        
//         return {"message": "Document deleted successfully"}
//     except Exception as e:
//         print(f"Error deleting unofficial document: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// @app.put("/api/mlb-unofficial-feedback-documents/{doc_id}")
// async def update_unofficial_document(
//     doc_id: str,
//     document: MLBDocument,
//     current_user: dict = Depends(get_current_user)
// ):
//     try:
//         # Get Azure credential
//         credential = DefaultAzureCredential()
        
//         # Initialize CosmosDB client
//         cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
//         database = cosmos_client.get_database_client("sports")
//         container = database.get_container_client("mlb-user-feedback")
        
//         # Update the document
//         doc_dict = document.dict()
//         doc_dict["id"] = doc_id  # Ensure we keep the same ID
//         response = container.upsert_item(doc_dict)
        
//         # Invalidate cache
//         if redis_client:
//             unofficial_keys = redis_client.keys("mlb_unofficial_documents:page_*")
//             if unofficial_keys:
//                 redis_client.delete(*unofficial_keys)
        
//         return response
//     except Exception as e:
//         print(f"Error updating unofficial document: {e}")
//         raise HTTPException(status_code=500, detail=str(e))

// class MessageUpdate(BaseModel):
//     content: str
