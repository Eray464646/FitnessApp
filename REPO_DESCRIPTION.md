# FitnessApp - Umfassende Repository-Beschreibung

## Projektübersicht

Die FitnessApp (auch "MX" genannt) ist eine moderne, mobile-first Fitness- und Ernährungsplattform, die künstliche Intelligenz und fortschrittliche Computervision-Technologie nutzt, um ein vollständig automatisiertes Tracking-Erlebnis zu bieten. Die Anwendung läuft komplett im Browser (Progressive Web App) und benötigt keine nativen App-Installationen.

## Kernkonzept

**Ziel:** Beseitigung manuellen Trackings durch KI-gestützte Automatisierung

Die App verfolgt einen radikal automatisierten Ansatz:
- **Keine manuelle Eingabe** von Wiederholungen - MediaPipe Pose erkennt Bewegungen in Echtzeit
- **Keine manuelle Kalorienzählung** - Google Gemini Vision analysiert Mahlzeiten per Foto
- **Keine manuellen Trainingspläne** - KI generiert personalisierte Wochenpläne
- **Automatische Persistierung** - Alle Daten bleiben lokal im Browser (localStorage)

## Technische Architektur

### Frontend-Technologie

**Vanilla JavaScript, HTML5, CSS3** - Bewusst kein Build-Tool erforderlich
- **Philosophie:** Zero-dependencies für maximale Portabilität
- **Deployment:** Kann direkt auf GitHub Pages, Vercel oder jedem Static-Host laufen
- **Modulares Design:** Separate Sektionen für Dashboard, Training, Ernährung, Planung, Profil

**Keine Frameworks:**
- Kein React, Vue oder Angular
- Kein npm build process (nur package.json für Metadaten)
- Direktes Script-Loading im Browser

**CSS-Design-System:**
- Apple Fitness-inspiriertes Dark-Theme
- Mobile-First mit Touch-optimierten Controls
- CSS Custom Properties (CSS-Variablen) für konsistente Gestaltung
- Activity-Ring-Farbschema: Move (Pink/Rot), Exercise (Grün), Stand (Cyan)

### Backend-Architektur (Serverless)

**Vercel Serverless Functions** (kompatibel mit Netlify/AWS Lambda)
- `/api/food-scan.js` - Gemini Vision API Proxy für Lebensmittelerkennung
- `/api/training-plan.js` - Gemini API Proxy für KI-Trainingsplan-Generierung
- `/api/food-scan-health.js` - Health Check Endpoint
- `/api/training-plan-health.js` - Health Check Endpoint
- `/api/food-scan-test.js` - Test-Endpoint

**Warum Serverless Functions?**
1. **API-Key-Sicherheit:** Gemini API Keys bleiben server-seitig, niemals im Client-Code
2. **CORS-Handling:** Proxy umgeht Browser-CORS-Einschränkungen
3. **Rate Limiting:** In-Memory-Rate-Limiting pro IP (10 Requests/Minute für Food Scan, 20 für Training Plan)
4. **Dual-Mode-Support:** Akzeptiert sowohl server-seitige Environment-API-Keys als auch user-provided Keys

**Vercel-Konfiguration (`vercel.json`):**
```json
{
  "functions": {
    "api/**/*.js": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "env": {
    "GEMINI_API_KEY": "@gemini-api-key"
  }
}
```

### Externe APIs und Bibliotheken

1. **MediaPipe Pose (Google)** - Menschliche Pose-Erkennung
   - CDN-Loading via jsdelivr.net
   - 33-Punkt-Skelett-Tracking in Echtzeit
   - Model Complexity: 1 (Balance zwischen Genauigkeit und Performance)
   - Smoothing aktiviert für stabileres Tracking

2. **Google Gemini 1.5 Flash Vision API**
   - Lebensmittel-Erkennung aus Fotos
   - Multi-Item-Detection (mehrere Lebensmittel auf einem Teller)
   - Makronährstoff-Schätzung (Kalorien, Protein, Kohlenhydrate, Fett)
   - Confidence-basierte Gating-Logik (>40% Threshold)

3. **Google Gemini 1.5 Flash API**
   - Personalisierte Trainingsplan-Generierung
   - Berücksichtigt: Alter, Geschlecht, Größe, Gewicht, Level, Ziel, Frequenz, Equipment
   - Strukturierte JSON-Antworten mit Tagesplan, Übungen, Sets, Reps, Pausenzeiten

## Hauptfunktionen im Detail

### 1. Training mit KI-Bewegungserkennung

#### MediaPipe Pose Integration

