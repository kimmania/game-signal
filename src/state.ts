import type { BandColor, GameStateSnapshot, Tower } from './types.ts';
import type { MoveEvent } from './engine.ts';
import { isWin, canClearPair, clearPair, canTransfer, transferBands, cloneTowers } from './engine.ts';

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
    colors
  };
}

export function snapshot(state: GameState): GameStateSnapshot {
  return {
    towers: cloneTowers(state.towers),
    clearChargesRemaining: state.clearChargesRemaining,
    moves: state.moves,
    interferenceCreated: state.interferenceCreated
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
  state.selectedTower = null;
  state.clearSelectedTower = null;
  state.lastMoveTarget = null;
  state.lastMoveEvent = null;
  state.completed = isWin(state.towers);
  return true;
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
  clearPair(state.towers[index]);
  state.clearChargesRemaining--;
  state.moves++;
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

export function calculateStars(state: GameState): number {
  if (!state.completed) return 0;
  if (state.moves > state.targetMoves) return 1;
  if (state.interferenceCreated === 0) return 3;
  return 2;
}
