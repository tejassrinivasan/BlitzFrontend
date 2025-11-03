#!/usr/bin/env python3
"""
Azure Search Index Sync Script

This script compares documents between the NBA Official CosmosDB container and the 
blitz-nba-index Azure Search index. It identifies orphaned documents that exist in
the search index but not in CosmosDB, and allows you to selectively remove them.
"""

import os
import sys
import asyncio
from typing import Dict, List, Set
from dotenv import load_dotenv

# Add the current directory to Python path so we can import from app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

try:
    from azure.cosmos import CosmosClient
    from azure.identity import DefaultAzureCredential
    from azure.search.documents import SearchClient
    from azure.core.credentials import AzureKeyCredential
    from app.config import (
        COSMOSDB_ENDPOINT,
        DATABASE_NAME,
        NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME
    )
except ImportError as e:
    print(f"Error: Could not import required modules: {e}")
    print("Make sure you're running this from the backend directory and all dependencies are installed.")
    sys.exit(1)


class SearchIndexSyncer:
    """Syncs Azure Search index with CosmosDB container."""
    
    def __init__(self):
        """Initialize clients for CosmosDB and Azure Search."""
        self.cosmos_client = None
        self.search_client = None
        self.container_name = NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME
        
        # Initialize CosmosDB client
        try:
            credential = DefaultAzureCredential()
            self.cosmos_client = CosmosClient(COSMOSDB_ENDPOINT, credential=credential)
            self.database = self.cosmos_client.get_database_client(DATABASE_NAME)
            self.container = self.database.get_container_client(self.container_name)
            print(f"✓ Connected to CosmosDB container: {self.container_name}")
        except Exception as e:
            print(f"❌ Failed to connect to CosmosDB: {e}")
            sys.exit(1)
        
        # Initialize Azure Search client
        search_endpoint = os.getenv('AZURE_SEARCH_ENDPOINT')
        search_api_key = os.getenv('AZURE_SEARCH_API_KEY') or os.getenv('AZURE_SEARCH_KEY')
        search_index = 'blitz-nba-index'
        
        if not search_endpoint or not search_api_key:
            print("❌ Azure Search credentials not configured.")
            print("Required environment variables:")
            print("  - AZURE_SEARCH_ENDPOINT")
            print("  - AZURE_SEARCH_API_KEY (or AZURE_SEARCH_KEY)")
            sys.exit(1)
        
        try:
            self.search_client = SearchClient(
                endpoint=search_endpoint,
                index_name=search_index,
                credential=AzureKeyCredential(search_api_key)
            )
            print(f"✓ Connected to Azure Search index: {search_index}")
        except Exception as e:
            print(f"❌ Failed to connect to Azure Search: {e}")
            sys.exit(1)
    
    def get_cosmos_document_ids(self) -> Set[str]:
        """Get all document IDs from the CosmosDB container."""
        print(f"\n📄 Fetching documents from CosmosDB container: {self.container_name}")
        
        try:
            query = "SELECT c.id FROM c"
            items = list(self.container.query_items(
                query=query,
                enable_cross_partition_query=True
            ))
            
            doc_ids = {item['id'] for item in items}
            print(f"✓ Found {len(doc_ids)} documents in CosmosDB")
            return doc_ids
            
        except Exception as e:
            print(f"❌ Error fetching CosmosDB documents: {e}")
            return set()
    
    def get_search_documents(self) -> Dict[str, Dict]:
        """Get all documents from Azure Search index with their details."""
        print(f"\n🔍 Fetching documents from Azure Search index")
        
        try:
            documents = {}
            skip = 0
            batch_size = 1000
            
            while True:
                # Search for documents in batches to handle large indexes
                results = self.search_client.search(
                    "*", 
                    select="id", 
                    top=batch_size,
                    skip=skip
                )
                
                batch_count = 0
                for result in results:
                    doc_id = result.get('id')
                    if doc_id:
                        documents[doc_id] = result
                        batch_count += 1
                
                # If we got fewer results than batch_size, we're done
                if batch_count < batch_size:
                    break
                    
                skip += batch_size
                print(f"  ... fetched {len(documents)} documents so far")
            
            print(f"✓ Found {len(documents)} documents in Azure Search (checked all)")
            return documents
            
        except Exception as e:
            print(f"❌ Error fetching search documents: {e}")
            return {}
    
    def get_search_document_details(self, doc_id: str) -> Dict:
        """Get full details of a specific document from Azure Search."""
        try:
            return self.search_client.get_document(key=doc_id)
        except Exception as e:
            print(f"⚠ Could not get details for document {doc_id}: {e}")
            return {"id": doc_id, "error": str(e)}
    
    async def delete_search_document(self, doc_id: str) -> bool:
        """Delete a document from Azure Search index."""
        try:
            documents_to_delete = [{"id": doc_id}]
            result = self.search_client.delete_documents(documents=documents_to_delete)
            
            for item in result:
                if item.succeeded:
                    return True
                else:
                    error_msg = getattr(item, 'error_message', 'Unknown error')
                    print(f"❌ Failed to delete {doc_id}: {error_msg}")
                    return False
            
            return False
        except Exception as e:
            print(f"❌ Error deleting document {doc_id}: {e}")
            return False
    
    def find_orphaned_documents(self) -> List[str]:
        """Find documents that exist in search index but not in CosmosDB."""
        print("\n" + "=" * 60)
        print("ANALYZING DOCUMENT DIFFERENCES")
        print("=" * 60)
        
        cosmos_ids = self.get_cosmos_document_ids()
        search_documents = self.get_search_documents()
        
        if not cosmos_ids and not search_documents:
            print("⚠ No documents found in either system")
            return []
        
        search_ids = set(search_documents.keys())
        
        # Find orphaned documents (in search but not in cosmos)
        orphaned_ids = search_ids - cosmos_ids
        
        print(f"\n📊 COMPARISON RESULTS:")
        print(f"  CosmosDB documents: {len(cosmos_ids)}")
        print(f"  Search index documents: {len(search_ids)}")
        print(f"  Orphaned documents (in search only): {len(orphaned_ids)}")
        
        if cosmos_ids - search_ids:
            missing_count = len(cosmos_ids - search_ids)
            print(f"  Missing from search: {missing_count} (not handled by this script)")
        
        return list(orphaned_ids)
    
    async def interactive_cleanup(self, orphaned_ids: List[str]) -> None:
        """Interactively review and delete orphaned documents."""
        if not orphaned_ids:
            print("\n✅ No orphaned documents found. Search index is in sync!")
            return
        
        print(f"\n" + "=" * 60)
        print(f"ORPHANED DOCUMENTS REVIEW ({len(orphaned_ids)} found)")
        print("=" * 60)
        print("These documents exist in Azure Search but not in CosmosDB:")
        
        deleted_count = 0
        skipped_count = 0
        
        for i, doc_id in enumerate(orphaned_ids, 1):
            print(f"\n[{i}/{len(orphaned_ids)}] Document ID: {doc_id}")
            print("-" * 50)
            
            # Get document details
            doc_details = self.get_search_document_details(doc_id)
            
            # Show document preview
            if 'error' not in doc_details:
                if 'UserPrompt' in doc_details:
                    user_prompt = doc_details['UserPrompt']
                    preview = user_prompt[:200] + "..." if len(user_prompt) > 200 else user_prompt
                    print(f"UserPrompt: {preview}")
                
                if 'Query' in doc_details:
                    query = doc_details['Query']
                    preview = query[:200] + "..." if len(query) > 200 else query
                    print(f"Query: {preview}")
                
                # Show other fields
                for key, value in doc_details.items():
                    if key not in ['id', 'UserPrompt', 'Query', 'UserPromptVector', 'QueryVector']:
                        if isinstance(value, str) and len(str(value)) > 100:
                            print(f"{key}: {str(value)[:100]}...")
                        else:
                            print(f"{key}: {value}")
            else:
                print(f"⚠ Error getting document details: {doc_details.get('error', 'Unknown')}")
            
            # Ask for confirmation
            print(f"\n🗑️  Delete this document from search index?")
            while True:
                response = input("Enter [y]es, [n]o, [s]kip remaining, or [q]uit: ").lower().strip()
                
                if response in ['y', 'yes']:
                    print(f"Deleting document {doc_id}...")
                    success = await self.delete_search_document(doc_id)
                    if success:
                        print(f"✅ Successfully deleted {doc_id}")
                        deleted_count += 1
                    else:
                        print(f"❌ Failed to delete {doc_id}")
                    break
                
                elif response in ['n', 'no']:
                    print(f"⏭️  Skipped {doc_id}")
                    skipped_count += 1
                    break
                
                elif response in ['s', 'skip']:
                    remaining = len(orphaned_ids) - i
                    print(f"⏭️  Skipping remaining {remaining} documents")
                    skipped_count += remaining + 1
                    return await self._show_summary(deleted_count, skipped_count, len(orphaned_ids))
                
                elif response in ['q', 'quit']:
                    print("🚫 Operation cancelled")
                    return await self._show_summary(deleted_count, skipped_count, len(orphaned_ids))
                
                else:
                    print("Invalid response. Please enter 'y', 'n', 's', or 'q'")
        
        await self._show_summary(deleted_count, skipped_count, len(orphaned_ids))
    
    async def _show_summary(self, deleted: int, skipped: int, total: int) -> None:
        """Show operation summary."""
        print(f"\n" + "=" * 60)
        print("CLEANUP SUMMARY")
        print("=" * 60)
        print(f"📊 Total orphaned documents: {total}")
        print(f"✅ Successfully deleted: {deleted}")
        print(f"⏭️  Skipped: {skipped}")
        print(f"❌ Failed/Cancelled: {total - deleted - skipped}")
        
        if deleted > 0:
            print(f"\n🎉 Search index cleanup completed!")
            print(f"   Removed {deleted} orphaned document(s) from blitz-nba-index")
        
        print("=" * 60)


async def main():
    """Main function to run the sync script."""
    print("=" * 60)
    print("AZURE SEARCH INDEX SYNC TOOL")
    print("NBA Official CosmosDB ↔ blitz-nba-index")
    print("=" * 60)
    
    syncer = SearchIndexSyncer()
    
    try:
        # Find orphaned documents
        orphaned_ids = syncer.find_orphaned_documents()
        
        if not orphaned_ids:
            print("\n✅ Search index is perfectly synchronized with CosmosDB!")
            return
        
        print(f"\n⚠️  Found {len(orphaned_ids)} orphaned documents in search index")
        print("These documents will be reviewed for deletion.")
        
        confirm = input(f"\nProceed with interactive cleanup? [y/N]: ").lower().strip()
        if confirm not in ['y', 'yes']:
            print("🚫 Operation cancelled")
            return
        
        # Interactive cleanup
        await syncer.interactive_cleanup(orphaned_ids)
        
    except KeyboardInterrupt:
        print("\n\n🚫 Operation cancelled by user")
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        raise


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n🚫 Cancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        sys.exit(1)
