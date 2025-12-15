## KI-basierte Fitness- und Ernährungsplattform (Mobile First)

Konzept und Struktur einer mobilen Web-App, die Training und Ernährung automatisch erkennt, bewertet und optimiert – ohne manuellen Tracking-Aufwand.

### Zielgruppe & Prinzipien
- **Fitness-Einsteiger und Freizeitsportler** mit wenig Zeit, Wunsch nach Automatisierung.
- **Mobile First**: Touch-optimiert, klare Sprache ohne Fachjargon, reduziertes UI, schnelle Ladezeiten (lazy loading, komprimierte Assets, Skeleton States).
- **Privacy by Design**: Kamera-Streams nur mit Zustimmung, lokale Vorverarbeitung, minimal notwendige Datenspeicherung.

### Kernfunktionen (Erlebnis)
1) **KI-Bewegungserkennung**  
   - Kamera erkennt Übung, Wiederholungen, Range of Motion (ROM)/Tempo/Haltung.  
   - Live-Feedback (Status-Indicator, Text-Hinweise, Vibration).  
   - Fehler werden markiert und ins Protokoll übernommen.
2) **Automatisches Trainingstracking**  
   - Auto-Rep/Satz/Pause-Erkennung, Technik-Score.  
   - Fortschrittskarten (Leistung, Technik, Konstanz), Tages-/Wochenübersicht.  
   - Motivationssystem: Score/Badges, Streaks, Performance-Anzeige.
3) **KI-Trainingsplanung**  
   - Input: Alter, Geschlecht, Größe, Gewicht, Level, Ziel, Häufigkeit, verfügbare Geräte.  
   - Automatischer Plan mit dynamischen Anpassungen (Fortschritt, Fatigue, Inaktivität).  
   - Alternativen bei Zeitmangel oder fehlendem Equipment.
4) **Food Scan (Ernährungserkennung)**  
   - Foto -> Erkennung von Lebensmitteln, Portion, Kalorien, Makros.  
   - Automatischer Tagebucheintrag, optionale manuelle Korrektur.  
   - Alltagstauglich (Resteverwertung, schnelle Snacks).
5) **Integration Training & Ernährung**  
   - Zentrales Dashboard Tag/Woche mit Zielstatus (Kalorien, Protein, Regeneration).  
   - Empfehlungen (z. B. Proteinbedarf, Regenerationshinweise).  
   - Optionale Wearables (Apple Watch, Fitbit, Garmin) für Puls/Schlaf/Steps.

### Informationsarchitektur (Hauptnavigation, unten)
- **Dashboard**: Tages-/Wochenstatus, Schnellstart „Training scannen“, „Mahlzeit scannen“.  
- **Training**: Aktives Training (Kamera), Verlauf, Technik-Insights, Plan-Anpassung.  
- **Ernährung**: Food Scan, Tagebuch, Makro-Ziele, Vorschläge.  
- **Plan**: Persönliche Ziele, Geräte-Auswahl, Trainingsfrequenz, geplante Sessions.  
- **Profil/Settings**: Geräte/Wearables, Datenschutz (Kamera-Opt-in), Einheiten, Barrierefreiheit.

### Wichtige Screens (Mobile First)
- **Onboarding**: Ziel & Geräte-Auswahl, Häufigkeit, Kamera-/Benachrichtigungs-Opt-in.  
- **Live-Training** (Portrait): Kamera-Viewport oben, Live-Feedback/Rep-Zähler sticky unten, Pause-Timer.  
- **Training-Review**: Technik-Score pro Satz, Fehlerhinweise mit kurzen Clips/Snapshots.  
- **Food Scan**: Kamera mit Auto-Crop/Auto-Licht-Hinweis, Ergebnis-Overlay (Gericht, Portion, Kalorien, Makros) + „Anpassen“-Button.  
- **Dashboard**: Karten für Training/Ernährung/Regeneration, Streak, heutige Aufgaben.  
- **Plan-Editor**: Wochenplan, Tausch von Übungen, Ersatzvorschläge bei fehlendem Equipment.

