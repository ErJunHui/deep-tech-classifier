"""Exponential backoff retry logic for API calls.

Provides decorator for automatic retry of failed API requests with exponential backoff.
"""

import functools
import time
import random
import logging
import requests
from requests.exceptions import HTTPError
from typing import List, Callable, Any


def calculate_backoff_delay(
    attempt: int,
    base_delay: float = 2.0,
    backoff_factor: float = 2.0,
    max_delay: int = 60
) -> float:
    """
    Calculate delay with exponential backoff and jitter.

    Formula: min(base_delay * (backoff_factor ^ attempt) + jitter, max_delay)

    Args:
        attempt: Current attempt number (0-indexed)
        base_delay: Base delay in seconds
        backoff_factor: Multiplicative factor for backoff
        max_delay: Maximum delay in seconds

    Returns:
        Delay in seconds

    Examples:
        Attempt 0: 2.0 * (2.0 ^ 0) + jitter = 2-3 seconds
        Attempt 1: 2.0 * (2.0 ^ 1) + jitter = 4-5 seconds
        Attempt 2: 2.0 * (2.0 ^ 2) + jitter = 8-9 seconds
    """
    delay = base_delay * (backoff_factor ** attempt)
    jitter = random.uniform(0, 1)  # Random jitter 0-1 seconds
    return min(delay + jitter, max_delay)


def retry_with_backoff(
    max_attempts: int = 3,
    backoff_factor: float = 2.0,
    retry_status_codes: List[int] = None,
    max_delay: int = 60,
    logger: logging.Logger = None
) -> Callable:
    """
    Decorator for retrying functions with exponential backoff.

    Retries on:
    - HTTP errors with specified status codes (429, 500, 502, 503, 504 by default)
    - Connection errors
    - Timeout errors

    Does NOT retry on:
    - HTTP 404 (Not Found - legitimate "no results")
    - HTTP 400 (Bad Request - client error)
    - HTTP 401/403 (Authentication errors)
    - Other client errors (4xx)

    Args:
        max_attempts: Maximum number of attempts (default: 3)
        backoff_factor: Exponential backoff factor (default: 2.0)
        retry_status_codes: List of HTTP status codes to retry (default: [429, 500, 502, 503, 504])
        max_delay: Maximum delay between retries in seconds (default: 60)
        logger: Logger instance for logging retries

    Returns:
        Decorated function

    Example:
        @retry_with_backoff(max_attempts=3)
        def my_api_call():
            return requests.get(...)
    """
    if retry_status_codes is None:
        retry_status_codes = [429, 500, 502, 503, 504]

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            last_exception = None
            func_logger = logger or logging.getLogger(func.__module__)

            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)

                except HTTPError as e:
                    status_code = e.response.status_code

                    # Don't retry on client errors (except rate limit 429)
                    if status_code not in retry_status_codes:
                        func_logger.error(f"Non-retryable HTTP error {status_code}: {e}")
                        raise

                    last_exception = e

                    if attempt < max_attempts - 1:
                        delay = calculate_backoff_delay(
                            attempt,
                            backoff_factor=backoff_factor,
                            max_delay=max_delay
                        )
                        func_logger.warning(
                            f"Attempt {attempt + 1}/{max_attempts} failed with HTTP {status_code}. "
                            f"Retrying in {delay:.2f}s..."
                        )
                        time.sleep(delay)
                    else:
                        func_logger.error(
                            f"All {max_attempts} retry attempts exhausted for HTTP {status_code}"
                        )
                        raise

                except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                    last_exception = e

                    if attempt < max_attempts - 1:
                        delay = calculate_backoff_delay(
                            attempt,
                            backoff_factor=backoff_factor,
                            max_delay=max_delay
                        )
                        func_logger.warning(
                            f"Attempt {attempt + 1}/{max_attempts} failed with {type(e).__name__}. "
                            f"Retrying in {delay:.2f}s..."
                        )
                        time.sleep(delay)
                    else:
                        func_logger.error(
                            f"All {max_attempts} retry attempts exhausted for {type(e).__name__}"
                        )
                        raise

            # Should never reach here, but just in case
            if last_exception:
                raise last_exception

        return wrapper
    return decorator
