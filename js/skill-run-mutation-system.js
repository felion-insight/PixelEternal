/**
 * Run 内技能随机改造（与 lineage branchMods 叠加）
 */
(function () {
    'use strict';

    function mutCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.SKILL_RUN_MUTATIONS_CONFIG) ||
            window.SKILL_RUN_MUTATIONS_CONFIG || {};
    }

    function allMutations() {
        const c = mutCfg();
        return c.mutations || c.SKILL_RUN_MUTATIONS_CONFIG?.mutations || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('skillRunMutations');
    }

    function maxPerSkill() {
        const hub = window.AscensionHub ? window.AscensionHub.flag('skillRunMutations') : {};
        if (hub.maxPerSkill != null) return hub.maxPerSkill;
        return mutCfg().maxPerSkill != null ? mutCfg().maxPerSkill : 2;
    }

    function mutationWeight(id, def, run) {
        let w = 1;
        const tags = def.tags || [];
        const path = run && run.ascension && run.ascension.buildPath;
        if (path && path.boostTags && path.boostTags.length) {
            tags.forEach((t) => {
                if (path.boostTags.indexOf(t) >= 0) w *= 1.8;
                if (path.penaltyTags && path.penaltyTags.indexOf(t) >= 0) w *= 0.35;
            });
        }
        if (window.BuildCommitmentSystem && window.BuildCommitmentSystem.mutationWeightMult) {
            w *= window.BuildCommitmentSystem.mutationWeightMult(run, tags);
        }
        return w;
    }

    function rollMutations(rng, run, heroLevel) {
        if (!isEnabled()) return [];
        const r = rng || Math.random;
        const keys = Object.keys(allMutations());
        if (!keys.length) return [];
        const max = maxPerSkill();
        const lvl = heroLevel || 1;
        let count = Math.min(max, Math.floor(r() * (1.2 + lvl * 0.04)));
        if (count <= 0 && r() < 0.45) count = 1;
        const picked = [];
        const bag = keys.slice();
        while (picked.length < count && bag.length) {
            let total = 0;
            const weights = bag.map((k) => {
                const w = mutationWeight(k, allMutations()[k], run);
                total += w;
                return w;
            });
            let roll = r() * total;
            let idx = 0;
            for (; idx < bag.length; idx++) {
                roll -= weights[idx];
                if (roll <= 0) break;
            }
            if (idx >= bag.length) idx = bag.length - 1;
            picked.push(bag.splice(idx, 1)[0]);
        }
        return picked;
    }

    function formatDisplayName(baseName, mutationIds) {
        if (!mutationIds || !mutationIds.length) return baseName;
        const parts = mutationIds.map((id) => {
            const m = allMutations()[id];
            return (m && m.name) || id;
        });
        return baseName + '·' + parts.join('·');
    }

    function applyToEntry(entry, rng, run, heroLevel) {
        if (!entry || !isEnabled()) return entry;
        if (!entry.runMutations) {
            entry.runMutations = rollMutations(rng, run, heroLevel);
        }
        const baseName = entry.name || entry.id;
        entry.displayName = formatDisplayName(baseName, entry.runMutations);
        return entry;
    }

    function applyToInstance(sk, def, mutationIds) {
        if (!sk || !mutationIds || !mutationIds.length) return sk;
        const SMS = window.SkillMutationSystem;
        mutationIds.forEach((id) => {
            const m = allMutations()[id];
            if (!m) return;
            if (m.mutate && SMS && SMS.applyMutateOp) {
                sk._runEffects = SMS.applyMutateOp(sk._runEffects || (def && def.effects) || [], def, m.mutate);
            }
            if (m.mutate && m.mutate.damageMult) sk.damageMult = (sk.damageMult || 1) * m.mutate.damageMult;
            if (m.mutate && m.mutate.forceAoe) sk.aoe = true;
            if (m.mutate && m.mutate.addChainJumps) {
                sk.chainJumpBonus = (sk.chainJumpBonus || 0) + m.mutate.addChainJumps;
            }
            if (m.mutate && m.mutate.addLifestealPct) {
                sk.lifestealBonus = (sk.lifestealBonus || 0) + m.mutate.addLifestealPct;
            }
            if (m.selfDamagePct) sk.selfDamagePct = (sk.selfDamagePct || 0) + m.selfDamagePct;
            if (m.echoDelayMs) sk.echoDelayMs = m.echoDelayMs;
            if (m.echoDamageMult) sk.echoDamageMult = m.echoDamageMult;
            if (m.slowPct) sk.slowPct = m.slowPct;
            if (m.slowDurationMs) sk.slowDurationMs = m.slowDurationMs;
            if (m.armorPenPct) sk.armorPenPct = (sk.armorPenPct || 0) + m.armorPenPct;
            if (m.critBonus) sk.critBonus = (sk.critBonus || 0) + m.critBonus;
            if (m.delayMs) sk.delayMs = m.delayMs;
            if (m.reflectOnCastPct) sk.reflectOnCastPct = m.reflectOnCastPct;
            if (m.convertToHeal) sk.convertToHeal = true;
        });
        sk.runMutations = mutationIds.slice();
        return sk;
    }

    function tagHtml(mutationIds) {
        if (!mutationIds || !mutationIds.length) return '';
        return mutationIds.map((id) => {
            const m = allMutations()[id];
            return `<span class="ab-skill-mut-tag" data-mut="${id}">${(m && m.name) || id}</span>`;
        }).join('');
    }

    window.SkillRunMutationSystem = {
        allMutations,
        isEnabled,
        rollMutations,
        applyToEntry,
        applyToInstance,
        formatDisplayName,
        tagHtml
    };
})();
