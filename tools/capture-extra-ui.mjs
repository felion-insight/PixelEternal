import { chromium } from 'playwright';
import { join } from 'path';

const OUT = join(process.cwd(), 'artifacts', 'game-review-screenshots');

async function evalGame(page, fn, arg) {
  return page.evaluate(fn, arg);
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('saved', name);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('loading-screen')).display === 'none', { timeout: 120000 });
  await page.locator('#start-screen').click({ force: true });
  await page.waitForTimeout(1000);

  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    c.startRun(99999);
    const map = c.run.map;
    c.selectNode(map.startId);
  });
  await page.waitForTimeout(300);

  // Skip to map after first node cleared
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    const TRM = window.TowerRunMap;
    const node = TRM.getNode(c.run.map, c.run.currentNodeId);
    c.roomTransition = null;
    c.enterNode(node);
    c.deployEnter = null;
    c.run.heroes.forEach((h, i) => { h.boardCol = i % 2; h.boardRow = Math.floor(i / 2); });
    c.refreshDeployPreview();
    c.startCombat();
  });
  await page.waitForTimeout(200);

  // Force win
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    if (c.battle) {
      c.battle.finished = true;
      c.battle.victory = true;
      c.onCombatEnd(true);
    }
  });
  await page.waitForTimeout(500);
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    const ui = c.ui;
    if (c.run?.pendingLoot) {
      c.run.pendingLoot.claimed = true;
      c.run.phase = 'map';
      const node = window.TowerRunMap.getNode(c.run.map, c.run.currentNodeId);
      node.cleared = true;
      window.TowerRunMap.generateNextChoices(c.run.map, node, window.RunStateSystem.rngFromRun(c.run));
      ui.refresh();
    }
  });
  await page.waitForTimeout(400);
  await shot(page, '21-map-three-choices');

  const pickRest = await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    const TRM = window.TowerRunMap;
    const cur = TRM.getNode(c.run.map, c.run.currentNodeId);
    const choices = (cur.edges || []).map((id) => TRM.getNode(c.run.map, id));
    const rest = choices.find((n) => n.type === 'rest') || choices[0];
    c.selectNode(rest.id);
    return rest.type;
  });
  await page.waitForTimeout(300);
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    c.roomTransition = null;
    const node = window.TowerRunMap.getNode(c.run.map, c.run.currentNodeId);
    c.enterNode(node);
    c.ui.refresh();
  });
  await page.waitForTimeout(400);
  await shot(page, pickRest === 'rest' ? '22-rest-camp' : '22-second-node');

  await page.locator('#ab-open-skills').click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, '23-skills-panel');

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
