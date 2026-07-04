import type { SaveData, Settings, LevelProgress, LevelData } from './types.ts';
import { SAVE_VERSION, SAVE_KEY } from './types.ts';

export function defaultSettings(): Settings {
  return {
    sound: true,
    reducedMotion: false,
    colorBlind: false,
    interferencePreview: true
  };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    unlocked: [],
    completed: [],
    progress: {},
    settings: defaultSettings(),
    hasSeenIntro: false,
    hasSeenHelp: false
  };
}

export function loadSave(levels?: LevelData[]): SaveData {
  try {
    // One-time migration from the old (copy-pasted) save key. Copy only — the
    // key name collides with game-catalyst on the same GitHub Pages origin,
    // so never delete it. migrateSave() discards any foreign level ids.
    const legacy = localStorage.getItem('catalyst-save');
    if (legacy && !localStorage.getItem(SAVE_KEY)) {
      localStorage.setItem(SAVE_KEY, legacy);
    }
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return migrateSave(parsed, levels);
  } catch {
    return defaultSave();
  }
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

function migrateSave(raw: Partial<SaveData>, levels?: LevelData[]): SaveData {
  const defaults = defaultSave();
  const version = raw.version ?? 0;
  const settings = { ...defaults.settings, ...(raw.settings || {}) };
  const progress: Record<string, LevelProgress> = {};

  if (version >= SAVE_VERSION && raw.progress) {
    Object.assign(progress, raw.progress);
  }

  // normalize: any completed level must be unlocked
  const completed = Array.from(new Set<string>(raw.completed || []));
  const unlockedSet = new Set<string>(['dish1']);

  // Recompute the linear unlock chain from completed levels.
  if (levels && levels.length > 0) {
    for (const completedId of completed) {
      const idx = levels.findIndex((l) => l.id === completedId);
      if (idx !== -1) {
        const next = levels[idx + 1];
        if (next) unlockedSet.add(next.id);
      }
    }
  } else {
    // Fallback without levels: keep any existing legitimate unlocks.
    for (const id of raw.unlocked || []) unlockedSet.add(id);
  }

  return {
    version: SAVE_VERSION,
    unlocked: Array.from(unlockedSet),
    completed,
    progress,
    settings,
    hasSeenIntro: raw.hasSeenIntro ?? false,
    hasSeenHelp: raw.hasSeenHelp ?? false
  };
}

export function resetSave(): SaveData {
  const fresh = defaultSave();
  saveGame(fresh);
  return fresh;
}

export function recordProgress(
  data: SaveData,
  levelId: string,
  stars: number,
  moves: number
): SaveData {
  const existing = data.progress[levelId] || { completed: false, stars: 0, bestMoves: null };
  existing.completed = true;
  if (stars > existing.stars) existing.stars = stars;
  if (existing.bestMoves === null || moves < existing.bestMoves) existing.bestMoves = moves;
  data.progress[levelId] = existing;

  const completedSet = new Set(data.completed);
  completedSet.add(levelId);
  data.completed = Array.from(completedSet);

  const unlockedSet = new Set(data.unlocked);
  unlockedSet.add(levelId);
  data.unlocked = Array.from(unlockedSet);

  return data;
}

export function unlockNext(data: SaveData, levels: LevelData[], levelId: string): SaveData {
  const index = levels.findIndex((l) => l.id === levelId);
  if (index === -1) return data;
  const next = levels[index + 1];
  if (!next) return data;
  const set = new Set(data.unlocked);
  set.add(next.id);
  data.unlocked = Array.from(set);
  return data;
}
