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
PUSH_TIMEOUT_SECONDS="${PRISMA_PUSH_TIMEOUT_SECONDS:-60}"

if [ "${SKIP_PRISMA_PUSH:-false}" = "true" ]; then
  echo "Skipping prisma db push because SKIP_PRISMA_PUSH=true"
elif command -v timeout >/dev/null 2>&1; then
  echo "Running prisma db push with ${PUSH_TIMEOUT_SECONDS}s timeout..."
  if DATABASE_URL="$PUSH_URL" timeout "$PUSH_TIMEOUT_SECONDS" npx prisma db push --accept-data-loss; then
    echo "Prisma schema up to date"
  else
    echo "WARNING: prisma db push failed or timed out; starting API in degraded mode"
  fi
else
  echo "Running prisma db push..."
  if DATABASE_URL="$PUSH_URL" npx prisma db push --accept-data-loss; then
    echo "Prisma schema up to date"
  else
    echo "WARNING: prisma db push failed; starting API in degraded mode"
  fi
fi

echo "Starting server..."
exec node dist/index.js
