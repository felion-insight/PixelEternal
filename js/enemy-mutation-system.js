/**
 * 敌人变异：遭遇生成时随机附加行为/属性
 */
(function () {
    'use strict';

    function mutCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.ENEMY_MUTATIONS_CONFIG) ||
            window.ENEMY_MUTATIONS_CONFIG || {};
    }

    function allMutations() {
        const c = mutCfg();
        return c.mutations || c.ENEMY_MUTATIONS_CONFIG?.mutations || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('enemyMutations');
    }

    function spawnChance() {
        const hub = window.AscensionHub ? window.AscensionHub.flag('enemyMutations') : {};
        if (hub.chance != null) return hub.chance;
        return mutCfg().spawnChance != null ? mutCfg().spawnChance : 0.3;
    }

    function rollMutation(rng) {
        const r = rng || Math.random;
        if (r() > spawnChance()) return null;
        const keys = Object.keys(allMutations());
        if (!keys.length) return null;
        const id = keys[Math.floor(r() * keys.length)];
        return { id: id, def: allMutations()[id] };
    }

    function applyToEnemy(enemy, mut) {
        if (!enemy || !mut || !mut.def) return enemy;
        const d = mut.def;
        enemy.mutationId = mut.id;
        enemy.mutationName = d.name;
        enemy.mutationAura = d.auraColor || '#ffffff';
        if (d.hpMult) {
            enemy.maxHp = Math.max(1, Math.floor((enemy.maxHp || enemy.hp || 100) * d.hpMult));
            enemy.hp = enemy.maxHp;
        }
        if (d.attackMult) enemy.attack = Math.floor((enemy.attack || 10) * d.attackMult);
        if (d.defenseMult) enemy.defense = Math.floor((enemy.defense || 4) * d.defenseMult);
        if (d.speedMult) enemy.speed = Math.floor((enemy.speed || 60) * d.speedMult);
        if (d.lifestealPct) enemy.lifestealPct = d.lifestealPct;
        if (d.reflectPct) enemy.reflectPct = d.reflectPct;
        if (d.splitOnDeath) enemy.mutationSplit = { count: d.splitCount || 2, hpPct: d.splitHpPct || 0.4 };
        if (d.reviveOnce) enemy.mutationRevive = { hpPct: d.reviveHpPct || 0.5, used: false };
        if (d.blinkIntervalMs) enemy.mutationBlinkMs = d.blinkIntervalMs;
        if (d.summonIntervalMs) {
            enemy.mutationSummon = {
                intervalMs: d.summonIntervalMs,
                templateId: d.summonTemplateId || 'ab_grunt',
                acc: 0
            };
        }
        return enemy;
    }

    function mutateEncounterEnemies(enemies, rng) {
        if (!isEnabled() || !enemies || !enemies.length) return enemies;
        return enemies.map((e) => {
            if (e.isBoss || (e.id && String(e.id).indexOf('boss') >= 0)) return e;
            const mut = rollMutation(rng);
            if (!mut) return e;
            return applyToEnemy(Object.assign({}, e), mut);
        });
    }

    function tickBattle(battle, dtMs) {
        if (!battle || !isEnabled()) return;
        (battle.enemies || []).forEach((e) => {
            if (!e.alive || e.hp <= 0) return;
            if (e.mutationBlinkMs) {
                e._blinkAcc = (e._blinkAcc || 0) + dtMs;
                if (e._blinkAcc >= e.mutationBlinkMs) {
                    e._blinkAcc = 0;
                    e.col = Math.floor(Math.random() * (battle.board?.cols || 4));
                    e.row = Math.floor(Math.random() * (battle.board?.rows || 3));
                }
            }
            if (e.mutationSummon) {
                e.mutationSummon.acc = (e.mutationSummon.acc || 0) + dtMs;
                if (e.mutationSummon.acc >= e.mutationSummon.intervalMs &&
                    window.AutoBattleSimulator && window.AutoBattleSimulator.spawnTraitEnemy) {
                    e.mutationSummon.acc = 0;
                    window.AutoBattleSimulator.spawnTraitEnemy(
                        battle, e.mutationSummon.templateId, e.col || 0, e.row || 0, 0.5
                    );
                }
            }
        });
    }

    function tryRevive(battle, target) {
        if (!isEnabled() || !battle || !target || target.side !== 'enemy') return false;
        if (!target.mutationRevive || target.mutationRevive.used) return false;
        target.mutationRevive.used = true;
        target.hp = Math.max(1, Math.floor((target.maxHp || 100) * (target.mutationRevive.hpPct || 0.5)));
        target.alive = true;
        return true;
    }

    function onKill(battle, target) {
        if (!isEnabled() || !battle || !target || target.side !== 'enemy') return;
        if (!target.mutationSplit || !window.AutoBattleSimulator || !window.AutoBattleSimulator.spawnTraitEnemy) return;
        const split = target.mutationSplit;
        const count = split.count || 2;
        for (let i = 0; i < count; i++) {
            const col = Math.max(0, Math.min((battle.board?.cols || 4) - 1, (target.col || 0) + (i % 2)));
            const row = Math.max(0, Math.min((battle.board?.rows || 3) - 1, (target.row || 0) + Math.floor(i / 2)));
            const spawned = window.AutoBattleSimulator.spawnTraitEnemy(
                battle, target.templateId || target.id || 'ab_grunt', col, row, split.hpPct || 0.4
            );
            if (spawned) {
                spawned.mutationId = null;
                spawned.mutationName = null;
            }
        }
    }

    window.EnemyMutationSystem = {
        allMutations,
        rollMutation,
        applyToEnemy,
        mutateEncounterEnemies,
        tickBattle,
        tryRevive,
        onKill,
        isEnabled
    };
})();
