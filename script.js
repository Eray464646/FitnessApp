const STORAGE_KEY = "fitnessAppState";

// ============================================================================
// Vercel Backend Configuration
// ============================================================================
const VERCEL_BACKEND_URL = 'https://fit-vercel.vercel.app';
let backendHealthy = false;

// ============================================================================
// Food Detection Configuration
// ============================================================================
const FOOD_CONFIDENCE_THRESHOLD = 40;
const DEFAULT_FOOD_CONFIDENCE = 70;
const MAX_IMAGE_WIDTH = 1024;
const IMAGE_COMPRESSION_QUALITY = 0.8;
const MAX_FOOD_NAME_LENGTH = 40;
const UNKNOWN_FOOD_LABEL = 'Unbekanntes Lebensmittel';
const ADDITIONAL_ITEMS_SUFFIX = ' u.a.';
const VALID_FOOD_NAME_CHARS_REGEX = /^[^a-zA-Z0-9äöüÄÖÜß]+$/;

// ============================================================================
// Image & Food Utilities
// ============================================================================
async function compressImage(dataUrl, maxWidth = MAX_IMAGE_WIDTH, quality = IMAGE_COMPRESSION_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function extractFoodName(result) {
  if (!result) return { name: 'Essen', items: ['Essen'] };
  function validateAndSanitize(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const lower = trimmed.toLowerCase();
    if (lower === 'undefined' || lower === 'null' || lower === 'none') return null;
    if (VALID_FOOD_NAME_CHARS_REGEX.test(trimmed)) return null;
    if (trimmed.length > MAX_FOOD_NAME_LENGTH) return trimmed.substring(0, MAX_FOOD_NAME_LENGTH).trim() + '...';
    return trimmed;
  }
  function deriveShortName(description) {
    if (!description || typeof description !== 'string') return null;
    const trimmed = description.trim();
    const firstSentence = trimmed.split(/[.\n]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length <= MAX_FOOD_NAME_LENGTH) return validateAndSanitize(firstSentence);
    const words = trimmed.split(/\s+/).slice(0, 5).join(' ');
    return validateAndSanitize(words);
  }
  if (result.label) {
    const sanitized = validateAndSanitize(result.label);
    if (sanitized && sanitized !== UNKNOWN_FOOD_LABEL) {
      const items = result.items && Array.isArray(result.items) && result.items.length > 0
        ? result.items.map(i => typeof i === 'string' ? i : i?.label).filter(Boolean)
        : [sanitized];
      return { name: sanitized, items };
    }
  }
  if (result.items && Array.isArray(result.items) && result.items.length > 0) {
    const itemLabels = result.items.map(item => {
        if (typeof item === 'string') return validateAndSanitize(item);
        if (item && typeof item === 'object') return validateAndSanitize(item.label || item.name || item.title);
        return null;
      }).filter(Boolean);
    if (itemLabels.length > 0) {
      const name = itemLabels.join(', ');
      const truncatedName = name.length > MAX_FOOD_NAME_LENGTH
        ? itemLabels[0] + (itemLabels.length > 1 ? ADDITIONAL_ITEMS_SUFFIX : '')
        : name;
      return { name: truncatedName, items: itemLabels };
    }
  }
  const alternativeFields = ['name', 'title', 'food', 'foodName', 'dish'];
  for (const field of alternativeFields) {
    if (result[field]) {
      const sanitized = validateAndSanitize(result[field]);
      if (sanitized) return { name: sanitized, items: [sanitized] };
    }
  }
  const descriptions = [result.description, result.notes, result.reasoning, result.message];
  for (const desc of descriptions) {
    if (desc) {
      const derived = deriveShortName(desc);
      if (derived) return { name: derived, items: [derived] };
    }
  }
  return { name: 'Essen', items: ['Essen'] };
}

// ============================================================================
// Pose detection constants & Logic
// ============================================================================
const MIN_PERSON_CONFIDENCE = 0.6;
const MIN_STABLE_CONFIDENCE = 0.7;
const MIN_KEYPOINT_VISIBILITY = 0.3;
const STABLE_FRAMES_REQUIRED = 3;
const LOST_FRAMES_THRESHOLD = 3;
const AUTO_SAVE_REP_COUNT = 12;
const MIN_REP_INTERVAL_MS = 500;
const SQUAT_DOWN_HIP_ANGLE = 100;
const SQUAT_DOWN_KNEE_ANGLE = 110;
const SQUAT_UP_HIP_ANGLE = 150;
const SQUAT_UP_KNEE_ANGLE = 150;
const PUSHUP_DOWN_ELBOW_ANGLE = 90;
const PUSHUP_UP_ELBOW_ANGLE = 160;
const SWIPE_DELETE_THRESHOLD = 60;
const MAX_SWIPE_DISTANCE = 100;

const COCO_KEYPOINTS = [
  { id: 0, name: "nose", baseX: 0.5, baseY: 0.15 }, { id: 1, name: "left_eye", baseX: 0.48, baseY: 0.13 },
  { id: 2, name: "right_eye", baseX: 0.52, baseY: 0.13 }, { id: 3, name: "left_ear", baseX: 0.45, baseY: 0.14 },
  { id: 4, name: "right_ear", baseX: 0.55, baseY: 0.14 }, { id: 5, name: "left_shoulder", baseX: 0.42, baseY: 0.28 },
  { id: 6, name: "right_shoulder", baseX: 0.58, baseY: 0.28 }, { id: 7, name: "left_elbow", baseX: 0.38, baseY: 0.42 },
  { id: 8, name: "right_elbow", baseX: 0.62, baseY: 0.42 }, { id: 9, name: "left_wrist", baseX: 0.35, baseY: 0.56 },
  { id: 10, name: "right_wrist", baseX: 0.65, baseY: 0.56 }, { id: 11, name: "left_hip", baseX: 0.45, baseY: 0.58 },
  { id: 12, name: "right_hip", baseX: 0.55, baseY: 0.58 }, { id: 13, name: "left_knee", baseX: 0.44, baseY: 0.75 },
  { id: 14, name: "right_knee", baseX: 0.56, baseY: 0.75 }, { id: 15, name: "left_ankle", baseX: 0.43, baseY: 0.92 },
  { id: 16, name: "right_ankle", baseX: 0.57, baseY: 0.92 }
];

const SKELETON_CONNECTIONS = [[0, 1], [0, 2], [1, 3], [2, 4], [0, 5], [0, 6], [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];
const MEDIAPIPE_POSE_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [27, 31], [29, 31], [24, 26], [26, 28], [28, 30], [28, 32], [30, 32]];

function getConfidenceColor(confidence, opacity = 1) {
  if (confidence > 0.75) return `rgba(34, 211, 238, ${opacity})`;
  else if (confidence > 0.5) return `rgba(250, 204, 21, ${opacity})`;
  else return `rgba(239, 68, 68, ${opacity})`;
}
function getKeypointColor(confidence, opacity = 1) {
  if (confidence > 0.75) return `rgba(99, 102, 241, ${opacity})`;
  else if (confidence > 0.5) return `rgba(250, 204, 21, ${opacity})`;
  else return `rgba(239, 68, 68, ${opacity})`;
}

const defaultPlan = () => ({
  age: 28, gender: "divers", height: 178, weight: 75, goal: "aufbau", level: "anfänger", frequency: 3, equipment: "körpergewicht",
  days: [{ day: "Montag", focus: "Ganzkörper", exercises: ["Kniebeugen", "Liegestütze erhöht", "Ausfallschritte", "Plank 3x40s"] }, { day: "Mittwoch", focus: "Pull/Posterior", exercises: ["Hip Hinge", "Rows mit Band", "Glute Bridge", "Side Plank"] }, { day: "Freitag", focus: "Push/Core", exercises: ["Kniebeugen pausiert", "Push-ups", "Shoulder Taps", "Hollow Hold"] }]
});

const state = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sets: [], foodEntries: [], plan: defaultPlan(), profile: {}, nutritionGoals: null };
    const parsed = JSON.parse(raw);
    return { sets: parsed.sets || [], foodEntries: parsed.foodEntries || [], plan: parsed.plan || defaultPlan(), profile: parsed.profile || {}, nutritionGoals: parsed.nutritionGoals || null };
  } catch (e) {
    console.warn("Fallback to fresh state", e);
    return { sets: [], foodEntries: [], plan: defaultPlan(), profile: {}, nutritionGoals: null };
  }
})();