### Nutzerflüsse (Kurz)
- **Training starten**: Dashboard → „Training scannen“ → Kamera erkennt Übung → Live-Feedback → Auto-Satzabschluss → Review → Fortschritt-Update.  
- **Mahlzeit erfassen**: Dashboard → „Mahlzeit scannen“ → Foto → KI-Bewertung → Nutzer bestätigt/editiert → Tagebuch aktualisiert → Empfehlung (z. B. Protein offen).

### Datenmodell (logisch)
- `User`: Basisdaten, Ziele, Level, Präferenzen, Geräte.  
- `TrainingSession`: start/end, erkannte Übung(en), `Set[]`, Technik-Score, Pausen.  
- `Set`: Übung, Wiederholungen, Gewicht (optional), Tempo, ROM, Fehler.  
- `Exercise`: Name, Typ (Körpergewicht/Gewicht/Gerät), Bewegungsmuster, empfohlenes Tempo und Range of Motion.  
- `Plan`: Wochenstruktur, Ziel, Frequenz, Alternativübungen.  
- `FoodEntry`: Bild-Referenz, Zutaten, Portion, Kalorien, Makros, Korrekturen.  
- `Recommendation`: Ernährung (Protein/Kalorien), Training (Load/Deload), Regeneration.

### Technische Architektur (Kurzfassung)
- **Frontend**: PWA, Mobile-First UI. Stack: React/Next (Default wegen breiter Lib-/Hiring-Basis) oder Vue/Nuxt bei vorhandener Team-Expertise. Service Worker für Offline-Caches, Web Share, Camera API (getUserMedia), Vibration API für Feedback.  
- **On-Device KI**: WebAssembly/WebGPU-Modelle (Pose/Rep/ROM), Fallback auf Server-Inferenz bei schwachen Geräten.  
- **Backend/Services**:  
  - Auth + Profile + Plans  
  - Training Tracking & Scoring  
  - Food Vision API (präferiert Custom/On-Device, Cloud Vision als Fallback bei schwachen Geräten oder für kalibrierte Kaltstarts) + Portion Estimation  
  - Recommendation Engine (Rules + ML)  
  - Analytics/Events (privacy-preserving)  
- **Integrationen**: Wearables über OAuth/Health APIs; Push Notifications (Web Push).  
- **Speicherung**:  
  - Lokal: IndexedDB für Offline-Sessions/Tagebuch-Entwürfe.  
  - Server: Postgres (strukturierte Daten), Object Storage (Bilder/Clips), Feature Store für KI.  
- **Sicherheit**: TLS, minimale Datenspeicherung, Einwilligung pro Kamera-Use-Case, Role-based Access, DSGVO-konforme Datenlöschung.

### KI/ML-Pipeline (high-level)
1. **Pose Detection** (on-device) → Keypoints.  
2. **Rep & Tempo Detection** → Wiederholungen/Sätze, ROM/Tempo/Explosivität.  
3. **Form Assessment** → Fehlerklassen (Knie nach innen/Valgusfehlstellung, Rundrücken, Tiefe, Balance).  
4. **Scoring** → Technik-Score pro Satz, Confidence.  
5. **Training Plan Adapter** → Load-Anpassung, Übungsalternativen.  
6. **Food Vision** → Zutaten + Portion → Kalorien/Makros → Tagebuch.  
7. **Recommendation Layer** → Makro-Guidance, Regenerationshinweise, Streak-Motivation.

### Zustände, Offline & Edge Cases
- Schlechte Verbindung: Fallback auf On-Device-Inferenz, Caching von Sessions/Food-Scans, Upload bei Netz-Rückkehr.  
- Niedrige Beleuchtung/Kamera-Probleme: Nutzer-Hinweise (Licht, Abstand), Retry-Flow.  
- Datenschutz: „Kein Speichern von Rohvideo“, nur Keypoints/Snapshots bei Zustimmung.

### Gamification & Motivation
- Streaks, Technik-Badges, Weekly Scorecards, Vergleich „zu letzter Woche“.  
- Nudges bei Inaktivität mit konkreten, kurzen Sessions (10-min Quick Starts).

### Deliverables/MVP-Umfang
- Mobile-First PWA-Shell mit: Dashboard, Live-Training-Flow (Mock KI), Food-Scan-Flow (Mock), Plan-Setup, Tagebuch-/Verlaufsansicht.  
- Schnittstellen definiert für spätere echte KI-Modelle und Wearable-Anbindung.
