/**
 * 恶魔塔（Auto-Battler）数值平衡自动测试
 *
 * 核心原则：以「真实爬塔」为准，而不是空降满血成型构筑打孤立战。
 *
 * 主测试：
 *   A. 爬塔至首个 Boss：从开局只带起始技，沿动态三选一走、领奖励、装配、休息回血
 *   B. 首 Boss 到达时的队伍画像（技能数/星级/局内等级/残血）
 *
 * 辅测试（天花板，不等于真实体验）：
 *   C. 固定构筑孤立战（标明 theoretical）
 *   D. 静态配置体检
 *
 * 用法：
 *   node tools/test_auto_battler_balance.js
 *   node tools/test_auto_battler_balance.js --quick
 *   node tools/test_auto_battler_balance.js --climb-only --repeats 20
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'artifacts');

function parseArgs(argv) {
    const args = {
        repeats: 12,
        seed: 20260725,
        quick: false,
        climbOnly: false,
        json: path.join(ART, 'ab_balance_report.json'),
        md: path.join(ART, 'ab_balance_report.md')
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--quick') args.quick = true;
        else if (a === '--climb-only') args.climbOnly = true;
        else if (a === '--repeats') args.repeats = Math.max(1, parseInt(argv[++i], 10) || 12);
        else if (a === '--seed') args.seed = parseInt(argv[++i], 10) || args.seed;
        else if (a === '--json') args.json = argv[++i];
        else if (a === '--md') args.md = argv[++i];
    }
    if (args.quick) {
        args.repeats = Math.min(args.repeats, 4);
        args.climbOnly = args.climbOnly || false;
    }
    return args;
}

function loadRuntime() {
    global.window = global;
    const baseCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/auto-battler-config.json'), 'utf8'));
    let encCfg = {};
    const encPath = path.join(ROOT, 'config/auto-battler-encounters.json');
    if (fs.existsSync(encPath)) {
        encCfg = JSON.parse(fs.readFileSync(encPath, 'utf8'));
    }
    window.CONFIG = { AUTO_BATTLER_CONFIG: Object.assign({}, baseCfg, encCfg) };

    require(path.join(ROOT, 'js/party-meta-system.js'));
    require(path.join(ROOT, 'js/run-state-system.js'));
    require(path.join(ROOT, 'js/relic-system.js'));
    require(path.join(ROOT, 'js/skill-mutation-system.js'));
    require(path.join(ROOT, 'js/enemy-composition-system.js'));
    require(path.join(ROOT, 'js/tower-run-map.js'));
    require(path.join(ROOT, 'js/auto-battle-simulator.js'));

    return {
        cfg: window.CONFIG.AUTO_BATTLER_CONFIG,
        RSS: window.RunStateSystem,
        ABS: window.AutoBattleSimulator,
        SMS: window.SkillMutationSystem,
        TRM: window.TowerRunMap,
        PMS: window.PartyMetaSystem
    };
}

function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function withSeededRandom(seed, fn) {
    const rng = mulberry32(seed);
    const orig = Math.random;
    Math.random = rng;
    try {
        return fn(rng);
    } finally {
        Math.random = orig;
    }
}

function pct(n, digits) {
    return ((n || 0) * 100).toFixed(digits != null ? digits : 1) + '%';
}

function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function partyHpRatio(run) {
    let hp = 0;
    let max = 0;
    (run.heroes || []).forEach((h) => {
        hp += Math.max(0, h.hp || 0);
        max += Math.max(1, h.maxHp || 1);
    });
    return max > 0 ? hp / max : 0;
}

function countEquippedSkills(run) {
    let n = 0;
    let stars = 0;
    (run.heroes || []).forEach((h) => {
        (h.skillSlots || []).forEach((s) => {
            if (!s) return;
            n += 1;
            stars += s.stars || 1;
        });
    });
    return { count: n, avgStars: n ? stars / n : 0 };
}

function refreshHeroVitals(run) {
    const PMS = window.PartyMetaSystem;
    const RSS = window.RunStateSystem;
    (run.heroes || []).forEach((h) => {
        const level = RSS.effectiveHeroLevel(h);
        const st = PMS.heroCombatStats({
            baseClass: h.baseClass,
            level: level,
            classData: h.classData
        });
        let maxHp = st.hp;
        Object.keys(h.equipment || {}).forEach((slot) => {
            const g = h.equipment[slot];
            if (g && g.maxHp) maxHp += g.maxHp;
        });
        const prevMax = h.maxHp || maxHp;
        const cur = h.hp == null ? prevMax : h.hp;
        const ratio = prevMax > 0 ? Math.min(1, Math.max(0, cur) / prevMax) : 1;
        h.maxHp = Math.floor(maxHp);
        h.hp = Math.min(h.maxHp, Math.floor(h.maxHp * ratio));
        if (cur > 0) h.hp = Math.max(1, h.hp);
    });
}

function initRunVitals(run) {
    const PMS = window.PartyMetaSystem;
    (run.heroes || []).forEach((h) => {
        const st = PMS.heroCombatStats({
            baseClass: h.baseClass,
            level: h.level || 1,
            classData: h.classData
        });
        h.maxHp = st.hp;
        h.hp = st.hp;
    });
}

function filledSlots(hero) {
    return (hero.skillSlots || []).filter(Boolean).length;
}

/** 模拟会装配的玩家：背包技能/装备尽量装上 */
function autoEquipFromBags(run) {
    const RSS = window.RunStateSystem;
    // 技能
    let guard = 0;
    while ((run.inventorySkills || []).length && guard++ < 40) {
        const entry = run.inventorySkills[0];
        const sid = entry && entry.id;
        if (!sid) {
            run.inventorySkills.shift();
            continue;
        }
        const candidates = (run.heroes || []).filter((h) =>
            RSS.canHeroUseSkill(h, sid) && filledSlots(h) < 4
        );
        if (!candidates.length) break;
        candidates.sort((a, b) => filledSlots(a) - filledSlots(b));
        const res = RSS.equipSkill(run, candidates[0].heroId, sid);
        if (!res || !res.ok) {
            // 无法装配则移到末尾避免死循环
            run.inventorySkills.push(run.inventorySkills.shift());
            if (guard > 20) break;
        }
    }
    // 装备：按职业匹配空槽装上
    const gearLeft = [];
    (run.inventoryGear || []).forEach((g) => {
        if (!g || !g.slot) return;
        const heroes = (run.heroes || []).filter((h) => RSS.canHeroWearGear(h, g));
        heroes.sort((a, b) => {
            const ae = a.equipment && a.equipment[g.slot] ? 1 : 0;
            const be = b.equipment && b.equipment[g.slot] ? 1 : 0;
            return ae - be;
        });
        let equipped = false;
        for (let i = 0; i < heroes.length; i++) {
            const h = heroes[i];
            if (h.equipment && h.equipment[g.slot]) continue;
            const res = RSS.equipGear(run, h.heroId, g);
            if (res && res.ok) {
                equipped = true;
                break;
            }
        }
        if (!equipped) gearLeft.push(g);
    });
    run.inventoryGear = gearLeft;
    refreshHeroVitals(run);
}

