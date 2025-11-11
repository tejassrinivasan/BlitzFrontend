"""
Enhanced caching service for better performance and cache management.
"""

import json
import logging
from typing import List, Optional, Dict, Any
import redis
import os
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class CacheService:
    """Enhanced caching service with better invalidation and warming capabilities."""
    
    def __init__(self):
        self.redis_client = redis.from_url(os.getenv("REDIS_URL")) if os.getenv("REDIS_URL") else None
        self.cache_enabled = self.redis_client is not None
        
        # Cache TTL settings (in seconds)
        self.PAGE_CACHE_TTL = 300  # 5 minutes for paginated results
        self.ALL_CACHE_TTL = 600   # 10 minutes for all documents
        self.SEARCH_CACHE_TTL = 180  # 3 minutes for search results
        self.STATS_CACHE_TTL = 900   # 15 minutes for stats
        
        if self.cache_enabled:
            logger.info("Cache service initialized with Redis")
        else:
            logger.warning("Cache service initialized without Redis - caching disabled")
    
    def _get_key(self, key_type: str, container: str, **kwargs) -> str:
        """Generate cache keys with consistent naming."""
        base_key = f"feedback_docs:{container}:{key_type}"
        if kwargs:
            params = ":".join(f"{k}={v}" for k, v in sorted(kwargs.items()))
            return f"{base_key}:{params}"
        return base_key
    
    def get_page_cache(self, container: str, page: int, limit: int = 20) -> Optional[List[Dict]]:
        """Get paginated documents from cache."""
        if not self.cache_enabled:
            return None
        
        try:
            key = self._get_key("page", container, page=page, limit=limit)
            cached_data = self.redis_client.get(key)
            if cached_data:
                logger.debug(f"Cache HIT for {key}")
                return json.loads(cached_data)
        except Exception as e:
            logger.error(f"Error getting page cache: {e}")
        
        return None
    
    def set_page_cache(self, container: str, page: int, data: List[Dict], limit: int = 20) -> None:
        """Cache paginated documents."""
        if not self.cache_enabled or not data:
            return
        
        try:
            key = self._get_key("page", container, page=page, limit=limit)
            self.redis_client.setex(key, self.PAGE_CACHE_TTL, json.dumps(data))
            logger.debug(f"Cache SET for {key} ({len(data)} items)")
        except Exception as e:
            logger.error(f"Error setting page cache: {e}")
    
    def get_all_cache(self, container: str) -> Optional[List[Dict]]:
        """Get all documents from cache."""
        if not self.cache_enabled:
            return None
        
        try:
            key = self._get_key("all", container)
            cached_data = self.redis_client.get(key)
            if cached_data:
                logger.debug(f"Cache HIT for all documents: {container}")
                return json.loads(cached_data)
        except Exception as e:
            logger.error(f"Error getting all cache: {e}")
        
        return None
    
    def set_all_cache(self, container: str, data: List[Dict]) -> None:
        """Cache all documents."""
        if not self.cache_enabled or not data:
            return
        
        try:
            key = self._get_key("all", container)
            self.redis_client.setex(key, self.ALL_CACHE_TTL, json.dumps(data))
            logger.debug(f"Cache SET for all documents: {container} ({len(data)} items)")
        except Exception as e:
            logger.error(f"Error setting all cache: {e}")
    
    def get_search_cache(self, container: str, query: str, field: str = "UserPrompt") -> Optional[List[Dict]]:
        """Get search results from cache."""
        if not self.cache_enabled:
            return None
        
        try:
            key = self._get_key("search", container, query=query.lower(), field=field)
            cached_data = self.redis_client.get(key)
            if cached_data:
                logger.debug(f"Cache HIT for search: {query} in {field}")
                return json.loads(cached_data)
        except Exception as e:
            logger.error(f"Error getting search cache: {e}")
        
        return None
    
    def set_search_cache(self, container: str, query: str, field: str, data: List[Dict]) -> None:
        """Cache search results."""
        if not self.cache_enabled:
            return
        
        try:
            key = self._get_key("search", container, query=query.lower(), field=field)
            self.redis_client.setex(key, self.SEARCH_CACHE_TTL, json.dumps(data))
            logger.debug(f"Cache SET for search: {query} in {field} ({len(data)} results)")
        except Exception as e:
            logger.error(f"Error setting search cache: {e}")
    
    def invalidate_container_cache(self, container: str) -> None:
        """Invalidate all cache entries for a specific container."""
        if not self.cache_enabled:
            return
        
        try:
            # Get all keys for this container
            pattern = f"feedback_docs:{container}:*"
            keys = self.redis_client.keys(pattern)
            
            if keys:
                self.redis_client.delete(*keys)
                logger.info(f"Invalidated {len(keys)} cache entries for container: {container}")
            else:
                logger.debug(f"No cache entries to invalidate for container: {container}")
                
        except Exception as e:
            logger.error(f"Error invalidating container cache: {e}")
    
    def invalidate_all_cache(self) -> None:
        """Invalidate all feedback document cache entries."""
        if not self.cache_enabled:
            return
        
        try:
            pattern = "feedback_docs:*"
            keys = self.redis_client.keys(pattern)
            
            if keys:
                self.redis_client.delete(*keys)
                logger.info(f"Invalidated all cache entries ({len(keys)} keys)")
                
        except Exception as e:
            logger.error(f"Error invalidating all cache: {e}")
    
    def warm_cache_for_container(self, container: str, documents: List[Dict]) -> None:
        """Warm cache for a container with memory-safe limits."""
        if not self.cache_enabled or not documents:
            return
        
        try:
            # Only cache if reasonable size to prevent memory issues
            max_cache_size = 1000
            documents_to_cache = documents[:max_cache_size] if len(documents) > max_cache_size else documents
            
            # Cache limited documents only if size is reasonable
            if len(documents_to_cache) <= max_cache_size:
                self.set_all_cache(container, documents_to_cache)
            
            # Cache first few pages with smaller page size
            page_size = 20
            total_pages = min(3, (len(documents_to_cache) + page_size - 1) // page_size)  # Cache first 3 pages only
            
            for page in range(1, total_pages + 1):
                start_idx = (page - 1) * page_size
                end_idx = start_idx + page_size
                page_data = documents_to_cache[start_idx:end_idx]
                
                if page_data:
                    self.set_page_cache(container, page, page_data, page_size)
            
            cached_count = len(documents_to_cache)
            logger.info(f"Cache warmed for {container}: {cached_count} docs + {total_pages} pages (memory-safe)")
            
        except Exception as e:
            logger.error(f"Error warming cache for {container}: {e}")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        if not self.cache_enabled:
            return {"enabled": False}
        
        try:
            info = self.redis_client.info()
            pattern_keys = self.redis_client.keys("feedback_docs:*")
            
            return {
                "enabled": True,
                "total_keys": len(pattern_keys),
                "memory_used": info.get("used_memory_human", "Unknown"),
                "connected_clients": info.get("connected_clients", 0),
                "cache_keys_by_container": self._group_keys_by_container(pattern_keys)
            }
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {"enabled": True, "error": str(e)}
    
    def _group_keys_by_container(self, keys: List[str]) -> Dict[str, int]:
        """Group cache keys by container for stats."""
        containers = {}
        for key in keys:
            try:
                # Extract container from key pattern: feedback_docs:{container}:{type}:...
                parts = key.split(':')
                if len(parts) >= 3:
                    container = parts[1]
                    containers[container] = containers.get(container, 0) + 1
            except Exception:
                continue
        return containers


# Global cache service instance
cache_service = CacheService()
