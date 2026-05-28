#!/bin/bash

# PeerDash Render Deployment Script
# This script automates the deployment process

set -e

echo "=========================================="
echo "PeerDash Render Deployment Script"
echo "=========================================="
echo ""

# Check if required tools are installed
check_requirements() {
    echo "Checking requirements..."
    
    if ! command -v curl &> /dev/null; then
        echo "❌ curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo "⚠️  jq is recommended for JSON parsing"
        echo "   Install with: brew install jq"
    fi
    
    echo "✅ Requirements met"
}

# Get user input
get_credentials() {
    echo ""
    echo "=========================================="
    echo "Step 1: Provide Credentials"
    echo "=========================================="
    echo ""
    
    read -p "Enter GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
    read -sp "Enter GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
    echo ""
    read -sp "Enter JWT_SECRET (or press Enter to generate): " JWT_SECRET
    echo ""
    
    if [ -z "$JWT_SECRET" ]; then
        JWT_SECRET=$(openssl rand -base64 32)
        echo "Generated JWT_SECRET: $JWT_SECRET"
    fi
    
    read -p "Enter your Render API key (from https://dashboard.render.com/account/api-tokens): " RENDER_API_KEY
    
    if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ] || [ -z "$RENDER_API_KEY" ]; then
        echo "❌ Missing required credentials"
        exit 1
    fi
    
    echo "✅ Credentials received"
}

# Create PostgreSQL database
create_postgres() {
    echo ""
    echo "=========================================="
    echo "Step 2: Creating PostgreSQL Database"
    echo "=========================================="
    echo ""
    
    echo "Creating PostgreSQL database on Render..."
    
    POSTGRES_RESPONSE=$(curl -s -X POST https://api.render.com/v1/services \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "type": "pserv",
            "name": "peerdash-db",
            "plan": "free",
            "region": "oregon"
        }')
    
    POSTGRES_ID=$(echo $POSTGRES_RESPONSE | jq -r '.service.id' 2>/dev/null || echo "")
    
    if [ -z "$POSTGRES_ID" ] || [ "$POSTGRES_ID" = "null" ]; then
        echo "⚠️  Could not create PostgreSQL via API"
        echo "   Please create manually at: https://dashboard.render.com"
        echo "   Name: peerdash-db"
        read -p "Enter PostgreSQL Internal Database URL: " DATABASE_URL
    else
        echo "✅ PostgreSQL database created: $POSTGRES_ID"
        DATABASE_URL="postgresql://peerdash:password@$POSTGRES_ID.c.render.com:5432/peerdash"
    fi
}

# Create Redis instance
create_redis() {
    echo ""
    echo "=========================================="
    echo "Step 3: Creating Redis Instance"
    echo "=========================================="
    echo ""
    
    echo "Creating Redis instance on Render..."
    
    REDIS_RESPONSE=$(curl -s -X POST https://api.render.com/v1/services \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "type": "redis",
            "name": "peerdash-redis",
            "plan": "free",
            "region": "oregon"
        }')
    
    REDIS_ID=$(echo $REDIS_RESPONSE | jq -r '.service.id' 2>/dev/null || echo "")
    
    if [ -z "$REDIS_ID" ] || [ "$REDIS_ID" = "null" ]; then
        echo "⚠️  Could not create Redis via API"
        echo "   Please create manually at: https://dashboard.render.com"
        echo "   Name: peerdash-redis"
        read -p "Enter Redis Internal URL: " REDIS_URL
    else
        echo "✅ Redis instance created: $REDIS_ID"
        REDIS_URL="redis://default:password@$REDIS_ID.c.render.com:6379"
    fi
}

