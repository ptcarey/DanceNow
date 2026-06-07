/* ============================================================
   camera-game.js — the camera dance game.

   The camera tracks the player's body on-device (see pose.js). An
   instructor avatar (top) demonstrates each move on the beat; the
   player's own avatar (bottom) is drawn from their pose — the raw
   camera is never shown. A short "clap with me" calibration aligns
   the player's timing, then a gentle scorer rewards Perfect / Good /
   Okay, with a soft gray "Aww" (no drama) when a move is missed.

   Nothing is uploaded; everything runs in the browser.

   NOTE: detector thresholds and timing windows live in CFG below and
   are expected to need a tuning pass on a real device.
   ============================================================ */

import { PoseTracker, LM } from "./pose.js";

/* ---------- Tunable settings ---------- */
const CFG = {
  // Scoring windows (ms from the expected, calibration-adjusted beat)
  perfect: 200,
  good: 350,
  okay: 520,
  lookWindow: 700,   // how far around a beat we'll look for the move
  evalDelay: 540,    // grade a beat this long after it (allow late moves)
  // Move detector thresholds (relative to shoulder width unless noted)
  clapCloseFactor: 0.75,  // wrists closer than this * shoulderWidth = clap
  armsUpMargin: 0.04,     // wrists this far above shoulders (normalized y) = up
  waveWideFactor: 1.25,   // wrists wider than this * shoulderWidth = arms out
  marchKneeFactor: 0.14,  // knee within this (normalized y) of hips = raised
  // Calibration
  calibBpm: 100,
  calibCountIn: 2,
  calibBeats: 8,
  defaultOffset: 250,     // ms, used if calibration is skipped
  smoothing: 0.5,         // player avatar EMA (0=instant, 1=frozen)
};

const STARS = { perfect: 3, good: 2, okay: 1, aww: 0 };
const FEEDBACK = {
  perfect: { text: "Perfect!", cls: "fb-perfect" },
  good:    { text: "Good!",    cls: "fb-good" },
  okay:    { text: "Okay!",    cls: "fb-okay" },
  aww:     { text: "Aww",      cls: "fb-aww" },
};

/* ---------- Choreographies (synth music + move sequence) ---------- */
const SONGS = [
  { name: "Clap & Wave", bpm: 120, blockBeats: 4, sequence: ["clap", "wave", "armsUp", "march"], scale: [392, 440, 494, 587, 659] },
  { name: "Marchy Mix",  bpm: 112, blockBeats: 4, sequence: ["march", "clap", "wave", "armsUp"], scale: [440, 523, 587, 659, 784] },
  { name: "Big Arms",    bpm: 126, blockBeats: 4, sequence: ["armsUp", "clap", "march", "wave"], scale: [349, 415, 466, 523, 622] },
];

const MOVE_INFO = {
  clap:   { label: "Clap!",      emoji: "👏", needLegs: false },
  wave:   { label: "Wave arms!", emoji: "👋", needLegs: false },
  armsUp: { label: "Reach up!",  emoji: "🙌", needLegs: false },
  march:  { label: "March!",     emoji: "🦵", needLegs: true },
};

/* ---------- Tiny Web Audio engine (music + sparkles) ---------- */
const Sound = {
  ctx: null, master: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);
  },
  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
  note(freq, dur = 0.4, gain = 0.5, delay = 0) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "triangle"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  kick(soft = false) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(soft ? 150 : 190, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    g.gain.setValueAtTime(soft ? 0.16 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.2);
  },
  sparkle() {
    [880, 1174, 1568].forEach((f, i) => this.note(f, 0.28, 0.32, i * 0.06));
  },
};

/* ---------- Geometry helpers (on raw landmarks) ---------- */
const vis = (p) => (p && p.visibility != null ? p.visibility : 1);
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function shoulderWidth(lm) {
  const w = dist(lm[LM.shoulderL], lm[LM.shoulderR]);
  return w > 0.05 ? w : 0.2;
}

