"""Centralized logging configuration."""

import logging
import os
from pathlib import Path
from typing import Dict, Any


def setup_logging(config: Dict[str, Any]) -> None:
    """
    Configure logging based on configuration.

    Args:
        config: Configuration dictionary with logging settings
    """
    log_level = getattr(logging, config['logging']['level'].upper())

    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Clear existing handlers
    root_logger.handlers = []

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler (if enabled)
    if config['logging']['log_to_file']:
        log_file_path = config['logging']['log_file_path']

        # Create log directory if it doesn't exist
        log_dir = os.path.dirname(log_file_path)
        if log_dir:
            Path(log_dir).mkdir(parents=True, exist_ok=True)

        file_handler = logging.FileHandler(log_file_path, encoding='utf-8')
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

        logging.info(f"Logging to file: {log_file_path}")

    logging.info(f"Logging configured with level: {config['logging']['level']}")
