import psycopg2
import psycopg2.extras
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from typing import Dict, List, Any, Optional
import logging
from datetime import timedelta
from decimal import Decimal
from .config import AVAILABLE_DATABASES

logger = logging.getLogger(__name__)

class PostgresService:
    def __init__(self):
        self.engines = {}
        self.sessions = {}
        self._initialize_engines()
    
    def _convert_value(self, value: Any) -> Any:
        """Convert PostgreSQL data types to JSON-serializable formats."""
        if value is None:
            return None
        
        # Handle interval/timedelta objects
        if isinstance(value, timedelta):
            total_seconds = int(value.total_seconds())
            
            # Convert to a readable format
            if total_seconds < 60:
                return f"{total_seconds}s"
            elif total_seconds < 3600:
                minutes = total_seconds // 60
                seconds = total_seconds % 60
                if seconds == 0:
                    return f"{minutes}m"
                else:
                    return f"{minutes}m {seconds}s"
            else:
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                seconds = total_seconds % 60
                
                if minutes == 0 and seconds == 0:
                    return f"{hours}h"
                elif seconds == 0:
                    return f"{hours}h {minutes}m"
                else:
                    return f"{hours}h {minutes}m {seconds}s"
        
        # Handle Decimal objects
        if isinstance(value, Decimal):
            return float(value)
        
        # For other types, return as-is (they should be JSON-serializable)
        return value
    
    def _initialize_engines(self):
        """Initialize SQLAlchemy engines for each database."""
        for db_name, config in AVAILABLE_DATABASES.items():
            try:
                connection_string = (
                    f"postgresql://{config['user']}:{config['password']}@"
                    f"{config['host']}:{config['port']}/{config['database']}"
                )
                self.engines[db_name] = create_engine(connection_string, pool_pre_ping=True)
                logger.info(f"Initialized engine for database: {db_name}")
            except Exception as e:
                logger.error(f"Failed to initialize engine for {db_name}: {e}")
    
    def get_available_databases(self) -> List[str]:
        """Get list of available database names."""
        return list(AVAILABLE_DATABASES.keys())
    
    def validate_database(self, database: str) -> bool:
        """Validate if the database is available."""
        return database in AVAILABLE_DATABASES
    
    def execute_query(self, database: str, query: str) -> Dict[str, Any]:
        """Execute a SQL query against the specified database."""
        if not self.validate_database(database):
            raise ValueError(f"Invalid database: {database}")
        
        if database not in self.engines:
            raise ValueError(f"Engine not available for database: {database}")
        
        try:
            engine = self.engines[database]
            with engine.connect() as connection:
                # Execute the query
                result = connection.execute(text(query))
                
                # Fetch all results
                if result.returns_rows:
                    columns = list(result.keys())
                    rows = result.fetchall()
                    
                    # Convert rows to list of dictionaries
                    data = []
                    for row in rows:
                        row_dict = {}
                        for i, column in enumerate(columns):
                            row_dict[column] = self._convert_value(row[i])
                        data.append(row_dict)
                    
                    return {
                        "success": True,
                        "data": data,
                        "columns": columns,
                        "row_count": len(data),
                        "query": query,
                        "database": database
                    }
                else:
                    # For non-SELECT queries (INSERT, UPDATE, DELETE, etc.)
                    return {
                        "success": True,
                        "data": [],
                        "columns": [],
                        "row_count": result.rowcount,
                        "query": query,
                        "database": database,
                        "message": f"Query executed successfully. {result.rowcount} rows affected."
                    }
                    
        except Exception as e:
            logger.error(f"Error executing query on {database}: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": query,
                "database": database
            }
    
    def test_connection(self, database: str) -> Dict[str, Any]:
        """Test connection to a specific database."""
        if not self.validate_database(database):
            return {"success": False, "error": f"Invalid database: {database}"}
        
        try:
            engine = self.engines[database]
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return {"success": True, "database": database}
        except Exception as e:
            logger.error(f"Connection test failed for {database}: {e}")
            return {"success": False, "error": str(e), "database": database}
    
    def get_tables(self, database: str) -> Dict[str, Any]:
        """Get list of tables in the specified database."""
        if not self.validate_database(database):
            return {"success": False, "error": f"Invalid database: {database}"}
        
        query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
        """
        
        return self.execute_query(database, query)

# Global instance
postgres_service = PostgresService() 