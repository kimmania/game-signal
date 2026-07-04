let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function unlockAudio(): void {
  const c = getCtx();
  if (c.state === 'suspended') {
    c.resume();
  }
}

export function listenForAudioUnlock(): void {
  const unlock = () => {
    unlockAudio();
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}

export function setMuted(v: boolean): void {
  muted = v;
}

export function isMuted(): boolean {
  return muted;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', vol = 0.12, slideTo?: number): void {
  if (muted) return;
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo !== undefined) {
    o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);
  }
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + duration + 0.02);
}

export function playTransfer(): void {
  playTone(440, 0.18, 'triangle', 0.1, 660);
}

export function playInvalid(): void {
  playTone(140, 0.16, 'sawtooth', 0.1, 80);
}

export function playResonance(): void {
  playTone(523, 0.12, 'square');
  setTimeout(() => playTone(659, 0.14, 'square'), 90);
  setTimeout(() => playTone(784, 0.18, 'square'), 180);
}

export function playAmplify(): void {
  playTone(523, 0.22, 'sine', 0.12, 784);
  setTimeout(() => playTone(784, 0.3, 'sine', 0.12, 1046), 90);
}

export function playInterference(): void {
  playTone(100, 0.2, 'sawtooth', 0.12, 60);
}

export function playClear(): void {
  playTone(880, 0.35, 'sine', 0.12, 1760);
}

export function playWin(): void {
  [523, 659, 784, 1046].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.4, 'sine', 0.12), i * 120);
  });
}

export function playUndo(): void {
  playTone(330, 0.15, 'triangle', 0.1, 220);
}

export function playButton(): void {
  playTone(600, 0.08, 'square', 0.08, 400);
}
