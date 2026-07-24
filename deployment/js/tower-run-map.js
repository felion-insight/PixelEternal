/**
 * 恶魔塔 Roguelike 节点图生成
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    /**
     * @param {number} seed
     * @param {function} [rng]
     */
    function generateRunMap(seed, rng) {
        const runCfg = cfg().run || {};
        const layers = runCfg.layers || 5;
        const nodesPerLayer = runCfg.nodesPerLayer || [1, 3, 3, 3, 1];
        const bossLayers = new Set(runCfg.bossLayers || [2, 4]);
        const finalBossLayer = runCfg.finalBossLayer != null ? runCfg.finalBossLayer : layers - 1;
        const restLayers = new Set(runCfg.restLayers || []);
        const r = rng || (window.RunStateSystem && window.RunStateSystem.mulberry32(seed)) || Math.random;

        const nodes = [];
        const layerIds = [];

        for (let L = 0; L < layers; L++) {
            const count = nodesPerLayer[L] || 1;
            const ids = [];
            for (let i = 0; i < count; i++) {
                const id = 'n' + L + '_' + i;
                let type = 'battle';
                if (L === 0) type = 'battle';
                else if (L === finalBossLayer) type = 'boss_final';
                else if (bossLayers.has(L)) type = 'boss';
                else {
                    const roll = r();
                    if (roll < (runCfg.eliteChance || 0.28)) type = 'elite';
                    else if (roll < (runCfg.eliteChance || 0.28) + (runCfg.restChance || 0.25)) type = 'rest';
                    else if (roll < (runCfg.eliteChance || 0.28) + (runCfg.restChance || 0.25) + (runCfg.eventChance || 0.2)) type = 'event';
                    else type = 'battle';
                }
                // 商店层：中间层强制至少一个 shop
                const shopLayers = runCfg.shopEveryLayers || [];
                if (shopLayers.indexOf(L) >= 0 && i === 0 && type !== 'boss' && type !== 'boss_final') {
                    type = 'shop';
                }
                // 固定休息层（Boss 前补给）
                if (restLayers.has(L) && i === 0 && type !== 'boss' && type !== 'boss_final' && type !== 'shop') {
                    type = 'rest';
                }
                nodes.push({
                    id: id,
                    layer: L,
                    index: i,
                    type: type,
                    edges: [],
                    cleared: false
                });
                ids.push(id);
            }
            layerIds.push(ids);
        }

        // 连接相邻层：下一层有几个点，就全部可选（Boss 汇聚层仍为 1）
        for (let L = 0; L < layers - 1; L++) {
            const cur = layerIds[L];
            const next = layerIds[L + 1];
            cur.forEach((fromId) => {
                const from = nodes.find((n) => n.id === fromId);
                next.forEach((toId) => {
                    if (from.edges.indexOf(toId) < 0) from.edges.push(toId);
                });
            });
        }

        return {
            seed: seed,
            layers: layers,
            nodes: nodes,
            startId: layerIds[0][0]
        };
    }

    function getNode(map, id) {
        return map.nodes.find((n) => n.id === id) || null;
    }

    function getReachableFrom(map, nodeId) {
        const n = getNode(map, nodeId);
        return n ? n.edges.slice() : [];
    }

    function getActForLayer(layer) {
        const acts = (cfg().run || {}).acts || [];
        for (let i = 0; i < acts.length; i++) {
            const a = acts[i];
            const start = a.layerStart != null ? a.layerStart : 0;
            const end = a.layerEnd != null ? a.layerEnd : start;
            if (layer >= start && layer <= end) return a;
        }
        return null;
    }

    function nodeTypeLabel(type) {
        const m = {
            battle: '战斗',
            elite: '精英',
            rest: '恢复',
            event: '事件',
            shop: '商店',
            boss: 'Boss',
            boss_final: '最终Boss'
        };
        return m[type] || type;
    }

    window.TowerRunMap = {
        generateRunMap,
        getNode,
        getReachableFrom,
        getActForLayer,
        nodeTypeLabel
    };
})();
