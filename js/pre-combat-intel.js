/**
 * 战前情报：威胁评估、推荐站位、协同提示（支持分级 intel tier）
 */
(function () {
    'use strict';

    const TIER_ORDER = ['none', 'count_only', 'types', 'intents_1', 'intents_2', 'full'];

    function intelCfg() {
        return window.AscensionHub ? window.AscensionHub.flag('preCombatIntel') : { accuracy: 0.9 };
    }

    function tierCfg() {
        return window.AscensionHub ? window.AscensionHub.flag('intelTiers') : { enabled: false };
    }

    function hasTacticalGoggles(run) {
        return run && run.relics && run.relics.indexOf('tactical_goggles') >= 0;
    }

    function hasRelic(run, id) {
        return run && run.relics && run.relics.indexOf(id) >= 0;
    }

    function resolveIntelTier(run) {
        const tc = tierCfg();
        if (!tc.enabled) return 'full';
        let tier = tc.defaultTier || 'count_only';
        const boosts = tc.relicBoosts || {
            tactical_goggles: 'types',
            scout_eye: 'intents_1',
            prophecy_scroll: 'full'
        };
        Object.keys(boosts).forEach((rid) => {
            if (hasRelic(run, rid)) {
                const t = boosts[rid];
                if (TIER_ORDER.indexOf(t) > TIER_ORDER.indexOf(tier)) tier = t;
            }
        });
        if (run && run.ascension && run.ascension.pact && run.ascension.pact.noIntel) return 'none';
        return tier;
    }

    function accuracy(run) {
        if (hasTacticalGoggles(run) && !tierCfg().enabled) return 1;
        let acc = intelCfg().accuracy != null ? intelCfg().accuracy : 0.9;
        const vp = run && run.ascension && run.ascension.visionPenalty;
        if (vp) acc = Math.max(0.25, acc - vp);
        const tier = resolveIntelTier(run);
        if (tierCfg().enabled) {
            if (tier === 'none') return 0;
            if (tier === 'count_only') return 0.35;
            if (tier === 'types') return 0.55;
            if (tier === 'intents_1') return 0.75;
            if (tier === 'intents_2') return 0.88;
            return 1;
        }
        return acc;
    }

    function maskEnemyName(e, tier, idx) {
        if (tier === 'none' || tier === 'count_only') return '[???]';
        if (tier === 'types') return e.name || e.id || ('敌人' + (idx + 1));
        return e.name || e.id || '敌人';
    }

    function analyze(run, encounter, node) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('preCombatIntel')) {
            return { enabled: false };
        }
        const tier = resolveIntelTier(run);
        const acc = accuracy(run);
        const power = window.CombatPacing
            ? window.CombatPacing.calculatePower(run, encounter)
            : { ratio: 1 };
        const enemies = (encounter && encounter.enemies) || [];
        const threat = power.ratio >= 1.4 ? '低' : power.ratio >= 1.0 ? '中' : power.ratio >= 0.75 ? '高' : '极高';
        const noisy = acc < 1 && Math.random() > acc;
        const displayThreat = noisy ? shiftThreat(threat) : threat;

        const showIntents = tier === 'intents_1' || tier === 'intents_2' || tier === 'full' || !tierCfg().enabled;
        const showTypes = tier !== 'none' && tier !== 'count_only' || !tierCfg().enabled;

        const intents = enemies.slice(0, 5).map((e, i) => ({
            name: showTypes ? maskEnemyName(e, tier, i) : '[???]',
            mutation: (e.mutationName && showTypes) ? e.mutationName : null,
            intent: showIntents ? pickIntent(e, noisy) : '???',
            targetRow: showIntents ? recommendTargetRow(e) : '???'
        }));

        const formation = recommendFormation(run, node);
        const synergies = window.SynergyMatrix
            ? window.SynergyMatrix.getActiveDisplay(run)
            : [];

        let bossPhases = [];
        if (node && (node.type === 'boss' || node.type === 'boss_final') && window.BossPhaseSystem) {
            bossPhases = window.BossPhaseSystem.getPhasePreview(node.bossId || 'ab_boss_warden');
        }

        return {
            enabled: true,
            tier: tier,
            accuracy: acc,
            enemyCount: enemies.length,
            threat: displayThreat,
            powerRatio: power.ratio,
            intents: intents,
            formation: formation,
            synergies: synergies,
            bossPhases: bossPhases,
            commanderHint: bossPhases.length ? (bossPhases[0].hint || '准备指挥官指令') : '集火高威胁目标'
        };
    }

    function shiftThreat(t) {
        const order = ['低', '中', '高', '极高'];
        const i = order.indexOf(t);
        return order[Math.min(order.length - 1, i + 1)];
    }

    function pickIntent(enemy, noisy) {
        const pool = ['攻击', '技能', '蓄力', '召唤'];
        if (enemy.range > 100) return noisy ? '攻击' : '远程齐射';
        if (enemy.hp > 400) return noisy ? '技能' : '重击';
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function recommendTargetRow(enemy) {
        if (enemy.range > 120) return '后排';
        if (enemy.attack > 18) return '前排';
        return '中排';
    }

    function recommendFormation(run, node) {
        const heroes = (run && run.heroes || []).filter((h) => (h.hp || 0) > 0);
        const tips = [];
        heroes.forEach((h) => {
            if (h.baseClass === 'warrior') tips.push({ hero: h.baseClass, row: 0, tip: '前排承伤' });
            else if (h.baseClass === 'assassin') tips.push({ hero: h.baseClass, row: 1, tip: '中排切入' });
            else if (h.baseClass === 'archer' || h.baseClass === 'mage') tips.push({ hero: h.baseClass, row: 2, tip: '后排输出' });
        });
        if (node && node.type === 'elite') tips.push({ hero: 'team', row: null, tip: '精英战：保留护盾指令' });
        return tips;
    }

    window.PreCombatIntel = { analyze, accuracy, hasTacticalGoggles, resolveIntelTier };
})();
