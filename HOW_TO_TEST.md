# How to Test This PR

This guide provides step-by-step instructions for testing the Food Scanner improvements.

## Prerequisites

1. **Gemini API Key**: Get one from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. **Test Images**: Prepare test images:
   - Single food item (e.g., banana)
   - Mixed meal (e.g., chicken + rice + vegetables)
   - Non-food (e.g., landscape, car)

## Local Testing (Recommended First)

### Setup
```bash
# Clone the branch
git checkout copilot/improve-food-scanner-detection

# Start local server
python -m http.server 8000

# Open in browser
# Navigate to http://localhost:8000
```

### Test 1: API Key Setup
1. Navigate to **Profil** tab (bottom right)
2. Scroll to **KI-Einstellungen** section
3. Enter your Gemini API key in the input field
4. Click **"✅ Key setzen / Speichern"**
5. ✅ **Expected:** Alert "API Key gesetzt!"
6. ✅ **Expected:** Status shows "✅ Gesetzt"

### Test 2: Test Connection (Direct Mode)
1. Click **"🔍 Food Scanner testen"** button
2. Wait for test to complete (5-10 seconds)
3. ✅ **Expected:** Alert "Food Scanner Test erfolgreich! Modus: direct"
4. ✅ **Expected:** Last test timestamp updated
5. ✅ **Expected:** Status shows "✅ OK"

### Test 3: Banana Detection
1. Navigate to **Ernährung** tab
2. Click **"Mahlzeit fotografieren"** or upload banana image
3. Wait for analysis (3-5 seconds)
4. ✅ **Expected Results:**
   - Label: "Banana" or "Banane"
   - Confidence: > 70%
   - Calories: ~90-120 kcal
   - Macros: Protein ~1g, Carbs ~25-30g, Fat ~0-1g
   - Items list: ["Banana"] or ["Banane"]
5. ❌ **NOT Expected:** "Kein Essen erkannt"

### Test 4: Mixed Meal Detection
1. Upload image with multiple foods (e.g., plate with chicken, rice, vegetables)
2. ✅ **Expected Results:**
   - Multiple items detected (e.g., "Chicken, Rice, Broccoli")
   - Each item should be listed
   - Total calories and macros calculated
   - Confidence varies per item
3. ❌ **NOT Expected:** Only one item detected when multiple are visible

### Test 5: Non-Food Image
1. Upload landscape or object photo (no food)
2. ✅ **Expected Results:**
   - Message: "Kein Essen erkannt" OR "Unsicher – bitte bestätigen"
   - No nutrition data shown
   - Reasoning explains why (e.g., "Dies ist eine Landschaft, kein Essen")

### Test 6: Invalid API Key
1. Delete current key: Click **"🗑️ Key löschen"**
2. Enter invalid key: "invalid_key_12345"
3. Click "Key setzen"
4. Click "Food Scanner testen"
5. ✅ **Expected:** Error message about invalid key (401/403)
6. ✅ **Expected:** Status shows "❌ Ungültig"

### Test 7: No API Key
1. Delete key if set
2. Try to upload food image
3. ✅ **Expected:** Alert "Bitte zuerst einen API Key eingeben!"
4. ✅ **Expected:** Error message shown in food details area

### Test 8: AI Portion Estimation
1. Detect a food item successfully
2. Review AI-estimated portion and macros
3. ✅ **Expected:** Macros based on AI-estimated portion (no manual slider)
4. ✅ **Expected:** Portion size automatically determined from visual cues in image

## Production Testing (GitHub Pages + Vercel)

### Prerequisites
1. Deploy frontend to GitHub Pages
2. Deploy proxy to Vercel
3. Update CORS in `api/food-scan.js` with your GitHub Pages URL

### Test 1: CORS Blocked (Direct Mode)
1. Open GitHub Pages URL
2. Enter API key and test
3. ✅ **Expected:** Direct mode fails silently
4. ✅ **Expected:** Auto-fallback to proxy mode
5. ✅ **Expected:** Test succeeds with "Modus: proxy"

