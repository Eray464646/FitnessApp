const STORAGE_KEY = "fitnessAppState";

const defaultPlan = () => ({
  age: 28,
  gender: "divers",
  height: 178,
  weight: 75,
  goal: "aufbau",
  level: "anfänger",
  frequency: 3,
  equipment: "körpergewicht",
  days: [
    { day: "Montag", focus: "Ganzkörper", exercises: ["Kniebeugen", "Liegestütze erhöht", "Ausfallschritte", "Plank 3x40s"] },
    { day: "Mittwoch", focus: "Pull/Posterior", exercises: ["Hip Hinge", "Rows mit Band", "Glute Bridge", "Side Plank"] },
    { day: "Freitag", focus: "Push/Core", exercises: ["Kniebeugen pausiert", "Push-ups", "Shoulder Taps", "Hollow Hold"] }
  ]
});

const state = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sets: [], foodEntries: [], plan: defaultPlan(), profile: {} };
    const parsed = JSON.parse(raw);
    return {
      sets: parsed.sets || [],
      foodEntries: parsed.foodEntries || [],
      plan: parsed.plan || defaultPlan(),
      profile: parsed.profile || {}
    };
  } catch (e) {
    console.warn("Fallback to fresh state", e);
    return { sets: [], foodEntries: [], plan: defaultPlan(), profile: {} };
  }
})();

let cameraStream;
let repInterval;
let repCount = 0;
let tempoLabel = "—";
let lastFoodDetection;
let poseDetectionInterval;
let replayTimer;
let activeFacingMode = "environment";
let currentFacingMode = "environment";

// Training states: WAITING -> READY -> ACTIVE <-> PAUSED -> STOPPED
const TrainingState = {
  WAITING: "WAITING",      // Waiting for person to be detected
  READY: "READY",          // Person detected and stable, ready to start
  ACTIVE: "ACTIVE",        // Actively tracking movements
  PAUSED: "PAUSED",        // Paused by user, no auto-reactivation
  STOPPED: "STOPPED"       // Training ended, camera off
};

const poseState = {
  personDetected: false,
  keypointsStable: false,
  ready: false,
  replayFrames: [],
  trainingState: TrainingState.STOPPED,
  currentSetFrames: []  // Frames for the current set
};
const motionTracker = {
  progress: 0,
  lastQuality: 0,
  lastROM: "teilweise",
  lastTempo: "kontrolliert"
};

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll(".nav-btn");
const quickNavButtons = document.querySelectorAll("[data-nav-target]");

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function switchView(targetId) {
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById(targetId).classList.add("active");
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
}

navButtons.forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.target))
);
quickNavButtons.forEach((btn) =>
  btn.addEventListener("click", () => switchView(btn.dataset.navTarget))
);

function setAIStatus(text, tone = "info") {
  const pill = document.getElementById("ai-status");
  pill.textContent = text;
  pill.style.background = tone === "warn" ? "#fee2e2" : "#e0e7ff";
  pill.style.color = tone === "warn" ? "#b91c1c" : "#3730a3";
}

function resetPoseTracking() {
  poseState.personDetected = false;
  poseState.keypointsStable = false;
  poseState.ready = false;
  poseState.currentSetFrames = [];
  motionTracker.progress = 0;
  document.getElementById("rep-count").textContent = "0";
  document.getElementById("tempo-info").textContent = "Tempo: —";
  repCount = 0;
  document.getElementById("training-feedback").innerHTML =
    "<p class='title'>Warte auf Person im Bild</p><p class='muted'>Keypoints müssen stabil getrackt werden</p>";
  setAIStatus("Warte auf Person im Bild", "warn");
  updateReplayLog();
}

function simulateSkeletonFrame() {
  const keypointsTracked = 12 + Math.floor(Math.random() * 5);
  const confidence = 0.55 + Math.random() * 0.4;
  const stability = confidence > 0.7 && Math.random() > 0.2 ? "stable" : "shaky";
  const rangeDelta = stability === "stable" ? 0.28 + Math.random() * 0.25 : 0.08;
  const postureScore = Math.min(1, 0.65 + Math.random() * 0.35);
  const tempoOptions = ["kontrolliert", "explosiv", "langsam"];
  const tempo = tempoOptions[Math.floor(Math.random() * tempoOptions.length)];
  
  // Simulate keypoints for replay visualization - ensure at least 17 for skeleton connections
  const keypointCount = Math.max(17, keypointsTracked);
  const keypoints = Array.from({ length: keypointCount }, (_, idx) => ({
    id: idx,
    x: 0.3 + Math.random() * 0.4,  // Normalized 0-1
    y: 0.2 + Math.random() * 0.6,
    confidence: confidence + (Math.random() - 0.5) * 0.2  // Vary confidence per keypoint
  }));
  
  return {
    timestamp: Date.now(),
    keypointsTracked,
    confidence,
    stability,
    postureScore,
    rangeDelta,
    tempo,
    keypoints
  };
}

