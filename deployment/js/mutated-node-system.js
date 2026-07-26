/**
 * 变异节点：极低概率改变战斗规则
 */
(function () {
    'use strict';

    function mutCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.MUTATED_NODE_CONFIG) ||
            window.MUTATED_NODE_CONFIG || {};
    }

    function allTypes() {
        const c = mutCfg();
        return c.types || c.MUTATED_NODE_CONFIG?.types || {};
    }

    function rollMutation(rng) {
        const r = rng || Math.random;
        const chance = mutCfg().spawnChance != null ? mutCfg().spawnChance : 0.05;
        if (r() > chance) return null;
        const keys = Object.keys(allTypes());
        if (!keys.length) return null;
        const id = keys[Math.floor(r() * keys.length)];
        return { id: id, def: allTypes()[id] };
    }

    function maybeMutateNode(run, node, rng) {
        if (!node || node.type !== 'battle' && node.type !== 'elite') return node;
        if (node.mutationId) return node;
        const mut = rollMutation(rng);
        if (!mut) return node;
        node.mutationId = mut.id;
        node.mutationName = mut.def.name;
        node.mutationDesc = mut.def.description;
        node.mutationType = mut.id;
        return node;
    }

    function applyToBattle(battle, node) {
        if (!battle || !node || !node.mutationId) return;
        const def = allTypes()[node.mutationId];
        if (!def) return;
        battle.mutation = { id: node.mutationId, def: def };
        if (def.stripGear) battle.mutationStripGear = true;
        if (def.duelMode || node.mutationId === 'duel_1v1') {
            battle.mutationDuel = true;
            battle.allies = (battle.allies || []).slice(0, 1);
            battle.enemies = (battle.enemies || []).slice(0, 1);
            if (battle.enemies[0]) {
                const mult = def.enemyStatMult || 4;
                battle.enemies[0].maxHp = Math.floor(battle.enemies[0].maxHp * mult);
                battle.enemies[0].hp = battle.enemies[0].maxHp;
                battle.enemies[0].attack = Math.floor((battle.enemies[0].attack || 10) * mult);
            }
            if (battle.allies[0]) {
                const mult = def.enemyStatMult || 4;
                battle.allies[0].maxHp = Math.floor(battle.allies[0].maxHp * mult);
                battle.allies[0].hp = battle.allies[0].maxHp;
                battle.allies[0].attack = Math.floor((battle.allies[0].attack || 10) * mult);
            }
        }
        if (def.oneHitKill || node.mutationId === 'one_hit_kill') battle.mutationOneHit = true;
        if (def.survivalMode || node.mutationId === 'survival_mode') battle.mutationSurvival = true;
        if (def.mirrorMode || node.mutationId === 'mirror_match') battle.mutationMirror = true;
        if (def.elementOnly) battle.mutationElement = def.elementOnly;
        if (node.mutationId === 'element_only') battle.mutationElement = def.elementOnly || 'fire';
        if (def.reverseControl || node.mutationId === 'reverse_battle') {
            battle.mutationReverse = true;
            const living = (battle.enemies || []).filter((u) => u.alive !== false && (u.hp == null || u.hp > 0));
            if (living.length) {
                living[0].playerControlled = true;
                battle.reverseSelectedId = living[0].id;
            }
        }
    }

    window.MutatedNodeSystem = { rollMutation, maybeMutateNode, applyToBattle, allTypes };
})();
