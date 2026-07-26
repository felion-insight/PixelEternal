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
        modifyEnemyScaling,
        modifyRewards,
        getPact,
        canRestHeal,
        canEquipGear,
        getMaxActiveSkills,
        isBossRushOnly,
        applyToRun,
        shouldWipeMetaOnFailure,
        wipeMetaOnFailure,
        listChoices
    };
})();
