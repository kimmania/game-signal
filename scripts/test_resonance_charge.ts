import { createGameState, selectTower, useResonancePulse, canTriggerResonancePulse } from '../src/state.ts';
import type { LevelData } from '../src/types.ts';

const level: LevelData = {
  id: 'resonance-charge',
  name: 'Resonance Charge',
  era: 'Test',
  colors: ['red', 'amber', 'green', 'cyan', 'violet', 'white'],
  capacity: 5,
  clearCharges: 0,
  targetMoves: 20,
  towers: [
    { bands: [{ color: 'red', amplified: false, noisy: false, locked: true }], dampened: false },
    { bands: [{ color: 'amber', amplified: false, noisy: false, locked: true }], dampened: false },
    { bands: [{ color: 'red', amplified: false, noisy: false, locked: false }, { color: 'red', amplified: false, noisy: false, locked: false }], dampened: false },
    { bands: [], dampened: false },
    { bands: [{ color: 'amber', amplified: false, noisy: false, locked: false }, { color: 'amber', amplified: false, noisy: false, locked: false }], dampened: false },
    { bands: [], dampened: false },
    { bands: [{ color: 'green', amplified: false, noisy: false, locked: false }, { color: 'green', amplified: false, noisy: false, locked: false }], dampened: false },
    { bands: [], dampened: false }
  ]
};

const state = createGameState(level.id, level.era, level.capacity, level.towers, level.clearCharges, level.targetMoves, level.colors);

for (const [src, dst] of [[2, 3], [4, 5], [6, 7]]) {
  selectTower(state, src);
  const out = selectTower(state, dst);
  if (out.kind === 'rejected') throw new Error(`move ${src}->${dst} rejected`);
}

if (state.resonanceCharge !== 3) throw new Error(`Expected 3 charges, got ${state.resonanceCharge}`);
if (!canTriggerResonancePulse(state)) throw new Error('pulse should be ready');
if (!useResonancePulse(state)) throw new Error('pulse activation failed');
if (state.towers.some((t) => t.bands.some((b) => b.locked))) throw new Error('locked bands remain');

console.log('RESONANCE_CHARGE_OK');
