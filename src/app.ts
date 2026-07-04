import type { LevelData } from './types.ts';
import { COLORS } from './types.ts';
import { createGameState, calculateStars, selectTower, previewInterference, useClearSignal, undo, resetGame, hasAnyClearablePair } from './state.ts';
import type { GameState } from './state.ts';
import { isWin, cloneTowers } from './engine.ts';
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

  let save = loadSave();
  let state: GameState | null = null;
  let currentLevelIndex = 0;

  const eras = [
    { name: '1960s Dish', tier: 'dish', levels: levels.filter((l) => l.id.startsWith('dish')) },
    { name: '1980s Array', tier: 'array', levels: levels.filter((l) => l.id.startsWith('array')) },
    { name: 'Deep Space Network', tier: 'dsn', levels: levels.filter((l) => l.id.startsWith('dsn')) },
    { name: 'Exoplanet Hunter', tier: 'hunter', levels: levels.filter((l) => l.id.startsWith('hunter')) }
  ];

  sound.setMuted(!save.settings.sound);

  function startLevel(level: LevelData): void {
    if (!isUnlocked(level.id)) {
      sound.playInvalid();
      ui.announce('Complete earlier levels to unlock');
      return;
    }
    state = createGameState(level.id, level.era, level.capacity, level.towers, level.clearCharges, level.targetMoves, level.colors);
    currentLevelIndex = levels.findIndex((l) => l.id === level.id);
    ui.setScreen('game');
    renderGame();
  }

  function isUnlocked(id: string): boolean {
    // First level of every tier is always available for challenge/practice
    if (id.match(/^(dish|array|dsn|hunter)1$/)) return true;
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
        renderGame();
      },
      () => {
        save = resetSave();
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
      (i) => handleTowerTap(i),
      (i) => handleTowerHover(i),
      () => handleUndo(),
      () => handleReset(),
      () => handleClear(),
      () => showMap(),
      () => showHelp(),
      () => showSettings()
    );
    if (state.completed) {
      handleWin();
    }
  }

  function handleTowerTap(index: number): void {
    if (!state || state.completed) return;
    sound.unlockAudio();
    if (state.selectedTower === null) {
      const tower = state.towers[index];
      if (tower.bands.length === 0) {
        sound.playInvalid();
        ui.announce('Cannot select empty tower');
        return;
      }
      const top = tower.bands[tower.bands.length - 1];
      if (top.noisy) {
        sound.playInvalid();
        ui.announce('Noisy bands are locked');
        return;
      }
      sound.playButton();
      state.selectedTower = index;
      renderGame();
      return;
    }

    const src = state.towers[state.selectedTower];
    const dst = state.towers[index];

    if (index === state.selectedTower) {
      state.selectedTower = null;
      state.previewInterference = null;
      state.previewWarning = false;
      renderGame();
      return;
    }

    if (src.bands.length === 0) {
      state.selectedTower = null;
      return;
    }

    // Player is allowed to deliberately mismatch to create interference.
    if (dst.bands.length > 0 && !dst.bands[dst.bands.length - 1].noisy && src.bands[src.bands.length - 1].color !== dst.bands[dst.bands.length - 1].color) {
      if (save.settings.interferencePreview && !window.confirm('This move will create interference. Continue?')) {
        state.selectedTower = null;
        state.previewInterference = null;
        state.previewWarning = false;
        renderGame();
        return;
      }
    }

    const beforeInterference = hasAnyClearablePair(state);
    selectTower(state, index);
    const createdInterference = !beforeInterference && hasAnyClearablePair(state) && !isWin(state.towers);

    if (state.moves > 0 && state.completed) {
      sound.playWin();
    } else if (createdInterference) {
      sound.playInterference();
    } else {
      sound.playTransfer();
    }

    renderGame();
  }

  function handleTowerHover(index: number): void {
    if (!state) return;
    if (save.settings.interferencePreview && state.selectedTower !== null) {
      previewInterference(state, index);
      // We don't re-render the whole board on hover; rely on cursor / subtle CSS if needed.
      // For now preview is internal; visual shake could be added here.
    }
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
    sound.unlockAudio();
    if (useClearSignal(state)) {
      sound.playClear();
      renderGame();
      if (state.completed) {
        handleWin();
      }
    }
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
        const level = levels[currentLevelIndex];
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
    unlockNext(save, state.levelId);
    saveGame(save);

    ui.showVictory(
      state.moves,
      state.targetMoves,
      stars,
      bestMoves,
      () => {
        const next = levels[currentLevelIndex + 1];
        if (next) startLevel(next);
        else showMap();
      },
      () => {
        const level = levels[currentLevelIndex];
        startLevel(level);
      },
      () => showMap()
    );
  }

  showIntroOrMap();
}

export { levels, COLORS };
