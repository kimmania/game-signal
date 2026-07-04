import type { BandColor, LevelData } from './types.ts';
import { COLOR_NAMES } from './types.ts';
import type { GameState } from './state.ts';

export type ScreenName = 'story' | 'map' | 'game' | 'help' | 'settings';

export class UI {
  readonly app: HTMLElement;
  readonly aria: HTMLElement;
  currentScreen: ScreenName = 'story';

  constructor() {
    const app = document.getElementById('app');
    const aria = document.getElementById('aria-live');
    if (!app || !aria) throw new Error('Missing #app or #aria-live element');
    this.app = app;
    this.aria = aria;
  }

  announce(msg: string): void {
    this.aria.textContent = msg;
    setTimeout(() => (this.aria.textContent = ''), 1000);
  }

  clear(): void {
    this.app.innerHTML = '';
  }

  setScreen(name: ScreenName): void {
    this.currentScreen = name;
  }

  renderStory(onBegin: () => void): void {
    this.clear();
    const el = document.createElement('div');
    el.id = 'story-screen';
    el.innerHTML = `
      <h1>Signal</h1>
      <div class="sub">Frequency Alignment Puzzle</div>
      <p class="story-text">
        The year is <strong>1967</strong>. A solar flare has scrambled the telemetry from every dish
        at the remote observatory. You are the lone radio astronomer left on the night shift,
        manually retuning each spectrum tower. Align the frequency bands, isolate the signals,
        and bring the data home before dawn.
      </p>
      <p class="story-text">
        <strong>Tap</strong> a tower to select it, then <strong>tap another</strong> to transfer bands.
        Match colors to <strong>amplify</strong>; mismatches create <strong>interference</strong>.
        Use your <strong>Clear Signal</strong> charges wisely.
      </p>
      <button type="button" id="begin-btn" class="btn btn-primary">Enter the Observatory</button>
    `;
    this.app.appendChild(el);
    document.getElementById('begin-btn')?.addEventListener('click', () => {
      onBegin();
    });
  }