function scoreOffer(opt, run) {
    if (!opt) return -999;
    const hp = partyHpRatio(run);
    const skills = countEquippedSkills(run).count;
    const needSkills = skills < 8;
    if (opt.type === 'skill' || (opt.skill && opt.type === 'skill')) return needSkills ? 140 : 85;
    if (opt.type === 'skill_evolve') return needSkills ? 95 : 125;
    if (opt.type === 'skill_upgrade') return needSkills ? 70 : 110;
    if (opt.type === 'heal') return hp < 0.65 ? 100 : 20;
    if (opt.type === 'gear') {
        const g = opt.gear || {};
        return 45 + (g.attack || 0) + (g.maxHp || 0) * 0.15 + (g.defense || 0);
    }
    if (opt.type === 'gold') return 12;
    if (opt.type === 'relic' || opt.id) return 75;
    return 10;
}

function pickBestOption(options, run) {
    let best = 0;
    let bestScore = -1e9;
    (options || []).forEach((opt, i) => {
        const s = scoreOffer(opt, run) + i * 0.01;
        if (s > bestScore) {
            bestScore = s;
            best = i;
        }
    });
    return best;
}

function applyBattlePick(run, opt) {
    const RSS = window.RunStateSystem;
    const SMS = window.SkillMutationSystem;
    if (!opt) return;
    if (opt.type === 'skill_upgrade' && SMS) {
        SMS.applySkillUpgrade(run, opt);
    } else if (opt.type === 'skill_evolve' && SMS) {
        SMS.applySkillEvolve(run, opt);
    } else if (opt.type === 'skill' && opt.skill) {
        RSS.addSkillToInventory(run, opt.skill.id, opt.skill.stars || 1);
        run.skillsGainedThisRun = (run.skillsGainedThisRun || 0) + 1;
    } else if (opt.skill && opt.id && !opt.type) {
        // skill_pick 形态
        RSS.addSkillToInventory(run, opt.id, opt.stars || 1);
        run.skillsGainedThisRun = (run.skillsGainedThisRun || 0) + 1;
    } else if (opt.type === 'gear' && opt.gear) {
        run.inventoryGear.push(opt.gear);
        run.gearGainedThisRun = (run.gearGainedThisRun || 0) + 1;
    } else if (opt.type === 'gold') {
        run.gold += opt.amount || 20;
    } else if (opt.type === 'heal') {
        const p = opt.pct != null ? opt.pct : 0.2;
        run.heroes.forEach((h) => {
            h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * p));
        });
    } else if (opt.id && window.RelicSystem) {
        RSS.addRelic(run, opt.id);
    }
}

