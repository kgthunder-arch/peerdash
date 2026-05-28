# Fix: Blank White Screen on Frontend

## Problem

The frontend shows a blank white screen instead of the PeerDash UI.

## Root Cause

The environment variables are not being passed to the Vercel build. The frontend needs:
- `VITE_SIGNAL_SERVER_URL` - Backend URL
- `VITE_API_URL` - Backend API URL
- `VITE_GOOGLE_CLIENT_ID` - Google OAuth Client ID

## Solution

### Step 1: Update Vercel Environment Variables

1. Go to https://vercel.com/dashboard/peerdash
2. Click **Settings** → **Environment Variables**
3. Add these variables for **Production**:

```
VITE_SIGNAL_SERVER_URL = https://peerdash-api.onrender.com
VITE_API_URL = https://peerdash-api.onrender.com/api
VITE_GOOGLE_CLIENT_ID = <your-google-client-id>
```

**Important:** Make sure these are set for **Production** environment, not just Preview.

### Step 2: Redeploy Frontend

1. Go to https://vercel.com/dashboard/peerdash
2. Click **Deployments**
3. Click the latest deployment
4. Click **Redeploy** button
5. Wait for build to complete (2-3 minutes)

### Step 3: Verify

1. Visit https://peerdash-bq3w0cdbj-thunder-b46ae398.vercel.app
2. Should see PeerDash UI (not blank)
3. Should see Google login button
4. Open browser console (F12) - should see no errors

## Troubleshooting

### Still Blank After Redeploy?

**Check 1: Browser Cache**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)
- Try incognito/private window

**Check 2: Vercel Logs**
1. Go to Vercel dashboard
2. Click latest deployment
3. Click **Logs** tab
4. Look for build errors

**Check 3: Browser Console**
1. Open browser (F12)
2. Go to **Console** tab
3. Look for JavaScript errors
4. Common errors:
   - "Cannot read property of undefined"
   - "Failed to fetch"
   - "CORS error"

**Check 4: Environment Variables**
1. Go to Vercel Settings → Environment Variables
2. Verify all three variables are set
3. Verify they're set for **Production**
4. Verify values are correct (no typos)

### Error: "Cannot reach backend"

**Solution:**
1. Verify backend URL is correct: https://peerdash-api.onrender.com
2. Check backend is running in Render dashboard
3. Verify CORS_ORIGIN in Render matches frontend URL

### Error: "Google OAuth not configured"

**Solution:**
1. Verify VITE_GOOGLE_CLIENT_ID is set
2. Verify it matches your Google Cloud Console
3. Check Google OAuth redirect URIs are correct

## Quick Fix Checklist

- [ ] Environment variables added to Vercel
- [ ] Variables set for **Production** environment
- [ ] VITE_SIGNAL_SERVER_URL = https://peerdash-api.onrender.com
- [ ] VITE_API_URL = https://peerdash-api.onrender.com/api
- [ ] VITE_GOOGLE_CLIENT_ID = your-client-id
- [ ] Frontend redeployed
- [ ] Browser cache cleared
- [ ] Hard refresh (Ctrl+Shift+R)
- [ ] Checked browser console for errors
- [ ] Backend is running

## Expected Result

After fix:
- ✅ Frontend loads with PeerDash UI
- ✅ Google login button visible
- ✅ No errors in console
- ✅ Can click login button
- ✅ Redirects to Google login

## If Still Not Working

1. **Check Vercel Build Logs**
   - Go to Deployments → Latest → Logs
   - Look for build errors
   - Check if build succeeded

2. **Check Backend Status**
   - Go to https://dashboard.render.com
   - Check if peerdash-api is running
   - Check logs for errors

3. **Check Browser Console**
   - F12 → Console tab
   - Look for JavaScript errors
   - Check Network tab for failed requests

4. **Try Different Browser**
   - Try Chrome, Firefox, Safari
   - Try incognito/private window
   - Try different device

## Contact Support

If still not working:
1. Check Vercel docs: https://vercel.com/docs
2. Check Render docs: https://render.com/docs
3. Check GitHub issues: https://github.com/kgthunder-arch/peerdash/issues

---

**This should fix the blank screen issue!** ✅

