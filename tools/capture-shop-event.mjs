import { chromium } from 'playwright';
import { join } from 'path';

const OUT = join(process.cwd(), 'artifacts', 'game-review-screenshots');

async function evalGame(page, fn) {
  return page.evaluate(fn);
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
    c.startRun(88888);
    c.selectNode(c.run.map.startId);
  });
  await page.waitForTimeout(300);
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    const node = window.TowerRunMap.getNode(c.run.map, c.run.currentNodeId);
    c.roomTransition = null;
    c.enterNode(node);
    c.deployEnter = null;
    c.run.heroes.forEach((h, i) => { h.boardCol = i % 2; h.boardRow = Math.floor(i / 2); });
    c.refreshDeployPreview();
    c.startCombat();
  });
  await page.waitForTimeout(200);
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    if (c.battle) { c.battle.finished = true; c.battle.victory = true; c.onCombatEnd(true); }
  });
  await page.waitForTimeout(400);

  // Go to map and pick shop
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
  await page.waitForTimeout(300);

  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    const TRM = window.TowerRunMap;
    const cur = TRM.getNode(c.run.map, c.run.currentNodeId);
    const choices = (cur.edges || []).map((id) => TRM.getNode(c.run.map, id));
    const shop = choices.find((n) => n.type === 'shop') || choices[0];
    c.selectNode(shop.id);
  });
  await page.waitForTimeout(300);
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    c.roomTransition = null;
    const node = window.TowerRunMap.getNode(c.run.map, c.run.currentNodeId);
    c.enterNode(node);
    c.ui.refresh();
  });
  await page.waitForTimeout(500);
  await shot(page, '24-shop');

  // Event
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    c.run.currentEvent = {
      id: 'old_altar',
      title: '古老祭坛',
      desc: '一座布满裂纹的祭坛静立于此，表面仍残留着微弱的魔力脉动。你可以献上金币换取祝福，或冒险触碰未知的符文。',
      choices: [
        { id: 'gold', label: '献上 20 金', desc: '获得随机技能强化', costGold: 20 },
        { id: 'risk', label: '触碰符文', desc: '50% 腐化 +10 或获得遗物', risk: true },
        { id: 'leave', label: '离开', desc: '不做任何事' }
      ]
    };
    c.run.phase = 'event';
    c.ui.showEvent();
  });
  await page.waitForTimeout(400);
  await shot(page, '25-event');

  await page.locator('#ab-btn-skills').click({ force: true });
  await page.waitForTimeout(500);
  await shot(page, '26-loadout-panel');

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
