# PeerDash Deployment Guide

This guide covers deploying PeerDash to production on Vercel (frontend) and Railway/Render/Fly.io (backend).

## Prerequisites

- Node.js 20+
- Git
- Vercel account (for frontend)
- Railway/Render/Fly.io account (for backend)
- PostgreSQL database (managed or self-hosted)
- Redis instance (managed or self-hosted)
- Google Cloud project with OAuth 2.0 credentials
- Stripe account (optional, for subscriptions)

## Step 1: Prepare Environment Variables

### Backend (.env)

Create a `.env` file in the root directory with:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/peerdash"
REDIS_URL="redis://user:password@host:6379"

# Server
NODE_ENV="production"
PORT=3001
API_BASE_URL="https://api.yourdomain.com"
CORS_ORIGIN="https://yourdomain.com"

# Frontend
VITE_SIGNAL_SERVER_URL="https://api.yourdomain.com"
VITE_API_URL="https://api.yourdomain.com/api"
VITE_GOOGLE_CLIENT_ID="your-google-client-id"

# OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
APPLE_CLIENT_ID="your-apple-client-id"
APPLE_TEAM_ID="your-apple-team-id"
APPLE_KEY_ID="your-apple-key-id"

# JWT
JWT_SECRET="your-random-32-char-secret-key"
JWT_EXPIRY="15m"
REFRESH_TOKEN_EXPIRY="7d"

# Stripe (optional)
STRIPE_SECRET_KEY="sk_live_your-key"
STRIPE_PUBLISHABLE_KEY="pk_live_your-key"
STRIPE_WEBHOOK_SECRET="whsec_your-secret"

# Telemetry
SENTRY_DSN="your-sentry-dsn"
LOG_LEVEL="info"

# TURN/STUN servers (optional)
TURN_SERVER_URL="turn:turnserver.example.com:3478"
TURN_USERNAME="username"
TURN_PASSWORD="password"

# Feature flags
FEATURE_E2E_ENCRYPTION="true"
FEATURE_GROUP_TRANSFERS="true"
FEATURE_CHAT="true"
FEATURE_LAN_DISCOVERY="false"
```

## Step 2: Set Up Database

### Option A: Railway

1. Create a new PostgreSQL project on Railway
2. Copy the `DATABASE_URL` from the Railway dashboard
3. Run migrations:
   ```bash
   cd apps/server
   npx prisma migrate deploy
   npx prisma generate
   ```

### Option B: Render

1. Create a new PostgreSQL database on Render
2. Copy the connection string
3. Run migrations as above

### Option C: Self-hosted

Use Docker Compose:

```bash
docker-compose up -d postgres redis
cd apps/server
npx prisma migrate deploy
```

## Step 3: Deploy Backend

### Option A: Railway

1. Connect your GitHub repository to Railway
2. Create a new service and select your repo
3. Set environment variables in Railway dashboard
4. Railway will auto-deploy on push to main

### Option B: Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set build command: `npm run build`
4. Set start command: `npm start` (in apps/server)
5. Add environment variables
6. Deploy

### Option C: Fly.io

1. Install Fly CLI: `brew install flyctl`
2. Create app: `flyctl launch`
3. Set secrets: `flyctl secrets set DATABASE_URL=... REDIS_URL=...`
4. Deploy: `flyctl deploy`

## Step 4: Deploy Frontend to Vercel

### Using Vercel CLI

```bash
npm install -g vercel
vercel --prod
```

### Using GitHub Integration

1. Push to GitHub
2. Go to vercel.com and import your repository
3. Set environment variables:
   - `VITE_SIGNAL_SERVER_URL` → your backend URL
   - `VITE_API_URL` → your backend URL + `/api`
   - `VITE_GOOGLE_CLIENT_ID` → your Google Client ID
4. Vercel will auto-deploy on push

## Step 5: Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs:
   - `https://yourdomain.com/api/auth/google/callback`
   - `http://localhost:3001/api/auth/google/callback` (for local dev)
