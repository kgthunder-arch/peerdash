@echo off
REM PeerDash Render Deployment Script for Windows
REM This script guides you through the deployment process

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo PeerDash Render Deployment Script
echo ==========================================
echo.

REM Check if curl is available
where curl >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: curl is required but not installed
    exit /b 1
)

echo.
echo ==========================================
echo Step 1: Provide Credentials
echo ==========================================
echo.

set /p GOOGLE_CLIENT_ID="Enter GOOGLE_CLIENT_ID: "
set /p GOOGLE_CLIENT_SECRET="Enter GOOGLE_CLIENT_SECRET: "
set /p JWT_SECRET="Enter JWT_SECRET (or press Enter to generate): "

if "!JWT_SECRET!"=="" (
    echo Generating JWT_SECRET...
    REM Note: This requires openssl to be installed
    for /f "delims=" %%i in ('openssl rand -base64 32') do set JWT_SECRET=%%i
    echo Generated JWT_SECRET: !JWT_SECRET!
)

set /p RENDER_API_KEY="Enter Render API key (from https://dashboard.render.com/account/api-tokens): "

if "!GOOGLE_CLIENT_ID!"=="" (
    echo Error: Missing GOOGLE_CLIENT_ID
    exit /b 1
)

if "!GOOGLE_CLIENT_SECRET!"=="" (
    echo Error: Missing GOOGLE_CLIENT_SECRET
    exit /b 1
)

if "!RENDER_API_KEY!"=="" (
    echo Error: Missing RENDER_API_KEY
    exit /b 1
)

echo.
echo ✓ Credentials received
echo.

echo ==========================================
echo Step 2: Create PostgreSQL Database
echo ==========================================
echo.

echo Please create PostgreSQL database manually:
echo 1. Go to https://dashboard.render.com
echo 2. Click "New +" ^> "PostgreSQL"
echo 3. Name: peerdash-db
echo 4. Database: peerdash
echo 5. User: peerdash
echo 6. Click "Create Database"
echo 7. Copy the "Internal Database URL"
echo.

set /p DATABASE_URL="Enter PostgreSQL Internal Database URL: "

if "!DATABASE_URL!"=="" (
    echo Error: Missing DATABASE_URL
    exit /b 1
)

echo.
echo ==========================================
echo Step 3: Create Redis Instance
echo ==========================================
echo.

echo Please create Redis instance manually:
echo 1. Go to https://dashboard.render.com
echo 2. Click "New +" ^> "Redis"
echo 3. Name: peerdash-redis
echo 4. Region: Same as PostgreSQL
echo 5. Click "Create Redis"
echo 6. Copy the "Internal Redis URL"
echo.

set /p REDIS_URL="Enter Redis Internal URL: "

if "!REDIS_URL!"=="" (
    echo Error: Missing REDIS_URL
    exit /b 1
)

echo.
echo ==========================================
echo Step 4: Deploy Backend
echo ==========================================
echo.

echo Please deploy backend manually:
echo 1. Go to https://dashboard.render.com
echo 2. Click "New +" ^> "Web Service"
echo 3. Select "Deploy an existing repository"
echo 4. Search for: kgthunder-arch/peerdash
echo 5. Fill in:
echo    - Name: peerdash-api
echo    - Environment: Node
echo    - Region: Same as DB and Redis
echo    - Branch: main
echo    - Build Command: npm run build
echo    - Start Command: npm start
echo    - Root Directory: apps/server
echo 6. Click "Create Web Service"
echo.

echo Environment variables to add:
echo DATABASE_URL=!DATABASE_URL!
echo REDIS_URL=!REDIS_URL!
echo NODE_ENV=production
echo PORT=3001
echo API_BASE_URL=https://peerdash-api.onrender.com
echo CORS_ORIGIN=https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
echo JWT_SECRET=!JWT_SECRET!
echo JWT_EXPIRY=15m
echo REFRESH_TOKEN_EXPIRY=7d
echo GOOGLE_CLIENT_ID=!GOOGLE_CLIENT_ID!
echo GOOGLE_CLIENT_SECRET=!GOOGLE_CLIENT_SECRET!
echo LOG_LEVEL=info
echo.

pause

echo.
echo ==========================================
echo Step 5: Run Database Migrations
echo ==========================================
echo.

echo After backend is deployed:
echo 1. Go to Web Service ^> Shell tab
echo 2. Run: cd apps/server
echo 3. Run: npx prisma migrate deploy
echo 4. Run: npx prisma generate
echo.

pause

echo.
echo ==========================================
echo Step 6: Update Frontend
echo ==========================================
echo.

echo Update Vercel environment variables:
echo 1. Go to https://vercel.com/dashboard/peerdash
echo 2. Settings ^> Environment Variables
echo 3. Update for Production:
echo    VITE_SIGNAL_SERVER_URL=https://peerdash-api.onrender.com
echo    VITE_API_URL=https://peerdash-api.onrender.com/api
echo    VITE_GOOGLE_CLIENT_ID=!GOOGLE_CLIENT_ID!
echo 4. Go to Deployments ^> Click latest ^> Redeploy
echo.

pause

echo.
echo ==========================================
echo Step 7: Configure Google OAuth
echo ==========================================
echo.

echo Add redirect URIs to Google Cloud Console:
echo 1. Go to https://console.cloud.google.com
echo 2. APIs ^& Services ^> Credentials
echo 3. Edit OAuth 2.0 Client
echo 4. Add authorized redirect URIs:
echo    - https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback
echo    - https://peerdash-api.onrender.com/api/auth/google/callback
echo 5. Save
echo.

pause

echo.
echo ==========================================
echo ✓ Deployment Complete!
echo ==========================================
echo.

echo Frontend: https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
echo Backend: https://peerdash-api.onrender.com
echo.

echo Next steps:
echo 1. Wait for backend to fully start (5 minutes)
echo 2. Test Google OAuth login
echo 3. Create a transfer
echo 4. Verify encryption (lock icon)
echo.

pause