function updateReplayLog() {
  const container = document.getElementById("replay-log");
  if (!container) return;
  if (!poseState.replayFrames.length) {
    container.innerHTML = `<div class="log-item muted">Noch keine Aufzeichnung</div>`;
    return;
  }
  const frames = poseState.replayFrames.slice(-5);
  container.innerHTML = frames
    .map(
      (frame, idx) => `
        <div class="log-item">
          <strong>Frame ${poseState.replayFrames.length - frames.length + idx + 1}</strong><br/>
          <span class="muted small">${new Date(frame.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Keypoints ${frame.keypointsTracked} · ${frame.stability}</span>
        </div>
      `
    )
    .join("");
}

function startPoseBootstrap() {
  clearInterval(poseDetectionInterval);
  resetPoseTracking();
  poseState.trainingState = TrainingState.WAITING;
  let stableFrames = 0;
  let lostFrames = 0;
  poseDetectionInterval = setInterval(() => {
    if (!cameraStream || poseState.trainingState === TrainingState.STOPPED) {
      clearInterval(poseDetectionInterval);
      return;
    }
    
    // Don't process if paused - maintain pause state
    if (poseState.trainingState === TrainingState.PAUSED) {
      return;
    }
    
    const frame = simulateSkeletonFrame();
    poseState.replayFrames.push(frame);
    if (poseState.replayFrames.length > 120) poseState.replayFrames.shift();
    
    // Store frame for current set
    if (poseState.trainingState === TrainingState.ACTIVE || poseState.trainingState === TrainingState.READY) {
      poseState.currentSetFrames.push(frame);
      if (poseState.currentSetFrames.length > 200) poseState.currentSetFrames.shift();
    }
    
    updateReplayLog();

    lostFrames = frame.confidence < 0.45 ? lostFrames + 1 : 0;
    if (lostFrames >= 3) {
      poseState.personDetected = false;
      poseState.keypointsStable = false;
      poseState.ready = false;
      poseState.trainingState = TrainingState.WAITING;
      stableFrames = 0;
      clearInterval(repInterval);
      document.getElementById("camera-status").textContent = "Warte auf Person...";
      document.getElementById("training-feedback").innerHTML =
        "<p class='title'>Warte auf Person im Bild</p><p class='muted'>Tracking pausiert</p>";
      setAIStatus("Warte auf Person im Bild", "warn");
      return;
    }

    if (!poseState.personDetected && frame.confidence > 0.65) {
      poseState.personDetected = true;
      document.getElementById("camera-status").textContent = "Person erkannt";
      setAIStatus("Person erkannt");
    }

    if (poseState.personDetected) {
      stableFrames = frame.stability === "stable" && frame.confidence > 0.7 ? stableFrames + 1 : Math.max(0, stableFrames - 1);
      if (!poseState.keypointsStable && stableFrames >= 3) {
        poseState.keypointsStable = true;
        document.getElementById("camera-status").textContent = "Keypoints stabil";
        setAIStatus("Pose stabil – Tracking startet");
      }
    }

    if (poseState.keypointsStable && !poseState.ready && poseState.trainingState === TrainingState.WAITING) {
      poseState.ready = true;
      poseState.trainingState = TrainingState.READY;
      document.getElementById("training-feedback").innerHTML =
        "<p class='title'>Pose stabil</p><p class='muted'>Start-Position erkannt – Bewegung verfolgen</p>";
      startRepDetection();
    }
  }, 800);
}

function playReplay() {
  const container = document.getElementById("replay-log");
  if (!poseState.replayFrames.length) {
    container.innerHTML = `<div class="log-item muted">Keine Aufzeichnung verfügbar</div>`;
    return;
  }
  clearInterval(replayTimer);
  const frames = poseState.replayFrames.slice(-20);
  let idx = 0;
  replayTimer = setInterval(() => {
    const frame = frames[idx];
    container.innerHTML = `
      <div class="log-item">
        <strong>Replay ${idx + 1}/${frames.length}</strong><br/>
        <span class="muted small">${new Date(frame.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Keypoints ${frame.keypointsTracked} · ${frame.stability}</span>
        <div class="skeleton-viz">${renderSkeletonViz(frame.keypoints)}</div>
      </div>
    `;
    idx += 1;
    if (idx >= frames.length) {
      clearInterval(replayTimer);
      updateReplayLog();
    }
  }, 500);
}

