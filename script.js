const STORAGE_KEY = "fitnessAppState";

const defaultPlan = () => ({
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
const poseState = {
  personDetected: false,
  keypointsStable: false,
  ready: false,
  replayFrames: []
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
  poseState.replayFrames = [];
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
  return {
    timestamp: Date.now(),
    keypointsTracked,
    confidence,
    stability,
    postureScore,
    rangeDelta,
    tempo
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
  let stableFrames = 0;
  let lostFrames = 0;
  poseDetectionInterval = setInterval(() => {
    if (!cameraStream) return;
    const frame = simulateSkeletonFrame();
    poseState.replayFrames.push(frame);
    if (poseState.replayFrames.length > 120) poseState.replayFrames.shift();
    updateReplayLog();

    lostFrames = frame.confidence < 0.45 ? lostFrames + 1 : 0;
    if (lostFrames >= 3) {
      poseState.personDetected = false;
      poseState.keypointsStable = false;
      poseState.ready = false;
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

    if (poseState.keypointsStable && !poseState.ready) {
      poseState.ready = true;
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
      </div>
    `;
    idx += 1;
    if (idx >= frames.length) {
      clearInterval(replayTimer);
      updateReplayLog();
    }
  }, 500);
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
      (set) => `
        <div class="log-item">
          <strong>${escapeHTML(set.exercise)}</strong> • ${set.reps} Wdh · Technik ${set.quality}%<br/>
          <span class="muted small">${new Date(set.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ROM: ${escapeHTML(set.rom)} · Tempo: ${escapeHTML(set.tempo)}</span>
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
  setAIStatus("Tracking aktiv");
  repInterval = setInterval(() => {
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
  activeFacingMode = document.getElementById("camera-facing").value || "environment";
  const ok = (cameraStream && currentFacingMode === activeFacingMode) || (await startCamera(activeFacingMode));
  if (!ok) return;
  startPoseBootstrap();
}

function pauseTraining() {
  clearInterval(repInterval);
  poseState.ready = false;
  document.getElementById("training-feedback").innerHTML =
    "<p class='title'>Pausiert</p><p class='muted'>Bleib in Bewegung</p>";
  setAIStatus("Tracking pausiert");
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
    auto
  };
  state.sets.push(set);
  repCount = 0;
  document.getElementById("rep-count").textContent = "0";
  document.getElementById("tempo-info").textContent = "Tempo: —";
  document.getElementById("training-feedback").innerHTML =
    "<p class='title'>Satz gespeichert</p><p class='muted'>Auto-Tracking aktiv</p>";
  persist();
  renderSets();
  renderDashboard();
}

function detectFoodMock() {
  const samples = [
    { label: "Chicken Bowl", calories: 520, protein: 45, carbs: 52, fat: 14 },
    { label: "Haferflocken mit Beeren", calories: 380, protein: 18, carbs: 62, fat: 8 },
    { label: "Protein Pasta", calories: 610, protein: 42, carbs: 68, fat: 12 },
    { label: "Quark & Banane", calories: 280, protein: 28, carbs: 32, fat: 4 }
  ];
  return samples[Math.floor(Math.random() * samples.length)];
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
  document.getElementById("food-details").innerHTML = `
    <strong>${escapeHTML(lastFoodDetection.label)}</strong><br/>
    <span class="muted small">Kalorien ${scaled.calories} · Protein ${scaled.protein} g · KH ${scaled.carbs} g · Fett ${scaled.fat} g</span>
  `;
  return scaled;
}

function handleFoodInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById("food-preview");
    preview.src = e.target.result;
  };
  reader.readAsDataURL(file);
  lastFoodDetection = detectFoodMock();
  renderFoodDetection();
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
  const equipment = document.getElementById("equipment").value;
  const frequency = Number(document.getElementById("frequency").value) || 3;
  const goal = document.getElementById("goal").value;
  const level = document.getElementById("level").value;
  const baseExercises =
    equipment === "studio"
      ? ["Kniebeugen", "Bankdrücken", "Kreuzheben", "Klimmzüge", "Rudern Kabel", "Plank"]
      : equipment === "kurzhanteln"
        ? ["Goblet Squat", "Kurzhantel-Bankdrücken", "Einarm-Rudern", "Rumänisches Kreuzheben", "Plank"]
        : ["Kniebeugen", "Liegestütze", "Hip Thrust", "Rows mit Band", "Split Squats", "Plank"];

  const days = Array.from({ length: Math.max(2, Math.min(6, frequency)) }).map((_, idx) => {
    const focus = idx % 2 === 0 ? "Ganzkörper" : goal === "fatloss" ? "HIIT/Metcon" : "Kraft/Core";
    const exercises = baseExercises.slice(0, 4 + (level === "fortgeschritten" ? 1 : 0));
    return {
      day: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][idx] || `Tag ${idx + 1}`,
      focus,
      exercises
    };
  });

  state.plan = { equipment, frequency, goal, level, days };
  persist();
  renderPlan();
  renderDashboard();
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

function hydrateProfile() {
  document.getElementById("camera-consent").checked = !!state.profile.cameraConsent;
  document.getElementById("notification-toggle").checked = state.profile.notifications ?? true;
  document.getElementById("wearable-toggle").checked = !!state.profile.wearable;
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
}

document.getElementById("start-training").addEventListener("click", handleStartTraining);
document.getElementById("pause-training").addEventListener("click", pauseTraining);
document.getElementById("save-set").addEventListener("click", () => saveSet(false));
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
renderPlan();
renderSets();
renderFoodLog();
renderDashboard();
updateReplayLog();

window.addEventListener("beforeunload", () => {
  if (!cameraStream) return;
  stopCamera();
});
