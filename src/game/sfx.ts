/**
 * Tiny synthesised sound effects (Web Audio), so the game needs no audio files.
 * The audio context is created on the first key press / click (browsers require a gesture).
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor() {
    const unlock = () => this.ensure();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    try {
      this.muted = window.localStorage.getItem('kristole.muted') === '1';
    } catch {
      /* ignore */
    }
  }

  ensure() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try {
      window.localStorage.setItem('kristole.muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  private get ready() {
    return this.ctx && this.master && this.ctx.state === 'running' ? this.ctx : null;
  }

  private noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number, q = 1) {
    const ctx = this.ready;
    if (!ctx || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number, attack = 0.01) {
    const ctx = this.ready;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private now() {
    return this.ready ? this.ctx!.currentTime : 0;
  }

  swing(heavy: boolean) {
    const t = this.now();
    if (!t) return;
    this.noise(t, heavy ? 0.26 : 0.18, 'bandpass', heavy ? 500 : 900, heavy ? 2200 : 4200, heavy ? 0.5 : 0.35, 1.5);
  }

  hit(heavy: boolean) {
    const t = this.now();
    if (!t) return;
    this.tone(t, 0.14, 'sine', heavy ? 140 : 190, 45, 0.7);
    this.noise(t, 0.12, 'lowpass', 1800, 300, 0.45);
    // wet squelch
    this.noise(t + 0.02, 0.16, 'bandpass', 700, 250, 0.25, 4);
  }

  zombieDie(big: boolean) {
    const t = this.now();
    if (!t) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = big ? 95 : 160;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.7);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = base * 0.08;
    lfo.connect(lfoGain).connect(o.frequency);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(filt).connect(g).connect(this.master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.8);
    lfo.stop(t + 0.8);
    this.noise(t, 0.3, 'lowpass', 600, 100, 0.3);
  }

  groan() {
    const t = this.now();
    if (!t) return;
    const f = 80 + Math.random() * 50;
    this.tone(t, 0.9, 'sawtooth', f, f * 0.8, 0.07, 0.25);
  }

  zombieAttack() {
    const t = this.now();
    if (!t) return;
    this.tone(t, 0.25, 'square', 220, 110, 0.08);
  }

  playerHurt() {
    const t = this.now();
    if (!t) return;
    this.tone(t, 0.22, 'square', 330, 140, 0.18);
    this.noise(t, 0.1, 'lowpass', 2000, 400, 0.4);
  }

  jump() {
    const t = this.now();
    if (!t) return;
    this.tone(t, 0.12, 'sine', 260, 520, 0.18);
  }

  wallJump() {
    const t = this.now();
    if (!t) return;
    this.noise(t, 0.06, 'highpass', 2000, 1500, 0.3);
    this.tone(t, 0.14, 'triangle', 300, 700, 0.2);
  }

  rise() {
    const t = this.now();
    if (!t) return;
    this.noise(t, 0.5, 'lowpass', 400, 120, 0.3);
  }

  wave() {
    const t = this.now();
    if (!t) return;
    this.tone(t, 1.2, 'triangle', 110, 105, 0.35, 0.01);
    this.tone(t, 1.2, 'sine', 165, 160, 0.2, 0.01);
  }

  levelComplete() {
    const t = this.now();
    if (!t) return;
    [262, 330, 392, 523].forEach((f, i) => this.tone(t + i * 0.12, 0.35, 'triangle', f, f, 0.25));
  }

  gameOver() {
    const t = this.now();
    if (!t) return;
    [392, 330, 262, 196].forEach((f, i) => this.tone(t + i * 0.22, 0.5, 'sawtooth', f, f * 0.97, 0.12));
  }

  click() {
    const t = this.now();
    if (!t) return;
    this.tone(t, 0.05, 'square', 880, 660, 0.08);
  }

  denied() {
    const t = this.now();
    if (!t) return;
    this.tone(t, 0.15, 'square', 140, 120, 0.12);
  }
}

export const sfx = new Sfx();