/* ---------- Detector state ---------- */
const det = {
  present: false,
  legsVisible: false,
  onset: { clap: null, wave: null, armsUp: null, march: null },
  _clap: false, _wave: false, _armsUp: false, _march: false,
  lastLm: null,
};

function updateDetectors(lm, ts) {
  det.lastLm = lm;
  if (!lm) { det.present = false; return; }
  const sw = shoulderWidth(lm);
  det.present =
    vis(lm[LM.shoulderL]) > 0.3 && vis(lm[LM.shoulderR]) > 0.3 &&
    vis(lm[LM.wristL]) > 0.2 && vis(lm[LM.wristR]) > 0.2;
  det.legsVisible = vis(lm[LM.kneeL]) > 0.3 && vis(lm[LM.kneeR]) > 0.3;

  // Clap — wrists come together (falling edge of "closed").
  const closed = dist(lm[LM.wristL], lm[LM.wristR]) < CFG.clapCloseFactor * sw;
  if (closed && !det._clap) det.onset.clap = ts;
  det._clap = closed;

  // Arms up vs. wave (arms out wide). Use shoulder line as reference.
  const wristAboveL = lm[LM.wristL].y < lm[LM.shoulderL].y - CFG.armsUpMargin;
  const wristAboveR = lm[LM.wristR].y < lm[LM.shoulderR].y - CFG.armsUpMargin;
  const up = wristAboveL && wristAboveR;
  const nearUp =
    lm[LM.wristL].y < lm[LM.shoulderL].y + 0.05 &&
    lm[LM.wristR].y < lm[LM.shoulderR].y + 0.05;
  const wide = Math.abs(lm[LM.wristL].x - lm[LM.wristR].x) > CFG.waveWideFactor * sw;

  const armsUpState = up && !wide;
  const waveState = nearUp && wide;
  if (armsUpState && !det._armsUp) det.onset.armsUp = ts;
  det._armsUp = armsUpState;
  if (waveState && !det._wave) det.onset.wave = ts;
  det._wave = waveState;

  // March — a knee lifts toward the hips (needs legs in frame).
  if (det.legsVisible) {
    const hipY = (lm[LM.hipL].y + lm[LM.hipR].y) / 2;
    const kneeMin = Math.min(lm[LM.kneeL].y, lm[LM.kneeR].y);
    const raised = kneeMin - hipY < CFG.marchKneeFactor;
    if (raised && !det._march) det.onset.march = ts;
    det._march = raised;
  }
}

