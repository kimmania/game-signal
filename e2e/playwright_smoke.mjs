import { chromium } from 'playwright';
import assert from 'assert';

const chromiumPath = process.env.PW_CHROMIUM_PATH ?? '/Users/kmann/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const baseURL = process.env.SIGNAL_BASE_URL ?? 'http://localhost:4173/game-signal/';

(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));
  page.on('console', (msg) => console.log('CONSOLE:', msg.text()));

  await page.goto(baseURL);
  await page.waitForTimeout(800);

  // 1. Story screen
  await page.waitForSelector('#story-screen', { timeout: 10000 });
  const storyTitle = await page.locator('#story-screen h1').textContent();
  assert.strictEqual(storyTitle, 'Signal');
  const storySub = await page.locator('#story-screen .sub').textContent();
  assert(storySub.includes('Radio-Astronomy'));
  await page.screenshot({ path: '/tmp/signal-story.png' });

  // 2. Map (first run shows Help after entering observatory)
  await page.click('#begin-btn');
  await page.waitForTimeout(400);
  if (await page.locator('#close-help').count() > 0) {
    await page.click('#close-help');
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('#map-screen', { state: 'visible', timeout: 5000 });
  const totalStars = await page.locator('.total-stars').textContent();
  assert(/★ \d+\/210/.test(totalStars), `unexpected total stars text: ${totalStars}`);
  await page.screenshot({ path: '/tmp/signal-map.png' });

  // 3. dish1 game
  await page.locator('.level-node').first().click();
  await page.waitForSelector('#game-screen', { state: 'visible', timeout: 5000 });
  await page.screenshot({ path: '/tmp/signal-game1.png' });

  // 4. UI interactions smoke checks
  const towerCount = await page.locator('#board .tower').count();
  assert.strictEqual(towerCount, 6);

  // First click selects a tower
  const firstTower = page.locator('#board .tower').first();
  await firstTower.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/signal-selected.png' });
  const hasSelected = await page.locator('#board .tower.selected').count();
  assert.strictEqual(hasSelected, 1);

  // Move Preview Hints should render (dest-* classes exist only if a source is selected)
  const hintCount = await page.locator('#board .tower.dest-good, #board .tower.dest-warn, #board .tower.dest-full').count();
  assert(hintCount > 0, 'expected preview hint classes to appear after selecting a tower');

  // Undo disabled at move 0
  const undoDisabled = await page.locator('#undo-btn').isDisabled();
  assert.strictEqual(undoDisabled, true);

  // 5. Settings panel
  await page.click('#settings-btn');
  await page.waitForTimeout(200);
  const settingsLabel = await page.locator('label[for="setting-preview"]').textContent();
  assert(settingsLabel.includes('Move Preview Hints'), settingsLabel);
  await page.click('#close-settings');

  // 6. Help panel
  await page.click('#help-btn');
  await page.waitForSelector('#modal-overlay', { timeout: 5000 });
  const modalHTML = await page.locator('#modal-overlay .modal').innerHTML();
  assert(modalHTML.includes('Shielded'), 'help missing Shielded');
  assert(modalHTML.includes('Encrypted'), 'help missing Encrypted');
  await page.click('#close-help');

  await browser.close();
  console.log('SMOKE_OK');
})();
