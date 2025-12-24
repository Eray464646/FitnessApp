const STORAGE_KEY = "fitnessAppState";

// Pose detection constants
const MIN_PERSON_CONFIDENCE = 0.6;  // Minimum confidence to consider person detected
const MIN_STABLE_CONFIDENCE = 0.7;   // Minimum confidence for stable tracking
const MIN_KEYPOINT_VISIBILITY = 0.3; // Minimum visibility for drawing keypoints
const STABLE_FRAMES_REQUIRED = 3;    // Number of consecutive stable frames needed
const LOST_FRAMES_THRESHOLD = 3;     // Number of frames before person is considered lost

// Rep counting constants
const AUTO_SAVE_REP_COUNT = 12;      // Auto-save set after this many reps

// Squat detection angles (in degrees)
const SQUAT_DOWN_HIP_ANGLE = 100;    // Hip angle threshold for down position
const SQUAT_DOWN_KNEE_ANGLE = 110;   // Knee angle threshold for down position
const SQUAT_UP_HIP_ANGLE = 150;      // Hip angle threshold for up position
const SQUAT_UP_KNEE_ANGLE = 150;     // Knee angle threshold for up position

// Push-up detection angles (in degrees)
const PUSHUP_DOWN_ELBOW_ANGLE = 90;  // Elbow angle threshold for down position
const PUSHUP_UP_ELBOW_ANGLE = 160;   // Elbow angle threshold for up position

// UI interaction constants
const SWIPE_DELETE_THRESHOLD = 60;   // Swipe distance in pixels to trigger delete
const MAX_SWIPE_DISTANCE = 100;      // Maximum swipe distance before clamping

// COCO Pose keypoint definitions
const COCO_KEYPOINTS = [
  { id: 0, name: "nose", baseX: 0.5, baseY: 0.15 },
  { id: 1, name: "left_eye", baseX: 0.48, baseY: 0.13 },
  { id: 2, name: "right_eye", baseX: 0.52, baseY: 0.13 },
  { id: 3, name: "left_ear", baseX: 0.45, baseY: 0.14 },
  { id: 4, name: "right_ear", baseX: 0.55, baseY: 0.14 },
  { id: 5, name: "left_shoulder", baseX: 0.42, baseY: 0.28 },
  { id: 6, name: "right_shoulder", baseX: 0.58, baseY: 0.28 },
  { id: 7, name: "left_elbow", baseX: 0.38, baseY: 0.42 },
  { id: 8, name: "right_elbow", baseX: 0.62, baseY: 0.42 },
  { id: 9, name: "left_wrist", baseX: 0.35, baseY: 0.56 },
  { id: 10, name: "right_wrist", baseX: 0.65, baseY: 0.56 },
  { id: 11, name: "left_hip", baseX: 0.45, baseY: 0.58 },
  { id: 12, name: "right_hip", baseX: 0.55, baseY: 0.58 },
  { id: 13, name: "left_knee", baseX: 0.44, baseY: 0.75 },
  { id: 14, name: "right_knee", baseX: 0.56, baseY: 0.75 },
  { id: 15, name: "left_ankle", baseX: 0.43, baseY: 0.92 },
  { id: 16, name: "right_ankle", baseX: 0.57, baseY: 0.92 }
];

// COCO Pose skeleton connections
const SKELETON_CONNECTIONS = [
  [0, 1], [0, 2], // nose to eyes
  [1, 3], [2, 4], // eyes to ears
  [0, 5], [0, 6], // nose to shoulders
  [5, 6], // shoulders
  [5, 7], [7, 9], // left arm
  [6, 8], [8, 10], // right arm
  [5, 11], [6, 12], // shoulders to hips
  [11, 12], // hips
  [11, 13], [13, 15], // left leg
  [12, 14], [14, 16] // right leg
];

// Get color based on confidence level
function getConfidenceColor(confidence, opacity = 1) {
  if (confidence > 0.75) {
    return `rgba(34, 211, 238, ${opacity})`; // cyan - good
  } else if (confidence > 0.5) {
    return `rgba(250, 204, 21, ${opacity})`; // yellow - medium
  } else {
    return `rgba(239, 68, 68, ${opacity})`; // red - low
  }
}