/* ---------- Avatar rendering ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
// distance-from-hit ramp: 0 at the beat, 1 mid-beat
const fromHit = (phase) => Math.min(phase, 1 - phase) * 2;

// Build normalized joints {key:{x,y}} from player's landmarks (mirrored).
function playerJoints(lm) {
  if (!lm) return null;
  const J = {};
  const put = (key, idx) => {
    const p = lm[idx];
    J[key] = { x: 1 - p.x, y: p.y, v: vis(p) };
  };
  put("sL", LM.shoulderL); put("sR", LM.shoulderR);
  put("eL", LM.elbowL); put("eR", LM.elbowR);
  put("wL", LM.wristL); put("wR", LM.wristR);
  put("hL", LM.hipL); put("hR", LM.hipR);
  put("kL", LM.kneeL); put("kR", LM.kneeR);
  put("aL", LM.ankleL); put("aR", LM.ankleR);
  put("head", LM.nose);
  return J;
}

// Procedurally pose the instructor for a move at a given beat phase.
function instructorJoints(move, phase, beatIndex) {
  const sL = { x: 0.36, y: 0.30 }, sR = { x: 0.64, y: 0.30 };
  const hL = { x: 0.42, y: 0.62 }, hR = { x: 0.58, y: 0.62 };
  const head = { x: 0.5, y: 0.16 };
  // default limbs (arms down, legs straight)
  let eL = { x: 0.33, y: 0.43 }, wL = { x: 0.31, y: 0.55 };
  let eR = { x: 0.67, y: 0.43 }, wR = { x: 0.69, y: 0.55 };
  let kL = { x: 0.43, y: 0.80 }, aL = { x: 0.43, y: 0.96 };
  let kR = { x: 0.57, y: 0.80 }, aR = { x: 0.57, y: 0.96 };
  const hit = 1 - fromHit(phase); // 1 at the beat, 0 mid-beat

  if (move === "clap") {
    const gap = lerp(0.03, 0.16, fromHit(phase));
    const cy = 0.42;
    wL = { x: 0.5 - gap, y: cy }; wR = { x: 0.5 + gap, y: cy };
    eL = { x: 0.42, y: 0.40 }; eR = { x: 0.58, y: 0.40 };
  } else if (move === "armsUp") {
    const y = lerp(0.34, 0.05, hit);
    wL = { x: 0.40, y }; wR = { x: 0.60, y };
    eL = { x: 0.38, y: lerp(0.40, 0.18, hit) }; eR = { x: 0.62, y: lerp(0.40, 0.18, hit) };
  } else if (move === "wave") {
    const s = Math.sin(phase * Math.PI * 2) * 0.04;
    wL = { x: 0.20 + s, y: 0.18 }; wR = { x: 0.80 + s, y: 0.18 };
    eL = { x: 0.30 + s, y: 0.30 }; eR = { x: 0.70 + s, y: 0.30 };
  } else if (move === "march") {
    const leftUp = beatIndex % 2 === 0;
    const raise = hit * 0.16;
    if (leftUp) { kL = { x: 0.45, y: 0.80 - raise }; aL = { x: 0.46, y: 0.90 - raise }; }
    else { kR = { x: 0.55, y: 0.80 - raise }; aR = { x: 0.54, y: 0.90 - raise }; }
  }
  return { head, sL, sR, eL, eR, wL, wR, hL, hR, kL, kR, aL, aR };
}

function fitCanvas(c) {
  const r = c.getBoundingClientRect();
  c.width = Math.max(2, Math.round(r.width));
  c.height = Math.max(2, Math.round(r.height));
}

function drawSkeleton(ctx, J, color) {
  if (!J) return;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const P = (j) => [j.x * W, j.y * H];
  const lineW = Math.max(6, W * 0.018);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = color; ctx.fillStyle = color;

  // torso
  if (J.sL && J.sR && J.hL && J.hR) {
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(...P(J.sL)); ctx.lineTo(...P(J.sR));
    ctx.lineTo(...P(J.hR)); ctx.lineTo(...P(J.hL)); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const bone = (a, b) => {
    if (!a || !b) return;
    if (a.v != null && a.v < 0.2) return;
    if (b.v != null && b.v < 0.2) return;
    ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke();
  };
  ctx.lineWidth = lineW;
  bone(J.sL, J.sR); bone(J.sL, J.hL); bone(J.sR, J.hR); bone(J.hL, J.hR);
  bone(J.sL, J.eL); bone(J.eL, J.wL); bone(J.sR, J.eR); bone(J.eR, J.wR);
  bone(J.hL, J.kL); bone(J.kL, J.aL); bone(J.hR, J.kR); bone(J.kR, J.aR);
  // head
  if (J.head) {
    const [hx, hy] = P(J.head);
    const r = Math.max(10, W * 0.05);
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
  }
}

/* ============================================================
   Game controller
   ============================================================ */
const tracker = new PoseTracker();
let els = {};
let smoothJ = null;        // smoothed player joints
let stars = 0;
let song = SONGS[0];
let paused = false;
let elapsedAtPause = 0;

// beat scheduler
const beats = { raf: null, startPerf: 0, beatDur: 500, last: -1, onBeat: null, running: false, drawing: null };