function grantAndPickRewards(run, node, rng) {
    const RSS = window.RunStateSystem;
    const SMS = window.SkillMutationSystem;
    const cfg = window.CONFIG.AUTO_BATTLER_CONFIG;
    const rewards = cfg.rewards || {};

    let expMin = (rewards.expPerBattle || [220, 440])[0];
    let expMax = (rewards.expPerBattle || [220, 440])[1];
    if (node.type === 'elite') {
        expMin = (rewards.expPerElite || [500, 780])[0];
        expMax = (rewards.expPerElite || [500, 780])[1];
    }
    if (node.type === 'boss' || node.type === 'boss_final') {
        expMin = (rewards.expPerBoss || [900, 1300])[0];
        expMax = (rewards.expPerBoss || [900, 1300])[1];
    }
    const exp = Math.floor(expMin + rng() * (expMax - expMin));
    run.runExpEarned = (run.runExpEarned || 0) + exp;
    RSS.grantInRunExp(run, Math.floor(exp * 0.55));
    refreshHeroVitals(run);

    let options = [];
    if (node.type === 'elite' && window.RelicSystem) {
        options = window.RelicSystem.pickRelicChoices(rng, 3, run.relics, 'elite', run) || [];
    } else if (node.type === 'boss' || node.type === 'boss_final') {
        for (let i = 0; i < 3; i++) {
            const sk = RSS.pickSkillFromPool(rng, run.heroes[i % 4]);
            options.push(RSS.makeSkillLoot(sk.id));
        }
    } else if (SMS && SMS.buildBattleOffers) {
        options = SMS.buildBattleOffers(run, rng) || [];
    } else {
        options = RSS.buildBattleDraftOptions(run, rng) || [];
    }

    if (options.length) {
        const idx = pickBestOption(options, run);
        applyBattlePick(run, options[idx]);
    }
    autoEquipFromBags(run);
}

function applyRest(run) {
    const pctHeal = ((window.CONFIG.AUTO_BATTLER_CONFIG.rewards || {}).restHealPct != null)
        ? window.CONFIG.AUTO_BATTLER_CONFIG.rewards.restHealPct
        : 0.4;
    run.heroes.forEach((h) => {
        h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * pctHeal));
    });
    // 休息处把等级点分给当前最低局内等级者
    const RSS = window.RunStateSystem;
    while ((run.pendingLevelPoints || 0) > 0) {
        const sorted = (run.heroes || []).slice().sort((a, b) => (a.runLevel || 0) - (b.runLevel || 0));
        const target = sorted[0];
        if (!target) break;
        const res = RSS.addRunLevelToHero(run, target.heroId);
        if (!res.ok) break;
    }
    refreshHeroVitals(run);
}

