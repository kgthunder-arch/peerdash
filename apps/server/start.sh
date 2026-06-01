#!/usr/bin/env sh
# Render start script for peerdash-api
# 1. Validate DATABASE_URL is present.
# 2. Push the Prisma schema to the live database.
# 3. Start the compiled Node server.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "STARTUP FAILED: DATABASE_URL is not set"
  echo "Fix: Render dashboard -> peerdash-api -> Environment"
  echo "Add DATABASE_URL=postgresql://user:pass@host/db"
  echo ""
  exit 1
fi

cd "$(dirname "$0")"

# If DIRECT_URL is set, use it so Prisma bypasses pooled connections.
PUSH_URL="${DIRECT_URL:-$DATABASE_URL}"

echo "Running prisma db push..."
DATABASE_URL="$PUSH_URL" npx prisma db push --accept-data-loss
echo "Prisma schema up to date"

echo "Starting server..."
exec node dist/index.js
