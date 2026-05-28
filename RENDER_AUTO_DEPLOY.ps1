# PeerDash Render Deployment Script for PowerShell
# Run this script to deploy your backend to Render

param(
    [string]$GoogleClientId = "",
    [string]$GoogleClientSecret = "",
    [string]$RenderApiKey = "",
    [string]$JwtSecret = ""
)

Write-Host ""
Write-Host "=========================================="
Write-Host "PeerDash Render Deployment Script"
Write-Host "=========================================="
Write-Host ""

# Function to get credentials
function Get-Credentials {
    Write-Host "Step 1: Provide Credentials"
    Write-Host "=========================================="
    Write-Host ""
    
    if ([string]::IsNullOrEmpty($GoogleClientId)) {
        $GoogleClientId = Read-Host "Enter GOOGLE_CLIENT_ID"
    }
    
    if ([string]::IsNullOrEmpty($GoogleClientSecret)) {
        $GoogleClientSecret = Read-Host "Enter GOOGLE_CLIENT_SECRET" -AsSecureString
        $GoogleClientSecret = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemAlloc($GoogleClientSecret))
    }
    
    if ([string]::IsNullOrEmpty($RenderApiKey)) {
        $RenderApiKey = Read-Host "Enter RENDER_API_KEY (from https://dashboard.render.com/account/api-tokens)" -AsSecureString
        $RenderApiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemAlloc($RenderApiKey))
    }
    
    if ([string]::IsNullOrEmpty($JwtSecret)) {
        $generateJwt = Read-Host "Generate JWT_SECRET? (Y/n)"
        if ($generateJwt -ne "n") {
            # Generate random JWT secret
            $bytes = New-Object byte[] 32
            $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
            $rng.GetBytes($bytes)
            $JwtSecret = [Convert]::ToBase64String($bytes)
            Write-Host "Generated JWT_SECRET: $JwtSecret"
        } else {
            $JwtSecret = Read-Host "Enter JWT_SECRET"
        }
    }
    
    if ([string]::IsNullOrEmpty($GoogleClientId) -or [string]::IsNullOrEmpty($GoogleClientSecret) -or [string]::IsNullOrEmpty($RenderApiKey)) {
        Write-Host "Error: Missing required credentials"
        exit 1
    }
    
    Write-Host "✓ Credentials received"
    Write-Host ""
    
    return @{
        GoogleClientId = $GoogleClientId
        GoogleClientSecret = $GoogleClientSecret
        RenderApiKey = $RenderApiKey
        JwtSecret = $JwtSecret
    }
}

# Function to create PostgreSQL
function New-PostgresDatabase {
    param($ApiKey)
    
    Write-Host ""
    Write-Host "Step 2: Creating PostgreSQL Database"
    Write-Host "=========================================="
    Write-Host ""
    
    Write-Host "Creating PostgreSQL database on Render..."
    
    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }
        
        $body = @{
            type = "pserv"
            name = "peerdash-db"
            plan = "free"
            region = "oregon"
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
            -Method Post `
            -Headers $headers `
            -Body $body `
            -ErrorAction SilentlyContinue
        
        if ($response -and $response.service.id) {
            Write-Host "✓ PostgreSQL database created: $($response.service.id)"
            return $response.service.id
        }
    } catch {
        Write-Host "⚠ Could not create PostgreSQL via API"
    }
    
    Write-Host "Please create PostgreSQL manually:"
    Write-Host "1. Go to https://dashboard.render.com"
    Write-Host "2. Click 'New +' > 'PostgreSQL'"
    Write-Host "3. Name: peerdash-db"
    Write-Host "4. Database: peerdash"
    Write-Host "5. User: peerdash"
    Write-Host "6. Click 'Create Database'"
    Write-Host "7. Copy the 'Internal Database URL'"
    Write-Host ""
    
    $databaseUrl = Read-Host "Enter PostgreSQL Internal Database URL"
    return $databaseUrl
}

# Function to create Redis
function New-RedisInstance {
    param($ApiKey)
    
    Write-Host ""
    Write-Host "Step 3: Creating Redis Instance"
    Write-Host "=========================================="
    Write-Host ""
    
    Write-Host "Creating Redis instance on Render..."
    
    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }
        
        $body = @{
            type = "redis"
            name = "peerdash-redis"
            plan = "free"
            region = "oregon"
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
            -Method Post `
            -Headers $headers `
            -Body $body `
            -ErrorAction SilentlyContinue
        
        if ($response -and $response.service.id) {
            Write-Host "✓ Redis instance created: $($response.service.id)"
            return $response.service.id
        }
    } catch {
        Write-Host "⚠ Could not create Redis via API"
    }
    
    Write-Host "Please create Redis manually:"
    Write-Host "1. Go to https://dashboard.render.com"
    Write-Host "2. Click 'New +' > 'Redis'"
    Write-Host "3. Name: peerdash-redis"
    Write-Host "4. Region: Same as PostgreSQL"
    Write-Host "5. Click 'Create Redis'"
    Write-Host "6. Copy the 'Internal Redis URL'"
    Write-Host ""
    
    $redisUrl = Read-Host "Enter Redis Internal URL"
    return $redisUrl
}