function replaySet(setIndex) {
  const set = state.sets[setIndex];
  if (!set || !set.frames || !set.frames.length) {
    alert("Keine Aufzeichnung für diesen Satz verfügbar");
    return;
  }
  
  const container = document.getElementById("replay-log");
  clearInterval(replayTimer);
  
  let idx = 0;
  const frames = set.frames;
  
  container.innerHTML = `
    <div class="log-item">
      <strong>Set Replay: ${escapeHTML(set.exercise)}</strong><br/>
      <span class="muted small">Starte Replay von ${frames.length} Frames...</span>
    </div>
  `;
  
  replayTimer = setInterval(() => {
    const frame = frames[idx];
    container.innerHTML = `
      <div class="log-item">
        <strong>Set Replay: ${escapeHTML(set.exercise)} - Frame ${idx + 1}/${frames.length}</strong><br/>
        <span class="muted small">
          Qualität: ${Math.round(frame.postureScore * 100)}% · 
          Keypoints: ${frame.keypointsTracked} · 
          ${frame.stability}
        </span>
        <div class="skeleton-viz">${renderSkeletonViz(frame.keypoints)}</div>
        <div class="progress-bar" style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; margin-top: 8px;">
          <div style="width: ${(idx / frames.length) * 100}%; height: 100%; background: linear-gradient(135deg, #6366f1, #22d3ee); border-radius: 2px;"></div>
        </div>
      </div>
    `;
    idx += 1;
    if (idx >= frames.length) {
      clearInterval(replayTimer);
      setTimeout(() => {
        container.innerHTML = `
          <div class="log-item">
            <strong>Replay abgeschlossen</strong><br/>
            <span class="muted small">Satz: ${escapeHTML(set.exercise)} · ${set.reps} Wdh · Technik ${set.quality}%</span>
            <button class="tiny-btn" onclick="replaySet(${setIndex})">🔄 Erneut abspielen</button>
          </div>
        `;
      }, 1000);
    }
  }, 400);
}

function renderSkeletonViz(keypoints) {
  if (!keypoints || !keypoints.length) {
    return '<span class="muted small">Keine Keypoints verfügbar</span>';
  }
  
  // Create a simple 2D visualization of keypoints
  const width = 200;
  const height = 150;
  let svg = `<svg width="${width}" height="${height}" style="background: #f8fafc; border-radius: 8px; margin-top: 8px;">`;
  
  // Draw connections between keypoints (simplified skeleton)
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], // head to shoulders
    [1, 5], [5, 6], [6, 7],         // left arm
    [1, 8], [8, 9], [9, 10],        // right arm
    [1, 11], [11, 12], [12, 13],    // left leg
    [1, 14], [14, 15], [15, 16]     // right leg
  ];
  
  connections.forEach(([a, b]) => {
    if (keypoints[a] && keypoints[b]) {
      const x1 = keypoints[a].x * width;
      const y1 = keypoints[a].y * height;
      const x2 = keypoints[b].x * width;
      const y2 = keypoints[b].y * height;
      const opacity = Math.min(1, Math.max(0, Math.min(keypoints[a].confidence, keypoints[b].confidence)));
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6366f1" stroke-width="2" opacity="${opacity}" />`;
    }
  });
  
  // Draw keypoints
  keypoints.forEach(kp => {
    const x = kp.x * width;
    const y = kp.y * height;
    const confidence = Math.min(1, Math.max(0, kp.confidence));
    const radius = 3 + confidence * 2;
    svg += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#22d3ee" opacity="${confidence}" />`;
  });
  
  svg += '</svg>';
  return svg;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function renderSets() {
  const list = document.getElementById("sets-list");
  if (!state.sets.length) {
    list.innerHTML = `<div class="log-item muted">Noch keine Sätze erfasst.</div>`;
    return;
  }
  list.innerHTML = state.sets
    .slice(-6)
    .reverse()
    .map(
      (set, idx) => `
        <div class="log-item">
          <strong>${escapeHTML(set.exercise)}</strong> • ${set.reps} Wdh · Technik ${set.quality}%<br/>
          <span class="muted small">${new Date(set.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ROM: ${escapeHTML(set.rom)} · Tempo: ${escapeHTML(set.tempo)}</span>
          ${set.frames && set.frames.length > 0 ? `<br/><button class="tiny-btn" onclick="replaySet(${state.sets.length - 1 - idx})">🔄 Replay anzeigen</button>` : ''}
        </div>
      `
    )
    .join("");
}

