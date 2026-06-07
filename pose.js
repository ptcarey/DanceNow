/* ============================================================
   pose.js — on-device body tracking via MediaPipe Pose Landmarker.

   The camera frames are processed locally in the browser; nothing is
   ever uploaded. The model + engine load once from a CDN, then the
   browser/service-worker caches them.
   ============================================================ */

const MP_VERSION = "0.10.20";
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
// "lite" model: smallest/fastest — best for phones & tablets.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// BlazePose 33-landmark indices we use.
export const LM = {
  nose: 0,
  shoulderL: 11, shoulderR: 12,
  elbowL: 13, elbowR: 14,
  wristL: 15, wristR: 16,
  hipL: 23, hipR: 24,
  kneeL: 25, kneeR: 26,
  ankleL: 27, ankleR: 28,
};

export class PoseTracker {
  constructor() {
    this.video = null;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.onFrame = null;       // (landmarks|null, timestampMs) => void
    this._raf = null;
    this._lastVideoTime = -1;
  }

  // Load the MediaPipe engine + model. Tries GPU, falls back to CPU.
  async init() {
    const { FilesetResolver, PoseLandmarker } = await import(VISION_URL);
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(vision, opts("GPU"));
    } catch (e) {
      console.warn("Pose: GPU delegate failed, falling back to CPU:", e);
      this.landmarker = await PoseLandmarker.createFromOptions(vision, opts("CPU"));
    }
  }

  // Request the front camera and start the (hidden) video element.
  async startCamera(videoEl) {
    this.video = videoEl;
    videoEl.setAttribute("playsinline", "");
    videoEl.muted = true;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
    this.stream = stream;
    videoEl.srcObject = stream;
    await videoEl.play();
  }

  // Begin the detection loop, calling onFrame with the latest landmarks.
  start(onFrame) {
    this.onFrame = onFrame;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      const v = this.video;
      if (v && v.readyState >= 2 && v.currentTime !== this._lastVideoTime) {
        this._lastVideoTime = v.currentTime;
        const ts = performance.now();
        try {
          const res = this.landmarker.detectForVideo(v, ts);
          const lm = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
          if (this.onFrame) this.onFrame(lm, ts);
        } catch (e) {
          /* drop this frame */
        }
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }
}
