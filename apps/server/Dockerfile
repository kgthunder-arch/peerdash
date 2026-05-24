# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY apps/server ./apps/server
COPY apps/server/prisma ./prisma

# Build TypeScript
RUN npm run build --workspace apps/server

# Generate Prisma client
RUN npx prisma generate

# Runtime stage
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application and Prisma
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => {if (res.statusCode !== 200) throw new Error(res.statusCode)})"

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node apps/server/dist/index.js"]
