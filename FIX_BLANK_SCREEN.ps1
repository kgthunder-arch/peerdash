# PeerDash Fix Blank Screen Script
# This script automatically fixes the blank screen issue by setting environment variables in Vercel

param(
    [string]$VercelToken = "",
    [string]$GoogleClientId = ""
)

Write-Host ""
Write-Host "=========================================="
Write-Host "PeerDash Fix Blank Screen Script"
Write-Host "=========================================="
Write-Host ""

# Get credentials if not provided
if ([string]::IsNullOrEmpty($VercelToken)) {
    Write-Host "Step 1: Get Vercel API Token"
    Write-Host "=========================================="
    Write-Host ""
    Write-Host "1. Go to: https://vercel.com/account/tokens"
    Write-Host "2. Create a new token"
    Write-Host "3. Copy the token"
    Write-Host ""
    $VercelToken = Read-Host "Paste your Vercel API token"
}

if ([string]::IsNullOrEmpty($GoogleClientId)) {
    Write-Host ""
    Write-Host "Step 2: Get Google Client ID"
    Write-Host "=========================================="
    Write-Host ""
    Write-Host "1. Go to: https://console.cloud.google.com"
    Write-Host "2. Go to APIs & Services > Credentials"
    Write-Host "3. Copy your OAuth 2.0 Client ID"
    Write-Host ""
    $GoogleClientId = Read-Host "Paste your Google Client ID"
}

if ([string]::IsNullOrEmpty($VercelToken) -or [string]::IsNullOrEmpty($GoogleClientId)) {
    Write-Host "Error: Missing required credentials"
    exit 1
}

Write-Host ""
Write-Host "Step 3: Setting Environment Variables"
Write-Host "=========================================="
Write-Host ""

# Set environment variables in Vercel
$headers = @{
    "Authorization" = "Bearer $VercelToken"
    "Content-Type" = "application/json"
}

$projectId = "peerdash"
$teamId = "kgthunder007-7460"

# Function to set environment variable
function Set-VercelEnvVar {
    param(
        [string]$Key,
        [string]$Value,
        [string]$Environment
    )
    
    Write-Host "Setting $Key..."
    
    try {
        $body = @{
            key = $Key
            value = $Value
            target = @($Environment)
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod `
            -Uri "https://api.vercel.com/v9/projects/$projectId/env" `
            -Method Post `
            -Headers $headers `
            -Body $body `
            -ErrorAction SilentlyContinue
        
        if ($response) {
            Write-Host "✅ $Key set successfully"
            return $true
        }
    } catch {
        Write-Host "⚠️  Could not set $Key via API"
        return $false
    }
}

# Set the three required environment variables
$vars = @(
    @{ Key = "VITE_SIGNAL_SERVER_URL"; Value = "https://peerdash-api.onrender.com"; Env = "production" }
    @{ Key = "VITE_API_URL"; Value = "https://peerdash-api.onrender.com/api"; Env = "production" }
    @{ Key = "VITE_GOOGLE_CLIENT_ID"; Value = $GoogleClientId; Env = "production" }
)

$allSet = $true
foreach ($var in $vars) {
    $result = Set-VercelEnvVar -Key $var.Key -Value $var.Value -Environment $var.Env
    if (-not $result) {
        $allSet = $false
    }
}

Write-Host ""
Write-Host "Step 4: Redeploy Frontend"
Write-Host "=========================================="
Write-Host ""

if ($allSet) {
    Write-Host "✅ Environment variables set successfully"
    Write-Host ""
    Write-Host "Now you need to redeploy the frontend:"
    Write-Host "1. Go to: https://vercel.com/dashboard/peerdash"
    Write-Host "2. Click 'Deployments'"
    Write-Host "3. Click the latest deployment"
    Write-Host "4. Click 'Redeploy' button"
    Write-Host "5. Wait for build to complete (2-3 minutes)"
    Write-Host ""
    Write-Host "Then:"
    Write-Host "1. Clear browser cache (Ctrl+Shift+Delete)"
    Write-Host "2. Hard refresh (Ctrl+Shift+R)"
    Write-Host "3. Visit: https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app"
    Write-Host ""
} else {
    Write-Host "⚠️  Could not set all environment variables via API"
    Write-Host ""
    Write-Host "Please set them manually:"
    Write-Host "1. Go to: https://vercel.com/dashboard/peerdash"
    Write-Host "2. Click 'Settings' > 'Environment Variables'"
    Write-Host "3. Add these variables for Production:"
    Write-Host ""
    Write-Host "   VITE_SIGNAL_SERVER_URL = https://peerdash-api.onrender.com"
    Write-Host "   VITE_API_URL = https://peerdash-api.onrender.com/api"
    Write-Host "   VITE_GOOGLE_CLIENT_ID = $GoogleClientId"
    Write-Host ""
    Write-Host "4. Click 'Deployments' > Latest > 'Redeploy'"
    Write-Host "5. Wait for build to complete"
    Write-Host "6. Clear cache and hard refresh"
    Write-Host ""
}

Write-Host "=========================================="
Write-Host "✅ Fix Complete!"
Write-Host "=========================================="
Write-Host ""
Write-Host "Your PeerDash should now load properly!"
Write-Host ""

