import type { Tower, LevelData } from './types.ts';
import { COLORS } from './types.ts';

const TIERS = ['dish', 'array', 'dsn', 'hunter'] as const;
type Tier = (typeof TIERS)[number];

interface TierSpec {
  name: string;
  colors: number;
  towers: number;
  capacity: number;
  clearCharges: number;
  targetMoves: number;
  count: number;
}

const TIER_SPECS: Record<Tier, TierSpec> = {
  dish: {
    name: '1960s Dish',
    colors: 3,
    towers: 5,
    capacity: 4,
    clearCharges: 2,
    targetMoves: 12,
    count: 10
  },
  array: {
    name: '1980s Array',
    colors: 4,
    towers: 7,
    capacity: 4,
    clearCharges: 2,
    targetMoves: 24,
    count: 10
  },
  dsn: {
    name: 'Deep Space Network',
    colors: 5,
    towers: 9,
    capacity: 5,
    clearCharges: 1,
    targetMoves: 45,
    count: 10
  },
  hunter: {
    name: 'Exoplanet Hunter',
    colors: 6,
    towers: 11,
    capacity: 5,
    clearCharges: 1,
    targetMoves: 70,
    count: 10
  }
};

function makeRng(seed: number) {
  let s = seed >>> 0;
  if (s === 0) s = 12345;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xFFFFFFFF;
  };
}

function cloneTower(t: Tower): Tower {
  return {
    bands: t.bands.map((b) => ({ ...b })),
    dampened: t.dampened
  };
}

function makeSolvedState(spec: TierSpec): Tower[] {
  const towers: Tower[] = [];
  const colors = COLORS.slice(0, spec.colors);
  for (const color of colors) {
    towers.push({
      bands: Array.from({ length: spec.capacity - 1 }, () => ({
        color,
        amplified: true,
        noisy: false,
        locked: false
      })),
      dampened: false
    });
  }
  while (towers.length < spec.towers) {
    towers.push({ bands: [], dampened: false });
  }
  return towers;
}

function shuffle<T>(array: T[], rng: () => number): T[] {
  const arr = array.map((x) => x);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canRawTransfer(src: Tower, dst: Tower, capacity: number): boolean {
  if (src.bands.length === 0) return false;
  if (src.bands[src.bands.length - 1].noisy) return false;
  if (dst.bands.length >= capacity) return false;
  if (dst.bands.length === 0) return true;
  const dstTop = dst.bands[dst.bands.length - 1];
  if (dstTop.noisy) return false;
  const srcTop = src.bands[src.bands.length - 1];
  return srcTop.color === dstTop.color;
}

function validMove(towers: Tower[], capacity: number, rng: () => number): [number, number] | null {
  const indices: [number, number][] = [];
  for (let s = 0; s < towers.length; s++) {
    for (let d = 0; d < towers.length; d++) {
      if (s === d) continue;
      if (canRawTransfer(towers[s], towers[d], capacity)) indices.push([s, d]);
    }
  }
  if (indices.length === 0) return null;
  return indices[Math.floor(rng() * indices.length)];
}

function rawTopBlock(tower: Tower): number {
  const { bands } = tower;
  if (bands.length === 0) return 0;
  let count = 1;
  const top = bands[bands.length - 1];
  for (let i = bands.length - 2; i >= 0; i--) {
    const b = bands[i];
    if (b.color !== top.color || b.noisy || b.amplified || b.locked) break;
    count++;
  }
  return count;
}

function rawTransfer(towers: Tower[], src: number, dst: number, capacity: number): void {
  const s = towers[src];
  const d = towers[dst];
  const count = Math.min(rawTopBlock(s), capacity - d.bands.length);
  if (count <= 0) return;
  const moving = s.bands.splice(s.bands.length - count, count);
  d.bands.push(...moving);
}

function isTrivial(towers: Tower[]): boolean {
  let mixed = false;
  for (const t of towers) {
    if (t.bands.length === 0) continue;
    const first = t.bands[0].color;
    if (t.bands.some((b) => b.color !== first)) mixed = true;
  }
  return !mixed;
}

function hasCompleteTower(towers: Tower[], capacity: number): boolean {
  return towers.some((t) => t.bands.length === capacity && t.bands.every((b, _, arr) => b.color === arr[0].color));
}

export function generateLevel(tier: Tier, index: number, baseSeed: number): LevelData {
  const spec = TIER_SPECS[tier];
  // Deterministic but unique seed per level.
  const seed = baseSeed + index * 7919 + tier.length * 53 + tier.charCodeAt(0);
  const rng = makeRng(seed);

  let attempts = 0;
  while (attempts < 300) {
    attempts++;
    const towers = makeSolvedState(spec);
    // Burn some RNG so each attempt diverges.
    rng();
    const moves = Math.max(10, Math.floor(rng() * spec.targetMoves * 0.7) + Math.floor(spec.targetMoves * 0.3));

    for (let m = 0; m < moves; m++) {
      const pair = validMove(towers, spec.capacity, rng);
      if (!pair) break;
      rawTransfer(towers, pair[0], pair[1], spec.capacity);
    }

    if (isTrivial(towers)) continue;
    if (hasCompleteTower(towers, spec.capacity)) continue;

    // Scramble which physical tower each cluster lives in.
    const nonEmpty = towers.filter((t) => t.bands.length > 0).map(cloneTower);
    const empty = towers.filter((t) => t.bands.length === 0).map(cloneTower);
    const shuffledNonEmpty = shuffle(nonEmpty, rng);
    const newTowers: Tower[] = Array.from({ length: towers.length }, () => ({ bands: [], dampened: false }));
    let nonEmptyIdx = 0;
    let emptyIdx = 0;
    for (let i = 0; i < towers.length; i++) {
      newTowers[i] = towers[i].bands.length > 0 ? shuffledNonEmpty[nonEmptyIdx++] : empty[emptyIdx++];
    }

    return {
      id: `${tier}${index + 1}`,
      name: `${spec.name} ${index + 1}`,
      era: spec.name,
      colors: COLORS.slice(0, spec.colors),
      towers: newTowers,
      capacity: spec.capacity,
      clearCharges: spec.clearCharges,
      targetMoves: spec.targetMoves
    };
  }

  return fallbackLevel(tier, index, baseSeed);
}

function fallbackLevel(tier: Tier, index: number, baseSeed: number): LevelData {
  const spec = TIER_SPECS[tier];
  const colors = COLORS.slice(0, spec.colors);
  const rng = makeRng(baseSeed + index * 7919 + tier.length * 53 + 9999);
  const towers: Tower[] = Array.from({ length: spec.towers }, () => ({ bands: [], dampened: false }));
  let colorIdx = Math.floor(rng() * colors.length);
  for (let t = 0; t < spec.towers - 1; t++) {
    const towerLen = 2 + Math.floor(rng() * (spec.capacity - 1));
    for (let i = 0; i < towerLen; i++) {
      const color = colors[colorIdx % colors.length];
      towers[t].bands.push({ color, amplified: false, noisy: false, locked: false });
      colorIdx++;
    }
  }
  return {
    id: `${tier}${index + 1}`,
    name: `${spec.name} ${index + 1}`,
    era: spec.name,
    colors,
    towers,
    capacity: spec.capacity,
    clearCharges: spec.clearCharges,
    targetMoves: spec.targetMoves
  };
}

export { TIERS, TIER_SPECS };
export type { Tier, TierSpec };
