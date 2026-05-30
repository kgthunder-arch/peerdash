#!/usr/bin/env sh
# Run by Render's startCommand: "sh apps/server/start.sh"
# 1. Push schema to the live database (creates tables if they don't exist)
# 2. Start the server
set -e
cd "$(dirname "$0")"
npx prisma db push --accept-data-loss
node dist/index.js