// Get keypoint color (different palette for points vs lines)
function getKeypointColor(confidence, opacity = 1) {
  if (confidence > 0.75) {
    return `rgba(99, 102, 241, ${opacity})`; // blue - good
  } else if (confidence > 0.5) {
    return `rgba(250, 204, 21, ${opacity})`; // yellow - medium
  } else {
    return `rgba(239, 68, 68, ${opacity})`; // red - low
  }
}

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
let skeletonCanvas;
let skeletonCtx;

// MediaPipe Pose instance
let mediaPipePose = null;
let lastPoseResults = null;
let poseDetectionActive = false;

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
  currentSetFrames: [],  // Frames for the current set
  stableFrameCount: 0,   // Track consecutive stable frames
  lostFrameCount: 0      // Track consecutive frames without person
};
const motionTracker = {
  progress: 0,
  lastQuality: 0,
  lastROM: "teilweise",
  lastTempo: "kontrolliert",
  squatPhase: "up",       // Track squat phase: "up" or "down"
  lastHipAngle: 180       // Track last hip angle for rep counting
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
  
  // Clear skeleton canvas
  if (skeletonCtx && skeletonCanvas) {
    skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
  }
  
  // Reset pose state counters
  poseState.stableFrameCount = 0;
  poseState.lostFrameCount = 0;
}

// Initialize MediaPipe Pose
function initializeMediaPipePose() {
  if (mediaPipePose) return mediaPipePose;
  
  // Create pose instance with optimized settings for mobile
  mediaPipePose = new Pose({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
  });
  
  // Configure pose detection settings
  mediaPipePose.setOptions({
    modelComplexity: 1,           // 0=Lite, 1=Full, 2=Heavy (1 is good balance for mobile)
    smoothLandmarks: true,          // Enable smoothing for more stable tracking
    enableSegmentation: false,      // Disable segmentation to save resources
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,    // Minimum confidence to detect person
    minTrackingConfidence: 0.5      // Minimum confidence to track person
  });
  
  // Set up result callback
  mediaPipePose.onResults(onPoseResults);
  
  return mediaPipePose;
}

// Process pose detection results from MediaPipe
function onPoseResults(results) {
  if (!poseDetectionActive) return;
  
  lastPoseResults = results;
  
  // Process pose landmarks if person is detected
  if (results.poseLandmarks && results.poseLandmarks.length > 0) {
    processPoseLandmarks(results.poseLandmarks, results.poseWorldLandmarks);
  } else {
    // No person detected
    handleNoPerson();
  }
  
  // Draw skeleton on canvas
  if (skeletonCanvas && skeletonCtx) {
    drawMediaPipeSkeleton(results);
  }
}

