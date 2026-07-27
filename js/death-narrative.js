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

    const META_UNLOCK_LABELS = {
        intel_basic: '战情简报增强',
        commander_slot: '指挥官槽位+1',
        hunter_ally: '猎手盟友档案',
        alchemist_aid: '炼金援助',
        first_victory: '首次胜利纪念'
    };

    const CHAIN_COMPLETE_LABELS = {
        demon_hunter_revenge: '恶魔猎手的复仇',
        lost_legion: '失落军团',
        merchant_revenge: '商人的复仇',
        alchemist_legacy: '炼金术士的遗产',
        traitor_knight: '背叛的骑士',
        abyss_whisper: '深渊的低语',
        arena_champion: '竞技场冠军',
        dragon_hoard: '龙的宝藏'
    };

    function checkMetaUnlocks(meta, narrative) {
        if (!meta) return [];
        meta.ascension = meta.ascension || window.AscensionHub.createDefaultMetaAscension();
        meta.ascension._narratedUnlocks = meta.ascension._narratedUnlocks || [];
        meta.ascension._narratedChains = meta.ascension._narratedChains || [];
        const unlocks = [];
        if (narrative.layers >= 5 && meta.ascension.metaUnlocks.indexOf('intel_basic') < 0) {
            meta.ascension.metaUnlocks.push('intel_basic');
            unlocks.push('战情简报增强');
        }
        if (narrative.kills >= 30 && meta.ascension.metaUnlocks.indexOf('commander_slot') < 0) {
            meta.ascension.metaUnlocks.push('commander_slot');
            unlocks.push('指挥官槽位+1');
        }
        (meta.ascension.metaUnlocks || []).forEach((id) => {
            if (meta.ascension._narratedUnlocks.indexOf(id) >= 0) return;
            const label = META_UNLOCK_LABELS[id];
            if (label) {
                unlocks.push(label);
                meta.ascension._narratedUnlocks.push(id);
            }
        });
        (meta.ascension.completedChains || []).forEach((chainId) => {
            if (meta.ascension._narratedChains.indexOf(chainId) >= 0) return;
            const label = CHAIN_COMPLETE_LABELS[chainId];
            if (label) {
                unlocks.push('完成事件链：' + label);
                meta.ascension._narratedChains.push(chainId);
            }
        });
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
