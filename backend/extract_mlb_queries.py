#!/usr/bin/env python3
"""Extract MLB Queries from Cosmos DB"""

import os
import sys
import json
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

try:
    from azure.cosmos import CosmosClient
    from azure.identity import DefaultAzureCredential
    from app.config import COSMOSDB_ENDPOINT, DATABASE_NAME
except ImportError as e:
    print(f"Error importing: {e}")
    sys.exit(1)

def get_cosmos_client():
    cosmos_connection_string = os.getenv("COSMOS_CONNECTION_STRING")
    cosmos_key = os.getenv("COSMOS_DB_KEY") or os.getenv("COSMOS_KEY") or os.getenv("AZURE_COSMOS_KEY")
    cosmos_endpoint = os.getenv("COSMOS_DB_ENDPOINT") or COSMOSDB_ENDPOINT
    
    if cosmos_connection_string:
        return CosmosClient.from_connection_string(cosmos_connection_string)
    elif cosmos_key:
        return CosmosClient(cosmos_endpoint, credential=cosmos_key)
    else:
        return CosmosClient(cosmos_endpoint, credential=DefaultAzureCredential())

def extract_queries(container_name="mlb", output_file=None):
    if output_file is None:
        output_file = f"mlb_queries_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    print(f"Extracting from container: {container_name}")
    
    cosmos_client = get_cosmos_client()
    database = cosmos_client.get_database_client(DATABASE_NAME)
    container = database.get_container_client(container_name)
    
    items = list(container.query_items("SELECT * FROM c", enable_cross_partition_query=True))
    print(f"Found {len(items)} documents")
    
    output_data = {
        "extracted_at": datetime.now().isoformat(),
        "container": container_name,
        "total_documents": len(items),
        "documents": items
    }
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, default=str)
    
    print(f"Saved to {output_file}")
    
    if items:
        print("\nSample document:")
        sample = items[0]
        for key in ["id", "UserPrompt", "Query"]:
            if key in sample:
                value = str(sample[key])[:200]
                print(f"  {key}: {value}...")
    
    return items

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="mlb")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    extract_queries(args.container, args.output)
