/**
 * Tiny synthesised sound effects (Web Audio), so the game needs no audio files.
 * The audio context is created on the first key press / click (browsers require a gesture).
 */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicGain: GainNode | null = null;
  private musicKind: 'menu' | 'game' | null = null;
  private musicTimer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  /** 0..1, raised by the game as waves get harder. */
  intensity = 0;
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
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.55;
      this.musicGain.connect(this.master);
      if (this.musicKind) this.startMusicLoop();
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

  // ---- music: a tiny generative loop scheduled ahead on the audio clock ----

  playMusic(kind: 'menu' | 'game' | null) {
    if (kind === this.musicKind) return;
    this.musicKind = kind;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (kind && this.ctx) this.startMusicLoop();
  }

  private startMusicLoop() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.musicKind || ctx.state !== 'running') return;
    const spb = this.musicKind === 'menu' ? 0.6 : 0.3; // seconds per step
    while (this.nextBeat < ctx.currentTime + 0.2) {
      if (this.musicKind === 'menu') this.menuStep(this.nextBeat, this.beat);
      else this.gameStep(this.nextBeat, this.beat);
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private mnote(t: number, freq: number, dur: number, type: OscillatorType, vol: number, cutoff = 1200) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private mnoise(t: number, dur: number, vol: number, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.musicGain!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private menuStep(t: number, b: number) {
    // slow, eerie: drone every bar + sparse minor-pentatonic plucks
    const A = 55;
    if (b % 8 === 0) {
      this.mnote(t, A, 5, 'sawtooth', 0.05, 300);
      this.mnote(t, A * 1.5, 5, 'sine', 0.04);
    }
    const scale = [220, 261.6, 293.7, 329.6, 392, 440];
    if (Math.random() < 0.45) this.mnote(t, scale[Math.floor(Math.random() * scale.length)], 1.4, 'triangle', 0.05, 2000);
  }

  private gameStep(t: number, b: number) {
    // driving pulse; more layers as intensity grows
    const step = b % 16;
    const bass = [55, 55, 55, 55, 65.4, 65.4, 49, 49];
    if (step % 4 === 0) this.mnote(t, 52, 0.25, 'sine', 0.28, 200); // kick
    if (step % 2 === 0) this.mnote(t, bass[Math.floor(step / 2)], 0.28, 'sawtooth', 0.07, 420);
    if (this.intensity > 0.2 && step % 2 === 1) this.mnoise(t, 0.05, 0.05, 6000);
    if (this.intensity > 0.5 && (step === 4 || step === 12)) this.mnoise(t, 0.15, 0.09, 1500); // snare-ish
    if (this.intensity > 0.75 && step % 4 === 2) this.mnote(t, 440 * (step === 2 ? 1 : 1.19), 0.12, 'square', 0.025, 1800);
  }

  block() {
    const t = this.now();
    if (!t) return;
    // metallic clang
    this.tone(t, 0.25, 'square', 1250, 1150, 0.12);
    this.tone(t, 0.3, 'triangle', 1870, 1800, 0.1);
    this.noise(t, 0.08, 'highpass', 4000, 3000, 0.3);
  }

  guardBreak() {
    const t = this.now();
    if (!t) return;
    this.noise(t, 0.25, 'bandpass', 2500, 400, 0.5, 2);
    this.tone(t, 0.3, 'sawtooth', 600, 120, 0.15);
  }

  flip() {
    const t = this.now();
    if (!t) return;
    this.noise(t, 0.35, 'bandpass', 400, 1800, 0.35, 2);
  }

  thunder() {
    const t = this.now();
    if (!t) return;
    this.noise(t, 2.2, 'lowpass', 300, 60, 0.6, 0.7);
    this.noise(t + 0.1, 1.4, 'lowpass', 900, 100, 0.25);
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
