#!/usr/bin/env python3
"""MLB Query Migration Script - Interactive migration with schema transformation"""

import os
import sys
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from uuid import uuid4
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

try:
    from azure.cosmos import CosmosClient
    from azure.identity import DefaultAzureCredential
    from openai import AsyncAzureOpenAI
    from app.config import COSMOSDB_ENDPOINT, DATABASE_NAME, OPENAI_ENDPOINT, OPENAI_API_VERSION
    from schema_mapping import transform_query_auto, validate_transformed_query, MLBFINAL_TABLES
except ImportError as e:
    print(f"Error importing: {e}")
    sys.exit(1)

class QueryMigrator:
    def __init__(self):
        self.cosmos_client = None
        self.source_container = None
        self.target_container = None
        self.openai_client = None
        self.progress_file = "migration_progress.json"
        self.migrated_ids = set()
        
    def initialize(self):
        print("Initializing connections...")
        
        cosmos_connection_string = os.getenv("COSMOS_CONNECTION_STRING")
        cosmos_key = os.getenv("COSMOS_DB_KEY") or os.getenv("COSMOS_KEY") or os.getenv("AZURE_COSMOS_KEY")
        cosmos_endpoint = os.getenv("COSMOS_DB_ENDPOINT") or COSMOSDB_ENDPOINT
        
        if cosmos_connection_string:
            self.cosmos_client = CosmosClient.from_connection_string(cosmos_connection_string)
        elif cosmos_key:
            self.cosmos_client = CosmosClient(cosmos_endpoint, credential=cosmos_key)
        else:
            self.cosmos_client = CosmosClient(cosmos_endpoint, credential=DefaultAzureCredential())
        
        database = self.cosmos_client.get_database_client(DATABASE_NAME)
        self.source_container = database.get_container_client("mlb")
        self.target_container = database.get_container_client("mlb-official")
        print("Connected to Cosmos DB")
        
        api_key = os.getenv("AZURE_OPENAI_API_KEY")
        if api_key:
            self.openai_client = AsyncAzureOpenAI(
                azure_endpoint=OPENAI_ENDPOINT,
                api_version=OPENAI_API_VERSION,
                api_key=api_key
            )
            print("Connected to Azure OpenAI")
        else:
            print("Warning: No OpenAI key - vectorization disabled")
        
        self._load_progress()
        
    def _load_progress(self):
        if os.path.exists(self.progress_file):
            with open(self.progress_file, 'r') as f:
                self.migrated_ids = set(json.load(f).get("migrated_ids", []))
            print(f"Loaded progress: {len(self.migrated_ids)} already migrated")
    
    def _save_progress(self):
        with open(self.progress_file, 'w') as f:
            json.dump({"migrated_ids": list(self.migrated_ids), "last_updated": datetime.now().isoformat()}, f)
    
    async def get_embedding(self, text: str) -> Optional[List[float]]:
        if not self.openai_client:
            return None
        try:
            response = await self.openai_client.embeddings.create(model="text-embedding-ada-002", input=text)
            return response.data[0].embedding
        except Exception as e:
            print(f"Embedding error: {e}")
            return None
    
    def fetch_source_documents(self) -> List[Dict]:
        print("Fetching documents from 'mlb' container...")
        items = list(self.source_container.query_items("SELECT * FROM c", enable_cross_partition_query=True))
        pending = [item for item in items if item.get("id") not in self.migrated_ids]
        print(f"Found {len(items)} total, {len(pending)} pending migration")
        return pending
    
    def transform_document(self, doc: Dict) -> Tuple[Dict, List[str]]:
        warnings = []
        transformed = doc.copy()
        
        if "Query" in doc and doc["Query"]:
            transformed_query, query_warnings = transform_query_auto(doc["Query"])
            transformed["Query"] = transformed_query
            warnings.extend(query_warnings)
            
            errors = validate_transformed_query(transformed_query, MLBFINAL_TABLES)
            warnings.extend([f"VALIDATION: {e}" for e in errors])
        
        transformed["id"] = str(uuid4())
        transformed["original_id"] = doc.get("id")
        transformed["migrated_at"] = datetime.now().isoformat()
        transformed.pop("UserPromptVector", None)
        transformed.pop("QueryVector", None)
        
        return transformed, warnings
    
    async def vectorize_document(self, doc: Dict) -> Dict:
        if not self.openai_client:
            return doc
        vectorized = doc.copy()
        if doc.get("UserPrompt"):
            print("  Generating UserPrompt embedding...")
            embedding = await self.get_embedding(doc["UserPrompt"])
            if embedding:
                vectorized["UserPromptVector"] = embedding
        if doc.get("Query"):
            print("  Generating Query embedding...")
            embedding = await self.get_embedding(doc["Query"])
            if embedding:
                vectorized["QueryVector"] = embedding
        return vectorized
    
    def upload_document(self, doc: Dict) -> bool:
        try:
            self.target_container.create_item(doc)
            return True
        except Exception as e:
            print(f"Upload error: {e}")
            return False
    
    def display_document(self, doc: Dict, transformed: Dict, warnings: List[str]):
        print("\n" + "=" * 70)
        print(f"ID: {doc.get('id')}")
        if doc.get("UserPrompt"):
            print(f"\nPrompt: {doc['UserPrompt'][:300]}...")
        print(f"\nOriginal Query:\n  {doc.get('Query', 'N/A')}")
        print(f"\nTransformed Query:\n  {transformed.get('Query', 'N/A')}")
        if warnings:
            print("\nWarnings:")
            for w in warnings:
                print(f"  - {w}")
    
    async def migrate_interactive(self, limit: Optional[int] = None):
        documents = self.fetch_source_documents()
        if limit:
            documents = documents[:limit]
        
        print(f"\nInteractive migration: {len(documents)} documents")
        migrated_count = 0
        skipped_count = 0
        
        for i, doc in enumerate(documents, 1):
            print(f"\n[{i}/{len(documents)}]")
            transformed, warnings = self.transform_document(doc)
            self.display_document(doc, transformed, warnings)
            
            while True:
                response = input("\n[m]igrate, [e]dit, [s]kip, [q]uit, [a]uto-all: ").lower().strip()
                
                if response == 'm':
                    print("  Vectorizing...")
                    vectorized = await self.vectorize_document(transformed)
                    print("  Uploading...")
                    if self.upload_document(vectorized):
                        print("  Success!")
                        self.migrated_ids.add(doc.get("id"))
                        self._save_progress()
                        migrated_count += 1
                    break
                elif response == 'e':
                    new_query = input("Enter corrected query: ").strip()
                    if new_query:
                        transformed["Query"] = new_query
                        print(f"Updated: {new_query}")
                    continue
                elif response == 's':
                    skipped_count += 1
                    break
                elif response == 'q':
                    print(f"\nSummary: {migrated_count} migrated, {skipped_count} skipped")
                    return
                elif response == 'a':
                    print("\nAuto-migrating remaining...")
                    for j, d in enumerate(documents[i-1:], 1):
                        print(f"  [{j}/{len(documents)-i+1}] {d.get('id')[:8]}...")
                        t, _ = self.transform_document(d)
                        v = await self.vectorize_document(t)
                        if self.upload_document(v):
                            self.migrated_ids.add(d.get("id"))
                            self._save_progress()
                            migrated_count += 1
                    print(f"\nSummary: {migrated_count} migrated, {skipped_count} skipped")
                    return
        
        print(f"\nSummary: {migrated_count} migrated, {skipped_count} skipped")

async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--auto", action="store_true")
    args = parser.parse_args()
    
    migrator = QueryMigrator()
    migrator.initialize()
    
    if args.auto:
        documents = migrator.fetch_source_documents()
        if args.limit:
            documents = documents[:args.limit]
        for i, doc in enumerate(documents, 1):
            print(f"[{i}/{len(documents)}] {doc.get('id')[:8]}...")
            transformed, _ = migrator.transform_document(doc)
            vectorized = await migrator.vectorize_document(transformed)
            if migrator.upload_document(vectorized):
                migrator.migrated_ids.add(doc.get("id"))
                migrator._save_progress()
    else:
        await migrator.migrate_interactive(limit=args.limit)

if __name__ == "__main__":
    asyncio.run(main())