function renderFoodLog() {
  const log = document.getElementById("food-log");
  if (!state.foodEntries.length) {
    log.innerHTML = `<div class="log-item muted">Noch keine Mahlzeiten erfasst.</div>`;
    return;
  }
  log.innerHTML = state.foodEntries
    .slice(-6)
    .reverse()
    .map(
      (entry) => `
      <div class="log-item">
        <strong>${escapeHTML(entry.label)}</strong> • ${entry.calories} kcal<br/>
        <span class="muted small">Protein ${entry.protein} g · KH ${entry.carbs} g · Fett ${entry.fat} g · ${new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    `
    )
    .join("");
}

function computeStreak() {
  const days = new Set();
  state.sets.forEach((s) => days.add(s.timestamp.slice(0, 10)));
  state.foodEntries.forEach((f) => days.add(f.timestamp.slice(0, 10)));
  let streak = 0;
  let cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderDashboard() {
  const today = todayKey();
  const todaySets = state.sets.filter((s) => s.timestamp.startsWith(today));
  const reps = todaySets.reduce((sum, s) => sum + s.reps, 0);
  const tech =
    todaySets.length === 0
      ? 0
      : Math.round(todaySets.reduce((sum, s) => sum + s.quality, 0) / todaySets.length);
  document.getElementById("today-reps").textContent = reps;
  document.getElementById("tech-score").textContent = `Technik-Score: ${tech}%`;

  const todayFood = state.foodEntries.filter((f) => f.timestamp.startsWith(today));
  const calories = todayFood.reduce((sum, f) => sum + f.calories, 0);
  const protein = todayFood.reduce((sum, f) => sum + f.protein, 0);
  document.getElementById("today-calories").textContent = calories;
  document.getElementById("today-protein").textContent = `Protein: ${protein} g`;

  document.getElementById("streak-score").textContent = computeStreak();
  document.getElementById("recovery-hint").textContent =
    tech > 75 ? "Form solide – nächste Session starten" : "Locker warm werden & Technik fokussieren";

  const nextSession = document.getElementById("next-session");
  nextSession.innerHTML = state.plan.days
    .slice(0, 2)
    .map((d) => `<span class="pill">${escapeHTML(d.day)}: ${escapeHTML(d.focus)}</span>`)
    .join("");

  const recent = [...state.sets, ...state.foodEntries]
    .slice(-5)
    .reverse()
    .map((item) => {
      const isSet = "reps" in item;
      return `
        <div class="activity-item">
          <div>
            <strong>${escapeHTML(isSet ? item.exercise : item.label)}</strong><br/>
            <span class="muted small">${isSet ? `${item.reps} Wdh · Technik ${item.quality}%` : `${item.calories} kcal`}</span>
          </div>
          <span class="muted small">${new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      `;
    })
    .join("");
  document.getElementById("recent-activity").innerHTML = recent || `<div class="muted">Keine Aktivitäten</div>`;
}

async function startCamera(facingMode = activeFacingMode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    setAIStatus("Kamera nicht verfügbar", "warn");
    return false;
  }
  try {
    stopCamera();
    currentFacingMode = facingMode;
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
    const video = document.getElementById("camera-feed");
    video.srcObject = cameraStream;
    await video.play();
    document.getElementById("camera-status").textContent = "Kamera live – warte auf Person";
    setAIStatus("Warte auf Person im Bild");
    return true;
  } catch (e) {
    console.error(e);
    document.getElementById("camera-status").textContent = "Zugriff verweigert";
    setAIStatus("Kamera verweigert", "warn");
    return false;
  }
}

function stopCamera() {
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  clearInterval(repInterval);
  clearInterval(poseDetectionInterval);
  poseState.ready = false;
  poseState.personDetected = false;
  poseState.keypointsStable = false;
  document.getElementById("camera-status").textContent = "Kamera inaktiv";
}

