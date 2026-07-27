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
        const ratio = Math.max(0.01, p.ratio);
        const winChance = Math.min(0.95, Math.max(0.05, 0.5 + (ratio - 1) * 0.3));
        const victory = rng() < winChance;
        let hpLossPct;
        if (victory) {
            hpLossPct = 0.3 / ratio + rng() * 0.1;
            hpLossPct = Math.min(0.45, Math.max(0.05, hpLossPct));
        } else {
            hpLossPct = 0.6 + rng() * 0.3;
        }
        const casualties = [];
        const heroSnapshots = [];
        if (run && run.heroes) {
            run.heroes.forEach((h) => {
                if ((h.hp || 0) <= 0) return;
                const before = h.hp;
                let after = before;
                if (victory) {
                    after = Math.max(1, Math.floor(before - h.maxHp * hpLossPct / run.heroes.length));
                } else {
                    after = Math.max(0, Math.floor(before * (1 - hpLossPct)));
                    if (after <= 0) casualties.push(h.baseClass);
                }
                heroSnapshots.push({ hero: h, before: before, after: after });
            });
        }
        return {
            victory: victory,
            power: p,
            winChance: winChance,
            hpLossPct: hpLossPct,
            durationMs: 3000,
            casualties: casualties,
            heroSnapshots: heroSnapshots,
            goldMult: victory ? 1 : 0,
            expMult: victory ? 0.85 : 0
        };
    }

    function applySkirmishResult(run, result) {
        if (!run || !result || !result.heroSnapshots) return;
        result.heroSnapshots.forEach((snap) => {
            if (snap.hero) snap.hero.hp = snap.after;
        });
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
        applySkirmishResult,
        skirmishThreshold,
        resolveSkirmishLayer,
        getMaxCombatDurationMs
    };
})();
