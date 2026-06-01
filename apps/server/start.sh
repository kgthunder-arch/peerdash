#!/usr/bin/env sh
# ─────────────────────────────────────────────────────────────────────────────
# Render start script for peerdash-api
#  1. Validate DATABASE_URL is present (hard requirement)
#  2. Push the Prisma schema to the live database
#  3. Start the compiled Node server
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── Guard: DATABASE_URL is the only hard requirement ─────────────────────────
if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║  STARTUP FAILED — DATABASE_URL is not set                   ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  Fix: Render dashboard → peerdash-api → Environment         ║"
  echo "║       Add: DATABASE_URL = postgresql://user:pass@host/db    ║"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# ── Change into the script's own directory ────────────────────────────────────
cd "$(dirname "$0")"

# ── Push Prisma schema ────────────────────────────────────────────────────────
# If DIRECT_URL is set (recommended for Supabase pgbouncer setups), use it so
# that the schema push bypasses the connection pooler. Otherwise fall back to
# DATABASE_URL (works fine for direct Postgres connections).
PUSH_URL="${DIRECT_URL:-$DATABASE_URL}"

echo "▶ Running prisma db push …"
DATABASE_URL="$PUSH_URL" npx prisma db push --accept-data-loss
echo "✅ Prisma schema up to date"

# ── Start server ──────────────────────────────────────────────────────────────
echo "▶ Starting server …"
exec node dist/index.js
