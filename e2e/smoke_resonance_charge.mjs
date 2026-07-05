import { chromium } from 'playwright';

const chromiumPath = process.env.PW_CHROMIUM_PATH ?? '/Users/kmann/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const baseURL = process.env.SIGNAL_BASE_URL ?? 'http://localhost:4173/game-signal/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();

  await context.route('**/puzzles/levels.json', async (route) => {
    const response = await route.fetch();
    const levels = await response.json();
    levels.push({
      id: 'hunter99',
      name: 'Hunter 99',
      era: 'Exoplanet Hunter',
      colors: ['red', 'amber', 'green', 'cyan', 'violet', 'white'],
      capacity: 5,
      clearCharges: 0,
      targetMoves: 20,
      towers: [
        { bands: [{ color: 'red', amplified: false, noisy: false, locked: true }], dampened: false },
        { bands: [{ color: 'amber', amplified: false, noisy: false, locked: true }], dampened: false },
        { bands: [{ color: 'red', amplified: false, noisy: false, locked: false }, { color: 'red', amplified: false, noisy: false, locked: false }], dampened: false },
        { bands: [], dampened: false },
        { bands: [{ color: 'amber', amplified: false, noisy: false, locked: false }, { color: 'amber', amplified: false, noisy: false, locked: false }], dampened: false },
        { bands: [], dampened: false },
        { bands: [{ color: 'green', amplified: false, noisy: false, locked: false }, { color: 'green', amplified: false, noisy: false, locked: false }], dampened: false },
        { bands: [], dampened: false }
      ]
    });
    await route.fulfill({ response, body: JSON.stringify(levels) });
  });

  await page.goto(baseURL);
  await page.waitForSelector('#story-screen', { timeout: 10000 });

  await page.evaluate(() => {
    const save = {
      version: 1,
      unlocked: ['dish1'],
      completed: Array.from({ length: 70 }, (_, k) => {
        const tier = k < 15 ? 'dish' : k < 30 ? 'array' : k < 45 ? 'dsn' : k < 60 ? 'hunter' : 'pulsar';
        return tier + ((k % 15) + 1);
      }),
      progress: {},
      settings: { sound: true, reducedMotion: false, colorBlind: false, interferencePreview: false },
      hasSeenIntro: true,
      hasSeenHelp: true
    };
    localStorage.setItem('signal-save', JSON.stringify(save));
  });

  await page.reload();
  await page.waitForSelector('#map-screen', { timeout: 10000 });

  const nodes = await page.locator('.era-hunter .level-node').all();
  await nodes[nodes.length - 1].click();
  await page.waitForSelector('#game-screen', { timeout: 10000 });

  async function clickTower(idx) {
    await page.evaluate(() => document.getElementById('modal-overlay')?.remove());
    await page.locator('#board .tower').nth(idx).click({ force: true });
    await sleep(300);
  }

  for (const [src, dst] of [[2, 3], [4, 5], [6, 7]]) {
    await clickTower(src);
    await clickTower(dst);
  }

  const btn = page.locator('#resonance-btn');
  if (await btn.isDisabled()) throw new Error('Resonance button stayed disabled after 3 charges');
  await btn.click();
  await sleep(500);

  const remaining = await page.locator('#board .band.locked').count();
  if (remaining > 0) throw new Error(`locked bands remain after pulse (count ${remaining})`);

  await context.close();
  await browser.close();
  console.log('RESONANCE_UI_OK');
})();