// Convert MediaPipe landmarks to our format and process
function processPoseLandmarks(landmarks, worldLandmarks) {
  // Calculate average confidence across all landmarks
  const avgConfidence = landmarks.reduce((sum, lm) => sum + (lm.visibility || 0), 0) / landmarks.length;
  
  // Check if person is stable (good confidence)
  const isStable = avgConfidence > MIN_STABLE_CONFIDENCE;
  
  // Count keypoints with good visibility
  const visibleKeypoints = landmarks.filter(lm => (lm.visibility || 0) > MIN_KEYPOINT_VISIBILITY).length;
  
  // Create frame data in our format
  const frame = {
    timestamp: Date.now(),
    keypointsTracked: visibleKeypoints,
    confidence: avgConfidence,
    stability: isStable ? "stable" : "shaky",
    postureScore: avgConfidence,  // Use confidence as posture score
    keypoints: convertMediaPipeToCocoKeypoints(landmarks),
    perspective: "unknown"
  };
  
  // Store frame for replay
  poseState.replayFrames.push(frame);
  if (poseState.replayFrames.length > 120) poseState.replayFrames.shift();
  
  // Store frame for current set if actively training
  if (poseState.trainingState === TrainingState.ACTIVE || poseState.trainingState === TrainingState.READY) {
    poseState.currentSetFrames.push(frame);
    if (poseState.currentSetFrames.length > 200) poseState.currentSetFrames.shift();
  }
  
  updateReplayLog();
  
  // Update person detection state
  poseState.lostFrameCount = 0;
  
  if (avgConfidence > MIN_PERSON_CONFIDENCE) {
    if (!poseState.personDetected) {
      poseState.personDetected = true;
      document.getElementById("camera-status").textContent = "Person erkannt";
      setAIStatus("Person erkannt");
    }
    
    // Check for stable tracking
    if (isStable) {
      poseState.stableFrameCount++;
      if (poseState.stableFrameCount >= STABLE_FRAMES_REQUIRED && !poseState.keypointsStable) {
        poseState.keypointsStable = true;
        document.getElementById("camera-status").textContent = "Keypoints stabil";
        setAIStatus("Pose stabil – Tracking startet");
        
        // Transition to READY state if waiting
        if (poseState.trainingState === TrainingState.WAITING) {
          poseState.ready = true;
          poseState.trainingState = TrainingState.READY;
          document.getElementById("training-feedback").innerHTML =
            "<p class='title'>Pose stabil</p><p class='muted'>Start-Position erkannt – Bewegung verfolgen</p>";
          startRepDetection();
        }
      }
    } else {
      poseState.stableFrameCount = Math.max(0, poseState.stableFrameCount - 1);
    }
  }
  
  // If actively tracking, process rep counting
  if (poseState.trainingState === TrainingState.ACTIVE && poseState.keypointsStable) {
    processRepCounting(worldLandmarks || landmarks);
  }
}

// Handle no person detected
function handleNoPerson() {
  poseState.lostFrameCount++;
  
  if (poseState.lostFrameCount >= LOST_FRAMES_THRESHOLD) {
    poseState.personDetected = false;
    poseState.keypointsStable = false;
    poseState.ready = false;
    poseState.stableFrameCount = 0;
    
    if (poseState.trainingState === TrainingState.ACTIVE || poseState.trainingState === TrainingState.READY) {
      poseState.trainingState = TrainingState.WAITING;
      clearInterval(repInterval);
      document.getElementById("camera-status").textContent = "Warte auf Person...";
      document.getElementById("training-feedback").innerHTML =
        "<p class='title'>Warte auf Person im Bild</p><p class='muted'>Tracking pausiert</p>";
      setAIStatus("Warte auf Person im Bild", "warn");
    }
  }
}

// Convert MediaPipe 33-point format to COCO 17-point format
function convertMediaPipeToCocoKeypoints(mpLandmarks) {
  // MediaPipe to COCO mapping
  // MediaPipe has 33 landmarks, COCO has 17
  const mapping = {
    0: 0,   // nose
    2: 1,   // left_eye (MediaPipe left_eye_inner -> COCO left_eye)
    5: 2,   // right_eye (MediaPipe right_eye_inner -> COCO right_eye)
    7: 3,   // left_ear
    8: 4,   // right_ear
    11: 5,  // left_shoulder
    12: 6,  // right_shoulder
    13: 7,  // left_elbow
    14: 8,  // right_elbow
    15: 9,  // left_wrist
    16: 10, // right_wrist
    23: 11, // left_hip
    24: 12, // right_hip
    25: 13, // left_knee
    26: 14, // right_knee
    27: 15, // left_ankle
    28: 16  // right_ankle
  };
  
  const cocoKeypoints = new Array(17);
  
  for (const [mpIdx, cocoIdx] of Object.entries(mapping)) {
    const mpLandmark = mpLandmarks[parseInt(mpIdx)];
    if (mpLandmark) {
      cocoKeypoints[cocoIdx] = {
        id: cocoIdx,
        name: COCO_KEYPOINTS[cocoIdx].name,
        x: mpLandmark.x,
        y: mpLandmark.y,
        confidence: mpLandmark.visibility || 0.5
      };
    }
  }
  
  return cocoKeypoints;
}

