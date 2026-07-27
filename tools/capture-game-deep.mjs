import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = 'http://localhost:8000/index.html';
const OUT = join(process.cwd(), 'artifacts', 'game-review-screenshots');

async function waitMs(page, ms) {
  await page.waitForTimeout(ms);
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('saved', name);
}

async function enterGame(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById('loading-screen');
    if (!loading) return false;
    return loading.style.display === 'none' || getComputedStyle(loading).display === 'none';
  }, { timeout: 120000 });
  const start = page.locator('#start-screen');
  if (await start.isVisible().catch(() => false)) {
    await start.click({ force: true });
    await waitMs(page, 1200);
  }
}

async function evalGame(page, fn, arg) {
  return page.evaluate(fn, arg);
}

async function forceDeploy(page) {
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    const node = window.TowerRunMap.getNode(c.run.map, c.run.currentNodeId);
    c.roomTransition = null;
    c.enterNode(node);
    c.deployEnter = null;
    c.run.heroes.forEach((h, i) => {
      h.boardCol = i % 2;
      h.boardRow = Math.floor(i / 2);
    });
    c.refreshDeployPreview?.();
  });
}

async function skipPactIfAny(page) {
  await evalGame(page, () => {
    const g = window.game;
    const c = g?.autoBattlerController;
    if (c?.skipPactChoice) c.skipPactChoice();
    const skip = document.querySelector('#ab-pact-skip, .ab-pact-skip, [data-pact-skip]');
    if (skip) skip.click();
  });
  await waitMs(page, 400);
}

async function waitPhase(page, phase, timeout = 30000) {
  await page.waitForFunction((p) => window.game?.autoBattlerController?.run?.phase === p, phase, { timeout });
}

