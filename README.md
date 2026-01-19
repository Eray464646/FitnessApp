## KI-basierte Fitness- und Ernährungsplattform (Mobile First)

Interaktive mobile Web-App für KI-gestützte Bewegungserkennung mit **MediaPipe Pose**, automatisches Trainingstracking, Food-Scan mit **Google Gemini Vision API** und intelligenter Trainingsplanung.

### 🚀 Schnellstart

#### Lokale Entwicklung
1. Repo clonen / herunterladen  
2. `index.html` im Browser öffnen (oder lokalen Server nutzen: `python -m http.server 8000`)  
3. Kamera-Tracking im Bereich **Training** aktivieren
4. Für Food Scanner: Eigenen Gemini API Key im Profil eingeben

#### Deployment Optionen

**Option 1: GitHub Pages + Vercel Proxy (Empfohlen für Produktion)**
- ✅ Frontend kostenlos auf GitHub Pages
- ✅ Serverless Proxy auf Vercel (löst CORS-Probleme)
- ✅ Benutzer verwenden eigene API Keys
- 📖 **[Vollständige Anleitung →](GITHUB_PAGES_DEPLOYMENT.md)**

**Option 2: Vercel (All-in-One)**
1. Vercel Account erstellen auf [vercel.com](https://vercel.com)
2. Repository verbinden
3. (Optional) Environment Variable setzen: `GEMINI_API_KEY`
4. Deploy ausführen

### 🔐 Sicherheit & API-Schlüssel

**DUAL-MODE System für maximale Flexibilität:**

#### Modus 1: Benutzer-Bereitgestellte API Keys (Standard)
- ✅ **Nutzer bringen ihre eigenen Gemini API Keys mit**
- ✅ **Nur im Browser-Speicher (Session-Only)**
- ✅ Nie in localStorage, Cookies oder Server gespeichert
- ✅ Geht nach Seiten-Reload verloren
- ✅ Maximaler Datenschutz
- 📖 Anleitung: Profil → KI-Einstellungen → API Key eingeben

#### Modus 2: Server-Side API Key (Optional)
- Server stellt API Key bereit (Environment Variable `GEMINI_API_KEY`)
- Nutzer müssen keinen eigenen Key eingeben
- Nur für vertrauenswürdige Deployments empfohlen

**API-Schlüssel erhalten:**
1. Besuche [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Melde dich mit deinem Google-Konto an
3. Klicke auf "Create API Key"
4. Kopiere den generierten Schlüssel (beginnt mit "AIza...")

### 🎯 Implementierte Kernfunktionen

#### **Dashboard (Mobile First)**
- Tages-/Wochenstatus, Streak-Anzeige
- Schnellstart für „Training scannen" und „Mahlzeit scannen"
- Touch-optimierte Bedienung

#### **KI-Training mit echter Human Pose Estimation** 
- **MediaPipe Pose** für Echtzeit-Skelett-Tracking (kein Fake/Animation!)
- **State Machine:** WAITING → READY → ACTIVE ↔ PAUSED → STOPPED
- **Person Detection Gating:** Training startet NUR wenn Person erkannt und stabil getrackt wird
- **Live Skeleton Overlay:** Echtzeit-Darstellung auf Canvas während Recording
- **Wiederholungszählung:** Nur bei aktiver Person und stabilen Keypoints
  - Squat-Erkennung basierend auf Hüft- und Kniewinkel
  - Push-up-Erkennung basierend auf Ellenbogenwinkel
  - Generische Bewegungserkennung für andere Übungen
- **Echte Pause-Funktion:** Bleibt pausiert bis Benutzer fortsetzt (keine automatische Reaktivierung)
- **Stop-Button:** Manuelles Beenden mit zuverlässigem Kamera-Aus
- **Kamera-Switching:** Front-/Rückkamera während READY/PAUSED
- **Technik-Feedback:** Echtzeit-Feedback basierend auf Gelenk-Winkeln und Form
- **Robust aus verschiedenen Blickwinkeln:** Unterstützt frontal, seitlich und schräg

#### **Pose Replay & Analyse**
- Jeder Satz speichert alle erfassten Frames mit vollständigen Keypoint-Daten
- Replay zeigt 2D-Skeleton-Visualisierung mit farbcodierten Keypoints
- **Interaktive Steuerung:**
  - Klickbarer Timeline-Scrubber zum Springen zu beliebigen Frames
  - Play/Pause-Button für automatische Wiedergabe
  - Geschwindigkeitsauswahl (0.5x, 1x, 1.5x, 2x)
  - Schrittweise Navigation (-1 / +1 Frame)
  - Touch-optimiert für mobile Geräte
- Frame-by-Frame-Durchlauf mit Fortschrittsbalken
- Qualitätsmetriken und Form-Feedback
- **Löschfunktion** mit Bestätigungsdialog

#### **Food Scan (KI-gestützt & verbessert)**
- **Dual-Mode Architektur:** Direct API calls + Serverless Proxy Fallback
- **Breite Lebensmittelerkennung:** Obst, Gemüse, Fleisch, Fisch, Reis, Pasta, Brot, Milchprodukte, Snacks, Desserts, Getränke
- **Multi-Item Detection:** Erkennt mehrere Lebensmittel auf einem Teller
- **Gemischte Gerichte:** Bowls, Teller, Salate, Sandwiches, Pasta-Gerichte
- **Intelligente Confidence-Logik:**
  - Hohe Confidence (70-100%): Sicher erkannt
  - Mittlere Confidence (40-69%): "Unsicher – bitte bestätigen"
  - Nur bei definitiv kein Essen: "Kein Essen erkannt"
- **Bildkompression:** Automatische Größenanpassung (max 1024px) für schnellere Uploads
- **Detaillierte Fehlerdiagnose:** CORS, Auth (401/403), Quota (429), Format (400)
- **Proxy-Support für GitHub Pages:** Automatischer Fallback wenn Direct Mode blockiert ist
- **API-Status-Überwachung:**
  - Health Check Endpoint (`/api/food-scan-health`)
  - Visueller Status-Indikator im Profil
  - "Food Scanner testen" Button mit Modus-Anzeige (direct/proxy)
  - Klare Fehlermeldungen
- **Vollautomatische Portionsschätzung durch KI** (visuelle Erkennung ohne manuelle Eingabe)
- Automatische Makro- und Kalorienschätzung basierend auf geschätzter Portion
- Debug-Logging im Development-Modus

#### **KI-Trainingsplanung**
- Formular für Ziel, Level, Frequenz und Equipment
- Automatisch generierter Wochenplan
- **Persistierung:** Alle Werte bleiben über Neuladen erhalten
- Sofortige Plan-Updates bei Änderungen

#### **Datenverwaltung**
- **Saved Sessions:** Vollständige Liste aller Sätze/Workouts
- **Details-Ansicht:** Reps, Technik-Score, ROM, Tempo, Timestamps
- **Skeleton Replay:** Abspielen der aufgezeichneten Bewegungen
- **Löschfunktion:** Button + Bestätigungsdialog (Mobile-freundlich)
- Persistierung in localStorage

### 🏗️ Technologie-Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript (kein Build-Tool erforderlich)
- **Pose Estimation:** MediaPipe Pose (Google)
- **Vision API:** Google Gemini 1.5 Flash
- **Backend:** Serverless Functions (Vercel/Netlify kompatibel)
- **Speicherung:** localStorage für Client-Daten
- **Mobile-First:** Optimiert für Touch-Bedienung und mobile Browser

### 📱 Live Skeleton Visualization

- **Echtzeit-Darstellung** des Skeletts während des Trainings auf Canvas-Overlay
- **33 MediaPipe-Keypoints** konvertiert zu COCO 17-Point-Format
- **Perspektivunabhängige Erkennung:** frontal, seitlich, schräg
- **Farbcodierte Qualitätsanzeige:**
  - Cyan: Hohe Confidence (>75%)
  - Gelb: Mittlere Confidence (50-75%)
  - Rot: Niedrige Confidence (<50%)
- **Adaptive Keypoint-Größe** basierend auf Confidence-Level
- **Smoothing:** Stabile Tracking-Darstellung ohne Jitter

### 🔄 State Machine (Training)

```
WAITING → READY → ACTIVE ↔ PAUSED → STOPPED
```

1. **WAITING:** Wartet auf Person im Bild (keine Rep-Zählung)
2. **READY:** Person erkannt und Keypoints stabil (mindestens 3 stabile Frames)
3. **ACTIVE:** Aktives Tracking und Rep-Zählung
4. **PAUSED:** Manuell pausiert (KEINE automatische Reaktivierung)
5. **STOPPED:** Training beendet, Kamera aus

### 🧪 Testing

#### Food Scan Test (Updated)
1. **Setup:**
   - Navigiere zur Profil-Sektion
   - Gib deinen Gemini API Key ein
   - Klicke "Key setzen"
2. **Test Connection:**
   - Klicke auf "🔍 Food Scanner testen"
   - ✅ Erwartung: "Food Scanner Test erfolgreich! Modus: direct/proxy"
   - Zeigt verwendeten Modus (direct für lokal, proxy für GitHub Pages)
3. **Test Banana Detection:**
   - Navigiere zur Ernährung-Sektion
   - Lade ein Bananen-Bild hoch
   - ✅ Erwartung: "Banane" wird erkannt mit ~100 kcal und Makros
   - ✅ Confidence sollte > 70% sein
4. **Test Mixed Meal:**
   - Lade ein Foto mit mehreren Lebensmitteln (z.B. Chicken + Rice + Salad)
   - ✅ Erwartung: Alle Komponenten werden erkannt
   - ✅ Items-Liste zeigt alle erkannten Lebensmittel
   - ✅ Totals zeigen Summe aller Makros
5. **Test Non-Food:**
   - Lade ein Bild ohne Essen (z.B. Landschaft)
   - ✅ Erwartung: "Kein Essen erkannt" oder "Unsicher" bei niedrigem Confidence
6. **Error Cases:**
   - ❌ NICHT: "Kein Essen erkannt" bei offensichtlichen Lebensmitteln
   - ❌ NICHT: "API-Verbindung fehlgeschlagen" bei gültigem Key
   - ✅ Bei GitHub Pages: Automatischer Fallback zu Proxy-Modus

#### API Key Status Test
1. Navigiere zur Profil-Sektion
2. Prüfe den "Food Scanner Status" im KI-Einstellungen-Bereich
3. ✅ Erwartung: Zeigt aktuellen Status (Gesetzt/Nicht gesetzt/OK/Ungültig)
4. Klicke "🔍 Food Scanner testen"
5. ✅ Erwartung: Status aktualisiert sich mit klarer Meldung
6. ✅ Erwartung: Zeigt "Letzter Test" Timestamp
7. ✅ Erwartung: Bei Erfolg zeigt es den verwendeten Modus (direct/proxy)

#### Pose Detection Test
1. Navigiere zur Training-Sektion
2. Aktiviere Kamera
3. ✅ Erwartung: Live-Skelett erscheint über Person
4. ✅ Erwartung: Keine Reps gezählt wenn Person nicht im Bild
5. ✅ Erwartung: Pause bleibt pausiert
6. ✅ Erwartung: Stop schaltet Kamera sofort aus

#### Camera Switch Test
1. Während READY oder PAUSED
2. Wechsle zwischen Front-/Rückkamera
3. ✅ Erwartung: Kamera wechselt, Pose-Detection läuft weiter

#### Saved Session Test & Replay Controls
1. Führe ein Training durch und speichere Satz
2. Tippe auf "🔄 Replay anzeigen" beim gespeicherten Satz
3. ✅ Erwartung: Replay öffnet sich mit Skeleton-Visualisierung
4. ✅ Erwartung: Scrubber (Timeline) ist vorhanden und funktioniert
5. Ziehe den Scrubber zu verschiedenen Positionen
6. ✅ Erwartung: Frame springt zur gewählten Position
7. Klicke "▶️ Play"
8. ✅ Erwartung: Replay spielt automatisch ab, Button ändert zu "⏸️ Pause"
9. Wähle "2x" in der Geschwindigkeitsauswahl
10. ✅ Erwartung: Replay läuft doppelt so schnell
11. Teste "⏮️ -1" und "+1 ⏭️" Buttons
12. ✅ Erwartung: Frame springt vor/zurück
13. Klicke "✕ Schließen"
14. ✅ Erwartung: Replay schließt sich
15. ✅ Erwartung: Löschen-Button mit Bestätigung funktioniert

### 📝 Deployment-Anleitung

#### Vercel (Empfohlen)
```bash
# 1. Vercel CLI installieren
npm i -g vercel

# 2. Projekt deployen
vercel

# 3. Environment Variable setzen
vercel env add GEMINI_API_KEY

# 4. Erneut deployen
vercel --prod
```

#### Netlify
1. Repository mit Netlify verbinden
2. Build-Einstellungen:
   - Build Command: (leer lassen)
   - Publish directory: `.`
   - Functions directory: `api`
3. Environment Variable setzen: `GEMINI_API_KEY`

### 🔒 Datenschutz & Sicherheit

- Kamera wird nur nach Opt-in verwendet und kann jederzeit deaktiviert werden
- Rohvideo wird NICHT gespeichert, nur Keypoint-Daten
- API-Schlüssel sind ausschließlich server-seitig gespeichert
- Keine Tracking-Daten werden an Dritte weitergegeben
- Alle Benutzerdaten bleiben lokal im Browser (localStorage)

### 🛠️ Hinweise zur Nutzung

- **Echte Pose Estimation:** MediaPipe Pose wird verwendet (kein Mock/Animation!)
- **Person Detection erforderlich:** Rep-Zählung startet erst bei stabiler Person-Erkennung
- **Mobile-optimiert:** Funktioniert am besten auf modernen Smartphones
- **Kamera-Berechtigung:** Muss vom Benutzer explizit gewährt werden
