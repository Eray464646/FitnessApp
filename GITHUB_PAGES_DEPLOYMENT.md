# GitHub Pages + Vercel Proxy Deployment Guide

This guide explains how to deploy FitSense AI on **GitHub Pages** (for the frontend) with a **Vercel proxy** (for Gemini API calls) to solve CORS issues.

## Architecture

```
GitHub Pages (Frontend)
    ↓ (food scan request)
Vercel Proxy (Serverless)
    ↓ (with user API key)
Google Gemini API
```

**Why this setup?**
- GitHub Pages cannot call Gemini API directly due to CORS restrictions
- Vercel serverless functions act as a proxy that forwards requests
- Users provide their own API keys (not stored server-side)
- The proxy is stateless and doesn't persist any data

## Prerequisites

1. **GitHub Account** - For hosting the frontend
2. **Vercel Account** - For hosting the proxy API (free tier is sufficient)
3. **Google Gemini API Key** - Get one from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Step 1: Deploy Frontend to GitHub Pages

### Option A: Via GitHub UI
1. Go to your repository settings
2. Navigate to **Pages** section
3. Under "Source", select your branch (usually `main`)
4. Select root folder `/`
5. Click **Save**
6. Wait a few minutes for deployment
7. Your site will be available at: `https://[username].github.io/[repo-name]`

### Option B: Via GitHub Actions
The repository may already have a GitHub Actions workflow for automatic deployment.

## Step 2: Deploy Proxy to Vercel

### Option 1: Via Vercel Dashboard (Recommended for Beginners)

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. **Configure Project:**
   - Framework Preset: **Other**
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
   - Install Command: (leave empty)
5. Click **Deploy**
6. Once deployed, note your Vercel URL: `https://[your-project].vercel.app`

### Option 2: Via Vercel CLI (Advanced)

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: fitsense-ai (or your choice)
# - Directory: ./ (current directory)
# - Override settings? No

# Deploy to production
vercel --prod
```

## Step 3: Configure CORS (Important!)

After deploying to Vercel, you need to update the CORS settings in the proxy to allow your GitHub Pages URL.

1. Edit `api/food-scan.js` and `api/food-scan-test.js`
2. Update the `ALLOWED_ORIGINS` array:
   ```javascript
   const ALLOWED_ORIGINS = [
     'https://[your-username].github.io',  // Replace with your GitHub Pages URL
     'http://localhost:8000',
     'http://localhost:3000',
     'http://127.0.0.1:8000'
   ];
   ```
3. Commit and push the changes
4. Vercel will auto-deploy the update

## Step 4: Test the Setup

### Test the Proxy
1. Visit your GitHub Pages site: `https://[username].github.io/[repo]`
2. Navigate to **Profil** → **KI-Einstellungen**
3. Enter your Gemini API Key
4. Click **"Key setzen"**
5. Click **"🔍 Food Scanner testen"**
6. You should see: ✅ **Food Scanner Test erfolgreich! Modus: proxy**

### Test Food Scanning
1. Navigate to **Ernährung**
2. Upload a photo of food (e.g., banana)
3. The app should:
   - Try direct API call first (will fail due to CORS)
   - Automatically fall back to proxy
   - Successfully detect the food

## How It Works

### Dual-Mode Architecture

The app uses an **auto-fallback** system:

1. **Direct Mode** (default for local development):
   - Calls Gemini API directly from browser
   - Fast, no proxy overhead
   - Works locally but fails on GitHub Pages (CORS)

2. **Proxy Mode** (automatic fallback):
   - Calls Vercel serverless function
   - Function forwards request to Gemini API
   - Returns result to frontend
   - Works on GitHub Pages

### Security Features

✅ **User API Keys:**
- Keys are provided by users
- Stored ONLY in browser memory (not localStorage)
- Cleared on page refresh
- Never logged or persisted

✅ **Proxy Security:**
- CORS restricted to allowed origins only
- Rate limiting (10 requests/minute per IP)
- Max image size (4MB)
- API key validation
- No key storage on server

✅ **Privacy:**
- User images are not stored
- API keys are not stored
- Requests are stateless

## Troubleshooting

### "API-Verbindung fehlgeschlagen"
- **Check API Key**: Ensure it starts with "AIza"
- **Check CORS**: Make sure your GitHub Pages URL is in `ALLOWED_ORIGINS`
- **Check Vercel Deployment**: Ensure the proxy is deployed and running

### "CORS blockiert & Proxy nicht verfügbar"
- The proxy is not deployed or not accessible
- Redeploy the proxy to Vercel
- Check Vercel logs for errors

### "Test fehlgeschlagen (401/403)"
- Invalid API key
- Get a new key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### "Test fehlgeschlagen (429)"
- API quota exceeded
- Wait or upgrade your Gemini API quota

### Food not detected
- Ensure good lighting and clear photo
- Try a simpler food item (e.g., banana)
- The new prompt should detect most foods with confidence > 40%

## Local Development

For local development, you can run without the proxy:

```bash
# Start local server
python -m http.server 8000

# Or use Vercel dev for full stack
vercel dev
```

The app will automatically use **direct mode** when running locally.

## Deployment Checklist

Before going live:

- [ ] Frontend deployed to GitHub Pages
- [ ] Proxy deployed to Vercel
- [ ] CORS configured with GitHub Pages URL
- [ ] Food Scanner test works
- [ ] Banana detection test passes
- [ ] Mixed meal detection test passes
- [ ] Error messages are clear and helpful

## Cost Considerations

### Free Tier Limits

**GitHub Pages:**
- ✅ Free for public repositories
- ✅ 100 GB bandwidth/month
- ✅ 10 builds/hour

**Vercel:**
- ✅ Free tier includes:
  - 100 GB bandwidth/month
  - 100,000 serverless function invocations/month
  - 100 hours serverless function execution/month

**Google Gemini API:**
- ✅ Free tier (as of 2024):
  - 15 requests/minute
  - 1,500 requests/day
  - 1 million requests/month (free quota)

For typical usage (< 100 food scans/day), everything stays free.

## Advanced Configuration

### Custom Domain (Optional)

If you want to use a custom domain:

1. **GitHub Pages:**
   - Settings → Pages → Custom domain
   - Add CNAME record in your DNS

2. **Vercel:**
   - Project Settings → Domains
   - Add your domain

### Environment Variables (Optional)

If you want to provide a **default server-side API key** (not recommended for security):

```bash
vercel env add GEMINI_API_KEY
# Enter your key when prompted
vercel --prod
```

This allows users to use the app without providing their own key, but increases your API costs.

## Support

For issues:
1. Check Vercel logs: `vercel logs [deployment-url]`
2. Check browser console for errors
3. Verify API key is valid
4. Test locally first with `vercel dev`

## Next Steps

After deployment:
1. Test all features thoroughly
2. Share the GitHub Pages URL with users
3. Monitor Vercel usage in the dashboard
4. Consider adding analytics (optional)
