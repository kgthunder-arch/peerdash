# Deploy PeerDash Backend to Render

This guide will walk you through deploying the PeerDash backend to Render.

## Prerequisites

- Render account (https://render.com)
- GitHub account with PeerDash repo
- Google OAuth credentials
- PostgreSQL database URL (Render will provide)
- Redis URL (Render will provide)

## Step 1: Create Render Account

1. Go to https://render.com
2. Click "Sign up"
3. Sign up with GitHub (recommended)
4. Authorize Render to access your GitHub account

## Step 2: Create PostgreSQL Database

1. Go to https://dashboard.render.com
2. Click "New +" → "PostgreSQL"
3. Fill in details:
   - **Name**: peerdash-db
   - **Database**: peerdash
   - **User**: peerdash
   - **Region**: Choose closest to you
   - **PostgreSQL Version**: 15
4. Click "Create Database"
5. Wait for database to be created (2-3 minutes)
6. Copy the **Internal Database URL** (you'll need this)

## Step 3: Create Redis Instance

1. Go to https://dashboard.render.com
2. Click "New +" → "Redis"
3. Fill in details:
   - **Name**: peerdash-redis
   - **Region**: Same as database
   - **Eviction Policy**: allkeys-lru
4. Click "Create Redis"
5. Wait for Redis to be created (1-2 minutes)
6. Copy the **Internal Redis URL** (you'll need this)

## Step 4: Create Web Service for Backend

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Select "Deploy an existing repository"
4. Search for and select: **kgthunder-arch/peerdash**
5. Fill in details:
   - **Name**: peerdash-api
   - **Environment**: Node
   - **Region**: Same as database and Redis
   - **Branch**: main
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or Starter for better performance)

## Step 5: Add Environment Variables

In the Web Service settings, go to **Environment** and add these variables:

```
DATABASE_URL=<paste-internal-database-url-from-step-2>
REDIS_URL=<paste-internal-redis-url-from-step-3>
NODE_ENV=production
PORT=3001
API_BASE_URL=https://peerdash-api.onrender.com
CORS_ORIGIN=https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
JWT_SECRET=<generate-random-32-char-secret>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
LOG_LEVEL=info
```

### How to Generate JWT_SECRET

Run this command in your terminal:
```bash
openssl rand -base64 32
```

Copy the output and paste it as JWT_SECRET.

## Step 6: Configure Build Settings

1. In Web Service settings, go to **Build & Deploy**
2. Set:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Root Directory**: `apps/server`

3. Click "Create Web Service"

## Step 7: Wait for Deployment

Render will:
1. Clone your repository
2. Install dependencies
3. Build the project
4. Start the server

This takes 3-5 minutes. You can watch the logs in real-time.

## Step 8: Get Your Backend URL

Once deployed, you'll see a URL like:
```
https://peerdash-api.onrender.com
```

Copy this URL - you'll need it for the next steps.

## Step 9: Run Database Migrations

1. Go to your Web Service in Render
2. Click "Shell" tab
3. Run these commands:
   ```bash
   cd apps/server
   npx prisma migrate deploy
   npx prisma generate
   ```

## Step 10: Update Frontend Environment Variables

1. Go to https://vercel.com/dashboard
2. Select **peerdash** project
3. Go to **Settings** → **Environment Variables**
4. Update for **Production**:
   ```
   VITE_SIGNAL_SERVER_URL=https://peerdash-api.onrender.com
   VITE_API_URL=https://peerdash-api.onrender.com/api
   VITE_GOOGLE_CLIENT_ID=<your-google-client-id>
   ```
5. Go to **Deployments** → Click latest → **Redeploy**

## Step 11: Configure Google OAuth

1. Go to https://console.cloud.google.com
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Edit your OAuth 2.0 Client
5. Add authorized redirect URIs:
   - `https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback`
   - `https://peerdash-api.onrender.com/api/auth/google/callback`
6. Save

## Step 12: Test the Deployment

1. Visit https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
2. Click "Sign in with Google"
3. You should be redirected to Google login
4. After login, you should see the dashboard
5. Try creating a transfer
6. Verify the lock icon appears (encryption working)

## Troubleshooting

### Build Fails

**Error**: "Cannot find module"
- **Solution**: Make sure `npm run build` works locally first
- Run: `cd apps/server && npm install && npm run build`

**Error**: "Port already in use"
- **Solution**: Render automatically assigns a port, ignore this

### Database Connection Fails

**Error**: "Cannot connect to database"
- **Solution**: 
  1. Check DATABASE_URL is correct
  2. Verify database is running in Render dashboard
  3. Check firewall allows connections

### OAuth Login Fails

**Error**: "Redirect URI mismatch"
- **Solution**:
  1. Check redirect URIs in Google Cloud Console
  2. Ensure they match exactly (including https://)
  3. Wait 5 minutes for changes to propagate

### WebRTC Not Connecting

**Error**: "Cannot establish peer connection"
- **Solution**:
  1. Check CORS_ORIGIN is set correctly
  2. Verify backend is running
  3. Check browser console for errors

## Monitoring

### View Logs

1. Go to your Web Service in Render
2. Click "Logs" tab
3. Watch real-time logs

### Check Status

1. Go to https://dashboard.render.com
2. Check status of:
   - Web Service (peerdash-api)
   - PostgreSQL (peerdash-db)
   - Redis (peerdash-redis)

### Monitor Performance

1. Go to Web Service settings
2. Click "Metrics" tab
3. View CPU, memory, and request metrics

## Scaling

### Upgrade Instance Type

1. Go to Web Service settings
2. Click "Instance Type"
3. Select higher tier (Starter, Standard, etc.)
4. Render will restart with new resources

### Enable Auto-scaling

1. Go to Web Service settings
2. Click "Auto-scaling"
3. Set min/max instances
4. Render will scale based on load

## Costs

### Free Tier
- Web Service: Free (with limitations)
- PostgreSQL: Free (with limitations)
- Redis: Free (with limitations)

### Paid Tiers
- Starter: $7/month per service
- Standard: $12/month per service
- Premium: $25/month per service

## Next Steps

1. ✅ Deploy backend to Render
2. ✅ Configure Google OAuth
3. ✅ Update frontend environment variables
4. ✅ Test the application
5. ⏳ Set up monitoring (optional)
6. ⏳ Configure custom domain (optional)
7. ⏳ Set up backups (optional)

## Support

- **Render Docs**: https://render.com/docs
- **Render Support**: https://render.com/support
- **PeerDash Docs**: See DEPLOYMENT.md

## Success Indicators

- ✅ Backend deployed and running
- ✅ Database connected
- ✅ Redis connected
- ✅ Frontend can reach backend
- ✅ Google OAuth login works
- ✅ Can create transfers
- ✅ Encryption working (lock icon)
- ✅ Files transfer successfully

---

**You're all set! Your PeerDash backend is now deployed on Render.** 🚀

