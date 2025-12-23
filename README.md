## KI-basierte Fitness- und Ernährungsplattform (Mobile First)

Interaktive mobile Web-App für KI-gestützte Bewegungserkennung mit **MediaPipe Pose**, automatisches Trainingstracking, Food-Scan mit **Google Gemini Vision API** und intelligenter Trainingsplanung.

### 🚀 Schnellstart

#### Lokale Entwicklung
1. Repo clonen / herunterladen  
2. `index.html` im Browser öffnen (oder lokalen Server nutzen: `python -m http.server 8000`)  
3. Kamera-Tracking im Bereich **Training** aktivieren

#### Deployment (Vercel empfohlen)
1. Vercel Account erstellen auf [vercel.com](https://vercel.com)
2. Repository verbinden
3. Environment Variable setzen:
   - `GEMINI_API_KEY`: Dein Gemini API-Schlüssel von [Google AI Studio](https://aistudio.google.com/app/apikey)
4. Deploy ausführen

### 🔐 Sicherheit & API-Schlüssel

**WICHTIG:** API-Schlüssel werden **ausschließlich server-seitig** gespeichert!

- Der Gemini API-Schlüssel wird als Environment Variable (`GEMINI_API_KEY`) auf dem Server (Vercel) gespeichert
- **NIEMALS** API-Schlüssel im Frontend-Code oder localStorage speichern
- Alle Vision API-Aufrufe gehen durch den Backend-Endpoint `/api/food-scan`
- Der API-Schlüssel ist niemals im Browser sichtbar

#### API-Schlüssel einrichten (für Deployment)
1. Besuche [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Melde dich mit deinem Google-Konto an
3. Klicke auf "Create API Key"
4. Kopiere den generierten Schlüssel (beginnt mit "AIza...")
5. Füge ihn als Environment Variable `GEMINI_API_KEY` in deinem Vercel-Projekt hinzu

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
- Frame-by-Frame-Durchlauf mit Fortschrittsbalken
- Qualitätsmetriken und Form-Feedback
- **Löschfunktion** mit Bestätigungsdialog

#### **Food Scan (KI-gestützt & sicher)**
- Backend-API-Endpoint (`/api/food-scan`) für sichere Vision-Aufrufe
- Google Gemini Vision API für Lebensmittelerkennung
- **Confidence Gating:** Nur Detektionen über 60% Confidence werden akzeptiert
- Portion-Slider für Anpassung der Mengen
- Automatische Makro- und Kalorienschätzung
- Debug-Logging im Development-Modus
- Klare Fehlermeldungen bei API-Problemen

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

#### Food Scan Test
1. Navigiere zur Ernährung-Sektion
2. Lade ein Bananen-Bild hoch
3. ✅ Erwartung: "Banane" wird erkannt mit Makros und Kalorien
4. ❌ NICHT: "Kein Essen erkannt"

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

#### Saved Session Test
1. Führe ein Training durch und speichere Satz
2. Tippe auf gespeicherten Satz
3. ✅ Erwartung: Details-Ansicht mit Replay-Button
4. ✅ Erwartung: Skeleton-Replay funktioniert
5. ✅ Erwartung: Löschen-Button mit Bestätigung

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
