"""
Azure Search Document Management Service

This module provides functionality to delete documents from the NBA Azure Search index
when documents are deleted from the NBA Official CosmosDB container.
"""

import os
import logging
from typing import List, Optional
from azure.search.documents import SearchClient
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import ResourceNotFoundError

logger = logging.getLogger(__name__)


class AzureSearchService:
    """Service for managing documents in Azure Search index."""
    
    def __init__(self):
        """Initialize Azure Search client."""
        self.endpoint = os.getenv('AZURE_SEARCH_ENDPOINT')
        self.api_key = os.getenv('AZURE_SEARCH_API_KEY') or os.getenv('AZURE_SEARCH_KEY')
        self.index_name = 'blitz-nba-index'
        
        if not self.endpoint or not self.api_key:
            logger.warning(
                "Azure Search credentials not configured. "
                "Search index deletion will be skipped."
            )
            self._client = None
        else:
            self._client = SearchClient(
                endpoint=self.endpoint,
                index_name=self.index_name,
                credential=AzureKeyCredential(self.api_key)
            )
            logger.info(f"Azure Search client initialized for index: {self.index_name}")
    
    def is_configured(self) -> bool:
        """Check if Azure Search is properly configured."""
        return self._client is not None
    
    async def verify_document_exists(self, doc_id: str) -> bool:
        """
        Verify if a document exists in the search index.
        
        Args:
            doc_id: The document ID to verify
            
        Returns:
            bool: True if document exists, False otherwise
        """
        if not self._client:
            logger.warning("Azure Search not configured, skipping document verification")
            return False
        
        try:
            result = self._client.get_document(key=doc_id)
            return result is not None
        except ResourceNotFoundError:
            return False
        except Exception as e:
            logger.error(f"Error verifying document {doc_id} in search index: {str(e)}")
            return False
    
    async def delete_document(self, doc_id: str) -> bool:
        """
        Delete a document from the Azure Search index.
        
        Args:
            doc_id: The ID of the document to delete
            
        Returns:
            bool: True if deletion was successful, False otherwise
        """
        if not self._client:
            logger.warning("Azure Search not configured, skipping document deletion")
            return False
        
        try:
            # First verify the document exists
            exists = await self.verify_document_exists(doc_id)
            if not exists:
                logger.info(f"Document {doc_id} not found in search index, nothing to delete")
                return True
            
            # Delete the document
            documents_to_delete = [{"id": doc_id}]
            result = self._client.delete_documents(documents=documents_to_delete)
            
            # Check if deletion was successful
            for item in result:
                if item.succeeded:
                    logger.info(f"Successfully deleted document {doc_id} from search index")
                    return True
                else:
                    error_msg = getattr(item, 'error_message', 'Unknown error')
                    logger.error(f"Failed to delete document {doc_id} from search index: {error_msg}")
                    return False
            
            return False
        except Exception as e:
            logger.error(f"Error deleting document {doc_id} from search index: {str(e)}")
            return False
    
    async def delete_documents(self, doc_ids: List[str]) -> dict:
        """
        Delete multiple documents from the Azure Search index.
        
        Args:
            doc_ids: List of document IDs to delete
            
        Returns:
            dict: {'succeeded': [...], 'failed': [...]}
        """
        if not self._client:
            logger.warning("Azure Search not configured, skipping document deletion")
            return {'succeeded': [], 'failed': doc_ids}
        
        succeeded = []
        failed = []
        
        try:
            documents_to_delete = [{"id": doc_id} for doc_id in doc_ids]
            result = self._client.delete_documents(documents=documents_to_delete)
            
            for item in result:
                if item.succeeded:
                    succeeded.append(item.key)
                    logger.info(f"Successfully deleted document {item.key} from search index")
                else:
                    error_msg = getattr(item, 'error_message', 'Unknown error')
                    failed.append({
                        'id': item.key,
                        'error': error_msg
                    })
                    logger.error(f"Failed to delete document {item.key} from search index: {error_msg}")
            
        except Exception as e:
            logger.error(f"Error during bulk deletion from search index: {str(e)}")
            failed.extend([{'id': doc_id, 'error': str(e)} for doc_id in doc_ids])
        
        return {
            'succeeded': succeeded,
            'failed': failed
        }


# Global instance
azure_search_service = AzureSearchService()
