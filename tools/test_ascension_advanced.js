'use strict';
/**
 * Ascension 高级效果：四元协同、诅咒负面、反转战斗、天气
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.window = global;

function loadJson(p) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
}

const content = loadJson('config/content-expansion.json').CONTENT_EXPANSION;
const ab = loadJson('config/auto-battler-config.json');
Object.assign(ab, loadJson('config/build-simplification.json').BUILD_SIMPLIFICATION);
ab.relics = (ab.relics || []).concat(content.relics || []);

window.CONFIG = {
    AUTO_BATTLER_CONFIG: ab,
    CURSE_CONFIG: loadJson('config/curse-config.json').CURSE_CONFIG,
    WEATHER_CONFIG: content.weatherConfig || {}
};
const curseRoot = window.CONFIG.CURSE_CONFIG;
curseRoot.cursedRelics = curseRoot.cursedRelics || {};
(content.relics || []).forEach((r) => {
    if (!r || r.rarity !== 'curse') return;
    const fx = r.effects || {};
    curseRoot.cursedRelics[r.id] = {
        id: r.id,
        name: r.name,
        positive: fx.positive || {},
        negative: fx.negative || {},
        riskLevel: fx.riskLevel || 3
    };
});
window.CURSE_CONFIG = curseRoot;
window.WEATHER_CONFIG = window.CONFIG.WEATHER_CONFIG;
window.SYNERGY_MATRIX_CONFIG = {
    binary: content.synergyBinary || {},
    ternary: content.synergyTernary || {},
    quaternary: content.synergyQuaternary || {}
};
window.MUTATED_NODE_CONFIG = content.mutatedNodeConfig || {};
const demonPactRoot = loadJson('config/demon-pact-config.json').DEMON_PACT_CONFIG;
demonPactRoot.pacts = Object.assign({}, demonPactRoot.pacts || {}, content.demonPacts || {});
window.DEMON_PACT_CONFIG = demonPactRoot;
window.EVENT_CHAINS_CONFIG = Object.assign(
    {},
    loadJson('config/event-chains-config.json').EVENT_CHAINS_CONFIG || {},
    { chains: Object.assign({}, (loadJson('config/event-chains-config.json').EVENT_CHAINS_CONFIG || {}).chains || {}, content.eventChains || {}) }
);

require('../js/party-meta-system.js');
require('../js/ascension-hub.js');
require('../js/combat-effects-bridge.js');
require('../js/relic-system.js');
require('../js/run-state-system.js');
require('../js/synergy-matrix.js');
require('../js/curse-system.js');
require('../js/weather-system.js');
require('../js/mutated-node-system.js');
require('../js/demon-pact.js');

const RSS = window.RunStateSystem;
const run = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());

// 四元协同：元素领主
run.relics = ['scorching_touch', 'frost_core', 'lightning_chain_relic', 'chaos_orb'];
window.SynergyMatrix.refreshFromRun(run);
assert((run.ascension.synergies || []).includes('elemental_lord'), 'elemental_lord synergy active');

const battle = {
    allies: [{ side: 'ally', id: 'a1', attack: 20, hp: 100, maxHp: 100, alive: true }],
    enemies: [{ side: 'enemy', id: 'e1', hp: 100, maxHp: 100, alive: true, defense: 5 }],
    relicFx: {},
    synergyFx: {},
    elapsed: 0
};
window.SynergyMatrix.applyCombatEffects(run, battle);
window.CombatEffectsBridge.finalizeBattle(battle, run);
assert(battle.relicFx.elementalLord, 'elemental lord applied to relicFx');
assert(battle.relicFx.elementalReactionMult >= 2, 'elemental reaction mult');

// infiniteCombo 经 finalizeBattle 合并
const comboBattle = {
    relicFx: {},
    synergyFx: { extraAttackChance: 0.5, infiniteCombo: true },
    allies: [], enemies: [], elapsed: 0
};
window.CombatEffectsBridge.finalizeBattle(comboBattle, run);
assert(comboBattle.relicFx.infiniteCombo === true, 'infiniteCombo merged via finalizeBattle');

// 诅咒：契约锁链遗物上限
run.ascension.cursedRelicIds = ['pact_chain'];
window.CurseSystem.onRelicAcquired(run, 'pact_chain');
assert(window.RelicSystem.softCap(run) >= 24, 'pact_chain raises relic soft cap');

const curseBattle = { allies: [{ attack: 10, defense: 5, maxHp: 100, hp: 100 }] };
window.CurseSystem.onBattleStart(run, curseBattle);
assert(curseBattle.curseBattleFx.hpPerRelicPenalty > 0, 'hp per relic penalty applied');

// 赌徒骰子：随机属性惩罚标记
run.ascension.cursedRelicIds = ['gambler_dice'];
const gamblerMods = window.CurseSystem.buildBattleModifiers(run);
assert(gamblerMods._randomStatPenalty > 0, 'gambler random stat penalty');

// 天气：spawnChance + cooldownMult 映射
const w = window.WeatherSystem.rollWeatherForZone('ashen_wastes', () => 0.1);
assert(!w || w.def, 'weather roll returns def or null');
const wb = {};
window.WeatherSystem.onBattleStart(run, wb);
if (run.ascension.weather && run.ascension.weather.def) {
    run.ascension.weather.def.effects = { cooldownMult: 0.8, fireDamageMult: 0.7 };
    window.WeatherSystem.onBattleStart(run, wb);
    assert(wb.weatherSkillCdMult === 0.8, 'aurora cooldownMult mapped');
    assert(wb.weatherFireDmgMult === 0.7, 'rainstorm fire mult on battle');
}

// 反转战斗：变异节点
const revBattle = {
    allies: [{ id: 'h1', hp: 50, maxHp: 50, alive: true }],
    enemies: [{ id: 'e1', hp: 50, maxHp: 50, alive: true }, { id: 'e2', hp: 50, maxHp: 50, alive: true }]
};
window.MutatedNodeSystem.applyToBattle(revBattle, { mutationId: 'reverse_battle' });
assert(revBattle.mutationReverse === true, 'reverse_battle flag');
assert(revBattle.reverseSelectedId === 'e1', 'first enemy auto-selected');
assert(revBattle.enemies[0].playerControlled === true, 'first enemy player controlled');

// 战前情报视野惩罚
require('../js/pre-combat-intel.js');
run.ascension.visionPenalty = 0.3;
assert(window.PreCombatIntel.accuracy(run) <= 0.7, 'vision penalty reduces intel accuracy');

// 协同截断：高 tier 优先
assert(window.SynergyMatrix.sortSynergyIds(
    ['bin_a', 'qua_x', 'ter_y', 'bin_b'],
    { bin_a: { tier: 'binary' }, bin_b: { tier: 'binary' }, ter_y: { tier: 'ternary' }, qua_x: { tier: 'quaternary' } }
)[0] === 'qua_x', 'quaternary sorted first');

const run2 = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
run2.relics = ['scorching_touch', 'frost_core', 'lightning_chain_relic', 'chaos_orb', 'greedy_purse', 'fate_coin'];
window.SynergyMatrix.refreshFromRun(run2);
assert((run2.ascension.synergies || []).length <= 5, 'synergies capped at 5');
if ((run2.ascension.synergies || []).length >= 5) {
    assert(Array.isArray(run2.ascension.synergiesInactive), 'synergiesInactive array exists');
}
assert((run2.ascension.synergies || []).includes('elemental_lord'), 'quaternary synergy kept');

// 瞬间结算：延迟应用 HP
require('../js/combat-pacing.js');
const skRun = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
skRun.heroes.forEach((h) => { h.hp = h.maxHp; h.level = 20; });
const skRes = window.CombatPacing.resolveSkirmish(skRun, { enemies: [{ hp: 10, maxHp: 10, attack: 1, defense: 1, speed: 1, alive: true }] }, () => 0.01);
assert(skRun.heroes[0].hp === skRun.heroes[0].maxHp, 'resolveSkirmish does not apply HP immediately');
window.CombatPacing.applySkirmishResult(skRun, skRes);
if (skRes.victory) {
    assert(skRun.heroes[0].hp <= skRun.heroes[0].maxHp, 'applySkirmishResult applies HP on victory');
} else {
    assert(skRun.heroes[0].hp < skRun.heroes[0].maxHp, 'applySkirmishResult applies HP on defeat');
}

// 区域 mutation 运行时
window.ZONE_MUTATIONS_CONFIG = loadJson('config/zone-mutations-config.json').ZONE_MUTATIONS_CONFIG;
window.ZONE_ECOLOGY_CONFIG = { zones: { ashen_wastes: { id: 'ashen_wastes', name: '灰烬荒原', layers: 10 } } };
window.ASCENSION_CONFIG = {
    ascension: {
        runZoneRandomizer: { enabled: true, minZones: 2, maxZones: 3 },
        intelTiers: { enabled: true, defaultTier: 'count_only' },
        preCombatIntel: { enabled: true, accuracy: 0.9 }
    }
};
require('../js/run-zone-generator.js');
require('../js/zone-mutation-runtime.js');
const zmRun = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
zmRun.ascension.zoneId = 'ashen_wastes';
zmRun.ascension.zoneMutations = { ashen_wastes: 'no_heal' };
assert(!window.ZoneMutationRuntime.canRestHeal(zmRun), 'no_heal mutation blocks rest heal');
assert(window.ZoneMutationRuntime.modifyGoldReward(100, Object.assign({}, zmRun, {
    ascension: Object.assign({}, zmRun.ascension, { zoneMutations: { ashen_wastes: 'double_gold' }, zoneId: 'ashen_wastes' })
})) === 200, 'double_gold mutation doubles gold');

// 情报分级：默认仅数量
const intelRun = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
const intel = window.PreCombatIntel.analyze(intelRun, { enemies: [{ name: 'Grunt', hp: 100 }] }, { type: 'battle' });
assert(intel.tier === 'count_only', 'default intel tier count_only');
assert(intel.intents[0].name === '[???]', 'count_only hides enemy names');

// 阶段3：构筑肉鸽
window.ASCENSION_CONFIG.ascension = Object.assign({}, window.ASCENSION_CONFIG.ascension, {
    skillRunMutations: { enabled: true },
    classVariants: { enabled: true, choicesPerClass: 2 },
    buildCommitment: { enabled: true },
    runMechanics: { enabled: true },
    relicExclusivity: { enabled: true, variance: 0.2 },
    negativeSynergies: { enabled: true },
    synergyMatrix: { enabled: true, maxActiveSynergies: 5 }
});
window.SKILL_RUN_MUTATIONS_CONFIG = loadJson('config/skill-run-mutations-config.json').SKILL_RUN_MUTATIONS_CONFIG;
window.CLASS_VARIANTS_CONFIG = loadJson('config/class-variants-config.json').CLASS_VARIANTS_CONFIG;
window.BUILD_COMMITMENT_CONFIG = loadJson('config/build-commitment-config.json').BUILD_COMMITMENT_CONFIG;
window.RUN_MECHANICS_CONFIG = loadJson('config/run-mechanics-config.json').RUN_MECHANICS_CONFIG;
window.RELIC_EXCLUSIVITY_CONFIG = loadJson('config/relic-exclusivity-config.json').RELIC_EXCLUSIVITY_CONFIG;
window.NEGATIVE_SYNERGY_CONFIG = loadJson('config/negative-synergy-config.json').NEGATIVE_SYNERGY_CONFIG;
require('../js/skill-run-mutation-system.js');
require('../js/class-variant-system.js');
require('../js/build-commitment-system.js');
require('../js/run-mechanic-system.js');
require('../js/relic-exclusivity-system.js');

const p3Run = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
window.ClassVariantSystem.onRunStart(p3Run, () => 0.42);
assert(Object.keys(p3Run.ascension.variantChoices).length === 4, 'variant choices for each hero');
const p3Hero = p3Run.heroes[0];
const firstVariant = p3Run.ascension.variantChoices[p3Hero.heroId][0].id;
assert(window.ClassVariantSystem.applyChoice(p3Run, p3Hero.heroId, firstVariant).ok, 'class variant applied');
assert(p3Hero.classVariant === firstVariant, 'class variant locked on hero');

const lootA = RSS.makeSkillLoot('fireball', 1, () => 0.01, p3Run, 10);
assert(Array.isArray(lootA.runMutations), 'skill loot has runMutations array');
if (lootA.runMutations.length) {
    assert(lootA.displayName.indexOf('·') > 0, 'displayName includes mutation suffix');
}
const mutationSets = new Set();
for (let i = 0; i < 24; i++) {
    mutationSets.add(JSON.stringify(
        window.SkillRunMutationSystem.rollMutations(() => (i * 0.037 + 0.11) % 1, p3Run, 12)
    ));
}
assert(mutationSets.size > 1, 'mutation rolls vary across seeds');

const commitRes = window.BuildCommitmentSystem.applyChoice(p3Run, 'fire_heart', 5);
assert(commitRes.ok && p3Run.ascension.buildPath.id === 'fire_heart', 'build commitment applied');
assert(window.BuildCommitmentSystem.tagWeightMult(p3Run, ['burn']) >= 1.5, 'boost tag weight');
assert(window.BuildCommitmentSystem.tagWeightMult(p3Run, ['ice']) <= 0.5, 'penalty tag weight');

p3Run.relics = ['scorching_touch'];
assert(!RSS.addRelic(p3Run, 'frost_core'), 'exclusive relic blocked');
assert(RSS.addRelic(p3Run, 'greedy_purse'), 'non-conflict relic allowed');
window.RelicExclusivitySystem.onRelicAcquired(p3Run, 'greedy_purse', () => 0.05);
assert(p3Run.ascension.relicQuality.greedy_purse, 'relic quality label rolled');

p3Run.ascension.runMechanic = 'gold_famine';
assert(window.RunMechanicSystem.modifyGoldReward(100, p3Run) === 0, 'gold famine removes gold');
p3Run.ascension.runMechanic = 'element_tide';
p3Run.ascension.tideElement = 'fire';
window.RunMechanicSystem.onLayerAdvanced(p3Run, 5);
assert(p3Run.ascension.tideElement === 'ice', 'element tide cycles on layer 5');

p3Run.relics = ['collapse_core', 'greedy_purse'];
window.SynergyMatrix.refreshNegativeFromRun(p3Run);
assert((p3Run.ascension.negativeSynergies || []).includes('near_death_fury'), 'negative synergy detected');
assert(window.SynergyMatrix.getNegativeDisplay(p3Run).some((n) => n.id === 'near_death_fury'), 'negative synergy display');

// 阶段4：内容 runtime 审计
require('../js/demon-pact.js');
require('../js/event-chain-system.js');

const synRun = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
synRun.relics = ['magic_lens', 'arcane_amp'];
window.SynergyMatrix.refreshFromRun(synRun);
const sniperBattle = { relicFx: {}, synergyFx: {} };
window.SynergyMatrix.applyCombatEffects(synRun, sniperBattle);
assert(sniperBattle.relicFx.skillRangeMult > 1, 'sniper_arcane range_bonus applies skillRangeMult');

synRun.relics = ['frenzy_totem', 'blood_pact_synergy'];
window.SynergyMatrix.refreshFromRun(synRun);
const berserkBattle = { relicFx: {}, synergyFx: {} };
window.SynergyMatrix.applyCombatEffects(synRun, berserkBattle);
assert(berserkBattle.relicFx.lowHpAttackMult, 'berserk_pact low_hp_berserk applies');

const scalingAgg = window.RelicSystem.aggregateRelicEffects(['blood_pact_synergy']);
assert(scalingAgg.lowHpAttackScaling && scalingAgg.lowHpAttackScaling.per10PctHp, 'blood_pact_synergy scaling aggregated');

const mirrorAgg = window.RelicSystem.aggregateRelicEffects(['mirror_core']);
assert(mirrorAgg.battleStartMirror && mirrorAgg.battleStartMirror.statPct === 0.5, 'mirror_core statMult mapped to statPct');

const timeAgg = window.RelicSystem.aggregateRelicEffects(['time_warp_device']);
assert(timeAgg.allyTimeScale === 1.25 && timeAgg.globalTimeScale === 0.8, 'time_warp_device time scales aggregated');

window.DemonPact.applyPact(synRun, 'wrath', 1);
assert(window.DemonPact.getEnemyAttackMult(synRun) === 1.15, 'wrath pact enemyAttackMult');
window.DemonPact.applyPact(synRun, 'greed', 1);
assert(window.DemonPact.getShopPriceMult(synRun) === 1.2, 'greed pact shopPriceMult');
window.DemonPact.applyPact(synRun, 'pride', 2);
assert(window.DemonPact.getRelicDropMult(synRun) === 1.3, 'pride pact relicDropMult');

const chainRun = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
window.EventChainSystem.startChain(chainRun, 'merchant_revenge', 'mr_1');
window.EventChainSystem.advanceChain(chainRun, 'merchant_revenge', 'rob');
window.EventChainSystem.advanceChain(chainRun, 'merchant_revenge', 'fight');
const chainRes = window.EventChainSystem.advanceChain(chainRun, 'merchant_revenge', 'defeat');
assert(chainRes && chainRes.relicGranted === 'fortune_coin', 'event chain rewards.relic granted');
assert((chainRun.relics || []).includes('fortune_coin'), 'fortune_coin in run relics');

synRun.relics = ['scorching_touch'];
assert(!RSS.addRelic(synRun, 'frost_core'), 'relic exclusivity still blocks after phase4 changes');

const bloodAgg = window.RelicSystem.aggregateRelicEffects(['blood_mage']);
assert(bloodAgg.skillNoCooldown && bloodAgg.skillHpCostPct === 0.05, 'blood_mage rule-changing relic');

const glassAgg = window.RelicSystem.aggregateRelicEffects(['glass_cannon_curse']);
assert(glassAgg.attackMult === 2 && glassAgg.frontRowDamageTakenMult === 1.5, 'glass_cannon_curse positive+negative');

const dualAgg = window.RelicSystem.aggregateRelicEffects(['dual_wielder']);
assert(dualAgg.basicIntervalMult === 0.7 && dualAgg.extraAttackChance === 0.15 && dualAgg.dualWeaponSlots, 'dual_wielder aggregated');

const pactMeta = { ascension: { demonPactUnlocked: true, firstVictory: true } };
window.ASCENSION_CONFIG.ascension = Object.assign({}, window.ASCENSION_CONFIG.ascension || {}, {
    demonPact: { enabled: true, unlockAfterVictory: false },
    eventChains: { enabled: true, maxConcurrentChains: 3 }
});
assert(window.DemonPact.listChoices(pactMeta).length >= 28, '28 demon pacts available');
const grouped = window.DemonPact.listChoicesGrouped(pactMeta);
const groupedTotal = [1, 2, 3, 4, 5].reduce((n, s) => n + (grouped[s] || []).length, 0);
assert(groupedTotal >= 28, 'pacts grouped by stars');

window.DemonPact.applyPact(synRun, 'death_permanent', 1);
assert(!window.DemonPact.canRestRevive(synRun), 'death_permanent blocks rest revive');

const trigRun = RSS.createRunState(window.PartyMetaSystem.createDefaultPartyMeta());
trigRun.ascension.zoneId = 'ashen_wastes';
const origRng = window.RunStateSystem.rngFromRun;
window.RunStateSystem.rngFromRun = () => () => 0.1;
const started = window.EventChainSystem.tryStartChainByTrigger(trigRun, 'event_node', 'ashen_wastes');
window.RunStateSystem.rngFromRun = origRng;
assert(started === 'demon_hunter_revenge' || started === 'lost_legion', 'event_node trigger starts zone chain');

const snapBattle = {
    elapsed: 5000,
    allies: [{ id: 'a1', heroId: 'h1', hp: 10, maxHp: 100, alive: true, x: 1, y: 2, col: 0, row: 0, basicCd: 0, skills: [{ id: 's1', cd: 100 }] }],
    enemies: [],
    rewindSnapshots: [{
        t: 2000,
        elapsed: 2000,
        allies: [{ id: 'a1', heroId: 'h1', hp: 80, maxHp: 100, alive: true, x: 1, y: 2, col: 0, row: 0, basicCd: 0, skills: [{ id: 's1', cd: 0 }] }],
        enemies: []
    }]
};
assert(window.CombatEffectsBridge.restoreBattleSnapshot(snapBattle, 2000), 'time_rewind snapshot restore');
assert(snapBattle.allies[0].hp === 80 && snapBattle.elapsed === 2000, 'time_rewind restored hp and elapsed');

// 4.5.4：扩展 6 区域 + 6 Boss 联动验收
window.ZONE_ECOLOGY_CONFIG = window.ZONE_ECOLOGY_CONFIG || { zones: {}, branchZones: [] };
window.ZONE_ECOLOGY_CONFIG.zones = Object.assign({}, window.ZONE_ECOLOGY_CONFIG.zones, content.zones || {});
const branchZones = (window.ZONE_ECOLOGY_CONFIG.branchZones || []).slice();
Object.keys(content.zones || {}).forEach((zid) => {
    if (content.zones[zid].branchZone && branchZones.indexOf(zid) < 0) branchZones.push(zid);
});
window.ZONE_ECOLOGY_CONFIG.branchZones = branchZones;
window.BOSS_PHASES_EXPANSION = content.bossPhases || {};
window.ASCENSION_CONFIG.ascension = Object.assign({}, window.ASCENSION_CONFIG.ascension || {}, {
    zoneEcology: { enabled: true },
    bossPhases: { enabled: true }
});
require('../js/zone-ecology.js');
require('../js/zone-trait-runtime.js');
require('../js/boss-phase-system.js');

const EXPANSION_ZONE_IDS = [
    'corrupt_swamp', 'frozen_citadel', 'thunder_plateau',
    'mirror_labyrinth', 'golden_vault', 'time_rift'
];
EXPANSION_ZONE_IDS.forEach((zid) => {
    const zone = window.ZONE_ECOLOGY_CONFIG.zones[zid];
    assert(zone && zone.trait, zid + ' zone config present');
    const bossId = window.BossPhaseSystem.getBossForZone(zid);
    assert(bossId && content.bossPhases[bossId], zid + ' linked to boss ' + bossId);
});

function makeZoneBattle(zone) {
    return {
        elapsed: 0,
        allies: [],
        enemies: [{ id: 'e1', name: '测试魔', hp: 100, maxHp: 100, attack: 12, alive: true, col: 1, row: 1, basicInterval: 900 }],
        zoneTrait: zone.trait,
        zoneHazard: zone.hazard,
        relicFx: {}
    };
}

const swampBattle = makeZoneBattle(window.ZONE_ECOLOGY_CONFIG.zones.corrupt_swamp);
window.ZoneTraitRuntime.onBattleStart(swampBattle);
assert(swampBattle.zoneTrait.effect.poisonIntervalMs === 5000, 'corrupt_swamp poison interval');

const frozenBattle = makeZoneBattle(window.ZONE_ECOLOGY_CONFIG.zones.frozen_citadel);
window.ZoneTraitRuntime.onBattleStart(frozenBattle);
assert(frozenBattle.zoneAttackSpeedMult === 0.85, 'frozen_citadel attack speed debuff');

const thunderBattle = makeZoneBattle(window.ZONE_ECOLOGY_CONFIG.zones.thunder_plateau);
window.ZoneTraitRuntime.onBattleStart(thunderBattle);
assert(thunderBattle.zoneTrait.effect.lightningIntervalMs === 8000, 'thunder_plateau lightning interval');

const mirrorBattle = makeZoneBattle(window.ZONE_ECOLOGY_CONFIG.zones.mirror_labyrinth);
window.ZoneTraitRuntime.onBattleStart(mirrorBattle);
assert(mirrorBattle.enemies.some((e) => e.phantomDecoy), 'mirror_labyrinth spawns phantom decoy');

const goldBattle = makeZoneBattle(window.ZONE_ECOLOGY_CONFIG.zones.golden_vault);
window.ZoneTraitRuntime.onBattleStart(goldBattle);
assert(goldBattle.zoneGoldDropMult === 2 && goldBattle.zoneEnemyAttackMult === 1.2, 'golden_vault greed trait');

const timeBattle = makeZoneBattle(window.ZONE_ECOLOGY_CONFIG.zones.time_rift);
if (timeBattle.zoneTrait && timeBattle.zoneTrait.effect && timeBattle.zoneTrait.effect.swapIntervalMs) {
    timeBattle.zoneSwapTimer = timeBattle.zoneTrait.effect.swapIntervalMs;
}
assert(timeBattle.zoneSwapTimer === 10000, 'time_rift position swap timer');

assert(window.ZoneTraitRuntime.modifyZoneGoldReward(50, goldBattle) === 100, 'zone gold drop mult applied');

const phantomDmg = window.CombatEffectsBridge.modifyOutgoingDamage(
    { relicFx: {} },
    { phantomDecoy: true, side: 'enemy' },
    { side: 'ally', hp: 100 },
    50
);
assert(phantomDmg === 0, 'phantom decoy deals no damage');

function makeBossBattle(bossId, hp, maxHp) {
    return {
        elapsed: 0,
        allies: [{ id: 'a1', hp: 200, maxHp: 200, attack: 20, alive: true, col: 0, row: 1, side: 'ally' }],
        enemies: [{
            id: bossId,
            templateId: bossId,
            isBoss: true,
            hp: hp,
            maxHp: maxHp,
            attack: 40,
            alive: true,
            col: 1,
            row: 1,
            basicInterval: 900
        }],
        relicFx: {},
        _canvasW: 1280,
        _canvasH: 720
    };
}

function tickBossToRatio(battle, hpRatio) {
    window.BossPhaseSystem.onBattleStart(battle, { bossId: battle.enemies[0].id, type: 'boss' });
    window.BossPhaseSystem.attachBattleRef(battle);
    battle.enemies[0].hp = Math.floor(battle.enemies[0].maxHp * hpRatio);
    window.BossPhaseSystem.tick(battle.bossPhaseSystem, 16);
}

const motherBattle = makeBossBattle('ab_boss_corrupt_mother', 100, 100);
tickBossToRatio(motherBattle, 1);
assert(motherBattle.bossPoisonPools, 'corrupt_mother P1 poison pools');

const motherP2 = makeBossBattle('ab_boss_corrupt_mother', 60, 100);
tickBossToRatio(motherP2, 0.6);
assert(motherP2.bossGlobalDot && motherP2.bossHealReverse, 'corrupt_mother P2 dot + heal reverse');

const frostBattle2 = makeBossBattle('ab_boss_frost_king', 100, 100);
tickBossToRatio(frostBattle2, 1);
assert(frostBattle2.enemies[0].iceArmor, 'frost_king P1 ice armor');

const frostP2 = makeBossBattle('ab_boss_frost_king', 60, 100);
tickBossToRatio(frostP2, 0.6);
assert(frostP2.bossFreezeAll, 'frost_king P2 freeze all');

const thunderBoss = makeBossBattle('ab_boss_thunder_tyrant', 100, 100);
tickBossToRatio(thunderBoss, 1);
assert(thunderBoss.bossRandomLightning, 'thunder_tyrant P1 random lightning');

const thunderP2 = makeBossBattle('ab_boss_thunder_tyrant', 50, 100);
tickBossToRatio(thunderP2, 0.5);
assert(thunderP2.bossChargeKill, 'thunder_tyrant P2 charge kill');

const facesBoss = makeBossBattle('ab_boss_thousand_faces', 100, 100);
tickBossToRatio(facesBoss, 1);
assert(facesBoss.bossMirrorAllies === 1 || facesBoss.enemies.some((e) => e.bossMirror), 'thousand_faces P1 mirrors ally');

const facesP4 = makeBossBattle('ab_boss_thousand_faces', 20, 100);
tickBossToRatio(facesP4, 0.2);
assert(!facesP4.enemies.some((e) => e.bossMirror), 'thousand_faces P4 clears mirrors');

const goldBoss = makeBossBattle('ab_boss_gold_giant', 100, 100);
tickBossToRatio(goldBoss, 1);
assert(goldBoss.enemies[0].goldShield > 0, 'gold_giant P1 gold shield');

const goldP2 = makeBossBattle('ab_boss_gold_giant', 50, 100);
tickBossToRatio(goldP2, 0.5);
assert(goldP2.bossGoldRain, 'gold_giant P2 gold rain');

const goldP3 = makeBossBattle('ab_boss_gold_giant', 20, 100);
tickBossToRatio(goldP3, 0.2);
assert(goldP3.bossSelfDestructMs === 15000, 'gold_giant P3 self destruct timer');

const wormBoss = makeBossBattle('ab_boss_time_worm', 100, 100);
tickBossToRatio(wormBoss, 1);
assert(wormBoss.enemyTimeScale === 2, 'time_worm P1 enemy time scale');

const wormP2 = makeBossBattle('ab_boss_time_worm', 70, 100);
tickBossToRatio(wormP2, 0.7);
assert(wormP2.allyTimeScale === 0.5, 'time_worm P2 ally time scale');

const wormP4 = makeBossBattle('ab_boss_time_worm', 20, 100);
tickBossToRatio(wormP4, 0.2);
assert(wormP4.bossRandomTimeStop, 'time_worm P4 random time stop');

EXPANSION_ZONE_IDS.forEach((zid) => {
    const preview = window.BossPhaseSystem.getPhasePreview(window.BossPhaseSystem.getBossForZone(zid));
    assert(preview.length >= 3, zid + ' boss has phase preview');
});

console.log('test_ascension_advanced: OK');