function startRepDetection() {
  clearInterval(repInterval);
  if (!poseState.keypointsStable) {
    document.getElementById("training-feedback").innerHTML =
      "<p class='title'>Warte auf stabile Pose</p><p class='muted'>Tracking startet nach Keypoints</p>";
    return;
  }
  
  poseState.trainingState = TrainingState.ACTIVE;
  setAIStatus("Tracking aktiv");
  repInterval = setInterval(() => {
    // Don't count reps if not in active state
    if (poseState.trainingState !== TrainingState.ACTIVE) {
      return;
    }
    
    if (!poseState.personDetected || !poseState.keypointsStable) {
      motionTracker.progress = 0;
      document.getElementById("training-feedback").innerHTML =
        "<p class='title'>Person verloren</p><p class='muted'>Warte auf stabile Keypoints</p>";
      setAIStatus("Warte auf Person im Bild", "warn");
      return;
    }

    const frame = simulateSkeletonFrame();
    poseState.replayFrames.push(frame);
    if (poseState.replayFrames.length > 120) poseState.replayFrames.shift();
    
    // Store frame for current set
    poseState.currentSetFrames.push(frame);
    if (poseState.currentSetFrames.length > 200) poseState.currentSetFrames.shift();
    
    updateReplayLog();

    if (frame.stability !== "stable" || frame.confidence < 0.65) {
      motionTracker.progress = Math.max(0, motionTracker.progress - 0.2);
      document.getElementById("training-feedback").innerHTML =
        "<p class='title'>Tracking instabil</p><p class='muted'>Position ruhig halten</p>";
      return;
    }

    motionTracker.progress = Math.min(1, motionTracker.progress + frame.rangeDelta);
    motionTracker.lastTempo = frame.tempo;
    motionTracker.lastQuality = Math.round(frame.postureScore * 100);
    motionTracker.lastROM =
      motionTracker.progress >= 0.95 ? "voll" : motionTracker.progress >= 0.6 ? "teilweise" : "unvollständig";
    tempoLabel = frame.tempo;

    const feedback =
      motionTracker.progress < 0.3
        ? "<p class='title'>Start-Position</p><p class='muted'>Haltung beibehalten</p>"
        : motionTracker.progress < 0.8
          ? "<p class='title'>Bewegung erkannt</p><p class='muted'>Volle ROM ausführen</p>"
          : "<p class='title'>End-Position</p><p class='muted'>Spanne Core an</p>";
    document.getElementById("training-feedback").innerHTML = feedback;

    if (motionTracker.progress >= 1) {
      repCount += 1;
      motionTracker.progress = 0;
      document.getElementById("rep-count").textContent = repCount;
      document.getElementById("tempo-info").textContent = `Tempo: ${tempoLabel}`;
      document.getElementById("training-feedback").innerHTML =
        "<p class='title'>Saubere Wiederholung</p><p class='muted'>Start → Bewegung → End-Position</p>";
      if (repCount >= 12) saveSet(true);
    }
  }, 950);
}

async function handleStartTraining() {
  const consent = document.getElementById("camera-consent");
  if (!consent.checked) {
    consent.checked = true;
    state.profile.cameraConsent = true;
  }
  
  // If paused, resume instead of restarting
  if (poseState.trainingState === TrainingState.PAUSED) {
    resumeTraining();
    return;
  }
  
  activeFacingMode = document.getElementById("camera-facing").value || "environment";
  const ok = (cameraStream && currentFacingMode === activeFacingMode) || (await startCamera(activeFacingMode));
  if (!ok) return;
  startPoseBootstrap();
}

function pauseTraining() {
  if (poseState.trainingState !== TrainingState.ACTIVE && poseState.trainingState !== TrainingState.READY) {
    return;
  }
  
  clearInterval(repInterval);
  poseState.trainingState = TrainingState.PAUSED;
  document.getElementById("training-feedback").innerHTML =
    "<p class='title'>Training pausiert</p><p class='muted'>Klicke 'KI-Tracking starten' zum Fortfahren</p>";
  setAIStatus("Training pausiert", "warn");
  document.getElementById("camera-status").textContent = "Pausiert";
}

function resumeTraining() {
  if (poseState.trainingState !== TrainingState.PAUSED) {
    return;
  }
  
  if (poseState.keypointsStable && poseState.personDetected) {
    poseState.trainingState = TrainingState.ACTIVE;
    startRepDetection();
    document.getElementById("camera-status").textContent = "Tracking aktiv";
    setAIStatus("Training fortgesetzt");
  } else {
    // If person lost during pause, restart bootstrap
    poseState.trainingState = TrainingState.WAITING;
    startPoseBootstrap();
  }
}

function stopTraining() {
  poseState.trainingState = TrainingState.STOPPED;
  clearInterval(repInterval);
  clearInterval(poseDetectionInterval);
  stopCamera();
  
  document.getElementById("training-feedback").innerHTML =
    "<p class='title'>Training beendet</p><p class='muted'>Kamera ausgeschaltet</p>";
  setAIStatus("Training beendet");
  
  // Save current set if there are reps
  if (repCount > 0) {
    saveSet(false);
  }
}

