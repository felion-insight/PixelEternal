/**
 * Boss 阶段机制框架 + 四 Boss 配置
 */
(function () {
    'use strict';

    const BOSS_PHASES = Object.assign({
        ab_boss_warden: {
            name: '狱门守将',
            phases: [
                { threshold: 1.0, id: 'p1', label: '守门', hint: '使用集火突破护盾' },
                { threshold: 0.60, id: 'p2', label: '狱火', hint: '后撤躲避范围技', spawnAdds: 2 },
                { threshold: 0.25, id: 'p3', label: '狂怒', hint: '护盾爆发抵挡爆发', attackMult: 1.3 }
            ]
        },
        ab_boss_tyrant: {
            name: '炼狱暴君',
            phases: [
                { threshold: 1.0, id: 'p1', label: '暴君', hint: '分散站位' },
                { threshold: 0.65, id: 'p2', label: '点名', hint: '观察安全区切换', aoe: true },
                { threshold: 0.35, id: 'p3', label: '吸收', hint: '优先清理小兵', absorbMinions: true }
            ]
        },
        ab_boss_harbinger: {
            name: '深渊先驱',
            phases: [
                { threshold: 1.0, id: 'p1', label: '先驱', hint: '打断治疗' },
                { threshold: 0.7, id: 'p2', label: '链接', hint: '打破能量链接', linkAdds: true },
                { threshold: 0.4, id: 'p3', label: '反转', hint: '治疗会伤害友方', healReverse: true }
            ]
        },
        ab_final: {
            name: '终末魔王',
            phases: [
                { threshold: 1.0, id: 'p1', label: '镜像', hint: '识别真身', mirror: true },
                { threshold: 0.75, id: 'p2', label: '禁令', hint: '指挥官受限 5 秒', disableCommanderMs: 5000 },
                { threshold: 0.5, id: 'p3', label: '加速', hint: '时间压力', timeScale: 1.5 },
                { threshold: 0.25, id: 'p4', label: '幻影', hint: '三 Boss 幻影', phantomBosses: 3 }
            ]
        }
    }, typeof window !== 'undefined' ? (window.BOSS_PHASES_EXPANSION || {}) : {});

    function affectedBosses() {
        const hub = window.AscensionHub;
        if (!hub) return Object.keys(BOSS_PHASES);
        const cfg = hub.flag('bossPhases');
        return cfg.affectedBosses || Object.keys(BOSS_PHASES);
    }

    function findBoss(battle) {
        return (battle.enemies || []).find((e) => e.isBoss || (e.id && e.id.indexOf('boss') >= 0) || (e.id && e.id === 'ab_final'));
    }

    function onBattleStart(battle, node) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('bossPhases')) return;
        const boss = findBoss(battle);
        if (!boss) return;
        const templateId = boss.templateId || boss.id || (node && node.bossId);
        if (affectedBosses().indexOf(templateId) < 0 && affectedBosses().indexOf(boss.id) < 0) return;
        const def = BOSS_PHASES[templateId] || BOSS_PHASES[boss.id];
        if (!def) return;
        battle.bossPhaseSystem = {
            boss: boss,
            templateId: templateId,
            def: def,
            currentPhase: 0,
            triggered: new Set()
        };
        boss.isBoss = true;
    }

    function transition(battle, bps, phaseIdx, phaseDef) {
        bps.currentPhase = phaseIdx;
        if (phaseDef.attackMult && bps.boss) {
            bps.boss.attack = Math.floor((bps.boss.baseAttack || bps.boss.attack) * phaseDef.attackMult);
        }
        if (phaseDef.timeScale) battle.timeScale = phaseDef.timeScale;
        if (battle.commanderMode) {
            if (phaseDef.disableCommanderMs) {
                const now = battle.elapsed != null ? battle.elapsed : 0;
                battle.commanderMode.enabled = false;
                battle.commanderMode.commanderDisabledUntil = now + phaseDef.disableCommanderMs;
            } else if (phaseDef.disableCommander) {
                battle.commanderMode.enabled = false;
                battle.commanderMode.commanderDisabledUntil = null;
            }
        }
        if (phaseDef.spawnAdds && window.AutoBattleSimulator && window.AutoBattleSimulator.spawnTraitEnemy) {
            for (let i = 0; i < phaseDef.spawnAdds; i++) {
                window.AutoBattleSimulator.spawnTraitEnemy(battle, 'ab_grunt', i % 3, i % 4, 0.7);
            }
        }
        if (phaseDef.spawnPoisonPools) battle.bossPoisonPools = true;
        if (phaseDef.globalDot) battle.bossGlobalDot = true;
        if (phaseDef.healReverse) battle.bossHealReverse = true;
        if (phaseDef.iceArmor && bps.boss) bps.boss.iceArmor = true;
        if (phaseDef.freezeAll) battle.bossFreezeAll = true;
        if (phaseDef.blizzard) battle.bossBlizzard = true;
        if (phaseDef.chargeKill) battle.bossChargeKill = true;
        if (phaseDef.goldShield && bps.boss) bps.boss.goldShield = Math.floor(bps.boss.maxHp * 0.3);
        if (phaseDef.selfDestructTimerMs) battle.bossSelfDestructMs = phaseDef.selfDestructTimerMs;
        else if (phaseDef.selfDestruct) battle.bossSelfDestructMs = 30000;
        if (phaseDef.enemyTimeScale) battle.enemyTimeScale = phaseDef.enemyTimeScale;
        if (phaseDef.allyTimeScale != null) battle.allyTimeScale = phaseDef.allyTimeScale;
        if (phaseDef.timeAccel) battle.enemyTimeScale = 2;
        if (phaseDef.timeSlow) battle.timeScale = 0.5;
        if (phaseDef.rewindMs) battle.bossRewindMs = phaseDef.rewindMs;
        if (phaseDef.randomTimeStop || phaseDef.randomTimeStopZones) battle.bossRandomTimeStop = true;
        if (phaseDef.randomLightning) battle.bossRandomLightning = true;
        if (phaseDef.goldRain) battle.bossGoldRain = true;
        if (phaseDef.absorbPools) battle.bossAbsorbPools = true;
        if (phaseDef.attackSpeedMult && bps.boss) {
            bps.boss.basicInterval = Math.max(200, Math.floor((bps.boss.basicInterval || 900) / phaseDef.attackSpeedMult));
        }
        if (phaseDef.mirrorAllies && battle.allies && window.AutoBattleSimulator) {
            const count = typeof phaseDef.mirrorAllies === 'number' ? phaseDef.mirrorAllies : 1;
            for (let i = 0; i < count && i < battle.allies.length; i++) {
                const a = battle.allies[i];
                const mirror = Object.assign({}, a, {
                    id: 'boss_mirror_' + i + '_' + Date.now(),
                    side: 'enemy',
                    bossMirror: true,
                    col: Math.min(3, (a.col || 0) + 2),
                    hp: Math.floor(a.hp * 0.85),
                    maxHp: Math.floor(a.maxHp * 0.85),
                    attack: Math.floor(a.attack * 0.9),
                    alive: true
                });
                battle.enemies.push(mirror);
            }
            window.AutoBattleSimulator.reanchorBattle(battle, battle._canvasW || 1280, battle._canvasH || 720);
        }
        if (phaseDef.revealTrueForm) {
            battle.enemies = (battle.enemies || []).filter((e) => !e.bossMirror);
            if (bps.boss) {
                bps.boss.attack = Math.floor((bps.boss.attack || 10) * 1.25);
            }
        }
        if (phaseDef.sizeMult && bps.boss) {
            bps.boss.maxHp = Math.floor(bps.boss.maxHp * phaseDef.sizeMult);
            bps.boss.hp = bps.boss.maxHp;
            bps.boss.attack = Math.floor(bps.boss.attack * phaseDef.sizeMult);
        }
        if (phaseDef.mirrorAllies) battle.bossMirrorAllies = phaseDef.mirrorAllies;
        battle.bossPhaseBanner = {
            text: phaseDef.label,
            hint: phaseDef.hint,
            life: 2500,
            maxLife: 2500
        };
        if (battle.juiceSystem && window.JuiceCore) {
            window.JuiceCore.trigger(battle.juiceSystem, 'boss_phase', { label: phaseDef.label });
        }
        if (window.SynergyVfx) window.SynergyVfx.onSynergy(battle, '#cc2244');
    }

    function tick(bps, dtMs) {
        if (!bps || !bps.boss || !bps.def) return;
        const battle = bps.battle || (bps.boss && bps.boss._battleRef);
        if (!battle) return;
        const boss = bps.boss;
        if (!boss.alive || boss.hp <= 0) return;
        const ratio = boss.hp / Math.max(1, boss.maxHp);
        const phases = bps.def.phases || [];
        phases.forEach((ph, idx) => {
            if (ratio <= ph.threshold && !bps.triggered.has(idx)) {
                bps.triggered.add(idx);
                transition(battle, bps, idx, ph);
            }
        });
        if (battle && battle.bossPhaseBanner) {
            battle.bossPhaseBanner.life -= dtMs;
            if (battle.bossPhaseBanner.life <= 0) battle.bossPhaseBanner = null;
        }
    }

    function attachBattleRef(battle) {
        if (battle.bossPhaseSystem) {
            battle.bossPhaseSystem.battle = battle;
            if (battle.bossPhaseSystem.boss) battle.bossPhaseSystem.boss._battleRef = battle;
        }
    }

    function getPhasePreview(templateId) {
        const def = BOSS_PHASES[templateId];
        if (!def) return [];
        return (def.phases || []).map((p) => ({ label: p.label, hint: p.hint, threshold: p.threshold }));
    }

    function getBossForZone(zoneId) {
        const phases = BOSS_PHASES;
        return Object.keys(phases).find((id) => phases[id].zone === zoneId) || null;
    }

    window.BossPhaseSystem = {
        BOSS_PHASES,
        onBattleStart,
        tick,
        attachBattleRef,
        getPhasePreview,
        getBossForZone,
        findBoss
    };
})();
