/**
 * Phase 5 — 天赋系统
 */
(function () {
    'use strict';

    const RESET_TALENT_COST = 500;
    const MAX_TALENT_POINTS = 20;
    const BRANCH_POINTS_FOR_ULTIMATE = 5;

    function msg(text) {
        return { ok: false, message: text };
    }

    window.hasTalentSystemUnlocked = function hasTalentSystemUnlocked(player) {
        const cd = player && window.normalizeClassData(player.classData);
        return !!(cd && cd.secondAdvancement);
    };

    window.getTalentTreeForPlayer = function getTalentTreeForPlayer(player) {
        if (!player) return null;
        const base = typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId(player.classData) : null;
        const cfg = window.TALENT_CONFIG;
        return base && cfg ? cfg[base] : null;
    };

    window.getAvailableTalentPoints = function getAvailableTalentPoints(player) {
        if (!window.hasTalentSystemUnlocked(player)) return 0;
        const earned = Math.min(MAX_TALENT_POINTS, Math.max(0, (player.level || 1) - 39));
        const spent = window.getSpentTalentPoints(player);
        return Math.max(0, earned - spent);
    };

    window.getSpentTalentPoints = function getSpentTalentPoints(player) {
        const alloc = (player && player.talentAllocations) || {};
        return Object.values(alloc).reduce((s, v) => s + (v ? 1 : 0), 0);
    };

    window.getTotalEarnedTalentPoints = function getTotalEarnedTalentPoints(player) {
        if (!window.hasTalentSystemUnlocked(player)) return 0;
        return Math.min(MAX_TALENT_POINTS, Math.max(0, (player.level || 1) - 39));
    };

    function findTalentNode(tree, nodeId) {
        if (!tree || !nodeId) return null;
        for (let bi = 0; bi < (tree.branches || []).length; bi++) {
            const branch = tree.branches[bi];
            for (let ni = 0; ni < (branch.nodes || []).length; ni++) {
                const node = branch.nodes[ni];
                if (node.id === nodeId) return { branch, node };
            }
        }
        return null;
    }

    window.getBranchSpentPoints = function getBranchSpentPoints(player, branchId) {
        const tree = window.getTalentTreeForPlayer(player);
        if (!tree || !branchId) return 0;
        const branch = (tree.branches || []).find(b => b.id === branchId);
        if (!branch) return 0;
        const alloc = player.talentAllocations || {};
        let n = 0;
        (branch.nodes || []).forEach(node => {
            if (alloc[node.id]) n++;
        });
        return n;
    };

    window.canAllocateTalent = function canAllocateTalent(player, nodeId) {
        if (!player || !nodeId) return msg('无效请求');
        if (!window.hasTalentSystemUnlocked(player)) return msg('完成二转后解锁天赋');
        if (window.getAvailableTalentPoints(player) < 1) return msg('天赋点不足');
        const tree = window.getTalentTreeForPlayer(player);
        const found = findTalentNode(tree, nodeId);
        if (!found) return msg('无效天赋');
        const { branch, node } = found;
        const alloc = player.talentAllocations || {};
        if (alloc[nodeId]) return msg('已点亮');
        if (node.tier > 1) {
            const prev = (branch.nodes || []).find(n => n.tier === node.tier - 1);
            if (prev && !alloc[prev.id]) return msg('需先点亮上一层');
        }
        if (node.ultimate) {
            if (window.getBranchSpentPoints(player, branch.id) < BRANCH_POINTS_FOR_ULTIMATE) {
                return msg(`该分支需投入 ${BRANCH_POINTS_FOR_ULTIMATE} 点才能解锁终极天赋`);
            }
            const hasUlt = (branch.nodes || []).some(n => n.ultimate && n.id !== nodeId && alloc[n.id]);
            if (hasUlt) return msg('该分支终极天赋已选择');
        }
        return { ok: true, node, branch };
    };

    window.allocateTalent = function allocateTalent(player, nodeId) {
        const check = window.canAllocateTalent(player, nodeId);
        if (!check.ok) return check;
        player.talentAllocations = player.talentAllocations || {};
        player.talentAllocations[nodeId] = 1;
        if (typeof player.updateStats === 'function') player.updateStats();
        return { ok: true, name: check.node.name };
    };

    window.deallocateTalent = function deallocateTalent(player, nodeId) {
        if (!player || !nodeId) return msg('无效请求');
        const tree = window.getTalentTreeForPlayer(player);
        const found = findTalentNode(tree, nodeId);
        if (!found) return msg('无效天赋');
        const alloc = player.talentAllocations || {};
        if (!alloc[nodeId]) return msg('未点亮');
        const { branch, node } = found;
        const higher = (branch.nodes || []).filter(n => n.tier > node.tier && alloc[n.id]);
        if (higher.length) return msg('请先取消更高层天赋');
        delete alloc[nodeId];
        player.talentAllocations = alloc;
        if (typeof player.updateStats === 'function') player.updateStats();
        return { ok: true };
    };

    window.resetTalents = function resetTalents(player) {
        if (!player) return msg('无效角色');
        if (!window.hasTalentSystemUnlocked(player)) return msg('完成二转后解锁天赋');
        if (player.gold < RESET_TALENT_COST) return msg(`金币不足（需要 ${RESET_TALENT_COST}）`);
        player.gold -= RESET_TALENT_COST;
        player.talentAllocations = {};
        if (typeof player.updateStats === 'function') player.updateStats();
        return { ok: true };
    };

    window.applyTalentStatsToPlayer = function applyTalentStatsToPlayer(player) {
        if (!player || !window.hasTalentSystemUnlocked(player)) return;
        const tree = window.getTalentTreeForPlayer(player);
        if (!tree) return;
        const alloc = player.talentAllocations || {};
        let moveSpeedBonus = 0;
        (tree.branches || []).forEach(branch => {
            (branch.nodes || []).forEach(node => {
                if (!alloc[node.id] || !node.stats) return;
                const s = node.stats;
                if (s.hpFlat) player.maxHp += s.hpFlat;
                if (s.attackFlat) player.baseAttack += s.attackFlat;
                if (s.defenseFlat) player.baseDefense += s.defenseFlat;
                if (s.magicAttackFlat) player.baseMagicAttack += s.magicAttackFlat;
                if (s.magicDefenseFlat) player.baseMagicDefense += s.magicDefenseFlat;
                if (s.hpPercent) player.maxHp = Math.floor(player.maxHp * (1 + s.hpPercent / 100));
                if (s.attackPercent) player.baseAttack = Math.floor(player.baseAttack * (1 + s.attackPercent / 100));
                if (s.defensePercent) player.baseDefense = Math.floor(player.baseDefense * (1 + s.defensePercent / 100));
                if (s.magicAttackPercent) player.baseMagicAttack = Math.floor(player.baseMagicAttack * (1 + s.magicAttackPercent / 100));
                if (s.magicDefensePercent) player.baseMagicDefense = Math.floor(player.baseMagicDefense * (1 + s.magicDefensePercent / 100));
                if (s.critRate) player.baseCritRate += s.critRate;
                if (s.critDamage) player.baseCritDamage += s.critDamage;
                if (s.dodge) player.baseDodge += s.dodge;
                if (s.moveSpeed) moveSpeedBonus += s.moveSpeed;
                if (s.attackSpeed) player.baseAttackSpeed += s.attackSpeed;
                if (s.vision) player.baseVision += s.vision;
                if (s.lifeSteal) player.lifeStealPercent += s.lifeSteal;
                if (s.thorn) player.thornPercent += s.thorn;
                if (s.skillHaste) player.skillHastePercent += s.skillHaste;
                if (s.damageReduction) player.damageReductionPercent += s.damageReduction;
            });
        });
        return moveSpeedBonus;
    };

    window.NpcSystem = window.NpcSystem || {};
    window.NpcSystem.RESET_TALENT_COST = RESET_TALENT_COST;
})();
