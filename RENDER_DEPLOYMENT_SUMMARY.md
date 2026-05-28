# PeerDash Render Deployment Summary

## 🚀 Ready to Deploy Backend to Render

Your PeerDash frontend is live on Vercel. Now deploy the backend to Render to complete the setup.

## 📋 Quick Overview

| Component | Status | Platform |
|-----------|--------|----------|
| Frontend | ✅ LIVE | Vercel |
| Backend | ⏳ TODO | Render |
| Database | ⏳ TODO | Render PostgreSQL |
| Cache | ⏳ TODO | Render Redis |

## ⚡ Quick Start (5 Minutes)

### 1. Create Render Account
- Go to https://render.com
- Sign up with GitHub
- Authorize Render

### 2. Create Database & Redis
- PostgreSQL: Dashboard → "New +" → "PostgreSQL"
  - Name: `peerdash-db`
  - Copy Internal Database URL
- Redis: Dashboard → "New +" → "Redis"
  - Name: `peerdash-redis`
  - Copy Internal Redis URL

### 3. Deploy Backend
- Dashboard → "New +" → "Web Service"
- Select: `kgthunder-arch/peerdash`
- Root Directory: `apps/server`
- Build Command: `npm run build`
- Start Command: `npm start`

### 4. Add Environment Variables
```
DATABASE_URL=<from-postgresql>
REDIS_URL=<from-redis>
NODE_ENV=production
PORT=3001
API_BASE_URL=https://peerdash-api.onrender.com
CORS_ORIGIN=https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
JWT_SECRET=<generate: openssl rand -base64 32>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
GOOGLE_CLIENT_ID=<your-id>
GOOGLE_CLIENT_SECRET=<your-secret>
LOG_LEVEL=info
```

### 5. Run Migrations
- Web Service → Shell
- Run: `cd apps/server && npx prisma migrate deploy`

### 6. Update Frontend
- Vercel Dashboard → peerdash → Settings → Environment Variables
- Update:
  ```
  VITE_SIGNAL_SERVER_URL=https://peerdash-api.onrender.com
  VITE_API_URL=https://peerdash-api.onrender.com/api
  VITE_GOOGLE_CLIENT_ID=<your-id>
  ```
- Redeploy

### 7. Configure Google OAuth
- Google Cloud Console → OAuth 2.0 Client
- Add redirect URIs:
  - `https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback`
  - `https://peerdash-api.onrender.com/api/auth/google/callback`

### 8. Test
- Visit frontend URL
- Click "Sign in with Google"
- Should work!

## 📚 Detailed Guides

### For Step-by-Step Instructions
See: **RENDER_DEPLOYMENT_GUIDE.md**

### For Quick Reference
See: **RENDER_QUICK_START.md**

### For Tracking Progress
See: **RENDER_DEPLOYMENT_CHECKLIST.md**

## 🔑 Environment Variables Reference

### Required Variables

| Variable | Value | Example |
|----------|-------|---------|
| DATABASE_URL | PostgreSQL URL | postgresql://user:pass@host:5432/db |
| REDIS_URL | Redis URL | redis://user:pass@host:6379 |
| NODE_ENV | production | production |
| PORT | 3001 | 3001 |
| API_BASE_URL | Backend URL | https://peerdash-api.onrender.com |
| CORS_ORIGIN | Frontend URL | https://peerdash-xxx.vercel.app |
| JWT_SECRET | Random 32 chars | (generate with openssl) |
| GOOGLE_CLIENT_ID | From Google Cloud | xxx.apps.googleusercontent.com |
| GOOGLE_CLIENT_SECRET | From Google Cloud | xxx |

### Optional Variables

| Variable | Value | Default |
|----------|-------|---------|
| JWT_EXPIRY | Token expiry | 15m |
| REFRESH_TOKEN_EXPIRY | Refresh expiry | 7d |
| LOG_LEVEL | Log level | info |
| STRIPE_SECRET_KEY | Stripe key | (optional) |
| TURN_SERVER_URL | TURN server | (optional) |

## 🔐 Security Checklist

- [ ] JWT_SECRET is strong (32+ random characters)
- [ ] Database password is strong
- [ ] Redis password is strong
- [ ] CORS_ORIGIN is set correctly
- [ ] HTTPS is enforced (auto with Render)
- [ ] OAuth secrets are not in version control
- [ ] Environment variables are encrypted in Render
- [ ] Database backups are enabled
- [ ] Rate limiting is enabled

## 📊 Deployment Timeline

| Step | Time | Status |
|------|------|--------|
| Create Render account | 1 min | ⏳ TODO |
| Create PostgreSQL | 2 min | ⏳ TODO |
| Create Redis | 2 min | ⏳ TODO |
| Deploy backend | 5 min | ⏳ TODO |
| Run migrations | 1 min | ⏳ TODO |
| Update frontend | 2 min | ⏳ TODO |
| Configure OAuth | 2 min | ⏳ TODO |
| Test | 5 min | ⏳ TODO |

**Total: ~20 minutes**

## 🎯 Success Indicators

After deployment, verify:

- ✅ Backend URL is accessible: https://peerdash-api.onrender.com
- ✅ Database is connected
- ✅ Redis is connected
- ✅ Frontend can reach backend
- ✅ Google OAuth login works
- ✅ Can create transfers
- ✅ Encryption working (lock icon)
- ✅ Files transfer successfully
- ✅ No errors in logs

## 🔗 Important Links

| Link | Purpose |
|------|---------|
| https://render.com | Render dashboard |
| https://console.cloud.google.com | Google OAuth config |
| https://vercel.com/dashboard/peerdash | Vercel frontend |
| https://github.com/kgthunder-arch/peerdash | GitHub repo |

## 📞 Support

### Render Issues
- Check: https://render.com/docs
- Logs: Web Service → Logs tab
- Status: https://status.render.com

### Backend Issues
- Check logs in Render dashboard
- Verify environment variables
- Check database connection
- Check Redis connection

### OAuth Issues
- Verify Client ID and Secret
- Check redirect URIs
- Ensure CORS_ORIGIN is correct
- Wait 5 minutes for changes

### Frontend Issues
- Check Vercel logs
- Verify environment variables
- Check browser console
- Verify backend URL

## 🚀 Next Steps

1. **Deploy Backend** (20 minutes)
   - Follow RENDER_QUICK_START.md
   - Or RENDER_DEPLOYMENT_GUIDE.md for detailed steps

2. **Configure OAuth** (5 minutes)
   - Add redirect URIs
   - Copy credentials

3. **Test** (5 minutes)
   - Verify OAuth login
   - Test file transfers
   - Check encryption

4. **Monitor** (ongoing)
   - Watch logs
   - Monitor performance
   - Set up alerts

## 📈 Scaling

### Free Tier Limits
- Web Service: 0.5 CPU, 512MB RAM
- PostgreSQL: 1GB storage
- Redis: 256MB storage

### Upgrade When Needed
- Starter: $7/month per service
- Standard: $12/month per service
- Premium: $25/month per service

## 🎉 You're Ready!

Everything is set up and ready to deploy. Follow the quick start guide to get your backend running on Render in about 20 minutes.

---

**Status**: ✅ Frontend Live | ⏳ Backend Ready to Deploy

**Next**: Follow RENDER_QUICK_START.md to deploy backend