function startBeats(bpm, onBeat, drawing) {
  beats.beatDur = 60000 / bpm;
  beats.startPerf = performance.now();
  beats.last = -1;
  beats.onBeat = onBeat;
  beats.drawing = drawing;
  beats.running = true;
  const tick = () => {
    if (!beats.running) return;
    const elapsed = performance.now() - beats.startPerf;
    const beat = Math.floor(elapsed / beats.beatDur);
    while (beats.last < beat) {
      beats.last++;
      onBeat(beats.last, beats.startPerf + beats.last * beats.beatDur);
    }
    if (beats.drawing) beats.drawing(elapsed);
    beats.raf = requestAnimationFrame(tick);
  };
  beats.raf = requestAnimationFrame(tick);
}
function stopBeats() {
  beats.running = false;
  if (beats.raf) cancelAnimationFrame(beats.raf);
  beats.raf = null;
}

/* ---------- Calibration ---------- */
const cal = { offset: CFG.defaultOffset, samples: [] };
function loadCalibration() {
  const v = Number(localStorage.getItem("danceCalibOffset"));
  if (isFinite(v) && v > 0) cal.offset = v;
}
function saveCalibration() {
  localStorage.setItem("danceCalibOffset", String(Math.round(cal.offset)));
}

/* ---------- Drawing both avatars ---------- */
function drawFrame(elapsed, move, beatIndex) {
  const ictx = els.instructorCanvas.getContext("2d");
  const pctx = els.playerCanvas.getContext("2d");
  ictx.clearRect(0, 0, els.instructorCanvas.width, els.instructorCanvas.height);
  pctx.clearRect(0, 0, els.playerCanvas.width, els.playerCanvas.height);

  // instructor
  if (move) {
    const phase = (elapsed % beats.beatDur) / beats.beatDur;
    const J = instructorJoints(move, phase, beatIndex);
    drawSkeleton(ictx, J, "#80ed99");
  }
  // player (smoothed)
  const raw = playerJoints(det.lastLm);
  if (raw) {
    if (!smoothJ) smoothJ = raw;
    else {
      for (const k in raw) {
        const s = smoothJ[k] || raw[k];
        smoothJ[k] = {
          x: lerp(raw[k].x, s.x, CFG.smoothing),
          y: lerp(raw[k].y, s.y, CFG.smoothing),
          v: raw[k].v,
        };
      }
    }
    drawSkeleton(pctx, smoothJ, "#ffd166");
  }
}

/* ---------- Scoring ---------- */
function gradeBlock(move, hitTime) {
  const expected = hitTime + cal.offset;
  const onset = det.onset[move];
  let tier = "aww";
  if (onset != null && onset >= hitTime - CFG.lookWindow && onset <= hitTime + CFG.lookWindow) {
    const err = Math.abs(onset - expected);
    tier = err <= CFG.perfect ? "perfect" : err <= CFG.good ? "good" : err <= CFG.okay ? "okay" : "aww";
  }
  det.onset[move] = null; // consume
  showFeedback(tier);
  const add = STARS[tier];
  if (add > 0) {
    stars += add;
    els.camStars.textContent = stars;
    Sound.sparkle();
    burst(add);
  }
}

function showFeedback(tier) {
  const fb = FEEDBACK[tier];
  els.camFeedback.classList.remove("show");
  els.camFeedback.textContent = fb.text;
  els.camFeedback.className = "cam-feedback " + fb.cls;
  // force reflow so the pop animation replays on every feedback
  void els.camFeedback.offsetWidth;
  els.camFeedback.classList.add("show");
}