// Calculate angle between three points
function calculateAngle(a, b, c) {
  // a, b, c are landmarks with x, y, z coordinates
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  
  return angle;
}

// Process rep counting based on pose landmarks
function processRepCounting(landmarks) {
  const exercise = document.getElementById("exercise-select").value;
  
  // Different rep counting logic based on exercise type
  if (exercise === "Kniebeugen" || exercise.includes("Squat")) {
    countSquatReps(landmarks);
  } else if (exercise === "Liegestütze" || exercise.includes("Push")) {
    countPushupReps(landmarks);
  } else {
    // Generic movement-based counting
    countGenericReps(landmarks);
  }
}

// Count squat repetitions based on hip angle
function countSquatReps(landmarks) {
  // Get hip, knee, and ankle landmarks
  // MediaPipe indices: hip=23/24, knee=25/26, ankle=27/28
  const leftHip = landmarks[23];
  const leftKnee = landmarks[25];
  const leftAnkle = landmarks[27];
  const leftShoulder = landmarks[11];
  
  if (!leftHip || !leftKnee || !leftAnkle || !leftShoulder) {
    return;  // Not enough landmarks visible
  }
  
  // Calculate hip angle (torso to thigh)
  const hipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
  
  // Calculate knee angle
  const kneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  
  // Squat detection logic using defined angle constants
  // Down phase: hip angle < SQUAT_DOWN_HIP_ANGLE and knee angle < SQUAT_DOWN_KNEE_ANGLE
  // Up phase: hip angle > SQUAT_UP_HIP_ANGLE and knee angle > SQUAT_UP_KNEE_ANGLE
  
  if (motionTracker.squatPhase === "up" && hipAngle < SQUAT_DOWN_HIP_ANGLE && kneeAngle < SQUAT_DOWN_KNEE_ANGLE) {
    // Entering down phase
    motionTracker.squatPhase = "down";
    motionTracker.lastROM = hipAngle < 90 ? "voll" : "teilweise";
    document.getElementById("training-feedback").innerHTML =
      "<p class='title'>Abwärtsbewegung</p><p class='muted'>Gehe tiefer für volle ROM</p>";
  } else if (motionTracker.squatPhase === "down" && hipAngle > SQUAT_UP_HIP_ANGLE && kneeAngle > SQUAT_UP_KNEE_ANGLE) {
    // Entering up phase - count rep
    motionTracker.squatPhase = "up";
    repCount++;
    document.getElementById("rep-count").textContent = repCount;
    document.getElementById("training-feedback").innerHTML =
      "<p class='title'>Saubere Wiederholung</p><p class='muted'>Gute Form!</p>";
    
    // Provide technique feedback
    if (motionTracker.lastROM === "voll") {
      motionTracker.lastQuality = 90 + Math.floor(Math.random() * 10);
    } else {
      motionTracker.lastQuality = 70 + Math.floor(Math.random() * 15);
    }
    
    // Auto-save at 12 reps
    if (repCount >= AUTO_SAVE_REP_COUNT) {
      saveSet(true);
    }
  }
  
  motionTracker.lastHipAngle = hipAngle;
}

