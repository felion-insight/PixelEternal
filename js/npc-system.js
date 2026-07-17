/**
 * Phase 4 — NPC 交互逻辑（转职 / 洗练 / 威能 / 套装 / 编年史）
 */
(function () {
    'use strict';

    const FIRST_JOB_COST = 1000;
    const RESET_SKILL_COST = 500;
    const REROLL_AFFIX_BASE = 180;
    const EXTRACT_POWER_COST = 500;
    const IMPRINT_POWER_COST = 800;
    const SET_SYNTH_COST = 2200;

    function msg(text) {
        return { ok: false, message: text };
    }

    window.getFirstAdvancementOptions = function getFirstAdvancementOptions(classData) {
        const cd = window.normalizeClassData(classData);
        if (!cd.baseClass || cd.firstAdvancement) return [];
        const cfg = window.CLASS_CONFIG;
        if (!cfg || !cfg.baseClasses || !cfg.baseClasses[cd.baseClass]) return [];
        const ids = cfg.baseClasses[cd.baseClass].advancements || [];
        return ids.map(id => cfg.firstAdvancements && cfg.firstAdvancements[id]).filter(Boolean);
    };

    window.getSecondAdvancementOptions = function getSecondAdvancementOptions(classData) {
        const cd = window.normalizeClassData(classData);
        if (!cd.firstAdvancement || cd.secondAdvancement) return [];
        const cfg = window.CLASS_CONFIG;
        const first = cfg && cfg.firstAdvancements && cfg.firstAdvancements[cd.firstAdvancement];
        if (!first || !first.advancements) return [];
        return first.advancements.map(id => cfg.secondAdvancements && cfg.secondAdvancements[id]).filter(Boolean);
    };

    window.selectFirstAdvancement = function selectFirstAdvancement(player, firstId, options) {
        if (!player || !firstId) return msg('无效请求');
        const cd = window.normalizeClassData(player.classData);
        if (!cd.baseClass) return msg('请先选择基础职业');
        if (cd.firstAdvancement) return msg('已完成一转');
        const cfg = window.CLASS_CONFIG;
        const def = cfg && cfg.firstAdvancements && cfg.firstAdvancements[firstId];
        if (!def || def.baseClass !== cd.baseClass) return msg('无效一转职业');
        const reqLv = def.requiredLevel || 20;
        if (player.level < reqLv) return msg(`需要等级 ${reqLv}`);
        const skipTrial = options && options.skipTrial;
        if (skipTrial) {
            if (player.gold < FIRST_JOB_COST) return msg(`金币不足（需要 ${FIRST_JOB_COST}）`);
            player.gold -= FIRST_JOB_COST;
        }
        player.classData = Object.assign({}, cd, { firstAdvancement: firstId });
        if (typeof window.initPlayerClassResource === 'function') window.initPlayerClassResource(player);
        player.skillCooldowns = {};
        if (typeof player.updateStats === 'function') player.updateStats();
        if (typeof window.unlockChronicleNode === 'function') window.unlockChronicleNode(player, 'first_job');
        return { ok: true, name: def.name, paid: !!skipTrial };
    };

    window.selectSecondAdvancement = function selectSecondAdvancement(player, secondId) {
        if (!player || !secondId) return msg('无效请求');
        const cd = window.normalizeClassData(player.classData);
        if (!cd.firstAdvancement) return msg('请先完成一转');
        if (cd.secondAdvancement) return msg('已完成二转');
        const cfg = window.CLASS_CONFIG;
        const def = cfg && cfg.secondAdvancements && cfg.secondAdvancements[secondId];
        const first = cfg && cfg.firstAdvancements && cfg.firstAdvancements[cd.firstAdvancement];
        if (!def || !first || !(first.advancements || []).includes(secondId)) return msg('无效二转职业');
        const reqLv = def.requiredLevel || 40;
        if (player.level < reqLv) return msg(`需要等级 ${reqLv}`);
        player.classData = Object.assign({}, cd, { secondAdvancement: secondId });
        if (typeof window.initPlayerClassResource === 'function') window.initPlayerClassResource(player);
        player.skillCooldowns = {};
        if (typeof player.updateStats === 'function') player.updateStats();
        if (typeof window.unlockChronicleNode === 'function') window.unlockChronicleNode(player, 'second_job');
        return { ok: true, name: def.name };
    };

    window.resetSkillEnhancements = function resetSkillEnhancements(player) {
        if (!player) return msg('无效角色');
        if (player.gold < RESET_SKILL_COST) return msg(`金币不足（需要 ${RESET_SKILL_COST}）`);
        player.gold -= RESET_SKILL_COST;
        player.skillEnhanceLevels = {};
        return { ok: true };
    };

    function rerollAffixCost(eq) {
        const qMult = { normal: 1, magic: 1.2, rare: 1.5, epic: 2, legendary: 3, mythic: 4 };
        const lv = Math.max(1, eq.level || 1);
        const q = eq.quality || 'normal';
        return Math.floor(REROLL_AFFIX_BASE + lv * 12 * (qMult[q] || 1));
    }

    window.rerollEquipmentAffixes = function rerollEquipmentAffixes(equipment, player, mode) {
        if (!equipment || !player) return msg('无效装备');
        if (!equipment.procedural && !equipment.baseTypeId) return msg('仅支持程序化装备洗练');
        const cost = rerollAffixCost(equipment);
        if (player.gold < cost) return msg(`金币不足（需要 ${cost}）`);
        if (typeof window.rollEquipmentAffixes !== 'function') return msg('词缀系统未加载');
        const classId = typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId(player.classData) : null;
        const roll = window.rollEquipmentAffixes(equipment.slot, equipment.quality, equipment.level || 1, classId);
        if (mode === 'prefix') {
            equipment.prefixes = roll.prefixes;
        } else if (mode === 'suffix') {
            equipment.suffixes = roll.suffixes;
        } else {
            equipment.prefixes = roll.prefixes;
            equipment.suffixes = roll.suffixes;
        }
        if (typeof window.rebuildProceduralEquipmentStats === 'function') {
            window.rebuildProceduralEquipmentStats(equipment, classId);
        }
        player.gold -= cost;
        if (typeof window.refreshEquipmentGearScore === 'function') window.refreshEquipmentGearScore(equipment);
        return { ok: true, cost, name: equipment.name };
    };

    window.extractLegendaryPower = function extractLegendaryPower(equipment, player) {
        if (!equipment || !player) return msg('无效装备');
        const powers = equipment.legendaryPowers || [];
        if (!powers.length) return msg('该装备没有威能');
        if (player.gold < EXTRACT_POWER_COST) return msg(`金币不足（需要 ${EXTRACT_POWER_COST}）`);
        const power = powers[0];
        player.storedPowers = player.storedPowers || [];
        player.storedPowers.push({
            id: power.id,
            name: power.name,
            description: power.description,
            source: power.source || '提取'
        });
        equipment.legendaryPowers = powers.slice(1);
        player.gold -= EXTRACT_POWER_COST;
        if (typeof window.refreshEquipmentGearScore === 'function') window.refreshEquipmentGearScore(equipment);
        return { ok: true, powerName: power.name };
    };

    window.imprintLegendaryPower = function imprintLegendaryPower(equipment, player, storedIndex) {
        if (!equipment || !player) return msg('无效装备');
        const stored = player.storedPowers || [];
        const idx = storedIndex == null ? stored.length - 1 : storedIndex;
        const power = stored[idx];
        if (!power) return msg('没有可刻印的威能');
        const q = equipment.quality || 'normal';
        if (!['epic', 'legendary', 'mythic'].includes(q)) return msg('目标装备品质过低（需史诗及以上）');
        if (player.gold < IMPRINT_POWER_COST) return msg(`金币不足（需要 ${IMPRINT_POWER_COST}）`);
        equipment.legendaryPowers = equipment.legendaryPowers || [];
        if (equipment.legendaryPowers.length >= (q === 'mythic' ? 2 : 1)) {
            return msg('威能槽已满，请先提取旧威能');
        }
        equipment.legendaryPowers.push({
            id: power.id,
            name: power.name,
            description: power.description,
            source: '刻印'
        });
        stored.splice(idx, 1);
        player.storedPowers = stored;
        player.gold -= IMPRINT_POWER_COST;
        if (typeof window.refreshEquipmentGearScore === 'function') window.refreshEquipmentGearScore(equipment);
        return { ok: true, powerName: power.name };
    };

    window.synthesizeSetPiece = function synthesizeSetPiece(player, setId, slot) {
        if (!player || !setId || !slot) return msg('参数无效');
        const cfg = window.SET_DEFINITIONS_V2;
        const setData = cfg && cfg.sets && cfg.sets[setId];
        if (!setData || !(setData.slots || []).includes(slot)) return msg('无效套装部位');
        if (player.gold < SET_SYNTH_COST) return msg(`金币不足（需要 ${SET_SYNTH_COST}）`);
        if (typeof window.generateProceduralEquipment !== 'function') return msg('装备生成器未加载');
        const classId = setData.classAffinity || (typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId(player.classData) : null);
        const eq = window.generateProceduralEquipment({
            slot,
            setId,
            quality: 'epic',
            monsterLevel: Math.max(20, player.level || 20),
            monsterTier: 'boss',
            playerClass: typeof window.getPlayerBaseClassId === 'function'
                ? window.getPlayerBaseClassId(player.classData) : classId,
            classId,
            classData: player.classData,
            firstAdvancement: player.classData && player.classData.firstAdvancement,
            secondAdvancement: player.classData && player.classData.secondAdvancement
        });
        if (!eq) return msg('合成失败');
        player.gold -= SET_SYNTH_COST;
        return { ok: true, equipment: eq, setName: setData.name };
    };

    window.unlockChronicleNode = function unlockChronicleNode(player, nodeId) {
        if (!player || !nodeId) return false;
        player.chronicleUnlocked = player.chronicleUnlocked || [];
        if (player.chronicleUnlocked.includes(nodeId)) return false;
        player.chronicleUnlocked.push(nodeId);
        return true;
    };

    window.syncChronicleFromProgress = function syncChronicleFromProgress(player, game) {
        if (!player) return;
        const floor = (game && game.floor) || 1;
        const cfg = window.CHRONICLE_CONFIG;
        if (!cfg || !cfg.acts) return;
        cfg.acts.forEach(act => {
            (act.nodes || []).forEach(node => {
                if (node.unlockFloor != null && floor >= node.unlockFloor) {
                    window.unlockChronicleNode(player, node.id);
                }
            });
        });
        const cd = window.normalizeClassData(player.classData);
        if (cd.firstAdvancement) window.unlockChronicleNode(player, 'first_job');
        if (cd.secondAdvancement) window.unlockChronicleNode(player, 'second_job');
    };

    window.getChronicleViewData = function getChronicleViewData(player) {
        const cfg = window.CHRONICLE_CONFIG;
        const unlocked = new Set(player && player.chronicleUnlocked ? player.chronicleUnlocked : []);
        const relics = new Set(player && player.chronicleRelics ? player.chronicleRelics : []);
        if (!cfg) return { acts: [], relics: [] };
        const acts = (cfg.acts || []).map(act => ({
            id: act.id,
            name: act.name,
            nodes: (act.nodes || []).map(n => ({
                id: n.id,
                title: n.title,
                summary: n.summary,
                unlocked: unlocked.has(n.id)
            }))
        }));
        const relicList = (cfg.relics || []).map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            collected: relics.has(r.id),
            linkedNode: r.linkedNode
        }));
        return { acts, relics: relicList };
    };

    window.NpcSystem = {
        FIRST_JOB_COST,
        RESET_SKILL_COST,
        EXTRACT_POWER_COST,
        IMPRINT_POWER_COST,
        SET_SYNTH_COST,
        rerollAffixCost
    };
})();
