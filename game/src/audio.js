// audio.js — every sound in MERIDIAN RUN is synthesised with WebAudio.
// No audio files: engine hum, ring chimes, alarms and wind are all built
// from oscillators and filtered noise, and the whole bus can be muted.
import { AUDIO_MASTER_GAIN, ENGINE_BASE_HZ, ENGINE_TOP_HZ, JINGLE_NOTES } from './config.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windSource = null;
    this.windGain = null;
    this.muted = false;
    this.unlocked = false;
  }

  // Browsers block audio until a user gesture: call this from the first
  // keydown or click, then build the always-on engine and wind buses.
  unlock() {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : AUDIO_MASTER_GAIN;
      this.master.connect(this.ctx.destination);
      this.startEngineBus();
      this.startWindBus();
      this.unlocked = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  startEngineBus() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = ENGINE_BASE_HZ;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = ENGINE_BASE_HZ * 0.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  startWindBus() {
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windSource.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.windSource.start();
  }

  // The engine drone follows throttle (pitch) and speed (loudness).
  engineHum(throttle, speedKnots) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const hz = ENGINE_BASE_HZ + (ENGINE_TOP_HZ - ENGINE_BASE_HZ) * (throttle / 100);
    this.engineOsc.frequency.setTargetAtTime(hz, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(hz * 0.5, t, 0.08);
    const loud = 0.05 + 0.16 * (throttle / 100) + 0.05 * Math.min(1, speedKnots / 180);
    this.engineGain.gain.setTargetAtTime(loud, t, 0.1);
    this.windGain.gain.setTargetAtTime(0.02 + 0.09 * Math.min(1, speedKnots / 185), t, 0.2);
  }

  // A dull thud for a hard landing, a soft one for a touchdown.
  thud(hard) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 90 : 140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(hard ? 0.5 : 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  // Four-note rising jingle for a mission complete.
  playJingle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    JINGLE_NOTES.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      const start = t + i * 0.13;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  // The wind loop swells in Storm Run and fades elsewhere.
  windLoop(strength) {
    if (!this.ctx || !this.windGain) return;
    this.windGain.gain.setTargetAtTime(0.02 + 0.16 * strength, this.ctx.currentTime, 0.4);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : AUDIO_MASTER_GAIN, this.ctx.currentTime, 0.05);
    }
  }

  isMuted() { return this.muted; }

  // A short two-note chime when the plane threads a ring.
  ringChime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.35, t + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.55);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.6);
    });
  }

  // Rising alarm for stall, low fuel and terrain warnings.
  alarm(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = kind === 'stall' ? 520 : kind === 'fuel' ? 660 : 440;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq * 0.8, t + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }
}
