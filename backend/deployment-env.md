# 🚀 Production Environment Configuration

## Required Environment Variables for OpenAI Fix

Add these environment variables to your Render.com (or other hosting service) deployment:

### **Azure OpenAI Configuration (embeddings for official containers)**

Embeddings are **on automatically** when `AZURE_OPENAI_API_KEY` is set. They populate `UserPromptVector` / `QueryVector` for semantic search. Document save still succeeds if OpenAI is temporarily unreachable.

```bash
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://blitz-foundry.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=text-embedding-ada-002
AZURE_OPENAI_API_VERSION=2024-02-01

# Optional: force off even when API key is set
# AZURE_OPENAI_EMBEDDINGS_ENABLED=false
```

### **Other Required Variables**
```bash
# Cosmos DB
COSMOSDB_ENDPOINT=https://blitz-queries.documents.azure.com:443/
COSMOSDB_KEY=your_cosmos_key_here
DATABASE_NAME=sports

# PostgreSQL
POSTGRES_HOST=your_postgres_host
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_PORT=5432

# Optional - Redis for caching
REDIS_URL=redis://user:password@host:port
```

## 🔧 Key Changes Made to Fix OpenAI Issues:

### **1. Updated API Version**
- Changed from `2025-03-01-preview` to `2024-02-01` (stable version)
- Preview versions can be unreliable in production

### **2. Added Proper Timeout Configuration**
- Default timeout: 30 seconds
- Configurable via `AZURE_OPENAI_TIMEOUT` env var

### **3. Enhanced Retry Logic**
- Exponential backoff: 1s, 2s, 4s delays
- Max retries configurable via `AZURE_OPENAI_MAX_RETRIES`
- Better error classification and handling

### **4. Improved Error Handling**
- Distinguish between connection, auth, and rate limit errors
- Don't retry authentication errors
- Proper logging for debugging

### **5. Input Validation**
- Text truncation for long inputs
- Empty text handling
- Response validation

## 🔍 Debugging Steps:

### **1. Check Your Environment Variables**
```bash
# In your deployment dashboard, verify these are set:
echo $AZURE_OPENAI_API_KEY
echo $AZURE_OPENAI_ENDPOINT
echo $AZURE_OPENAI_API_VERSION
```

### **2. Test Your Azure OpenAI Service**
```bash
# Test if your endpoint is reachable
curl -H "api-key: $AZURE_OPENAI_API_KEY" \
     "https://blitzgpt.openai.azure.com/openai/deployments/text-embedding-ada-002?api-version=2024-02-01"
```

### **3. Check Azure OpenAI Service Status**
- Visit Azure Portal → Your OpenAI Resource
- Check if service is running and has quota
- Verify deployment name matches `AZURE_OPENAI_DEPLOYMENT`

### **4. Monitor Logs**
The new logging will show:
```
INFO: Creating Azure OpenAI client - Endpoint: https://... API Version: 2024-02-01
INFO: Generating embedding (attempt 1/3)
INFO: Successfully generated embedding with 1536 dimensions
```

## 🚨 Common Issues & Solutions:

### **Issue: "Connection error"**
- **Cause**: Network timeout or service unavailability
- **Solution**: Check AZURE_OPENAI_TIMEOUT (increase to 60s if needed)

### **Issue: "Authentication error"**
- **Cause**: Invalid API key or wrong endpoint
- **Solution**: Verify AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT

### **Issue: "Rate limit exceeded"**
- **Cause**: Too many concurrent requests
- **Solution**: Check Azure OpenAI quota and rate limits

### **Issue: "Invalid deployment"**
- **Cause**: Wrong model deployment name
- **Solution**: Verify AZURE_OPENAI_DEPLOYMENT matches your Azure deployment

## 📊 Recommended Production Settings:

```bash
# Conservative settings for production reliability
AZURE_OPENAI_TIMEOUT=45.0
AZURE_OPENAI_MAX_RETRIES=5
AZURE_OPENAI_API_VERSION=2024-02-01
```

After updating these environment variables in your production deployment, restart your service and the OpenAI connection errors should be resolved.