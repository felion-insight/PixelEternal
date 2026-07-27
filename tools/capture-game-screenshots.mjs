import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:8000/index.html';
const OUT = join(process.cwd(), 'artifacts', 'game-review-screenshots');

async function waitForGameReady(page, timeout = 120000) {
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading-screen');
    const start = document.getElementById('start-screen');
    if (!loading) return false;
    const loadingHidden = loading.style.display === 'none' || getComputedStyle(loading).display === 'none';
    const startVisible = start && (start.style.display === 'flex' || getComputedStyle(start).display === 'flex');
    return loadingHidden || startVisible;
  }, { timeout });
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('saved', path);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[page error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('[pageexception]', err.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForGameReady(page);
  await shot(page, '01-after-load');

  const start = page.locator('#start-screen');
  if (await start.isVisible().catch(() => false)) {
    await start.click({ force: true });
    await page.waitForTimeout(1500);
  }
  await shot(page, '02-main-city');

  // Try to start tower run via game API if available
  const started = await page.evaluate(async () => {
    const g = window.game;
    if (!g) return { ok: false, reason: 'no game' };
    try {
      if (g.autoBattlerSystem?.startRun) {
        g.autoBattlerSystem.startRun();
        return { ok: true, via: 'startRun' };
      }
      if (g.startTowerRun) {
        g.startTowerRun();
        return { ok: true, via: 'startTowerRun' };
      }
      return { ok: false, reason: 'no start method' };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  });
  console.log('start run:', started);
  await page.waitForTimeout(2000);
  await shot(page, '03-tower-map-or-run');

  // Open node choice if visible
  await page.waitForTimeout(1000);
  await shot(page, '04-node-choice');

  // Try pick first battle node
  await page.evaluate(() => {
    const g = window.game;
    const abs = g?.autoBattlerSystem;
    if (!abs) return;
    const choices = abs.getCurrentChoices?.() || abs.currentChoices || abs._currentChoices;
    if (Array.isArray(choices) && choices.length) {
      const battle = choices.find((c) => c.type === 'battle') || choices[0];
      abs.selectChoice?.(battle.id ?? battle.index ?? 0);
      abs.pickChoice?.(battle);
      abs.chooseNode?.(battle);
    }
  });
  await page.waitForTimeout(2000);
  await shot(page, '05-after-node-pick');

  // Try start battle / formation
  await page.evaluate(() => {
    const g = window.game;
    const abs = g?.autoBattlerSystem;
    abs?.startBattle?.();
    abs?.confirmFormation?.();
    g?.autoBattlerUI?.startBattle?.();
  });
  await page.waitForTimeout(2500);
  await shot(page, '06-formation-or-battle');

  // Open inventory / panels if buttons exist
  for (const [id, name] of [
    ['inventory-btn', '07-inventory'],
    ['settings-btn', '08-settings'],
  ]) {
    const btn = page.locator(`#${id}`);
    if (await btn.count()) {
      await btn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, name);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  // Smaller viewport test
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(500);
  await shot(page, '09-viewport-1366');

  await browser.close();
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
