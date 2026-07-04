import type { LevelData } from './types.ts';
import { COLORS } from './types.ts';
import { createGameState, calculateStars, selectTower, useClearSignal, undo, resetGame, hasAnyClearablePair } from './state.ts';
import type { GameState } from './state.ts';
import { cloneTowers, canClearPair } from './engine.ts';
import { loadSave, saveGame, resetSave, recordProgress, unlockNext } from './storage.ts';
import { UI } from './ui.ts';
import * as sound from './sound.ts';
import { listenForAudioUnlock } from './sound.ts';

let levels: LevelData[] = [];

export async function bootstrap(): Promise<void> {
  const ui = new UI();
  listenForAudioUnlock();

  // load levels
  const res = await fetch('puzzles/levels.json');
  levels = (await res.json()) as LevelData[];

  let save = loadSave(levels);
  let state: GameState | null = null;

  const eras = [
    { name: 'Dawn Dish', tier: 'dish', levels: levels.filter((l) => l.id.startsWith('dish')) },
    { name: 'VLA Array', tier: 'array', levels: levels.filter((l) => l.id.startsWith('array')) },
    { name: 'Deep Space Network', tier: 'dsn', levels: levels.filter((l) => l.id.startsWith('dsn')) },
    { name: 'Exoplanet Hunter', tier: 'hunter', levels: levels.filter((l) => l.id.startsWith('hunter')) },
    { name: 'Pulsar Core', tier: 'pulsar', levels: levels.filter((l) => l.id.startsWith('pulsar')) }
  ];

  sound.setMuted(!save.settings.sound);
  applyBodySettings();

  function applyBodySettings(): void {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.toggle('reduced-motion', save.settings.reducedMotion || prefersReduced);
    document.body.classList.toggle('color-blind', save.settings.colorBlind);
  }

  function startLevel(level: LevelData): void {
    if (!isUnlocked(level.id)) {
      sound.playInvalid();
      ui.announce('Complete earlier levels to restore the signal');
      return;
    }
    state = createGameState(level.id, level.era, level.capacity, level.towers, level.clearCharges, level.targetMoves, level.colors);
    ui.setScreen('game');
    renderGame();
  }

  function isUnlocked(id: string): boolean {
    // Only the very first receiver is online after the flare.
    if (id === 'dish1') return true;
    return save.unlocked.includes(id);
  }

  function showMap(): void {
    ui.setScreen('map');
    ui.renderMap(
      eras,
      (id) => isUnlocked(id),
      (id) => save.progress[id],
      (level) => startLevel(level),
      () => showSettings(),
      () => showHelp()
    );
  }

  function showHelp(): void {
    ui.showHelp(() => {
      if (!save.hasSeenHelp) {
        save.hasSeenHelp = true;
        saveGame(save);
      }
      if (ui.currentScreen === 'story') {
        showMap();
      } else {
        renderGame();
      }
    });
  }

  function showSettings(): void {
    ui.showSettings(
      {
        sound: save.settings.sound,
        reducedMotion: save.settings.reducedMotion,
        colorBlind: save.settings.colorBlind,
        interferencePreview: save.settings.interferencePreview
      },
      (key, value) => {
        switch (key) {
          case 'sound':
            save.settings.sound = value;
            sound.setMuted(!value);
            break;
          case 'reducedMotion':
            save.settings.reducedMotion = value;
            break;
          case 'colorBlind':
            save.settings.colorBlind = value;
            break;
          case 'interferencePreview':
            save.settings.interferencePreview = value;
            break;
        }
        saveGame(save);
        applyBodySettings();
        renderGame();
      },
      () => {
        save = resetSave();
        applyBodySettings();
        showMap();
      },
      () => {
        if (ui.currentScreen === 'game' && state) renderGame();
        else showMap();
      }
    );
  }

  function showIntroOrMap(): void {
    if (!save.hasSeenIntro) {
      save.hasSeenIntro = true;
      saveGame(save);
      ui.setScreen('story');
      ui.renderStory(() => {
        if (!save.hasSeenHelp) showHelp();
        else showMap();
      });
    } else if (!save.hasSeenHelp) {
      showHelp();
    } else {
      showMap();
    }
  }

  function renderGame(): void {
    if (!state) return;
    ui.renderGame(
      state,
      save.settings.interferencePreview,
      (i) => handleTowerTap(i),
      () => handleUndo(),
      () => handleReset(),
      () => handleClear(),
      () => showMap(),
      () => showHelp(),
      () => showSettings()
    );
    if (state.completed) {
      setTimeout(() => handleWin(), 800);
    }
  }

  function handleTowerTap(index: number): void {
    if (!state || state.completed) return;
    sound.unlockAudio();

    // Clear Signal target selection mode: tap a clearable tower to clear it, or tap the same tower to cancel.
    if (state.clearSelectedTower !== null) {
      if (index === state.clearSelectedTower) {
        // Confirm the selected tower and spend the charge.
        if (useClearSignal(state)) {
          sound.playClear();
          renderGame();
        }
        return;
      }
      if (canClearPair(state.towers[index])) {
        state.clearSelectedTower = index;
        sound.playButton();
        renderGame();
        return;
      }
      // Invalid tower tapped while selecting: cancel the selection.
      state.clearSelectedTower = null;
      renderGame();
      return;
    }

    // Directly tapping a clearable tower when no band is selected also enters clear selection.
    if (state.clearChargesRemaining > 0 && canClearPair(state.towers[index]) && state.selectedTower === null) {
      state.clearSelectedTower = index;
      sound.playButton();
      renderGame();
      return;
    }

    const wasSelecting = state.selectedTower === null;
    const outcome = selectTower(state, index);

    switch (outcome.kind) {
      case 'selected':
        sound.playButton();
        break;
      case 'deselected':
        break;
      case 'rejected': {
        sound.playInvalid();
        if (wasSelecting) {
          const tower = state.towers[index];
          if (tower.bands.length === 0) ui.announce('Cannot select empty tower');
          else if (tower.bands[tower.bands.length - 1].locked) ui.announce('Encrypted band — stack its matching color on top to unlock');
          else ui.announce('Noisy bands are locked');
        } else {
          ui.announce('Receiver full');
        }
        break;
      }
      case 'moved':
        if (state.completed) {
          sound.playWin();
        } else if (outcome.event === 'interference') {
          sound.playInterference();
          ui.announce('Interference created');
        } else if (outcome.event === 'resonance') {
          sound.playResonance();
          ui.announce('Resonance unlock');
        } else if (outcome.event === 'amplified') {
          sound.playAmplify();
          ui.announce('Signal amplified');
        } else if (outcome.event === 'resolved') {
          sound.playClear();
          ui.announce('Interference resolved');
        } else if (outcome.event === 'unlocked') {
          sound.playClear();
          ui.announce('Band decrypted');
        } else {
          sound.playTransfer();
        }
        break;
    }

    renderGame();
  }

  function handleClear(): void {
    if (!state) return;
    if (state.clearChargesRemaining <= 0) {
      sound.playInvalid();
      ui.announce('No Clear Signal charges remaining');
      return;
    }
    if (!hasAnyClearablePair(state)) {
      sound.playInvalid();
      ui.announce('No interference pair available to clear');
      return;
    }

    // Always enter target-selection mode. The player taps a clearable tower to confirm.
    sound.unlockAudio();
    ui.announce('Tap a tower with interference to target');
    state.selectedTower = null;
    state.clearSelectedTower = null;
    renderGame();
  }

  function handleUndo(): void {
    if (!state) return;
    if (undo(state)) {
      sound.playUndo();
      renderGame();
    } else {
      sound.playInvalid();
    }
  }

  function handleReset(): void {
    if (!state) return;
    ui.showResetConfirm(
      () => {
        const level = levels.find((l) => l.id === state!.levelId)!;
        resetGame(state!, cloneTowers(level.towers));
        renderGame();
      },
      () => { /* stay */ }
    );
  }

  function handleWin(): void {
    if (!state) return;
    const stars = calculateStars(state);
    const progressBefore = save.progress[state.levelId];
    const bestMoves = progressBefore?.bestMoves ?? null;
    recordProgress(save, state.levelId, stars, state.moves);
    unlockNext(save, levels, state.levelId);
    saveGame(save);

    ui.showVictory(
      state.moves,
      state.targetMoves,
      stars,
      state.interferenceCreated,
      bestMoves,
      () => {
        const nextIndex = levels.findIndex((l) => l.id === state!.levelId) + 1;
        const next = levels[nextIndex];
        if (next) startLevel(next);
        else showMap();
      },
      () => {
        const level = levels.find((l) => l.id === state!.levelId)!;
        startLevel(level);
      },
      () => showMap()
    );
  }

  showIntroOrMap();
}

export { levels, COLORS };
