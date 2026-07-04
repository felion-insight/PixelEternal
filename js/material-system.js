/**
 * Phase 6 — 材料背包
 */
(function () {
    'use strict';

    window.ensurePlayerMaterials = function ensurePlayerMaterials(player) {
        if (!player) return;
        if (!player.materials || typeof player.materials !== 'object') {
            player.materials = {};
        }
    };

    window.getMaterialDefinition = function getMaterialDefinition(materialId) {
        const defs = window.MATERIAL_DEFINITIONS;
        return defs && defs[materialId] ? defs[materialId] : null;
    };

    window.getMaterialName = function getMaterialName(materialId) {
        const def = window.getMaterialDefinition(materialId);
        return def ? def.name : materialId;
    };

    window.getMaterialCount = function getMaterialCount(player, materialId) {
        window.ensurePlayerMaterials(player);
        return Math.max(0, Math.floor(player.materials[materialId] || 0));
    };

    window.addMaterial = function addMaterial(player, materialId, amount) {
        if (!player || !materialId) return 0;
        const n = Math.max(0, Math.floor(amount || 0));
        if (n <= 0) return 0;
        window.ensurePlayerMaterials(player);
        player.materials[materialId] = window.getMaterialCount(player, materialId) + n;
        return n;
    };

    window.spendMaterial = function spendMaterial(player, materialId, amount) {
        if (!player || !materialId) return false;
        const need = Math.max(0, Math.floor(amount || 0));
        if (need <= 0) return true;
        if (window.getMaterialCount(player, materialId) < need) return false;
        player.materials[materialId] -= need;
        return true;
    };

    window.formatMaterialSummary = function formatMaterialSummary(player, limit) {
        window.ensurePlayerMaterials(player);
        const defs = window.MATERIAL_DEFINITIONS || {};
        const items = Object.keys(player.materials)
            .filter(id => player.materials[id] > 0)
            .map(id => ({ id, name: window.getMaterialName(id), count: player.materials[id], color: (defs[id] && defs[id].color) || '#ccc' }))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        const max = limit || 8;
        return items.slice(0, max);
    };
})();
