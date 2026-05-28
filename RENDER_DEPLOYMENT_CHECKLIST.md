# Render Deployment Checklist

Use this checklist to track your Render deployment progress.

## Pre-Deployment

- [ ] Render account created
- [ ] GitHub account connected to Render
- [ ] Google OAuth credentials obtained
- [ ] Frontend deployed to Vercel (https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app)
- [ ] JWT_SECRET generated (run: `openssl rand -base64 32`)

## Database Setup

- [ ] PostgreSQL database created on Render
  - [ ] Name: peerdash-db
  - [ ] Database: peerdash
  - [ ] User: peerdash
  - [ ] Region: Selected
  - [ ] Internal Database URL copied

- [ ] Redis instance created on Render
  - [ ] Name: peerdash-redis
  - [ ] Region: Same as database
  - [ ] Eviction Policy: allkeys-lru
  - [ ] Internal Redis URL copied

## Backend Deployment

- [ ] Web Service created
  - [ ] Name: peerdash-api
  - [ ] Repository: kgthunder-arch/peerdash
  - [ ] Environment: Node
  - [ ] Region: Same as DB/Redis
  - [ ] Branch: main
  - [ ] Build Command: `npm run build`
  - [ ] Start Command: `npm start`
  - [ ] Root Directory: `apps/server`

- [ ] Environment variables added
  - [ ] DATABASE_URL (from PostgreSQL)
  - [ ] REDIS_URL (from Redis)
  - [ ] NODE_ENV=production
  - [ ] PORT=3001
  - [ ] API_BASE_URL=https://peerdash-api.onrender.com
  - [ ] CORS_ORIGIN=https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
  - [ ] JWT_SECRET (generated)
  - [ ] JWT_EXPIRY=15m
  - [ ] REFRESH_TOKEN_EXPIRY=7d
  - [ ] GOOGLE_CLIENT_ID
  - [ ] GOOGLE_CLIENT_SECRET
  - [ ] LOG_LEVEL=info

- [ ] Web Service deployed successfully
  - [ ] Build completed without errors
  - [ ] Service is running
  - [ ] Logs show no errors
  - [ ] Backend URL obtained: https://peerdash-api.onrender.com

## Database Migrations

- [ ] Connected to Web Service shell
- [ ] Ran: `cd apps/server`
- [ ] Ran: `npx prisma migrate deploy`
- [ ] Ran: `npx prisma generate`
- [ ] Migrations completed successfully

## Frontend Configuration

- [ ] Vercel environment variables updated
  - [ ] VITE_SIGNAL_SERVER_URL=https://peerdash-api.onrender.com
  - [ ] VITE_API_URL=https://peerdash-api.onrender.com/api
  - [ ] VITE_GOOGLE_CLIENT_ID=<your-id>

- [ ] Frontend redeployed on Vercel
  - [ ] Deployment completed
  - [ ] No build errors
  - [ ] Frontend loads at https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app

## Google OAuth Configuration

- [ ] Google Cloud Console accessed
- [ ] OAuth 2.0 Client credentials found
- [ ] Authorized redirect URIs added:
  - [ ] https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback
  - [ ] https://peerdash-api.onrender.com/api/auth/google/callback
- [ ] Changes saved
- [ ] Waited 5 minutes for propagation

## Testing

- [ ] Frontend loads without errors
- [ ] Can see PeerDash UI
- [ ] Google login button visible
- [ ] Can click "Sign in with Google"
- [ ] Redirected to Google login page
- [ ] Can log in with Google account
- [ ] Redirected back to frontend
- [ ] Dashboard loads after login
- [ ] Can create a room
- [ ] Can see room code
- [ ] Can see QR code
- [ ] Can select files to transfer
- [ ] Can see progress bar
- [ ] Lock icon appears (encryption working)
- [ ] Files transfer successfully
- [ ] Can see transfer history
- [ ] Can chat in room
- [ ] Can join room from another device

## Monitoring

- [ ] Render dashboard accessed
- [ ] Web Service status: Running
- [ ] PostgreSQL status: Available
- [ ] Redis status: Available
- [ ] No error logs in Web Service
- [ ] Backend responding to requests
- [ ] Database queries working
- [ ] Redis cache working

## Optional: Advanced Setup

- [ ] Custom domain configured (optional)
- [ ] SSL certificate enabled (auto with Render)
- [ ] Auto-scaling configured (optional)
- [ ] Monitoring alerts set up (optional)
- [ ] Backups configured (optional)
- [ ] Sentry error tracking configured (optional)

## Troubleshooting

If something fails, check:

- [ ] Build logs for errors
- [ ] Environment variables are correct
- [ ] Database is running
- [ ] Redis is running
- [ ] Backend URL is correct
- [ ] CORS_ORIGIN matches frontend URL
- [ ] Google OAuth redirect URIs are correct
- [ ] JWT_SECRET is set
- [ ] All required env vars are present

## Success Criteria

All of the following should be true:

- ✅ Frontend loads at Vercel URL
- ✅ Backend running on Render
- ✅ Database connected
- ✅ Redis connected
- ✅ Google OAuth login works
- ✅ Can create transfers
- ✅ Encryption working (lock icon)
- ✅ Files transfer successfully
- ✅ No errors in logs

## Deployment Complete! 🎉

When all items are checked, your PeerDash deployment is complete!

### Final URLs

- **Frontend**: https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
- **Backend**: https://peerdash-api.onrender.com
- **GitHub**: https://github.com/kgthunder-arch/peerdash

### Next Steps

1. Share the frontend URL with users
2. Monitor logs for errors
3. Set up backups (optional)
4. Configure custom domain (optional)
5. Set up monitoring/alerts (optional)

---

**Deployment Status: ✅ COMPLETE**

