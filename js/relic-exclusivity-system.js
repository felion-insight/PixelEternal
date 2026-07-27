/**
 * 遗物互斥与效果浮动
 */
(function () {
    'use strict';

    function exCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.RELIC_EXCLUSIVITY_CONFIG) ||
            window.RELIC_EXCLUSIVITY_CONFIG || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('relicExclusivity');
    }

    function variance() {
        const hub = window.AscensionHub ? window.AscensionHub.flag('relicExclusivity') : {};
        if (hub.variance != null) return hub.variance;
        return exCfg().variance != null ? exCfg().variance : 0.2;
    }

    function exclusiveGroups() {
        return exCfg().exclusiveGroups || exCfg().RELIC_EXCLUSIVITY_CONFIG?.exclusiveGroups || [];
    }

    function findConflict(ownedIds, relicId) {
        if (!isEnabled()) return null;
        const owned = new Set(ownedIds || []);
        for (let i = 0; i < exclusiveGroups().length; i++) {
            const group = exclusiveGroups()[i];
            if (group.indexOf(relicId) < 0) continue;
            for (let j = 0; j < group.length; j++) {
                if (group[j] !== relicId && owned.has(group[j])) {
                    const msgs = exCfg().groupMessages || {};
                    const key = group.slice().sort().join('|');
                    return msgs[key] || msgs[group.join('|')] || '与已有遗物互斥';
                }
            }
        }
        return null;
    }

    function canAcquire(run, relicId) {
        const conflict = findConflict(run && run.relics, relicId);
        if (conflict) return { ok: false, message: conflict };
        return { ok: true };
    }

    function rollEffectMultiplier(rng) {
        const v = variance();
        const r = rng || Math.random;
        return 1 + (r() * 2 - 1) * v;
    }

    function rollQuality(mult) {
        const labels = exCfg().qualityLabels || { poor: '劣质', normal: '普通', fine: '优秀' };
        if (mult < 0.92) return labels.poor || '劣质';
        if (mult > 1.08) return labels.fine || '优秀';
        return labels.normal || '普通';
    }

    function onRelicAcquired(run, relicId, rng) {
        if (!isEnabled() || !run || !run.ascension) return;
        run.ascension.relicVariance = run.ascension.relicVariance || {};
        if (run.ascension.relicVariance[relicId] != null) return;
        const mult = rollEffectMultiplier(rng);
        run.ascension.relicVariance[relicId] = mult;
        run.ascension.relicQuality = run.ascension.relicQuality || {};
        run.ascension.relicQuality[relicId] = rollQuality(mult);
    }

    function getVarianceMult(run, relicId) {
        if (!isEnabled() || !run || !run.ascension || !run.ascension.relicVariance) return 1;
        return run.ascension.relicVariance[relicId] != null ? run.ascension.relicVariance[relicId] : 1;
    }

    function getQualityLabel(run, relicId) {
        if (!isEnabled() || !run || !run.ascension || !run.ascension.relicQuality) return '';
        return run.ascension.relicQuality[relicId] || '';
    }

    window.RelicExclusivitySystem = {
        isEnabled,
        findConflict,
        canAcquire,
        onRelicAcquired,
        getVarianceMult,
        getQualityLabel,
        rollEffectMultiplier,
        rollQuality
    };
})();
