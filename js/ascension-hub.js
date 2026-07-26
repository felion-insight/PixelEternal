/**
 * Ascension 集成枢纽：统一读取开关、挂载战斗/Run 钩子
 */
(function () {
    'use strict';

    function ascensionCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.ASCENSION) ||
            (typeof window !== 'undefined' && window.ASCENSION_CONFIG) ||
            {};
    }

    function isEnabled(path) {
        const cfg = ascensionCfg();
        const parts = path.split('.');
        let cur = cfg;
        for (let i = 0; i < parts.length; i++) {
            if (!cur || typeof cur !== 'object') return false;
            cur = cur[parts[i]];
        }
        return !!(cur && (cur.enabled === true || cur.enabled === undefined && cur === true));
    }

    function flag(key) {
        const cfg = ascensionCfg();
        const a = cfg.ascension || cfg;
        return a[key] || {};
    }

    function createDefaultRunAscension() {
        return {
            corruption: 0,
            pact: null,
            activeChains: [],
            synergies: [],
            commanderUnlocks: [],
            deathStats: {},
            zoneId: null,
            battlesInZone: 0,
            triggeredCorruptionThresholds: [],
            visionPenalty: 0,
            cursedRelicIds: [],
            analytics: null,
            skirmishPreference: false,
            battleSpeedScale: 1
        };
    }

    function createDefaultMetaAscension() {
        return {
            demonPactUnlocked: false,
            speedUnlock: { x2: false, x3: false },
            deathArchive: [],
            metaUnlocks: [],
            completedChains: [],
            unlockedCommanderAbilities: [],
            runsWithVictory: 0,
            firstVictory: false
        };
    }

    function normalizeRunAscension(raw) {
        const def = createDefaultRunAscension();
        if (!raw || typeof raw !== 'object') return def;
        def.corruption = Math.max(0, raw.corruption | 0 || 0);
        def.pact = raw.pact || null;
        def.activeChains = Array.isArray(raw.activeChains) ? raw.activeChains.slice() : [];
        def.synergies = Array.isArray(raw.synergies) ? raw.synergies.slice() : [];
        def.commanderUnlocks = Array.isArray(raw.commanderUnlocks) ? raw.commanderUnlocks.slice() : [];
        def.deathStats = raw.deathStats && typeof raw.deathStats === 'object' ? Object.assign({}, raw.deathStats) : {};
        def.zoneId = raw.zoneId || null;
        def.battlesInZone = raw.battlesInZone | 0 || 0;
        def.triggeredCorruptionThresholds = Array.isArray(raw.triggeredCorruptionThresholds)
            ? raw.triggeredCorruptionThresholds.slice() : [];
        def.visionPenalty = raw.visionPenalty || 0;
        def.cursedRelicIds = Array.isArray(raw.cursedRelicIds) ? raw.cursedRelicIds.slice() : [];
        def.skirmishPreference = !!raw.skirmishPreference;
        def.battleSpeedScale = raw.battleSpeedScale || 1;
        return def;
    }

    function normalizeMetaAscension(raw) {
        const def = createDefaultMetaAscension();
        if (!raw || typeof raw !== 'object') return def;
        def.demonPactUnlocked = !!raw.demonPactUnlocked;
        def.speedUnlock = Object.assign({ x2: false, x3: false }, raw.speedUnlock || {});
        def.deathArchive = Array.isArray(raw.deathArchive) ? raw.deathArchive.slice() : [];
        def.metaUnlocks = Array.isArray(raw.metaUnlocks) ? raw.metaUnlocks.slice() : [];
        def.completedChains = Array.isArray(raw.completedChains) ? raw.completedChains.slice() : [];
        def.unlockedCommanderAbilities = Array.isArray(raw.unlockedCommanderAbilities)
            ? raw.unlockedCommanderAbilities.slice() : [];
        def.runsWithVictory = raw.runsWithVictory | 0 || 0;
        def.firstVictory = !!raw.firstVictory;
        return def;
    }

    function onStartRun(run, meta) {
        if (!run) return;
        run.ascension = normalizeRunAscension(run.ascension);
        if (meta) meta.ascension = normalizeMetaAscension(meta.ascension);

        const pactCfg = flag('demonPact');
        if (isEnabled('demonPact') && meta && meta.ascension) {
            if (!pactCfg.unlockAfterVictory || meta.ascension.demonPactUnlocked || meta.ascension.firstVictory) {
                meta.ascension.demonPactUnlocked = true;
            }
        }

        if (window.RunAnalytics && isEnabled('deathNarrative')) {
            run.ascension.analytics = window.RunAnalytics.create(run);
        }
        if (window.ZoneEcology && isEnabled('zoneEcology')) {
            window.ZoneEcology.onRunStart(run);
        }
        if (window.SynergyMatrix && isEnabled('synergyMatrix')) {
            window.SynergyMatrix.refreshFromRun(run);
        }
        if (window.CurseSystem && isEnabled('curseSystem')) {
            window.CurseSystem.onRunStart(run);
        }
        if (window.EventChainSystem && isEnabled('eventChains')) {
            window.EventChainSystem.onRunStart(run);
        }
        if (window.WeatherSystem) window.WeatherSystem.onRunStart(run);
    }

    function onBattleStart(run, battle, node) {
        if (!run || !battle) return;
        run.ascension = normalizeRunAscension(run.ascension);

        if (window.ZoneEcology && isEnabled('zoneEcology')) {
            window.ZoneEcology.onBattleStart(run, battle);
        }
        if (window.WeatherSystem) window.WeatherSystem.onBattleStart(run, battle);
        if (window.BondSystem) window.BondSystem.applyToBattle(run, battle);
        if (window.MutatedNodeSystem && node) window.MutatedNodeSystem.applyToBattle(battle, node);
        if (window.CurseSystem && isEnabled('curseSystem')) {
            window.CurseSystem.onBattleStart(run, battle);
        }
        if (window.BossPhaseSystem && isEnabled('bossPhases')) {
            window.BossPhaseSystem.onBattleStart(battle, node);
        }
        if (window.CommanderMode && isEnabled('commanderMode')) {
            const cmCfg = flag('commanderMode');
            const forceTutorial = cmCfg.tutorialBossRequired && node &&
                (node.type === 'boss' || node.type === 'boss_final') &&
                run.path && run.path.length < 3;
            battle.commanderMode = window.CommanderMode.create(battle, run, {
                forcedTutorial: forceTutorial
            });
        }
        if (window.JuiceCore && isEnabled('juiceSystem')) {
            battle.juiceSystem = window.JuiceCore.create(battle);
        }
        if (window.SynergyMatrix && isEnabled('synergyMatrix')) {
            window.SynergyMatrix.applyCombatEffects(run, battle);
        }
        if (window.RunAnalytics && run.ascension.analytics) {
            window.RunAnalytics.onBattleStart(run.ascension.analytics, battle, node);
        }
        if (window.CombatEffectsBridge) window.CombatEffectsBridge.finalizeBattle(battle, run);
    }

    function onTickBattle(battle, dtMs) {
        if (!battle) return dtMs;
        let effectiveDt = dtMs;

        const speedCfg = flag('battleSpeed');
        if (speedCfg.enabled !== false && battle.timeScale != null) {
            effectiveDt = dtMs * battle.timeScale;
        }

        if (battle.hitStopFrames > 0) {
            battle.hitStopFrames--;
            return 0;
        }

        if (window.CommanderMode && battle.commanderMode && isEnabled('commanderMode')) {
            window.CommanderMode.tick(battle.commanderMode, effectiveDt);
        }
        if (window.BossPhaseSystem && battle.bossPhaseSystem && isEnabled('bossPhases')) {
            window.BossPhaseSystem.tick(battle.bossPhaseSystem, effectiveDt);
        }
        if (window.JuiceCore && battle.juiceSystem && isEnabled('juiceSystem')) {
            window.JuiceCore.tick(battle.juiceSystem, effectiveDt);
        }
        if (window.WeatherSystem) window.WeatherSystem.tick(battle, effectiveDt);

        if (battle.timeStopRemaining > 0) {
            battle.timeStopRemaining = Math.max(0, battle.timeStopRemaining - effectiveDt);
            battle.enemyTimeScale = 0;
        } else {
            battle.enemyTimeScale = 1;
        }

        return effectiveDt;
    }

    function onDamage(battle, attacker, target, dmg, meta) {
        if (!battle || !(dmg > 0)) return;
        if (window.CommanderMode && battle.commanderMode && target.side === 'ally' && isEnabled('commanderMode')) {
            window.CommanderMode.onAllyDamage(battle.commanderMode, target, dmg);
        }
        if (window.JuiceCore && battle.juiceSystem && isEnabled('juiceSystem') && !battle.trueModeNoNumbers) {
            window.JuiceCore.onDamage(battle.juiceSystem, attacker, target, dmg, meta);
        }
        if (window.RunAnalytics && battle.runRef && battle.runRef.ascension && battle.runRef.ascension.analytics) {
            window.RunAnalytics.recordDamage(battle.runRef.ascension.analytics, attacker, target, dmg, meta);
        }
    }

    function onKill(battle, attacker, target) {
        if (!battle) return;
        if (window.CombatEffectsBridge) window.CombatEffectsBridge.onKill(battle, attacker, target);
        if (window.CommanderMode && battle.commanderMode && attacker && attacker.side === 'ally' && isEnabled('commanderMode')) {
            window.CommanderMode.onAllyKill(battle.commanderMode);
        }
        if (window.JuiceCore && battle.juiceSystem && isEnabled('juiceSystem') && !battle.trueModeNoNumbers) {
            window.JuiceCore.onKill(battle.juiceSystem, attacker, target);
        }
        if (window.RunAnalytics && battle.runRef && battle.runRef.ascension && battle.runRef.ascension.analytics) {
            window.RunAnalytics.recordKill(battle.runRef.ascension.analytics, attacker, target);
        }
    }

    function onCombatEnd(run, battle, victory) {
        if (!run) return;
        run.ascension = normalizeRunAscension(run.ascension);

        if (window.CurseSystem && isEnabled('curseSystem')) {
            window.CurseSystem.onCombatEnd(run, battle, victory);
        }
        if (window.ZoneEcology && isEnabled('zoneEcology')) {
            window.ZoneEcology.onCombatEnd(run, victory);
        }
        if (window.WeatherSystem) window.WeatherSystem.onCombatEnd(run);
        if (window.RunAnalytics && run.ascension.analytics) {
            window.RunAnalytics.onCombatEnd(run.ascension.analytics, battle, victory);
        }
        if (window.DeathNarrative && !victory && isEnabled('deathNarrative')) {
            const meta = typeof window !== 'undefined' && window.__partyMetaRef;
            window.DeathNarrative.onRunDeath(run, battle, meta);
        }
    }

    function onRelicAcquired(run, relicId) {
        if (!run || !relicId) return;
        if (window.SynergyMatrix && isEnabled('synergyMatrix')) {
            window.SynergyMatrix.onRelicAcquired(run, relicId);
        }
        if (window.CurseSystem && isEnabled('curseSystem')) {
            window.CurseSystem.onRelicAcquired(run, relicId);
        }
    }

    function onRunVictory(meta) {
        if (!meta) return;
        meta.ascension = normalizeMetaAscension(meta.ascension);
        meta.ascension.runsWithVictory += 1;
        meta.ascension.firstVictory = true;
        const speedCfg = flag('battleSpeed');
        if (speedCfg.unlockX2AfterVictory) meta.ascension.speedUnlock.x2 = true;
        if (speedCfg.unlockX3AfterVictory) meta.ascension.speedUnlock.x3 = true;
        const pactCfg = flag('demonPact');
        if (pactCfg.unlockAfterVictory) meta.ascension.demonPactUnlocked = true;
    }

    window.AscensionHub = {
        ascensionCfg,
        isEnabled,
        flag,
        createDefaultRunAscension,
        createDefaultMetaAscension,
        normalizeRunAscension,
        normalizeMetaAscension,
        onStartRun,
        onBattleStart,
        onTickBattle,
        onDamage,
        onKill,
        onCombatEnd,
        onRelicAcquired,
        onRunVictory
    };
})();
