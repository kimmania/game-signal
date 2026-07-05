import { chromium } from 'playwright';

const chromiumPath = process.env.PW_CHROMIUM_PATH ?? '/Users/kmann/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const baseURL = process.env.SIGNAL_BASE_URL ?? 'http://localhost:4173/game-signal/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();

  await page.goto(baseURL);
  await page.waitForSelector('#story-screen', { timeout: 10000 });

  await page.evaluate(() => {
    const save = {
      version: 1,
      unlocked: Array.from({ length: 70 }, (_, k) => {
        const tier = k < 15 ? 'dish' : k < 30 ? 'array' : k < 45 ? 'dsn' : k < 60 ? 'hunter' : 'pulsar';
        return tier + ((k % 15) + 1);
      }),
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

  await page.locator('.era-dish .level-node').nth(5).click();
  await page.waitForSelector('#game-screen', { timeout: 10000 });

  async function clickTower(idx) {
    await page.evaluate(() => document.getElementById('modal-overlay')?.remove());
    await page.locator('#board .tower').nth(idx).click({ force: true });
    await sleep(300);
  }

  // Move the red from tower 1 (0-indexed) to tower 0.
  await clickTower(1);
  await clickTower(0);

  const label = await page.locator('#resonance-btn').textContent();
  console.log('label:', label.replace(/\s+/g, ' ').trim());
  if (!/Resonance 2\/3/.test(label)) throw new Error(`expected Resonance 2/3, got ${label}`);

  await context.close();
  await browser.close();
  console.log('DISH6_DOUBLE_CHARGE_OK');
})();
