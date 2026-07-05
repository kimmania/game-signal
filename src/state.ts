import type { BandColor, GameStateSnapshot, Tower } from './types.ts';
import type { MoveEvent } from './engine.ts';
import { isWin, canClearPair, clearPair, canTransfer, transferBands, cloneTowers, hasAnyLocked, RESONANCE_STACKS_REQUIRED } from './engine.ts';

export interface GameState {
  levelId: string;
  era: string;
  capacity: number;
  towers: Tower[];
  clearChargesTotal: number;
  clearChargesRemaining: number;
  moves: number;
  targetMoves: number;
  undoStack: GameStateSnapshot[];
  interferenceCreated: number;
  selectedTower: number | null;
  clearSelectedTower: number | null;
  lastMoveTarget: number | null;
  lastMoveEvent: MoveEvent;
  completed: boolean;
  colors: BandColor[];
  resonanceCharge: number;
  resonancePulseUsed: boolean;
  resonancePulseReady: boolean;
}

export type MoveOutcome =
  | { kind: 'selected' }
  | { kind: 'deselected' }
  | { kind: 'rejected' }
  | { kind: 'moved'; event: MoveEvent; interference: boolean };

export function createGameState(
  levelId: string,
  era: string,
  capacity: number,
  towers: Tower[],
  clearCharges: number,
  targetMoves: number,
  colors: BandColor[]
): GameState {
  return {
    levelId,
    era,
    capacity,
    towers: cloneTowers(towers),
    clearChargesTotal: clearCharges,
    clearChargesRemaining: clearCharges,
    moves: 0,
    targetMoves,
    undoStack: [],
    interferenceCreated: 0,
    selectedTower: null,
    clearSelectedTower: null,
    lastMoveTarget: null,
    lastMoveEvent: null,
    completed: false,
    colors,
    resonanceCharge: 0,
    resonancePulseUsed: false,
    resonancePulseReady: false
  };
}

export function snapshot(state: GameState): GameStateSnapshot {
  return {
    towers: cloneTowers(state.towers),
    clearChargesRemaining: state.clearChargesRemaining,
    moves: state.moves,
    interferenceCreated: state.interferenceCreated,
    resonanceCharge: state.resonanceCharge,
    resonancePulseUsed: state.resonancePulseUsed
  };
}

export function pushUndo(state: GameState): void {
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.undoStack.push(snapshot(state));
}

export function canUndo(state: GameState): boolean {
  return state.undoStack.length > 0;
}

export function undo(state: GameState): boolean {
  if (state.undoStack.length === 0) return false;
  const prev = state.undoStack.pop()!;
  state.towers = prev.towers;
  state.clearChargesRemaining = prev.clearChargesRemaining;
  state.moves = prev.moves;
  state.interferenceCreated = prev.interferenceCreated;
  state.resonanceCharge = prev.resonanceCharge;
  state.resonancePulseUsed = prev.resonancePulseUsed;
  updateResonancePulse(state);
  state.selectedTower = null;
  state.clearSelectedTower = null;
  state.lastMoveTarget = null;
  state.lastMoveEvent = null;
  state.completed = isWin(state.towers);
  return true;
}

export function resetSelection(state: GameState): void {
  state.selectedTower = null;
  state.clearSelectedTower = null;
}

