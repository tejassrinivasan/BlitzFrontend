# BlitzFrontend Monorepo

This is a monorepo containing both the frontend and backend components of the BlitzFrontend application.

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

4. Create a `.env` file with your Azure Cosmos DB configuration:
   ```
   COSMOSDB_ENDPOINT=your_cosmos_db_endpoint
   ```

5. Start the FastAPI server:
   ```bash
   uvicorn backend.app.main:app 
   ```

The backend API will be available at http://localhost:8000

## Development

- The frontend is configured to proxy API requests to the backend during development
- The backend uses Azure Cosmos DB for document storage
- Both applications support hot reloading during development 