let video;
let detector;
let hands = [];

let showFinger = false;
let fingertipPos = null;

let ripples = [];
let riverMask = [];

let lastRippleTime = 0;
let rippleCooldown = 1800;

const MOVE_THRESHOLD = 40;
let lastTipForRipple = null;

let wasInRiver = false;

const PHRASE_SETTINGS = {
  factsWeight: 0.35,
  brideWeight: 0.25,
  recentBuffer: 6
};

const poeticLines = [
  "The river knows.",
  "The river remembers.",
  "What were you before?",
  "Floods and ebbs, you know its motion.",
  "A name once spoken, lost downstream.",
  "Moonlight sparkles on the calm river.",
  "The rain disrupts, the rain brings newness.",
  "Your hand writes circles the water won't forget.",
  "Listen. The water tells its secrets.",
  "Branches kiss the surface, what roots lie beneath?",
  "The channel curves, the same as your lost thoughts.",
  "To drift is to choose.",
  "The water takes shape in your wondering.",
  "The river changes in the rain.",
];

const riverFacts = [
  "The water here carries worlds of sediment, stories ground to silt.",
  "Take a gamble in the largest rainforest in the world.",
  "These waters cross 8 continents, expansive.",
  "So many species call these banks and waters home; new ones are always there to find, if one is brave enough to look.",
  "Who lives here? Who knows the land? Who was born here?",
  "The river supports 400 indigenous groups, and 300 indigenous languages.",
  "Stop taking these trees, they are integral to the safety of the planet.",
  "The rich canopy tells the story of the forest, and provides its temperature and humidity regulation.",
  "The Amazon once flowed in the opposite direction, towards the Pacific, until the Andes rose and reversed it.",
  "Sometimes even dolphin myths can die - global warming causes intensive droughts, harming the ecosystem and all creature that inhabit it."
];

const brideFlavor = [
  "Promises ebb and flow, but the river always keeps them.",
  "Sisters hear different secrets in the same water.",
  "A veil of steam, a choice to drift.",
  "If a stranger rose from these waters, would you know his name?",
  "How do you treat the dolphins? They watch; they know.",
  "Nets catch fish, sometimes more.",
  "The current hesistates, and the current pulls.",
  "The floods await no one."
  ];

// ----- NEW: mount sizing helper -----
function getMountSize() {
  const m = document.getElementById('sketchMount');
  if (!m) return { w: windowWidth, h: windowHeight };
  const r = m.getBoundingClientRect();
  return { w: r.width, h: r.height };
}
// ------------------------------------

// --- additions: small helpers + logs ---
function log(...args){ console.log("[River]", ...args); }
function warn(...args){ console.warn("[River]", ...args); }
function err(...args){ console.error("[River]", ...args); }