function fightNode(run, node, seed) {
    const ABS = window.AutoBattleSimulator;
    const battle = ABS.createBattle(run, node, { w: 960, h: 540 });
    battle.headless = true;
    battle.skipFinale = true;
    ABS.ensureBattleMetrics(battle);
    const step = 50;
    const maxMs = ((battle.combat && battle.combat.maxDurationMs) || 90000) + 2000;
    let guard = 0;
    while (!battle.finished && guard < maxMs) {
        ABS.tickBattle(battle, step);
        guard += step;
    }
    if (!battle.finished) {
        battle.finished = true;
        battle.victory = false;
    }
    ABS.syncHeroHpFromBattle(run, battle);
    refreshHeroVitals(run);
    const summary = ABS.summarizeBattleMetrics(battle);
    summary.nodeType = node.type;
    summary.layer = node.layer;
    summary.seed = seed;
    return summary;
}

function pickNextNode(map, fromId, run, rng) {
    const TRM = window.TowerRunMap;
    const edges = TRM.getReachableFrom(map, fromId) || [];
    if (!edges.length) return null;
    const nodes = edges.map((id) => TRM.getNode(map, id)).filter(Boolean);
    const hp = partyHpRatio(run);
    const skills = countEquippedSkills(run).count;

    const pending = run.pendingLevelPoints || 0;
    const score = (n) => {
        // 有等级点/残血才优先休息；满血时优先战斗以成型构筑
        if (n.type === 'rest') return pending > 0 ? 130 : (hp < 0.72 ? 110 : 28);
        if (n.type === 'boss' || n.type === 'boss_final') return 10;
        if (n.type === 'shop') return 42;
        if (n.type === 'event') return hp < 0.65 ? 70 : 38;
        if (n.type === 'elite') return (hp > 0.8 && skills >= 8) ? 40 : 8;
        if (n.type === 'battle') return hp < 0.5 ? 22 : 72;
        return 20;
    };

    nodes.sort((a, b) => score(b) - score(a) || (rng() - 0.5));
    return nodes[0].id;
}

/**
 * 真实爬塔：开局 → 首个 Boss（默认第一章 boss 层）
 * policy: competent = 会装配/会选强化；starter_only = 永不领技能（对照）
 */
function simulateClimbToBoss(seed, opts) {
    opts = opts || {};
    const TRM = window.TowerRunMap;
    const layout0 = TRM.computeActLayout ? TRM.computeActLayout()[0] : null;
    const targetLayer = opts.targetLayer != null
        ? opts.targetLayer
        : (layout0 ? layout0.bossLayer : 15);
    const policy = opts.policy || 'competent';
    const RSS = window.RunStateSystem;
    const PMS = window.PartyMetaSystem;
    const earlyHeal = ((window.CONFIG.AUTO_BATTLER_CONFIG.run || {}).earlyBattleHealPct) || 0;

    return withSeededRandom(seed, (rng) => {
        const meta = PMS.createDefaultPartyMeta();
        const run = RSS.createRunState(meta, seed);
        const runRng = RSS.rngFromRun(run);
        run.map = TRM.createEmptyMap(seed);
        TRM.generateOpeningChoices(run.map, runRng);
        initRunVitals(run);

        let nodeId = run.map.startId;
        const log = [];
        let diedAt = null;
        let bossResult = null;
        let fights = 0;

        while (nodeId) {
            const node = TRM.getNode(run.map, nodeId);
            if (!node) break;
            run.currentNodeId = nodeId;

            if (node.type === 'rest') {
                applyRest(run);
                log.push({ layer: node.layer, type: 'rest', hp: partyHpRatio(run) });
            } else if (node.type === 'shop') {
                log.push({ layer: node.layer, type: 'shop', hp: partyHpRatio(run) });
            } else if (node.type === 'event') {
                // 简化：事件给少量治疗
                run.heroes.forEach((h) => {
                    h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * 0.15));
                });
                log.push({ layer: node.layer, type: 'event', hp: partyHpRatio(run) });
            } else {
                const fightSeed = (seed ^ (node.layer * 7919) ^ fights * 104729) >>> 0;
                const summary = withSeededRandom(fightSeed, () => fightNode(run, node, fightSeed));
                fights += 1;
                log.push({
                    layer: node.layer,
                    type: node.type,
                    victory: summary.victory,
                    durationMs: summary.durationMs,
                    hpAfter: partyHpRatio(run),
                    damageShare: summary.damageShare,
                    takenShare: summary.takenShare,
                    allyDps: summary.allyDps
                });

                if (node.type === 'boss' && node.layer === targetLayer) bossResult = summary;
                if (node.type === 'boss_final') bossResult = summary;

                if (!summary.victory) {
                    diedAt = { layer: node.layer, type: node.type };
                    break;
                }

                if (node.type === 'battle' && earlyHeal > 0 && node.layer <= targetLayer) {
                    const act = TRM.getActLayoutForLayer(node.layer);
                    if (act && act.index === 0) {
                        run.heroes.forEach((h) => {
                            h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * earlyHeal));
                        });
                    }
                }

                if (policy !== 'starter_only') {
                    grantAndPickRewards(run, node, rng);
                } else {
                    const rewards = window.CONFIG.AUTO_BATTLER_CONFIG.rewards || {};
                    const exp = Math.floor(((rewards.expPerBattle || [220, 440])[0] +
                        (rewards.expPerBattle || [220, 440])[1]) / 2);
                    RSS.grantInRunExp(run, Math.floor(exp * 0.55));
                    refreshHeroVitals(run);
                }

                if (bossResult) break;
            }

            node.cleared = true;
            run.path.push(node.id);
            if (node.type === 'boss' && node.layer >= targetLayer) break;
            if (node.layer > targetLayer) break;

            TRM.generateNextChoices(run.map, node, runRng);
            nodeId = pickNextNode(run.map, nodeId, run, rng);
            if (!nodeId) break;
        }

        const skillInfo = countEquippedSkills(run);
        const runLevels = (run.heroes || []).map((h) => h.runLevel || 0);
        return {
            seed: seed,
            policy: policy,
            beatFirstBoss: !!(bossResult && bossResult.victory),
            reachedBoss: !!(bossResult || (diedAt && diedAt.type === 'boss')),
            diedAt: diedAt,
            fights: fights,
            log: log,
            boss: bossResult,
            arrival: {
                hpRatio: partyHpRatio(run),
                equippedSkills: skillInfo.count,
                avgStars: skillInfo.avgStars,
                runLevels: runLevels,
                avgRunLevel: avg(runLevels),
                bagSkills: (run.inventorySkills || []).length,
                relics: (run.relics || []).length,
                gold: run.gold || 0
            },
            finalShares: bossResult ? {
                damageShare: bossResult.damageShare,
                takenShare: bossResult.takenShare,
                durationMs: bossResult.durationMs,
                allyDps: bossResult.allyDps
            } : null
        };
    });
}

