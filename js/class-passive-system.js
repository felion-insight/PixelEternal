/**
 * 全职业被动技能注册与回调
 */
(function () {
    'use strict';

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function aliveUndead(g, player) {
        if (!g || !g._skillEntities || !player) return [];
        return (g._skillEntities.summons || []).filter(
            s => s && s.owner === player && s.isUndead && s.hp > 0
        );
    }

    function aliveSkeletons(g, player) {
        return aliveUndead(g, player).filter(
            s => s.unitId === 'skeleton_warrior' || s.unitId === 'shadow_fiend'
        );
    }

    window.getClassPassiveId = function getClassPassiveId(player) {
        const id = classId(player);
        if (!id || typeof window.getClassDefinition !== 'function') return null;
        const def = window.getClassDefinition(id);
        return def && def.classPassive ? def.classPassive : null;
    };

    window.getClassPassiveDotMult = function getClassPassiveDotMult(player) {
        const passive = window.getClassPassiveId(player);
        if (passive === 'soul_reaper') {
            const g = player && (player.gameInstance || player.game);
            const skels = aliveSkeletons(g, player);
            let mult = 1 + skels.length * 0.08;
            if (skels.length >= 3) mult += 0.05;
            return mult;
        }
        return 1;
    };

    window.rollClassPassiveDotShard = function rollClassPassiveDotShard(player, baseChance) {
        const passive = window.getClassPassiveId(player);
        let chance = baseChance || 0;
        if (passive === 'soul_reaper') {
            const g = player && (player.gameInstance || player.game);
            const skels = aliveSkeletons(g, player);
            if (skels.length >= 3) chance += 0.05;
        }
        return chance;
    };

    window.getClassPassiveSoulShardMax = function getClassPassiveSoulShardMax(player, baseMax) {
        const passive = window.getClassPassiveId(player);
        if (passive === 'undeath_sovereign') {
            const g = player && (player.gameInstance || player.game);
            const undead = aliveUndead(g, player);
            return Math.min(15, baseMax + undead.length);
        }
        return baseMax;
    };

    window.getBoneDragonAuraMult = function getBoneDragonAuraMult(pet) {
        if (!pet || !pet.owner) return 1;
        const g = pet.owner.gameInstance || (pet.owner && pet.owner.game);
        if (!g || !g._skillEntities) return 1;
        const hasDragon = (g._skillEntities.summons || []).some(
            s => s && s.owner === pet.owner && s.hp > 0 && s.unitId === 'bone_dragon'
        );
        return hasDragon ? 1.2 : 1;
    };

    window.getClassPassiveName = function getClassPassiveName(player) {
        const id = window.getClassPassiveId(player);
        const names = {
            blood_battle: '浴血奋战',
            pack_leader: '兽群领袖',
            elemental_rhythm: '元素律动',
            temporal_intuition: '时空直觉',
            soul_reaper: '灵魂收割者',
            elemental_mastery: '元素精通',
            paradox_walker: '悖论行者',
            undeath_sovereign: '不死君主',
            shadow_rhythm: '影之律动',
            shadow_rhythm_pre: '影之律动',
            indistinguishable: '真假莫辨',
            indistinguishable_pre: '真假莫辨',
            toxicology: '毒理学',
            toxicology_pre: '毒理学'
        };
        return id ? (names[id] || id) : null;
    };
})();
