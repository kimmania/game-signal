import type { Band, BandColor, Tower } from './types.ts';

export type MoveEvent = 'amplified' | 'interference' | 'resolved' | 'unlocked' | 'resonance' | null;

export const RESONANCE_STACKS_REQUIRED = 3;

export interface TransferResult {
  moved: number;
  interference: boolean;
  event: MoveEvent;
  charge: boolean;
}

export function cloneTower(t: Tower): Tower {
  return {
    bands: t.bands.map((b) => ({ ...b })),
    dampened: t.dampened
  };
}

export function cloneTowers(towers: Tower[]): Tower[] {
  return towers.map(cloneTower);
}

function topBlock(tower: Tower): Band[] {
  const { bands } = tower;
  if (bands.length === 0) return [];
  const top = bands[bands.length - 1];
  if (top.noisy || top.locked) return top.locked ? [] : [top];
  if (top.amplified) return [top];
  const block: Band[] = [top];
  for (let i = bands.length - 2; i >= 0; i--) {
    const b = bands[i];
    if (b.noisy || b.amplified || b.locked || b.color !== top.color) break;
    block.push(b);
  }
  return block.reverse(); // bottom to top order
}

function topBlockLength(tower: Tower): number {
  return topBlock(tower).length;
}

export function canTransfer(src: Tower, dst: Tower, dstCapacity: number): boolean {
  if (src.bands.length === 0) return false;
  const srcTop = src.bands[src.bands.length - 1];
  if (srcTop.noisy || srcTop.locked) return false;
  const room = dstCapacity - dst.bands.length;
  if (room <= 0) return false;
  // Empty towers and towers topped by interference are both valid destinations.
  if (dst.bands.length === 0 || dst.bands[dst.bands.length - 1].noisy) return true;
  // Mismatch intentionally allowed to create interference.
  return true;
}

export function willCreateInterference(src: Tower, dst: Tower): boolean {
  if (src.bands.length === 0) return false;
  if (dst.bands.length === 0) return false;
  const srcTop = src.bands[src.bands.length - 1];
  if (srcTop.noisy || srcTop.locked) return false;
  const dstTop = dst.bands[dst.bands.length - 1];
  if (dstTop.noisy || dstTop.locked) return false;
  if (dst.dampened) return false;
  return srcTop.color !== dstTop.color;
}

/** Classify a destination for move-preview indicators while a source tower is selected. */
export type DestinationHint = 'good' | 'warn' | 'full' | null;

export function destinationHint(src: Tower, dst: Tower, dstCapacity: number): DestinationHint {
  if (src.bands.length === 0) return null;
  const srcTop = src.bands[src.bands.length - 1];
  if (srcTop.noisy || srcTop.locked) return null;
  if (dst.bands.length >= dstCapacity) return 'full';
  if (dst.bands.length === 0) return 'good';
  const dstTop = dst.bands[dst.bands.length - 1];
  if (dstTop.noisy) {
    const second = dst.bands[dst.bands.length - 2];
    // Resolvable interference pair is a good target; otherwise neutral stacking.
    if (second && second.noisy && (srcTop.color === dstTop.color || srcTop.color === second.color)) return 'good';
    return null;
  }
  if (dstTop.locked) {
    return srcTop.color === dstTop.color ? 'good' : null;
  }
  if (srcTop.color === dstTop.color) return 'good';
  if (dst.dampened) return null;
  return 'warn';
}

export function transferBands(
  src: Tower,
  dst: Tower,
  dstCapacity: number
): TransferResult {
  if (!canTransfer(src, dst, dstCapacity)) return { moved: 0, interference: false, event: null, charge: false };
  const blockLen = topBlockLength(src);
  const room = dstCapacity - dst.bands.length;
  const count = Math.min(blockLen, room);
  if (count <= 0) return { moved: 0, interference: false, event: null, charge: false };
  const moving = src.bands.splice(src.bands.length - count, count);
  const dstTop = dst.bands[dst.bands.length - 1];
  const interference = dst.bands.length > 0 && !dst.dampened && !dstTop.noisy && !dstTop.locked && dstTop.color !== moving[0].color;

  for (const band of moving) {
    band.amplified = false;
  }

  dst.bands.push(...moving);
  // Capture whether this landing created a 2+ clean same-color stack, which generates
  // resonance charge even if compression or dampening changes the board afterwards.
  const charge = topSignalRunLength(dst) >= 2;

  recomputeAfterMove(src);
  const event = recomputeAfterMove(dst, true);

  return { moved: count, interference, event, charge };
}

export function createNoisyPair(topColor: BandColor, bottomColor: BandColor): Band[] {
  return [
    { color: bottomColor, amplified: false, noisy: true, locked: false },
    { color: topColor, amplified: false, noisy: true, locked: false }
  ];
}

