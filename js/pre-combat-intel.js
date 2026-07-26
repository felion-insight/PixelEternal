/**
 * 战前情报：威胁评估、推荐站位、协同提示
 */
(function () {
    'use strict';

    function intelCfg() {
        return window.AscensionHub ? window.AscensionHub.flag('preCombatIntel') : { accuracy: 0.9 };
    }

    function hasTacticalGoggles(run) {
        return run && run.relics && run.relics.indexOf('tactical_goggles') >= 0;
    }

    function accuracy(run) {
        if (hasTacticalGoggles(run)) return 1;
        let acc = intelCfg().accuracy != null ? intelCfg().accuracy : 0.9;
        const vp = run && run.ascension && run.ascension.visionPenalty;
        if (vp) acc = Math.max(0.25, acc - vp);
        return acc;
    }

    function analyze(run, encounter, node) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('preCombatIntel')) {
            return { enabled: false };
        }
        const acc = accuracy(run);
        const power = window.CombatPacing
            ? window.CombatPacing.calculatePower(run, encounter)
            : { ratio: 1 };
        const enemies = (encounter && encounter.enemies) || [];
        const threat = power.ratio >= 1.4 ? '低' : power.ratio >= 1.0 ? '中' : power.ratio >= 0.75 ? '高' : '极高';
        const noisy = acc < 1 && Math.random() > acc;
        const displayThreat = noisy ? shiftThreat(threat) : threat;

        const intents = enemies.slice(0, 5).map((e) => ({
            name: e.name || e.id || '敌人',
            intent: pickIntent(e, noisy),
            targetRow: recommendTargetRow(e)
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
            accuracy: acc,
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

    window.PreCombatIntel = { analyze, accuracy, hasTacticalGoggles };
})();
