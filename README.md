## KI-basierte Fitness- und Ernährungsplattform (Mobile First)

Interaktive mobile Web-App (ohne Build-Tools) für KI-gestützte Bewegungserkennung, automatisches Trainingstracking, Food-Scan und Planer.

### Schnellstart
1. Repo clonen / herunterladen.  
2. `index.html` im Browser öffnen (oder kleinen Server nutzen: `python -m http.server 8000`).  
3. **Gemini API-Schlüssel konfigurieren:**
   - Gehe zu [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Erstelle einen neuen API-Schlüssel
   - Öffne die App → Profil → KI-Einstellungen
   - Füge deinen API-Schlüssel ein und speichere ihn
4. Kamera-Tracking im Bereich **Training** aktivieren, Food-Scan testen oder Plan aktualisieren.

### Sicherheitshinweis
- **Dein API-Schlüssel wird ausschließlich lokal in deinem Browser gespeichert** (localStorage)
- Der Schlüssel wird **niemals an einen Server übertragen** oder ins Repository committed
- Er wird nur direkt von deinem Browser an die Google Gemini API gesendet
- Du kannst den Schlüssel jederzeit über die "Schlüssel löschen" Funktion entfernen
- **Bring your own key**: Jeder Nutzer muss seinen eigenen kostenlosen oder bezahlten Gemini API-Schlüssel verwenden

### Implementierte Kernfunktionen
- **Dashboard (Mobile First):** Tages-/Wochenstatus, Streak, Schnellstart für „Training scannen" und „Mahlzeit scannen".  
- **KI-Training mit Human Pose Estimation:** 
  - `getUserMedia` für Kamera-Viewport mit simulierter Skelett-Erkennung
  - **State Machine:** WAITING → READY → ACTIVE ↔ PAUSED → STOPPED
  - **Person Detection:** Training startet nur wenn Person erkannt und stabil getrackt wird
  - **Wiederholungszählung:** Nur bei aktiver Person und stabilen Keypoints
  - **Pause-Funktion:** Echte Pause ohne automatische Reaktivierung
  - **Stop-Button:** Manuelles Beenden mit zuverlässigem Kamera-Aus
  - Technik-Score, ROM- und Tempo-Hinweise, Satzprotokoll
- **Pose Replay System:**
  - Aufzeichnung aller Skeleton-Frames pro Satz
  - 2D-Skeleton-Visualisierung mit Keypoints und Verbindungen
  - Replay-Funktion für jeden gespeicherten Satz
  - Qualitätsmetriken und Form-Feedback im Replay
- **Automatisches Trainingstracking:** Auto-Satzabschluss bei 12 Wdh., Technik-Score, ROM- und Tempo-Hinweise.  
- **Food Scan (KI-gestützt):** Foto-Upload/Kamera mit Google Gemini Vision API, Portion-Slider, erkannte Makros/Kalorien, Tagebuch-Log.  
- **KI-Trainingsplanung:** Formular für Ziel, Level, Frequenz und Equipment; generierter Wochenplan inkl. Exercises.  
- **Integration & Datenschutz:** Dashboard verbindet Training/Ernährung, Profil mit Kamera-Opt-in, Wearable-Toggle, Vibration/Notifications.  
- **Lokale Persistenz:** Alle Logs, Plan, Profileinstellungen und Skeleton-Frames werden in `localStorage` gesichert.

### Pose Estimation Details
Das System verwendet eine State Machine für saubere Zustandsverwaltung:

1. **WAITING**: Wartet auf Person im Bild
   - Skeleton Detection läuft
   - Keine Wiederholungen werden gezählt
   
2. **READY**: Person erkannt und Keypoints stabil
   - Mindestens 3 stabile Frames erforderlich
   - Bereit für Tracking-Start
   
3. **ACTIVE**: Aktives Tracking
   - Wiederholungen werden gezählt
   - Nur bei stabilen Keypoints und erkannter Person
   - Qualitätsmetriken werden erfasst
   
4. **PAUSED**: Manuell pausiert
   - Keine automatische Reaktivierung
   - Resume nur durch Benutzer
   - Skeleton Detection läuft weiter
   
5. **STOPPED**: Training beendet
   - Kamera aus
   - Alle Intervals gestoppt
   - Aktueller Satz wird gespeichert

### Live Skeleton Visualization
- **Echtzeit-Darstellung** des Skeletts während des Trainings auf Canvas-Overlay
- **17 COCO-Standard-Keypoints**: Nase, Augen, Ohren, Schultern, Ellbogen, Handgelenke, Hüften, Knie, Knöchel
- **Perspektivunabhängige Erkennung**: frontal, seitlich, schräg
- **Farbcodierte Qualitätsanzeige**:
  - Grün/Cyan: Hohe Confidence (>75%)
  - Gelb: Mittlere Confidence (50-75%)
  - Rot: Niedrige Confidence (<50%)
- **Adaptive Keypoint-Größe** basierend auf Confidence-Level
- **Realistische Bewegungssimulation** mit reduziertem Jitter für stabile Posen

### Skeleton Replay & Analyse
- Jeder Satz speichert alle erfassten Frames mit vollständigen Keypoint-Daten
- Replay zeigt 2D-Skeleton-Visualisierung mit farbcodierten Keypoints
- Keypoints mit individuellen Confidence-Levels pro Gelenk
- Verbindungslinien zwischen Körperteilen (COCO-Format)
- Frame-by-Frame-Durchlauf mit Fortschrittsbalken
- Perspektive-Information (frontal/seitlich/schräg) im Replay-Log
- Qualitätsmetriken und Form-Feedback

### Datenverwaltung
- **Löschfunktion** für gespeicherte Sätze mit Bestätigungsdialog
- Automatische Persistierung in localStorage
- Komplettes Training-Log mit Wiederholungen, ROM, Tempo und Technik-Score

### Hinweise zur Nutzung
- Kamera wird nur nach Opt-in verwendet und kann jederzeit deaktiviert werden. Rohvideo wird nicht gespeichert.  
- Die Pose-Logik ist mock-basiert und simuliert Skeleton-Tracking, sodass sie offline im Browser funktioniert.
- **Für Food-Scan:** Kostenloser Gemini API-Schlüssel von [Google AI Studio](https://aistudio.google.com/app/apikey) erforderlich
- **API-Schlüssel Sicherheit:**
  - Wird nur lokal im Browser gespeichert (localStorage)
  - Nie ins Repository committed oder auf Server hochgeladen
  - Wird nur direkt an die Gemini API gesendet
  - Kann jederzeit gelöscht werden
- Mobile-First-Layout mit Bottom-Navigation, reduzierten Cards und Touch-optimierten Buttons.

### API-Schlüssel einrichten
1. Besuche [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Melde dich mit deinem Google-Konto an
3. Klicke auf "Create API Key"
4. Kopiere den generierten Schlüssel (beginnt mit "AIza...")
5. Öffne die App → Profil → KI-Einstellungen
6. Füge den Schlüssel ein und klicke auf "Schlüssel speichern"
7. Der Schlüssel wird lokal in deinem Browser gespeichert und für Food-Scans verwendet
