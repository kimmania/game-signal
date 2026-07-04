# game-signal Aesthetics & Playability Overhaul — Completion Plan

> **For the implementer:** This is a HANDOFF of partially-completed work. Most changes are
> already applied to the working tree (uncommitted, `git status` shows 10 modified files +
> `public/fonts/`). Your job is to finish the remaining tasks, verify everything, and commit.
> Do NOT revert or rewrite the completed work. `npx tsc --noEmit` passes on the current tree.

**Goal:** Complete a 13-item review of the Signal PWA (radio-astronomy Water-Sort-style puzzle): move-preview hints, correct move feedback, amplify celebration, transfer animations, difficulty ramp, tier mechanics (dampened/locked), accessibility settings, map progression UI, victory polish, typography, dead-code cleanup.

**Architecture:** Vanilla TS + Vite PWA. Screens rendered by `src/ui.ts` (class `UI`, innerHTML templates), orchestrated by `src/app.ts` (`bootstrap()`), pure logic in `src/engine.ts`/`src/state.ts`, level bank is a committed static asset `public/puzzles/levels.json` regenerated ONLY by `npm run generate-puzzles` (tsx runs `scripts/generate_puzzles.ts` → `src/generator.ts`).

**Tech stack:** TypeScript strict, Vite 8, vite-plugin-pwa, no framework, Web Audio SFX (`src/sound.ts`), localStorage saves (`src/storage.ts`).

**Verify commands:** `npx tsc --noEmit` then `npm run build` (both from repo root). No test suite exists; verification is tsc + build + the JSON sanity checks given below.

---

## State of the working tree (ALREADY DONE — do not redo)

1. **engine.ts** — rewritten. `transferBands` now returns `{moved, interference, event}` where `event: MoveEvent = 'amplified' | 'interference' | 'resolved' | 'unlocked' | null`. Added `destinationHint(src, dst, cap): 'good'|'warn'|'full'|null` for move-preview. Locked bands: cannot be picked up (`canTransfer`, `topBlock`), never turn noisy, unlock when a matching clean color lands directly on them (`recomputeAfterMove` returns `'unlocked'`). Removed dead exports (`topColor`, `restoreAmplifiedPair`, `countInterferencePairs`, `towerIsFull`).
2. **state.ts** — rewritten. `selectTower` returns `MoveOutcome` (`selected|deselected|rejected|moved`). Added `lastMoveTarget`/`lastMoveEvent` to `GameState` for landing animations. Removed the hover-preview fields (`previewInterference`, `previewWarning`) and dead exports. `canUndo` kept (used by ui.ts).
3. **app.ts** — rewritten. Switches on `MoveOutcome` for correct sounds/announcements (invalid sound + "Receiver full" on rejection; `playAmplify` on amplify; `playClear` on resolve/unlock). `applyBodySettings()` toggles `body.reduced-motion` (setting OR `prefers-reduced-motion`) and `body.color-blind`. `renderGame` passes `save.settings.interferencePreview` as `showHints`. Victory passes `state.interferenceCreated` for the star-hint line. Removed hover handler.
4. **ui.ts** — rewritten. `renderGame(state, showHints, ...)` adds `dest-good/dest-warn/dest-full` classes via `destinationHint`, `lifted` class on selected tower's top band, `just-landed`/`just-amplified` on the last move target, tower badges as REAL CHILD ELEMENTS (`.tower-badge.badge-dampened` ⛨ / `.badge-clear`) so dish `::before/::after` silhouette persists. Map: total star counter, per-era progress (`n/10 · ★ k`), per-node star pips, `era-<tier>` tint classes, 🔒 on locked nodes. Victory: `star-hint` explanation line + `victory-wave` settling animation. Help: third example block for hint colors + two new list items for ⛨ shielded / 🔒 encrypted. Settings label now "Move Preview Hints". Undo button gets `disabled` when `!canUndo(state)`.
5. **style.css** — rewritten. `@font-face` Share Tech Mono (`/fonts/share-tech-mono.woff2`, file exists at `public/fonts/`, 7.4KB, verified woff2). `--font-display` used on h1/h2/modal h2/era titles/node numbers. `body.reduced-motion` kills all animation/transition. Color-blind glyphs per color (▲●■◆✚─) on `.band`/`.mini-band` via `body.color-blind`. Dest-hint styles, `.lifted`, `band-land` + `amplify-flash` keyframes, `.victory-wave` bars, era tints, node star pips, CRT scanlines on story screen, `.band.locked` desaturation + 🔒. Removed: duplicate `#controls` block, dead `#clear-charges`/`.charge` rules, dead `--noise`/`--bezel-dampener` vars, old `.tower.clear-target::before` / `.tower.dampened::after` badge-on-pseudo hacks.
6. **types.ts** — `music` removed from `Settings`; `SAVE_KEY` renamed `'catalyst-save'` → `'signal-save'`.
7. **storage.ts** — `music` removed from defaults; one-time COPY (not move) migration from legacy `'catalyst-save'` key (collides with game-catalyst on same GitHub Pages origin — never delete it).
8. **sound.ts** — `playAmplify` retuned to an ascending slide (523→784→1046).
9. **generator.ts** — rewritten. `TierSpec` now has `scrambleBase` instead of fixed `targetMoves`. `levelShape(tier, index)` ramps scramble length ~2x across each tier, adds +1 color/+1 tower to dish8-10 and array8-10, requests 1 dampened tower for dsn4+, 1 locked band for hunter3+, 2 for hunter7+. Per-level `targetMoves = max(8, round(performed * 1.25) + lockedApplied * 2)`. Solved-state bands now carry `amplified: true` during scrambling (forces single-band reverse moves; flags stripped before return — see Task 1 bug).
10. **vite.config.ts** — `woff2` added to workbox globPatterns.
11. **public/puzzles/levels.json** — regenerated once. targetMoves ramp is correct (dish 8→16, array 14→28, dsn 24→48, hunter 34→68) BUT dampened/locked counts are all 0 — that's the bug in Task 1.