### Test 2: Proxy Mode Food Detection
1. Upload banana image
2. ✅ **Expected:** Detection works via proxy
3. ✅ **Expected:** Results same as local test
4. Check browser DevTools Network tab
5. ✅ **Expected:** Request goes to `/api/food-scan` (not Gemini directly)

### Test 3: Rate Limiting
1. Rapidly upload 15+ food images (within 1 minute)
2. ✅ **Expected:** After 10 requests, see "Rate limit exceeded" error
3. ✅ **Expected:** Wait 1 minute, then works again

## Edge Cases & Error Handling

### Test 1: Very Large Image
1. Upload high-resolution image (> 5MB)
2. ✅ **Expected:** Image compressed automatically before upload
3. ✅ **Expected:** Detection still works

### Test 2: Unsupported Format
1. Try to upload .bmp or .gif file
2. ✅ **Expected:** Error "Ungültiges Bildformat"

### Test 3: Network Offline
1. Disconnect internet
2. Try to scan food
3. ✅ **Expected:** Clear network error message

### Test 4: API Quota Exceeded
1. If you hit Gemini API quota limit
2. ✅ **Expected:** Error message "API-Limit erreicht (429)"
3. ✅ **Expected:** Helpful message to wait or upgrade quota

## Acceptance Criteria Checklist

Use this checklist to verify all requirements are met:

### Food Detection
- [ ] ✅ Banana detected with high confidence (>70%)
- [ ] ✅ Mixed meal: All items detected
- [ ] ✅ Non-food: "Kein Essen erkannt" or "Unsicher"
- [ ] ❌ No "Kein Essen erkannt" for obvious food
- [ ] ✅ Multi-item detection works
- [ ] ✅ Calories and macros reasonable

### API Modes
- [ ] ✅ Local: Direct mode works
- [ ] ✅ GitHub Pages: Proxy mode works
- [ ] ✅ Auto-fallback from direct to proxy
- [ ] ✅ Test button shows which mode succeeded

### Error Handling
- [ ] ✅ Invalid key: Clear error message (401/403)
- [ ] ✅ No key: Prevented from scanning, helpful message
- [ ] ✅ CORS: Explained clearly or auto-fallback
- [ ] ✅ Quota: "API-Limit erreicht (429)"
- [ ] ✅ Network: Clear network error

### Security
- [ ] ✅ API key not in localStorage (check DevTools)
- [ ] ✅ API key cleared on page refresh
- [ ] ✅ API key not visible in Network requests (check payload)
- [ ] ✅ Delete key works immediately

### UI/UX
- [ ] ✅ Status indicator updates correctly
- [ ] ✅ Last test timestamp shown
- [ ] ✅ AI automatically estimates portions from food images
- [ ] ✅ Food log saves items
- [ ] ✅ Error messages in German, clear and helpful

## Troubleshooting

### "API-Verbindung fehlgeschlagen"
- Check API key is valid (starts with "AIza")
- Try test button first
- Check internet connection
- On GitHub Pages: Ensure proxy is deployed

### "Kein Essen erkannt" for obvious food
- Try with better lighting
- Use clearer, closer photo
- Check confidence threshold (should be 40%)
- Try with simpler food first (banana)

### Direct mode always fails on GitHub Pages
- This is expected due to CORS
- Should auto-fallback to proxy
- If no proxy, deploy to Vercel first

### Proxy not available
- Deploy proxy to Vercel: `vercel --prod`
- Update CORS in proxy code
- Verify proxy URL is correct

## Reporting Issues

If you find bugs:

1. Note exact steps to reproduce
2. Check browser console for errors (F12 → Console)
3. Check Network tab for failed requests
4. Screenshot error messages
5. Report with:
   - Browser version
   - Testing mode (local/production)
   - API mode (direct/proxy)
   - Error message
   - Expected vs actual behavior

## Success Criteria

All tests passed? ✅
- Food detection works reliably
- Error messages are clear
- API key management secure
- Proxy fallback works on GitHub Pages
- No security vulnerabilities
- Documentation is clear

**Status: READY TO MERGE** 🎉