# Deploy backend
deploy_backend() {
    echo ""
    echo "=========================================="
    echo "Step 4: Deploying Backend"
    echo "=========================================="
    echo ""
    
    echo "Deploying backend Web Service..."
    
    BACKEND_RESPONSE=$(curl -s -X POST https://api.render.com/v1/services \
        -H "Authorization: Bearer $RENDER_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"type\": \"web_service\",
            \"name\": \"peerdash-api\",
            \"plan\": \"free\",
            \"region\": \"oregon\",
            \"repo\": \"https://github.com/kgthunder-arch/peerdash\",
            \"branch\": \"main\",
            \"buildCommand\": \"npm run build\",
            \"startCommand\": \"npm start\",
            \"rootDir\": \"apps/server\",
            \"envVars\": [
                {\"key\": \"DATABASE_URL\", \"value\": \"$DATABASE_URL\"},
                {\"key\": \"REDIS_URL\", \"value\": \"$REDIS_URL\"},
                {\"key\": \"NODE_ENV\", \"value\": \"production\"},
                {\"key\": \"PORT\", \"value\": \"3001\"},
                {\"key\": \"API_BASE_URL\", \"value\": \"https://peerdash-api.onrender.com\"},
                {\"key\": \"CORS_ORIGIN\", \"value\": \"https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app\"},
                {\"key\": \"JWT_SECRET\", \"value\": \"$JWT_SECRET\"},
                {\"key\": \"JWT_EXPIRY\", \"value\": \"15m\"},
                {\"key\": \"REFRESH_TOKEN_EXPIRY\", \"value\": \"7d\"},
                {\"key\": \"GOOGLE_CLIENT_ID\", \"value\": \"$GOOGLE_CLIENT_ID\"},
                {\"key\": \"GOOGLE_CLIENT_SECRET\", \"value\": \"$GOOGLE_CLIENT_SECRET\"},
                {\"key\": \"LOG_LEVEL\", \"value\": \"info\"}
            ]
        }")
    
    BACKEND_ID=$(echo $BACKEND_RESPONSE | jq -r '.service.id' 2>/dev/null || echo "")
    
    if [ -z "$BACKEND_ID" ] || [ "$BACKEND_ID" = "null" ]; then
        echo "⚠️  Could not deploy via API"
        echo "   Please deploy manually at: https://dashboard.render.com"
        echo "   Repository: kgthunder-arch/peerdash"
        echo "   Root Directory: apps/server"
        read -p "Enter backend URL (e.g., https://peerdash-api.onrender.com): " BACKEND_URL
    else
        echo "✅ Backend deployed: $BACKEND_ID"
        BACKEND_URL="https://peerdash-api.onrender.com"
    fi
}

# Update frontend
update_frontend() {
    echo ""
    echo "=========================================="
    echo "Step 5: Updating Frontend"
    echo "=========================================="
    echo ""
    
    echo "Frontend environment variables to update in Vercel:"
    echo ""
    echo "VITE_SIGNAL_SERVER_URL=$BACKEND_URL"
    echo "VITE_API_URL=$BACKEND_URL/api"
    echo "VITE_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
    echo ""
    echo "1. Go to https://vercel.com/dashboard/peerdash"
    echo "2. Settings → Environment Variables"
    echo "3. Update the above variables"
    echo "4. Redeploy"
    echo ""
    read -p "Press Enter when done..."
}

# Configure OAuth
configure_oauth() {
    echo ""
    echo "=========================================="
    echo "Step 6: Configure Google OAuth"
    echo "=========================================="
    echo ""
    
    echo "Add these redirect URIs to Google Cloud Console:"
    echo ""
    echo "https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback"
    echo "https://peerdash-api.onrender.com/api/auth/google/callback"
    echo ""
    echo "1. Go to https://console.cloud.google.com"
    echo "2. APIs & Services → Credentials"
    echo "3. Edit OAuth 2.0 Client"
    echo "4. Add the above URIs"
    echo "5. Save"
    echo ""
    read -p "Press Enter when done..."
}

# Test deployment
test_deployment() {
    echo ""
    echo "=========================================="
    echo "Step 7: Testing Deployment"
    echo "=========================================="
    echo ""
    
    echo "Testing backend..."
    if curl -s -f https://peerdash-api.onrender.com/health > /dev/null 2>&1; then
        echo "✅ Backend is responding"
    else
        echo "⚠️  Backend may still be starting up"
        echo "   Check logs at: https://dashboard.render.com"
    fi
    
    echo ""
    echo "Testing frontend..."
    if curl -s -f https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app > /dev/null 2>&1; then
        echo "✅ Frontend is responding"
    else
        echo "⚠️  Frontend may have issues"
        echo "   Check logs at: https://vercel.com/dashboard/peerdash"
    fi
}

# Main execution
main() {
    check_requirements
    get_credentials
    create_postgres
    create_redis
    deploy_backend
    update_frontend
    configure_oauth
    test_deployment
    
    echo ""
    echo "=========================================="
    echo "✅ Deployment Complete!"
    echo "=========================================="
    echo ""
    echo "Frontend: https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app"
    echo "Backend: https://peerdash-api.onrender.com"
    echo ""
    echo "Next steps:"
    echo "1. Wait for backend to fully start (5 minutes)"
    echo "2. Test Google OAuth login"
    echo "3. Create a transfer"
    echo "4. Verify encryption (lock icon)"
    echo ""
}

main

