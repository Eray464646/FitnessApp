# Testing Guide for MX

This guide provides step-by-step instructions for testing all features of the MX application.

## Prerequisites

Before testing:
1. Deploy the application to Vercel or Netlify with proper environment variables
2. Set `GEMINI_API_KEY` environment variable on the server
3. Test on a modern mobile browser (Chrome/Safari recommended)
4. Grant camera permissions when prompted

## Part 1: Food Scan Testing

### Test 1: Banana Image Detection ✅
**Expected Result:** Should detect "banana" with estimated calories and macros

**Steps:**
1. Navigate to the "Ernährung" (Nutrition) tab
2. Click on "Mahlzeit fotografieren" or upload a clear banana image
3. Wait for analysis (should show "🔍 KI analysiert das Bild...")
4. Verify the result shows:
   - Label: "Banane" or "Banana"
   - Confidence level (should be > 60%)
   - Calories (approximately 90-120 kcal for medium banana)
   - Macros: Protein, Carbs, Fat
   - Detected items list

**Failure Cases to Test:**
- Upload non-food image → Should show "Kein Essen erkannt"
- Upload blurry food image → Should show low confidence message
- Server not configured → Should show "Server configuration error"

### Test 2: Portion Adjustment
**Steps:**
1. After successful food detection
2. Adjust the portion slider (0.5x to 2x)
3. Verify calories and macros scale accordingly

### Test 3: Food Log Persistence
**Steps:**
1. Scan a food item successfully
2. Click "Zum Tagebuch hinzufügen"
3. Verify item appears in "Tagebuch" section
4. Reload the page
5. Verify food entry persists in log

## Part 2: Pose Estimation & Training

### Test 1: Person Detection Gating ✅
**Expected Result:** No rep counting without person in frame

**Steps:**
1. Navigate to "Training" tab
2. Select an exercise (e.g., "Kniebeugen")
3. Click "KI-Tracking starten"
4. Grant camera permission
5. **WITHOUT person in frame:**
   - Status should show "Warte auf Person..."
   - Feedback: "Warte auf Person im Bild"
   - Rep count: 0
   - No skeleton visible
6. **Enter frame:**
   - Status changes to "Person erkannt"
   - After 3 stable frames: "Keypoints stabil"
   - Skeleton overlay appears
7. **Leave frame:**
   - After 3 frames: Status returns to "Warte auf Person..."
   - Rep counting stops

### Test 2: Live Skeleton Overlay ✅
**Expected Result:** Real-time skeleton tracking visible during recording

**Steps:**
1. Start training with camera
2. Position yourself in frame
3. Verify you see:
   - Colored dots on body joints (keypoints)
   - Lines connecting joints (skeleton)
   - Colors indicate confidence:
     - Cyan/Blue: High confidence (>75%)
     - Yellow: Medium confidence (50-75%)
     - Red: Low confidence (<50%)
4. Move around and verify skeleton follows your movements in real-time

### Test 3: Squat Rep Counting
**Expected Result:** Accurate rep counting based on hip/knee angles

**Steps:**
1. Select "Kniebeugen" exercise
2. Start training
3. Perform squats with proper form:
   - Stand upright (starting position)
   - Lower down (hip and knee angles decrease)
   - Stand back up (hip and knee angles increase)
4. Verify:
   - Rep count increases by 1 for each complete squat
   - Feedback shows movement phase:
     - "Abwärtsbewegung" during descent
     - "Saubere Wiederholung" on completion
   - Auto-saves at 12 reps

### Test 4: Push-up Rep Counting
**Expected Result:** Accurate rep counting based on elbow angle

**Steps:**
1. Select "Liegestütze" exercise
2. Start training
3. Perform push-ups:
   - Arms extended (start)
   - Lower body (elbow angle < 90°)
   - Push back up (elbow angle > 160°)
4. Verify rep counting works correctly

### Test 5: State Machine - Pause Functionality ✅
**Expected Result:** Pause stays paused until user resumes

**Steps:**
1. Start training
2. Perform 2-3 reps
3. Click "Pause"
4. Verify:
   - Status shows "Pausiert"
   - Feedback: "Training pausiert"
   - Rep counting stops
   - Skeleton detection continues (but no counting)
5. Wait 30 seconds
6. Verify training does NOT auto-resume
7. Click "KI-Tracking starten" to resume
8. Verify training resumes where it left off

### Test 6: Stop Button ✅
**Expected Result:** Camera turns off immediately

**Steps:**
1. Start training
2. Perform some reps
3. Click "Training beenden" (red Stop button)
4. Verify:
   - Camera stops immediately
   - Video feed turns black
   - Skeleton disappears
   - Status: "Training beendet"
   - If reps > 0: Set is automatically saved

### Test 7: Camera Switching ✅
**Expected Result:** Smooth camera transition without crashing

**Steps:**
1. Start training with rear camera
2. While in READY or PAUSED state
3. Change camera dropdown to "Frontkamera"
4. Verify:
   - Camera switches smoothly
   - Pose detection continues
   - No errors in console
   - Skeleton tracking resumes
5. Switch back to rear camera
6. Verify it works in both directions

### Test 8: Different Angles
**Expected Result:** Pose detection works from various angles

**Steps:**
1. Test frontal view (facing camera)
2. Test side view (90° angle to camera)
3. Test diagonal view (45° angle to camera)
4. Verify:
   - Skeleton visible in all angles
   - May show lower confidence from side (yellow/red)
   - Rep counting still functional with good lighting

## Part 3: Saved Sessions & Replay

### Test 1: Session Saving
**Steps:**
1. Complete a set (or click "Satz speichern" manually)
2. Verify set appears in "Sätze & Technik" section
3. Check displayed info:
   - Exercise name
   - Rep count
   - Technique score (%)
   - ROM (Range of Motion)
   - Tempo
   - Timestamp

