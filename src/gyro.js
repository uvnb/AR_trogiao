// 3DoF Head tracking using deviceorientation API for VR mode
export class Gyro {
  constructor() {
    this.alpha = 0;
    this.beta = 0;
    this.gamma = 0;
    this.baseAlpha = null;
    this.baseBeta = null;
    this.active = false;
    this._handler = this._onOrientation.bind(this);
  }

  _onOrientation(e) {
    if (e.alpha === null || e.beta === null) return;
    this.alpha = e.alpha ?? 0;
    this.beta = e.beta ?? 0;
    this.gamma = e.gamma ?? 0;

    if (this.baseAlpha === null) {
      this.baseAlpha = this.alpha;
      this.baseBeta = this.beta;
    }
    this.active = true;
  }

  async start() {
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') return false;
      } catch (err) {
        console.warn('DeviceOrientation permission rejected:', err);
        return false;
      }
    }
    window.addEventListener('deviceorientation', this._handler);
    return true;
  }

  stop() {
    window.removeEventListener('deviceorientation', this._handler);
    this.active = false;
  }

  getDelta() {
    if (!this.active || this.baseAlpha === null) return { yaw: 0, pitch: 0 };
    // alpha: 0..360, beta: -180..180
    const rawYaw = ((this.alpha - this.baseAlpha + 540) % 360) - 180;
    const rawPitch = this.beta - this.baseBeta;
    return {
      yaw: (rawYaw * Math.PI) / 180,
      pitch: (rawPitch * Math.PI) / 180
    };
  }

  calibrate() {
    this.baseAlpha = this.alpha;
    this.baseBeta = this.beta;
  }
}