6. Copy Client ID and Secret to `.env`

## Step 6: Configure Stripe (Optional)

1. Create a Stripe account at stripe.com
2. Create products:
   - **Pro**: $4.99/month
   - **Enterprise**: Custom pricing
3. Copy price IDs to `.env`:
   ```env
   STRIPE_PRO_PRICE_ID="price_xxx"
   STRIPE_ENTERPRISE_PRICE_ID="price_yyy"
   ```
4. Set up webhook:
   - Go to Stripe Dashboard → Webhooks
   - Add endpoint: `https://api.yourdomain.com/api/stripe/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.updated`
   - Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

## Step 7: Configure TURN Server (Optional)

For better reliability with NAT traversal, use a TURN server:

### Option A: Metered

1. Sign up at [metered.ca](https://www.metered.ca)
2. Get credentials
3. Add to `.env`:
   ```env
   TURN_SERVER_URL="turn:your-server.metered.live:3478"
   TURN_USERNAME="your-username"
   TURN_PASSWORD="your-password"
   ```

### Option B: Self-hosted coturn

```bash
docker run -d \
  -p 3478:3478/tcp \
  -p 3478:3478/udp \
  -p 5349:5349/tcp \
  -p 5349:5349/udp \
  -e TURNSERVER_ENABLED=1 \
  coturn/coturn
```

## Step 8: Verify Deployment

1. Visit `https://yourdomain.com`
2. Test Google OAuth login
3. Create a transfer between two devices
4. Verify encryption is working (lock icon should appear)
5. Check backend logs for errors

## Monitoring & Logs

### Backend Logs

- **Railway**: Dashboard → Logs
- **Render**: Dashboard → Logs
- **Fly.io**: `flyctl logs`

### Error Tracking

If using Sentry:

1. Create a Sentry project
2. Copy DSN to `SENTRY_DSN`
3. Errors will be tracked automatically

## Scaling

### Database

- Use connection pooling (PgBouncer) for high traffic
- Enable read replicas for scaling reads
- Monitor query performance

### Redis

- Use managed Redis (AWS ElastiCache, Heroku Redis)
- Monitor memory usage
- Set appropriate eviction policies

### Backend

- Use auto-scaling (Railway, Render, Fly.io all support this)
- Monitor CPU and memory
- Set up alerts for high resource usage

### Frontend

- Vercel handles scaling automatically
- Monitor build times and performance

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check Prisma
npx prisma db push
```

### Redis Connection Issues

```bash
# Test connection
redis-cli -u $REDIS_URL ping
```

### OAuth Not Working

1. Verify Client ID and Secret are correct
2. Check redirect URIs match exactly
3. Check CORS_ORIGIN includes your frontend URL

### WebRTC Not Connecting

1. Check TURN server credentials
2. Verify firewall allows UDP ports
3. Check browser console for errors

## Rollback

### Backend

- **Railway**: Select previous deployment
- **Render**: Redeploy previous commit
- **Fly.io**: `flyctl releases` and `flyctl releases rollback`

### Frontend

- **Vercel**: Dashboard → Deployments → Redeploy

## Security Checklist

- [ ] JWT_SECRET is strong (32+ random characters)
- [ ] Database password is strong
- [ ] CORS_ORIGIN is set correctly
- [ ] HTTPS is enforced
- [ ] Rate limiting is enabled
- [ ] Helmet security headers are set
- [ ] OAuth secrets are not in version control
- [ ] Database backups are enabled
- [ ] Redis is password-protected
- [ ] TURN server credentials are secure

## Performance Optimization

1. Enable gzip compression
2. Use CDN for static assets (Vercel does this)
3. Optimize database queries
4. Use Redis caching for frequently accessed data
5. Monitor and optimize WebRTC chunk sizes

## Support

For issues or questions:
- Check logs first
- Review error messages in browser console
- Check backend logs
- Verify environment variables
- Test with local development setup

