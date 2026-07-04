import type { Tower, LevelData } from './types.ts';
import { COLORS } from './types.ts';

const TIERS = ['dish', 'array', 'dsn', 'hunter', 'pulsar'] as const;
type Tier = (typeof TIERS)[number];

interface TierSpec {
  name: string;
  colors: number;
  towers: number;
  capacity: number;
  clearCharges: number;
  /** Base scramble length for level 1; ramps up across the tier. */
  scrambleBase: number;
  count: number;
}

const TIER_SPECS: Record<Tier, TierSpec> = {
  dish: {
    name: 'Dawn Dish',
    colors: 4,
    towers: 6,
    capacity: 4,
    clearCharges: 2,
    scrambleBase: 12,
    count: 15
  },
  array: {
    name: 'VLA Array',
    colors: 5,
    towers: 8,
    capacity: 4,
    clearCharges: 2,
    scrambleBase: 18,
    count: 15
  },
  dsn: {
    name: 'Deep Space Network',
    colors: 6,
    towers: 10,
    capacity: 5,
    clearCharges: 1,
    scrambleBase: 28,
    count: 15
  },
  hunter: {
    name: 'Exoplanet Hunter',
    colors: 6,
    towers: 11,
    capacity: 5,
    clearCharges: 1,
    scrambleBase: 34,
    count: 15
  },
  pulsar: {
    name: 'Pulsar Core',
    colors: 6,
    towers: 13,
    capacity: 6,
    clearCharges: 1,
    scrambleBase: 50,
    count: 10
  }
};

/** Per-level shape within a tier: late levels gain an extra color + tower. */
interface LevelShape {
  colors: number;
  towers: number;
  scrambleMoves: number;
  dampenedTowers: number;
  lockedBands: number;
}

function levelShape(tier: Tier, index: number): LevelShape {
  const spec = TIER_SPECS[tier];
  // Ramp scramble length across the tier: final level scrambles ~2x level 1.
  const scrambleMoves = Math.round(spec.scrambleBase * (1 + index / (spec.count - 1)));
  // Late levels of dish/array add a color + tower so tiers do not feel flat.
  const bumpTierStart = tier === 'dish' ? 9 : tier === 'array' ? 9 : spec.colors;
  const bump = index >= bumpTierStart && spec.colors < COLORS.length ? 1 : 0;
  const colors = Math.min(COLORS.length, spec.colors + bump);
  const towers = spec.towers + bump;
  // DSN introduces dampened (shielded) towers from level 4 onward;
  // Pulsar uses dampened towers from the start, ramping to 2 in the back half.
  const dampenedTowers = tier === 'pulsar'
    ? (index >= 5 ? 2 : 1)
    : tier === 'dsn' && index >= 3
      ? 1
      : 0;
  // Hunter introduces encrypted (locked) bands from level 3 onward, two from level 7.
  // Pulsar keeps two locked bands at all times.
  const lockedBands = tier === 'pulsar'
    ? 2
    : tier === 'hunter'
      ? (index >= 6 ? 2 : index >= 2 ? 1 : 0)
      : 0;
  return { colors, towers, scrambleMoves, dampenedTowers, lockedBands };
}

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