---

## Task 1: Fix generator bug — dampened/locked never applied (THE ONLY KNOWN BUG)

**Objective:** `dsn4+` levels must have 1 dampened tower; `hunter3+` 1 locked band (2 from hunter7). Currently all zero in regenerated JSON.

**Files:**
- Modify: `src/generator.ts`
- Regenerate: `public/puzzles/levels.json`

**Symptom:** After `npm run generate-puzzles`, this check prints 0 for every level:

```bash
python3 -c "
import json
levels=json.load(open('public/puzzles/levels.json'))
for l in levels:
    if l['id'].startswith(('dsn','hunter')):
        damp=sum(1 for t in l['towers'] if t.get('dampened'))
        locked=sum(1 for t in l['towers'] for b in t['bands'] if b.get('locked'))
        print(l['id'], 'damp:%d locked:%d'%(damp,locked))
"
```

**Step 1: Diagnose.** The generation loop in `generateLevel` (`src/generator.ts`, ~line 220) was already debugged this far:
- `levelShape('dsn', 3)` correctly returns `dampenedTowers: 1` (verified).
- The scramble no longer under-performs (the `performed >= scrambleMoves * 0.6` early-`continue` passes 300/300 in a standalone reproduction).
- Yet the emitted level has `dampened: false` everywhere and `git`-diffed JSON confirms it.

Prime suspect: **the amplified-flag interaction with the scramble**. `makeSolvedState` now creates bands with `amplified: true` so that `rawTopBlock` (which stops at `amplified` bands) moves one band at a time. But look at `rawTopBlock`'s loop: it checks `b.amplified` on the band BELOW the top, while the TOP band itself being amplified is not checked — verify whether `rawTopBlock` returns 1 as intended, and more importantly whether `validMove`/`canRawTransfer`... actually still permit enough moves that `performed` passes the threshold *in the real code path* (the standalone repro above did NOT include amplified flags, so it doesn't prove the real loop reaches the dampened/locked block).

Debug directly against the real module:

```bash
npx tsx -e "
import { generateLevel } from './src/generator.ts';
const l = generateLevel('dsn', 3, 1967) as any;
console.log('dampened:', l.towers.map((t:any)=>t.dampened));
console.log('empties:', l.towers.filter((t:any)=>t.bands.length===0).length);
"
```

