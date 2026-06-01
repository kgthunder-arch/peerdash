#!/usr/bin/env pwsh
# ─────────────────────────────────────────────────────────────────────────────
#  PeerDash — Render Environment Automation Script
#  Pushes all required environment variables to your Render service via API
#  then triggers a fresh deploy and waits for health check to pass.
#
#  Usage:
#    .\setup-render-env.ps1
#
#  Requirements:
#    - Render API key  → https://dashboard.render.com/u/settings#api-keys
#    - Render Service ID → dashboard URL:  /web/srv-XXXXXXXXXXXXX/...
# ─────────────────────────────────────────────────────────────────────────────

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Header($msg) { Write-Host "`n━━━ $msg ━━━" -ForegroundColor Cyan }
function Write-Ok($msg)     { Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Warn($msg)   { Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Write-Fail($msg)   { Write-Host "  ❌ $msg" -ForegroundColor Red }
function Prompt-Secret($prompt) {
    $secure = Read-Host $prompt -AsSecureString
    [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║        PeerDash — Render Environment Setup Wizard           ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# ── Step 1: Render credentials ────────────────────────────────────────────────
Write-Header "Step 1 — Render credentials"
Write-Host "  Get your API key from: https://dashboard.render.com/u/settings#api-keys"
Write-Host "  Get your Service ID from the URL when viewing your service:  srv-XXXXX"
Write-Host ""

$RENDER_API_KEY  = Prompt-Secret "  Render API key"
$RENDER_SERVICE_ID = (Read-Host "  Render Service ID (srv-XXXXXXXXXXXXX)").Trim()

if (-not $RENDER_SERVICE_ID.StartsWith("srv-")) {
    Write-Fail "Service ID must start with 'srv-'. Got: $RENDER_SERVICE_ID"
    exit 1
}

# Verify API key works
Write-Host ""
Write-Host "  Verifying credentials …" -NoNewline
$headers = @{ Authorization = "Bearer $RENDER_API_KEY"; "Content-Type" = "application/json" }
try {
    $svc = Invoke-RestMethod "https://api.render.com/v1/services/$RENDER_SERVICE_ID" -Headers $headers
    Write-Ok "Connected to service: $($svc.service.name)"
    $SERVICE_URL = "https://$($svc.service.serviceDetails.url)"
} catch {
    Write-Fail "Could not connect. Check your API key and Service ID."
    Write-Host "  Error: $_" -ForegroundColor Red
    exit 1
}

# ── Step 2: Database ──────────────────────────────────────────────────────────
Write-Header "Step 2 — Database (Supabase)"
Write-Host "  Get this from: Supabase → Settings → Database → Connection string"
Write-Host "  Use the 'URI' format from the 'Transaction' tab (port 6543)"
Write-Host "  Append: ?pgbouncer=true&connection_limit=1"
Write-Host ""

$DATABASE_URL = Prompt-Secret "  DATABASE_URL (postgresql://...)"

if (-not $DATABASE_URL.StartsWith("postgresql://") -and -not $DATABASE_URL.StartsWith("postgres://")) {
    Write-Warn "URL doesn't look like a Postgres connection string — continuing anyway"
}

# ── Step 3: Optional DIRECT_URL ───────────────────────────────────────────────
Write-Header "Step 3 — Direct URL (optional, recommended for Supabase)"
Write-Host "  Same Supabase page, 'Session' tab, port 5432. Used only for migrations."
Write-Host "  Press Enter to skip."
Write-Host ""

$DIRECT_URL = Prompt-Secret "  DIRECT_URL (postgresql://... port 5432, or Enter to skip)"

# ── Step 4: Frontend URL ──────────────────────────────────────────────────────
Write-Header "Step 4 — Frontend URL (CORS)"
Write-Host "  Your Vercel deployment URL, e.g. https://peerdash.vercel.app"
Write-Host ""

$CORS_ORIGIN = (Read-Host "  CORS_ORIGIN").Trim()

# ── Step 5: OAuth (optional) ──────────────────────────────────────────────────
Write-Header "Step 5 — Google OAuth (optional, press Enter to skip)"
$GOOGLE_CLIENT_ID     = (Read-Host "  GOOGLE_CLIENT_ID").Trim()
$GOOGLE_CLIENT_SECRET = ""
if ($GOOGLE_CLIENT_ID) {
    $GOOGLE_CLIENT_SECRET = Prompt-Secret "  GOOGLE_CLIENT_SECRET"
}

# ── Step 6: Redis (optional) ──────────────────────────────────────────────────
Write-Header "Step 6 — Upstash Redis (optional, press Enter to skip)"
Write-Host "  Get from: https://console.upstash.com → your database → Details → Redis URL"
Write-Host ""
$REDIS_URL = Prompt-Secret "  REDIS_URL (rediss://... or Enter to skip)"

# ─────────────────────────────────────────────────────────────────────────────
Write-Header "Pushing environment variables to Render"

# Build the env-vars array — only include non-empty values
$envVars = [System.Collections.Generic.List[hashtable]]::new()

function Add-Var($key, $value) {
    if ($value) {
        $envVars.Add(@{ key = $key; value = $value })
        Write-Host "  → $key" -ForegroundColor DarkCyan
    } else {
        Write-Warn "Skipping $key (empty)"
    }
}

Add-Var "NODE_ENV"              "production"
Add-Var "PORT"                  "3001"
Add-Var "DATABASE_URL"          $DATABASE_URL
Add-Var "CORS_ORIGIN"           $CORS_ORIGIN
Add-Var "API_BASE_URL"          $SERVICE_URL
Add-Var "LOG_LEVEL"             "info"
Add-Var "JWT_EXPIRY"            "15m"
Add-Var "REFRESH_TOKEN_EXPIRY"  "7d"

if ($DIRECT_URL)           { Add-Var "DIRECT_URL"           $DIRECT_URL }
if ($REDIS_URL)            { Add-Var "REDIS_URL"            $REDIS_URL }
if ($GOOGLE_CLIENT_ID)     { Add-Var "GOOGLE_CLIENT_ID"     $GOOGLE_CLIENT_ID }
if ($GOOGLE_CLIENT_SECRET) { Add-Var "GOOGLE_CLIENT_SECRET" $GOOGLE_CLIENT_SECRET }

# PUT to Render API
$body = $envVars | ConvertTo-Json -Depth 3
try {
    Invoke-RestMethod `
        "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars" `
        -Method PUT `
        -Headers $headers `
        -Body $body | Out-Null
    Write-Ok "All environment variables pushed successfully"
} catch {
    Write-Fail "Failed to push env vars: $_"
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Header "Triggering redeploy"

try {
    Invoke-RestMethod `
        "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" `
        -Method POST `
        -Headers $headers `
        -Body '{"clearCache":"do_not_clear"}' | Out-Null
    Write-Ok "Deploy triggered"
} catch {
    Write-Warn "Could not trigger deploy via API — Render may auto-deploy from GitHub push"
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Header "Waiting for health check"
Write-Host "  Polling $SERVICE_URL/health (up to 5 minutes) …"
Write-Host ""

$deadline = (Get-Date).AddMinutes(5)
$healthy  = $false

while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-RestMethod "$SERVICE_URL/health" -TimeoutSec 5
        if ($resp.ok -eq $true) {
            Write-Ok "Service is healthy!  $($resp | ConvertTo-Json -Compress)"
            $healthy = $true
            break
        }
    } catch { }
    Write-Host "  … waiting" -ForegroundColor DarkGray
    Start-Sleep 15
}

if (-not $healthy) {
    Write-Warn "Health check did not pass within 5 minutes."
    Write-Host "  Check Render logs: https://dashboard.render.com/web/$RENDER_SERVICE_ID/logs"
}

# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║  Done! Save these for your GitHub Secrets (CI/CD):          ║" -ForegroundColor Magenta
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Magenta
Write-Host "║  RENDER_SERVICE_ID  =  $RENDER_SERVICE_ID" -ForegroundColor White
Write-Host "║  RENDER_API_KEY     =  (the key you entered above)          ║" -ForegroundColor White
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""
