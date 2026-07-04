import type { BandColor, Tower } from './types.ts';
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

function pseudoRandom(seed: number): number {
  let s = seed | 0;
  s = Math.imul(s, 0x85EBCA6B) >>> 0;
  s ^= s >>> 13;
  s = Math.imul(s, 0xC2B2AE35) >>> 0;
  s ^= s >>> 16;
  return s / 0xFFFFFFFF;
}

function makeSolvedState(spec: TierSpec): Tower[] {
  const towers: Tower[] = [];
  const colors = COLORS.slice(0, spec.colors);
  // Each color gets a dedicated tower.
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
  // One empty tower minimum; remaining towers empty.
  while (towers.length < spec.towers) {
    towers.push({ bands: [], dampened: false });
  }
  return towers;
}

function validMove(towers: Tower[], capacity: number): [number, number] {
  const indices: [number, number][] = [];
  for (let s = 0; s < towers.length; s++) {
    for (let d = 0; d < towers.length; d++) {
      if (s === d) continue;
      if (canRawTransfer(towers[s], towers[d], capacity)) indices.push([s, d]);
    }
  }
  if (indices.length === 0) return [-1, -1];
  return indices[Math.floor(Math.random() * indices.length)];
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
  let allEmptyOrUniform = true;
  for (const t of towers) {
    if (t.bands.length === 0) continue;
    const first = t.bands[0].color;
    if (t.bands.some((b) => b.color !== first)) allEmptyOrUniform = false;
  }
  return allEmptyOrUniform;
}

export function generateLevel(tier: Tier, index: number, baseSeed: number): {
  id: string;
  era: string;
  colors: BandColor[];
  towers: Tower[];
  capacity: number;
  clearCharges: number;
  targetMoves: number;
} {
  const spec = TIER_SPECS[tier];
  const seed = baseSeed + index * 7919;
  let attempts = 0;
  while (attempts < 200) {
    attempts++;
    const towers = makeSolvedState(spec);
    const rng = pseudoRandom(seed + attempts);
    const moves = Math.max(8, Math.floor(rng * spec.targetMoves * 0.8) + Math.floor(spec.targetMoves * 0.4));

    for (let m = 0; m < moves; m++) {
      const pair = validMove(towers, spec.capacity);
      if (pair[0] < 0) break;
      rawTransfer(towers, pair[0], pair[1], spec.capacity);
    }

    if (isTrivial(towers)) continue;

    let hasSingleColorStart = false;
    for (const t of towers) {
      if (t.bands.length === spec.capacity && t.bands.every((b, _, arr) => b.color === arr[0].color)) {
        hasSingleColorStart = true;
        break;
      }
    }
    if (hasSingleColorStart) continue;

    return {
      id: `${tier}${index + 1}`,
      era: spec.name,
      colors: COLORS.slice(0, spec.colors),
      towers,
      capacity: spec.capacity,
      clearCharges: spec.clearCharges,
      targetMoves: spec.targetMoves
    };
  }
  return fallbackLevel(tier, index);
}

function fallbackLevel(tier: Tier, index: number) {
  const spec = TIER_SPECS[tier];
  const colors = COLORS.slice(0, spec.colors);
  const towers: Tower[] = Array.from({ length: spec.towers }, () => ({ bands: [], dampened: false }));
  let colorIdx = 0;
  for (let t = 0; t < spec.towers - 1; t++) {
    const towerLen = Math.min(spec.capacity - 1, spec.colors - (t % 2));
    for (let i = 0; i < towerLen; i++) {
      const color = colors[colorIdx % colors.length];
      towers[t].bands.push({ color, amplified: false, noisy: false, locked: false });
      colorIdx++;
    }
  }
  return {
    id: `${tier}${index + 1}`,
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