function aggregateClimbs(climbs) {
    const n = climbs.length;
    const beat = climbs.filter((c) => c.beatFirstBoss).length;
    const reached = climbs.filter((c) => c.reachedBoss || c.beatFirstBoss).length;
    const deaths = {};
    climbs.forEach((c) => {
        if (!c.diedAt) return;
        const k = c.diedAt.type + '@L' + c.diedAt.layer;
        deaths[k] = (deaths[k] || 0) + 1;
    });
    const arrivals = climbs.filter((c) => c.beatFirstBoss || c.reachedBoss).map((c) => c.arrival);
    const bossFights = climbs.filter((c) => c.boss).map((c) => c.boss);
    const share = { warrior: 0, archer: 0, mage: 0, assassin: 0 };
    const taken = { warrior: 0, archer: 0, mage: 0, assassin: 0 };
    if (bossFights.length) {
        ['warrior', 'archer', 'mage', 'assassin'].forEach((cls) => {
            share[cls] = avg(bossFights.map((b) => (b.damageShare && b.damageShare[cls]) || 0));
            taken[cls] = avg(bossFights.map((b) => (b.takenShare && b.takenShare[cls]) || 0));
        });
    }
    return {
        n: n,
        firstBossWinRate: beat / Math.max(1, n),
        reachBossRate: reached / Math.max(1, n),
        deathBreakdown: deaths,
        avgFights: avg(climbs.map((c) => c.fights)),
        avgArrivalSkills: arrivals.length ? avg(arrivals.map((a) => a.equippedSkills)) : 0,
        avgArrivalStars: arrivals.length ? avg(arrivals.map((a) => a.avgStars)) : 0,
        avgArrivalRunLevel: arrivals.length ? avg(arrivals.map((a) => a.avgRunLevel)) : 0,
        avgArrivalHp: arrivals.length ? avg(arrivals.map((a) => a.hpRatio)) : 0,
        bossDamageShare: share,
        bossTakenShare: taken,
        avgBossDurationMs: bossFights.length ? avg(bossFights.map((b) => b.durationMs)) : 0
    };
}

