/**
 * Generative Cinematic Ambient Soundscape Engine
 * Powered by Web Audio API — zero dependencies, zero network requests, instant playback.
 */

class AmbientSoundEngine {
  private ctx: AudioContext | null = null;
  private isRunning = false;
  private masterGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private filter: BiquadFilterNode | null = null;
  private intervalId: number | null = null;

  private init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master gain with smooth ramp
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

    // Warm cinematic low-pass filter
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(320, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.filter.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  public toggle(): boolean {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public start() {
    this.init();
    if (!this.ctx || !this.masterGain || !this.filter) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.isRunning = true;
    const now = this.ctx.currentTime;

    // Smooth fade in
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.18, now + 2.5);

    // Stop previous oscillators if any
    this.cleanupOscillators();

    // Harmonic chord cluster (D minor / F major cinematic frequencies: D2, A2, D3, F3, A3)
    const baseFreqs = [73.42, 110.0, 146.83, 174.61, 220.0];

    baseFreqs.forEach((freq, idx) => {
      if (!this.ctx || !this.filter) return;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      // Subtle detune for analog cinematic warmth
      osc.detune.setValueAtTime((Math.random() - 0.5) * 14, this.ctx.currentTime);

      // Lower volume for higher harmonics
      const gainVal = 0.15 / (idx + 1);
      oscGain.gain.setValueAtTime(gainVal, this.ctx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(this.filter);
      osc.start();
      this.oscillators.push(osc);
    });

    // Gentle breathing LFO on filter cutoff
    let cycle = 0;
    this.intervalId = window.setInterval(() => {
      if (!this.ctx || !this.filter || !this.isRunning) return;
      cycle += 0.05;
      const targetFreq = 260 + Math.sin(cycle) * 120;
      this.filter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.8);
    }, 400);
  }

  public stop() {
    if (!this.ctx || !this.masterGain) return;
    this.isRunning = false;
    const now = this.ctx.currentTime;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Smooth fade out
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    setTimeout(() => {
      if (!this.isRunning) {
        this.cleanupOscillators();
      }
    }, 1300);
  }

  private cleanupOscillators() {
    this.oscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Already stopped
      }
    });
    this.oscillators = [];
  }

  public getState(): boolean {
    return this.isRunning;
  }
}

export const ambientSound = new AmbientSoundEngine();
