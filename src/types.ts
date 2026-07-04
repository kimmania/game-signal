export type BandColor = 'red' | 'amber' | 'green' | 'cyan' | 'violet' | 'white';

export interface Band {
  color: BandColor;
  amplified: boolean;
  noisy: boolean;
  locked: boolean;
}

export interface Tower {
  bands: Band[];
  dampened: boolean;
}

export interface LevelData {
  id: string;
  name: string;
  era: string;
  towers: Tower[];
  capacity: number;
  clearCharges: number;
  targetMoves: number;
  colors: BandColor[];
}

export interface LevelProgress {
  completed: boolean;
  stars: number;
  bestMoves: number | null;
}

export interface SaveData {
  version: number;
  unlocked: string[];
  completed: string[];
  progress: Record<string, LevelProgress>;
  settings: Settings;
  hasSeenIntro: boolean;
  hasSeenHelp: boolean;
}

export interface Settings {
  sound: boolean;
  reducedMotion: boolean;
  colorBlind: boolean;
  interferencePreview: boolean;
}

export interface GameStateSnapshot {
  towers: Tower[];
  clearChargesRemaining: number;
  moves: number;
  interferenceCreated: number;
}

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'signal-save';
export const COLORS: BandColor[] = ['red', 'amber', 'green', 'cyan', 'violet', 'white'];
export const COLOR_NAMES: Record<BandColor, string> = {
  red: 'Infrared Red',
  amber: 'Amber Microwave',
  green: 'Green Visible',
  cyan: 'Cyan X-Ray',
  violet: 'Violet Gamma',
  white: 'White Noise'
};