async function tickGame(page, ms) {
  const steps = Math.ceil(ms / 16);
  await evalGame(page, (n) => {
    const g = window.game;
    const dt = 16;
    for (let i = 0; i < n; i++) {
      g?.autoBattlerController?.update?.(dt);
      g?.update?.();
    }
  }, steps);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await enterGame(page);
  await shot(page, '10-town');

  const runInfo = await evalGame(page, () => {
    const g = window.game;
    const c = g.autoBattlerController;
    c.startRun(12345);
    const map = c.run.map;
    const TRM = window.TowerRunMap;
    const startId = map.startId || (map.nextChoices && map.nextChoices[0]);
    const choices = startId ? [TRM.getNode(map, startId)].filter(Boolean) : [];
    if (startId) c.selectNode(startId);
    return {
      phase: c.run.phase,
      choices: choices.map((n) => ({ id: n.id, type: n.type, layer: n.layer })),
      startId,
      heroes: c.run.heroes.map((h) => h.baseClass)
    };
  });
  console.log('run started', runInfo);

  await skipPactIfAny(page);
  await waitMs(page, 500);
  await shot(page, '11-map-choices');

  // Fast-forward room transition (or skip)
  await tickGame(page, 4500);
  try {
    await waitPhase(page, 'deploy', 5000);
  } catch {
    await forceDeploy(page);
  }
  await tickGame(page, 500);
  await shot(page, '12-deploy-formation');

  // Handle skirmish instant-resolve prompt if shown
  const skirmishBtn = page.locator('#ab-skirmish-no');
  if (await skirmishBtn.count()) {
    await skirmishBtn.click({ force: true });
    await waitMs(page, 800);
    await shot(page, '12b-after-skirmish-choice');
  } else {
    await evalGame(page, () => {
      const c = window.game.autoBattlerController;
      if (c.run?.phase === 'skirmish_choice') {
        const node = window.TowerRunMap.getNode(c.run.map, c.run.currentNodeId);
        c.resolveSkirmish?.(node, false);
      }
    });
    await waitMs(page, 800);
  }

  await forceDeploy(page).catch(() => {});
  await waitMs(page, 400);
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    c.deployEnter = null;
    const heroes = c.run.heroes;
    heroes.forEach((h, i) => {
      h.boardCol = i % 2;
      h.boardRow = Math.floor(i / 2);
    });
    c.refreshDeployPreview?.();
    c.ui?.refresh?.();
    return {
      phase: c.run.phase,
      placed: heroes.filter((h) => h.boardCol >= 0).length,
      hasBattle: !!c.battle,
      started: c.startCombat()
    };
  }).then((r) => console.log('start combat', r));
  try {
    await waitPhase(page, 'combat', 5000);
  } catch {
    await evalGame(page, () => {
      const c = window.game.autoBattlerController;
      c.deployEnter = null;
      c.run.phase = 'combat';
      const node = window.TowerRunMap.getNode(c.run.map, c.run.currentNodeId);
      c.battle = window.AutoBattleSimulator.createBattle(c.run, node, { w: 1280, h: 720 });
      c.battle.runRef = c.run;
      c.ui?.showCombat?.();
    });
  }
  await shot(page, '13-combat-start');

  await tickGame(page, 8000);
  await shot(page, '14-combat-mid');

  await tickGame(page, 15000);
  await shot(page, '15-combat-late');

  const postBattle = await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    return {
      phase: c.run?.phase,
      pendingLoot: !!c.run?.pendingLoot,
      heroesHp: c.run?.heroes?.map((h) => ({ cls: h.baseClass, hp: h.hp, max: h.maxHp }))
    };
  });
  console.log('post battle', postBattle);
  await shot(page, '16-post-battle');

  // If reward screen, capture it
  const rewardVisible = await page.locator('#ab-reward-view:not([style*="display: none"])').count();
  if (rewardVisible) await shot(page, '17-reward');

  // Try to advance to map and pick rest/shop if available
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    const ui = c.ui;
    if (c.run?.phase === 'reward' && ui?._claimAllRewards) {
      ui._claimAllRewards();
    }
  });
  await waitMs(page, 1000);
  await tickGame(page, 2000);

  const mapPick = await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    if (!c.run || c.run.phase !== 'map') return { ok: false, phase: c.run?.phase };
    const TRM = window.TowerRunMap;
    const cur = TRM.getNode(c.run.map, c.run.currentNodeId);
    const choices = (cur?.edges || []).map((id) => TRM.getNode(c.run.map, id)).filter(Boolean);
    const rest = choices.find((n) => n.type === 'rest');
    const shop = choices.find((n) => n.type === 'shop');
    const event = choices.find((n) => n.type === 'event');
    const pick = rest || shop || event || choices[0];
    if (pick) c.selectNode(pick.id);
    return { ok: true, picked: pick?.type, choices: choices.map((n) => n.type) };
  });
  console.log('map pick', mapPick);
  await tickGame(page, 4500);
  await waitMs(page, 500);
  await shot(page, '18-second-node');

  const phase2 = await evalGame(page, () => window.game.autoBattlerController.run?.phase);
  console.log('phase2', phase2);
  if (phase2 === 'rest') await shot(page, '19-rest-camp');
  if (phase2 === 'shop') await shot(page, '19-shop');
  if (phase2 === 'event') await shot(page, '19-event');

  // Commander / HUD panels during combat replay
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    if (c.run?.phase === 'rest') c.resolveRestChoice('leave');
    if (c.run?.phase === 'shop') c.run.phase = 'map';
    const TRM = window.TowerRunMap;
    const cur = TRM.getNode(c.run.map, c.run.currentNodeId);
    const choices = (cur?.edges || []).map((id) => TRM.getNode(c.run.map, id)).filter(Boolean);
    const battle = choices.find((n) => n.type === 'battle') || choices[0];
    if (battle) c.selectNode(battle.id);
  });
  await tickGame(page, 4500);
  await evalGame(page, () => {
    const c = window.game.autoBattlerController;
    c.deployEnter = null;
    c.run.heroes.forEach((h, i) => { h.boardCol = i % 2; h.boardRow = Math.floor(i / 2); });
    c.refreshDeployPreview?.();
    c.startCombat();
  });
  await waitMs(page, 800);
  await shot(page, '20-combat-hud-detail');

  await browser.close();
  console.log('capture complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