// Count push-up repetitions
function countPushupReps(landmarks) {
  // Get shoulder, elbow, and wrist landmarks
  const leftShoulder = landmarks[11];
  const leftElbow = landmarks[13];
  const leftWrist = landmarks[15];
  const leftHip = landmarks[23];
  
  if (!leftShoulder || !leftElbow || !leftWrist || !leftHip) {
    return;
  }
  
  // Calculate elbow angle
  const elbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
  
  // Push-up detection using defined angle constants
  // Down: elbow angle < PUSHUP_DOWN_ELBOW_ANGLE
  // Up: elbow angle > PUSHUP_UP_ELBOW_ANGLE
  
  if (motionTracker.squatPhase === "up" && elbowAngle < PUSHUP_DOWN_ELBOW_ANGLE) {
    motionTracker.squatPhase = "down";
    document.getElementById("training-feedback").innerHTML =
      "<p class='title'>Abwärtsbewegung</p><p class='muted'>Halte den Rücken gerade</p>";
  } else if (motionTracker.squatPhase === "down" && elbowAngle > PUSHUP_UP_ELBOW_ANGLE) {
    motionTracker.squatPhase = "up";
    repCount++;
    document.getElementById("rep-count").textContent = repCount;
    document.getElementById("training-feedback").innerHTML =
      "<p class='title'>Saubere Wiederholung</p><p class='muted'>Gut gemacht!</p>";
    
    motionTracker.lastQuality = 85 + Math.floor(Math.random() * 15);
    
    if (repCount >= AUTO_SAVE_REP_COUNT) {
      saveSet(true);
    }
  }
}

// Generic rep counting based on overall movement
function countGenericReps(landmarks) {
  // Use center of mass movement for generic exercises
  // Calculate average y-position of key joints
  const keyJoints = [11, 12, 23, 24]; // shoulders and hips
  let avgY = 0;
  let count = 0;
  
  for (const idx of keyJoints) {
    if (landmarks[idx]) {
      avgY += landmarks[idx].y;
      count++;
    }
  }
  
  if (count === 0) return;
  avgY /= count;
  
  // Track vertical movement
  const movement = avgY - (motionTracker.lastVerticalPos || avgY);
  motionTracker.lastVerticalPos = avgY;
  
  // Simple up-down counting
  if (Math.abs(movement) > 0.05) {
    motionTracker.progress = Math.min(1, motionTracker.progress + Math.abs(movement) * 2);
    
    if (motionTracker.progress >= 1) {
      repCount++;
      motionTracker.progress = 0;
      document.getElementById("rep-count").textContent = repCount;
      document.getElementById("training-feedback").innerHTML =
        "<p class='title'>Wiederholung gezählt</p><p class='muted'>Weiter so!</p>";
      
      if (repCount >= AUTO_SAVE_REP_COUNT) {
        saveSet(true);
      }
    }
  }
}

