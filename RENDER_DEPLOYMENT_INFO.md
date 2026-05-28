# Render Deployment - Information Needed

To deploy your PeerDash backend to Render, I need the following information from you:

## 1. Google OAuth Credentials

You need to get these from Google Cloud Console:

- **GOOGLE_CLIENT_ID**: Your Google OAuth Client ID
- **GOOGLE_CLIENT_SECRET**: Your Google OAuth Client Secret

### How to get them:
1. Go to https://console.cloud.google.com
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to APIs & Services → Credentials
5. Create OAuth 2.0 credentials (Web application)
6. Add authorized redirect URIs:
   - `https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback`
   - `https://peerdash-api.onrender.com/api/auth/google/callback`
7. Copy Client ID and Secret

## 2. JWT Secret

Generate a random 32-character secret:

```bash
openssl rand -base64 32
```

Copy the output - this is your JWT_SECRET

## 3. Render Account

- Create account at https://render.com
- Sign up with GitHub (recommended)

## What I Can Do

Once you provide the above information, I can:

1. ✅ Create PostgreSQL database on Render
2. ✅ Create Redis instance on Render
3. ✅ Deploy backend Web Service
4. ✅ Set all environment variables
5. ✅ Run database migrations
6. ✅ Update frontend environment variables
7. ✅ Configure OAuth redirect URIs

## What You Need to Do

1. Get Google OAuth credentials (5 minutes)
2. Generate JWT_SECRET (1 minute)
3. Create Render account (2 minutes)
4. Provide the information below

## Information to Provide

Please provide:

```
GOOGLE_CLIENT_ID: ___________________________
GOOGLE_CLIENT_SECRET: ___________________________
JWT_SECRET: ___________________________
Render Account Email: ___________________________
```

Once you provide this, I can complete the entire deployment!

---

**Total time needed from you: ~10 minutes**

After that, I'll handle the rest of the deployment automatically.

