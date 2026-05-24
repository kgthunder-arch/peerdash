# Quick Start: Deploy PeerDash to Production

This is a fast-track guide to get PeerDash running in production. For detailed instructions, see `DEPLOYMENT.md`.

## 5-Minute Setup

### 1. Get Your Credentials

Before starting, gather:
- Google OAuth Client ID & Secret (from Google Cloud Console)
- PostgreSQL database URL
- Redis URL
- A strong JWT secret (generate: `openssl rand -base64 32`)

### 2. Deploy Backend (Choose One)

#### Railway (Easiest)
```bash
# 1. Go to railway.app and create account
# 2. Connect your GitHub repo
# 3. Create PostgreSQL and Redis services
# 4. Set environment variables:
DATABASE_URL=<your-postgres-url>
REDIS_URL=<your-redis-url>
JWT_SECRET=<your-secret>
GOOGLE_CLIENT_ID=<your-id>
GOOGLE_CLIENT_SECRET=<your-secret>
CORS_ORIGIN=https://yourdomain.com
API_BASE_URL=https://api.yourdomain.com

# 5. Railway auto-deploys on push
```

#### Render
```bash
# 1. Go to render.com and create account
# 2. Create new Web Service
# 3. Connect GitHub repo
# 4. Set build command: npm run build
# 5. Set start command: npm start (in apps/server)
# 6. Add environment variables (same as above)
# 7. Deploy
```

#### Fly.io
```bash
# 1. Install flyctl: brew install flyctl
# 2. flyctl auth login
# 3. cd apps/server
# 4. flyctl launch
# 5. flyctl secrets set DATABASE_URL=... REDIS_URL=... etc
# 6. flyctl deploy
```

### 3. Deploy Frontend (Vercel)

```bash
# Option A: Using CLI
npm install -g vercel
vercel --prod

# Option B: Using GitHub
# 1. Go to vercel.com
# 2. Import your GitHub repo
# 3. Set environment variables:
VITE_SIGNAL_SERVER_URL=https://api.yourdomain.com
VITE_API_URL=https://api.yourdomain.com/api
VITE_GOOGLE_CLIENT_ID=<your-id>
# 4. Deploy
```

### 4. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - `https://yourdomain.com/api/auth/google/callback`
   - `https://api.yourdomain.com/api/auth/google/callback`
4. Copy Client ID and Secret to backend environment variables

### 5. Test It

1. Visit `https://yourdomain.com`
2. Click "Sign in with Google"
3. Create a transfer between two devices
4. Verify the lock icon appears (encryption working)

## Environment Variables Checklist

### Backend
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<32-char-random>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
CORS_ORIGIN=https://yourdomain.com
API_BASE_URL=https://api.yourdomain.com
NODE_ENV=production
PORT=3001
```

### Frontend
```
VITE_SIGNAL_SERVER_URL=https://api.yourdomain.com
VITE_API_URL=https://api.yourdomain.com/api
VITE_GOOGLE_CLIENT_ID=...
```

## Troubleshooting

### "Cannot connect to database"
- Check DATABASE_URL is correct
- Verify database is running
- Check firewall allows connections

### "OAuth login fails"
- Verify Client ID and Secret are correct
- Check redirect URIs match exactly
- Ensure CORS_ORIGIN is set

### "WebRTC not connecting"
- Check browser console for errors
- Verify CORS_ORIGIN includes your domain
- Try adding TURN server credentials

### "Build fails"
- Check Node.js version is 20+
- Run `npm install` in both apps/client and apps/server
- Check for TypeScript errors: `npm run build`

## Optional: Add Stripe Subscriptions

1. Create Stripe account at stripe.com
2. Create products (Pro: $4.99/mo, Enterprise: custom)
3. Add to backend environment:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. Set webhook URL: `https://api.yourdomain.com/api/stripe/webhook`

## Optional: Add TURN Server

For better NAT traversal:

1. Use Metered: https://www.metered.ca
2. Add to backend environment:
   ```
   TURN_SERVER_URL=turn:your-server.metered.live:3478
   TURN_USERNAME=...
   TURN_PASSWORD=...
   ```

## Monitoring

### Check Logs
- **Railway**: Dashboard → Logs
- **Render**: Dashboard → Logs
- **Fly.io**: `flyctl logs`
- **Vercel**: Dashboard → Deployments → Logs

### Monitor Performance
- Check database query times
- Monitor Redis memory usage
- Watch WebRTC connection success rate
- Track file transfer speeds

## Next Steps

1. ✅ Deploy backend
2. ✅ Deploy frontend
3. ✅ Configure OAuth
4. ⏭️ Set up monitoring (Sentry, DataDog)
5. ⏭️ Configure backups
6. ⏭️ Set up CI/CD
7. ⏭️ Add custom domain

## Support

- Check `DEPLOYMENT.md` for detailed instructions
- Review `README.md` for feature overview
- Check backend logs for errors
- Check browser console for frontend errors

## Success Indicators

- ✅ Frontend loads at yourdomain.com
- ✅ Google OAuth login works
- ✅ Can create transfers
- ✅ Lock icon appears (encryption working)
- ✅ Files transfer successfully
- ✅ No errors in logs

**You're done! PeerDash is now live in production.** 🎉

