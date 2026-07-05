import { chromium } from 'playwright';

const chromiumPath = process.env.PW_CHROMIUM_PATH ?? '/Users/kmann/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const baseURL = process.env.SIGNAL_BASE_URL ?? 'http://localhost:4173/game-signal/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForMap(page) {
  let waited = 0;
  while (!(await page.locator('#map-screen').count())) {
    if ((await page.locator('#close-help').count()) > 0) {
      await page.click('#close-help');
    }
    await sleep(200);
    waited += 200;
    if (waited > 10000) throw new Error('map not reached');
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();

  await context.route('**/puzzles/levels.json', async (route) => {
    const response = await route.fetch();
    const levels = await response.json();
    if (!levels.some((l) => l.id === 'dsn99')) {
      levels.push({
        id: 'dsn99',
        name: 'DSN 99',
        era: 'Deep Space Network',
        colors: ['red', 'amber', 'green', 'cyan', 'violet', 'white'],
        capacity: 5,
        clearCharges: 1,
        targetMoves: 40,
        towers: [
          { bands: [{ color: 'red', amplified: false, noisy: false, locked: true }], dampened: false },
          { bands: [{ color: 'amber', amplified: false, noisy: false, locked: true }], dampened: false },
          { bands: [{ color: 'green', amplified: false, noisy: false, locked: false }, { color: 'green', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'cyan', amplified: false, noisy: false, locked: false }, { color: 'cyan', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'violet', amplified: false, noisy: false, locked: false }, { color: 'violet', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'white', amplified: false, noisy: false, locked: false }, { color: 'white', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false }
        ]
      });
      levels.push({
        id: 'hunter99',
        name: 'Hunter 99',
        era: 'Exoplanet Hunter',
        colors: ['red', 'amber', 'green', 'cyan', 'violet', 'white'],
        capacity: 5,
        clearCharges: 1,
        targetMoves: 40,
        towers: [
          { bands: [{ color: 'red', amplified: false, noisy: false, locked: true }], dampened: false },
          { bands: [{ color: 'amber', amplified: false, noisy: false, locked: true }], dampened: false },
          { bands: [{ color: 'green', amplified: false, noisy: false, locked: false }, { color: 'green', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'cyan', amplified: false, noisy: false, locked: false }, { color: 'cyan', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'violet', amplified: false, noisy: false, locked: false }, { color: 'violet', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'white', amplified: false, noisy: false, locked: false }, { color: 'white', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'red', amplified: false, noisy: false, locked: true }], dampened: false },
          { bands: [{ color: 'amber', amplified: false, noisy: false, locked: true }], dampened: false },
          { bands: [{ color: 'green', amplified: false, noisy: false, locked: false }, { color: 'green', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false },
          { bands: [{ color: 'cyan', amplified: false, noisy: false, locked: false }, { color: 'cyan', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false }
        ]
      });
      levels.push({
        id: 'pulsar99',
        name: 'Pulsar 99',
        era: 'Pulsar Core',
        colors: ['red', 'amber', 'green', 'cyan', 'violet', 'white'],
        capacity: 6,
        clearCharges: 1,
        targetMoves: 50,
        towers: Array.from({ length: 13 }, (_, i) => ({
          bands: i < 6 ? [{ color: ['red', 'amber', 'green', 'cyan', 'violet', 'white'][i], amplified: false, noisy: false, locked: true }] : [],
          dampened: i % 3 === 0
        })).concat([
          { bands: [{ color: 'red', amplified: false, noisy: false, locked: false }, { color: 'red', amplified: false, noisy: false, locked: false }], dampened: false },
          { bands: [], dampened: false }
        ])
      });
    }
    await route.fulfill({ response, body: JSON.stringify(levels) });
  });

  await page.goto(baseURL);
  await page.waitForSelector('#story-screen', { timeout: 10000 });
  await page.click('#begin-btn');
  await waitForMap(page);

  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('signal-save') || '{}');
    save.completed = Array.from({ length: 70 }, (_, k) => {
      const tier = k < 15 ? 'dish' : k < 30 ? 'array' : k < 45 ? 'dsn' : k < 60 ? 'hunter' : 'pulsar';
      return tier + ((k % 15) + 1);
    });
    localStorage.setItem('signal-save', JSON.stringify(save));
  });

  await page.reload();
  await waitForMap(page);

  for (const cls of ['era-dsn', 'era-hunter', 'era-pulsar']) {
    const allNodes = await page.locator(`.${cls} .level-node`).all();
    const nodes = [];
    for (const n of allNodes) {
      if (await n.evaluate((el) => !el.disabled)) nodes.push(n);
    }
    if (nodes.length === 0) throw new Error(`no unlocked ${cls} nodes found`);
    await nodes[nodes.length - 1].click();
    await page.waitForSelector('#game-screen', { timeout: 10000 });
    const towerCount = await page.locator('#board .tower').count();
    const expected = cls === 'era-dsn' ? 10 : cls === 'era-hunter' ? 11 : 13;
    if (towerCount !== expected) throw new Error(`${cls} expected ${expected} towers, got ${towerCount}`);
    await page.click('#back-btn');
    await page.waitForSelector('#map-screen', { timeout: 5000 });
  }

  await context.close();
  await browser.close();
  console.log('SMOKE_OK');
})();
