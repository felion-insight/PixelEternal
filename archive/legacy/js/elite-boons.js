/**
 * 恶魔塔精英房通关加护：数值加成与简单机制
 * player.eliteBoons: { id: string, stacks: number }[]
 *
 * 加护仅在「当前恶魔塔探险」内有效；离开恶魔塔（回主城、死亡回城等）时由
 * Game.transitionScene / resetDemonTowerTransientPlayerState 清空并重算属性。
 */
(function () {
    'use strict';

    const BOONS = {
        blood_edge: {
            name: '心血之刃',
            description: '每 100 点最大生命值，攻击力 +2。',
            apply: function (p, stacks) {
                p._ebAtkPer100MaxHp += 2 * stacks;
            }
        },
        stone_skin: {
            name: '岩肤加护',
            description: '防御力 +12。',
            apply: function (p, stacks) {
                p._ebFlatDef += 12 * stacks;
            }
        },
        giant_blood: {
            name: '巨人之血',
            description: '最大生命值 +8%。',
            apply: function (p, stacks) {
                for (let i = 0; i < stacks; i++) p._ebMaxHpMult *= 1.08;
            }
        },
        keen_sight: {
            name: '锐眼加护',
            description: '暴击率 +5%。',
            apply: function (p, stacks) {
                p._ebCritRate += 5 * stacks;
            }
        },
        wind_step: {
            name: '疾风加护',
            description: '移动速度 +10%。',
            apply: function (p, stacks) {
                p._ebMoveSpeedPercent += 10 * stacks;
            }
        },
        war_rhythm: {
            name: '战律加护',
            description: '攻击速度 +12%。',
            apply: function (p, stacks) {
                p._ebAttackSpeedPercent += 12 * stacks;
            }
        },
        desperate_might: {
            name: '绝境之力',
            description: '生命值低于 40% 时，攻击力 +18%。',
            apply: function (p, stacks) {
                p._ebLowHpAttackMult *= Math.pow(1.18, stacks);
            }
        },
        soul_drink: {
            name: '噬魂触痕',
            description: '每次近战或远程攻击命中敌人时，回复 4 点生命。',
            apply: function (p, stacks) {
                p._ebOnHitHeal += 4 * stacks;
            }
        },
        iron_guard: {
            name: '铁壁意志',
            description: '防御力 +8；每层叠加以 5% 提高最大生命值。',
            apply: function (p, stacks) {
                p._ebFlatDef += 8 * stacks;
                for (let i = 0; i < stacks; i++) {
                    p._ebMaxHpMult *= 1.05;
                }
            }
        },
        fury_mark: {
            name: '狂怒刻印',
            description: '攻击力 +6。',
            apply: function (p, stacks) {
                p._ebFlatAttack += 6 * stacks;
            }
        }
    };

    window.ELITE_BOON_DEFINITIONS = BOONS;
    window.ELITE_BOON_IDS = Object.keys(BOONS);

    /**
     * 在 Player.updateStats 中调用：在词条处理之后、移速封顶与恶魔干扰之前插入
     * @param {Player} player
     */
    window.applyEliteBoonPassivesInUpdateStats = function (player) {
        player._ebAtkPer100MaxHp = 0;
        player._ebFlatDef = 0;
        player._ebMaxHpMult = 1;
        player._ebCritRate = 0;
        player._ebMoveSpeedPercent = 0;
        player._ebAttackSpeedPercent = 0;
        player._ebLowHpAttackMult = 1;
        player._ebOnHitHeal = 0;
        player._ebFlatAttack = 0;

        const list = player.eliteBoons;
        if (!list || !list.length) return;

        list.forEach(function (entry) {
            const def = BOONS[entry.id];
            if (!def) return;
            const stacks = Math.max(1, entry.stacks | 0);
            def.apply(player, stacks);
        });

        if (player._ebMaxHpMult !== 1) {
            player.maxHp = Math.max(1, Math.floor(player.maxHp * player._ebMaxHpMult));
        }
        if (player._ebAtkPer100MaxHp > 0) {
            player.baseAttack += Math.floor(player.maxHp / 100) * player._ebAtkPer100MaxHp;
        }
        player.baseAttack += player._ebFlatAttack;
        player.baseDefense += player._ebFlatDef;
        player.baseCritRate += player._ebCritRate;
        if (player._ebAttackSpeedPercent > 0) {
            player.baseAttackSpeed = Math.floor(player.baseAttackSpeed * (1 + player._ebAttackSpeedPercent / 100));
        }
        if (player._ebLowHpAttackMult > 1 && player.hp < player.maxHp * 0.4) {
            player.baseAttack = Math.floor(player.baseAttack * player._ebLowHpAttackMult);
        }
    };

    window.getEliteBoonMeta = function (id) {
        const d = BOONS[id];
        return d ? { name: d.name, description: d.description } : { name: id, description: '' };
    };
})();
