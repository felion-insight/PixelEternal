/**
 * 恶魔塔 Roguelike：动态下一层选项（不预生成整图）
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function runCfg() {
        return cfg().run || {};
    }

    /** 由 acts 配置展开绝对层范围 */
    function computeActLayout() {
        const acts = runCfg().acts || [];
        const layout = [];
        let cursor = 0;
        for (let i = 0; i < acts.length; i++) {
            const a = acts[i] || {};
            const pre = Math.max(0, a.preBossSteps != null ? a.preBossSteps : 8);
            const layerStart = cursor;
            const bossLayer = layerStart + pre;
            const layerEnd = bossLayer;
            layout.push({
                index: i,
                name: a.name || ('第' + (i + 1) + '章'),
                preBossSteps: pre,
                layerStart: layerStart,
                bossLayer: bossLayer,
                layerEnd: layerEnd,
                bossType: a.bossType || (i === acts.length - 1 ? 'boss_final' : 'boss'),
                eliteMax: a.eliteMax != null ? a.eliteMax : 2,
                restMin: a.restMin != null ? a.restMin : 1,
                shopMin: a.shopMin != null ? a.shopMin : 1,
                banEliteFirst: a.banEliteFirst != null ? a.banEliteFirst : 0,
                forceRestAt: (a.forceRestAt || []).slice(),
                forceShopAt: (a.forceShopAt || []).slice()
            });
            cursor = layerEnd + 1;
        }
        return layout;
    }

    function totalLayers() {
        const layout = computeActLayout();
        if (!layout.length) return 1;
        return layout[layout.length - 1].layerEnd + 1;
    }

    function getActLayoutForLayer(layer) {
        const layout = computeActLayout();
        for (let i = 0; i < layout.length; i++) {
            const a = layout[i];
            if (layer >= a.layerStart && layer <= a.layerEnd) return a;
        }
        return layout.length ? layout[layout.length - 1] : null;
    }

    function getActForLayer(layer) {
        const a = getActLayoutForLayer(layer);
        if (!a) return null;
        return {
            name: a.name,
            layerStart: a.layerStart,
            layerEnd: a.layerEnd,
            index: a.index,
            preBossSteps: a.preBossSteps,
            bossLayer: a.bossLayer
        };
    }

    /**
     * 将加长后的绝对层映射到旧遭遇表层号（s1:0-8 / s2:9-16 / s3:17-24 / s4:25-26）
     */
    function toEncounterLayer(absLayer) {
        const a = getActLayoutForLayer(absLayer);
        if (!a) return Math.max(0, absLayer | 0);
        const oldRanges = [
            { start: 0, end: 8 },
            { start: 9, end: 16 },
            { start: 17, end: 24 },
            { start: 25, end: 26 }
        ];
        const range = oldRanges[Math.min(a.index, oldRanges.length - 1)];
        const span = Math.max(1, a.layerEnd - a.layerStart);
        const t = Math.max(0, Math.min(1, (absLayer - a.layerStart) / span));
        return Math.round(range.start + t * (range.end - range.start));
    }

    function emptyCounts() {
        return { battle: 0, elite: 0, rest: 0, shop: 0, event: 0, boss: 0, boss_final: 0 };
    }

    function createEmptyMap(seed) {
        const layers = totalLayers();
        return {
            seed: seed,
            layers: layers,
            nodes: [],
            startId: null,
            nextChoices: [],
            history: [],
            progress: {
                nextLayer: 0,
                actCounts: emptyCounts(),
                combatStreak: 0
            }
        };
    }

    function getNode(map, id) {
        if (!map || !map.nodes) return null;
        return map.nodes.find((n) => n.id === id) || null;
    }

    function getReachableFrom(map, nodeId) {
        const n = getNode(map, nodeId);
        return n ? (n.edges || []).slice() : [];
    }

    function makeNode(layer, index, type) {
        return {
            id: 'n' + layer + '_' + index,
            layer: layer,
            index: index,
            type: type,
            edges: [],
            cleared: false
        };
    }

    function shuffleInPlace(arr, rng) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = arr[i];
            arr[i] = arr[j];
            arr[j] = t;
        }
        return arr;
    }

    function pickWeightedType(weights, rng) {
        let total = 0;
        const keys = Object.keys(weights);
        keys.forEach((k) => { total += Math.max(0, weights[k] || 0); });
        if (total <= 0) return 'battle';
        let roll = rng() * total;
        for (let i = 0; i < keys.length; i++) {
            roll -= Math.max(0, weights[keys[i]] || 0);
            if (roll <= 0) return keys[i];
        }
        return keys[keys.length - 1];
    }

    function stepInAct(act, layer) {
        return layer - act.layerStart;
    }

    function remainingPreBoss(act, layer) {
        return act.bossLayer - layer;
    }

    /**
     * 为指定绝对层生成类型列表（长度 1 或 choicesPerStep）
     */
    function rollTypesForLayer(map, layer, rng) {
        const rc = runCfg();
        const choicesN = rc.choicesPerStep != null ? rc.choicesPerStep : 3;
        const run = map._runRef;
        if (run && window.DemonPact && window.DemonPact.isBossRushOnly(run)) {
            const act = getActLayoutForLayer(layer);
            if (act && layer === act.bossLayer) return [act.bossType || 'boss'];
            return ['boss'];
        }
        const act = getActLayoutForLayer(layer);
        if (!act) return ['battle'];

        if (layer === act.bossLayer) {
            return [act.bossType || 'boss'];
        }

        if (run && window.BuildCommitmentSystem && window.BuildCommitmentSystem.needsCommitmentNode(run, layer)) {
            return ['commitment'];
        }

        const step = stepInAct(act, layer);
        const counts = (map.progress && map.progress.actCounts) || emptyCounts();
        const remaining = remainingPreBoss(act, layer);

        if ((act.forceRestAt || []).indexOf(step) >= 0) {
            return ['rest'];
        }
        if ((act.forceShopAt || []).indexOf(step) >= 0) {
            return ['shop'];
        }

        const banElite = step < (act.banEliteFirst || 0) || counts.elite >= act.eliteMax;
        const needRest = counts.rest < act.restMin && remaining <= (act.restMin - counts.rest);
        const needShop = counts.shop < act.shopMin && remaining <= (act.shopMin - counts.shop) + 1;
        const combatStreak = (map.progress && map.progress.combatStreak) || 0;
        const forceHealOption = combatStreak >= 2;

        if (needRest) return ['rest'];
        if (needShop) return ['shop'];

        const weights = {
            battle: rc.battleChance != null ? rc.battleChance : 0.36,
            elite: banElite ? 0 : (rc.eliteChance != null ? rc.eliteChance : 0.2),
            rest: rc.restChance != null ? rc.restChance : 0.18,
            event: rc.eventChance != null ? rc.eventChance : 0.26,
            shop: 0.12
        };
        if (step < (act.banEliteFirst || 0)) {
            weights.elite = 0;
            weights.shop = Math.max(weights.shop, 0.08);
        }
        if (run && window.ZoneMutationRuntime) {
            weights = window.ZoneMutationRuntime.modifyNodeWeights(weights, run);
        }

        const types = [];
        const used = {};
        for (let i = 0; i < choicesN; i++) {
            let w = Object.assign({}, weights);
            // 优先互异
            Object.keys(used).forEach((t) => { w[t] = (w[t] || 0) * 0.15; });
            if (forceHealOption && i === 0 && !used.rest && !used.event) {
                types.push(rng() < 0.55 ? 'rest' : 'event');
                used[types[types.length - 1]] = true;
                continue;
            }
            let t = pickWeightedType(w, rng);
            // 禁止三选全精英
            if (t === 'elite' && types.filter((x) => x === 'elite').length >= 1 && rng() < 0.85) {
                t = pickWeightedType({ battle: 1, event: 0.8, rest: 0.6, shop: 0.4 }, rng);
            }
            types.push(t);
            used[t] = true;
        }

        // 仍避免三精英
        if (types.every((t) => t === 'elite')) {
            types[1] = 'battle';
            types[2] = 'rest';
        }
        return types;
    }

    function attachChoices(map, fromNode, choiceNodes) {
        map.nextChoices = choiceNodes.map((n) => n.id);
        if (fromNode) {
            fromNode.edges = choiceNodes.map((n) => n.id);
        }
    }

    function generateChoicesAtLayer(map, layer, rng) {
        const r = rng || Math.random;
        const types = rollTypesForLayer(map, layer, r);
        const nodes = [];
        for (let i = 0; i < types.length; i++) {
            const node = makeNode(layer, i, types[i]);
            if (window.MutatedNodeSystem && window.MutatedNodeSystem.maybeMutateNode) {
                window.MutatedNodeSystem.maybeMutateNode(map._runRef || null, node, r);
            }
            map.nodes.push(node);
            nodes.push(node);
        }
        map.progress.nextLayer = layer;
        return nodes;
    }

    /**
     * 开局：生成第 0 层起点（单战斗）并设为唯一可选
     */
    function generateOpeningChoices(map, rng) {
        const r = rng || Math.random;
        map.nodes = [];
        map.history = [];
        map.progress = {
            nextLayer: 0,
            actCounts: emptyCounts(),
            combatStreak: 0,
            actIndex: 0
        };
        const start = makeNode(0, 0, 'battle');
        map.nodes.push(start);
        map.startId = start.id;
        map.nextChoices = [start.id];
        map.layers = totalLayers();
        return [start];
    }

    /**
     * 节点结算后：按进度生成下一层选项并挂到 fromNode.edges
     * @returns {object[]} 新选项节点
     */
    function generateNextChoices(map, fromNode, rng) {
        const r = rng || Math.random;
        if (!map || !fromNode) return [];
        if (fromNode._choicesGenerated) {
            return (fromNode.edges || []).map((id) => getNode(map, id)).filter(Boolean);
        }

        // 更新本章计数与连战
        const counts = map.progress.actCounts || emptyCounts();
        counts[fromNode.type] = (counts[fromNode.type] || 0) + 1;
        map.progress.actCounts = counts;
        if (fromNode.type === 'battle' || fromNode.type === 'elite') {
            map.progress.combatStreak = (map.progress.combatStreak || 0) + 1;
        } else if (fromNode.type === 'rest' || fromNode.type === 'event' || fromNode.type === 'shop') {
            map.progress.combatStreak = 0;
        }

        map.history = map.history || [];
        map.history.push({ id: fromNode.id, type: fromNode.type, layer: fromNode.layer });
        if (map.history.length > 12) map.history.shift();

        const nextLayer = fromNode.layer + 1;
        if (nextLayer >= map.layers) {
            map.nextChoices = [];
            fromNode.edges = [];
            return [];
        }

        const actBefore = getActLayoutForLayer(fromNode.layer);
        const actNext = getActLayoutForLayer(nextLayer);
        if (actBefore && actNext && actNext.index !== actBefore.index) {
            map.progress.actCounts = emptyCounts();
            map.progress.combatStreak = 0;
            map.progress.actIndex = actNext.index;
        }

        const choices = generateChoicesAtLayer(map, nextLayer, r);
        attachChoices(map, fromNode, choices);
        fromNode._choicesGenerated = true;
        return choices;
    }

    /**
     * 兼容旧测试：用动态 API 走完整路径预生成（仅测试用，游戏不用）
     */
    function generateRunMap(seed, rng) {
        const r = rng || (window.RunStateSystem && window.RunStateSystem.mulberry32(seed)) || Math.random;
        const map = createEmptyMap(seed);
        generateOpeningChoices(map, r);
        let cur = getNode(map, map.startId);
        while (cur && cur.layer < map.layers - 1) {
            const choices = generateNextChoices(map, cur, r);
            if (!choices.length) break;
            cur = choices[0];
            cur.cleared = true;
        }
        // 重置 cleared，仅保留结构供旧测试读 layers
        map.nodes.forEach((n) => { n.cleared = false; });
        // 重新挂起点 edges：取 layer1 节点
        const start = getNode(map, map.startId);
        const layer1 = map.nodes.filter((n) => n.layer === 1);
        if (start) start.edges = layer1.map((n) => n.id);
        map.nextChoices = start ? start.edges.slice() : [];
        return map;
    }

    function nodeTypeLabel(type) {
        const m = {
            battle: '战斗',
            elite: '精英',
            rest: '休整',
            event: '事件',
            shop: '商店',
            boss: 'Boss',
            boss_final: '最终 Boss',
            commitment: '构筑承诺'
        };
        return m[type] || type;
    }

    function nodeTypeHint(type) {
        const m = {
            battle: '常规遭遇 · 金币与技能',
            elite: '强敌挑战 · 遗物三选一',
            rest: '分配等级 · 回血或升星',
            event: '随机叙事 · 风险与收益',
            shop: '花费金币 · 装备与遗物',
            boss: '章末首领 · 高价值奖励',
            boss_final: '终局决战 · 通关恶魔塔',
            commitment: '锁定构筑路径 · 影响后续掉落'
        };
        return m[type] || '';
    }

    function getProgressLabel(map, layer) {
        const a = getActLayoutForLayer(layer != null ? layer : (map && map.progress ? map.progress.nextLayer : 0));
        if (!a) return '';
        const step = Math.min(a.preBossSteps + 1, (layer - a.layerStart) + 1);
        const max = a.preBossSteps + 1;
        return a.name + ' · ' + step + '/' + max;
    }

    window.TowerRunMap = {
        generateRunMap,
        createEmptyMap,
        generateOpeningChoices,
        generateNextChoices,
        getNode,
        getReachableFrom,
        getActForLayer,
        getActLayoutForLayer,
        toEncounterLayer,
        totalLayers,
        computeActLayout,
        nodeTypeLabel,
        nodeTypeHint,
        getProgressLabel
    };
})();
