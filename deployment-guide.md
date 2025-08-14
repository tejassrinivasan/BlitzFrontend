# 🚀 BlitzFrontend Deployment Guide

## Overview
Your application consists of:
- **Frontend**: React + TypeScript + Vite + Chakra UI
- **Backend**: FastAPI with Azure Cosmos DB, PostgreSQL, Redis, OpenAI integration
- **Architecture**: Separate frontend/backend services

## 🌐 Option 1: Web Application (Recommended)

### Quick Deploy Setup

#### **Frontend (Vercel) - 5 minutes**
```bash
# 1. Build the frontend
cd frontend
npm run build

# 2. Install Vercel CLI
npm i -g vercel

# 3. Deploy
vercel --prod
```

#### **Backend (Railway) - 10 minutes**
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and deploy
railway login
railway deploy

# 3. Set environment variables in Railway dashboard:
# - COSMOSDB_ENDPOINT
# - DATABASE_URL (PostgreSQL)
# - OPENAI_ENDPOINT
# - etc.
```

### Environment Variables Needed:
```env
# Backend (.env)
COSMOSDB_ENDPOINT=your_cosmos_endpoint
DATABASE_URL=postgresql://user:pass@host:port/db
OPENAI_ENDPOINT=your_openai_endpoint
OPENAI_API_VERSION=2023-05-15
OPENAI_DEPLOYMENT=your_deployment_name
REDIS_URL=redis://user:pass@host:port
```

## 🐳 Option 2: Docker Containerization

### Create Dockerfiles:

#### **Backend Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### **Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### **Docker Compose:**
```yaml
version: '3.8'
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
      
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - COSMOSDB_ENDPOINT=${COSMOSDB_ENDPOINT}
    depends_on:
      - postgres
      - redis
      
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: blitzdb
      POSTGRES_USER: blitzuser
      POSTGRES_PASSWORD: blitzpass
    volumes:
      - postgres_data:/var/lib/postgresql/data
      
  redis:
    image: redis:alpine
    
volumes:
  postgres_data:
```

## 💻 Option 3: Desktop Application (Electron)

Convert your React app to a desktop application:

### Setup Electron:
```bash
cd frontend
npm install electron electron-builder --save-dev
```

### Add to package.json:
```json
{
  "main": "electron.js",
  "scripts": {
    "electron": "electron .",
    "electron-dev": "ELECTRON_DEV=true electron .",
    "dist": "electron-builder"
  },
  "build": {
    "appId": "com.yourcompany.blitzfrontend",
    "productName": "Blitz Frontend",
    "directories": {
      "output": "dist"
    },
    "files": [
      "dist/**/*",
      "electron.js"
    ]
  }
}
```

### Create electron.js:
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const isDev = process.env.ELECTRON_DEV;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(createWindow);
```

## 🏗️ Option 4: All-in-One Solutions

### **Easiest: Single VPS/Server**
```bash
# Deploy everything on one server (DigitalOcean, Linode, etc.)
# Use nginx to serve frontend + proxy to backend
# Run PostgreSQL + Redis locally on server
```

### **Enterprise: Kubernetes**
```yaml
# For larger scale deployments
# Create k8s manifests for each service
# Use managed databases (Azure PostgreSQL, etc.)
```

## 📊 Deployment Comparison

| Option | Complexity | Cost | Scalability | Best For |
|--------|------------|------|-------------|----------|
| Web App (Vercel + Railway) | ⭐ | $$ | ⭐⭐⭐ | Most users |
| Docker Compose | ⭐⭐ | $ | ⭐⭐ | Self-hosting |
| Electron Desktop | ⭐⭐⭐ | $ | ⭐ | Offline use |
| Single VPS | ⭐⭐ | $ | ⭐⭐ | Small teams |
| Kubernetes | ⭐⭐⭐⭐⭐ | $$$ | ⭐⭐⭐⭐⭐ | Enterprise |

## 🎯 Recommended Path:

### **For Sharing with Others:**
1. **Start with Web App deployment** (Vercel + Railway)
2. **Set up proper environment variables**
3. **Share the URL** - anyone can access instantly!

### **For Production:**
1. **Use managed databases** (don't self-host PostgreSQL/Redis)
2. **Set up proper domain** (your-app.com)
3. **Add authentication** if needed
4. **Monitor with services** like Sentry, DataDog

## 🔧 Quick Start Commands:

```bash
# Test production build locally first
cd frontend && npm run build && npm run preview
cd ../backend && uvicorn app.main:app --reload

# Deploy to web (after setting up accounts)
cd frontend && vercel --prod
cd ../backend && railway deploy
```

## 💡 Pro Tips:
- **Start simple**: Deploy to web first, then optimize
- **Use managed services**: Don't self-host databases initially  
- **Environment variables**: Keep secrets secure
- **Monitor**: Set up basic logging/monitoring
- **Domain**: Buy a custom domain for professional appearance

Would you like me to help you set up any of these deployment options? 