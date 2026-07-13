/**
 * A tiny WebAudio "workshop" synth: wood/brass/steel hits, a ratchet place
 * click, and a glockenspiel record sting. Fully synthesized (no audio files),
 * best-effort (silent if WebAudio is unavailable), and gated behind a user
 * gesture per browser autoplay rules.
 */
import type { Material } from '../../shared/types';

export class Synth {
  private ctx?: AudioContext;
  private master?: GainNode;
  enabled = true;

  init(): void {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      /* no audio, stay silent */
    }
  }

  /** Call on the first user gesture to satisfy autoplay policy. */
  unlock(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  /** A part contact, pitched by material and scaled by impact velocity. */
  hit(material: Material, velocity: number): void {
    const base = material === 'steel' ? 196 : material === 'brass' ? 392 : 262;
    const v = Math.min(1, velocity / 12);
    const type: OscillatorType = material === 'steel' ? 'sine' : 'triangle';
    this.tone(base, material === 'steel' ? 0.22 : 0.13, type, 0.06 + 0.16 * v);
    if (material === 'brass') this.tone(base * 2, 0.18, 'sine', 0.03 + 0.05 * v);
  }

  /** The signature ratchet clunk-click of committing a part. */
  place(): void {
    this.noise(0.05, 0.25);
    this.tone(150, 0.09, 'square', 0.18);
    this.tone(90, 0.12, 'sine', 0.14);
  }

  milestone(): void {
    this.tone(660, 0.25, 'sine', 0.14);
  }

  /** Bright glockenspiel arpeggio for a new record. */
  record(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.16, i * 0.09));
  }

  goal(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.18, i * 0.1));
    this.noise(0.4, 0.12);
  }

  /** Ratchet wind-up before a run starts. */
  windUp(): void {
    for (let i = 0; i < 5; i++) this.tone(120 + i * 20, 0.05, 'square', 0.08, i * 0.05);
    this.tone(523, 0.2, 'sine', 0.12, 0.3);
  }
}