  renderMap(
    eras: { name: string; tier: string; levels: LevelData[] }[],
    isUnlocked: (id: string) => boolean,
    progress: (id: string) => { stars: number } | undefined,
    onSelect: (level: LevelData) => void,
    onSettings: () => void,
    onHelp: () => void
  ): void {
    this.clear();
    const screen = document.createElement('div');
    screen.id = 'map-screen';

    const header = document.createElement('div');
    header.id = 'map-header';
    header.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h2>Observatory Map</h2>
        <div style="display:flex;gap:8px;">
          <button id="map-help" class="icon-btn" aria-label="Help">?</button>
          <button id="map-settings" class="icon-btn" aria-label="Settings">⚙</button>
        </div>
      </div>
    `;
    screen.appendChild(header);

    const scroll = document.createElement('div');
    scroll.id = 'map-scroll';

    for (const era of eras) {
      const eraEl = document.createElement('div');
      eraEl.className = 'era';

      const name = document.createElement('div');
      name.className = 'era-name';
      name.textContent = era.name;
      eraEl.appendChild(name);

      const grid = document.createElement('div');
      grid.className = 'level-grid';

      for (const level of era.levels) {
        const prog = progress(level.id);
        const unlocked = isUnlocked(level.id) || level.id.endsWith('1');
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'level-node';
        if (!unlocked) node.classList.add('locked');
        if (prog?.stars === 3) node.classList.add('three-star');
        else if (prog && prog.stars > 0) node.classList.add('completed');
        node.innerHTML = `<span>${level.id.replace(/[^0-9]/g, '')}</span>`;
        if (unlocked) {
          node.addEventListener('click', () => onSelect(level));
        } else {
          node.disabled = true;
        }
        grid.appendChild(node);
      }

      eraEl.appendChild(grid);
      scroll.appendChild(eraEl);
    }

    screen.appendChild(scroll);
    this.app.appendChild(screen);

    document.getElementById('map-help')?.addEventListener('click', onHelp);
    document.getElementById('map-settings')?.addEventListener('click', onSettings);
  }

  renderGame(
    state: GameState,
    onTowerTap: (index: number) => void,
    onTowerHover: (index: number) => void,
    onUndo: () => void,
    onReset: () => void,
    onClear: () => void,
    onMap: () => void,
    onHelp: () => void,
    onSettings: () => void
  ): void {
    this.clear();

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;min-height:100%;min-height:100dvh;';

    const top = document.createElement('div');
    top.id = 'top-bar';
    top.innerHTML = `
      <button id="back-btn" class="icon-btn" aria-label="Map">←</button>
      <h1>${state.era}</h1>
      <div style="display:flex;gap:8px;">
        <button id="help-btn" class="icon-btn" aria-label="Help">?</button>
        <button id="settings-btn" class="icon-btn" aria-label="Settings">⚙</button>
      </div>
    `;
    wrap.appendChild(top);

    const header = document.createElement('div');
    header.id = 'level-header';
    header.innerHTML = `
      <span><strong>${state.levelId.toUpperCase()}</strong> Target ${state.targetMoves} moves</span>
      <span><strong>Moves:</strong> ${state.moves}</span>
    `;
    wrap.appendChild(header);

    const board = document.createElement('div');
    board.id = 'board';

    const maxCap = state.capacity;
    state.towers.forEach((tower, i) => {
      const t = document.createElement('div');
      t.className = 'tower';
      t.style.setProperty('--tower-cap', String(maxCap));
      if (state.selectedTower === i) t.classList.add('selected');
      if (tower.dampened) t.classList.add('dampened');
      if (tower.bands.length === 0) {
        t.innerHTML = `<span class="tower-empty-label">Empty</span>`;
      } else {
        tower.bands.forEach((band) => {
          const b = document.createElement('div');
          b.className = `band ${band.color}`;
          if (band.noisy) b.classList.add('noisy');
          if (band.amplified) b.classList.add('amplified');
          if (band.locked) b.classList.add('locked');
          t.appendChild(b);
        });
      }
      t.addEventListener('pointerenter', () => onTowerHover(i));
      t.addEventListener('click', () => onTowerTap(i));
      board.appendChild(t);
    });
    wrap.appendChild(board);

    const controls = document.createElement('div');
    controls.id = 'controls';

    const charges = Array.from({ length: state.clearChargesTotal }, (_, i) => {
      const active = i < state.clearChargesRemaining;
      return `<span class="charge ${active ? 'active' : ''}" aria-hidden="true"></span>`;
    }).join('');

    controls.innerHTML = `
      <button id="undo-btn" class="icon-btn" aria-label="Undo">↶</button>
      <div id="clear-charges" aria-label="Clear signal charges">
        <span>Clear</span>
        ${charges}
      </div>
      <button id="reset-btn" class="icon-btn" aria-label="Reset">↻</button>
    `;
    wrap.appendChild(controls);

    this.app.appendChild(wrap);

    document.getElementById('undo-btn')?.addEventListener('click', onUndo);
    document.getElementById('reset-btn')?.addEventListener('click', onReset);
    document.getElementById('back-btn')?.addEventListener('click', onMap);
    document.getElementById('help-btn')?.addEventListener('click', onHelp);
    document.getElementById('settings-btn')?.addEventListener('click', onSettings);

    const clearEl = document.getElementById('clear-charges');
    if (clearEl) {
      clearEl.style.cursor = state.clearChargesRemaining > 0 && state.towers.some((t) => t.bands.some((b, idx, arr) => b.noisy && idx > 0 && arr[idx - 1].noisy)) ? 'pointer' : 'default';
      clearEl.addEventListener('click', () => {
        if (state.clearChargesRemaining > 0) onClear();
      });
    }
  }

  showVictory(moves: number, targetMoves: number, stars: number, bestMoves: number | null, onNext: () => void, onReplay: () => void, onMap: () => void): void {
    this.showModal('Level Complete', `
      <div class="stars" aria-label="${stars} stars">
        <span class="${stars >= 1 ? 'earned' : ''}">★</span>
        <span class="${stars >= 2 ? 'earned' : ''}">★</span>
        <span class="${stars >= 3 ? 'earned' : ''}">★</span>
      </div>
      <p>You aligned the signal in <strong>${moves}</strong> moves. Target was <strong>${targetMoves}</strong>.</p>
      ${bestMoves !== null ? `<p>Best ever: <strong>${bestMoves}</strong> moves</p>` : ''}
      <div class="modal-actions">
        <button id="victory-map" class="btn btn-secondary">Map</button>
        <button id="victory-replay" class="btn btn-secondary">Replay</button>
        <button id="victory-next" class="btn btn-primary">Next Level</button>
      </div>
    `);
    document.getElementById('victory-map')?.addEventListener('click', () => { this.hideModal(); onMap(); });
    document.getElementById('victory-replay')?.addEventListener('click', () => { this.hideModal(); onReplay(); });
    document.getElementById('victory-next')?.addEventListener('click', () => { this.hideModal(); onNext(); });
  }

  showHelp(onClose: () => void): void {
    this.showModal('How to Play', `
      <p><strong>Signal</strong> is a spectrum-sorting puzzle. Tap a tower to select it, then tap another tower to transfer the top bands.</p>

      <p class="help-caption">Move all bands of the same color onto one tower to amplify and save space.</p>
      <div class="help-example">
        <div class="mini-tower"><div class="mini-band red"></div></div>
        <div class="mini-tower"><div class="mini-band red"></div><div class="mini-band red"></div></div>
        <div class="mini-tower"><div class="mini-band amber"></div></div>
      </div>

      <p class="help-caption">Mismatched colors cause <strong>interference</strong> (grey static). Resolve it with a matching color on top or spend a <strong>Clear Signal</strong> charge.</p>
      <div class="help-example">
        <div class="mini-tower"><div class="mini-band" style="background:var(--noise)"></div></div>
        <div class="mini-tower" style="height:80px"><div class="mini-band red"></div><div class="mini-band" style="background:var(--noise)"></div></div>
      </div>

      <p>Every level has a <strong>target move count</strong>. Finish within target moves with <strong>no interference</strong> created to earn 3 stars.</p>

      <div class="modal-actions">
        <button id="close-help" class="btn btn-primary">Got it</button>
      </div>
    `);
    document.getElementById('close-help')?.addEventListener('click', () => { this.hideModal(); onClose(); });
  }

  showSettings(
    settings: { sound: boolean; reducedMotion: boolean; colorBlind: boolean; interferencePreview: boolean },
    onChange: (key: string, value: boolean) => void,
    onReset: () => void,
    onClose: () => void
  ): void {
    this.showModal('Settings', `
      <div class="toggles">
        <div class="toggle-row">
          <label for="setting-sound">Sound Effects</label>
          <input type="checkbox" id="setting-sound" ${settings.sound ? 'checked' : ''} />
        </div>
        <div class="toggle-row">
          <label for="setting-motion">Reduced Motion</label>
          <input type="checkbox" id="setting-motion" ${settings.reducedMotion ? 'checked' : ''} />
        </div>
        <div class="toggle-row">
          <label for="setting-colorblind">Color-Blind Patterns</label>
          <input type="checkbox" id="setting-colorblind" ${settings.colorBlind ? 'checked' : ''} />
        </div>
        <div class="toggle-row">
          <label for="setting-preview">Interference Preview</label>
          <input type="checkbox" id="setting-preview" ${settings.interferencePreview ? 'checked' : ''} />
        </div>
      </div>
      <div class="modal-actions">
        <button id="reset-progress" class="btn btn-danger">Reset Progress</button>
        <button id="close-settings" class="btn btn-primary">Done</button>
      </div>
    `);
    const bindToggle = (id: string, key: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      el?.addEventListener('change', () => onChange(key, el.checked));
    };
    bindToggle('setting-sound', 'sound');
    bindToggle('setting-motion', 'reducedMotion');
    bindToggle('setting-colorblind', 'colorBlind');
    bindToggle('setting-preview', 'interferencePreview');
    document.getElementById('reset-progress')?.addEventListener('click', () => { this.hideModal(); onReset(); });
    document.getElementById('close-settings')?.addEventListener('click', () => { this.hideModal(); onClose(); });
  }

  showResetConfirm(onConfirm: () => void, onCancel: () => void): void {
    this.showModal('Reset Level?', `
      <p>Restart this level from the beginning? Your best score will be kept.</p>
      <div class="modal-actions">
        <button id="reset-cancel" class="btn btn-secondary">Cancel</button>
        <button id="reset-confirm" class="btn btn-danger">Reset</button>
      </div>
    `);
    document.getElementById('reset-cancel')?.addEventListener('click', () => { this.hideModal(); onCancel(); });
    document.getElementById('reset-confirm')?.addEventListener('click', () => { this.hideModal(); onConfirm(); });
  }

  showModal(title: string, bodyHtml: string): void {
    const overlay = document.createElement('div');
    overlay.id = 'modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${title}</h2>
        ${bodyHtml}
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideModal();
    });
  }

  hideModal(): void {
    document.getElementById('modal-overlay')?.remove();
  }

  colorLabel(color: BandColor): string {
    return COLOR_NAMES[color];
  }
}
