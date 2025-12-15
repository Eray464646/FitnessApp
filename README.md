## KI-basierte Fitness- und Ernährungsplattform (Mobile First)

Interaktive mobile Web-App (ohne Build-Tools) für KI-gestützte Bewegungserkennung, automatisches Trainingstracking, Food-Scan und Planer.

### Schnellstart
1. Repo clonen / herunterladen.  
2. `index.html` im Browser öffnen (oder kleinen Server nutzen: `python -m http.server 8000`).  
3. Kamera-Tracking im Bereich **Training** aktivieren, Food-Scan testen oder Plan aktualisieren.

### Implementierte Kernfunktionen
- **Dashboard (Mobile First):** Tages-/Wochenstatus, Streak, Schnellstart für „Training scannen“ und „Mahlzeit scannen“.  
- **KI-Training (Mock mit Kamera):** `getUserMedia` für Kamera-Viewport, simulierte Rep- & Tempo-Erkennung, Technik-Score, Satzprotokoll.  
- **Automatisches Trainingstracking:** Auto-Satzabschluss bei 12 Wdh., Technik-Score, ROM- und Tempo-Hinweise.  
- **Food Scan (Mock):** Foto-Upload/Kamera mit Portion-Slider, erkannte Makros/Kalorien, Tagebuch-Log.  
- **KI-Trainingsplanung:** Formular für Ziel, Level, Frequenz und Equipment; generierter Wochenplan inkl. Exercises.  
- **Integration & Datenschutz:** Dashboard verbindet Training/Ernährung, Profil mit Kamera-Opt-in, Wearable-Toggle, Vibration/Notifications.  
- **Lokale Persistenz:** Alle Logs, Plan und Profileinstellungen werden in `localStorage` gesichert.
- **Pose-basiertes Tracking:** Zählt Wiederholungen nur nach stabiler Person-/Keypoint-Erkennung, unterstützt Front-/Rückkamera und bietet ein Skelett-Replay.

### Hinweise zur Nutzung
- Kamera wird nur nach Opt-in verwendet und kann jederzeit deaktiviert werden. Rohvideo wird nicht gespeichert.  
- Die KI-Logik ist mock-basiert und simuliert Rep-/Makro-Erkennung, sodass sie offline im Browser funktioniert.  
- Mobile-First-Layout mit Bottom-Navigation, reduzierten Cards und Touch-optimierten Buttons.