function saveSet(auto = false) {
  clearInterval(repInterval);
  if (repCount === 0) {
    document.getElementById("training-feedback").innerHTML =
      "<p class='title'>Noch nichts erkannt</p><p class='muted'>Starte Bewegung</p>";
    return;
  }
  const romLabel =
    motionTracker.lastROM === "unvollständig" ? "teilweise" : motionTracker.lastROM || (repCount > 10 ? "voll" : "teilweise");
  const qualityScore =
    motionTracker.lastQuality > 0 ? Math.min(98, Math.max(60, motionTracker.lastQuality)) : Math.min(98, 70 + Math.round(Math.random() * 25));
  const set = {
    exercise: document.getElementById("exercise-select").value,
    reps: repCount,
    tempo: motionTracker.lastTempo || tempoLabel,
    rom: romLabel,
    quality: qualityScore,
    timestamp: new Date().toISOString(),
    auto,
    // Store skeleton frames for replay
    frames: poseState.currentSetFrames.slice()
  };
  state.sets.push(set);
  
  // Reset for next set
  repCount = 0;
  poseState.currentSetFrames = [];
  document.getElementById("rep-count").textContent = "0";
  document.getElementById("tempo-info").textContent = "Tempo: —";
  document.getElementById("training-feedback").innerHTML =
    "<p class='title'>Satz gespeichert</p><p class='muted'>Auto-Tracking aktiv</p>";
  persist();
  renderSets();
  renderDashboard();
  
  // Resume if paused, otherwise continue tracking
  if (poseState.trainingState === TrainingState.PAUSED) {
    resumeTraining();
  }
}

async function detectFoodWithAI(imageDataUrl) {
  setAIStatus("Analysiere Bild...", "info");
  
  try {
    // Call OpenAI Vision API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getOpenAIKey()}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analysiere dieses Bild und identifiziere alle Lebensmittel. Gib die Antwort als JSON zurück mit folgendem Format: {\"detected\": true/false, \"items\": [\"item1\", \"item2\"], \"label\": \"Hauptgericht Name\", \"confidence\": 0-100, \"calories\": Zahl, \"protein\": Zahl, \"carbs\": Zahl, \"fat\": Zahl, \"reasoning\": \"kurze Erklärung\"}. Wenn kein Essen erkennbar ist, setze detected auf false. Schätze realistische Nährwerte für eine typische Portion."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Try to extract JSON from the response
    let result;
    try {
      // Try to parse as direct JSON
      result = JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in the text
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          result = JSON.parse(objectMatch[0]);
        } else {
          throw new Error('Could not parse response');
        }
      }
    }

    if (!result.detected) {
      setAIStatus("Kein Essen erkannt", "warn");
      return null;
    }

    setAIStatus("Analyse abgeschlossen", "info");
    
    return {
      label: result.label,
      calories: Math.round(result.calories),
      protein: Math.round(result.protein),
      carbs: Math.round(result.carbs),
      fat: Math.round(result.fat),
      confidence: result.confidence,
      items: result.items,
      reasoning: result.reasoning
    };
    
  } catch (error) {
    console.error('Food detection error:', error);
    setAIStatus("Fehler bei der Analyse", "warn");
    
    // Show error to user
    document.getElementById("food-details").innerHTML = `
      <p class='muted' style='color: #b91c1c;'>
        Fehler bei der Bilderkennung: ${escapeHTML(error.message)}<br/>
        <span class='small'>Bitte überprüfe die API-Konfiguration oder versuche es später erneut.</span>
      </p>
    `;
    
    return null;
  }
}

function getOpenAIKey() {
  // Get API key from localStorage (user sets it in profile)
  const storedKey = localStorage.getItem('openai_api_key');
  if (storedKey) return storedKey;
  
  // If no key is stored, throw error - user must configure it in profile
  throw new Error('Kein OpenAI API-Schlüssel konfiguriert. Bitte gehe zu Profil → KI-Einstellungen.');
}

