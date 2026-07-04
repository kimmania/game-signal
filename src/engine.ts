import type { Band, BandColor, Tower } from './types.ts';

export function cloneTower(t: Tower): Tower {
  return {
    bands: t.bands.map((b) => ({ ...b })),
    dampened: t.dampened
  };
}

export function cloneTowers(towers: Tower[]): Tower[] {
  return towers.map(cloneTower);
}

export function topColor(tower: Tower): BandColor | null {
  const top = tower.bands[tower.bands.length - 1];
  return top && !top.noisy ? top.color : null;
}

function topBlock(tower: Tower): Band[] {
  const { bands } = tower;
  if (bands.length === 0) return [];
  const top = bands[bands.length - 1];
  if (top.noisy || top.amplified) return [top];
  const block: Band[] = [top];
  for (let i = bands.length - 2; i >= 0; i--) {
    const b = bands[i];
    if (b.noisy || b.amplified || b.color !== top.color) break;
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
  if (srcTop.noisy) return false;
  const room = dstCapacity - dst.bands.length;
  if (room <= 0) return false;
  if (dst.bands.length === 0) return true;
  const dstTop = dst.bands[dst.bands.length - 1];
  if (dstTop.noisy) return false;
  return srcTop.color === dstTop.color;
}

export function willCreateInterference(src: Tower, dst: Tower): boolean {
  if (src.bands.length === 0) return false;
  if (dst.bands.length === 0) return false;
  const srcTop = src.bands[src.bands.length - 1];
  if (srcTop.noisy) return false;
  const dstTop = dst.bands[dst.bands.length - 1];
  if (dstTop.noisy) return false;
  return srcTop.color !== dstTop.color;
}

export function transferBands(
  src: Tower,
  dst: Tower,
  dstCapacity: number
): { moved: number; interference: boolean } {
  if (!canTransfer(src, dst, dstCapacity)) return { moved: 0, interference: false };
  const blockLen = topBlockLength(src);
  const room = dstCapacity - dst.bands.length;
  const count = Math.min(blockLen, room);
  const moving = src.bands.splice(src.bands.length - count, count);
  const interference = dst.bands.length > 0 && moving.length > 0 && dst.bands[dst.bands.length - 1].color !== moving[0].color;

  for (const band of moving) {
    band.amplified = false;
  }

  dst.bands.push(...moving);
  recomputeAfterMove(src);
  recomputeAfterMove(dst);
  return { moved: count, interference };
}

export function createNoisyPair(topColor: BandColor, bottomColor: BandColor): Band[] {
  return [
    { color: bottomColor, amplified: false, noisy: true, locked: false },
    { color: topColor, amplified: false, noisy: true, locked: false }
  ];
}

function recomputeAfterMove(tower: Tower, justLanded = false): void {
  if (tower.bands.length < 2) {
    // single band is clean unless already noisy
    const only = tower.bands[0];
    if (only) only.amplified = false;
    return;
  }

  const top = tower.bands[tower.bands.length - 1];
  const second = tower.bands[tower.bands.length - 2];

  // 1. Check if a newly-landed clean color matches the top of an existing noisy pair.
  if (justLanded && !top.noisy && second && second.noisy) {
    // The band under the just-landed band should be noisy; pair is the two below landing.
    const third = tower.bands[tower.bands.length - 3];
    if (third && third.noisy) {
      // top is clean landing color; second and third are noisy pair
      if (second.color === top.color || third.color === top.color) {
        tower.bands.splice(tower.bands.length - 3, 3, {
          color: third.color,
          amplified: false,
          noisy: false,
          locked: false
        });
        recomputeAfterMove(tower, false);
        return;
      }
    }
  }

  // 2. Interference: mismatched adjacent clean bands -> turn top two into noisy pair.
  if (!top.noisy && !second.noisy && top.color !== second.color && !tower.dampened) {
    tower.bands.splice(tower.bands.length - 2, 2, ...createNoisyPair(top.color, second.color));
    return;
  }

  // 3. Amplification / compression: same-color adjacent clean bands compress to one amplified band.
  if (!tower.dampened && !top.noisy && !second.noisy && top.color === second.color) {
    compressSameColorTop(tower);
  }
}

function compressSameColorTop(tower: Tower): void {
  // Compress the top contiguous run of equal clean colors into one amplified band.
  const top = tower.bands[tower.bands.length - 1];
  if (!top || top.noisy) return;
  let runStart = tower.bands.length - 1;
  while (runStart > 0) {
    const cur = tower.bands[runStart];
    const prev = tower.bands[runStart - 1];
    if (prev.noisy || prev.locked || prev.color !== cur.color) break;
    runStart--;
  }
  const count = tower.bands.length - runStart;
  if (count < 2) return;
  tower.bands.splice(runStart, count, {
    color: top.color,
    amplified: true,
    noisy: false,
    locked: top.locked
  });
}

export function canClearPair(tower: Tower): boolean {
  if (tower.bands.length < 2) return false;
  const top = tower.bands[tower.bands.length - 1];
  const second = tower.bands[tower.bands.length - 2];
  return top.noisy && second.noisy && !top.locked;
}

export function clearPair(tower: Tower): { resolvedColor: BandColor } | null {
  if (!canClearPair(tower)) return null;
  const second = tower.bands[tower.bands.length - 2];
  const resolvedColor = second.color;
  tower.bands.splice(tower.bands.length - 2, 2, {
    color: resolvedColor,
    amplified: false,
    noisy: false,
    locked: false
  });
  recomputeAfterMove(tower, false);
  return { resolvedColor };
}

export function restoreAmplifiedPair(tower: Tower): void {
  // When a third different color lands on an amplified band, split the amplified band back into two layers.
  if (tower.bands.length < 3) return;
  const top = tower.bands[tower.bands.length - 1];
  const second = tower.bands[tower.bands.length - 2];
  if (!top.noisy && second.amplified) {
    // split second into two clean bands of its color, creating interference with top
    const color = second.color;
    tower.bands.splice(tower.bands.length - 2, 1,
      { color, amplified: false, noisy: false, locked: false },
      { color, amplified: false, noisy: false, locked: false }
    );
    recomputeAfterMove(tower, true);
  }
}

export function isWin(towers: Tower[]): boolean {
  for (const tower of towers) {
    if (tower.bands.length === 0) continue;
    const first = tower.bands[0];
    if (first.noisy) return false;
    for (const b of tower.bands) {
      if (b.noisy || b.color !== first.color) return false;
    }
  }
  return true;
}

export function countInterferencePairs(towers: Tower[]): number {
  let count = 0;
  for (const tower of towers) {
    for (const b of tower.bands) {
      if (b.noisy) count++;
    }
  }
  return Math.floor(count / 2);
}

export function hasInterference(towers: Tower[]): boolean {
  for (const tower of towers) {
    if (tower.bands.some((b) => b.noisy)) return true;
  }
  return false;
}

export function towerIsFull(tower: Tower, capacity: number): boolean {
  return tower.bands.length >= capacity;
}