# Function to deploy backend
function New-BackendService {
    param($ApiKey, $DatabaseUrl, $RedisUrl, $GoogleClientId, $GoogleClientSecret, $JwtSecret)
    
    Write-Host ""
    Write-Host "Step 4: Deploying Backend"
    Write-Host "=========================================="
    Write-Host ""
    
    Write-Host "Deploying backend Web Service..."
    
    try {
        $headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type" = "application/json"
        }
        
        $envVars = @(
            @{ key = "DATABASE_URL"; value = $DatabaseUrl }
            @{ key = "REDIS_URL"; value = $RedisUrl }
            @{ key = "NODE_ENV"; value = "production" }
            @{ key = "PORT"; value = "3001" }
            @{ key = "API_BASE_URL"; value = "https://peerdash-api.onrender.com" }
            @{ key = "CORS_ORIGIN"; value = "https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app" }
            @{ key = "JWT_SECRET"; value = $JwtSecret }
            @{ key = "JWT_EXPIRY"; value = "15m" }
            @{ key = "REFRESH_TOKEN_EXPIRY"; value = "7d" }
            @{ key = "GOOGLE_CLIENT_ID"; value = $GoogleClientId }
            @{ key = "GOOGLE_CLIENT_SECRET"; value = $GoogleClientSecret }
            @{ key = "LOG_LEVEL"; value = "info" }
        )
        
        $body = @{
            type = "web_service"
            name = "peerdash-api"
            plan = "free"
            region = "oregon"
            repo = "https://github.com/kgthunder-arch/peerdash"
            branch = "main"
            buildCommand = "npm run build"
            startCommand = "npm start"
            rootDir = "apps/server"
            envVars = $envVars
        } | ConvertTo-Json -Depth 10
        
        $response = Invoke-RestMethod -Uri "https://api.render.com/v1/services" `
            -Method Post `
            -Headers $headers `
            -Body $body `
            -ErrorAction SilentlyContinue
        
        if ($response -and $response.service.id) {
            Write-Host "✓ Backend deployed: $($response.service.id)"
            return $response.service.id
        }
    } catch {
        Write-Host "⚠ Could not deploy via API"
    }
    
    Write-Host "Please deploy backend manually:"
    Write-Host "1. Go to https://dashboard.render.com"
    Write-Host "2. Click 'New +' > 'Web Service'"
    Write-Host "3. Select 'Deploy an existing repository'"
    Write-Host "4. Search for: kgthunder-arch/peerdash"
    Write-Host "5. Fill in:"
    Write-Host "   - Name: peerdash-api"
    Write-Host "   - Environment: Node"
    Write-Host "   - Region: Same as DB and Redis"
    Write-Host "   - Branch: main"
    Write-Host "   - Build Command: npm run build"
    Write-Host "   - Start Command: npm start"
    Write-Host "   - Root Directory: apps/server"
    Write-Host "6. Click 'Create Web Service'"
    Write-Host ""
    Write-Host "Environment variables to add:"
    Write-Host "DATABASE_URL=$DatabaseUrl"
    Write-Host "REDIS_URL=$RedisUrl"
    Write-Host "NODE_ENV=production"
    Write-Host "PORT=3001"
    Write-Host "API_BASE_URL=https://peerdash-api.onrender.com"
    Write-Host "CORS_ORIGIN=https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app"
    Write-Host "JWT_SECRET=$JwtSecret"
    Write-Host "JWT_EXPIRY=15m"
    Write-Host "REFRESH_TOKEN_EXPIRY=7d"
    Write-Host "GOOGLE_CLIENT_ID=$GoogleClientId"
    Write-Host "GOOGLE_CLIENT_SECRET=$GoogleClientSecret"
    Write-Host "LOG_LEVEL=info"
    Write-Host ""
    
    Read-Host "Press Enter when backend is deployed"
    return "peerdash-api"
}