function fmtShare(share) {
    return ['warrior', 'archer', 'mage', 'assassin']
        .map((c) => `${c}:${pct((share && share[c]) || 0)}`)
        .join('  ');
}

function staticAudit(cfg, ABS) {
    const sc = cfg.enemyScaling || {};
    const layers = [0, 3, 8, 13, 20, 26];
    const curve = layers.map((L) => {
        const s = ABS.scaleForNode('battle', L);
        return {
            layer: L,
            scale: s,
            hpMultEffective: s * (sc.hpMult != null ? sc.hpMult : 1),
            atkMultEffective: s * (sc.attackMult != null ? sc.attackMult : 1),
            bossHp: ABS.scaleForNode('boss', L) * (sc.hpMult != null ? sc.hpMult : 1)
        };
    });
    return { curve, enemyScaling: sc, classCombatBias: (cfg.combat || {}).classCombatBias || {} };
}

function evaluateWarnings(report) {
    const warns = [];
    const push = (level, code, msg, extra) => warns.push({ level, code, msg, extra: extra || null });
    const climb = report.climb && report.climb.competent;
    if (climb) {
        if (climb.firstBossWinRate < 0.25) {
            push('warn', 'first_boss_too_hard',
                `会装配的爬塔 Bot 首 Boss 胜率仅 ${pct(climb.firstBossWinRate)}，与“难打过第一 Boss”体感一致`,
                climb);
        } else if (climb.firstBossWinRate > 0.75) {
            push('warn', 'first_boss_too_easy',
                `爬塔 Bot 首 Boss 胜率 ${pct(climb.firstBossWinRate)}，偏容易`,
                climb);
        }
        if (climb.reachBossRate > 0 && climb.avgArrivalSkills < 6) {
            push('info', 'low_skill_count_at_boss',
                `抵达首 Boss 时装配技能总数均值仅 ${climb.avgArrivalSkills.toFixed(1)}`,
                climb);
        }
        if (climb.reachBossRate === 0) {
            push('warn', 'cannot_reach_first_boss',
                '爬塔 Bot 根本到不了首 Boss（多死在中途战），难度曲线前段过陡',
                climb.deathBreakdown);
        }
        if (climb.reachBossRate > 0) {
            const asn = climb.bossDamageShare.assassin || 0;
            if (asn > 0.42) push('warn', 'assassin_dps_dominant', `首 Boss 战刺客伤害占比 ${pct(asn)}`, climb.bossDamageShare);
            if (asn < 0.1 && climb.firstBossWinRate < 0.5) {
                push('info', 'assassin_underperforming', `首 Boss 战刺客占比仅 ${pct(asn)}`, climb.bossDamageShare);
            }
            const wTaken = climb.bossTakenShare.warrior || 0;
            if (wTaken < 0.28) push('warn', 'warrior_not_tanking', `首 Boss 战士承伤 ${pct(wTaken)}`, climb.bossTakenShare);
        }
    }
    if (report.climb && report.climb.starter_only) {
        const s = report.climb.starter_only;
        if (s.firstBossWinRate > 0.15) {
            push('info', 'starter_can_boss', '仅起始技也能打过首 Boss，前期成长价值偏低', s);
        }
    }
    return warns;
}

