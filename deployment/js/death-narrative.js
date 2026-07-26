/**
 * 死亡叙事与 Meta 解锁
 */
(function () {
    'use strict';

    function classifyDeath(analytics, battle) {
        if (!analytics || !analytics.fatalBattle) return 'unknown';
        const nodeType = analytics.fatalBattle.nodeType;
        if (nodeType === 'boss' || nodeType === 'boss_final') return 'boss';
        if (nodeType === 'elite') return 'elite';
        if (analytics.totalDamageTaken > analytics.totalDamageDealt * 1.5) return 'overwhelmed';
        return 'battle';
    }

    function buildNarrative(run, analytics) {
        const cause = classifyDeath(analytics, null);
        const causeLabels = {
            boss: '倒在 Boss 战',
            elite: '精英战失利',
            battle: '遭遇战溃败',
            unknown: '征途终结',
            overwhelmed: '被伤害淹没'
        };
        return {
            title: causeLabels[cause] || '征途终结',
            kills: analytics ? analytics.kills : 0,
            layers: run && run.path ? run.path.length : 0,
            maxSynergies: analytics ? analytics.synergiesTriggered.length : 0,
            topCommands: analytics ? Object.keys(analytics.commandsUsed)
                .sort((a, b) => analytics.commandsUsed[b] - analytics.commandsUsed[a])
                .slice(0, 3) : [],
            gold: run ? run.gold : 0,
            relics: run && run.relics ? run.relics.length : 0
        };
    }

    function checkMetaUnlocks(meta, narrative) {
        if (!meta) return [];
        meta.ascension = meta.ascension || window.AscensionHub.createDefaultMetaAscension();
        const unlocks = [];
        if (narrative.layers >= 5 && meta.ascension.metaUnlocks.indexOf('intel_basic') < 0) {
            meta.ascension.metaUnlocks.push('intel_basic');
            unlocks.push('战情简报增强');
        }
        if (narrative.kills >= 30 && meta.ascension.metaUnlocks.indexOf('commander_slot') < 0) {
            meta.ascension.metaUnlocks.push('commander_slot');
            unlocks.push('指挥官槽位+1');
        }
        return unlocks;
    }

    function onRunDeath(run, battle, meta) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('deathNarrative')) return null;
        const analytics = window.RunAnalytics
            ? window.RunAnalytics.finalize(run.ascension && run.ascension.analytics, run)
            : null;
        const narrative = buildNarrative(run, analytics);
        if (meta) {
            meta.ascension = meta.ascension || window.AscensionHub.createDefaultMetaAscension();
            meta.ascension.deathArchive = meta.ascension.deathArchive || [];
            meta.ascension.deathArchive.unshift({
                ts: Date.now(),
                narrative: narrative,
                analytics: analytics
            });
            if (meta.ascension.deathArchive.length > 20) meta.ascension.deathArchive.length = 20;
            narrative.newUnlocks = checkMetaUnlocks(meta, narrative);
        }
        run.ascension.deathStats = narrative;
        return narrative;
    }

    function npcDialogueStub(meta) {
        const last = meta && meta.ascension && meta.ascension.deathArchive && meta.ascension.deathArchive[0];
        if (!last) return '再试一次，恶魔塔不会记住失败者——但你会。';
        return '上次你在第 ' + last.narrative.layers + ' 层倒下。' + last.narrative.title + '。';
    }

    window.DeathNarrative = {
        buildNarrative,
        onRunDeath,
        checkMetaUnlocks,
        npcDialogueStub,
        classifyDeath
    };
})();
