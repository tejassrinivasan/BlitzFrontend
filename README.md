# BlitzFrontend Monorepo

This is a monorepo containing both the frontend and backend components of the BlitzFrontend application with PostgreSQL database query functionality.

## Features

- **AI Query Interface**: Ask natural language questions and get AI-generated insights with SQL queries
- **SQL Query Runner**: Execute SQL queries directly against PostgreSQL databases with real-time results
- **Multi-Database Support**: Connect to PostgreSQL databases:
  - `mlb` (MLB Database)
  - `nba` (NBA Database)
- **Feedback Documents**: Manage and browse feedback documents from Cosmos DB

## Project Structure

```
.
├── frontend/           # React + Vite frontend application
│   ├── src/           # Frontend source code
│   ├── package.json   # Frontend dependencies
│   └── vite.config.ts # Vite configuration
│
└── backend/           # FastAPI backend application
    ├── app/          # Backend source code
    │   ├── main.py   # FastAPI application
    │   ├── models.py # Data models
    │   └── config.py # Configuration
    └── requirements.txt # Backend dependencies
```

## Getting Started

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The frontend will be available at http://localhost:5173

### Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file with your database configuration:
   ```
   # PostgreSQL Configuration
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=your_password
   
   # Azure Cosmos DB Configuration (for feedback documents)
   COSMOSDB_ENDPOINT=your_cosmos_db_endpoint
   
   # Optional: Redis for caching
   REDIS_URL=redis://localhost:6379
   
   # Optional: Azure OpenAI for AI features
   AZURE_OPENAI_API_KEY=your_openai_api_key
   ```

5. Start the FastAPI server:
   ```bash
   uvicorn backend.app.main:app 
   ```

The backend API will be available at http://localhost:8000

## Database Setup

### PostgreSQL Databases

You need to have two PostgreSQL databases set up:

1. `mlb` - MLB database containing baseball data
2. `nba` - NBA database containing basketball data

Each database should be accessible using the credentials specified in your `.env` file.

### Cosmos DB Containers

The feedback documents are stored in Cosmos DB containers:
- `mlb` - MLB Official feedback documents
- `mlb-unofficial` - MLB Unofficial feedback documents
- `nba-official` - NBA Official feedback documents
- `nba-unofficial` - NBA Unofficial feedback documents

## API Endpoints

### PostgreSQL Query Endpoints

- `GET /api/databases` - Get list of available databases
- `POST /api/query` - Execute SQL query against selected database
- `GET /api/databases/{database}/test` - Test connection to specific database
- `GET /api/databases/{database}/tables` - Get list of tables in database

### Feedback Document Endpoints

- `GET /api/feedback/documents` - Get feedback documents from Cosmos DB
- `POST /api/feedback/documents` - Create new feedback document
- `PUT /api/feedback/documents/{id}` - Update existing feedback document
- `DELETE /api/feedback/documents/{id}` - Delete feedback document

## Usage

### AI Query Interface

1. Navigate to the "AI Query Interface" tab
2. Enter a natural language question about sports data
3. Click "Generate Insights" or "Start Conversation" 
4. Copy any generated SQL queries to the SQL Query Runner tab

### SQL Query Runner

1. Navigate to the "SQL Query Runner" tab
2. Select your target database from the dropdown
3. Enter your SQL query in the text area
4. Click "Run Query" to execute and view results

## Development

- The frontend is configured to proxy API requests to the backend during development
- The backend uses PostgreSQL for sports data and Azure Cosmos DB for document storage
- Both applications support hot reloading during development 