async function waitForVideoReady(elt, timeoutMs = 8000) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      // 2 = HAVE_CURRENT_DATA
      if (elt && elt.readyState >= 2) return resolve(true);
      if (performance.now() - start > timeoutMs) {
        return reject(new Error("Video not ready (timeout)."));
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
// --- end additions ---

async function setup() {
  // ----- CHANGED: create canvas sized to #sketchMount and mount it -----
  const { w, h } = getMountSize();
  const c = createCanvas(w, h);
  c.parent('sketchMount');
  // ---------------------------------------------------------------------
  noStroke();

  // your original createCapture
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  // --- additions: ensure TF + video are ready before detector ---
  try {
    if (typeof tf !== "undefined") {
      try { await tf.setBackend("webgl"); } catch (e) { warn("Could not set TF backend to webgl:", e); }
      await tf.ready();
      log("TF backend:", tf.getBackend());
    } else {
      warn("tf not found on window; continuing (TFJS not required for MediaPipe runtime but recommended).");
    }
  } catch (e) {
    warn("TensorFlow setup issue; continuing anyway:", e);
  }

  try {
    await waitForVideoReady(video.elt);
    log("Video readyState:", video.elt.readyState);
  } catch (e) {
    err("Webcam did not become ready:", e);
    // continue; user might grant later
  }
  // --- end additions ---

  const model = handPoseDetection.SupportedModels.MediaPipeHands;
  const detectorConfig = {
    runtime: 'mediapipe',
    modelType: 'lite',
    solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands'
  };

  try {
    detector = await handPoseDetection.createDetector(model, detectorConfig);
    log("Detector ready.");
  } catch (e) {
    err("Failed to create detector:", e);
  }

  handLoop();
}

function draw() {
  background(0);
  drawSunsetSky();
  drawRiver();
  drawRiverTexture();
  drawRipples();

  // Draw fingertip indicator
  if (showFinger && fingertipPos) {
    push();
    fill(255, 0, 0, 150);
    noStroke();
    ellipse(fingertipPos.x, fingertipPos.y, 20, 20);
    pop();
  }

  // small camera preview (helps verify stream)
  if (video) {
    push();
    image(video, 16, 16, 160, 120);
    pop();
  }

  // status hint
  fill(220);
  noStroke();
  textSize(14);
  const status = detector
    ? (hands.length ? "Hand detected" : "Looking for a hand…")
    : "Loading model…";
  text(status, 16, height - 20);
}

function drawSunsetSky() {
  for (let y = 0; y < height; y++) {
    let inter = map(y, 0, height, 0, 1);
    let c = lerpColor(color('#fdc57b'), color('#6b4c8b'), inter);
    stroke(c);
    line(0, y, width, y);
  }
}

function drawRiver() {
  fill('#2f5e4e');
  beginShape();
  riverMask = [];

  for (let y = 0; y <= height; y += 8) {
    let edgeEase = sin((y / height) * PI);
    let n = noise(y * 0.01, frameCount * 0.001);
    let waveOffset = sin(y * 0.01 + frameCount * 0.003 + n * TWO_PI) * (60 + n * 30 * edgeEase);
    let leftX = width / 2 + waveOffset - 200;
    vertex(leftX, y);
    riverMask.push({ y: y, left: leftX });
  }

  for (let i = riverMask.length - 1; i >= 0; i--) {
    let y = riverMask[i].y;
    let edgeEase = sin((y / height) * PI);
    let n = noise(y * 0.01 + 100, frameCount * 0.001 + 100);
    let waveOffset = sin(y * 0.01 + frameCount * 0.003 + n * TWO_PI) * (60 + n * 30 * edgeEase);
    let rightX = width / 2 + waveOffset + 200;
    vertex(rightX, y);
    riverMask[i].right = rightX;
  }

  endShape(CLOSE);
}

function drawRipples() {
  noFill();
  stroke(255, 255, 255, 90);
  strokeWeight(1.2);

  for (let r of ripples) {
    push();
    translate(r.x, r.y);
    rotate(sin(frameCount * 0.03 + r.wobbleOffset) * 0.1);

    let points = [];
    let variation = r.variation;

    for (let a = 0; a < TWO_PI; a += PI / 32) {
      let wobble = sin(a * variation.freq + frameCount * variation.speed + r.wobbleOffset) * variation.amp;
      let rx = cos(a) * (r.radius + wobble);
      let ry = sin(a) * (r.radius + wobble * 0.6);
      points.push({ x: rx, y: ry });
    }

    beginShape();
    for (let pt of points) {
      curveVertex(pt.x, pt.y);
    }
    for (let i = 0; i < 3; i++) {
      curveVertex(points[i].x, points[i].y);
    }
    endShape();
    pop();

    // Text
    if (r.alpha > 0 && r.phrase) {
      push();
      fill(255, r.alpha);
      noStroke();
      textAlign(CENTER);
      textSize(14);
      text(r.phrase, r.x, r.y - r.radius - 12);
      pop();
    }

    r.radius += 1.4;
    r.alpha -= 2;
  }

  ripples = ripples.filter(r => r.alpha > 0);
}

const recentPhrases = [];

function pickPhrase() {
  const r = Math.random();
  let pool;
  if (r < PHRASE_SETTINGS.factsWeight) {
    pool = riverFacts;
  } else if (r < PHRASE_SETTINGS.factsWeight + PHRASE_SETTINGS.brideWeight) {
    pool = brideFlavor;
  } else {
    pool = poeticLines;
  }

  let choice = null;
  for (let i = 0; i < 8; i++) {
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    if (!recentPhrases.includes(candidate)) { choice = candidate; break; }
    choice = candidate;
  }

  recentPhrases.push(choice);
  while (recentPhrases.length > PHRASE_SETTINGS.recentBuffer) {
    recentPhrases.shift();
  }
  return choice;
}
  
function triggerRipple(x, y) {
  ripples.push({
    x: x,
    y: y,
    radius: 10,
    alpha: 255,
    wobbleOffset: random(TWO_PI),
    variation: {
      freq: random(2, 6),
      amp: random(2, 5),
      speed: random(0.05, 0.15)
    },
    phrase: pickPhrase()
  });
}

function isInRiver(x, y) {
  let closest = riverMask.reduce((prev, curr) => {
    return abs(curr.y - y) < abs(prev.y - y) ? curr : prev;
  });

  if (closest.left !== undefined && closest.right !== undefined) {
    return x > closest.left && x < closest.right;
  }
  return false;
}

function drawRiverTexture() {
  push();
  blendMode(SOFT_LIGHT);

  stroke(255, 255, 255, 12);
  strokeWeight(1);
  for (let y = 0; y < height; y += 6) {
    let waviness = sin(y * 0.02 + frameCount * 0.02) * 30;
    let left = width / 2 - 200 + waviness;
    let right = width / 2 + 200 + waviness;
    line(left, y, right, y);
  }

  noStroke();
  for (let i = 0; i < 30; i++) {
    let y = floor(random(height));
    if (riverMask[y] && riverMask[y].left !== undefined && riverMask[y].right !== undefined) {
      let x = random(riverMask[y].left, riverMask[y].right);
      fill(255, 255, 255, random(20, 60));
      ellipse(x, y, random(3, 7), random(1.5, 3));
    }
  }

  pop();
}

async function handLoop() {
  // small guard: if detector isn't built yet, wait a bit
  while (!detector) {
    await new Promise(r => setTimeout(r, 100));
  }

  while (true) {
    if (detector && video && video.elt && video.elt.readyState >= 2) {
      try {
        const results = await detector.estimateHands(video.elt, { flipHorizontal: true });
        hands = results || [];

        if (hands.length > 0) {
          // prefer 'index_finger_tip'; fallback if not present
          let indexTip = hands[0].keypoints?.find(k => k.name === 'index_finger_tip')
                        || hands[0].keypoints?.[8]; // common index in some outputs

          if (indexTip && Number.isFinite(indexTip.x) && Number.isFinite(indexTip.y)) {
            let x = map(indexTip.x, 0, video.width, 0, width);
            let y = map(indexTip.y, 0, video.height, 0, height);

            fingertipPos = { x, y };

const now = millis();
const inRiver = isInRiver(x, y);

// how far has the fingertip moved since the last ripple-worthy position?
let movedEnough = true;
if (lastTipForRipple) {
  const dx = x - lastTipForRipple.x;
  const dy = y - lastTipForRipple.y;
  movedEnough = Math.hypot(dx, dy) >= MOVE_THRESHOLD;
}

// fire when entering the river OR after sufficient motion, and only after cooldown
const entering = inRiver && !wasInRiver;
if (inRiver && (entering || movedEnough) && (now - lastRippleTime > rippleCooldown)) {
  triggerRipple(x, y);
  lastRippleTime = now;
  lastTipForRipple = { x, y };
}

// remember current state for next frame
wasInRiver = inRiver;

          }
        }
      } catch (e) {
        warn("estimateHands error:", e);
      }
    }
    // keep your ~10Hz loop
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

function keyPressed() {
  if (key === 'f' || key === 'F') {
    showFinger = !showFinger;
    console.log("Show finger:", showFinger);
  }
}

// ----- CHANGED: resize to the mount container -----
function windowResized() {
  const { w, h } = getMountSize();
  resizeCanvas(w, h);
}