function makeSolvedState(shape: LevelShape, capacity: number): Tower[] {
  const towers: Tower[] = [];
  const colors = COLORS.slice(0, shape.colors);
  for (const color of colors) {
    towers.push({
      // amplified:true during scrambling forces single-band moves (rawTopBlock
      // stops at amplified bands); flags are stripped before the level is returned.
      bands: Array.from({ length: capacity - 1 }, () => ({
        color,
        amplified: true,
        noisy: false,
        locked: false
      })),
      dampened: false
    });
  }
  while (towers.length < shape.towers) {
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

/** Scramble transfer (inverse of the forward pour): a block may move onto an empty
 * tower or onto a tower whose top color differs, ensuring colors get mixed. */
function canRawTransfer(src: Tower, dst: Tower, capacity: number): boolean {
  if (src.bands.length === 0) return false;
  const srcTop = src.bands[src.bands.length - 1];
  if (srcTop.noisy || srcTop.locked) return false;
  if (dst.bands.length >= capacity) return false;
  if (dst.bands.length === 0) return true;
  const dstTop = dst.bands[dst.bands.length - 1];
  if (dstTop.noisy || dstTop.locked) return false;
  // Inverse rule: place onto a different color. Same-color moves would simply
  // re-merge solved clusters and leave the board trivial.
  return srcTop.color !== dstTop.color;
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

function rawTransfer(towers: Tower[], src: number, dst: number, capacity: number): number {
  const s = towers[src];
  const d = towers[dst];
  const count = Math.min(rawTopBlock(s), capacity - d.bands.length);
  if (count <= 0) return 0;
  const moving = s.bands.splice(s.bands.length - count, count);
  d.bands.push(...moving);
  return count;
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

/** Reject boards where an entire tower is already one color — that's too close to solved. */
function hasMonochromaticTower(towers: Tower[]): boolean {
  return towers.some((t) => t.bands.length > 1 && t.bands.every((b) => b.color === t.bands[0].color));
}

/** Longest contiguous run of one color in any tower. */
function longestSameColorRun(towers: Tower[]): number {
  let max = 1;
  for (const t of towers) {
    if (t.bands.length < 2) continue;
    let run = 1;
    for (let i = 1; i < t.bands.length; i++) {
      if (t.bands[i].color === t.bands[i - 1].color) {
        run++;
        max = Math.max(max, run);
      } else {
        run = 1;
      }
    }
  }
  return max;
}
/** Lock band(s) that are safe to lock: bottom of a mixed tower, never the top band,
 *  never two locks in one tower, only colors with 2+ other free bands in play,
 *  and only towers with headroom above the lock for staging unlock moves. */
function applyLockedBands(towers: Tower[], lockCount: number, capacity: number, rng: () => number): number {
  let applied = 0;
  const candidates: { tower: number }[] = [];
  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    // Must be mixed, with headroom for a matching band to unlock it.
    if (t.bands.length < 2 || t.bands.length >= capacity) continue;
    const bottom = t.bands[0];
    const freeSameColor = towers.reduce(
      (n, tw) => n + tw.bands.filter((b) => b.color === bottom.color && !b.locked && b !== bottom).length,
      0
    );
    if (freeSameColor >= 2) candidates.push({ tower: i });
  }
  const picked = shuffle(candidates, rng).slice(0, lockCount);
  for (const c of picked) {
    towers[c.tower].bands[0].locked = true;
    applied++;
  }
  return applied;
}

export function generateLevel(tier: Tier, index: number, baseSeed: number): LevelData {
  const spec = TIER_SPECS[tier];
  const shape = levelShape(tier, index);
  // Deterministic but unique seed per level.
  const seed = baseSeed + index * 7919 + tier.length * 53 + tier.charCodeAt(0);
  const rng = makeRng(seed);

  let attempts = 0;
  while (attempts < 2000) {
    attempts++;
    const towers = makeSolvedState(shape, spec.capacity);
    // Burn some RNG so each attempt diverges.
    rng();

    let performed = 0;
    for (let m = 0; m < shape.scrambleMoves; m++) {
      const pair = validMove(towers, spec.capacity, rng);
      if (!pair) break;
      if (rawTransfer(towers, pair[0], pair[1], spec.capacity) > 0) performed++;
    }

    if (performed < shape.scrambleMoves * 0.6) continue;
    if (isTrivial(towers)) continue;
    if (hasCompleteTower(towers, spec.capacity)) continue;
    // Always keep at least one empty staging tower; dampened towers need extra space.
    if (towers.filter((t) => t.bands.length === 0).length < 1 + shape.dampenedTowers + shape.lockedBands) continue;
    // No initially solved monochromatic towers and, ideally, no same-color runs larger than 2.
    if (hasMonochromaticTower(towers)) continue;

    // Scramble which physical tower each cluster lives in.
    let newTowers: Tower[];
    let retry = 0;
    do {
      retry++;
      const nonEmpty = towers.filter((t) => t.bands.length > 0).map(cloneTower);
      const empty = towers.filter((t) => t.bands.length === 0).map(cloneTower);
      const shuffledNonEmpty = shuffle(nonEmpty, rng);
      newTowers = Array.from({ length: towers.length }, () => ({ bands: [], dampened: false }));
      let nonEmptyIdx = 0;
      let emptyIdx = 0;
      for (let i = 0; i < towers.length; i++) {
        newTowers[i] = towers[i].bands.length > 0 ? shuffledNonEmpty[nonEmptyIdx++] : empty[emptyIdx++];
      }
    } while (retry < 30 && (hasMonochromaticTower(newTowers) || longestSameColorRun(newTowers) > 2));

    if (hasMonochromaticTower(newTowers) || longestSameColorRun(newTowers) > 2) continue;

    // Strip the scramble-only amplified flags; boards start with plain bands.
    for (const t of newTowers) {
      for (const b of t.bands) b.amplified = false;
    }

    // Tier mechanics: shielded (dampened) staging towers and encrypted (locked) bands.
    if (shape.dampenedTowers > 0) {
      const emptyIndices = newTowers.map((t, i) => (t.bands.length === 0 ? i : -1)).filter((i) => i !== -1);
      for (let d = 0; d < Math.min(shape.dampenedTowers, emptyIndices.length); d++) {
        newTowers[emptyIndices[d]].dampened = true;
      }
      if (newTowers.filter((t) => t.dampened).length < shape.dampenedTowers) continue;
    }
    if (shape.lockedBands > 0) {
      const lockedApplied = applyLockedBands(newTowers, shape.lockedBands, spec.capacity, rng);
      if (lockedApplied < shape.lockedBands) continue;
    }

    // Target derived from the actual scramble length: reversing the scramble solves it,
    // with slack for staging moves. Locked bands need an extra placement each.
    const lockedApplied = newTowers.reduce((n, t) => n + t.bands.filter((b) => b.locked).length, 0);
    const targetMoves = Math.max(8, Math.round(performed * 1.25) + lockedApplied * 2);

    return {
      id: `${tier}${index + 1}`,
      name: `${spec.name} ${index + 1}`,
      era: spec.name,
      colors: COLORS.slice(0, shape.colors),
      towers: newTowers,
      capacity: spec.capacity,
      clearCharges: spec.clearCharges,
      targetMoves
    };
  }

  return fallbackLevel(tier, index, baseSeed);
}

function fallbackLevel(tier: Tier, index: number, baseSeed: number): LevelData {
  const spec = TIER_SPECS[tier];
  const shape = levelShape(tier, index);
  const colors = COLORS.slice(0, shape.colors);
  const rng = makeRng(baseSeed + index * 7919 + tier.length * 53 + 9999);
  const towers: Tower[] = Array.from({ length: shape.towers }, () => ({ bands: [], dampened: false }));
  let colorIdx = Math.floor(rng() * colors.length);
  for (let t = 0; t < shape.towers - 1; t++) {
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
    targetMoves: Math.max(8, shape.scrambleMoves)
  };
}

export { TIERS, TIER_SPECS };
export type { Tier, TierSpec };
