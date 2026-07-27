/**
 * 构筑路径承诺：第 5 / 15 层锁定后续掉落权重
 */
(function () {
    'use strict';

    function commitCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.BUILD_COMMITMENT_CONFIG) ||
            window.BUILD_COMMITMENT_CONFIG || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('buildCommitment');
    }

    function tiers() {
        const c = commitCfg();
        return c.tiers || c.BUILD_COMMITMENT_CONFIG?.tiers || [];
    }

    function pendingTier(run, layer) {
        if (!isEnabled() || !run || !run.ascension) return null;
        const done = run.ascension.commitmentLayers || [];
        for (let i = 0; i < tiers().length; i++) {
            const t = tiers()[i];
            if (layer >= t.layer && done.indexOf(t.layer) < 0) return t;
        }
        return null;
    }

    function needsCommitmentNode(run, layer) {
        return !!pendingTier(run, layer);
    }

    function getChoices(run, layer) {
        const tier = pendingTier(run, layer);
        return tier ? (tier.choices || []).slice() : [];
    }

    function applyChoice(run, choiceId, layer) {
        if (!run || !run.ascension) return { ok: false, message: '无效 Run' };
        const tier = pendingTier(run, layer != null ? layer : (run.path ? run.path.length : 0));
        if (!tier) return { ok: false, message: '无需承诺' };
        const choice = (tier.choices || []).find((c) => c.id === choiceId);
        if (!choice) return { ok: false, message: '无效选择' };
        run.ascension.commitmentLayers = run.ascension.commitmentLayers || [];
        if (run.ascension.commitmentLayers.indexOf(tier.layer) < 0) {
            run.ascension.commitmentLayers.push(tier.layer);
        }
        run.ascension.buildPath = {
            id: choice.id,
            name: choice.name,
            tags: choice.tags || [],
            boostTags: choice.boostTags || [],
            penaltyTags: choice.penaltyTags || []
        };
        return { ok: true, choice: choice, tier: tier };
    }

    function tagWeightMult(run, tags) {
        if (!isEnabled() || !run || !run.ascension || !run.ascension.buildPath) return 1;
        const path = run.ascension.buildPath;
        let mult = 1;
        (tags || []).forEach((t) => {
            if (path.boostTags && path.boostTags.indexOf(t) >= 0) mult *= 1.5;
            if (path.penaltyTags && path.penaltyTags.indexOf(t) >= 0) mult *= 0.5;
        });
        return mult;
    }

    function mutationWeightMult(run, tags) {
        return tagWeightMult(run, tags);
    }

    function getDisplay(run) {
        const p = run && run.ascension && run.ascension.buildPath;
        return p ? { id: p.id, name: p.name } : null;
    }

    window.BuildCommitmentSystem = {
        isEnabled,
        tiers,
        pendingTier,
        needsCommitmentNode,
        getChoices,
        applyChoice,
        tagWeightMult,
        mutationWeightMult,
        getDisplay
    };
})();
