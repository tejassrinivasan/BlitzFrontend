import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# backend/app/config.py -> backend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_ROOT / ".env"

# Always load backend/.env (works when cwd is repo root or backend/)
DOTENV_LOADED = load_dotenv(ENV_FILE)
# Optional: also allow a .env in cwd to override (e.g. local experiments)
load_dotenv(override=True)

_config_logger = logging.getLogger(__name__)
if not DOTENV_LOADED and not ENV_FILE.is_file():
    _config_logger.warning(
        "backend/.env not found at %s (cwd=%s). Cosmos/Postgres env vars may be missing.",
        ENV_FILE,
        os.getcwd(),
    )
elif DOTENV_LOADED:
    _config_logger.info("Loaded environment from %s", ENV_FILE)


SEARCH_SERVICE_NAME = "blitz-ai-search"
SEARCH_INDEX_NAME = "blitz-mlb-index"
SEARCH_ENDPOINT = f"https://{SEARCH_SERVICE_NAME}.search.windows.net"


def _env_first(*names: str, default: str | None = None) -> str | None:
    """Read env var from first matching name; strip quotes from .env values."""
    for name in names:
        raw = os.getenv(name)
        if raw is not None and str(raw).strip() != "":
            return str(raw).strip().strip('"').strip("'")
    return default


def _env_bool(name: str, *, default: bool = False) -> bool:
    raw = _env_first(name, default="true" if default else "false")
    return (raw or "").lower() in ("1", "true", "yes", "on")


OPENAI_ENDPOINT = _env_first(
    "AZURE_OPENAI_ENDPOINT",
    default="https://blitz-foundry.openai.azure.com/",
)
if OPENAI_ENDPOINT and not OPENAI_ENDPOINT.endswith("/"):
    OPENAI_ENDPOINT = f"{OPENAI_ENDPOINT}/"

OPENAI_DEPLOYMENT = _env_first(
    "AZURE_OPENAI_DEPLOYMENT",
    default="text-embedding-ada-002",
)
OPENAI_API_VERSION = _env_first(
    "AZURE_OPENAI_API_VERSION",
    default="2024-02-01",
)
OPENAI_EMBEDDING_DIMENSIONS = 1536

# Embeddings power semantic search on official containers. Auto-on when API key is set;
# set AZURE_OPENAI_EMBEDDINGS_ENABLED=false to force off. Saves still succeed if OpenAI is down.
_embeddings_flag = os.getenv("AZURE_OPENAI_EMBEDDINGS_ENABLED")
if _embeddings_flag is not None:
    AZURE_OPENAI_EMBEDDINGS_ENABLED = _embeddings_flag.lower() in ("1", "true", "yes", "on")
else:
    AZURE_OPENAI_EMBEDDINGS_ENABLED = bool(os.getenv("AZURE_OPENAI_API_KEY"))


# Cosmos: accept COSMOSDB_* (code) and COSMOS_DB_* (legacy prod naming)
COSMOSDB_ENDPOINT = _env_first(
    "COSMOSDB_ENDPOINT",
    "COSMOS_DB_ENDPOINT",
    default="https://blitz-queries.documents.azure.com:443/",
)
COSMOSDB_KEY = _env_first("COSMOSDB_KEY", "COSMOS_DB_KEY")
COSMOSDB_CONNECTION_STRING = _env_first(
    "COSMOSDB_CONNECTION_STRING",
    "COSMOS_DB_CONNECTION_STRING",
)
DATABASE_NAME = _env_first(
    "COSMOSDB_DATABASE",
    "DATABASE_NAME",
    "COSMOS_DATABASE_NAME",
    default="sports",
)
OFFICIAL_DOCUMENTS_CONTAINER_NAME = "mlb-official"
UNOFFICIAL_PARTNER_FEEDBACK_HELPFUL_CONTAINER_NAME = "mlb-partner-feedback-helpful" 
UNOFFICIAL_PARTNER_FEEDBACK_UNHELPFUL_CONTAINER_NAME = "mlb-partner-feedback-unhelpful" 
UNOFFICIAL_USER_FEEDBACK_HELPFUL_CONTAINER_NAME = "mlb-user-feedback"
UNOFFICIAL_USER_FEEDBACK_UNHELPFUL_CONTAINER_NAME = "mlb-user-feedback-unhelpful"

# NBA Containers
NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME = "nba-official"
NBA_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME = "nba-unofficial"
MLB_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME = "mlb-unofficial"

# MLB Official Container (uses mlbfinal database schema)
MLB_OFFICIAL_DOCUMENTS_CONTAINER_NAME = "mlb-official"
# Cosmos container id when it differs from API name (e.g. legacy "mlb" in Azure)
MLB_OFFICIAL_COSMOS_CONTAINER_ID = _env_first(
    "MLB_OFFICIAL_COSMOS_CONTAINER",
    default=MLB_OFFICIAL_DOCUMENTS_CONTAINER_NAME,
)

# Container display mapping for UI
CONTAINER_DISPLAY_NAMES = {
    "mlb-official": "MLB Official",
    "mlb-unofficial": "MLB Unofficial", 
    "nba-official": "NBA Official",
    "nba-unofficial": "NBA Unofficial"
}

# PostgreSQL Database Configurations
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

# Available PostgreSQL databases for queries
AVAILABLE_DATABASES = {
    "mlb": {
        "host": POSTGRES_HOST,
        "port": POSTGRES_PORT,
        "database": "mlb",
        "user": POSTGRES_USER,
        "password": POSTGRES_PASSWORD
    },
    "mlbfinal": {
        "host": POSTGRES_HOST,
        "port": POSTGRES_PORT,
        "database": "mlbfinal",
        "user": POSTGRES_USER,
        "password": POSTGRES_PASSWORD
    },
    "nba": {
        "host": POSTGRES_HOST,
        "port": POSTGRES_PORT,
        "database": "nba",
        "user": POSTGRES_USER,
        "password": POSTGRES_PASSWORD
    }
}