function renderFoodDetection() {
  if (!lastFoodDetection) {
    document.getElementById("food-details").innerHTML = "<p class='muted'>Warte auf Scan...</p>";
    return;
  }
  const portion = Number(document.getElementById("portion-slider").value);
  const scaled = {
    calories: Math.round(lastFoodDetection.calories * portion),
    protein: Math.round(lastFoodDetection.protein * portion),
    carbs: Math.round(lastFoodDetection.carbs * portion),
    fat: Math.round(lastFoodDetection.fat * portion)
  };
  
  // Build detailed info including AI confidence and detected items
  let detailsHTML = `<strong>${escapeHTML(lastFoodDetection.label)}</strong><br/>`;
  
  if (lastFoodDetection.confidence !== undefined) {
    detailsHTML += `<span class="muted small">KI-Sicherheit: ${lastFoodDetection.confidence}%</span><br/>`;
  }
  
  if (lastFoodDetection.items && lastFoodDetection.items.length > 0) {
    detailsHTML += `<span class="muted small">Erkannt: ${lastFoodDetection.items.map(escapeHTML).join(', ')}</span><br/>`;
  }
  
  detailsHTML += `<span class="muted small">Kalorien ${scaled.calories} · Protein ${scaled.protein} g · KH ${scaled.carbs} g · Fett ${scaled.fat} g</span>`;
  
  if (lastFoodDetection.reasoning) {
    detailsHTML += `<br/><span class="muted small" style="font-style: italic;">${escapeHTML(lastFoodDetection.reasoning)}</span>`;
  }
  
  document.getElementById("food-details").innerHTML = detailsHTML;
  return scaled;
}

async function handleFoodInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    const preview = document.getElementById("food-preview");
    preview.src = e.target.result;
    
    // Show loading state
    document.getElementById("food-details").innerHTML = "<p class='muted'>🔍 KI analysiert das Bild...</p>";
    setAIStatus("Bild wird analysiert...", "info");
    
    // Call AI vision API
    lastFoodDetection = await detectFoodWithAI(e.target.result);
    
    if (lastFoodDetection) {
      renderFoodDetection();
    } else {
      document.getElementById("food-details").innerHTML = "<p class='muted' style='color: #b91c1c;'>Kein Essen im Bild erkannt. Bitte versuche es mit einem anderen Foto.</p>";
      setAIStatus("Kein Essen erkannt", "warn");
    }
  };
  reader.readAsDataURL(file);
}

function saveFoodEntry() {
  if (!lastFoodDetection) {
    document.getElementById("food-details").innerHTML = "<p class='muted'>Bitte zuerst ein Foto wählen.</p>";
    return;
  }
  const scaled = renderFoodDetection();
  const entry = {
    label: lastFoodDetection.label,
    ...scaled,
    timestamp: new Date().toISOString()
  };
  state.foodEntries.push(entry);
  persist();
  renderFoodLog();
  renderDashboard();
}

function generatePlan(evt) {
  evt?.preventDefault();
  
  // Read all form values
  const age = Number(document.getElementById("age").value);
  const gender = document.getElementById("gender").value;
  const height = Number(document.getElementById("height").value);
  const weight = Number(document.getElementById("weight").value);
  const equipment = document.getElementById("equipment").value;
  const frequency = Number(document.getElementById("frequency").value) || 3;
  const goal = document.getElementById("goal").value;
  const level = document.getElementById("level").value;
  
  // Determine exercises based on equipment
  const baseExercises =
    equipment === "studio"
      ? ["Kniebeugen", "Bankdrücken", "Kreuzheben", "Klimmzüge", "Rudern Kabel", "Plank"]
      : equipment === "kurzhanteln"
        ? ["Goblet Squat", "Kurzhantel-Bankdrücken", "Einarm-Rudern", "Rumänisches Kreuzheben", "Plank"]
        : ["Kniebeugen", "Liegestütze", "Hip Thrust", "Rows mit Band", "Split Squats", "Plank"];

  // Generate days based on frequency
  const days = Array.from({ length: Math.max(2, Math.min(6, frequency)) }).map((_, idx) => {
    // Vary focus based on goal and day pattern
    let focus;
    if (goal === "fatloss") {
      focus = idx % 2 === 0 ? "Ganzkörper" : "HIIT/Metcon";
    } else if (goal === "performance") {
      const focusTypes = ["Kraft", "Explosiv", "Technik"];
      focus = focusTypes[idx % 3];
    } else {
      focus = idx % 2 === 0 ? "Ganzkörper" : "Kraft/Core";
    }
    
    // Adjust number of exercises based on level
    const exerciseCounts = {
      "anfänger": 3,
      "mittel": 4,
      "fortgeschritten": 5
    };
    const exerciseCount = exerciseCounts[level] || 3;
    const exercises = baseExercises.slice(0, Math.min(exerciseCount, baseExercises.length));
    
    return {
      day: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][idx] || `Tag ${idx + 1}`,
      focus,
      exercises
    };
  });

  // Save all form values to plan state
  state.plan = { 
    age, 
    gender, 
    height, 
    weight, 
    equipment, 
    frequency, 
    goal, 
    level, 
    days 
  };
  
  persist();
  renderPlan();
  renderDashboard();
  
  // Show success feedback
  setAIStatus("Plan aktualisiert", "info");
  setTimeout(() => setAIStatus("KI bereit", "info"), 2000);
}

