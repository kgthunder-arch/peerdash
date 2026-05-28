# Manual Fix: Blank Screen (3 Simple Steps)

## The Problem
Frontend shows blank white screen because environment variables are missing.

## The Solution (3 Steps - 5 Minutes)

### Step 1: Add Environment Variables to Vercel

**Go to:** https://vercel.com/dashboard/peerdash

**Click:** Settings → Environment Variables

**Add these 3 variables** (make sure to select **Production** for each):

```
Name: VITE_SIGNAL_SERVER_URL
Value: https://peerdash-api.onrender.com
Environment: Production

Name: VITE_API_URL
Value: https://peerdash-api.onrender.com/api
Environment: Production

Name: VITE_GOOGLE_CLIENT_ID
Value: <your-google-client-id>
Environment: Production
```

**⚠️ IMPORTANT:** Select **Production** environment, not Preview!

### Step 2: Redeploy Frontend

**Go to:** https://vercel.com/dashboard/peerdash

**Click:** Deployments → Latest deployment → Redeploy

**Wait:** 2-3 minutes for build to complete

### Step 3: Clear Cache & Refresh

1. Press: **Ctrl+Shift+Delete** (clear browser cache)
2. Press: **Ctrl+Shift+R** (hard refresh)
3. Visit: https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app

## ✅ Done!

You should now see the PeerDash UI with the Google login button.

## If Still Blank

**Check 1:** Did you select **Production** environment?
- Go back to Settings → Environment Variables
- Verify all 3 variables show "Production"

**Check 2:** Did the build complete?
- Go to Deployments
- Check if latest deployment shows "Ready"

**Check 3:** Clear cache again
- Ctrl+Shift+Delete
- Ctrl+Shift+R
- Try incognito window

**Check 4:** Check browser console
- Press F12
- Go to Console tab
- Look for red errors

## Need Your Google Client ID?

1. Go to: https://console.cloud.google.com
2. Go to: APIs & Services → Credentials
3. Find your OAuth 2.0 Client
4. Copy the Client ID
5. Use it in Step 1 above

---

**That's it! This should fix the blank screen.** ✅