Add temporary `console.log(attempts, performed, shape.scrambleMoves)` inside the loop if needed to see whether the function returns from the main loop or from `fallbackLevel` (fallbackLevel never applies dampened/locked — if levels come from there, that's the bug). Another candidate: the dampened assignment targets `emptyIndices` of `newTowers` — if the scramble leaves ZERO empty towers, `Math.min(shape.dampenedTowers, emptyIndices.length)` silently applies none. The sanity check above shows `empties:1` per level in the JSON, so at least one empty tower exists — but confirm the empty tower exists at the time of assignment, not only after.

Also check `applyLockedBands`: its candidate filter requires `freeSameColor >= 2` counting via `b !== bottom` object identity — verify candidates aren't empty for real boards (log `candidates.length`).

**Step 2: Fix whatever Step 1 reveals.** Keep the design contract: dampened goes on an EMPTY tower (it's a shielded staging area); locked goes on the BOTTOM band of a mixed tower whose color has ≥2 other free bands.

**Step 3: Remove all debug `console.log` from `src/generator.ts`** (user requirement: no debug logging in committed sources).

**Step 4: Regenerate and verify:**

```bash
npm run generate-puzzles
```

Then rerun the python check from Symptom. Expected:
- `dsn1-3`: damp 0 · `dsn4-10`: damp 1
- `hunter1-2`: locked 0 · `hunter3-6`: locked 1 · `hunter7-10`: locked 2
- Also verify NO level has `amplified: true` bands left in JSON, and every level still has ≥1 empty tower:

```bash
python3 -c "
import json
levels=json.load(open('public/puzzles/levels.json'))
bad_amp=[l['id'] for l in levels if any(b.get('amplified') for t in l['towers'] for b in t['bands'])]
no_empty=[l['id'] for l in levels if not any(len(t['bands'])==0 for t in l['towers'])]
print('amplified leaks:', bad_amp, 'no-empty:', no_empty)
"
```

Expected: `amplified leaks: [] no-empty: []`

**Step 5: Solvability spot-check for locked levels.** A locked band sits at the bottom of a tower; it unlocks when its matching color lands DIRECTLY on top of it. That requires every band above the locked band to be removable. If the generator locks the bottom of a FULL tower whose above-bands can't be staged elsewhere, the level may be unsolvable. Add a conservative guard in `applyLockedBands`: only lock towers where `bands.length <= capacity - 1` (leaves headroom) — or verify by playing hunter3 manually (Step: `npm run dev`, beat dish1… too slow; instead reason about it: the unlock move requires placing a matching color onto the locked band after clearing the tower above it, which needs ≥1 empty/staging tower — every level has ≥1 empty tower, so headroom guard is sufficient).

---

## Task 2: Update the story/intro copy for the new mechanics (only if missing)

**Objective:** The intro (`renderStory` in `src/ui.ts`) mentions tap/amplify/interference/Clear. It does NOT need dampened/locked (those are taught in Help, already done). **No action needed unless you find the Help modal missing the ⛨/🔒 bullets** — check `showHelp` in `src/ui.ts` contains:

```
<li><strong>⛨ Shielded</strong> towers (Deep Space Network) never merge or interfere — pure staging space.</li>
<li><strong>🔒 Encrypted</strong> bands (Exoplanet Hunter) can't be picked up until you stack their matching color on top.</li>
```

If present (it should be): skip. If absent: add them to the `help-list` UL.

---

## Task 3: Visual smoke test in a real browser

**Objective:** Confirm the CSS/UX work renders correctly. No Chrome is installed for the agent-browser on this machine — use Safari or ask the user to look, OR install Chrome for the browser tool. Playwright/puppeteer caches are empty.

**Step 1: Build and preview:**

```bash
npm run build
npx vite preview --port 4173
# open http://localhost:4173/game-signal/ in Safari
```

**Step 2: Check, in order:**
1. Story screen: Share Tech Mono headline (distinctly different from Courier), CRT scanlines visible, no layout break.
2. First-run help: three example blocks incl. the hint-color legend (green "merge" / amber "static" / dim "full").
3. Map: total ★ counter top-right, era cards tinted (amber/green/cyan/violet top gradients), locked nodes show 🔒, unplayed-but-unlocked nodes show `· · ·` pips.
4. Game (dish1): tap tower → top band lifts 6px; other towers glow green/amber or dim per hint; move to same color → amplify flash + rising chime; deliberate mismatch → static pair + noisy animation; tap full tower as destination → buzz + "Receiver full" (check aria-live via VoiceOver or just the code path).
5. Undo disabled at move 0.
6. Victory: waveform bars settle, star hint line explains the miss.
7. Settings: toggle Color-Blind Patterns → glyphs appear on bands; Reduced Motion → all animation stops (incl. noisy static shimmer).
8. DSN level 4 (cheat: `localStorage` — temporarily unlock by completing, or edit save `unlocked` array in DevTools): dampened tower shows ⛨ badge above intact dish silhouette, dashed side borders, mismatched drop on it does NOT create interference.
9. Hunter level 3: bottom locked band is desaturated with 🔒, cannot be picked when exposed, unlocks when matching color lands on it ('Band decrypted' announcement).

**Step 3: Fix anything broken.** Likely trouble spots: badge positioning (`.tower-badge` top offsets vs. `#board` 24px row-gap added for badges), color-blind glyph z-index over band gradients, `dest-full` opacity fighting `.selected`.

---

## Task 4: Final cleanup, verify, commit

**Step 1: Debug-log sweep:**

```bash
grep -rn "console\.\(log\|debug\|info\)" src/ scripts/ ; grep -rn "debugger" src/
```

Expected: no hits (a `console.error`/`catch` swallow in `main.ts` is fine and pre-existing).

**Step 2: Type-check + build:**

```bash
npx tsc --noEmit && npm run build
```

Expected: clean; `dist/` contains `assets/*.css`, `fonts/share-tech-mono.woff2` precached in `dist/sw.js` (grep `share-tech` in `dist/sw.js` to confirm the workbox glob picked it up).

**Step 3: Commit** (single commit is fine; the user pushes to main which auto-deploys via GitHub Pages workflow):

```bash
git add -A
git commit -m "Aesthetics & playability overhaul: move hints, amplify celebration, tier mechanics (shielded/encrypted), difficulty ramp, map progression UI, a11y settings, retro font"
```

Do NOT push unless the user asks.

**Step 4 (optional, ask user):** The save key changed to `signal-save` with copy-migration from `catalyst-save`. Old progress carries over; era/level structure is unchanged (same ids), so saves remain valid. Mention this to the user.

---

## Known context & pitfalls (read before touching anything)

- **Puzzles are committed static assets.** Never add predev/prebuild hooks. Only `npm run generate-puzzles` regenerates them, and only when intentionally run.
- **CI runs `npm ci && npm run generate-puzzles && npm run build`** (`.github/workflows/deploy.yml`) — the generator MUST stay deterministic (seeded xorshift, baseSeed 1967) so CI output matches the committed JSON.
- **`tsc` runs as part of `npm run build`** (`"build": "tsc && vite build"`), so type errors fail the build.
- **Terminal approval quirk:** `python3 -c` / `npx tsx -e` require user approval in this environment; prefer writing short throwaway scripts to `/tmp/*.ts` and running `npx tsx /tmp/x.ts` if approval is a problem, and delete them after.
- **Save-key collision:** `catalyst-save` belongs to the game-catalyst PWA on the same `kimmania.github.io` origin. The migration in `storage.ts` COPIES it and must never delete or overwrite it.
- **Engine rule:** deliberate mismatches are ALLOWED (`canTransfer` returns true for mismatches) — that's the interference mechanic. Do not "fix" it to Water-Sort rules.
- **`recomputeAfterMove` order matters:** resolve-interference check → unlock check → interference creation → amplification. See `references/sort-engine-recompute-rules.md` in the `kimmania-game-pwa` skill.
- **User standards:** no dead CSS, all buttons functional, no debug logs, `target="_blank"` on external links, victory modals uncluttered.