**State Machine (Zustandsautomaten-Muster):**
```
WAITING → READY → ACTIVE ↔ PAUSED → STOPPED
```

- **WAITING:** Wartet auf Person-Detection (keine Rep-Zählung)
- **READY:** Person erkannt, Keypoints stabil (mindestens 3 stabile Frames)
- **ACTIVE:** Aktives Tracking mit Wiederholungszählung
- **PAUSED:** Manuell pausiert, KEINE automatische Reaktivierung
- **STOPPED:** Training beendet, Kamera ausgeschaltet

**Person-Detection-Gating:**
- Minimum Confidence: 60% für Person-Erkennung
- Stable Confidence: 70% für stabiles Tracking
- Minimum Keypoint Visibility: 30%
- 3 konsekutive stabile Frames erforderlich für READY-State
- 3 Frames ohne Person → zurück zu WAITING

**Wiederholungszählung:**

*Squat-Erkennung:*
- Hip-Angle < 100° UND Knee-Angle < 110° = Down-Position
- Hip-Angle > 150° UND Knee-Angle > 150° = Up-Position
- Rep wird gezählt bei Übergang Down → Up
- Debouncing: Minimum 500ms zwischen Reps (verhindert Doppelzählung)

*Push-up-Erkennung:*
- Elbow-Angle < 90° = Down-Position
- Elbow-Angle > 160° = Up-Position
- Identische Rep-Counting-Logik wie Squats

*Generische Übungen:*
- Center-of-Mass-Tracking (Durchschnitt von Schultern und Hüften)
- Vertikale Bewegungserkennung (Threshold: 5% Körperhöhe)

**Auto-Save:**
- Automatisches Speichern nach 12 Wiederholungen
- Verhindert Datenverlust bei langen Sätzen

#### Skeleton Visualization

**Live Canvas Overlay:**
- Echtzeit-Darstellung des 33-Punkt-MediaPipe-Skeletts
- Konvertierung zu COCO 17-Punkt-Format für kompaktere Speicherung
- Farbcodierte Confidence-Levels:
  - Cyan (>75%): Hohe Qualität
  - Gelb (50-75%): Mittlere Qualität
  - Rot (<50%): Niedrige Qualität
- Adaptive Keypoint-Größe basierend auf Confidence
- Smoothing für jitter-freie Darstellung

**Frame Recording:**
- Jeder Frame wird mit Timestamp, Keypoints, Confidence, Stability gespeichert
- Bis zu 200 Frames pro Set (älteste Frames werden verworfen)
- Vollständige Replay-Funktionalität nach dem Training

#### Pose Replay System

**Interaktive Replay-Steuerung:**
- **Timeline Scrubber:** Klickbarer Fortschrittsbalken zum Springen zu beliebigen Frames
- **Play/Pause:** Automatische Frame-by-Frame-Wiedergabe
- **Geschwindigkeitsauswahl:** 0.5x, 1x, 1.5x, 2x Playback-Rate
- **Frame Stepping:** -1/+1 Buttons für präzise Navigation
- **Mobile-optimiert:** Touch-Events für Scrubber-Interaktion
- **Adaptive Timing:** Berechnet durchschnittliche Frame-Duration aus Timestamps

