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

    function heroPower(hero) {
        if (!hero) return 0;
        const st = window.PartyMetaSystem
            ? window.PartyMetaSystem.heroCombatStats(hero)
            : { hp: hero.maxHp || 100, attack: 10, defense: 4, speed: 70 };
        const hp = hero.hp > 0 ? hero.hp : (hero.maxHp || st.hp);
        return hp * 0.4 + (st.attack || 10) * 8 + (st.defense || 4) * 5 + (st.speed || 70) * 0.5;
    }

    function teamPower(heroes) {
        return (heroes || [])
            .filter((h) => (h.hp || 0) > 0)
            .reduce((s, h) => s + heroPower(h), 0);
    }

    function enemyPower(enemies) {
        return (enemies || [])
            .filter((e) => e.alive !== false && (e.hp == null || e.hp > 0))
            .reduce((s, e) => s + (e.maxHp || e.hp || 100) * 0.35 + (e.attack || 10) * 7 + (e.defense || 4) * 4, 0);
    }

    function calculatePower(run, encounter) {
        const allies = (run && run.heroes) || [];
        const enemies = (encounter && encounter.enemies) || [];
        const allyP = teamPower(allies);
        const enemyP = Math.max(1, enemyPower(enemies));
        return { ally: allyP, enemy: enemyP, ratio: allyP / enemyP };
    }

    function canSkirmish(run, encounter, node) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('skirmishMode')) return false;
        if (node && (node.type === 'boss' || node.type === 'boss_final' || node.type === 'elite')) return false;
        const threshold = ascCfg().powerRatioThreshold || 1.5;
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
        getMaxCombatDurationMs
    };
})();
