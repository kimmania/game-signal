# End-to-End Smoke Tests

These Node.js scripts use Playwright to verify the production build at `http://localhost:4173/game-signal/`.

## Requirements

- The Chromium executable path defaults to the Playwright cache installed by the user. Override with `PW_CHROMIUM_PATH`.
- Override the base URL with `SIGNAL_BASE_URL`.

## Running

Start the preview server from the project root:

```bash
npm run build
npx vite preview --port 4173
```

Then in another terminal:

```bash
cd e2e
node playwright_smoke.mjs
node smoke_new_tiers.mjs
node smoke_resonance_charge.mjs
node smoke_resonance_global.mjs
```