function toMarkdown(report) {
    const lines = [];
    lines.push('# 恶魔塔 Auto-Battler 数值平衡报告');
    lines.push('');
    lines.push(`- 生成时间：${report.generatedAt}`);
    lines.push(`- seed=${report.seed}  repeats=${report.repeats}  quick=${report.quick}`);
    lines.push('');
    lines.push('> **主结论以「爬塔至首 Boss」为准。** 下文「孤立战天花板」是空降构筑，不能代表真实开荒体验。');
    lines.push('');

    lines.push('## 告警');
    lines.push('');
    if (!report.warnings.length) lines.push('_无阈值告警_');
    else report.warnings.forEach((w) => lines.push(`- **[${w.level}]** \`${w.code}\` ${w.msg}`));
    lines.push('');

    lines.push('## A. 爬塔至首个 Boss（层 8）——主测试');
    lines.push('');
    Object.keys(report.climb || {}).forEach((key) => {
        const c = report.climb[key];
        lines.push(`### 策略：\`${key}\``);
        lines.push('');
        lines.push(`| 指标 | 值 |`);
        lines.push(`|---|---|`);
        lines.push(`| 样本数 | ${c.n} |`);
        lines.push(`| 首 Boss 胜率 | **${pct(c.firstBossWinRate)}** |`);
        lines.push(`| 到达 Boss 率 | ${pct(c.reachBossRate)} |`);
        lines.push(`| 平均战斗场次 | ${c.avgFights.toFixed(1)} |`);
        lines.push(`| 抵达时装配技能数 | ${c.avgArrivalSkills.toFixed(1)} |`);
        lines.push(`| 抵达时技能均星 | ${c.avgArrivalStars.toFixed(2)} |`);
        lines.push(`| 抵达时局内等级(人均) | ${c.avgArrivalRunLevel.toFixed(2)} |`);
        lines.push(`| 抵达时残血 | ${pct(c.avgArrivalHp)} |`);
        lines.push(`| Boss 战均时 | ${(c.avgBossDurationMs / 1000).toFixed(1)}s |`);
        lines.push(`| Boss 伤害占比 | ${fmtShare(c.bossDamageShare)} |`);
        lines.push(`| Boss 承伤占比 | ${fmtShare(c.bossTakenShare)} |`);
        lines.push('');
        const deathKeys = Object.keys(c.deathBreakdown || {});
        if (deathKeys.length) {
            lines.push('阵亡分布：' + deathKeys.map((k) => `${k}×${c.deathBreakdown[k]}`).join('，'));
            lines.push('');
        }
    });

    lines.push('## B. 静态敌人缩放');
    lines.push('');
    lines.push('| 层 | 普通有效HP | Boss有效HP |');
    lines.push('|---|---:|---:|');
    (report.static.curve || []).forEach((r) => {
        lines.push(`| ${r.layer} | ${r.hpMultEffective.toFixed(2)} | ${(r.bossHp || 0).toFixed(2)} |`);
    });
    lines.push('');

    if (report.theoretical && report.theoretical.length) {
        lines.push('## C. 孤立战天花板（理论参考，非真实开荒）');
        lines.push('');
        lines.push('| 标签 | 节点 | 胜率 | 均时 | 说明 |');
        lines.push('|---|---|---:|---:|---|');
        report.theoretical.forEach((t) => {
            lines.push(`| ${t.label} | ${t.node} | ${pct(t.winRate)} | ${(t.avgDurationMs / 1000).toFixed(1)}s | ${t.note} |`);
        });
        lines.push('');
    }

    lines.push('## 解读');
    lines.push('');
    lines.push('1. 真实难度看 **A. 首 Boss 胜率**，不要看空降 Lv10/3★ 的孤立战。');
    lines.push('2. 若 A 很低：应降前期/Boss 缩放，或加快技能获取与装配反馈。');
    lines.push('3. 游戏内新技能进背包需手动装配；测试 Bot 会自动装配（competent），仍打不过说明数值本身偏难。');
    lines.push('');
    return lines.join('\n');
}

/** 少量孤立战：仅作天花板对照 */
function runTheoreticalSpotChecks(repeats, seed) {
    const RSS = window.RunStateSystem;
    const ABS = window.AutoBattleSimulator;
    const PMS = window.PartyMetaSystem;
    const out = [];

    function onePreset(label, note, setup, node, baseSeed) {
        const trials = [];
        for (let i = 0; i < repeats; i++) {
            const s = (baseSeed + i * 97) >>> 0;
            withSeededRandom(s, () => {
                const meta = PMS.createDefaultPartyMeta();
                const run = RSS.createRunState(meta, s);
                initRunVitals(run);
                setup(run);
                refreshHeroVitals(run);
                trials.push(fightNode(run, node, s));
            });
        }
        out.push({
            label: label,
            note: note,
            node: node.type + '@L' + node.layer,
            winRate: trials.filter((t) => t.victory).length / Math.max(1, trials.length),
            avgDurationMs: avg(trials.map((t) => t.durationMs))
        });
    }

    onePreset(
        '仅起始技满血',
        '接近真实开局战力',
        () => {},
        { type: 'boss', layer: 15 },
        seed + 1
    );

    onePreset(
        '空降中期(不现实)',
        '旧脚本高估来源：Lv10+3技3★',
        (run) => {
            const map = {
                warrior: ['shield_slam', 'cleave', 'iron_will'],
                archer: ['backstep_shot', 'hunters_mark', 'volley'],
                mage: ['fireball', 'chain_lightning', 'arcane_shield'],
                assassin: ['shadow_pierce', 'backstab', 'death_mark']
            };
            run.heroes.forEach((h) => {
                h.level = 10;
                h.runLevel = 0;
                const ids = map[h.baseClass] || [];
                h.skillSlots = ids.map((id) => RSS.makeSkillEntry(id, 3));
                while (h.skillSlots.length < 4) h.skillSlots.push(null);
            });
        },
        { type: 'boss', layer: 15 },
        seed + 2
    );

    return out;
}

