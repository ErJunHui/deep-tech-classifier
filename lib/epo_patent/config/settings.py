"""Configuration management module.

Loads and validates configuration from .env and config.json files.
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, Any
from dotenv import load_dotenv


class ConfigurationError(Exception):
    """Raised when configuration is invalid or missing."""
    pass


def load_config(config_path: str = None, env_path: str = None) -> Dict[str, Any]:
    """
    Load configuration from .env and config.json files.

    Args:
        config_path: Path to config.json (default: ./config/config.json)
        env_path: Path to .env file (default: ./.env)

    Returns:
        Dictionary with complete configuration

    Raises:
        ConfigurationError: If configuration is invalid or missing required values
    """
    # Determine paths
    if config_path is None:
        config_path = Path(__file__).parent / 'config.json'
    if env_path is None:
        env_path = Path(__file__).parent.parent / '.env'

    # Load environment variables from .env
    if os.path.exists(env_path):
        load_dotenv(env_path)
    else:
        logging.warning(f".env file not found at {env_path}")

    # Load API credentials from environment
    epo_key = os.getenv("EPO_KEY")
    epo_secret = os.getenv("EPO_SECRET")

    if not epo_key or not epo_secret:
        raise ConfigurationError(
            "EPO_KEY and EPO_SECRET must be set in .env file"
        )

    # Load config.json
    if not os.path.exists(config_path):
        # Create default config if it doesn't exist
        logging.warning(f"config.json not found at {config_path}, using defaults")
        config_data = _get_default_config()
        # Save default config
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2)
            logging.info(f"Created default config.json at {config_path}")
        except Exception as e:
            logging.warning(f"Could not save default config.json: {e}")
    else:
        with open(config_path, 'r', encoding='utf-8') as f:
            config_data = json.load(f)

    # Merge API credentials into config
    config_data['api']['epo_key'] = epo_key
    config_data['api']['epo_secret'] = epo_secret

    # Validate configuration
    _validate_config(config_data)

    # Resolve relative paths to absolute
    base_dir = Path(__file__).parent.parent
    config_data['cache']['cache_dir'] = str(base_dir / config_data['cache']['cache_dir'])
    config_data['checkpoint']['checkpoint_dir'] = str(base_dir / config_data['checkpoint']['checkpoint_dir'])

    if not os.path.isabs(config_data['input']['excel_file']):
        config_data['input']['excel_file'] = str(base_dir / config_data['input']['excel_file'])

    if not os.path.isabs(config_data['output']['output_dir']):
        config_data['output']['output_dir'] = str(base_dir / config_data['output']['output_dir'])

    # Load deep-tech configuration if enabled
    if config_data.get('deeptech', {}).get('enabled', False):
        deeptech_config_file = config_data['deeptech'].get('config_file', './config/deeptech_config.json')

        if not os.path.isabs(deeptech_config_file):
            deeptech_config_file = str(base_dir / deeptech_config_file)

        try:
            if os.path.exists(deeptech_config_file):
                with open(deeptech_config_file, 'r', encoding='utf-8') as f:
                    deeptech_config = json.load(f)

                # Resolve mapping file path
                if not os.path.isabs(deeptech_config['mapping_file']):
                    deeptech_config['mapping_file'] = str(base_dir / deeptech_config['mapping_file'])

                config_data['deeptech']['settings'] = deeptech_config
                logging.info(f"Deep-tech classification enabled with {deeptech_config_file}")
            else:
                logging.warning(f"Deep-tech config file not found: {deeptech_config_file}")
                config_data['deeptech']['settings'] = None
        except Exception as e:
            logging.error(f"Failed to load deep-tech configuration: {e}")
            config_data['deeptech']['settings'] = None
    else:
        config_data['deeptech'] = {'enabled': False, 'settings': None}

    return config_data


def _get_default_config() -> Dict[str, Any]:
    """Get default configuration values."""
    return {
        "api": {
            "max_results_per_company": 10,
            "search_delay_seconds": 4,
            "detail_delay_seconds": 2,
            "timeout": 60,
            "throttle_by_header": True
        },
        "retry": {
            "max_attempts": 3,
            "backoff_factor": 2.0,
            "retry_status_codes": [429, 500, 502, 503, 504],
            "max_delay_seconds": 60
        },
        "cache": {
            "enabled": True,
            "cache_dir": "./cache",
            "expiry_days": 7,
            "cache_search_results": True,
            "cache_biblio_details": True,
            "cache_family_data": True
        },
        "checkpoint": {
            "enabled": True,
            "checkpoint_dir": "./checkpoints",
            "checkpoint_interval": 5,
            "auto_resume": True
        },
        "input": {
            "excel_file": "deep_tech_dataset - Copy.xlsx",
            "sheet_name": "Sheet1",
            "column_name": "Coy Name"
        },
        "output": {
            "filename_prefix": "epo_patent_search_results_",
            "output_dir": "."
        },
        "logging": {
            "level": "INFO",
            "log_to_file": False,
            "log_file_path": "./logs/epo_patent.log"
        },
        "deeptech": {
            "enabled": False,
            "config_file": "./config/deeptech_config.json"
        },
        "name_normalization": {
            "enabled": False,
            "remove_legal_suffixes": True,
            "handle_non_ascii": True,
            "generate_variants": True,
            "max_variants": 5,
            "special_cases": {}
        },
        "legal_data": {
            "enabled": False,
            "fetch_legal_events": True,
            "legal_delay_seconds": 2,
            "cache_legal_data": True
        },
        "search_validation": {
            "enabled": False,
            "min_similarity_score": 70,
            "uncertain_threshold": 50,
            "fuzzy_matching_algorithm": "token_sort_ratio",
            "log_validation_details": True,
            "exclude_failed_validations": False
        },
        "diagnostics": {
            "log_normalization_variants": True,
            "create_diagnostics_sheet": False
        }
    }


def _validate_config(config: Dict[str, Any]) -> None:
    """
    Validate configuration values.

    Args:
        config: Configuration dictionary

    Raises:
        ConfigurationError: If configuration is invalid
    """
    # Validate API config
    if config['api']['max_results_per_company'] < 1:
        raise ConfigurationError("max_results_per_company must be >= 1")

    if config['api']['search_delay_seconds'] < 0:
        raise ConfigurationError("search_delay_seconds must be >= 0")

    if config['api']['detail_delay_seconds'] < 0:
        raise ConfigurationError("detail_delay_seconds must be >= 0")

    if config['api']['timeout'] < 1:
        raise ConfigurationError("timeout must be >= 1")

    # Validate retry config
    if config['retry']['max_attempts'] < 1:
        raise ConfigurationError("max_attempts must be >= 1")

    if config['retry']['backoff_factor'] < 1.0:
        raise ConfigurationError("backoff_factor must be >= 1.0")

    if not config['retry']['retry_status_codes']:
        raise ConfigurationError("retry_status_codes cannot be empty")

    # Validate cache config
    if config['cache']['expiry_days'] < 1:
        raise ConfigurationError("expiry_days must be >= 1")

    # Validate checkpoint config
    if config['checkpoint']['checkpoint_interval'] < 1:
        raise ConfigurationError("checkpoint_interval must be >= 1")

    # Validate logging config
    valid_log_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
    if config['logging']['level'].upper() not in valid_log_levels:
        raise ConfigurationError(
            f"log_level must be one of {valid_log_levels}, got '{config['logging']['level']}'"
        )

    # Validate name_normalization config (if present)
    if 'name_normalization' in config:
        if config['name_normalization'].get('max_variants', 5) < 1:
            raise ConfigurationError("max_variants must be >= 1")

    # Validate legal_data config (if present)
    if 'legal_data' in config:
        if config['legal_data'].get('legal_delay_seconds', 2) < 0:
            raise ConfigurationError("legal_delay_seconds must be >= 0")

    # Validate search_validation config (if present)
    if 'search_validation' in config:
        min_score = config['search_validation'].get('min_similarity_score', 70)
        if not (0 <= min_score <= 100):
            raise ConfigurationError("min_similarity_score must be between 0 and 100")

        uncertain_threshold = config['search_validation'].get('uncertain_threshold', 50)
        if not (0 <= uncertain_threshold <= 100):
            raise ConfigurationError("uncertain_threshold must be between 0 and 100")

        if uncertain_threshold > min_score:
            raise ConfigurationError(
                "uncertain_threshold must be <= min_similarity_score"
            )

        # Validate validation_mode (NEW)
        validation_mode = config['search_validation'].get('validation_mode', 'fuzzy')
        if validation_mode not in ['fuzzy', 'strict']:
            raise ConfigurationError(
                "validation_mode must be either 'fuzzy' or 'strict'"
            )

    # Validate search config (if present)
    if 'search' in config:
        # Validate CQL operator (NEW)
        cql_operator = config['search'].get('cql_operator', 'pa')
        # Common EPO CQL operators for applicant/inventor search
        valid_operators = ['pa', 'pa_name', 'apn', 'app', 'applicant', 'in', 'inventor']
        if cql_operator not in valid_operators:
            raise ConfigurationError(
                f"cql_operator must be one of: {', '.join(valid_operators)}. "
                f"Got: '{cql_operator}'"
            )
