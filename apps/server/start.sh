#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# Render start script for peerdash-api
#  1. Validate required environment variables (fail fast with a clear message)
#  2. Push the Prisma schema to the live database
#  3. Start the compiled Node server
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── Guard: required env vars ──────────────────────────────────────────────────
check_var() {
  var_name="$1"
  eval val=\$$var_name
  if [ -z "$val" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  STARTUP FAILED — missing environment variable               ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Variable : $var_name"
    echo "║                                                              ║"
    echo "║  Fix: Go to Render dashboard → peerdash-api                 ║"
    echo "║        → Environment → Add Environment Variable             ║"
    echo "║                                                              ║"
    echo "║  DATABASE_URL  → Supabase transaction pooler URL            ║"
    echo "║                  (Settings → Database → Connection string,  ║"
    echo "║                   Transaction mode, port 6543)              ║"
    echo "║                  append: ?pgbouncer=true&connection_limit=1 ║"
    echo "║                                                              ║"
    echo "║  DIRECT_URL    → Supabase direct URL                        ║"
    echo "║                  (Settings → Database → Connection string,  ║"
    echo "║                   Session mode, port 5432)                  ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
  fi
}

check_var DATABASE_URL
check_var DIRECT_URL

# ── Change into the script's own directory ────────────────────────────────────
cd "$(dirname "$0")"

# ── Push Prisma schema (uses DIRECT_URL to bypass pgbouncer) ─────────────────
echo "▶ Running prisma db push …"
DATABASE_URL="$DIRECT_URL" npx prisma db push --accept-data-loss
echo "✅ Prisma schema up to date"

# ── Start server ──────────────────────────────────────────────────────────────
echo "▶ Starting server …"
exec node dist/index.js
