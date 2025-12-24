# Testing Instructions: Client-Side API Key Management

This document provides step-by-step instructions for testing the new client-side API key management feature.

## Prerequisites

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Start the application (local or deployed)

## Test Cases

### Test 1: Set API Key

**Steps:**
1. Navigate to **Profil** tab (bottom navigation)
2. Scroll to **KI-Einstellungen** section
3. Verify status shows: **❌ Nicht gesetzt**
4. Enter your Gemini API key in the input field (starts with "AIza")
5. Click the eye icon (👁️) to verify the key is visible
6. Click the eye icon again (🙈) to hide the key
7. Click **✅ Key setzen / Speichern (nur für diese Sitzung)**
8. Accept the alert dialog

**Expected Result:**
- Alert shows: "✅ API Key gesetzt! Der Key wird nur für diese Sitzung gespeichert und geht nach einem Reload verloren."
- Status changes to: **✅ Gesetzt**
- Details show: "API Key gespeichert (nur für diese Sitzung)"
- Input field is cleared (for security)

---

### Test 2: Test Food Scanner

**Steps:**
1. After setting the API key (Test 1)
2. Click **🔍 Food Scanner testen** button
3. Wait for the test to complete

**Expected Result:**
- If key is valid: Alert shows "✅ Food Scanner Test erfolgreich! Dein API Key funktioniert einwandfrei."
- Status changes to: **✅ Verbindung ok**
- "Letzter Test" timestamp is updated
- If key is invalid: Alert shows error message and status shows **❌ Ungültig**

---

### Test 3: Scan Food Image

**Steps:**
1. After setting a valid API key
2. Navigate to **Ernährung** tab
3. Click **Mahlzeit fotografieren** area
4. Select a food image (e.g., banana, apple, meal)
5. Wait for AI analysis

**Expected Result:**
- Loading message appears: "🔍 KI analysiert das Bild..."
- AI detects the food and displays:
  - Food name (label)
  - Confidence percentage
  - Detected items
  - Nutritional information (calories, protein, carbs, fat)
- Status pill shows: "Analyse abgeschlossen"

**Test with different scenarios:**
- **High confidence food** (e.g., banana): Should show detected food with nutritional info
- **Low confidence food**: Should show "Unsicher – bitte bestätigen" message
- **Non-food image**: Should show "Kein Essen erkannt" message

---

### Test 4: Delete API Key

**Steps:**
1. After setting an API key
2. Navigate to **Profil** → **KI-Einstellungen**
3. Click **🗑️ Key löschen** button
4. Confirm deletion in the dialog

**Expected Result:**
- Alert shows: "API Key wurde gelöscht."
- Status changes to: **❌ Nicht gesetzt**
- Details show: "Bitte gib deinen Gemini API Key ein"
- Food preview is cleared
- Food details show: "API Key gelöscht. Bitte neuen Key eingeben."

---

### Test 5: Food Scan Without API Key

**Steps:**
1. Make sure NO API key is set (delete if needed)
2. Navigate to **Ernährung** tab
3. Try to upload a food image

**Expected Result:**
- Alert shows: "Bitte zuerst einen API Key eingeben! Gehe zu Profil → KI-Einstellungen und gib deinen Gemini API Key ein."
- File input is cleared
- Food details show: "API Key fehlt" with instructions

---

### Test 6: Key Persistence (Should NOT Persist)

**Steps:**
1. Set an API key following Test 1
2. Verify status shows **✅ Gesetzt**
3. Refresh the page (F5 or browser reload)
4. Navigate to **Profil** → **KI-Einstellungen**

**Expected Result:**
- Status shows: **❌ Nicht gesetzt**
- This confirms the key is stored ONLY in memory and cleared on refresh
- Security requirement: ✅ PASSED

---

### Test 7: Training Section (Should Work Independently)

**Steps:**
1. Navigate to **Training** tab
2. Click **KI-Tracking starten**
3. Allow camera access if prompted
4. Perform some exercises

**Expected Result:**
- Pose estimation works normally
- Rep counting works
- Skeleton overlay is displayed
- Training functionality is NOT affected by API key status
- This confirms pose estimation is independent of food scanning

---

### Test 8: Session-Only Storage Verification

**Steps:**
1. Set an API key
2. Open browser DevTools (F12)
3. Check **Application** → **Local Storage**
4. Check **Application** → **Session Storage**
5. Check **Application** → **Cookies**
6. Check **Application** → **IndexedDB**

**Expected Result:**
- API key is NOT found in any of these storage locations
- Only `fitnessAppState` exists in localStorage (contains sets, food entries, plan, profile)
- Security requirement: ✅ PASSED

---

### Test 9: API Key Security (Header vs Query Param)

**Steps:**
1. Set a valid API key
2. Open browser DevTools → **Network** tab
3. Navigate to **Ernährung** and upload a food image
4. Find the request to `generativelanguage.googleapis.com`
5. Click on the request and check **Headers**

**Expected Result:**
- Request URL should NOT contain `?key=` parameter
- Request Headers should contain: `x-goog-api-key: AIza...`
- This prevents the key from appearing in browser history and server logs
- Security requirement: ✅ PASSED

---

## Error Scenarios

### Invalid API Key
**Steps:** Enter an invalid key (e.g., "test123")
**Expected:** Test button shows "API-Authentifizierung fehlgeschlagen - Ungültiger Key"

### API Quota Exceeded
**Steps:** Use key with exceeded quota
**Expected:** Shows "API-Limit erreicht - Quotenbegrenzung überschritten"

### Network Error
**Steps:** Disconnect internet and try to scan
**Expected:** Shows "Fehler beim Testen" with network error message

---

## Summary

All tests should pass to confirm:
- ✅ API key is stored ONLY in memory
- ✅ Key is cleared on page refresh
- ✅ Key can be set, tested, and deleted
- ✅ Food scanning works with user-provided key
- ✅ Guard prevents scanning without key
- ✅ No persistence in localStorage, sessionStorage, cookies, or IndexedDB
- ✅ API key is sent via header (not URL parameter)
- ✅ Training/pose estimation works independently
