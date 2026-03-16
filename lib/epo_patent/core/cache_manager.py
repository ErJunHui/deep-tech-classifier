"""File-based caching system for EPO API responses.

Caches search results, bibliographic data, and family data to improve performance
and reduce API calls on repeated runs.
"""

import hashlib
import json
import os
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any


def generate_cache_key(data_type: str, **kwargs) -> str:
    """
    Generate SHA256 hash for cache key.

    Args:
        data_type: Type of data ('search', 'biblio', 'family', 'legal')
        kwargs: Parameters to hash (e.g., cql_query for search, country/doc_num for biblio)

    Returns:
        SHA256 hash string
    """
    if data_type == 'search':
        content = kwargs.get('cql_query', '')
    elif data_type in ['biblio', 'family', 'legal']:
        content = f"{kwargs.get('country', '')}-{kwargs.get('doc_num', '')}-{kwargs.get('kind', '')}"
    else:
        raise ValueError(f"Unknown data_type: {data_type}")

    return hashlib.sha256(content.encode('utf-8')).hexdigest()


class CacheManager:
    """Manages file-based caching of API responses."""

    def __init__(self, cache_dir: str, expiry_days: int = 7):
        """
        Initialize cache manager.

        Args:
            cache_dir: Base directory for cache storage
            expiry_days: Number of days before cache entries expire
        """
        self.cache_dir = Path(cache_dir)
        self.expiry_days = expiry_days
        self.logger = logging.getLogger(__name__)

        # Statistics
        self.stats = {
            'hits': 0,
            'misses': 0,
            'expired': 0,
            'errors': 0
        }

        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Create subdirectories for each data type
        for data_type in ['search', 'biblio', 'family', 'legal']:
            (self.cache_dir / data_type).mkdir(parents=True, exist_ok=True)

    def get(self, cache_key: str, data_type: str) -> Optional[str]:
        """
        Retrieve cached data if valid.

        Args:
            cache_key: Cache key (hash)
            data_type: Type of data ('search', 'biblio', 'family', 'legal')

        Returns:
            Cached data string if valid, None otherwise
        """
        cache_file = self.cache_dir / data_type / f"{cache_key}.json"

        if not cache_file.exists():
            self.stats['misses'] += 1
            return None

        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                cache_entry = json.load(f)

            # Check expiry
            expires_at = datetime.fromisoformat(cache_entry['expires_at'])
            if datetime.now() > expires_at:
                self.logger.debug(f"Cache entry expired: {cache_key}")
                self.stats['expired'] += 1
                # Optionally delete expired entry
                cache_file.unlink()
                return None

            self.stats['hits'] += 1
            return cache_entry['response_text']

        except Exception as e:
            self.logger.warning(f"Error reading cache file {cache_file}: {e}")
            self.stats['errors'] += 1
            return None

    def set(self, cache_key: str, data_type: str, data: str, metadata: Dict[str, Any] = None):
        """
        Save data to cache.

        Args:
            cache_key: Cache key (hash)
            data_type: Type of data ('search', 'biblio', 'family', 'legal')
            data: Data to cache (typically XML response text)
            metadata: Optional metadata to store with cache entry
        """
        cache_file = self.cache_dir / data_type / f"{cache_key}.json"

        cached_at = datetime.now()
        expires_at = cached_at + timedelta(days=self.expiry_days)

        cache_entry = {
            'cache_key': cache_key,
            'data_type': data_type,
            'query_params': metadata or {},
            'response_text': data,
            'cached_at': cached_at.isoformat(),
            'expires_at': expires_at.isoformat()
        }

        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cache_entry, f, indent=2)

            self.logger.debug(f"Cached {data_type} data with key: {cache_key}")

        except Exception as e:
            self.logger.warning(f"Error writing cache file {cache_file}: {e}")
            self.stats['errors'] += 1

    def clear(self, data_type: str = None):
        """
        Clear cache entries.

        Args:
            data_type: Specific type to clear, or None to clear all
        """
        if data_type:
            cache_path = self.cache_dir / data_type
            if cache_path.exists():
                for cache_file in cache_path.glob("*.json"):
                    cache_file.unlink()
                self.logger.info(f"Cleared {data_type} cache")
        else:
            for data_type in ['search', 'biblio', 'family', 'legal']:
                cache_path = self.cache_dir / data_type
                if cache_path.exists():
                    for cache_file in cache_path.glob("*.json"):
                        cache_file.unlink()
            self.logger.info("Cleared all cache")

        # Reset statistics
        self.stats = {'hits': 0, 'misses': 0, 'expired': 0, 'errors': 0}

    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dictionary with statistics
        """
        total_requests = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_requests * 100) if total_requests > 0 else 0

        # Count files and calculate total size
        total_entries = 0
        total_size_bytes = 0

        for data_type in ['search', 'biblio', 'family', 'legal']:
            cache_path = self.cache_dir / data_type
            if cache_path.exists():
                for cache_file in cache_path.glob("*.json"):
                    total_entries += 1
                    total_size_bytes += cache_file.stat().st_size

        return {
            'hits': self.stats['hits'],
            'misses': self.stats['misses'],
            'expired': self.stats['expired'],
            'errors': self.stats['errors'],
            'hit_rate': f"{hit_rate:.1f}%",
            'total_entries': total_entries,
            'total_size_mb': f"{total_size_bytes / (1024 * 1024):.2f}"
        }

    def cleanup_expired(self):
        """Remove all expired cache entries."""
        removed_count = 0

        for data_type in ['search', 'biblio', 'family', 'legal']:
            cache_path = self.cache_dir / data_type
            if not cache_path.exists():
                continue

            for cache_file in cache_path.glob("*.json"):
                try:
                    with open(cache_file, 'r', encoding='utf-8') as f:
                        cache_entry = json.load(f)

                    expires_at = datetime.fromisoformat(cache_entry['expires_at'])
                    if datetime.now() > expires_at:
                        cache_file.unlink()
                        removed_count += 1

                except Exception as e:
                    self.logger.warning(f"Error checking expiry for {cache_file}: {e}")

        self.logger.info(f"Removed {removed_count} expired cache entries")
        return removed_count
