import time
import json
import uuid
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import StreamingResponse
import logging

# Set up logger
logger = logging.getLogger("api_requests")
logger.setLevel(logging.INFO)

# Create console handler if it doesn't exist
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

async def log_requests_middleware(request: Request, call_next: Callable) -> Response:
    """
    Middleware to log all incoming requests and outgoing responses.
    Captures request details, response details, and timing information.
    """
    # Generate unique request ID
    request_id = str(uuid.uuid4())[:8]
    
    # Capture request start time
    start_time = time.time()
    
    # Extract request information
    request_info = {
        "request_id": request_id,
        "method": request.method,
        "url": str(request.url),
        "path": request.url.path,
        "query_params": dict(request.query_params),
        "headers": dict(request.headers),
        "client_ip": request.client.host if request.client else "unknown",
        "user_agent": request.headers.get("user-agent", "unknown"),
        "timestamp": time.time()
    }
    
    # Try to read request body for POST/PUT requests
    request_body = None
    if request.method in ["POST", "PUT", "PATCH"]:
        try:
            # Read the body
            body_bytes = await request.body()
            if body_bytes:
                # Try to parse as JSON, fallback to string
                try:
                    request_body = json.loads(body_bytes.decode())
                except (json.JSONDecodeError, UnicodeDecodeError):
                    request_body = body_bytes.decode('utf-8', errors='ignore')[:1000]  # Limit size
                    
            # Re-create request with body for downstream processing
            # This is necessary because request.body() can only be called once
            from fastapi import FastAPI
            from starlette.requests import Request as StarletteRequest
            
            async def receive():
                return {"type": "http.request", "body": body_bytes}
            
            request._receive = receive
            
        except Exception as e:
            logger.warning(f"Failed to read request body: {e}")
            request_body = f"Error reading body: {str(e)}"
    
    request_info["body"] = request_body
    
    # Log the incoming request
    logger.info(f"REQUEST - {request_info['method']} {request_info['path']} - ID: {request_id}")
    logger.debug(f"REQUEST_DETAILS - {json.dumps(request_info, default=str, indent=2)}")
    
    try:
        # Process the request
        response = await call_next(request)
        
        # Calculate processing time
        process_time = time.time() - start_time
        
        # Extract response information
        response_info = {
            "request_id": request_id,
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "processing_time_ms": round(process_time * 1000, 2),
            "timestamp": time.time()
        }
        
        # Try to capture response body for small responses
        response_body = None
        if hasattr(response, 'body') and response.body:
            try:
                # Only log small response bodies to avoid memory issues
                if len(response.body) < 10000:  # 10KB limit
                    try:
                        response_body = json.loads(response.body.decode())
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        response_body = response.body.decode('utf-8', errors='ignore')[:1000]
                else:
                    response_body = f"Response too large ({len(response.body)} bytes)"
            except Exception as e:
                response_body = f"Error reading response: {str(e)}"
        
        response_info["body"] = response_body
        
        # Log the response
        status_level = "INFO" if response.status_code < 400 else "WARNING" if response.status_code < 500 else "ERROR"
        logger.log(
            getattr(logging, status_level),
            f"RESPONSE - {request_info['method']} {request_info['path']} - {response.status_code} - {process_time*1000:.2f}ms - ID: {request_id}"
        )
        logger.debug(f"RESPONSE_DETAILS - {json.dumps(response_info, default=str, indent=2)}")
        
        # Add request ID to response headers for debugging
        response.headers["X-Request-ID"] = request_id
        
        return response
        
    except Exception as e:
        # Log any errors that occur during request processing
        process_time = time.time() - start_time
        error_info = {
            "request_id": request_id,
            "error": str(e),
            "error_type": type(e).__name__,
            "processing_time_ms": round(process_time * 1000, 2),
            "timestamp": time.time()
        }
        
        logger.error(f"ERROR - {request_info['method']} {request_info['path']} - {str(e)} - {process_time*1000:.2f}ms - ID: {request_id}")
        logger.debug(f"ERROR_DETAILS - {json.dumps(error_info, default=str, indent=2)}")
        
        # Re-raise the exception to be handled by FastAPI
        raise

# Utility function to get detailed request info for debugging
def get_request_summary(request: Request) -> dict:
    """Get a summary of request details for debugging purposes."""
    return {
        "method": request.method,
        "url": str(request.url),
        "path": request.url.path,
        "query_params": dict(request.query_params),
        "headers": {k: v for k, v in request.headers.items() if k.lower() not in ['authorization', 'cookie']},
        "client": request.client.host if request.client else "unknown"
    } 