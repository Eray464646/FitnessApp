# Quick Testing Guide

This is a condensed version of the full testing guide. For complete testing instructions, see [TESTING.md](./TESTING.md).

## Prerequisites
1. Deploy to Vercel/Netlify with `GEMINI_API_KEY` environment variable set
2. Use a modern mobile browser (Chrome/Safari recommended)
3. Grant camera permissions when prompted

## Essential Tests

### 1. Food Scan - Banana Test ✅
**What:** Upload/photograph a banana
**Expected:** Should detect "banana" (NOT "no food detected")
- Shows confidence level
- Displays calories (~90-120 kcal)
- Shows macros (protein, carbs, fat)

### 2. Skeleton Tracking ✅
**What:** Start training with camera
**Expected:** Live skeleton overlay appears
- Colored dots on joints (keypoints)
- Lines connecting joints
- Colors indicate confidence (cyan=high, yellow=medium, red=low)
- Skeleton follows movements in real-time

### 3. No Person = No Counting ✅
**What:** Start training WITHOUT person in frame
**Expected:** No rep counting
- Status: "Warte auf Person..."
- Rep count stays at 0
- No skeleton visible

### 4. Pause Stays Paused ✅
**What:** Start training, do 2-3 reps, click "Pause", wait 30 seconds
**Expected:** Training does NOT auto-resume
- Must click "KI-Tracking starten" to continue
- Rep count preserved during pause

### 5. Stop Turns Camera Off ✅
**What:** Start training, click "Training beenden" (red button)
**Expected:** Camera stops immediately
- Video feed goes black
- Skeleton disappears
- Set auto-saves if reps > 0

### 6. Camera Switch Works ✅
**What:** Switch between front/back camera while training
**Expected:** Smooth transition
- Pose tracking continues
- No errors or crashes

### 7. Saved Session Details + Replay ✅
**What:** Complete a set, click on saved set
**Expected:** 
- See all evaluation data (reps, technique score, ROM, tempo)
- Click "🔄 Replay anzeigen" shows skeleton playback

### 8. Delete Saved Session ✅
**What:** Click "🗑️ Löschen" on a saved set, confirm
**Expected:** Set is deleted and persists after reload

**Alternative (Mobile):** Swipe left >60px to delete

### 9. Training Plan Updates ✅
**What:** Change form values (age, goal, equipment, etc.), click "Plan aktualisieren"
**Expected:** Plan regenerates immediately
- Exercises match equipment
- Number of days matches frequency
- Reload preserves all form values

## Error Handling Tests

### API Not Configured
**What:** Deploy without `GEMINI_API_KEY`, try food scan
**Expected:** Error: "Server nicht konfiguriert"

### Camera Denied
**What:** Deny camera permission, start training
**Expected:** Error: "Kamera verweigert"

### No Food Detected
**What:** Upload non-food image
**Expected:** "Kein Essen erkannt" (not an API error)

## Security Verification

### API Key Not Exposed
**What:** Open DevTools Network tab, scan food
**Expected:** 
- Request goes to `/api/food-scan`
- API key NOT visible anywhere
- No "AIza..." in page source

## Performance Check

### Mobile Smoothness
**What:** Use app on iPhone 12+ or Android flagship
**Expected:** 
- Skeleton tracking at ~30fps
- No lag or stuttering
- Responsive UI

## Quick Success Criteria

✅ Banana test detects food correctly  
✅ Skeleton tracks live movements  
✅ No counting without person  
✅ Pause doesn't auto-resume  
✅ Stop button works instantly  
✅ Camera switching works  
✅ Replay shows skeleton  
✅ Delete works (with confirmation)  
✅ Plan updates on form change  
✅ API key stays server-side  

If all ✅ pass → Ready for deployment!
