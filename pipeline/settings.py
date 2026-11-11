"""Load pipeline configuration from config.json and .env."""

import json
import os
import logging
from pathlib import Path
from typing import Dict, Any

from dotenv import load_dotenv


class ConfigError(Exception):
    pass


def load_settings(config_path: str = None, env_path: str = None) -> Dict[str, Any]:
    """
    Load pipeline config from config.json and .env.

    Args:
        config_path: Path to config.json. Defaults to deep_tech_classifier/config.json.
        env_path: Path to .env. Defaults to deep_tech_classifier/.env.

    Returns:
        Config dict from config.json (API keys are not stored in the dict — read via os.getenv).

    Raises:
        ConfigError: On missing keys or files.
    """
    base_dir = Path(__file__).parent.parent

    config_path = Path(config_path) if config_path else base_dir / "config.json"
    env_path = Path(env_path) if env_path else base_dir / ".env"

    # Load .env
    if env_path.exists():
        load_dotenv(env_path)
    else:
        logging.warning(f".env not found at {env_path}. Expecting env vars in environment.")

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    epo_key = os.getenv("EPO_KEY")
    epo_secret = os.getenv("EPO_SECRET")

    # Load config.json first so we can check which provider is configured
    if not config_path.exists():
        raise ConfigError(f"config.json not found at {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    # Validate that the configured provider has its API key
    provider_name = config.get("llm", {}).get("provider", "anthropic")
    if provider_name == "anthropic" and not anthropic_key:
        raise ConfigError(
            "ANTHROPIC_API_KEY must be set in .env or environment for the anthropic provider. "
            "See .env.template for setup instructions."
        )
    elif provider_name == "gemini" and not gemini_key:
        raise ConfigError(
            "GEMINI_API_KEY must be set in .env or environment for the gemini provider. "
            "See .env.template for setup instructions."
        )
    elif provider_name == "openai" and not openai_key:
        raise ConfigError(
            "OPENAI_API_KEY must be set in .env or environment for the openai provider. "
            "See .env.template for setup instructions."
        )

    return config