export function selectTower(state: GameState, index: number): MoveOutcome {
  if (state.completed) return { kind: 'rejected' };
  if (state.selectedTower === null) {
    const tower = state.towers[index];
    if (tower.bands.length === 0) return { kind: 'rejected' };
    const top = tower.bands[tower.bands.length - 1];
    if (top.noisy || top.locked) return { kind: 'rejected' };
    state.selectedTower = index;
    return { kind: 'selected' };
  }
  if (state.selectedTower === index) {
    state.selectedTower = null;
    return { kind: 'deselected' };
  }
  const src = state.towers[state.selectedTower];
  const dst = state.towers[index];

  if (!canTransfer(src, dst, state.capacity)) {
    state.selectedTower = null;
    return { kind: 'rejected' };
  }

  pushUndo(state);
  const result = transferBands(src, dst, state.capacity);
  if (result.moved === 0) {
    // Should not happen after canTransfer, but never count a non-move.
    state.undoStack.pop();
    state.selectedTower = null;
    return { kind: 'rejected' };
  }
  state.moves++;
  if (result.interference) {
    state.interferenceCreated++;
  }
  if (result.charge && state.resonanceCharge < RESONANCE_STACKS_REQUIRED && !state.resonancePulseUsed) {
    state.resonanceCharge = Math.min(RESONANCE_STACKS_REQUIRED, state.resonanceCharge + result.charge);
  }
  // Matching clean signals sometimes restores a Clear Signal charge (up to the level max).
  if (result.charge && Math.random() < 0.5 && state.clearChargesRemaining < state.clearChargesTotal) {
    state.clearChargesRemaining++;
  }
  updateResonancePulse(state);
  state.selectedTower = null;
  state.lastMoveTarget = index;
  state.lastMoveEvent = result.event;
  state.completed = isWin(state.towers);
  return { kind: 'moved', event: result.event, interference: result.interference };
}

export function clearableTowerIndex(state: GameState): number | null {
  for (let i = 0; i < state.towers.length; i++) {
    if (canClearPair(state.towers[i])) return i;
  }
  return null;
}

export function useClearSignal(state: GameState): boolean {
  if (state.completed) return false;
  const index = state.clearSelectedTower ?? clearableTowerIndex(state);
  if (index === null || !canClearPair(state.towers[index])) return false;
  state.clearSelectedTower = null;
  pushUndo(state);
  const clearResult = clearPair(state.towers[index]);
  if (!clearResult) return false;
  state.clearChargesRemaining--;
  state.moves++;
  if (clearResult.charge && state.resonanceCharge < RESONANCE_STACKS_REQUIRED && !state.resonancePulseUsed) {
    state.resonanceCharge = Math.min(RESONANCE_STACKS_REQUIRED, state.resonanceCharge + clearResult.charge);
  }
  // A resolved interference pair that also forms a 2-stack can restore a Clear Signal charge.
  if (clearResult.charge && Math.random() < 0.5 && state.clearChargesRemaining < state.clearChargesTotal) {
    state.clearChargesRemaining++;
  }
  updateResonancePulse(state);
  state.lastMoveTarget = index;
  state.lastMoveEvent = 'resolved';
  state.completed = isWin(state.towers);
  return true;
}

export function resetGame(state: GameState, initialTowers: Tower[]): void {
  state.towers = cloneTowers(initialTowers);
  state.clearChargesRemaining = state.clearChargesTotal;
  state.moves = 0;
  state.interferenceCreated = 0;
  state.resonanceCharge = 0;
  state.resonancePulseUsed = false;
  state.resonancePulseReady = false;
  state.undoStack = [];
  state.selectedTower = null;
  state.clearSelectedTower = null;
  state.lastMoveTarget = null;
  state.lastMoveEvent = null;
  state.completed = false;
}

export function hasAnyClearablePair(state: GameState): boolean {
  return state.towers.some((t) => canClearPair(t));
}

function updateResonancePulse(state: GameState): void {
  state.resonancePulseReady =
    state.resonanceCharge >= RESONANCE_STACKS_REQUIRED &&
    !state.resonancePulseUsed &&
    hasAnyLocked(state.towers);
}

export function canTriggerResonancePulse(state: GameState): boolean {
  updateResonancePulse(state);
  return state.resonancePulseReady;
}

export function useResonancePulse(state: GameState): boolean {
  if (!canTriggerResonancePulse(state)) return false;
  let unlockedAny = false;
  for (const tower of state.towers) {
    for (const b of tower.bands) {
      if (b.locked) {
        b.locked = false;
        unlockedAny = true;
      }
    }
  }
  if (!unlockedAny) return false;
  pushUndo(state);
  state.resonancePulseUsed = true;
  state.lastMoveTarget = null;
  state.lastMoveEvent = 'resonance';
  updateResonancePulse(state);
  state.completed = isWin(state.towers);
  return true;
}

export function calculateStars(state: GameState): number {
  if (!state.completed) return 0;
  if (state.moves > state.targetMoves) return 1;
  if (state.interferenceCreated === 0) return 3;
  return 2;
}
