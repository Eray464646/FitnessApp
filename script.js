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
          <strong>${set.exercise}</strong> • ${set.reps} Wdh · Technik ${set.quality}%<br/>
          <span class="muted small">${new Date(set.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ROM: ${set.rom} · Tempo: ${set.tempo}</span>
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
        <strong>${entry.label}</strong> • ${entry.calories} kcal<br/>
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
    .map((d) => `<span class="pill">${d.day}: ${d.focus}</span>`)
    .join("");

  const recent = [...state.sets, ...state.foodEntries]
    .slice(-5)
    .reverse()
    .map((item) => {
      const isSet = "reps" in item;
      return `
        <div class="activity-item">
          <div>
            <strong>${isSet ? item.exercise : item.label}</strong><br/>
            <span class="muted small">${isSet ? `${item.reps} Wdh · Technik ${item.quality}%` : `${item.calories} kcal`}</span>
          </div>
          <span class="muted small">${new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      `;
    })
    .join("");
  document.getElementById("recent-activity").innerHTML = recent || `<div class="muted">Keine Aktivitäten</div>`;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setAIStatus("Kamera nicht verfügbar", "warn");
    return false;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("camera-feed");
    video.srcObject = cameraStream;
    await video.play();
    document.getElementById("camera-status").textContent = "Live: Haltung wird erkannt";
    setAIStatus("Tracking aktiv");
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
  document.getElementById("camera-status").textContent = "Kamera inaktiv";
}

function startRepDetection() {
  clearInterval(repInterval);
  repInterval = setInterval(() => {
    const detected = Math.random() > 0.6 ? 2 : 1;
    repCount += detected;
    tempoLabel = ["kontrolliert", "explosiv", "langsam"].sort(() => 0.5 - Math.random())[0];
    document.getElementById("rep-count").textContent = repCount;
    document.getElementById("tempo-info").textContent = `Tempo: ${tempoLabel}`;
    document.getElementById("training-feedback").innerHTML =
      repCount % 6 === 0
        ? "<p class='title'>Super Haltung</p><p class='muted'>Tiefe & Knie stabil</p>"
        : "<p class='title'>Weiter so</p><p class='muted'>Kern aktiv halten</p>";
    if (repCount >= 12) saveSet(true);
  }, 1800);
}

async function handleStartTraining() {
  const consent = document.getElementById("camera-consent");
  if (!consent.checked) {
    consent.checked = true;
    state.profile.cameraConsent = true;
  }
  const ok = cameraStream || (await startCamera());
  if (!ok) return;
  startRepDetection();
}

function pauseTraining() {
  clearInterval(repInterval);
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
  const set = {
    exercise: document.getElementById("exercise-select").value,
    reps: repCount,
    tempo: tempoLabel,
    rom: repCount > 10 ? "voll" : "teilweise",
    quality: Math.min(98, 70 + Math.round(Math.random() * 25)),
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
    <strong>${lastFoodDetection.label}</strong><br/>
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
      <strong>${d.day}</strong> – ${d.focus}<br/>
      <span class="muted small">${d.exercises.join(" · ")}</span>
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

hydrateProfile();
bindProfile();
renderPlan();
renderSets();
renderFoodLog();
renderDashboard();

window.addEventListener("beforeunload", () => {
  if (!cameraStream) return;
  stopCamera();
});