function renderPlan() {
  const wrap = document.getElementById("plan-days");
  wrap.innerHTML = state.plan.days
    .map(
      (d) => `
    <div class="log-item">
      <strong>${escapeHTML(d.day)}</strong> – ${escapeHTML(d.focus)}<br/>
      <span class="muted small">${d.exercises.map(escapeHTML).join(" · ")}</span>
    </div>`
    )
    .join("");
  document.getElementById("plan-summary").textContent = `${state.plan.frequency || 3}x/Woche · ${state.plan.equipment}`;
}

function hydratePlanForm() {
  // Load saved plan values into the form
  if (state.plan.age) document.getElementById("age").value = state.plan.age;
  if (state.plan.gender) document.getElementById("gender").value = state.plan.gender;
  if (state.plan.height) document.getElementById("height").value = state.plan.height;
  if (state.plan.weight) document.getElementById("weight").value = state.plan.weight;
  if (state.plan.level) document.getElementById("level").value = state.plan.level;
  if (state.plan.goal) document.getElementById("goal").value = state.plan.goal;
  if (state.plan.frequency) document.getElementById("frequency").value = state.plan.frequency;
  if (state.plan.equipment) document.getElementById("equipment").value = state.plan.equipment;
}

function hydrateProfile() {
  document.getElementById("camera-consent").checked = !!state.profile.cameraConsent;
  document.getElementById("notification-toggle").checked = state.profile.notifications ?? true;
  document.getElementById("wearable-toggle").checked = !!state.profile.wearable;
  
  // Load API key (masked display)
  const apiKey = localStorage.getItem('openai_api_key');
  if (apiKey) {
    document.getElementById("openai-api-key").value = apiKey;
  }
}

function bindProfile() {
  document.getElementById("camera-consent").addEventListener("change", (e) => {
    state.profile.cameraConsent = e.target.checked;
    persist();
  });
  document.getElementById("notification-toggle").addEventListener("change", (e) => {
    state.profile.notifications = e.target.checked;
    persist();
  });
  document.getElementById("wearable-toggle").addEventListener("change", (e) => {
    state.profile.wearable = e.target.checked;
    persist();
  });
  
  document.getElementById("save-api-key").addEventListener("click", () => {
    const apiKey = document.getElementById("openai-api-key").value.trim();
    if (!apiKey) {
      setAIStatus("Bitte API-Schlüssel eingeben", "warn");
      setTimeout(() => setAIStatus("KI bereit", "info"), 3000);
      return;
    }
    // Validate OpenAI API key format: starts with 'sk-' and has reasonable length
    if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
      setAIStatus("Ungültiger API-Schlüssel Format", "warn");
      setTimeout(() => setAIStatus("KI bereit", "info"), 3000);
      return;
    }
    localStorage.setItem('openai_api_key', apiKey);
    setAIStatus("API-Schlüssel gespeichert", "info");
    setTimeout(() => setAIStatus("KI bereit", "info"), 2000);
  });
}

document.getElementById("start-training").addEventListener("click", handleStartTraining);
document.getElementById("pause-training").addEventListener("click", pauseTraining);
document.getElementById("save-set").addEventListener("click", () => saveSet(false));
document.getElementById("stop-training").addEventListener("click", stopTraining);
document.getElementById("food-input").addEventListener("change", handleFoodInput);
document.getElementById("portion-slider").addEventListener("input", renderFoodDetection);
document.getElementById("save-food").addEventListener("click", saveFoodEntry);
document.getElementById("plan-form").addEventListener("submit", generatePlan);
document.getElementById("camera-facing").addEventListener("change", async (e) => {
  activeFacingMode = e.target.value;
  if (cameraStream) {
    const ok = await startCamera(activeFacingMode);
    if (ok) startPoseBootstrap();
  }
});
document.getElementById("play-replay").addEventListener("click", playReplay);

hydrateProfile();
bindProfile();
hydratePlanForm();
renderPlan();
renderSets();
renderFoodLog();
renderDashboard();
updateReplayLog();

window.addEventListener("beforeunload", () => {
  if (!cameraStream) return;
  stopCamera();
});

// Make replaySet available globally for inline onclick handlers
window.replaySet = replaySet;
