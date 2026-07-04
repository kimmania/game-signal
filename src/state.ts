import type { BandColor, GameStateSnapshot, Tower } from './types.ts';
import { hasInterference, isWin, canClearPair, clearPair, canTransfer, transferBands } from './engine.ts';
import { cloneTowers } from './engine.ts';

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
  previewInterference: number | null;
  previewWarning: boolean;
  completed: boolean;
  colors: BandColor[];
}

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
    previewInterference: null,
    previewWarning: false,
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
  state.previewInterference = null;
  state.previewWarning = false;
  state.completed = isWin(state.towers);
  return true;
}

export function selectTower(state: GameState, index: number): void {
  if (state.completed) return;
  if (state.selectedTower === null) {
    if (state.towers[index].bands.length === 0) return;
    const top = state.towers[index].bands[state.towers[index].bands.length - 1];
    if (top.noisy) return;
    state.selectedTower = index;
    return;
  }
  if (state.selectedTower === index) {
    state.selectedTower = null;
    state.previewInterference = null;
    state.previewWarning = false;
    return;
  }
  const src = state.towers[state.selectedTower];
  const dst = state.towers[index];

  if (!canTransfer(src, dst, state.capacity)) {
    state.selectedTower = null;
    state.previewInterference = null;
    state.previewWarning = false;
    return;
  }

  pushUndo(state);
  const result = transferBands(src, dst, state.capacity);
  state.moves++;
  if (result.interference) {
    state.interferenceCreated++;
  }
  state.selectedTower = null;
  state.previewInterference = null;
  state.previewWarning = false;
  state.completed = isWin(state.towers);
}

export function previewInterference(state: GameState, dstIndex: number): void {
  if (state.selectedTower === null) {
    state.previewInterference = null;
    state.previewWarning = false;
    return;
  }
  const src = state.towers[state.selectedTower];
  const dst = state.towers[dstIndex];
  if (dst.bands.length === 0) {
    state.previewInterference = null;
    state.previewWarning = false;
  } else if (src.bands.length > 0 && src.bands[src.bands.length - 1].color !== dst.bands[dst.bands.length - 1].color) {
    state.previewInterference = dstIndex;
    state.previewWarning = true;
  } else {
    state.previewInterference = null;
    state.previewWarning = false;
  }
}

export function useClearSignal(state: GameState): boolean {
  if (state.completed) return false;
  let used = false;
  for (let i = 0; i < state.towers.length; i++) {
    if (canClearPair(state.towers[i])) {
      pushUndo(state);
      clearPair(state.towers[i]);
      state.clearChargesRemaining--;
      state.moves++;
      used = true;
      break;
    }
  }
  if (used) state.completed = isWin(state.towers);
  return used;
}

export function resetGame(state: GameState, initialTowers: Tower[]): void {
  state.towers = cloneTowers(initialTowers);
  state.clearChargesRemaining = state.clearChargesTotal;
  state.moves = 0;
  state.interferenceCreated = 0;
  state.undoStack = [];
  state.selectedTower = null;
  state.previewInterference = null;
  state.previewWarning = false;
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

export function hasInterferenceNow(state: GameState): boolean {
  return hasInterference(state.towers);
}