**Skeleton-Visualisierung im Replay:**
- SVG-basierte 2D-Darstellung auf dunklem Hintergrund (#0f172a)
- Identische Farbcodierung wie Live-Tracking
- Frame-Metadaten: Qualität, Keypoint-Count, Stability-Status

### 2. Ernährung mit Food Scanner

#### Gemini Vision API Integration

**Dual-Mode-Architektur:**
1. **Direct Mode:** Frontend → Vercel Backend → Gemini API
2. **Proxy Mode:** GitHub Pages → Vercel Proxy → Gemini API (CORS-Workaround)

**Bildverarbeitung:**
- Automatische Kompression (max 1024px Breite, 80% JPEG-Qualität)
- Reduziert Payload-Größe und verhindert Timeouts
- Base64-Encoding für API-Übertragung
- Unterstützte Formate: JPEG, PNG

**Food-Detection-Pipeline:**

1. **Bildanalyse durch Gemini Vision:**
   - Multi-Item-Detection (erkennt mehrere Lebensmittel)
   - Confidence-Scoring pro Item
   - Reasoning/Notes für Transparenz

2. **Confidence-Gating:**
   - Threshold: 40% (gesenkt für bessere Detection-Rate)
   - 40-69%: "Unsicher - bitte bestätigen"
   - ≥70%: "Sicher erkannt"
   - <40%: "Kein Essen erkannt"

3. **Food-Name-Extraction (Robust):**
   - Strategie 1: Pre-built Label vom Backend
   - Strategie 2: Items-Array-Extraktion
   - Strategie 3: Alternative Fields (name, title, food, dish)
   - Strategie 4: Ableitung aus Description/Notes
   - Strategie 5: Fallback zu "Essen"
   - Sanitization: Validierung, Truncation (max 40 Zeichen), Punktuation-Filter

4. **Makronährstoff-Schätzung:**
   - Kalorien, Protein, Kohlenhydrate, Fett
   - Summierung bei Multi-Item-Meals
   - **Vollautomatische Portionsschätzung durch KI** (0.5x - 2.0x basierend auf visueller Analyse)

**Fehlerbehandlung:**
- Detaillierte Error-Messages (CORS, Auth 401/403, Quota 429, Format 400, Server 500)
- Network-Error-Fallback mit Benutzer-Feedback
- Backend-Health-Check vor jedem Request

#### Kalorienrechner

**Mifflin-St Jeor Gleichung:**
- Männlich: BMR = 10 × Gewicht + 6.25 × Größe - 5 × Alter + 5
- Weiblich: BMR = 10 × Gewicht + 6.25 × Größe - 5 × Alter - 161
- Divers: Durchschnitt beider Formeln

**Aktivitätsmultiplikatoren:**
- Sedentary (kaum aktiv): 1.2
- Light (1-2× Sport/Woche): 1.375
- Moderate (3-5× Sport/Woche): 1.55
- Very (täglich/sehr aktiv): 1.725

**TDEE = BMR × Aktivitätsmultiplikator**

**Makro-Berechnung nach Ziel:**

*Muskelaufbau (Bulk):*
- Kalorien: +12% über TDEE
- Protein: 2.0 g/kg Körpergewicht
- Fett: 25% der Kalorien
- Kohlenhydrate: Rest

*Fettabbau (Cut):*
- Kalorien: -15% unter TDEE
- Protein: 2.2 g/kg (erhöht für Muskelerhalt)
- Fett: 25% der Kalorien
- Kohlenhydrate: Rest

*Gewicht halten (Maintain):*
- Kalorien: TDEE
- Protein: 1.8 g/kg
- Fett: 30% der Kalorien
- Kohlenhydrate: Rest

**Nutrition Progress Tracking:**
- Tägliche Fortschrittsbalken (Kalorien, Protein, Fett, Kohlenhydrate)
- Automatische Aktualisierung bei neuen Food-Entries
- Farbcodierte Progress-Bars (Gradient: #6366f1 → #22d3ee)

### 3. KI-Trainingsplanung

#### Gemini API Integration

**Input-Parameter:**
- Alter (16-90 Jahre)
- Geschlecht (männlich, weiblich, divers)
- Größe (140-210 cm)
- Gewicht (45-160 kg)
- Fitness-Level (Anfänger, Mittel, Fortgeschritten)
- Ziel (Muskelaufbau, Fettabbau, Performance)
- Frequenz (2-6 Tage/Woche)
- Equipment (Körpergewicht, Kurzhanteln, Studio)

**KI-generierter Trainingsplan:**
- Wöchentlicher Split mit Tageseinheiten
- Pro Tag: Focus (z.B. "Ganzkörper", "Push/Pull"), Übungsliste
- Pro Übung: Name, Sets, Reps, Pausenzeit (Sekunden)
- Zusätzliche Hinweise/Notes von der KI

**Fallback-Logik:**
- Bei API-Fehler: Rule-based Plan-Generierung
- Equipment-basierte Übungsauswahl
- Level-basierte Sets/Reps-Anpassung
- Goal-basierter Training-Focus

**Persistierung:**
- Vollständige Plan-Speicherung mit Metadaten
- Form-Hydration: Lädt gespeicherte Werte beim Öffnen
- Plan-Updates überschreiben alte Pläne

### 4. Dashboard

**Zentrale Übersicht:**
- Streak-Anzeige (konsekutive aktive Tage)
- Heutige Stats: Reps, Technik-Score, Kalorien, Protein
- Regenerations-Hinweis (Form-basiert)
- Nächste Session Preview (2 bevorstehende Tage)
- Letzte Aktivitäten (kombiniert: Sets + Food Entries)

**Streak-Berechnung:**
- Kombiniert Training-Sets und Food-Entries
- Zählt zurück von heute bis zum ersten inaktiven Tag
- Set-basiert auf ISO-Datum (YYYY-MM-DD)

### 5. Profil & Datenschutz

**Consent-Management:**
- Kamera-Opt-in (erforderlich für Training)
- Push-Benachrichtigungen Toggle
- Wearable-Verbindung Toggle
- Alle Consent-States in localStorage persistiert

**Datenschutz-Prinzipien:**
- **Kein Rohvideo-Upload:** Nur Keypoint-Daten werden gespeichert
- **Lokale Datenhaltung:** Alle Benutzerdaten in localStorage (nie auf Server)
- **Session-Only API-Keys (User-Provided Mode):** API-Keys bleiben nur in Session-Memory
- **Server-Side API-Keys (Optional):** Environment Variables für vertrauenswürdige Deployments
- **CORS-gesicherte Endpoints:** Nur erlaubte Origins

## Datenmodell und State-Management

### localStorage-basiertes State-Schema

**Storage-Key:** `"mxAppState"`

**State-Struktur:**
```javascript
{
  sets: [
    {
      exercise: "Kniebeugen",
      reps: 12,
      tempo: "kontrolliert",
      rom: "voll",
      quality: 85,
      timestamp: "2024-01-15T14:30:00.000Z",
      auto: false,
      frames: [
        {
          timestamp: 1705330200000,
          keypointsTracked: 17,
          confidence: 0.89,
          stability: "stable",
          postureScore: 0.89,
          keypoints: [
            { id: 0, name: "nose", x: 0.5, y: 0.15, confidence: 0.95 },
            // ... 16 weitere COCO-Keypoints
          ],
          perspective: "frontal"
        },
        // ... bis zu 200 Frames
      ]
    },
    // ... weitere Sets
  ],
  foodEntries: [
    {
      label: "Banane",
      calories: 105,
      protein: 1,
      carbs: 27,
      fat: 0,
      confidence: 95,
      items: ["Banane"],
      reasoning: "Klare Banane erkannt",
      timestamp: "2024-01-15T08:00:00.000Z"
    },
    // ... weitere Mahlzeiten
  ],
  plan: {
    age: 28,
    gender: "divers",
    height: 178,
    weight: 75,
    goal: "aufbau",
    level: "mittel",
    frequency: 3,
    equipment: "kurzhanteln",
    days: [
      {
        day: "Montag",
        focus: "Ganzkörper",
        exercises: [
          {
            name: "Goblet Squat",
            sets: 4,
            reps: "10-12",
            rest: 75
          },
          // ... weitere Übungen
        ]
      },
      // ... weitere Tage
    ],
    notes: "Fokus auf Compound-Movements...",
    aiGenerated: true,
    generatedAt: "2024-01-15T10:00:00.000Z"
  },
  profile: {
    cameraConsent: true,
    notifications: true,
    wearable: false
  },
  nutritionGoals: {
    calories: 2500,
    protein: 150,
    fat: 70,
    carbs: 290,
    goal: "bulk"
  }
}
```

### Persistierungs-Strategie

**Persist-Funktion:**
```javascript
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
```

**Aufrufe bei:**
- Satz speichern
- Food Entry speichern
- Plan aktualisieren
- Profil-Änderungen
- Nutrition Goals setzen

**Fehlerbehandlung:**
- Try-Catch bei localStorage-Read
- Fallback zu Default-State bei Parse-Fehlern
- Console-Warnings bei Storage-Fehlern

## Mobile-First UI/UX Design

### Navigation

**Bottom Tab Bar:**
- 5 Hauptsektionen: Dashboard, Training, Ernährung, Plan, Profil
- Active-State-Indikator
- Touch-optimierte Größe (mindestens 44×44px)

**View-Switching:**
- CSS-basierte `.active` Class
- Keine Seiten-Reloads (Single Page Application)
- Smooth Transitions

### Touch-Optimierungen

**Swipe-to-Delete:**
- Swipeable Items für Sets und Food Entries
- Threshold: 60px Links-Swipe
- Max Distance: 100px (verhindert Over-Swipe)
- Smooth Transform-Animation
- Confirmation-Dialog vor tatsächlichem Löschen

**Button-Größen:**
- Primary Buttons: Mindestens 44px Höhe
- Touch-Targets: 8px Padding für ausreichende Hit-Area
- Chip-Selects: Leicht greifbare Größe

**Interaktive Elemente:**
- Replay-Scrubber: Touch-Events für Frame-Seeking
- Camera-Switch: Dropdown während READY/PAUSED

### Responsive Layout

**Breakpoints:**
- Mobile-First-Ansatz (kein expliziter Breakpoint)
- Desktop-Optimierungen bei >768px (optional)
- Flexible Grid-Layouts mit CSS Grid und Flexbox

**Card-Grid:**
```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--spacing-md);
}
```

**Form-Grid:**
```css
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--spacing-md);
}
```

## Sicherheit und Best Practices

### API-Key-Management

**Dual-Mode-System:**

1. **User-Provided Mode (Standard):**
   - Benutzer gibt API-Key im Profil ein
   - Key bleibt nur in Session-Memory (sessionStorage oder in-memory Variable)
   - Wird bei jedem Request ans Backend mitgesendet
   - Niemals in localStorage, Cookies oder dauerhaftem Storage
   - Geht nach Seiten-Reload verloren → Benutzer muss erneut eingeben

2. **Server-Side Mode (Optional):**
   - Environment Variable `GEMINI_API_KEY` auf Vercel
   - Backend verwendet diesen Key wenn kein user-provided Key vorhanden
   - Nur für vertrauenswürdige Deployments empfohlen
   - Reduziert Benutzer-Reibung (kein API-Key nötig)

**Sicherheitsmaßnahmen:**
- Keys niemals im Client-Code hardcoded
- Backend-Proxy verhindert direkten API-Zugriff vom Client
- CORS-Restrictions auf erlaubte Origins
- Rate Limiting gegen Missbrauch

### Rate Limiting

**Implementation:**
- In-Memory Map pro Serverless-Instanz
- 10 Requests/Minute für Food Scan
- 20 Requests/Minute für Training Plan
- IP-basiertes Tracking (x-forwarded-for Header)
- Automatisches Cleanup nach 1 Minute

**Limitierungen:**
- Per-Instance-Limiting (nicht global in Serverless)
- Resets bei Function Cold Start
- Für Production: Redis/Upstash empfohlen

### CORS-Konfiguration

**Allowed Origins:**
```javascript
const ALLOWED_ORIGINS = [
  'https://eray464646.github.io',
  'http://localhost:8000',
  'http://localhost:3000',
  'http://127.0.0.1:8000'
];
```

**Headers:**
- `Access-Control-Allow-Origin`: Origin-spezifisch
- `Access-Control-Allow-Methods`: POST, OPTIONS
- `Access-Control-Allow-Headers`: Content-Type

**Preflight-Handling:**
- OPTIONS-Requests werden mit 200 beantwortet
- Ermöglicht CORS-Preflight-Checks

### Input-Validation

**Backend-Validierung:**
- Required-Parameter-Checks
- Image-Size-Limits (4MB für Food Scan)
- MIME-Type-Validation (nur JPEG/PNG)
- Parameter-Type-Checks

**Frontend-Sanitization:**
- `escapeHTML()` für alle Benutzer-Inputs
- Verhindert XSS-Angriffe
- Anwendung bei Rendering von Food-Labels, Exercise-Namen, etc.

## Deployment-Strategien

### Option 1: GitHub Pages + Vercel Proxy (Empfohlen)

**Architektur:**
- Frontend: GitHub Pages (kostenlos)
- Backend: Vercel Serverless Functions (kostenlos tier)
- API-Keys: User-provided oder Vercel Environment Variables

**Vorteile:**
- Kostenlos
- Einfaches Setup
- Gute Performance
- Löst CORS-Probleme

**Schritte:**
1. Repo auf GitHub pushen
2. GitHub Pages aktivieren (Settings → Pages → Branch: main)
3. Vercel-Account erstellen
4. Vercel-Projekt mit GitHub verbinden
5. (Optional) Environment Variable `GEMINI_API_KEY` setzen
6. Deploy

### Option 2: Vercel All-in-One

**Architektur:**
- Frontend + Backend: Vercel
- Automatisches Routing (/ für Frontend, /api/* für Functions)

**Vorteile:**
- Single-Platform-Deployment
- Automatische HTTPS
- Preview-Deployments für PRs
- Einfache Environment-Variable-Verwaltung

**Schritte:**
1. Vercel-Account erstellen
2. Repository verbinden
3. (Optional) `GEMINI_API_KEY` setzen
4. Deploy-Button klicken

### Option 3: Netlify

**Kompatibilität:**
- Functions-Directory: `api`
- CommonJS-Module (module.exports)
- Identische Funktion-Struktur

**Build-Einstellungen:**
- Build Command: (leer)
- Publish Directory: `.`
- Functions Directory: `api`

## Technische Konstanten und Konfiguration

### Pose Detection

```javascript
// Confidence-Thresholds
MIN_PERSON_CONFIDENCE = 0.6
MIN_STABLE_CONFIDENCE = 0.7
MIN_KEYPOINT_VISIBILITY = 0.3

// Tracking-Requirements
STABLE_FRAMES_REQUIRED = 3
LOST_FRAMES_THRESHOLD = 3

// Rep-Counting
AUTO_SAVE_REP_COUNT = 12
MIN_REP_INTERVAL_MS = 500

// Squat-Detection
SQUAT_DOWN_HIP_ANGLE = 100
SQUAT_DOWN_KNEE_ANGLE = 110
SQUAT_UP_HIP_ANGLE = 150
SQUAT_UP_KNEE_ANGLE = 150

// Push-up-Detection
PUSHUP_DOWN_ELBOW_ANGLE = 90
PUSHUP_UP_ELBOW_ANGLE = 160
```

### Food Detection

```javascript
FOOD_CONFIDENCE_THRESHOLD = 40
DEFAULT_FOOD_CONFIDENCE = 70
MAX_IMAGE_WIDTH = 1024
IMAGE_COMPRESSION_QUALITY = 0.8
MAX_FOOD_NAME_LENGTH = 40
```

### UI-Interaktion

```javascript
SWIPE_DELETE_THRESHOLD = 60  // px
MAX_SWIPE_DISTANCE = 100      // px
```

## Testing und Entwicklung

### Lokale Entwicklung

**Methode 1: Python HTTP Server**
```bash
python -m http.server 8000
# Dann Browser öffnen: http://localhost:8000
```

**Methode 2: Live Server (VS Code)**
- Extension: "Live Server" installieren
- Rechtsklick auf index.html → "Open with Live Server"

### Testing-Workflows

**Pose Detection Test:**
1. Kamera-Consent aktivieren
2. Training-Sektion öffnen
3. Kamera starten
4. ✅ Live-Skelett sollte erscheinen
5. ✅ WAITING → READY Transition bei Person im Bild
6. ✅ Rep-Zählung bei Squats/Push-ups
7. ✅ Pause bleibt pausiert
8. ✅ Stop schaltet Kamera sofort aus

**Food Scanner Test:**
1. Profil → API-Key eingeben (falls User-Provided Mode)
2. "Food Scanner testen" klicken
3. ✅ "Test erfolgreich" + Modus-Anzeige
4. Ernährung → Bananen-Foto hochladen
5. ✅ "Banane" erkannt mit ~100 kcal
6. ✅ Confidence >70%

**Replay Test:**
1. Training durchführen und Satz speichern
2. "🔄 Replay anzeigen" klicken
3. ✅ Skeleton-Visualisierung
4. ✅ Scrubber funktioniert (Frame-Jumping)
5. ✅ Play/Pause-Button
6. ✅ Speed-Selector (0.5x - 2x)
7. ✅ Frame Stepping (-1 / +1)

### Debugging

**Console-Logging:**
- MediaPipe-Errors bei Pose-Processing
- Food-Detection-Errors mit detaillierter Error-Message
- Rate-Limit-Warnings
- Backend-Health-Check-Logs

**Network-Inspection:**
- Chrome DevTools → Network Tab
- Prüfe POST-Requests zu `/api/food-scan` und `/api/training-plan`
- Response-Body-Inspektion für API-Errors

## Code-Organisation

### Dateistruktur

```
FitnessApp/
├── index.html                 # Haupt-HTML (Single Page)
├── script.js                  # Haupt-JavaScript-Logik (~2500 Zeilen)
├── styles.css                 # Komplettes Styling (~800+ Zeilen)
├── package.json               # Metadaten (kein Build-Process)
├── vercel.json                # Vercel-Konfiguration
├── .gitignore                 # Ignore node_modules, .env, etc.
├── .env.example               # Environment-Variable-Template
├── README.md                  # Projekt-README
├── api/                       # Serverless Functions
│   ├── food-scan.js           # Gemini Vision API Proxy
│   ├── food-scan-health.js    # Health Check
│   ├── food-scan-test.js      # Test-Endpoint
│   ├── training-plan.js       # Gemini API Proxy für Trainingsplan
│   └── training-plan-health.js # Health Check
└── docs/                      # Verschiedene Dokumentationen
    ├── DEPLOYMENT.md
    ├── GITHUB_PAGES_DEPLOYMENT.md
    ├── HOW_TO_TEST.md
    ├── IMPLEMENTATION_SUMMARY.md
    └── weitere...
```

### script.js Modularer Aufbau

**Obwohl in einer Datei, ist der Code logisch gruppiert:**

1. **Konfiguration und Konstanten** (Zeilen 1-400)
   - Vercel Backend URL
   - Pose-Detection-Konstanten
   - Food-Detection-Thresholds
   - COCO-Keypoint-Definitionen
   - Skeleton-Connections

2. **Utility-Funktionen** (Zeilen 400-500)
   - escapeHTML()
   - compressImage()
   - extractFoodName()
   - calculateAngle()

3. **State-Management** (Zeilen 500-600)
   - localStorage-Read/Write
   - State-Objekt-Initialisierung
   - persist()

4. **MediaPipe Pose Integration** (Zeilen 600-1100)
   - initializeMediaPipePose()
   - onPoseResults()
   - processPoseLandmarks()
   - convertMediaPipeToCocoKeypoints()
   - processRepCounting()
   - countSquatReps(), countPushupReps(), countGenericReps()

5. **Skeleton Visualization** (Zeilen 1100-1300)
   - drawMediaPipeSkeleton()
   - drawSkeletonOnCanvas()
   - renderSkeletonViz()

6. **Replay-System** (Zeilen 1300-1500)
   - replaySet()
   - Play/Pause/Speed-Logik
   - Scrubber-Event-Handling

7. **Food Detection** (Zeilen 1500-2100)
   - detectFoodWithAI()
   - handleFoodInput()
   - renderFoodDetection()
   - checkBackendHealth()

8. **Calorie Calculator** (Zeilen 2100-2300)
   - calculateBMR()
   - calculateMacros()
   - handleCalorieCalculator()
   - updateNutritionProgress()

9. **Training Plan** (Zeilen 2300-2500)
   - generatePlan()
   - generateFallbackPlan()
   - renderPlan()

10. **Dashboard & UI** (Zeilen 2500-2600)
    - renderDashboard()
    - renderSets()
    - renderFoodLog()
    - computeStreak()
    - Navigation-Event-Listener

### CSS-Architektur

**Struktur:**
1. `:root` Custom Properties (CSS-Variablen)
2. Reset & Base-Styles
3. Layout-Komponenten (app-shell, top-bar, bottom-nav)
4. Section-Spezifische Styles (dashboard, training, nutrition)
5. Card-Komponenten
6. Buttons & Form-Controls
7. Utility-Classes

**Naming-Convention:**
- BEM-ähnlich (Block__Element--Modifier)
- Semantische Klassen-Namen (`.hero-card`, `.camera-panel`, `.skeleton-viz`)
- Keine CSS-Frameworks (kein Bootstrap, Tailwind, etc.)

## Besonderheiten und Architektur-Entscheidungen

### Warum Vanilla JavaScript?

**Vorteile:**
- Keine Build-Zeit → Instant Development
- Keine Dependencies → Keine Sicherheits-Updates nötig
- Maximale Portabilität → Läuft überall
- Geringe Lernkurve → Einfaches Onboarding
- Volle Kontrolle → Kein Framework-Overhead

**Trade-offs:**
- Mehr Boilerplate-Code (kein Reaktive Framework)
- Manuelles DOM-Manipulation
- Keine Type-Safety (kein TypeScript)

### Warum localStorage statt Backend-DB?

**Vorteile:**
- Offline-First → Funktioniert ohne Internetverbindung
- Datenschutz → Daten bleiben lokal beim Benutzer
- Keine Server-Kosten → Keine Datenbank-Hosting-Gebühren
- Einfachheit → Kein Auth, keine User-Management

**Trade-offs:**
- Keine Geräte-Synchronisation
- Datenverlust bei Browser-Clear möglich
- Storage-Limit (~5-10MB)

### Warum MediaPipe statt TensorFlow.js?

**Vorteile von MediaPipe:**
- Optimiert für Mobile-Geräte
- Bessere Performance (WebAssembly + GPU)
- Einfachere API
- Stabileres Tracking
- Weniger Ressourcen-intensiv

### Warum Gemini statt GPT-4 Vision?

**Vorteile von Gemini:**
- Kostenloser Tier verfügbar
- Schnellere Response-Zeiten (Flash-Model)
- Multimodal aus der Box
- Google-Integration (MediaPipe, Google AI Studio)

## Performance-Optimierungen

### MediaPipe-Optimierungen

- Model Complexity: 1 (nicht 2 - zu schwer für Mobile)
- Smoothing aktiviert für Stability
- Segmentation deaktiviert (spart Ressourcen)
- RequestAnimationFrame statt Interval
- Frame-Limiting (nur bei ACTIVE/READY-State)

### Food-Detection-Optimierungen

- Bildkompression (1024px max, 80% Qualität)
- Reduziert API-Payload von ~4MB auf ~200KB
- Schnellere Uploads, weniger Timeouts
- Base64-Caching vermeiden (direkt senden)

### UI-Rendering-Optimierungen

- Lazy-Loading von Skeleton-Frames
- Canvas-Clearing nur wenn nötig
- CSS-Transforms für Swipe-Animationen (GPU-beschleunigt)
- Event-Delegation wo möglich

## Erweiterungsmöglichkeiten

### Potenzielle Features

1. **Offline-Support:**
   - Service Worker für vollständige PWA
   - Cached Assets
   - Background-Sync für API-Requests

2. **Multi-Device-Sync:**
   - Firebase/Supabase-Integration
   - User-Authentication
   - Cloud-Storage für Sets/Food-Entries

3. **Erweiterte Analytics:**
   - Langzeit-Trend-Visualisierung
   - Woche-zu-Woche-Vergleiche
   - Personal Records Tracking

4. **Social Features:**
   - Workout-Sharing
   - Freunde-Challenges
   - Leaderboards

5. **Mehr Exercise-Types:**
   - Pull-ups, Burpees, Lunges
   - Specialized-Detection-Algorithms
   - Custom-Exercise-Definitions

6. **Erweiterte Nutrition:**
   - Barcode-Scanner
   - Restaurant-Menu-Integration
   - Meal-Prep-Planner

## FAQ und Troubleshooting

### Häufige Probleme

**Problem: Kamera startet nicht**
- Lösung: Kamera-Consent im Profil aktivieren
- Lösung: Browser-Permissions prüfen (Chrome-Settings)
- Lösung: HTTPS erforderlich (außer localhost)

**Problem: Food Scanner gibt "Kein Essen erkannt"**
- Lösung: Klareres Foto mit besserer Beleuchtung
- Lösung: API-Key prüfen (Profil → KI-Einstellungen)
- Lösung: Backend-Health-Check laufen lassen

**Problem: Reps werden nicht gezählt**
- Lösung: Person muss im READY-State sein (stabile Keypoints)
- Lösung: Bewegungen langsam und kontrolliert ausführen
- Lösung: Ausreichend Licht für gute Pose-Detection

**Problem: "Backend nicht verfügbar"**
- Lösung: Vercel-Backend-URL prüfen (`VERCEL_BACKEND_URL`)
- Lösung: CORS-Settings im Backend prüfen
- Lösung: Vercel-Deployment-Status checken

### Browser-Kompatibilität

**Unterstützt:**
- Chrome/Edge 90+ ✅
- Safari 14+ ✅ (iOS + macOS)
- Firefox 88+ ✅
- Samsung Internet 14+ ✅

**Nicht unterstützt:**
- Internet Explorer ❌
- Alte Android-Browser (<v90) ⚠️

**Erforderliche Features:**
- MediaDevices API (Kamera-Zugriff)
- localStorage
- Fetch API
- ES6+ (Arrow Functions, async/await, let/const)
- CSS Custom Properties

## Zusammenfassung

Die FitnessApp ist eine technisch anspruchsvolle, aber bewusst einfach gehaltene Progressive Web App, die moderne KI-Technologien (MediaPipe, Gemini) mit einem minimalistischen Vanilla-JS-Frontend kombiniert. Die Architektur folgt dem Prinzip "Progressive Enhancement" - Kernfunktionalität funktioniert offline, erweiterte Features (Food Scan, KI-Plan) erfordern API-Zugriff.

**Kernprinzipien:**
1. **Mobile-First:** Touch-optimierte UI, responsive Design
2. **Privacy-First:** Lokale Datenhaltung, keine User-Tracking
3. **AI-Powered:** Automatisierung ohne manuelle Eingabe
4. **Zero-Build:** Keine Transpilation, direkt im Browser lauffähig
5. **Serverless:** Skalierbare Backend-Funktionen ohne Server-Verwaltung

**Technologie-Stack-Zusammenfassung:**
- Frontend: Vanilla HTML/CSS/JS
- Pose-Estimation: MediaPipe Pose (Google)
- Vision-API: Google Gemini 1.5 Flash
- Backend: Vercel Serverless Functions (CommonJS)
- Storage: Browser localStorage
- Deployment: GitHub Pages + Vercel / Vercel All-in-One

Diese App ist ideal für Entwickler, die verstehen möchten, wie man moderne KI-APIs integriert, ohne komplexe Frameworks zu verwenden, und wie man eine vollständige Fitness-Tracking-Lösung mit minimalen Dependencies baut.
