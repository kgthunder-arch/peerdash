# Run PeerDash Render Deployment Script

## Prerequisites

Before running the script, gather these credentials:

### 1. Google OAuth Credentials (5 minutes)

1. Go to https://console.cloud.google.com
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to **APIs & Services** → **Credentials**
5. Create **OAuth 2.0 credentials** (Web application)
6. Add authorized redirect URIs:
   - `https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app/api/auth/google/callback`
   - `https://peerdash-api.onrender.com/api/auth/google/callback`
7. Copy and save:
   - **GOOGLE_CLIENT_ID**
   - **GOOGLE_CLIENT_SECRET**

### 2. Render API Key (2 minutes)

1. Go to https://dashboard.render.com
2. Click your profile icon (top right)
3. Go to **Account** → **API Tokens**
4. Create a new API token
5. Copy and save: **RENDER_API_KEY**

### 3. Create Render Account (if needed)

1. Go to https://render.com
2. Sign up with GitHub (recommended)
3. Authorize Render to access your GitHub account

## Running the Script

### On Windows (PowerShell)

#### Option 1: Run with prompts (Recommended)

```powershell
# Open PowerShell in the peerdash directory
cd C:\Users\chans\Downloads\peerdash

# Run the script
.\RENDER_AUTO_DEPLOY.ps1
```

The script will prompt you for:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- RENDER_API_KEY
- JWT_SECRET (optional - can generate)

#### Option 2: Run with parameters

```powershell
.\RENDER_AUTO_DEPLOY.ps1 `
  -GoogleClientId "your-client-id" `
  -GoogleClientSecret "your-client-secret" `
  -RenderApiKey "your-api-key" `
  -JwtSecret "your-jwt-secret"
```

#### Option 3: If you get execution policy error

```powershell
# Allow script execution for this session
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# Then run the script
.\RENDER_AUTO_DEPLOY.ps1
```

### On macOS/Linux (Bash)

```bash
# Make script executable
chmod +x RENDER_AUTO_DEPLOY.sh

# Run the script
./RENDER_AUTO_DEPLOY.sh
```

### On Windows (Batch)

```cmd
# Run the batch script
RENDER_AUTO_DEPLOY.bat
```

## What the Script Does

The script will:

1. ✅ Collect your credentials
2. ✅ Create PostgreSQL database on Render
3. ✅ Create Redis instance on Render
4. ✅ Deploy backend Web Service
5. ✅ Set all environment variables
6. ✅ Guide you through database migrations
7. ✅ Guide you through frontend updates
8. ✅ Guide you through OAuth configuration
9. ✅ Test the deployment

## Step-by-Step Walkthrough

### Step 1: Provide Credentials
The script will ask for:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- RENDER_API_KEY
- JWT_SECRET (optional)

### Step 2: Create PostgreSQL
The script will attempt to create PostgreSQL via API.
If it fails, you'll be guided to create it manually.

### Step 3: Create Redis
The script will attempt to create Redis via API.
If it fails, you'll be guided to create it manually.

### Step 4: Deploy Backend
The script will attempt to deploy via API.
If it fails, you'll be guided to deploy manually.

### Step 5: Run Migrations
The script will guide you to:
1. Go to Web Service → Shell
2. Run migration commands

### Step 6: Update Frontend
The script will guide you to:
1. Go to Vercel dashboard
2. Update environment variables
3. Redeploy

### Step 7: Configure OAuth
The script will guide you to:
1. Go to Google Cloud Console
2. Add redirect URIs
3. Save

### Step 8: Test
The script will test:
- Backend connectivity
- Frontend connectivity

## Troubleshooting

### PowerShell Execution Policy Error

```
cannot be loaded because running scripts is disabled on this system
```

**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\RENDER_AUTO_DEPLOY.ps1
```

### API Key Not Working

**Solution:**
1. Verify API key is correct
2. Check it's from https://dashboard.render.com/account/api-tokens
3. Make sure it's not expired

### Database Connection Fails

**Solution:**
1. Verify DATABASE_URL is correct
2. Check PostgreSQL is running in Render dashboard
3. Wait a few minutes for database to be ready

### OAuth Redirect URI Mismatch

**Solution:**
1. Verify redirect URIs in Google Cloud Console
2. Ensure they match exactly (including https://)
3. Wait 5 minutes for changes to propagate

### WebRTC Not Connecting

**Solution:**
1. Verify CORS_ORIGIN is set correctly
2. Check backend is running
3. Check browser console for errors

## After Deployment

### Verify Everything Works

1. Visit https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
2. Click "Sign in with Google"
3. Should redirect to Google login
4. After login, should see dashboard
5. Try creating a transfer
6. Verify lock icon appears (encryption working)

### Monitor Logs

- **Render**: https://dashboard.render.com → Web Service → Logs
- **Vercel**: https://vercel.com/dashboard/peerdash → Deployments → Logs

### Common Issues

| Issue | Solution |
|-------|----------|
| Backend not responding | Wait 5 minutes for startup |
| OAuth login fails | Check redirect URIs |
| Files not transferring | Check CORS_ORIGIN |
| Database errors | Check DATABASE_URL |

## Support

If you encounter issues:

1. Check the logs in Render and Vercel dashboards
2. Review RENDER_DEPLOYMENT_GUIDE.md for detailed steps
3. Check RENDER_DEPLOYMENT_CHECKLIST.md for verification steps

## Success!

When everything is working:

- ✅ Frontend loads
- ✅ Google OAuth login works
- ✅ Can create transfers
- ✅ Encryption working (lock icon)
- ✅ Files transfer successfully

---

**Ready to deploy? Run the script now!**

```powershell
.\RENDER_AUTO_DEPLOY.ps1
```

