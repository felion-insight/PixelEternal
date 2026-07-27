/**
 * 恶魔契约：开局选择、难度与奖励倍率
 */
(function () {
    'use strict';

    function pactCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.DEMON_PACT_CONFIG) ||
            window.DEMON_PACT_CONFIG || {};
    }

    function allPacts() {
        return pactCfg().pacts || {};
    }

    function isUnlocked(meta) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('demonPact')) return false;
        const cfg = window.AscensionHub.flag('demonPact');
        if (!cfg.unlockAfterVictory) return true;
        return meta && meta.ascension && (meta.ascension.demonPactUnlocked || meta.ascension.firstVictory);
    }

    function applyPact(run, pactId, stars) {
        if (!run) return false;
        const def = allPacts()[pactId];
        if (!def) return false;
        stars = Math.max(1, Math.min(5, stars || def.stars || 1));
        const scale = (pactCfg().starScaling || {})[String(stars)] || { rewardMult: 1, difficultyMult: 1 };
        run.ascension = run.ascension || window.AscensionHub.createDefaultRunAscension();
        run.ascension.pact = Object.assign({}, def, { stars: stars, rewardMult: scale.rewardMult, difficultyMult: scale.difficultyMult });
        return true;
    }

    function getRewardMult(run) {
        if (!run || !run.ascension || !run.ascension.pact) return 1;
        return run.ascension.pact.rewardMult || 1;
    }

    function getDifficultyMult(run) {
        if (!run || !run.ascension || !run.ascension.pact) return 1;
        return run.ascension.pact.difficultyMult || 1;
    }

    function getShopPriceMult(run) {
        const p = getPact(run);
        return (p && p.shopPriceMult) || 1;
    }

    function getRelicDropMult(run) {
        const p = getPact(run);
        return (p && p.relicDropMult) || 1;
    }

    function getEnemyAttackMult(run) {
        const p = getPact(run);
        return (p && p.enemyAttackMult) || 1;
    }

    function modifyEnemyScaling(mult, run) {
        return mult * getDifficultyMult(run);
    }

    function modifyRewards(gold, exp, run) {
        const m = getRewardMult(run);
        const pact = run && run.ascension && run.ascension.pact;
        let gMult = m;
        let eMult = m;
        if (pact) {
            if (pact.goldRewardMult != null) gMult *= pact.goldRewardMult;
            if (pact.goldGainMult != null) gMult *= pact.goldGainMult;
            if (pact.expRewardMult != null) eMult *= pact.expRewardMult;
        }
        return { gold: Math.floor(gold * gMult), exp: Math.floor(exp * eMult) };
    }

    function getPact(run) {
        return run && run.ascension && run.ascension.pact;
    }

    function canRestHeal(run) {
        const p = getPact(run);
        return !(p && p.noRestHeal);
    }

    function canRestRevive(run) {
        const p = getPact(run);
        return !(p && p.noRestRevive);
    }

    function getCommanderCooldownMult(run) {
        const p = getPact(run);
        return (p && p.commanderCooldownMult) || 1;
    }

    function getEnemyHpMult(run) {
        const p = getPact(run);
        return (p && p.enemyHpMult) || 1;
    }

    function getBossHpMult(run) {
        const p = getPact(run);
        return (p && p.bossHpMult) || 1;
    }

    function getEnemySpeedMult(run) {
        const p = getPact(run);
        return (p && p.enemySpeedMult) || 1;
    }

    function getMaxActiveHeroes(run) {
        const p = getPact(run);
        if (p && p.maxActiveHeroes != null) return p.maxActiveHeroes;
        return null;
    }

    function listChoicesGrouped(meta) {
        const choices = listChoices(meta);
        const groups = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        choices.forEach((c) => {
            const s = c.stars || 1;
            const bucket = s >= 5 ? 5 : (s >= 4 ? 4 : (s >= 3 ? 3 : (s >= 2 ? 2 : 1)));
            groups[bucket].push(c);
        });
        return groups;
    }

    function canEquipGear(run) {
        const p = getPact(run);
        return !(p && p.disableGear);
    }

    function getMaxActiveSkills(run) {
        const p = getPact(run);
        return (p && p.maxActiveSkills) || 4;
    }

    function isBossRushOnly(run) {
        const p = getPact(run);
        return !!(p && p.bossesOnly);
    }

    function applyToRun(run) {
        const p = getPact(run);
        if (!p || !run) return;
        if (p.teamHpMult && run.heroes) {
            run.heroes.forEach((h) => {
                h.maxHp = Math.max(1, Math.floor(h.maxHp * p.teamHpMult));
                h.hp = Math.min(h.hp || h.maxHp, h.maxHp);
            });
        }
        if (p.startLegendaryRelics && window.RelicSystem && run.relics) {
            const rng = window.RunStateSystem.rngFromRun(run);
            for (let i = 0; i < 3; i++) {
                const picks = window.RelicSystem.pickRelicChoices(rng, 1, run.relics, 'pact', run);
                const leg = (picks || []).find((r) => r.rarity === 'legendary') || (picks && picks[0]);
                if (leg && leg.id) window.RunStateSystem.addRelic(run, leg.id);
            }
        }
        if (p.maxActiveSkills === 1 && run.heroes) {
            run.heroes.forEach((h) => {
                for (let i = 1; i < (h.skillSlots || []).length; i++) h.skillSlots[i] = null;
            });
        }
        if (p.visionHalf) run.ascension.visionHalf = p.visionHalf;
        if (p.blindMap) run.ascension.blindMap = true;
    }

    function shouldWipeMetaOnFailure(run) {
        if (!run || !run.ascension) return false;
        const pact = run.ascension.pact;
        if (pact && (pact.wipeMetaOnFailure || (pact.negative && pact.negative.wipeMetaOnFailure))) {
            return true;
        }
        if (!window.CurseSystem) return false;
        return (run.ascension.cursedRelicIds || []).some((rid) => {
            const def = window.CurseSystem.cursedRelics()[rid];
            return def && def.negative && def.negative.wipeMetaOnFailure;
        });
    }

    function wipeMetaOnFailure(meta) {
        if (!meta || !meta.ascension) return;
        meta.ascension.deathArchive = [];
        meta.ascension.completedChains = [];
        meta.ascension.unlockedCommanderAbilities = [];
        meta.ascension.metaUnlocks = [];
        meta.ascension.runsWithVictory = 0;
        meta.ascension.firstVictory = false;
        meta.ascension.demonPactUnlocked = false;
    }

    function listChoices(meta) {
        if (!isUnlocked(meta)) return [];
        return Object.keys(allPacts()).map((id) => {
            const p = allPacts()[id];
            return { id: id, name: p.name, description: p.description, stars: p.stars || 1 };
        });
    }

    window.DemonPact = {
        allPacts,
        isUnlocked,
        applyPact,
        getRewardMult,
        getDifficultyMult,
        getShopPriceMult,
        getRelicDropMult,
        getEnemyAttackMult,
        modifyEnemyScaling,
        modifyRewards,
        getPact,
        canRestHeal,
        canRestRevive,
        canEquipGear,
        getMaxActiveSkills,
        getMaxActiveHeroes,
        getCommanderCooldownMult,
        getEnemyHpMult,
        getBossHpMult,
        getEnemySpeedMult,
        isBossRushOnly,
        applyToRun,
        shouldWipeMetaOnFailure,
        wipeMetaOnFailure,
        listChoices,
        listChoicesGrouped
    };
})();
