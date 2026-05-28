# Quick Start: Deploy to Render (5 Minutes)

## Step 1: Create Render Account (1 minute)

1. Go to https://render.com
2. Click "Sign up"
3. Sign up with GitHub
4. Authorize Render

## Step 2: Create Database & Redis (2 minutes)

### PostgreSQL
1. Dashboard → "New +" → "PostgreSQL"
2. Name: `peerdash-db`
3. Database: `peerdash`
4. User: `peerdash`
5. Click "Create Database"
6. **Copy the Internal Database URL**

### Redis
1. Dashboard → "New +" → "Redis"
2. Name: `peerdash-redis`
3. Same region as database
4. Click "Create Redis"
5. **Copy the Internal Redis URL**

## Step 3: Deploy Backend (2 minutes)

1. Dashboard → "New +" → "Web Service"
2. Select "Deploy an existing repository"
3. Search: `kgthunder-arch/peerdash`
4. Fill in:
   - **Name**: peerdash-api
   - **Environment**: Node
   - **Region**: Same as DB/Redis
   - **Branch**: main
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
   - **Root Directory**: `apps/server`

5. Click "Create Web Service"

## Step 4: Add Environment Variables

In Web Service → Environment, add:

```
DATABASE_URL=<paste-from-step-2>
REDIS_URL=<paste-from-step-2>
NODE_ENV=production
PORT=3001
API_BASE_URL=https://peerdash-api.onrender.com
CORS_ORIGIN=https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
JWT_SECRET=<run: openssl rand -base64 32>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
LOG_LEVEL=info
```

## Step 5: Wait for Deployment

Render will deploy automatically. Watch the logs. Takes 3-5 minutes.

## Step 6: Run Migrations

1. Go to Web Service → Shell
2. Run:
   ```bash
   cd apps/server
   npx prisma migrate deploy
   npx prisma generate
   ```

## Step 7: Update Frontend

1. Go to https://vercel.com/dashboard/peerdash
2. Settings → Environment Variables
3. Update for Production:
   ```
   VITE_SIGNAL_SERVER_URL=https://peerdash-api.onrender.com
   VITE_API_URL=https://peerdash-api.onrender.com/api
   VITE_GOOGLE_CLIENT_ID=<your-google-client-id>
   ```
4. Deployments → Click latest → Redeploy

## Step 8: Configure Google OAuth

1. Go to https://console.cloud.google.com
2. APIs & Services → Credentials
3. Edit OAuth 2.0 Client
4. Add redirect URIs:
   - `https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback`
   - `https://peerdash-api.onrender.com/api/auth/google/callback`
5. Save

## Step 9: Test

1. Visit https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
2. Click "Sign in with Google"
3. Should work!

## Done! 🎉

Your PeerDash is now fully deployed!

- **Frontend**: https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
- **Backend**: https://peerdash-api.onrender.com

See `RENDER_DEPLOYMENT_GUIDE.md` for detailed instructions.