### Test 2: Skeleton Replay ✅
**Expected Result:** Can replay skeleton movement from saved set

**Steps:**
1. Click "🔄 Replay anzeigen" on a saved set
2. Verify:
   - Replay plays in "Pose Replay" section
   - Shows skeleton visualization frame-by-frame
   - Progress bar indicates playback position
   - Quality metrics displayed
   - Can click "🔄 Erneut abspielen" to replay again

### Test 3: Delete Saved Set ✅
**Expected Result:** Can delete sets with confirmation

**Steps:**
1. Click "🗑️ Löschen" on a saved set
2. Verify confirmation dialog appears
3. Click "Cancel" → Set remains
4. Click "🗑️ Löschen" again
5. Click "OK" → Set is deleted
6. Verify set disappears from list
7. Reload page → Verify deletion persists

### Test 4: Swipe-to-Delete (Mobile) ✅
**Expected Result:** Swipe left to delete

**Steps:**
1. On a touch device, swipe a saved set to the left
2. Swipe at least 60px
3. Verify confirmation dialog appears
4. Test both confirm and cancel

### Test 5: Detailed View
**Steps:**
1. Click on a saved set
2. Verify you can see:
   - All reps performed
   - Per-rep quality scores
   - Technique feedback
   - Timestamps
   - Full skeleton data

## Part 4: Training Plan

### Test 1: Form Persistence ✅
**Expected Result:** Form values persist across reloads

**Steps:**
1. Navigate to "Plan" tab
2. Change all form values:
   - Age: 35
   - Gender: Männlich
   - Height: 185 cm
   - Weight: 80 kg
   - Level: Mittel
   - Goal: Muskelaufbau
   - Frequency: 4
   - Equipment: Kurzhanteln
3. Click "Plan aktualisieren"
4. Reload the page
5. Navigate to "Plan" tab
6. Verify all values are preserved

### Test 2: Plan Generation
**Steps:**
1. Update form with different values
2. Click "Plan aktualisieren"
3. Verify:
   - Plan updates immediately (no page reload needed)
   - Number of days matches frequency
   - Exercises match equipment selection
   - Focus areas align with goal
   - Exercise count varies by level

### Test 3: Equipment-Based Exercises
**Steps:**
1. Set Equipment to "Körpergewicht"
2. Update plan
3. Verify exercises are bodyweight only (e.g., Kniebeugen, Liegestütze)
4. Set Equipment to "Studio"
5. Update plan
6. Verify gym exercises appear (e.g., Bankdrücken, Klimmzüge)

## Part 5: Dashboard Integration

### Test 1: Today's Stats
**Steps:**
1. Perform some training sets
2. Add some food entries
3. Navigate to Dashboard
4. Verify:
   - "Wiederholungen" shows total reps from today
   - "Technik-Score" shows average technique %
   - "kcal" shows total calories from today
   - "Protein" shows total protein from today

### Test 2: Streak Counter
**Steps:**
1. Use the app for multiple days
2. Check "Streak" number on dashboard
3. Verify it counts consecutive days of activity

### Test 3: Recent Activity
**Steps:**
1. Mix training and food entries
2. Check "Letzte Aktivitäten" section
3. Verify both types appear in chronological order

## Part 6: Error Handling

### Test 1: Network Errors
**Steps:**
1. Turn off internet
2. Try food scanning
3. Verify clear error message (not generic "Error")

### Test 2: Camera Permission Denied
**Steps:**
1. Deny camera permission
2. Try starting training
3. Verify error message: "Kamera verweigert"

### Test 3: API Key Not Configured
**Steps:**
1. Deploy without GEMINI_API_KEY environment variable
2. Try food scanning
3. Verify error: "Server nicht konfiguriert"

## Performance Testing

### Mobile Performance
**Expected:** Smooth 30fps skeleton tracking on modern phones

**Steps:**
1. Test on:
   - iPhone 12 or newer
   - Android flagship (2020+)
2. Start pose tracking
3. Verify:
   - Skeleton updates smoothly (no lag)
   - No frame drops
   - Camera feed is responsive

### Battery Impact
**Steps:**
1. Start training session
2. Monitor battery drain
3. Expected: ~10-15% per 30 minutes of active tracking

## Security Testing

### Test 1: API Key Not Exposed
**Steps:**
1. Open browser DevTools
2. Go to Network tab
3. Scan food
4. Verify:
   - Request goes to `/api/food-scan`
   - API key is NOT visible in request headers or body
   - Response doesn't contain API key

### Test 2: Environment Variables
**Steps:**
1. View page source
2. Search for "AIza" or "GEMINI"
3. Verify NO API keys in HTML/JavaScript

## Cross-Browser Testing

Test on:
- ✅ Chrome (Desktop & Mobile)
- ✅ Safari (iOS)
- ✅ Firefox
- ✅ Edge

## Accessibility Testing

### Screen Reader
**Steps:**
1. Enable VoiceOver (iOS) or TalkBack (Android)
2. Navigate through app
3. Verify all buttons and controls are announced

### Keyboard Navigation
**Steps:**
1. Use Tab key to navigate
2. Verify all interactive elements are reachable
3. Enter/Space activates buttons

## Final Checklist

Before deployment:
- [ ] All food scan tests pass
- [ ] All pose estimation tests pass
- [ ] All saved session tests pass
- [ ] Training plan works correctly
- [ ] Dashboard shows accurate data
- [ ] No security vulnerabilities
- [ ] Performs well on mobile
- [ ] Works in multiple browsers
- [ ] Error handling is clear and helpful
- [ ] Data persists correctly across reloads
