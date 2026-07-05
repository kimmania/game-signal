# Game Signal

A space-radio, color-sorting puzzle PWA. Tune the receivers, stack matching frequencies, clear interference, and unlock encrypted signals.

## Play

The game is a static PWA. The easiest way to run it locally:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/game-signal/`).

For a production build:

```bash
npm run build
npm run preview
```

## Objective

Each tower is a radio receiver. The goal is to tune every tower so it contains **one clean signal color** with no interference. You win when each tower is either empty or monochromatic.

## Controls

- **Tap a tower** to select its top block of bands.
- **Tap another tower** to move that block there.
- **Undo** if you make a mistake.
- **Clear** burns one interference pair when you have charges available.

Only the top run of matching color is picked up as a single block.

## Mechanics

- **Amplify** — Drop a band on another band of the same color and they compress into one amplified band, saving space.
- **Interference** — Drop a band on a different color and both turn into noisy static. Drop either matching color on top to resolve the pair back into one amplified band.
- **Shielded towers** — Bands never merge or interfere here. Useful as pure staging space.
- **Encrypted bands** — Locked bands can't be picked up until their matching color is stacked on top.
- **Resonance** — When any tower ends with **2 matching clean bands**, it emits a signal pulse that unlocks every encrypted band on the whole board, regardless of color.

## Era progression

The map is organized into five eras. Each era introduces or combines mechanics:

1. **Dawn Dish** (15 levels) — fundamentals: amplify and interference.
2. **VLA Array** (15 levels) — tighter capacity and more colors.
3. **Deep Space Network** (15 levels) — adds shielded towers.
4. **Exoplanet Hunter** (15 levels) — adds encrypted bands.
5. **Pulsar Core** (10 levels) — shielded towers, encrypted bands, and the highest capacity.

Stars are awarded for finishing under the target move count and without creating interference.

## Regenerating puzzles

Puzzle banks are committed static assets. To regenerate `public/puzzles/levels.json`:

```bash
npm run generate-puzzles
```

Then verify with:

```bash
npx tsc --noEmit
npm run build
```

## Tech stack

- TypeScript
- Vite + `vite-plugin-pwa`
- Vanilla DOM (no framework)