function recomputeAfterMove(tower: Tower, justLanded = false): MoveEvent {
  if (tower.bands.length < 2) {
    const only = tower.bands[0];
    if (only && !only.noisy) only.amplified = false;
    return null;
  }

  // 1. Resolve interference: a clean top band whose color matches either band of the noisy pair directly beneath it.
  if (justLanded) {
    const top = tower.bands[tower.bands.length - 1];
    const second = tower.bands[tower.bands.length - 2];
    const third = tower.bands[tower.bands.length - 3];
    if (top && !top.noisy && second && second.noisy && third && third.noisy && (top.color === second.color || top.color === third.color)) {
      tower.bands.splice(tower.bands.length - 3, 3, { color: top.color, amplified: false, noisy: false, locked: false });
      recomputeAfterMove(tower, false);
      return 'resolved';
    }
  }

  const top = tower.bands[tower.bands.length - 1];
  const second = tower.bands[tower.bands.length - 2];
  if (!top || !second) return null;

  // 1b. Unlock: a clean band matching a locked band directly beneath it releases the lock.
  if (justLanded && !top.noisy && second.locked && !second.noisy && top.color === second.color) {
    second.locked = false;
    const after = recomputeAfterMove(tower, false);
    return after ?? 'unlocked';
  }

  // 2. Interference: mismatched adjacent clean bands -> turn top two into noisy pair.
  // Locked bands are shielded and never turn noisy.
  if (!top.noisy && !second.noisy && !top.locked && !second.locked && top.color !== second.color && !tower.dampened) {
    tower.bands.splice(tower.bands.length - 2, 2, ...createNoisyPair(top.color, second.color));
    return 'interference';
  }

  // 3. Amplification / compression: same-color adjacent clean bands compress to one amplified band.
  if (!tower.dampened && !top.noisy && !second.noisy && !second.locked && top.color === second.color) {
    if (compressSameColorTop(tower)) return 'amplified';
  }
  return null;
}

function topSignalRunLength(tower: Tower): number {
  if (tower.bands.length === 0) return 0;
  const top = tower.bands[tower.bands.length - 1];
  if (top.noisy) return 0;
  let count = 1;
  for (let i = tower.bands.length - 2; i >= 0; i--) {
    const b = tower.bands[i];
    if (b.noisy || b.color !== top.color) break;
    count++;
  }
  return count;
}

export function hasAnyLocked(towers: Tower[]): boolean {
  return towers.some((t) => t.bands.some((b) => b.locked));
}

function compressSameColorTop(tower: Tower): boolean {
  // Compress the top contiguous run of equal clean colors into one amplified band.
  const top = tower.bands[tower.bands.length - 1];
  if (!top || top.noisy) return false;
  let runStart = tower.bands.length - 1;
  while (runStart > 0) {
    const cur = tower.bands[runStart];
    const prev = tower.bands[runStart - 1];
    if (prev.noisy || prev.locked || prev.color !== cur.color) break;
    runStart--;
  }
  const count = tower.bands.length - runStart;
  if (count < 2) return false;
  tower.bands.splice(runStart, count, {
    color: top.color,
    amplified: true,
    noisy: false,
    locked: top.locked
  });
  return true;
}

export function canClearPair(tower: Tower): boolean {
  if (tower.bands.length < 2) return false;
  const top = tower.bands[tower.bands.length - 1];
  const second = tower.bands[tower.bands.length - 2];
  return top.noisy && second.noisy && !top.locked;
}

export function clearPair(tower: Tower): { resolvedColor: BandColor; charge: boolean } | null {
  if (!canClearPair(tower)) return null;
  const second = tower.bands[tower.bands.length - 2];
  const resolvedColor = second.color;
  tower.bands.splice(tower.bands.length - 2, 2, {
    color: resolvedColor,
    amplified: false,
    noisy: false,
    locked: false
  });
  const charge = topSignalRunLength(tower) >= 2;
  // Allow the newly resolved clean band to release locks or compress just like a moved band.
  recomputeAfterMove(tower, true);
  return { resolvedColor, charge };
}

export function isWin(towers: Tower[]): boolean {
  for (const tower of towers) {
    if (tower.bands.length === 0) continue;
    const first = tower.bands[0];
    if (first.noisy) return false;
    for (const b of tower.bands) {
      if (b.noisy || b.locked || b.color !== first.color) return false;
    }
  }
  return true;
}

export function hasInterference(towers: Tower[]): boolean {
  for (const tower of towers) {
    if (tower.bands.some((b) => b.noisy)) return true;
  }
  return false;
}