let cameraStream, repInterval, repCount = 0, tempoLabel = "—", lastFoodDetection, poseDetectionInterval, replayTimer, activeFacingMode = "environment", currentFacingMode = "environment", skeletonCanvas, skeletonCtx;
let mediaPipePose = null, lastPoseResults = null, poseDetectionActive = false, lastRepTimestamp = 0;
const TrainingState = { WAITING: "WAITING", READY: "READY", ACTIVE: "ACTIVE", PAUSED: "PAUSED", STOPPED: "STOPPED" };
const poseState = { personDetected: false, keypointsStable: false, ready: false, replayFrames: [], trainingState: TrainingState.STOPPED, currentSetFrames: [], stableFrameCount: 0, lostFrameCount: 0 };
const motionTracker = { progress: 0, lastQuality: 0, lastROM: "teilweise", lastTempo: "kontrolliert", squatPhase: "up", lastHipAngle: 180 };

function escapeHTML(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const views = document.querySelectorAll(".view");
const navButtons = document.querySelectorAll(".tab-btn"); // CHANGED CLASS NAME TO MATCH HTML
const quickNavButtons = document.querySelectorAll("[data-nav-target]");

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function switchView(targetId) {
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById(targetId).classList.add("active");
  navButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.target === targetId));
}
navButtons.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.target)));
quickNavButtons.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.navTarget)));

function setAIStatus(text, tone = "info") {
  const pill = document.getElementById("ai-status");
  if(pill) {
      pill.textContent = text;
      // Colors handled via CSS classes in new design, but we keep text update
      pill.style.color = tone === "warn" ? "var(--accent-red)" : "var(--accent-blue)";
  }
}

function resetPoseTracking() {
  poseState.personDetected = false; poseState.keypointsStable = false; poseState.ready = false; poseState.currentSetFrames = [];
  motionTracker.progress = 0;
  document.getElementById("rep-count").textContent = "0";
  document.getElementById("tempo-info").textContent = "—";
  repCount = 0;
  const feedback = document.getElementById("training-feedback");
  if(feedback) feedback.innerHTML = "<h3>Warte...</h3><p>Suche Person</p>";
  setAIStatus("Warte auf Person", "warn");
  updateReplayLog();
  if (skeletonCtx && skeletonCanvas) skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
  poseState.stableFrameCount = 0; poseState.lostFrameCount = 0;
}

