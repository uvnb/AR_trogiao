// Webcam + MediaPipe HandLandmarker (Tasks API, VIDEO mode). The render loop calls poll() once per frame;
// detection only runs when the camera delivered a new frame, and timestamps strictly increase.
const VISION = '../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';
const WASM = 'node_modules/@mediapipe/tasks-vision/wasm';
const MODEL = 'models/hand_landmarker.task';

const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export class HandCamera {
  constructor(video, { facingMode = 'environment' } = {}) {
    this.video = video;
    this.facingMode = facingMode;
    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.delegate = null;
    this.lastVideoTime = -1;
    this.lastTs = 0;
    this.frames = 0;             // camera frames processed
    this.fps = 0;
    this.detectMs = 0;
    this._n = 0; this._t = performance.now();
    this.newFrame = false;       // a new video frame arrived since the last poll (renderer uploads it)
  }

  async start(onStatus = () => {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot access a camera (getUserMedia missing — use https or localhost).');
    onStatus('Requesting camera…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: isMobile ? 640 : 1280 },
        height: { ideal: isMobile ? 480 : 720 },
        facingMode: { ideal: this.facingMode },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
    this.video.srcObject = this.stream;
    this.video.muted = true; this.video.playsInline = true;
    await this.video.play();
    onStatus('Loading hand tracker…');
    const { FilesetResolver, HandLandmarker } = await import(VISION);
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.landmarker = await make('GPU'); this.delegate = 'GPU'; }
    catch (e) { console.warn('GPU delegate failed, falling back to CPU', e); this.landmarker = await make('CPU'); this.delegate = 'CPU'; }
    this.running = true;
    onStatus('');
  }

  /** Returns undefined when there is no new camera frame, else a list of hands, possibly empty. */
  poll() {
    const v = this.video;
    if (!this.running || v.readyState < 2 || v.currentTime === this.lastVideoTime) return undefined;
    const now = performance.now();
    if (isMobile && now - this.lastTs < 32) return undefined;
    this.lastVideoTime = v.currentTime;
    this.newFrame = true;
    const ts = Math.max(Math.round(now), this.lastTs + 1);      // must strictly increase
    this.lastTs = ts;
    const t0 = performance.now();
    const res = this.landmarker.detectForVideo(v, ts);
    this.detectMs = performance.now() - t0;
    this.frames++; this._n++;
    const now = performance.now();
    if (now - this._t > 1000) { this.fps = (this._n * 1000) / (now - this._t); this._n = 0; this._t = now; }
    const isUser = this.facingMode === 'user';
    return (res.landmarks || []).map((lm) => lm.map((p) => [isUser ? 1 - p.x : p.x, p.y]));
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close?.();
    this.landmarker = null;
  }
}