function burst(n) {
  const emojis = ["⭐", "🌟", "✨", "💫"];
  for (let i = 0; i < n * 3; i++) {
    const s = document.createElement("div");
    s.className = "star";
    s.textContent = emojis[(Math.random() * emojis.length) | 0];
    const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 110;
    s.style.left = window.innerWidth / 2 + "px";
    s.style.top = window.innerHeight * 0.7 + "px";
    s.style.setProperty("--dx", Math.cos(a) * d + "px");
    s.style.setProperty("--dy", Math.sin(a) * d + "px");
    s.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}

/* ---------- Overlay helpers ---------- */
function showOverlay(id) {
  ["ovLoading", "ovError", "ovPosition", "ovCalib", "ovSongs", "ovPaused"].forEach((o) =>
    els[o].classList.toggle("hidden", o !== id)
  );
}
function hideOverlays() {
  ["ovLoading", "ovError", "ovPosition", "ovCalib", "ovSongs", "ovPaused"].forEach((o) =>
    els[o].classList.add("hidden")
  );
}

/* ---------- Flow ---------- */
async function launch() {
  buildDom();
  els.root.classList.remove("hidden");
  showOverlay("ovLoading");
  Sound.init(); Sound.resume();
  loadCalibration();
  try {
    await tracker.init();
    await tracker.startCamera(els.camVideo);
    tracker.start((lm, ts) => updateDetectors(lm, ts));
    fitAllCanvases();
    waitForPosition();
  } catch (err) {
    console.warn("Camera game could not start:", err);
    els.errMsg.textContent =
      (err && err.name === "NotAllowedError")
        ? "I need camera permission to see your dancing. You can allow it and try again, or play the tap-along songs instead."
        : "I couldn't start the camera on this device. You can try again, or play the tap-along songs instead.";
    showOverlay("ovError");
  }
}

function waitForPosition() {
  showOverlay("ovPosition");
  let stableSince = 0;
  const check = () => {
    if (els.root.classList.contains("hidden")) return;
    if (!els.ovPosition.classList.contains("hidden")) {
      const now = performance.now();
      if (det.present) {
        if (!stableSince) stableSince = now;
        if (now - stableSince > 1000) { startCalibration(); return; }
      } else {
        stableSince = 0;
      }
      requestAnimationFrame(check);
    }
  };
  requestAnimationFrame(check);
}

function startCalibration() {
  hideOverlays();
  showOverlay("ovCalib");
  cal.samples = [];
  // schedule a grade check shortly after each counted beat
  startBeats(CFG.calibBpm, (beatIndex, beatTime) => {
    const inPlay = beatIndex >= CFG.calibCountIn;
    pulseCalib();
    if (beatIndex < CFG.calibCountIn) {
      Sound.kick(true);
    } else if (beatIndex < CFG.calibBeats) {
      Sound.kick(false);
      const captureFor = beatTime;
      setTimeout(() => {
        const onset = det.onset.clap;
        if (onset != null && onset >= captureFor - 250 && onset <= captureFor + 450) {
          cal.samples.push(onset - captureFor);
          det.onset.clap = null;
        }
      }, 470);
    } else {
      finishCalibration();
    }
  }, null);
}

function pulseCalib() {
  els.calibDot.classList.remove("pulse");
  void els.calibDot.offsetWidth;
  els.calibDot.classList.add("pulse");
}

function finishCalibration() {
  stopBeats();
  if (cal.samples.length >= 2) {
    const sorted = cal.samples.slice().sort((a, b) => a - b);
    let m = sorted[Math.floor(sorted.length / 2)];
    cal.offset = Math.min(600, Math.max(0, m));
    saveCalibration();
  }
  chooseSong();
}

function chooseSong() {
  hideOverlays();
  showOverlay("ovSongs");
}

function startSong(s) {
  song = s;
  hideOverlays();
  stars = 0;
  els.camStars.textContent = "0";
  els.camSong.textContent = s.name;
  paused = false;
  smoothJ = null;
  startGameBeats();
}

function startGameBeats() {
  let curMove = song.sequence[0];
  let curBlockBeat = 0;
  let hintedLegs = false;
  startBeats(
    song.bpm,
    (beatIndex, beatTime) => {
      const inBar = beatIndex % 4;
      Sound.kick(inBar !== 0);
      const freq = song.scale[(beatIndex * 2 + inBar) % song.scale.length];
      Sound.note(freq, 0.4, 0.45);
      // beat dots
      els.beatDots.forEach((d, n) => d.classList.toggle("on", n === beatIndex % els.beatDots.length));
      // new block → set move + schedule grade
      if (beatIndex % song.blockBeats === 0) {
        const block = Math.floor(beatIndex / song.blockBeats);
        curMove = song.sequence[block % song.sequence.length];
        els.camMove.textContent = `${MOVE_INFO[curMove].emoji} ${MOVE_INFO[curMove].label}`;
        if (MOVE_INFO[curMove].needLegs && !det.legsVisible && !hintedLegs) {
          hintedLegs = true;
          flashLegHint();
        }
        const move = curMove, hitTime = beatTime;
        setTimeout(() => { if (!paused) gradeBlock(move, hitTime); }, CFG.evalDelay);
      }
    },
    (elapsed) => drawFrame(elapsed, curMove, Math.floor(elapsed / beats.beatDur))
  );
}

let legHintTimer = null;
function flashLegHint() {
  els.legHint.classList.remove("hidden");
  if (legHintTimer) clearTimeout(legHintTimer);
  legHintTimer = setTimeout(() => els.legHint.classList.add("hidden"), 2600);
}

/* ---------- Pause / quit ---------- */
function pause() {
  if (!beats.running) return;
  paused = true;
  elapsedAtPause = performance.now() - beats.startPerf;
  stopBeats();
  showOverlay("ovPaused");
}
function resume() {
  hideOverlays();
  paused = false;
  // continue from where we paused
  beats.running = true;
  beats.startPerf = performance.now() - elapsedAtPause;
  const tick = () => {
    if (!beats.running) return;
    const elapsed = performance.now() - beats.startPerf;
    const beat = Math.floor(elapsed / beats.beatDur);
    while (beats.last < beat) { beats.last++; beats.onBeat(beats.last, beats.startPerf + beats.last * beats.beatDur); }
    if (beats.drawing) beats.drawing(elapsed);
    beats.raf = requestAnimationFrame(tick);
  };
  beats.raf = requestAnimationFrame(tick);
}
function quit() {
  stopBeats();
  tracker.stop();
  hideOverlays();
  els.root.classList.add("hidden");
}

/* ---------- DOM ---------- */
function fitAllCanvases() {
  fitCanvas(els.instructorCanvas);
  fitCanvas(els.playerCanvas);
}

function buildDom() {
  if (els.root) return;
  const root = document.getElementById("cameraGame");
  root.innerHTML = `
    <video id="camVideo" playsinline muted></video>
    <div class="cam-topbar">
      <button class="cam-iconbtn" id="camHome" aria-label="Home">🏠</button>
      <div class="cam-pill" id="camSong">Camera Dance</div>
      <div class="cam-pill">⭐ <span id="camStars">0</span></div>
    </div>
    <div class="cam-stage">
      <div class="cam-instructor">
        <div class="cam-tag">Follow me!</div>
        <canvas id="instructorCanvas"></canvas>
        <div class="cam-move" id="camMove"></div>
      </div>
      <div class="cam-player">
        <div class="cam-tag">You</div>
        <canvas id="playerCanvas"></canvas>
        <div class="cam-feedback" id="camFeedback"></div>
        <div class="cam-overlay hidden" id="legHint" style="background:none;backdrop-filter:none;justify-content:flex-end;padding-bottom:18px;pointer-events:none;">
          <p style="background:rgba(0,0,0,0.4);padding:8px 16px;border-radius:999px;">🦵 Step back so I can see your legs!</p>
        </div>
      </div>
    </div>
    <div class="cam-beats" id="camBeats">
      <div class="beat-dot"></div><div class="beat-dot"></div><div class="beat-dot"></div><div class="beat-dot"></div>
    </div>
    <div style="display:flex;justify-content:center;padding:0 0 max(14px,env(safe-area-inset-bottom));">
      <button class="cam-iconbtn" id="camPause" aria-label="Pause">⏸️</button>
    </div>

    <div class="cam-overlay" id="ovLoading">
      <div class="cam-spinner"></div>
      <h2>Getting ready… ✨</h2>
      <p>Setting up the camera so I can see your dancing.</p>
    </div>
    <div class="cam-overlay hidden" id="ovError">
      <div class="big">📷</div>
      <h2>Camera not started</h2>
      <p id="errMsg"></p>
      <button class="cam-btn" id="errRetry">Try again</button>
      <button class="cam-btn ghost" id="errClassic">Play tap-along songs</button>
    </div>
    <div class="cam-overlay hidden" id="ovPosition">
      <div class="big">🙋</div>
      <h2>Stand back!</h2>
      <p>Move back so I can see you wave your arms. When I spot you, we'll start!</p>
      <button class="cam-btn ghost" id="posSkip">Skip</button>
    </div>
    <div class="cam-overlay hidden" id="ovCalib">
      <div class="big" id="calibDot">👏</div>
      <h2>Clap with me!</h2>
      <p>Clap along with the beat so I can learn your timing.</p>
      <button class="cam-btn ghost" id="calibSkip">Skip</button>
    </div>
    <div class="cam-overlay hidden" id="ovSongs">
      <div class="big">🎶</div>
      <h2>Pick a dance!</h2>
      <div id="songButtons" style="display:flex;flex-direction:column;gap:12px;width:min(360px,82vw);"></div>
    </div>
    <div class="cam-overlay hidden" id="ovPaused">
      <div class="big">⏸️</div>
      <h2>Paused</h2>
      <button class="cam-btn" id="pauseResume">▶️ Keep Dancing</button>
      <button class="cam-btn ghost" id="pauseHome">🏠 Home</button>
    </div>
  `;
  const $ = (id) => document.getElementById(id);
  els = {
    root,
    camVideo: $("camVideo"),
    instructorCanvas: $("instructorCanvas"),
    playerCanvas: $("playerCanvas"),
    camMove: $("camMove"),
    camSong: $("camSong"),
    camStars: $("camStars"),
    camFeedback: $("camFeedback"),
    beatDots: Array.from(root.querySelectorAll("#camBeats .beat-dot")),
    legHint: $("legHint"),
    calibDot: $("calibDot"),
    errMsg: $("errMsg"),
    ovLoading: $("ovLoading"), ovError: $("ovError"), ovPosition: $("ovPosition"),
    ovCalib: $("ovCalib"), ovSongs: $("ovSongs"), ovPaused: $("ovPaused"),
  };

  // wire controls
  $("camHome").addEventListener("click", quit);
  $("camPause").addEventListener("click", pause);
  $("pauseResume").addEventListener("click", resume);
  $("pauseHome").addEventListener("click", quit);
  $("errRetry").addEventListener("click", () => launch());
  $("errClassic").addEventListener("click", quit);
  $("posSkip").addEventListener("click", startCalibration);
  $("calibSkip").addEventListener("click", () => { stopBeats(); chooseSong(); });

  // song buttons
  const sb = $("songButtons");
  SONGS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "cam-btn";
    b.textContent = `▶️ ${s.name}`;
    b.addEventListener("click", () => startSong(s));
    sb.appendChild(b);
  });

  window.addEventListener("resize", () => { if (!root.classList.contains("hidden")) fitAllCanvases(); });
  // calibration dot pulse style (added once)
  const style = document.createElement("style");
  style.textContent = "#calibDot.pulse{animation:fbpop .5s ease-out}";
  document.head.appendChild(style);
}

/* ---------- Entry point ---------- */
window.addEventListener("DOMContentLoaded", () => {
  const cta = document.getElementById("cameraCta");
  if (cta) cta.addEventListener("click", launch);
});
