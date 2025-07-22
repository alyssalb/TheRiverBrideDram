let video;
let detector;
let hands = [];

let ripples = [];
let riverMask = [];

let lastRippleTime = 0;
let rippleCooldown = 800;

let phrases = [
  "The river remembers.",
  "What have you left behind?",
  "The current always returns.",
  "Ask the dolphins, they know.",
  "Flow bends but never breaks.",
  "Where sky touches water, stories begin.",
  "A name once spoken, lost downstream."
];

// ⬇️ make setup async
async function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  const model = handPoseDetection.SupportedModels.MediaPipeHands;
  const detectorConfig = {
    runtime: 'mediapipe',
    modelType: 'lite',
    solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands'
  };

  detector = await handPoseDetection.createDetector(model, detectorConfig);

  handLoop(); // ⬅️ start the detection loop
}

function draw() {
  background(0);
  drawSunsetSky();
  drawRiver();
  drawRiverTexture();
  drawRipples();
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
    phrase: random(phrases)
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
  while (true) {
    if (detector && video.loadedmetadata) {
      const results = await detector.estimateHands(video.elt, {
        flipHorizontal: true
      });

      hands = results;

      if (hands.length > 0) {
       let indexTip = hands[0].keypoints.find(k => k.name === 'index_finger_tip');
        if (indexTip) {
          let x = map(indexTip.x, 0, video.width, 0, width);
          let y = map(indexTip.y, 0, video.height, 0, height);

          if (isInRiver(x, y) && millis() - lastRippleTime > rippleCooldown) {
            triggerRipple(x, y);
            lastRippleTime = millis();
          }
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // limit loop speed
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