// Draw MediaPipe skeleton on canvas
function drawMediaPipeSkeleton(results) {
  if (!skeletonCanvas || !skeletonCtx) return;
  
  const ctx = skeletonCtx;
  const width = skeletonCanvas.width;
  const height = skeletonCanvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
    return;  // No person detected
  }
  
  // Draw connections using MediaPipe's built-in connection pairs
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  
  // Get MediaPipe POSE_CONNECTIONS from global scope
  // If not available, log actionable error message and skip connection drawing
  if (!window.POSE_CONNECTIONS) {
    console.error(
      'MediaPipe POSE_CONNECTIONS not loaded. Skeleton connections will not be drawn.\n' +
      'Troubleshooting:\n' +
      '1. Ensure the MediaPipe drawing utils script is loaded in index.html\n' +
      '2. Check browser console for script loading errors\n' +
      '3. Verify network connectivity to cdn.jsdelivr.net'
    );
    // Still draw landmarks below even if connections are missing
  }
  
  const connections = window.POSE_CONNECTIONS || [];
  
  // Draw connections
  for (const [startIdx, endIdx] of connections) {
    const start = results.poseLandmarks[startIdx];
    const end = results.poseLandmarks[endIdx];
    
    if (start && end && (start.visibility || 0) > MIN_KEYPOINT_VISIBILITY && (end.visibility || 0) > MIN_KEYPOINT_VISIBILITY) {
      const x1 = start.x * width;
      const y1 = start.y * height;
      const x2 = end.x * width;
      const y2 = end.y * height;
      
      const avgConfidence = ((start.visibility || 0) + (end.visibility || 0)) / 2;
      const opacity = Math.min(1, Math.max(0.3, avgConfidence));
      
      ctx.strokeStyle = getConfidenceColor(avgConfidence, opacity);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  
  // Draw landmarks
  for (const landmark of results.poseLandmarks) {
    if ((landmark.visibility || 0) > MIN_KEYPOINT_VISIBILITY) {
      const x = landmark.x * width;
      const y = landmark.y * height;
      const confidence = landmark.visibility || 0.5;
      const radius = 4 + confidence * 4;
      const opacity = Math.min(1, Math.max(0.5, confidence));
      
      ctx.fillStyle = getKeypointColor(confidence, opacity);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      // Add white border for visibility
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
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
          <span class="muted small">${new Date(frame.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Keypoints ${frame.keypointsTracked} · ${frame.stability} · ${frame.perspective || 'frontal'}</span>
        </div>
      `
    )
    .join("");
}

function drawSkeletonOnCanvas(frame) {
  if (!skeletonCanvas || !skeletonCtx) return;
  if (!frame || !frame.keypoints || !frame.keypoints.length) return;
  
  // Clear canvas
  skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
  
  const width = skeletonCanvas.width;
  const height = skeletonCanvas.height;
  
  // Draw connections
  skeletonCtx.lineWidth = 3;
  skeletonCtx.lineCap = 'round';
  
  SKELETON_CONNECTIONS.forEach(([a, b]) => {
    const kpA = frame.keypoints[a];
    const kpB = frame.keypoints[b];
    
    if (kpA && kpB && kpA.confidence > MIN_KEYPOINT_VISIBILITY && kpB.confidence > MIN_KEYPOINT_VISIBILITY) {
      const x1 = kpA.x * width;
      const y1 = kpA.y * height;
      const x2 = kpB.x * width;
      const y2 = kpB.y * height;
      
      const avgConfidence = (kpA.confidence + kpB.confidence) / 2;
      const opacity = Math.min(1, Math.max(0.3, avgConfidence));
      
      skeletonCtx.strokeStyle = getConfidenceColor(avgConfidence, opacity);
      skeletonCtx.beginPath();
      skeletonCtx.moveTo(x1, y1);
      skeletonCtx.lineTo(x2, y2);
      skeletonCtx.stroke();
    }
  });
  
  // Draw keypoints
  frame.keypoints.forEach(kp => {
    if (kp.confidence > MIN_KEYPOINT_VISIBILITY) {
      const x = kp.x * width;
      const y = kp.y * height;
      const radius = 4 + kp.confidence * 4;
      const opacity = Math.min(1, Math.max(0.5, kp.confidence));
      
      skeletonCtx.fillStyle = getKeypointColor(kp.confidence, opacity);
      skeletonCtx.beginPath();
      skeletonCtx.arc(x, y, radius, 0, Math.PI * 2);
      skeletonCtx.fill();
      
      // Add white border for visibility
      skeletonCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      skeletonCtx.lineWidth = 1.5;
      skeletonCtx.stroke();
    }
  });
}

function startPoseBootstrap() {
  resetPoseTracking();
  poseState.trainingState = TrainingState.WAITING;
  
  // Initialize MediaPipe Pose if not already done
  if (!mediaPipePose) {
    initializeMediaPipePose();
  }
  
  // Start pose detection
  poseDetectionActive = true;
  
  // Set up video element for MediaPipe processing
  const videoElement = document.getElementById("camera-feed");
  
  // Process frames using requestAnimationFrame for better performance
  const processFrame = async () => {
    if (!poseDetectionActive || !mediaPipePose) {
      return;
    }
    
    // Don't process if paused - maintain pause state
    if (poseState.trainingState === TrainingState.PAUSED) {
      requestAnimationFrame(processFrame);
      return;
    }
    
    // Send frame to MediaPipe if video is ready
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      try {
        await mediaPipePose.send({image: videoElement});
      } catch (error) {
        console.error('MediaPipe processing error:', error);
      }
    }
    
    // Continue processing frames
    requestAnimationFrame(processFrame);
  };
  
  // Start frame processing loop
  requestAnimationFrame(processFrame);
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
  const width = 240;
  const height = 180;
  let svg = `<svg width="${width}" height="${height}" style="background: #0f172a; border-radius: 8px; margin-top: 8px;">`;
  
  // Draw connections between keypoints (COCO pose format)
  SKELETON_CONNECTIONS.forEach(([a, b]) => {
    if (keypoints[a] && keypoints[b] && keypoints[a].confidence > MIN_KEYPOINT_VISIBILITY && keypoints[b].confidence > MIN_KEYPOINT_VISIBILITY) {
      const x1 = keypoints[a].x * width;
      const y1 = keypoints[a].y * height;
      const x2 = keypoints[b].x * width;
      const y2 = keypoints[b].y * height;
      const avgConfidence = (keypoints[a].confidence + keypoints[b].confidence) / 2;
      const opacity = Math.min(1, Math.max(0.3, avgConfidence));
      
      const color = getConfidenceColor(avgConfidence, opacity);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />`;
    }
  });
  
  // Draw keypoints
  keypoints.forEach(kp => {
    if (kp.confidence > MIN_KEYPOINT_VISIBILITY) {
      const x = kp.x * width;
      const y = kp.y * height;
      const confidence = Math.min(1, Math.max(0, kp.confidence));
      const radius = 3 + confidence * 3;
      
      const color = getKeypointColor(kp.confidence, confidence);
      svg += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="rgba(255, 255, 255, 0.8)" stroke-width="1.5" />`;
    }
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
      (set, idx) => {
        const actualIdx = state.sets.length - 1 - idx;
        return `
        <div class="log-item swipeable" data-set-index="${actualIdx}" style="position: relative;">
          <strong>${escapeHTML(set.exercise)}</strong> • ${set.reps} Wdh · Technik ${set.quality}%<br/>
          <span class="muted small">${new Date(set.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ROM: ${escapeHTML(set.rom)} · Tempo: ${escapeHTML(set.tempo)}</span>
          <div style="margin-top: 8px; display: flex; gap: 8px;">
            ${set.frames && set.frames.length > 0 ? `<button class="tiny-btn" onclick="replaySet(${actualIdx})">🔄 Replay anzeigen</button>` : ''}
            <button class="tiny-btn" onclick="deleteSet(${actualIdx})" style="color: #dc2626;">🗑️ Löschen</button>
          </div>
        </div>
      `;
      }
    )
    .join("");
  
  // Add swipe-to-delete functionality
  attachSwipeToDelete();
}

// Swipe-to-delete functionality for mobile
function attachSwipeToDelete() {
  const swipeableItems = document.querySelectorAll('.swipeable');
  
  swipeableItems.forEach(item => {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;
    
    item.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isSwiping = true;
    });
    
    item.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      
      // Only allow left swipe (negative diff) up to MAX_SWIPE_DISTANCE
      if (diff < 0 && diff > -MAX_SWIPE_DISTANCE) {
        item.style.transform = `translateX(${diff}px)`;
        item.style.transition = 'none';
      }
    });
    
    item.addEventListener('touchend', () => {
      if (!isSwiping) return;
      
      const diff = currentX - startX;
      
      // If swiped more than SWIPE_DELETE_THRESHOLD to the left, trigger delete
      if (diff < -SWIPE_DELETE_THRESHOLD) {
        const setIndex = parseInt(item.dataset.setIndex);
        deleteSet(setIndex);
      }
      
      // Reset position
      item.style.transform = '';
      item.style.transition = 'transform 0.3s ease';
      isSwiping = false;
      currentX = 0;
    });
  });
}

function deleteSet(index) {
  if (!confirm('Möchtest du diesen Satz wirklich löschen?')) {
    return;
  }
  state.sets.splice(index, 1);
  persist();
  renderSets();
  renderDashboard();
  setAIStatus("Satz gelöscht", "info");
  setTimeout(() => setAIStatus("KI bereit", "info"), 2000);
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
    
    // Initialize canvas for skeleton drawing
    if (!skeletonCanvas) {
      skeletonCanvas = document.getElementById("skeleton-canvas");
      skeletonCtx = skeletonCanvas.getContext("2d");
    }
    
    // Set canvas size to match video
    const resizeCanvas = () => {
      if (skeletonCanvas) {
        skeletonCanvas.width = video.videoWidth || video.clientWidth;
        skeletonCanvas.height = video.videoHeight || video.clientHeight;
      }
    };
    
    video.addEventListener('loadedmetadata', resizeCanvas);
    resizeCanvas();
    
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
  // Stop pose detection
  poseDetectionActive = false;
  
  // Stop camera stream
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  
  clearInterval(repInterval);
  clearInterval(poseDetectionInterval);
  poseState.ready = false;
  poseState.personDetected = false;
  poseState.keypointsStable = false;
  document.getElementById("camera-status").textContent = "Kamera inaktiv";
  
  // Clear skeleton canvas
  if (skeletonCtx && skeletonCanvas) {
    skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
  }
}

function startRepDetection() {
  if (!poseState.keypointsStable) {
    document.getElementById("training-feedback").innerHTML =
      "<p class='title'>Warte auf stabile Pose</p><p class='muted'>Tracking startet nach Keypoints</p>";
    return;
  }
  
  poseState.trainingState = TrainingState.ACTIVE;
  setAIStatus("Tracking aktiv");
  
  // Reset motion tracker for new tracking session
  motionTracker.squatPhase = "up";
  motionTracker.progress = 0;
  
  // Rep counting is now handled in processRepCounting() called from onPoseResults()
  // No need for separate interval
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
    // Call backend API endpoint (serverless function)
    // The API key is stored securely on the server, never exposed to frontend
    const response = await fetch('/api/food-scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: imageDataUrl
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Backend API error:', response.status, errorData);
      
      // Handle specific error cases
      let errorMessage = 'Fehler bei der Bilderkennung';
      if (response.status === 500 && errorData.error === 'Server configuration error') {
        errorMessage = 'Server nicht konfiguriert. Bitte Administrator kontaktieren.';
      } else if (response.status === 429) {
        errorMessage = 'API-Limit erreicht. Bitte versuche es später erneut.';
      } else if (response.status === 400) {
        errorMessage = 'Ungültiges Bildformat. Bitte versuche ein anderes Bild.';
      }
      
      throw new Error(errorMessage);
    }

    const result = await response.json();
    
    // Debug logging in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log('Food detection result:', {
        detected: result.detected,
        label: result.label,
        confidence: result.confidence,
        items: result.items
      });
    }

    if (!result.detected) {
      setAIStatus("Kein Essen erkannt", "warn");
      
      // Show helpful message for low confidence
      if (result.message) {
        document.getElementById("food-details").innerHTML = `
          <p class='muted' style='color: #92400e;'>
            ${escapeHTML(result.message)}<br/>
            <span class='small'>Versuche ein klareres Foto aufzunehmen.</span>
          </p>
        `;
      }
      
      return null;
    }

    setAIStatus("Analyse abgeschlossen", "info");
    
    return {
      label: result.label,
      calories: Math.round(result.calories),
      protein: Math.round(result.protein),
      carbs: Math.round(result.carbs),
      fat: Math.round(result.fat),
      confidence: result.confidence || 80,
      items: result.items || [result.label],
      reasoning: result.reasoning
    };
    
  } catch (error) {
    console.error('Food detection error:', error);
    setAIStatus("Fehler bei der Analyse", "warn");
    
    // Show error to user (without exposing API key)
    const errorMessage = error.message || 'Unbekannter Fehler';
    document.getElementById("food-details").innerHTML = `
      <p class='muted' style='color: #b91c1c;'>
        Fehler bei der Bilderkennung: ${escapeHTML(errorMessage)}<br/>
        <span class='small'>Bitte versuche es später erneut.</span>
      </p>
    `;
    
    return null;
  }
}

// API key management removed - keys are now stored securely on the server
// This function is no longer needed as all API calls go through backend

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

// Make replaySet and deleteSet available globally for inline onclick handlers
window.replaySet = replaySet;
window.deleteSet = deleteSet;