# Function to run migrations
function Invoke-Migrations {
    Write-Host ""
    Write-Host "Step 5: Run Database Migrations"
    Write-Host "=========================================="
    Write-Host ""
    
    Write-Host "After backend is deployed:"
    Write-Host "1. Go to Web Service > Shell tab"
    Write-Host "2. Run: cd apps/server"
    Write-Host "3. Run: npx prisma migrate deploy"
    Write-Host "4. Run: npx prisma generate"
    Write-Host ""
    
    Read-Host "Press Enter when migrations are complete"
}

# Function to update frontend
function Update-Frontend {
    param($GoogleClientId)
    
    Write-Host ""
    Write-Host "Step 6: Update Frontend"
    Write-Host "=========================================="
    Write-Host ""
    
    Write-Host "Update Vercel environment variables:"
    Write-Host "1. Go to https://vercel.com/dashboard/peerdash"
    Write-Host "2. Settings > Environment Variables"
    Write-Host "3. Update for Production:"
    Write-Host "   VITE_SIGNAL_SERVER_URL=https://peerdash-api.onrender.com"
    Write-Host "   VITE_API_URL=https://peerdash-api.onrender.com/api"
    Write-Host "   VITE_GOOGLE_CLIENT_ID=$GoogleClientId"
    Write-Host "4. Go to Deployments > Click latest > Redeploy"
    Write-Host ""
    
    Read-Host "Press Enter when frontend is updated"
}

# Function to configure OAuth
function Configure-OAuth {
    Write-Host ""
    Write-Host "Step 7: Configure Google OAuth"
    Write-Host "=========================================="
    Write-Host ""
    
    Write-Host "Add redirect URIs to Google Cloud Console:"
    Write-Host "1. Go to https://console.cloud.google.com"
    Write-Host "2. APIs & Services > Credentials"
    Write-Host "3. Edit OAuth 2.0 Client"
    Write-Host "4. Add authorized redirect URIs:"
    Write-Host "   - https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback"
    Write-Host "   - https://peerdash-api.onrender.com/api/auth/google/callback"
    Write-Host "5. Save"
    Write-Host ""
    
    Read-Host "Press Enter when OAuth is configured"
}

# Function to test deployment
function Test-Deployment {
    Write-Host ""
    Write-Host "Step 8: Testing Deployment"
    Write-Host "=========================================="
    Write-Host ""
    
    Write-Host "Testing backend..."
    try {
        $response = Invoke-WebRequest -Uri "https://peerdash-api.onrender.com" -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ Backend is responding"
        }
    } catch {
        Write-Host "⚠ Backend may still be starting up"
        Write-Host "   Check logs at: https://dashboard.render.com"
    }
    
    Write-Host ""
    Write-Host "Testing frontend..."
    try {
        $response = Invoke-WebRequest -Uri "https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app" -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ Frontend is responding"
        }
    } catch {
        Write-Host "⚠ Frontend may have issues"
        Write-Host "   Check logs at: https://vercel.com/dashboard/peerdash"
    }
}

# Main execution
function Main {
    $creds = Get-Credentials
    
    $databaseUrl = New-PostgresDatabase -ApiKey $creds.RenderApiKey
    $redisUrl = New-RedisInstance -ApiKey $creds.RenderApiKey
    $backendId = New-BackendService -ApiKey $creds.RenderApiKey `
        -DatabaseUrl $databaseUrl `
        -RedisUrl $redisUrl `
        -GoogleClientId $creds.GoogleClientId `
        -GoogleClientSecret $creds.GoogleClientSecret `
        -JwtSecret $creds.JwtSecret
    
    Invoke-Migrations
    Update-Frontend -GoogleClientId $creds.GoogleClientId
    Configure-OAuth
    Test-Deployment
    
    Write-Host ""
    Write-Host "=========================================="
    Write-Host "✓ Deployment Complete!"
    Write-Host "=========================================="
    Write-Host ""
    Write-Host "Frontend: https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app"
    Write-Host "Backend: https://peerdash-api.onrender.com"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Wait for backend to fully start (5 minutes)"
    Write-Host "2. Test Google OAuth login"
    Write-Host "3. Create a transfer"
    Write-Host "4. Verify encryption (lock icon)"
    Write-Host ""
}

Main

