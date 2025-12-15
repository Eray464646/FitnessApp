## KI-basierte Fitness- und Ernährungsplattform (Mobile First)

Interaktive mobile Web-App (ohne Build-Tools) für KI-gestützte Bewegungserkennung, automatisches Trainingstracking, Food-Scan und Planer.

### Schnellstart
1. Repo clonen / herunterladen.  
2. `index.html` im Browser öffnen (oder kleinen Server nutzen: `python -m http.server 8000`).  
3. Kamera-Tracking im Bereich **Training** aktivieren, Food-Scan testen oder Plan aktualisieren.

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
- **Food Scan (KI-gestützt):** Foto-Upload/Kamera mit OpenAI Vision API, Portion-Slider, erkannte Makros/Kalorien, Tagebuch-Log.  
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

### Skeleton Replay
- Jeder Satz speichert alle erfassten Frames
- Replay zeigt 2D-Skeleton-Visualisierung
- Keypoints mit Confidence-Levels
- Verbindungslinien zwischen Körperteilen
- Frame-by-Frame-Durchlauf mit Fortschrittsbalken

### Hinweise zur Nutzung
- Kamera wird nur nach Opt-in verwendet und kann jederzeit deaktiviert werden. Rohvideo wird nicht gespeichert.  
- Die Pose-Logik ist mock-basiert und simuliert Skeleton-Tracking, sodass sie offline im Browser funktioniert.
- Für Food-Scan: OpenAI API-Schlüssel unter Profil → KI-Einstellungen konfigurieren
- Mobile-First-Layout mit Bottom-Navigation, reduzierten Cards und Touch-optimierten Buttons.
