import os
from dotenv import load_dotenv

load_dotenv()


SEARCH_SERVICE_NAME = "blitz-ai-search"
SEARCH_INDEX_NAME = "blitz-mlb-index"
SEARCH_ENDPOINT = f"https://{SEARCH_SERVICE_NAME}.search.windows.net"

OPENAI_ENDPOINT = "https://blitzgpt.openai.azure.com/"
OPENAI_DEPLOYMENT = "text-embedding-ada-002"
OPENAI_API_VERSION = "2025-03-01-preview"
OPENAI_EMBEDDING_DIMENSIONS = 1536

COSMOSDB_ENDPOINT = "https://blitz-queries.documents.azure.com:443/"
DATABASE_NAME = "sports"
OFFICIAL_DOCUMENTS_CONTAINER_NAME = "mlb"
UNOFFICIAL_PARTNER_FEEDBACK_HELPFUL_CONTAINER_NAME = "mlb-partner-feedback-helpful" 
UNOFFICIAL_PARTNER_FEEDBACK_UNHELPFUL_CONTAINER_NAME = "mlb-partner-feedback-unhelpful" 
UNOFFICIAL_USER_FEEDBACK_HELPFUL_CONTAINER_NAME = "mlb-user-feedback"
UNOFFICIAL_USER_FEEDBACK_UNHELPFUL_CONTAINER_NAME = "mlb-user-feedback-unhelpful"

# NBA Containers
NBA_OFFICIAL_DOCUMENTS_CONTAINER_NAME = "nba-official"
NBA_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME = "nba-unofficial"
MLB_UNOFFICIAL_DOCUMENTS_CONTAINER_NAME = "mlb-unofficial"

# Container display mapping for UI
CONTAINER_DISPLAY_NAMES = {
    "mlb": "MLB Official",
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
    "nba": {
        "host": POSTGRES_HOST,
        "port": POSTGRES_PORT,
        "database": "nba",
        "user": POSTGRES_USER,
        "password": POSTGRES_PASSWORD
    }
}