function initializeMediaPipePose() {
  if (mediaPipePose) return mediaPipePose;
  mediaPipePose = new Pose({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
  mediaPipePose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  mediaPipePose.onResults(onPoseResults);
  return mediaPipePose;
}

function onPoseResults(results) {
  if (!poseDetectionActive) return;
  lastPoseResults = results;
  if (results.poseLandmarks && results.poseLandmarks.length > 0) processPoseLandmarks(results.poseLandmarks, results.poseWorldLandmarks);
  else handleNoPerson();
  if (skeletonCanvas && skeletonCtx) drawMediaPipeSkeleton(results);
}

function processPoseLandmarks(landmarks, worldLandmarks) {
  const avgConfidence = landmarks.reduce((sum, lm) => sum + (lm.visibility || 0), 0) / landmarks.length;
  const isStable = avgConfidence > MIN_STABLE_CONFIDENCE;
  const visibleKeypoints = landmarks.filter(lm => (lm.visibility || 0) > MIN_KEYPOINT_VISIBILITY).length;
  const frame = { timestamp: Date.now(), keypointsTracked: visibleKeypoints, confidence: avgConfidence, stability: isStable ? "stable" : "shaky", postureScore: avgConfidence, keypoints: convertMediaPipeToCocoKeypoints(landmarks), perspective: "unknown" };
  
  poseState.replayFrames.push(frame);
  if (poseState.replayFrames.length > 120) poseState.replayFrames.shift();
  if (poseState.trainingState === TrainingState.ACTIVE || poseState.trainingState === TrainingState.READY) {
    poseState.currentSetFrames.push(frame);
    if (poseState.currentSetFrames.length > 200) poseState.currentSetFrames.shift();
  }
  updateReplayLog();
  poseState.lostFrameCount = 0;

  if (avgConfidence > MIN_PERSON_CONFIDENCE) {
    if (!poseState.personDetected) {
      poseState.personDetected = true;
      document.getElementById("camera-status").textContent = "Person erkannt";
      setAIStatus("Person erkannt");
    }
    if (isStable) {
      poseState.stableFrameCount++;
      if (poseState.stableFrameCount >= STABLE_FRAMES_REQUIRED && !poseState.keypointsStable) {
        poseState.keypointsStable = true;
        document.getElementById("camera-status").textContent = "Stabil";
        setAIStatus("Bereit");
        if (poseState.trainingState === TrainingState.WAITING) {
          poseState.ready = true;
          poseState.trainingState = TrainingState.READY;
          const fb = document.getElementById("training-feedback");
          if(fb) fb.innerHTML = "<h3>Bereit!</h3><p>Bewegung starten</p>";
          startRepDetection();
        }
      }
    } else {
      poseState.stableFrameCount = Math.max(0, poseState.stableFrameCount - 1);
    }
  }
  if (poseState.trainingState === TrainingState.ACTIVE && poseState.keypointsStable) processRepCounting(worldLandmarks || landmarks);
}

function handleNoPerson() {
  poseState.lostFrameCount++;
  if (poseState.lostFrameCount >= LOST_FRAMES_THRESHOLD) {
    poseState.personDetected = false; poseState.keypointsStable = false; poseState.ready = false; poseState.stableFrameCount = 0;
    if (poseState.trainingState === TrainingState.ACTIVE || poseState.trainingState === TrainingState.READY) {
      poseState.trainingState = TrainingState.WAITING;
      clearInterval(repInterval);
      document.getElementById("camera-status").textContent = "Suche...";
      const fb = document.getElementById("training-feedback");
      if(fb) fb.innerHTML = "<h3>Keine Person</h3><p>Bitte ins Bild treten</p>";
      setAIStatus("Suche Person", "warn");
    }
  }
}

function convertMediaPipeToCocoKeypoints(mpLandmarks) {
  const mapping = { 0: 0, 2: 1, 5: 2, 7: 3, 8: 4, 11: 5, 12: 6, 13: 7, 14: 8, 15: 9, 16: 10, 23: 11, 24: 12, 25: 13, 26: 14, 27: 15, 28: 16 };
  const cocoKeypoints = new Array(17);
  for (const [mpIdx, cocoIdx] of Object.entries(mapping)) {
    const mpLandmark = mpLandmarks[parseInt(mpIdx)];
    if (mpLandmark) {
      cocoKeypoints[cocoIdx] = { id: cocoIdx, name: COCO_KEYPOINTS[cocoIdx].name, x: mpLandmark.x, y: mpLandmark.y, confidence: mpLandmark.visibility || 0.5 };
    }
  }
  return cocoKeypoints;
}

function calculateAngle(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

function processRepCounting(landmarks) {
  const exercise = document.getElementById("exercise-select").value;
  if (exercise === "Kniebeugen" || exercise.includes("Squat")) countSquatReps(landmarks);
  else if (exercise === "Liegestütze" || exercise.includes("Push")) countPushupReps(landmarks);
  else countGenericReps(landmarks);
}

function countSquatReps(landmarks) {
  const leftHip = landmarks[23], leftKnee = landmarks[25], leftAnkle = landmarks[27], leftShoulder = landmarks[11];
  if (!leftHip || !leftKnee || !leftAnkle || !leftShoulder) return;
  const hipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
  const kneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const fb = document.getElementById("training-feedback");

  if (motionTracker.squatPhase === "up" && hipAngle < SQUAT_DOWN_HIP_ANGLE && kneeAngle < SQUAT_DOWN_KNEE_ANGLE) {
    motionTracker.squatPhase = "down";
    motionTracker.lastROM = hipAngle < 90 ? "voll" : "teilweise";
    if(fb) fb.innerHTML = "<h3>Tief genug!</h3><p>Jetzt hochdrücken</p>";
  } else if (motionTracker.squatPhase === "down" && hipAngle > SQUAT_UP_HIP_ANGLE && kneeAngle > SQUAT_UP_KNEE_ANGLE) {
    const now = Date.now();
    if (now - lastRepTimestamp >= MIN_REP_INTERVAL_MS) {
      motionTracker.squatPhase = "up";
      repCount++;
      lastRepTimestamp = now;
      document.getElementById("rep-count").textContent = repCount;
      if(fb) fb.innerHTML = "<h3>Sauber!</h3><p>Klasse Form</p>";
      motionTracker.lastQuality = motionTracker.lastROM === "voll" ? 90 + Math.floor(Math.random() * 10) : 70 + Math.floor(Math.random() * 15);
      if (repCount >= AUTO_SAVE_REP_COUNT) saveSet(true);
    }
  }
  motionTracker.lastHipAngle = hipAngle;
}

function countPushupReps(landmarks) {
  const leftShoulder = landmarks[11], leftElbow = landmarks[13], leftWrist = landmarks[15], leftHip = landmarks[23];
  if (!leftShoulder || !leftElbow || !leftWrist || !leftHip) return;
  const elbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
  const fb = document.getElementById("training-feedback");
  if (motionTracker.squatPhase === "up" && elbowAngle < PUSHUP_DOWN_ELBOW_ANGLE) {
    motionTracker.squatPhase = "down";
    if(fb) fb.innerHTML = "<h3>Runter...</h3><p>Rücken gerade lassen</p>";
  } else if (motionTracker.squatPhase === "down" && elbowAngle > PUSHUP_UP_ELBOW_ANGLE) {
    const now = Date.now();
    if (now - lastRepTimestamp >= MIN_REP_INTERVAL_MS) {
      motionTracker.squatPhase = "up";
      repCount++;
      lastRepTimestamp = now;
      document.getElementById("rep-count").textContent = repCount;
      if(fb) fb.innerHTML = "<h3>Stark!</h3><p>Weiter so</p>";
      motionTracker.lastQuality = 85 + Math.floor(Math.random() * 15);
      if (repCount >= AUTO_SAVE_REP_COUNT) saveSet(true);
    }
  }
}

function countGenericReps(landmarks) {
  const keyJoints = [11, 12, 23, 24];
  let avgY = 0, count = 0;
  for (const idx of keyJoints) if (landmarks[idx]) { avgY += landmarks[idx].y; count++; }
  if (count === 0) return;
  avgY /= count;
  const movement = avgY - (motionTracker.lastVerticalPos || avgY);
  motionTracker.lastVerticalPos = avgY;
  if (Math.abs(movement) > 0.05) {
    motionTracker.progress = Math.min(1, motionTracker.progress + Math.abs(movement) * 2);
    if (motionTracker.progress >= 1) {
      repCount++;
      motionTracker.progress = 0;
      document.getElementById("rep-count").textContent = repCount;
      const fb = document.getElementById("training-feedback");
      if(fb) fb.innerHTML = "<h3>Gezählt</h3><p>Bewegung erkannt</p>";
      if (repCount >= AUTO_SAVE_REP_COUNT) saveSet(true);
    }
  }
}

function drawMediaPipeSkeleton(results) {
  if (!skeletonCanvas || !skeletonCtx) return;
  const ctx = skeletonCtx;
  const width = skeletonCanvas.width;
  const height = skeletonCanvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!results.poseLandmarks || results.poseLandmarks.length === 0) return;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const [startIdx, endIdx] of MEDIAPIPE_POSE_CONNECTIONS) {
    const start = results.poseLandmarks[startIdx];
    const end = results.poseLandmarks[endIdx];
    if (start && end && (start.visibility || 0) > MIN_KEYPOINT_VISIBILITY && (end.visibility || 0) > MIN_KEYPOINT_VISIBILITY) {
      const x1 = start.x * width, y1 = start.y * height, x2 = end.x * width, y2 = end.y * height;
      const avgConfidence = ((start.visibility || 0) + (end.visibility || 0)) / 2;
      ctx.strokeStyle = getConfidenceColor(avgConfidence, Math.min(1, Math.max(0.3, avgConfidence)));
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
  for (const landmark of results.poseLandmarks) {
    if ((landmark.visibility || 0) > MIN_KEYPOINT_VISIBILITY) {
      const x = landmark.x * width, y = landmark.y * height;
      const confidence = landmark.visibility || 0.5;
      ctx.fillStyle = getKeypointColor(confidence, Math.min(1, Math.max(0.5, confidence)));
      ctx.beginPath(); ctx.arc(x, y, 4 + confidence * 4, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function startPoseBootstrap() {
  resetPoseTracking();
  poseState.trainingState = TrainingState.WAITING;
  if (!mediaPipePose) initializeMediaPipePose();
  poseDetectionActive = true;
  const videoElement = document.getElementById("camera-feed");
  const processFrame = async () => {
    if (!poseDetectionActive || !mediaPipePose) return;
    if (poseState.trainingState === TrainingState.PAUSED) { requestAnimationFrame(processFrame); return; }
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      try { await mediaPipePose.send({image: videoElement}); } catch (error) { console.error('MediaPipe error:', error); }
    }
    requestAnimationFrame(processFrame);
  };
  requestAnimationFrame(processFrame);
}

async function startCamera(facingMode = activeFacingMode) {
  if (!navigator.mediaDevices?.getUserMedia) { setAIStatus("Kamera-Fehler", "warn"); return false; }
  try {
    stopCamera();
    currentFacingMode = facingMode;
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
    const video = document.getElementById("camera-feed");
    video.srcObject = cameraStream;
    await video.play();
    if (!skeletonCanvas) { skeletonCanvas = document.getElementById("skeleton-canvas"); skeletonCtx = skeletonCanvas.getContext("2d"); }
    const resizeCanvas = () => { if (skeletonCanvas) { skeletonCanvas.width = video.videoWidth || video.clientWidth; skeletonCanvas.height = video.videoHeight || video.clientHeight; } };
    video.addEventListener('loadedmetadata', resizeCanvas);
    resizeCanvas();
    document.getElementById("camera-status").textContent = "Live";
    setAIStatus("Warte auf Person");
    return true;
  } catch (e) {
    console.error(e);
    document.getElementById("camera-status").textContent = "Blockiert";
    setAIStatus("Zugriff verweigert", "warn");
    return false;
  }
}

function stopCamera() {
  poseDetectionActive = false;
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  clearInterval(repInterval); clearInterval(poseDetectionInterval);
  poseState.ready = false; poseState.personDetected = false; poseState.keypointsStable = false;
  document.getElementById("camera-status").textContent = "Aus";
  if (skeletonCtx && skeletonCanvas) skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
}

function startRepDetection() {
  if (!poseState.keypointsStable) {
    const fb = document.getElementById("training-feedback");
    if(fb) fb.innerHTML = "<h3>Warte...</h3><p>Auf Stabilisierung</p>";
    return;
  }
  poseState.trainingState = TrainingState.ACTIVE;
  setAIStatus("Tracking aktiv");
  motionTracker.squatPhase = "up";
  motionTracker.progress = 0;
}

async function handleStartTraining() {
  const consent = document.getElementById("camera-consent");
  if (!consent.checked) { consent.checked = true; state.profile.cameraConsent = true; }
  if (poseState.trainingState === TrainingState.PAUSED) { resumeTraining(); return; }
  activeFacingMode = document.getElementById("camera-facing").value || "environment";
  const ok = (cameraStream && currentFacingMode === activeFacingMode) || (await startCamera(activeFacingMode));
  if (ok) startPoseBootstrap();
}

function pauseTraining() {
  if (poseState.trainingState !== TrainingState.ACTIVE && poseState.trainingState !== TrainingState.READY) return;
  clearInterval(repInterval);
  poseState.trainingState = TrainingState.PAUSED;
  const fb = document.getElementById("training-feedback");
  if(fb) fb.innerHTML = "<h3>Pausiert</h3><p>Tippe Start</p>";
  setAIStatus("Pausiert", "warn");
  document.getElementById("camera-status").textContent = "Pause";
}

function resumeTraining() {
  if (poseState.trainingState !== TrainingState.PAUSED) return;
  if (poseState.keypointsStable && poseState.personDetected) {
    poseState.trainingState = TrainingState.ACTIVE;
    startRepDetection();
    document.getElementById("camera-status").textContent = "Aktiv";
    setAIStatus("Training läuft");
  } else {
    poseState.trainingState = TrainingState.WAITING;
    startPoseBootstrap();
  }
}

function stopTraining() {
  poseState.trainingState = TrainingState.STOPPED;
  clearInterval(repInterval); clearInterval(poseDetectionInterval);
  stopCamera();
  const fb = document.getElementById("training-feedback");
  if(fb) fb.innerHTML = "<h3>Beendet</h3><p>Gut gemacht!</p>";
  setAIStatus("Beendet");
  if (repCount > 0) saveSet(false);
}

function saveSet(auto = false) {
  clearInterval(repInterval);
  if (repCount === 0 && !auto) return;
  const qualityScore = motionTracker.lastQuality > 0 ? Math.min(98, Math.max(60, motionTracker.lastQuality)) : Math.min(98, 70 + Math.round(Math.random() * 25));
  const set = {
    exercise: document.getElementById("exercise-select").value,
    reps: repCount,
    tempo: motionTracker.lastTempo || tempoLabel,
    rom: motionTracker.lastROM || "voll",
    quality: qualityScore,
    timestamp: new Date().toISOString(),
    auto,
    frames: poseState.currentSetFrames.slice()
  };
  state.sets.push(set);
  repCount = 0; poseState.currentSetFrames = [];
  document.getElementById("rep-count").textContent = "0";
  document.getElementById("tempo-info").textContent = "—";
  persist();
  renderSets();
  renderDashboard();
  if (poseState.trainingState === TrainingState.PAUSED) resumeTraining();
}

async function detectFoodWithAI(imageDataUrl) {
  setAIStatus("Analysiere...", "info");
  if (!backendHealthy) { setAIStatus("Backend Fehler", "warn"); return null; }
  try {
    const compressedDataUrl = await compressImage(imageDataUrl, 1024, 0.8);
    const mimeType = compressedDataUrl.match(/^data:(.+);base64,/)?.[1] || 'image/jpeg';
    const response = await fetch(`${VERCEL_BACKEND_URL}/api/food-scan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: compressedDataUrl, mimeType })
    });
    if (!response.ok) throw new Error('API Error');
    const result = await response.json();
    if (result.detected && (result.confidence || 0) < FOOD_CONFIDENCE_THRESHOLD) { result.detected = false; result.message = "Unsicher"; }
    if (!result.detected) { setAIStatus("Nicht erkannt", "warn"); return null; }
    
    setAIStatus("Erkannt!", "info");
    const { name: foodLabel, items: itemLabels } = extractFoodName(result);
    return {
      label: foodLabel,
      calories: Math.round(result.totals?.calories || result.items?.[0]?.calories || 0),
      protein: Math.round(result.totals?.protein || result.items?.[0]?.macros?.protein || 0),
      carbs: Math.round(result.totals?.carbs || result.items?.[0]?.macros?.carbs || 0),
      fat: Math.round(result.totals?.fat || result.items?.[0]?.macros?.fat || 0),
      confidence: Math.round(result.confidence || 80),
      items: itemLabels,
      reasoning: result.notes
    };
  } catch (error) {
    setAIStatus("Fehler", "warn"); console.error(error); return null;
  }
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${VERCEL_BACKEND_URL}/api/food-scan/health`);
    if (response.ok) { backendHealthy = true; setAIStatus("KI bereit"); }
    else { backendHealthy = false; setAIStatus("Offline", "warn"); }
  } catch (e) { backendHealthy = false; setAIStatus("Offline", "warn"); }
}

function renderFoodDetection() {
  if (!lastFoodDetection) return;
  const portion = Number(document.getElementById("portion-slider").value);
  const scaled = {
    calories: Math.round(lastFoodDetection.calories * portion),
    protein: Math.round(lastFoodDetection.protein * portion),
    carbs: Math.round(lastFoodDetection.carbs * portion),
    fat: Math.round(lastFoodDetection.fat * portion)
  };
  document.getElementById("food-details").innerHTML = `
    <div style="text-align:center;">
      <strong>${escapeHTML(lastFoodDetection.label)}</strong><br/>
      <span class="muted small">${scaled.calories} kcal · P: ${scaled.protein}g</span>
    </div>`;
  return scaled;
}

async function handleFoodInput(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const preview = document.getElementById("food-preview");
    preview.src = e.target.result;
    lastFoodDetection = await detectFoodWithAI(e.target.result);
    if (lastFoodDetection) renderFoodDetection();
  };
  reader.readAsDataURL(file);
}

function calculateBMR(gender, age, weight, height) {
  if (gender === 'männlich') return 10 * weight + 6.25 * height - 5 * age + 5;
  if (gender === 'weiblich') return 10 * weight + 6.25 * height - 5 * age - 161;
  return 10 * weight + 6.25 * height - 5 * age - 78;
}

function handleCalorieCalculator(evt) {
  evt.preventDefault();
  const weight = parseInt(document.getElementById('calc-weight').value);
  const height = parseInt(document.getElementById('calc-height').value);
  const goal = document.getElementById('calc-goal').value;
  // Defaults hidden in new UI
  const gender = "männlich", age = 25, activity = "moderate"; 
  
  const bmr = calculateBMR(gender, age, weight, height);
  const tdee = bmr * 1.55; // moderate default
  
  let calories = Math.round(tdee);
  let pMod = 1.8;
  if (goal === 'bulk') { calories = Math.round(tdee * 1.15); pMod = 2.0; }
  else if (goal === 'cut') { calories = Math.round(tdee * 0.85); pMod = 2.2; }
  
  const protein = Math.round(weight * pMod);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.round((calories - (protein * 4) - (fat * 9)) / 4);
  
  state.nutritionGoals = { calories, protein, fat, carbs, goal };
  persist();
  updateNutritionProgress();
  
  document.getElementById('calorie-results').innerHTML = `
    <div class="ios-list-item">
       <div>
         <strong>${calories} kcal</strong><br/>
         <span class="muted small">P: ${protein}g · F: ${fat}g · KH: ${carbs}g</span>
       </div>
    </div>`;
}

function updateNutritionProgress() {
  if (!state.nutritionGoals) { document.getElementById('nutrition-progress-card').style.display = 'none'; return; }
  const today = todayKey();
  const current = state.foodEntries.filter(f => f.timestamp.startsWith(today)).reduce((acc, entry) => ({
    calories: acc.calories + (entry.calories || 0), protein: acc.protein + (entry.protein || 0),
    carbs: acc.carbs + (entry.carbs || 0), fat: acc.fat + (entry.fat || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const pct = (val, max) => Math.min(100, Math.round((val / max) * 100));
  const html = `
    <div class="progress-item"><div class="progress-header"><span>Kcal</span><span>${current.calories}/${state.nutritionGoals.calories}</span></div><div class="progress-bar"><div class="progress-fill" style="width: ${pct(current.calories, state.nutritionGoals.calories)}%"></div></div></div>
    <div class="progress-item"><div class="progress-header"><span>Protein</span><span>${current.protein}/${state.nutritionGoals.protein}g</span></div><div class="progress-bar"><div class="progress-fill protein" style="width: ${pct(current.protein, state.nutritionGoals.protein)}%"></div></div></div>
  `;
  document.getElementById('nutrition-progress').innerHTML = html;
  document.getElementById('nutrition-progress-card').style.display = 'block';
}

function saveFoodEntry() {
  if (!lastFoodDetection) return;
  const scaled = renderFoodDetection();
  state.foodEntries.push({ label: lastFoodDetection.label, ...scaled, timestamp: new Date().toISOString() });
  persist(); renderFoodLog(); renderDashboard(); updateNutritionProgress();
}

async function generatePlan(evt) {
  evt?.preventDefault();
  setAIStatus("Generiere Plan...", "info");
  const age = 25, gender = "männlich", height = 180, weight = 80; // Defaults used as hidden fields might vary
  const equipment = document.getElementById("equipment").value;
  const frequency = Number(document.getElementById("frequency").value);
  const goal = document.getElementById("goal").value;
  const level = document.getElementById("level").value;

  try {
    const response = await fetch(`${VERCEL_BACKEND_URL}/api/training-plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ age, gender, height, weight, level, goal, frequency, equipment })
    });
    const result = await response.json();
    if (!result.success) throw new Error("Backend fail");
    
    state.plan = { age, gender, height, weight, equipment, frequency, goal, level, days: result.plan.days, aiGenerated: true };
    persist(); renderPlan(); setAIStatus("Plan fertig!");
  } catch (e) {
    console.error(e);
    // Fallback Plan
    state.plan = defaultPlan();
    state.plan.equipment = equipment; state.plan.frequency = frequency; state.plan.aiGenerated = false;
    persist(); renderPlan(); setAIStatus("Basis-Plan geladen");
  }
}

function hydrateProfile() {
  document.getElementById("camera-consent").checked = !!state.profile.cameraConsent;
  document.getElementById("notification-toggle").checked = state.profile.notifications ?? true;
  document.getElementById("wearable-toggle").checked = !!state.profile.wearable;
}
function bindProfile() {
  document.getElementById("camera-consent").addEventListener("change", (e) => { state.profile.cameraConsent = e.target.checked; persist(); });
  document.getElementById("notification-toggle").addEventListener("change", (e) => { state.profile.notifications = e.target.checked; persist(); });
  document.getElementById("wearable-toggle").addEventListener("change", (e) => { state.profile.wearable = e.target.checked; persist(); });
}
// ============================================================================
// UI RENDERING - APPLE DESIGN STYLE
// ============================================================================

function todayKey() { return new Date().toISOString().slice(0, 10); }

function renderSets() {
  const list = document.getElementById("sets-list");
  if (!state.sets.length) { list.innerHTML = `<div class="ios-list-item muted">Noch keine Sätze heute.</div>`; return; }
  const recentSets = state.sets.slice(-10).reverse();
  list.innerHTML = recentSets.map((set, idx) => {
      const actualIdx = state.sets.length - 1 - idx;
      const qualityColor = set.quality > 80 ? 'var(--accent-green)' : (set.quality > 50 ? 'var(--accent-orange)' : 'var(--accent-red)');
      return `
      <div class="ios-list-item swipeable" data-set-index="${actualIdx}" style="align-items: flex-start;">
        <div style="flex:1;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
             <strong style="font-size:16px;">${escapeHTML(set.exercise)}</strong>
             <span style="font-size:12px; font-weight:bold; color:${qualityColor}; border:1px solid ${qualityColor}; padding:2px 6px; border-radius:4px;">${set.quality}%</span>
          </div>
          <div class="muted small">
             ${set.reps} Wdh · Tempo: ${escapeHTML(set.tempo)} · ${new Date(set.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
          </div>
          ${set.frames && set.frames.length > 0 ? `<button class="link-btn" style="margin-top:6px; font-size:12px;" onclick="replaySet(${actualIdx})">▶ Analyse ansehen</button>` : ''}
        </div>
        <button onclick="deleteSet(${actualIdx})" style="background:none; border:none; color:#444; margin-left:10px;">✕</button>
      </div>`;
  }).join("");
  attachSwipeToDelete();
}

function renderFoodLog() {
  const log = document.getElementById("food-log");
  if (!state.foodEntries.length) { log.innerHTML = `<div class="ios-list-item muted">Noch keine Einträge.</div>`; return; }
  const today = todayKey();
  const todayEntries = state.foodEntries.filter((f) => f.timestamp.startsWith(today));
  log.innerHTML = todayEntries.reverse().map((entry) => {
      const actualIndex = state.foodEntries.indexOf(entry); 
      return `
      <div class="ios-list-item swipeable" data-index="${actualIndex}">
        <div style="display:flex; align-items:center;">
           <div class="icon-box orange-bg" style="width:36px; height:36px; border-radius:50%; margin-right:12px;"><span style="font-size:16px;">🍽️</span></div>
           <div><div style="font-weight:600; font-size:15px;">${escapeHTML(entry.label)}</div><div class="muted small">${entry.calories} kcal · P: ${entry.protein}g</div></div>
        </div>
        <button onclick="deleteFood(${actualIndex})" style="border:none; background:none; color:#555;">✕</button>
      </div>`;
  }).join("");
  initSwipeHandlers();
}

function computeStreak() {
  const days = new Set();
  [...state.sets, ...state.foodEntries].forEach(i => { if(i.timestamp) days.add(i.timestamp.slice(0, 10)); });
  let streak = 0, cursor = new Date();
  while(days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function renderDashboard() {
  const today = todayKey();
  const todaySets = state.sets.filter((s) => s.timestamp.startsWith(today));
  const reps = todaySets.reduce((sum, s) => sum + s.reps, 0);
  const tech = todaySets.length === 0 ? 0 : Math.round(todaySets.reduce((sum, s) => sum + s.quality, 0) / todaySets.length);
  const todayFood = state.foodEntries.filter((f) => f.timestamp.startsWith(today));
  const calories = todayFood.reduce((sum, f) => sum + f.calories, 0);
  const protein = todayFood.reduce((sum, f) => sum + f.protein, 0);

  document.getElementById("today-reps").textContent = reps;
  document.getElementById("tech-score").textContent = tech + "%";
  document.getElementById("today-calories").textContent = calories;
  document.getElementById("today-protein").textContent = protein + " g";
  document.getElementById("streak-score").textContent = computeStreak();

  const recentItems = [...state.sets, ...state.foodEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 4);
  const activityContainer = document.getElementById("recent-activity");
  if(recentItems.length === 0) activityContainer.innerHTML = `<div class="ios-list-item muted">Keine Aktivitäten heute</div>`;
  else activityContainer.innerHTML = recentItems.map(item => {
      const isSet = "reps" in item;
      return `<div class="ios-list-item"><div style="display:flex; align-items:center;"><div class="icon-box" style="width:8px; height:8px; margin-right:8px; border-radius:50%; background:${isSet ? 'var(--accent-green)' : 'var(--accent-orange)'}"></div><div><div style="font-weight:600; font-size:14px;">${escapeHTML(isSet ? item.exercise : item.label)}</div><div class="muted small" style="font-size:11px;">${isSet ? `${item.reps} Wdh` : `${item.calories} kcal`} · ${new Date(item.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></div></div></div>`;
  }).join("");
}

function renderPlan() {
  const wrap = document.getElementById("plan-days");
  let summaryText = `${state.plan.frequency || 3}x/Woche · ${state.plan.equipment}`;
  if (state.plan.aiGenerated) summaryText += ' · ✨ KI';
  document.getElementById("plan-summary").textContent = summaryText;
  wrap.innerHTML = state.plan.days.map(d => {
     let exercisesHTML = (d.exercises && d.exercises.length > 0 && typeof d.exercises[0] === 'object') ? 
         d.exercises.map(ex => `<div style="padding:4px 0; border-bottom:1px solid #222; font-size:13px; display:flex; justify-content:space-between;"><span>${escapeHTML(ex.name)}</span><span class="muted">${ex.sets}×${ex.reps}</span></div>`).join('') : 
         `<span class="muted small">${d.exercises.map(escapeHTML).join(", ")}</span>`;
     return `<div class="ios-list-item" style="display:block;"><div style="display:flex; justify-content:space-between; margin-bottom:8px;"><strong style="color:white; font-size:15px;">${escapeHTML(d.day)}</strong><span style="font-size:12px; background:#333; padding:2px 8px; border-radius:4px; color:#ccc;">${escapeHTML(d.focus)}</span></div><div style="padding-left:0;">${exercisesHTML}</div></div>`;
  }).join("");
}

function updateReplayLog() {
    const container = document.getElementById("replay-log");
    if (!container) return;
    if (!poseState.replayFrames.length) { container.innerHTML = `<div class="muted small">Warte auf Daten...</div>`; return; }
    // Nur den neuesten Status anzeigen statt Liste
    const lastFrame = poseState.replayFrames[poseState.replayFrames.length - 1];
    container.innerHTML = `<div class="ios-list-item" style="background:transparent; padding:0; border:none;"><span class="muted small">Live Status: ${lastFrame.stability} · Keypoints: ${lastFrame.keypointsTracked}</span></div>`;
}

function playReplay() {
    if(!poseState.replayFrames.length) { alert("Keine Daten im Speicher"); return; }
    alert("Replay-Funktion: Zeigt " + poseState.replayFrames.length + " Frames der letzten Session.");
}

function replaySet(idx) { alert("Replay für Satz " + idx + " wird geladen..."); }
function deleteSet(index) { if(confirm("Löschen?")) { state.sets.splice(index, 1); persist(); renderSets(); renderDashboard(); } }
function deleteFood(index) { if(confirm("Löschen?")) { state.foodEntries.splice(index, 1); persist(); renderFoodLog(); renderDashboard(); updateNutritionProgress(); } }

function attachSwipeToDelete() { /* Placeholder für komplexe Touch Logic */ }
function initSwipeHandlers() { /* Placeholder */ }

// --- EVENT LISTENERS ---
document.getElementById("start-training").addEventListener("click", handleStartTraining);
document.getElementById("pause-training").addEventListener("click", pauseTraining);
document.getElementById("save-set").addEventListener("click", () => saveSet(false));
document.getElementById("stop-training").addEventListener("click", stopTraining);
document.getElementById("food-input").addEventListener("change", handleFoodInput);
document.getElementById("portion-slider").addEventListener("input", renderFoodDetection);
document.getElementById("save-food").addEventListener("click", saveFoodEntry);
document.getElementById("plan-form").addEventListener("submit", generatePlan);
document.getElementById("calorie-calculator-form").addEventListener("submit", handleCalorieCalculator);
document.getElementById("camera-facing").addEventListener("change", async (e) => {
  activeFacingMode = e.target.value;
  if (cameraStream) { const ok = await startCamera(activeFacingMode); if (ok) startPoseBootstrap(); }
});
document.getElementById("play-replay").addEventListener("click", playReplay);

// INIT
hydrateProfile(); bindProfile(); renderPlan(); renderSets(); renderFoodLog(); renderDashboard(); updateNutritionProgress(); checkBackendHealth();
window.addEventListener("beforeunload", () => { if (cameraStream) stopCamera(); });
window.replaySet = replaySet; window.deleteSet = deleteSet; window.deleteFood = deleteFood;
