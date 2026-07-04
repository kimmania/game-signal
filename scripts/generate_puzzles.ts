import { generateLevel, TIERS, TIER_SPECS } from '../src/generator.ts';
import type { LevelData } from '../src/types.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(import.meta.dirname, '..', 'public', 'puzzles');
mkdirSync(outDir, { recursive: true });

function genSet(): LevelData[] {
  const levels: LevelData[] = [];
  const baseSeed = 1967;
  for (const tier of TIERS) {
    const spec = TIER_SPECS[tier];
    for (let i = 0; i < spec.count; i++) {
      levels.push(generateLevel(tier, i, baseSeed));
    }
  }
  return levels;
}

const levels = genSet();

// Save a single bank file for the game
writeFileSync(join(outDir, 'levels.json'), JSON.stringify(levels, null, 2));

// verify unique ids
const ids = new Set<string>();
for (const l of levels) {
  if (ids.has(l.id)) throw new Error(`Duplicate level id: ${l.id}`);
  ids.add(l.id);
}

console.log(`Generated ${levels.length} levels across ${TIERS.length} eras.`);