function main() {
    const args = parseArgs(process.argv);
    console.log('加载运行时...');
    const { cfg, ABS } = loadRuntime();
    if (!fs.existsSync(ART)) fs.mkdirSync(ART, { recursive: true });

    const t0 = Date.now();
    const climb = {};

    console.log(`\n[主测试] 爬塔→首 Boss × ${args.repeats}（competent：会装配）`);
    const competentClimbs = [];
    for (let i = 0; i < args.repeats; i++) {
        const s = (args.seed + i * 104729) >>> 0;
        process.stdout.write(`  climb ${i + 1}/${args.repeats} ...\r`);
        competentClimbs.push(simulateClimbToBoss(s, { policy: 'competent' }));
    }
    process.stdout.write('\n');
    climb.competent = aggregateClimbs(competentClimbs);

    if (!args.quick) {
        console.log(`[对照] 爬塔→首 Boss × ${Math.max(2, Math.floor(args.repeats / 2))}（starter_only：不拿新技能）`);
        const starterClimbs = [];
        const n = Math.max(2, Math.floor(args.repeats / 2));
        for (let i = 0; i < n; i++) {
            const s = (args.seed + 900000 + i * 2246822519) >>> 0;
            starterClimbs.push(simulateClimbToBoss(s, { policy: 'starter_only' }));
        }
        climb.starter_only = aggregateClimbs(starterClimbs);
    }

    let theoretical = [];
    if (!args.climbOnly) {
        console.log('[辅测试] 孤立战天花板对照');
        theoretical = runTheoreticalSpotChecks(args.quick ? 2 : 4, args.seed);
    }

    const report = {
        generatedAt: new Date().toISOString(),
        seed: args.seed,
        repeats: args.repeats,
        quick: !!args.quick,
        climb: climb,
        theoretical: theoretical,
        static: staticAudit(cfg, ABS),
        warnings: [],
        samples: {
            competent: competentClimbs.slice(0, 3).map((c) => ({
                beatFirstBoss: c.beatFirstBoss,
                diedAt: c.diedAt,
                arrival: c.arrival,
                fights: c.fights
            }))
        }
    };
    report.warnings = evaluateWarnings(report);

    fs.writeFileSync(args.json, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(args.md, toMarkdown(report), 'utf8');

    console.log('\n========== 主结论（爬塔） ==========');
    const c = climb.competent;
    console.log(`首 Boss 胜率: ${pct(c.firstBossWinRate)}  (到达率 ${pct(c.reachBossRate)})`);
    console.log(`抵达画像: 技能${c.avgArrivalSkills.toFixed(1)} / 均星${c.avgArrivalStars.toFixed(2)} / 局内Lv${c.avgArrivalRunLevel.toFixed(2)} / 残血${pct(c.avgArrivalHp)}`);
    console.log(`Boss 伤害占比: ${fmtShare(c.bossDamageShare)}`);
    console.log(`Boss 承伤占比: ${fmtShare(c.bossTakenShare)}`);
    if (Object.keys(c.deathBreakdown).length) {
        console.log('阵亡分布:', c.deathBreakdown);
    }
    report.warnings.forEach((w) => console.log(`[${w.level}] ${w.code}: ${w.msg}`));
    if (theoretical.length) {
        console.log('\n孤立战对照（勿当作真实体验）:');
        theoretical.forEach((t) => console.log(`  ${t.label}: ${pct(t.winRate)} @${t.node} — ${t.note}`));
    }
    console.log(`\n报告: ${args.md}\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
