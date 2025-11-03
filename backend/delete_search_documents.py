#!/usr/bin/env python3
"""
Azure Search Document Deletion Script

This script allows you to delete documents from the NBA Azure Search index.
You can delete single or multiple documents by providing their document IDs.
"""

import os
import sys
import asyncio
from typing import List
from dotenv import load_dotenv

# Add the current directory to Python path so we can import from app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

try:
    from app.azure_search_service import azure_search_service
except ImportError:
    print("Error: Could not import azure_search_service.")
    print("Make sure you're running this from the backend directory.")
    sys.exit(1)


async def verify_documents_exist(doc_ids: List[str]) -> dict:
    """
    Verify which documents exist in the index.
    
    Returns:
        dict: {'existing': [...], 'not_found': [...]}
    """
    existing = []
    not_found = []
    
    print(f"Verifying {len(doc_ids)} document(s)...")
    
    for doc_id in doc_ids:
        exists = await azure_search_service.verify_document_exists(doc_id)
        if exists:
            existing.append(doc_id)
            print(f"  ✓ Found: {doc_id}")
        else:
            not_found.append(doc_id)
            print(f"  ✗ Not found: {doc_id}")
    
    return {'existing': existing, 'not_found': not_found}


async def delete_documents(doc_ids: List[str]) -> dict:
    """
    Delete documents from the Azure Search index.
    
    Returns:
        dict: {'succeeded': [...], 'failed': [...]}
    """
    return await azure_search_service.delete_documents(doc_ids)


async def main():
    """Main function to run the deletion script."""
    print("=" * 60)
    print("Azure Search Document Deletion Tool")
    print("Index: blitz-nba-index")
    print("=" * 60)
    
    # Check if Azure Search is configured
    if not azure_search_service.is_configured():
        print("❌ Azure Search not configured.")
        print("Required environment variables:")
        print("  - AZURE_SEARCH_ENDPOINT")
        print("  - AZURE_SEARCH_API_KEY (or AZURE_SEARCH_KEY)")
        return
    
    print(f"\n✓ Connected to Azure Search")
    print(f"  Endpoint: {azure_search_service.endpoint}")
    print(f"  Index: {azure_search_service.index_name}\n")
    
    # Get document IDs from user
    print("Enter document ID(s) to delete:")
    print("  - Single ID: abc123")
    print("  - Multiple IDs: abc123, def456, ghi789")
    print("  - Or enter 'q' to quit\n")
    
    user_input = input("Document ID(s): ").strip()
    
    if user_input.lower() == 'q':
        print("Cancelled.")
        return
    
    # Parse input
    doc_ids = [doc_id.strip() for doc_id in user_input.split(',') if doc_id.strip()]
    
    if not doc_ids:
        print("❌ No document IDs provided.")
        return
    
    print(f"\n📋 Document IDs to delete: {len(doc_ids)}")
    for doc_id in doc_ids:
        print(f"  - {doc_id}")
    
    # Verify documents exist
    print("\n" + "=" * 60)
    verification = await verify_documents_exist(doc_ids)
    
    if not verification['existing']:
        print("\n❌ None of the specified documents exist in the index.")
        if verification['not_found']:
            print("Documents not found:")
            for doc_id in verification['not_found']:
                print(f"  - {doc_id}")
        return
    
    if verification['not_found']:
        print(f"\n⚠ Warning: {len(verification['not_found'])} document(s) not found and will be skipped:")
        for doc_id in verification['not_found']:
            print(f"  - {doc_id}")
    
    # Confirm deletion
    print("\n" + "=" * 60)
    print(f"⚠️  About to delete {len(verification['existing'])} document(s):")
    for doc_id in verification['existing']:
        print(f"  - {doc_id}")
    
    confirm = input("\nType 'yes' to confirm deletion: ").strip().lower()
    
    if confirm != 'yes':
        print("Cancelled.")
        return
    
    # Perform deletion
    print("\n" + "=" * 60)
    print("Deleting documents...")
    
    result = await delete_documents(verification['existing'])
    
    # Report results
    print("\n" + "=" * 60)
    print("DELETION RESULTS")
    print("=" * 60)
    
    if result['succeeded']:
        print(f"\n✓ Successfully deleted {len(result['succeeded'])} document(s):")
        for doc_id in result['succeeded']:
            print(f"  ✓ {doc_id}")
    
    if result['failed']:
        print(f"\n✗ Failed to delete {len(result['failed'])} document(s):")
        for item in result['failed']:
            if isinstance(item, dict):
                print(f"  ✗ {item['id']}: {item['error']}")
            else:
                print(f"  ✗ {item}")
    
    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        sys.exit(1)
