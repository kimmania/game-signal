import type { BandColor, LevelData, LevelProgress } from './types.ts';
import { COLOR_NAMES } from './types.ts';
import type { GameState } from './state.ts';
import { canClearPair, destinationHint } from './engine.ts';
import { canUndo } from './state.ts';

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
      <div class="sub">Radio-Astronomy Spectrum Sort</div>
      <p class="story-text">
        The year is <strong>1967</strong>. A coronal mass ejection has stripped every dish
        on Earth down to static. You are the lone radio astronomer on the night shift,
        retuning each receiver one spectrum tower at a time.
      </p>
      <p class="story-text">
        <strong>Tap</strong> a tower to select its top frequency band, then <strong>tap another</strong> to transfer it.
        Match bands of the same color and they <strong>amplify</strong> into one clean signal.
        Mix colors and you create <strong>interference</strong> — two noisy bands locked in static.
        Spend a <strong>Clear Signal</strong> charge to burn off a single interference pair.
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
    progress: (id: string) => LevelProgress | undefined,
    onSelect: (level: LevelData) => void,
    onSettings: () => void,
    onHelp: () => void
  ): void {
    this.clear();
    const screen = document.createElement('div');
    screen.id = 'map-screen';

    // Total star count across all levels.
    let totalStars = 0;
    let maxStars = 0;
    for (const era of eras) {
      for (const level of era.levels) {
        totalStars += progress(level.id)?.stars ?? 0;
        maxStars += 3;
      }
    }

    const header = document.createElement('div');
    header.id = 'map-header';
    header.innerHTML = `
      <div class="map-header-row">
        <h2>Receiver Map</h2>
        <div class="map-header-actions">
          <span class="total-stars" aria-label="${totalStars} of ${maxStars} stars earned">★ ${totalStars}/${maxStars}</span>
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
      eraEl.className = `era era-${era.tier}`;

      const eraStars = era.levels.reduce((n, l) => n + (progress(l.id)?.stars ?? 0), 0);
      const eraDone = era.levels.filter((l) => progress(l.id)?.completed).length;

      const name = document.createElement('div');
      name.className = 'era-name';
      name.innerHTML = `
        <span class="era-title">${era.name}</span>
        <span class="era-progress">${eraDone}/${era.levels.length} · ★ ${eraStars}</span>
      `;
      eraEl.appendChild(name);

      const grid = document.createElement('div');
      grid.className = 'level-grid';

      for (const level of era.levels) {
        const prog = progress(level.id);
        const unlocked = isUnlocked(level.id);
        const stars = prog?.stars ?? 0;
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'level-node';
        if (!unlocked) node.classList.add('locked');
        if (stars === 3) node.classList.add('three-star');
        else if (stars > 0) node.classList.add('completed');
        const pips = prog?.completed
          ? `<span class="node-stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`
          : `<span class="node-stars empty" aria-hidden="true"></span>`;
        node.innerHTML = `<span class="node-num">${unlocked ? level.id.replace(/[^0-9]/g, '') : '🔒'}</span>${pips}`;
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
    showHints: boolean,
    onTowerTap: (index: number) => void,
    onUndo: () => void,
    onReset: () => void,
    onClear: () => void,
    onMap: () => void,
    onHelp: () => void,
    onSettings: () => void
  ): void {
    this.clear();

    const wrap = document.createElement('div');
    wrap.id = 'game-screen';

    const top = document.createElement('div');
    top.id = 'top-bar';
    top.innerHTML = `
      <button id="back-btn" class="icon-btn" aria-label="Map">←</button>
      <h1>${state.era}</h1>
      <div class="top-bar-actions">
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

    const goal = document.createElement('div');
    goal.id = 'goal-panel';
    goal.innerHTML = `<span class="goal-label">Receiver Objective</span><span class="goal-text">Each tower must contain only one clean signal color.</span>`;
    wrap.appendChild(goal);

    const board = document.createElement('div');
    board.id = 'board';

    const maxCap = state.capacity;
    const selectedSrc = state.selectedTower !== null ? state.towers[state.selectedTower] : null;
    state.towers.forEach((tower, i) => {
      const t = document.createElement('div');
      t.className = 'tower';
      t.style.setProperty('--tower-cap', String(maxCap));
      if (state.selectedTower === i) t.classList.add('selected');
      if (state.clearSelectedTower === i) t.classList.add('clear-target');
      if (tower.dampened) t.classList.add('dampened');

      // Destination hints while a source tower is selected.
      if (showHints && selectedSrc && state.selectedTower !== i) {
        const hint = destinationHint(selectedSrc, tower, maxCap);
        if (hint === 'good') t.classList.add('dest-good');
        else if (hint === 'warn') t.classList.add('dest-warn');
        else if (hint === 'full') t.classList.add('dest-full');
      }

      if (tower.bands.length === 0) {
        t.innerHTML = `<span class="tower-empty-label">Empty</span>`;
      } else {
        tower.bands.forEach((band, bi) => {
          const b = document.createElement('div');
          b.className = `band ${band.color}`;
          if (band.noisy) b.classList.add('noisy');
          if (band.amplified) b.classList.add('amplified');
          if (band.locked) b.classList.add('locked');
          // Lift the top block visually when this tower is selected.
          if (state.selectedTower === i && bi === tower.bands.length - 1) b.classList.add('lifted');
          // Landing / event animation on the most recent move target.
          if (state.lastMoveTarget === i && bi === tower.bands.length - 1) {
            b.classList.add('just-landed');
            if (state.lastMoveEvent === 'amplified') b.classList.add('just-amplified');
          }
          t.appendChild(b);
        });
      }

      // Status badges as child elements so the dish silhouette (::before/::after) persists.
      if (tower.dampened) {
        const badge = document.createElement('span');
        badge.className = 'tower-badge badge-dampened';
        badge.textContent = '⛨';
        badge.title = 'Shielded: bands never merge or interfere here';
        t.appendChild(badge);
      }
      if (state.clearSelectedTower === i) {
        const badge = document.createElement('span');
        badge.className = 'tower-badge badge-clear';
        badge.textContent = 'Clear';
        t.appendChild(badge);
      }

      t.addEventListener('click', () => onTowerTap(i));
      board.appendChild(t);
    });
    wrap.appendChild(board);

    const controls = document.createElement('div');
    controls.id = 'controls';

    const hasClearable = state.towers.some((t) => canClearPair(t));
    const clearSelectable = state.clearChargesRemaining > 0 && hasClearable;
    const undoable = canUndo(state);

    controls.innerHTML = `
      <button id="undo-btn" class="icon-btn" aria-label="Undo" ${undoable ? '' : 'disabled'}>↶ Undo</button>
      <button id="clear-btn" class="icon-btn ${clearSelectable ? 'active' : 'inactive'}" aria-label="Clear interference" ${clearSelectable ? '' : 'disabled'}>
        ⌁ Clear ${state.clearChargesRemaining}/${state.clearChargesTotal}
      </button>
      <button id="reset-btn" class="icon-btn" aria-label="Reset">↻ Reset</button>
    `;
    wrap.appendChild(controls);

    this.app.appendChild(wrap);

    document.getElementById('undo-btn')?.addEventListener('click', onUndo);
    document.getElementById('reset-btn')?.addEventListener('click', onReset);
    document.getElementById('back-btn')?.addEventListener('click', onMap);
    document.getElementById('help-btn')?.addEventListener('click', onHelp);
    document.getElementById('settings-btn')?.addEventListener('click', onSettings);
    document.getElementById('clear-btn')?.addEventListener('click', onClear);
  }

  showVictory(
    moves: number,
    targetMoves: number,
    stars: number,
    interferenceCreated: number,
    bestMoves: number | null,
    onNext: () => void,
    onReplay: () => void,
    onMap: () => void
  ): void {
    let starHint = '';
    if (stars === 1) {
      starHint = `Finish in ${targetMoves} moves or fewer for more stars.`;
    } else if (stars === 2) {
      starHint = interferenceCreated > 0
        ? 'Finish under target without creating any interference for ★★★.'
        : `Finish in ${targetMoves} moves or fewer for ★★★.`;
    } else {
      starHint = 'A flawless pass — clean signal, no interference.';
    }
    this.showModal('Signal Restored', `
      <div class="victory-wave" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="stars" aria-label="${stars} stars">
        <span class="${stars >= 1 ? 'earned' : ''}">★</span>
        <span class="${stars >= 2 ? 'earned' : ''}">★</span>
        <span class="${stars >= 3 ? 'earned' : ''}">★</span>
      </div>
      <p class="star-hint">${starHint}</p>
      <p>This receiver is tuned. You aligned the bands in <strong>${moves}</strong> moves. Target was <strong>${targetMoves}</strong>.</p>
      ${bestMoves !== null ? `<p>Best pass: <strong>${bestMoves}</strong> moves</p>` : ''}
      <div class="modal-actions">
        <button id="victory-map" class="btn btn-secondary">Map</button>
        <button id="victory-replay" class="btn btn-secondary">Replay</button>
        <button id="victory-next" class="btn btn-primary">Next Receiver</button>
      </div>
    `);
    document.getElementById('victory-map')?.addEventListener('click', () => { this.hideModal(); onMap(); });
    document.getElementById('victory-replay')?.addEventListener('click', () => { this.hideModal(); onReplay(); });
    document.getElementById('victory-next')?.addEventListener('click', () => { this.hideModal(); onNext(); });
  }

  showHelp(onClose: () => void): void {
    this.showModal('Signal Guide', `
      <p><strong>Signal</strong> is a radio-spectrum sorting puzzle. Tap a tower to select its top band, then tap another tower to move it.</p>

      <p class="help-caption">Stack matching colors and they compress into one amplified band, saving tower space.</p>
      <div class="help-example" aria-label="Matching red bands compress into one amplified red band">
        <div class="mini-tower" style="height:44px;"><div class="mini-band red"></div><div class="mini-band red"></div></div>
        <div class="mini-arrow">+</div>
        <div class="mini-tower" style="height:44px;"><div class="mini-band red"></div></div>
        <div class="mini-arrow">→</div>
        <div class="mini-tower"><div class="mini-band red amplified"></div></div>
      </div>

      <p class="help-caption">Drop any color onto an existing color and it creates <strong>interference</strong> — two noisy static bands. Add either matching color on top to resolve it.</p>
      <div class="help-example" aria-label="Red dropped on amber makes two noisy bands, then resolving red on top turns it into an amplified red band">
        <div class="mini-tower" style="height:40px;"><div class="mini-band amber"></div></div>
        <div class="mini-arrow">+</div>
        <div class="mini-tower" style="height:40px;"><div class="mini-band red"></div></div>
        <div class="mini-arrow">→</div>
        <div class="mini-tower" style="height:54px;"><div class="mini-band amber"></div><div class="mini-band noisy"></div><div class="mini-band noisy"></div></div>
        <div class="mini-arrow">+</div>
        <div class="mini-tower" style="height:40px;"><div class="mini-band red"></div></div>
        <div class="mini-arrow">→</div>
        <div class="mini-tower"><div class="mini-band amber"></div><div class="mini-band red amplified"></div></div>
      </div>

      <p class="help-caption">While a tower is selected, the other receivers show what a move there would do.</p>
      <div class="help-example help-example-hints" aria-label="Green outline means a safe merge, amber outline means interference, dim means full">
        <div class="mini-tower hint-good" style="height:44px;"><div class="mini-band red"></div></div>
        <div class="mini-hint-label good">merge</div>
        <div class="mini-tower hint-warn" style="height:44px;"><div class="mini-band amber"></div></div>
        <div class="mini-hint-label warn">static</div>
        <div class="mini-tower hint-full" style="height:44px;"><div class="mini-band cyan"></div><div class="mini-band cyan"></div><div class="mini-band violet"></div></div>
        <div class="mini-hint-label full">full</div>
      </div>

      <ul class="help-list">
        <li>Only the top run of matching color is picked up as one block.</li>
        <li>You can deliberately mismatch to free space; that creates interference.</li>
        <li>You may drop a band onto an interference pair if its color matches either noisy band.</li>
        <li>When two or more towers have interference, tap <strong>Clear</strong>, then tap the tower to clear.</li>
        <li>Empty towers show an <strong>Empty</strong> label — useful staging areas.</li>
        <li><strong>⛨ Shielded</strong> towers (Deep Space Network / Pulsar Core) never merge or interfere — pure staging space.</li>
        <li><strong>🔒 Encrypted</strong> bands (Exoplanet Hunter / Pulsar Core) can't be picked up until you stack their matching color on top.</li>
      </ul>

      <p>Each level has a <strong>target move count</strong>. Hit it without creating any interference for 3 stars.</p>

      <div class="modal-actions">
        <button id="close-help" class="btn btn-primary">Copy that</button>
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
          <label for="setting-preview">Move Preview Hints</label>
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
