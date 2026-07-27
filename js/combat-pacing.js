/**
 * 瞬间结算与战斗节奏
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function ascCfg() {
        return window.AscensionHub ? window.AscensionHub.flag('skirmishMode') : {};
    }

    function effectiveHeroAttack(hero, st) {
        let attack = (st && st.attack) || 10;
        if (typeof window.getClassDefinition === 'function') {
            const def = window.getClassDefinition(hero.baseClass);
            const bs = def && def.baseStats;
            const g = (def && def.growthPerLevel) || {};
            const lv = hero.level || 1;
            if (bs && bs.magicAttack) {
                const magic = bs.magicAttack + (g.magicAttack || 0) * (lv - 1);
                attack = Math.max(attack, magic);
            }
        }
        return attack;
    }

    function heroPower(hero) {
        if (!hero) return 0;
        const st = window.PartyMetaSystem
            ? window.PartyMetaSystem.heroCombatStats(hero)
            : { hp: hero.maxHp || 100, attack: 10, defense: 4, speed: 70 };
        const hp = hero.hp > 0 ? hero.hp : (hero.maxHp || st.hp);
        const attack = effectiveHeroAttack(hero, st);
        return hp * 0.4 + attack * 8 + (st.defense || 4) * 5 + (st.speed || 70) * 0.5;
    }

    function teamPower(heroes) {
        return (heroes || [])
            .filter((h) => (h.hp || 0) > 0)
            .reduce((s, h) => s + heroPower(h), 0);
    }

    function enemyPower(enemies) {
        return (enemies || [])
            .filter((e) => e.alive !== false && (e.hp == null || e.hp > 0))
            .reduce((s, e) => {
                const hp = e.maxHp || e.hp || 100;
                const atk = e.attack || 10;
                const def = e.defense || 4;
                const spd = e.speed || 60;
                return s + hp * 0.38 + atk * 7.5 + def * 4.5 + spd * 0.25;
            }, 0);
    }

    function resolveSkirmishLayer(node, run) {
        if (node && node.layer != null) return node.layer | 0;
        return (run && run.path && run.path.length) || 0;
    }

    function skirmishThreshold(layer) {
        const sc = ascCfg();
        const late = sc.powerRatioThreshold != null ? sc.powerRatioThreshold : 1.5;
        const bands = sc.earlyLayerThresholds || [
            { layerMax: 2, threshold: 2.0 },
            { layerMax: 5, threshold: 1.75 },
            { layerMax: 9, threshold: 1.55 }
        ];
        const L = Math.max(0, layer | 0);
        for (let i = 0; i < bands.length; i++) {
            if (L <= bands[i].layerMax) return bands[i].threshold;
        }
        return late;
    }

    function calculatePower(run, encounter) {
        const allies = (run && run.heroes) || [];
        const enemies = (encounter && encounter.enemies) || [];
        const allyP = teamPower(allies);
        const enemyP = Math.max(1, enemyPower(enemies));
        const allyN = allies.filter((h) => (h.hp || 0) > 0).length || 1;
        const enemyN = enemies.filter((e) => e.alive !== false && (e.hp == null || e.hp > 0)).length || 1;
        let ratio = allyP / enemyP;
        // 满编打少量敌人时，碾压判定比纯面板更保守（不影响真实战斗数值）
        if (enemyN < allyN) {
            ratio *= 0.82 + 0.18 * (enemyN / allyN);
        }
        return { ally: allyP, enemy: enemyP, ratio: ratio, allyCount: allyN, enemyCount: enemyN };
    }

    function canSkirmish(run, encounter, node) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('skirmishMode')) return false;
        if (node && (node.type === 'boss' || node.type === 'boss_final' || node.type === 'elite')) return false;
        const sc = ascCfg();
        const layer = resolveSkirmishLayer(node, run);
        const minLayer = sc.skirmishMinLayer != null ? sc.skirmishMinLayer : 0;
        if (layer < minLayer) return false;
        const threshold = skirmishThreshold(layer);
        const p = calculatePower(run, encounter);
        if (run.ascension && run.ascension.skirmishPreference) return p.ratio >= threshold * 0.9;
        return p.ratio >= threshold;
    }

    function resolveSkirmish(run, encounter, rng) {
        rng = rng || Math.random;
        const p = calculatePower(run, encounter);
        const winChance = Math.min(0.98, Math.max(0.55, 0.5 + (p.ratio - 1) * 0.35));
        const victory = rng() < winChance;
        const dmgPct = victory ? 0.08 + rng() * 0.12 : 0.35 + rng() * 0.25;
        const casualties = [];
        if (run && run.heroes) {
            run.heroes.forEach((h) => {
                if ((h.hp || 0) <= 0) return;
                if (victory) {
                    h.hp = Math.max(1, Math.floor(h.hp - h.maxHp * dmgPct / run.heroes.length));
                } else {
                    h.hp = Math.max(0, Math.floor(h.hp * (1 - dmgPct)));
                    if (h.hp <= 0) casualties.push(h.baseClass);
                }
            });
        }
        return {
            victory: victory,
            power: p,
            winChance: winChance,
            durationMs: 3000,
            casualties: casualties,
            goldMult: victory ? 1 : 0,
            expMult: victory ? 0.85 : 0
        };
    }

    function getMaxCombatDurationMs() {
        const hub = window.AscensionHub;
        if (hub) {
            const pacing = hub.flag('combatPacing');
            if (pacing.maxDurationMs) return pacing.maxDurationMs;
        }
        const runCfg = cfg().combat || {};
        return runCfg.maxDurationMs || 60000;
    }

    window.CombatPacing = {
        heroPower,
        teamPower,
        enemyPower,
        calculatePower,
        canSkirmish,
        resolveSkirmish,
        skirmishThreshold,
        resolveSkirmishLayer,
        getMaxCombatDurationMs
    };
})();
