# Deployment Guide for FitSense AI

This guide explains how to deploy FitSense AI with proper security for the Gemini API integration.

## Prerequisites

- Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- GitHub account
- Vercel or Netlify account

## Option 1: Deploy to Vercel (Recommended)

### Step 1: Prepare your repository
```bash
git clone <your-repo-url>
cd FitnessApp
```

### Step 2: Install Vercel CLI
```bash
npm i -g vercel
```

### Step 3: Deploy
```bash
vercel
```

Follow the prompts to link your project.

### Step 4: Add Environment Variable
```bash
vercel env add GEMINI_API_KEY
```

When prompted, enter your Gemini API key (starts with "AIza...").

Select:
- Production
- Preview  
- Development

### Step 5: Redeploy with environment variable
```bash
vercel --prod
```

Your app is now live! The food scanning feature will work with the server-side API key.

## Option 2: Deploy to Netlify

### Step 1: Connect Repository
1. Go to [Netlify](https://netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub account and select the repository

### Step 2: Configure Build Settings
- **Build command:** (leave empty)
- **Publish directory:** `.`
- **Functions directory:** `api`

### Step 3: Add Environment Variable
1. Go to Site settings → Environment variables
2. Add new variable:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** Your Gemini API key from Google AI Studio

### Step 4: Deploy
Click "Deploy site"

## Testing the Deployment

### Test Food Scan
1. Navigate to the Nutrition section
2. Upload a photo of a banana
3. Verify that it detects "banana" with calories and macros
4. If you see "Server not configured", the environment variable is not set correctly

### Test Pose Detection
1. Navigate to Training section
2. Start camera
3. Verify live skeleton overlay appears
4. Verify no reps are counted when no person is in frame
5. Test pause/resume functionality
6. Test stop button (camera should turn off)

### Test Camera Switching
1. Start training
2. Switch between front/back camera
3. Verify pose detection continues working

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key for food scanning | Yes |

## Security Notes

✅ **DO:**
- Store API keys in environment variables
- Keep API keys server-side only
- Use HTTPS for production deployments
- Rotate API keys periodically

❌ **DON'T:**
- Commit API keys to repository
- Store API keys in localStorage
- Expose API keys in client-side code
- Share API keys publicly

## Troubleshooting

### "Server configuration error"
- Ensure `GEMINI_API_KEY` environment variable is set
- Verify the API key is correct (starts with "AIza")
- Redeploy after adding environment variable

### Food scan not working
- Check browser console for errors
- Verify `/api/food-scan` endpoint is accessible
- Test API key in Google AI Studio

### Pose detection issues
- Ensure camera permission is granted
- Check that MediaPipe libraries are loaded
- Try different lighting conditions
- Use a modern browser (Chrome/Edge recommended)

## Local Development

For local development, you can:

1. Copy `.env.example` to `.env`
2. Add your Gemini API key
3. Use a local server that supports serverless functions:

```bash
# Option 1: Vercel Dev
vercel dev

# Option 2: Netlify Dev
netlify dev
```

## Production Checklist

Before going to production:

- [ ] Environment variables configured
- [ ] API endpoints tested
- [ ] Camera permissions working
- [ ] Food scan tested with various images
- [ ] Pose detection tested from different angles
- [ ] Mobile responsiveness verified
- [ ] HTTPS enabled
- [ ] Error handling tested
- [ ] Performance optimized

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review browser console for errors
3. Verify environment variables are set correctly
4. Test API key independently in Google AI Studio
