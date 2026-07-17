/**
 * 神射手 · 弹药 + 精准层数
 * Marksman：消耗型（上限5）| Deadeye：维持型（上限15，永不消耗）
 */
(function () {
    'use strict';

    const MARKSMAN_ONLY = { marksman: true };
    const MARKSMAN_TREE = { marksman: true, deadeye: true };

    const MARKSMAN_MAX = 5;
    const MARKSMAN_ATK_PER = 6;
    const MARKSMAN_CRIT_PER = 4;
    const MARKSMAN_BASIC_HITS = 3;

    const DEADEYE_MAX = 15;
    const DEADEYE_ATK_PER = 4;
    const DEADEYE_CRIT_PER = 2;
    const DEADEYE_CRIT_DMG_PER = 4;
    const DEADEYE_BASIC_HITS = 2;
    const DEADEYE_BREATH_BASIC_HITS = 1;

    function getProgressionId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassProgressionId === 'function'
            ? window.getActiveClassProgressionId(player.classData) : null;
    }

    function isMarksmanTree(player) {
        const prog = getProgressionId(player);
        return !!(prog && MARKSMAN_TREE[prog]);
    }

    function isMarksmanOnly(player) {
        const prog = getProgressionId(player);
        return !!(prog && MARKSMAN_ONLY[prog]);
    }

    function isDeadeye(player) {
        return typeof window.isDeadeyePlayer === 'function' && window.isDeadeyePlayer(player);
    }

    window.isMarksmanTreePlayer = isMarksmanTree;

    window.getMaxPrecisionStacks = function getMaxPrecisionStacks(player) {
        const sustain = typeof window.getSetModifier === 'function'
            ? window.getSetModifier(player, 'precisionSustain', 0) : 0;
        if (isDeadeye(player)) return DEADEYE_MAX + Math.max(0, Math.floor(sustain));
        return MARKSMAN_MAX;
    };

    window.getPrecisionStacks = function getPrecisionStacks(player) {
        if (!player) return 0;
        const max = window.getMaxPrecisionStacks(player);
        return Math.max(0, Math.min(max, player._precisionStacks || 0));
    };

    window.getPrecisionHoldBonuses = function getPrecisionHoldBonuses(player) {
        const stacks = window.getPrecisionStacks(player);
        if (isDeadeye(player)) {
            return {
                stacks,
                attackPercent: stacks * DEADEYE_ATK_PER,
                critRate: stacks * DEADEYE_CRIT_PER,
                critDmgPercent: stacks * DEADEYE_CRIT_DMG_PER
            };
        }
        return {
            stacks,
            attackPercent: stacks * MARKSMAN_ATK_PER,
            critRate: stacks * MARKSMAN_CRIT_PER,
            critDmgPercent: 0
        };
    };

    window.getPlayerEffectiveCritRate = function getPlayerEffectiveCritRate(player) {
        if (!player) return 0;
        let rate = player.baseCritRate || 0;
        if (isMarksmanTree(player)) {
            rate += window.getPrecisionHoldBonuses(player).critRate;
        }
        if (typeof window.getBreathHoldSelfCritRate === 'function') {
            rate += window.getBreathHoldSelfCritRate(player);
        }
        return rate;
    };

    window.getPlayerPrecisionCritDmgBonus = function getPlayerPrecisionCritDmgBonus(player) {
        if (!player || !isDeadeye(player)) return 0;
        return window.getPrecisionHoldBonuses(player).critDmgPercent || 0;
    };

    window.addPrecisionStacks = function addPrecisionStacks(player, amount, gameInstance) {
        if (!isMarksmanTree(player) || !amount) return;
        const gainBonus = typeof window.getSetModifier === 'function'
            ? window.getSetModifier(player, 'precisionGainBonus', 0) : 0;
        let add = amount;
        if (gainBonus > 0) {
            // 概率/倍率：0.25 → 25% 额外 +1，或按倍率放大
            add = Math.max(1, Math.ceil(amount * (1 + gainBonus)));
        }
        const max = window.getMaxPrecisionStacks(player);
        const before = window.getPrecisionStacks(player);
        player._precisionStacks = Math.min(max, before + add);
        const gained = player._precisionStacks - before;
        if (gained > 0 && gameInstance) {
            if (typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(
                    player.x, player.y - 28,
                    `精准 +${gained} (${player._precisionStacks}/${max})`,
                    '#ffdd44', 900, 14
                );
            }
            if (typeof gameInstance.updateHUD === 'function') {
                gameInstance.updateHUD();
            }
        }
    };

    window.consumePrecisionStacks = function consumePrecisionStacks(player, amount, gameInstance) {
        if (!player || isDeadeye(player)) return 0;
        const current = window.getPrecisionStacks(player);
        const toConsume = amount != null ? Math.min(current, Math.max(0, amount)) : current;
        player._precisionStacks = Math.max(0, current - toConsume);
        if (gameInstance && typeof gameInstance.updateHUD === 'function') {
            gameInstance.updateHUD();
        }
        return toConsume;
    };

    window.applyMarksmanSkillResourceOverrides = function applyMarksmanSkillResourceOverrides(player, skillDef) {
        if (!isMarksmanTree(player) || !skillDef) return skillDef;

        if (skillDef.id === 'backstep_shot') {
            const ec = skillDef.entityConfig || {};
            return Object.assign({}, skillDef, {
                resourceType: 'ammo',
                resourceCost: 8,
                cooldownMs: isDeadeye(player) ? 2500 : 3000,
                entityConfig: Object.assign({}, ec, {
                    backstepDistance: 140,
                    backstepDurationMs: 280,
                    backstepInvincibleMs: 120
                })
            });
        }

        if (skillDef.id === 'aimed_shot') {
            return Object.assign({}, skillDef, { resourceType: 'ammo', resourceCost: 12 });
        }
        if (skillDef.id === 'weakness_mark') {
            return Object.assign({}, skillDef, { resourceType: 'ammo', resourceCost: 5 });
        }
        if (skillDef.id === 'death_gaze') {
            return Object.assign({}, skillDef, { resourceType: 'ammo', resourceCost: 16 });
        }
        if (skillDef.id === 'weakness_mark_de') {
            return Object.assign({}, skillDef, { resourceType: 'ammo', resourceCost: 6 });
        }
        if (skillDef.id === 'breath_hold') {
            return Object.assign({}, skillDef, { resourceType: 'ammo', resourceCost: 0 });
        }
        if (skillDef.id === 'deadeye_snipe') {
            return Object.assign({}, skillDef, { resourceType: 'ammo', resourceCost: 0 });
        }

        return skillDef;
    };

    window.prepareMarksmanPrecisionCast = function prepareMarksmanPrecisionCast(player, skillDef, gameInstance, now) {
        if (!isMarksmanTree(player) || !skillDef || !skillDef.entityConfig) return;
        const ec = skillDef.entityConfig;
        const t = now != null ? now : Date.now();

        if (ec.breathHold && typeof window.applyBreathHold === 'function') {
            window.applyBreathHold(player, skillDef, gameInstance, t);
            return;
        }
        if (ec.deadeyeSnipe && typeof window.applyDeadeyeSnipe === 'function') {
            window.applyDeadeyeSnipe(player, skillDef, gameInstance, null, t);
            return;
        }

        if (isDeadeye(player)) return;

        if (ec.consumePrecisionStacks) {
            let toConsume = 0;
            if (ec.precisionConsumeCount != null) {
                toConsume = ec.precisionConsumeCount;
            } else if (ec.precisionConsumeMax != null) {
                toConsume = Math.min(window.getPrecisionStacks(player), ec.precisionConsumeMax);
            } else {
                toConsume = window.getPrecisionStacks(player);
            }
            const stacks = window.consumePrecisionStacks(player, toConsume, gameInstance);
            const perStack = ec.precisionCritDmgPerStack || 0;
            player._pendingPrecisionCritBonus = stacks * perStack;
            player._lastConsumedPrecisionStacks = stacks;
        }

        if (ec.pauseAmmoDuringCast) {
            const windup = ec.windupMs || 0;
            const flightMs = Math.ceil((ec.maxRange || skillDef.range || 800) / Math.max(1, ec.speed || 1200) * 1000);
            player._ammoReloadPausedUntil = t + windup + flightMs + 200;
        }
    };

    window.clearMarksmanPrecisionState = function clearMarksmanPrecisionState(player) {
        if (!player) return;
        player._precisionStacks = 0;
        player._pendingPrecisionCritBonus = 0;
        player._lastConsumedPrecisionStacks = 0;
        player._precisionBasicHitCount = 0;
        delete player._ammoReloadPausedUntil;
        if (typeof window.clearDeadeyeCombatState === 'function') {
            window.clearDeadeyeCombatState(player);
        }
    };

    window.onMarksmanWeaknessMarkHit = function onMarksmanWeaknessMarkHit(player, gameInstance) {
        if (!isMarksmanOnly(player)) return;
        window.addPrecisionStacks(player, 2, gameInstance);
    };

    window.onMarksmanBackstepShotUsed = function onMarksmanBackstepShotUsed(player, gameInstance) {
        if (!isMarksmanTree(player)) return;
        let gain = 1;
        if (isDeadeye(player) && typeof window.scaleDeadeyePrecisionGain === 'function') {
            gain = window.scaleDeadeyePrecisionGain(player, 1);
        }
        window.addPrecisionStacks(player, gain, gameInstance);
    };

    window.onMarksmanBasicAttackHit = function onMarksmanBasicAttackHit(player, gameInstance) {
        if (!isMarksmanTree(player)) return;
        if (typeof window.isDeadeyeSnipeActive === 'function' && window.isDeadeyeSnipeActive(player)) return;

        let need = isDeadeye(player) ? DEADEYE_BASIC_HITS : MARKSMAN_BASIC_HITS;
        if (isDeadeye(player) && typeof window.isBreathHoldActive === 'function'
            && window.isBreathHoldActive(player)) {
            need = DEADEYE_BREATH_BASIC_HITS;
        }

        player._precisionBasicHitCount = (player._precisionBasicHitCount || 0) + 1;
        if (player._precisionBasicHitCount >= need) {
            player._precisionBasicHitCount = 0;
            let gain = 1;
            if (isDeadeye(player) && typeof window.scaleDeadeyePrecisionGain === 'function') {
                gain = window.scaleDeadeyePrecisionGain(player, 1);
            }
            window.addPrecisionStacks(player, gain, gameInstance);
        }
    };

    window.isMarksmanBasicAttackSkill = function isMarksmanBasicAttackSkill(skillDef) {
        if (!skillDef) return false;
        if (skillDef.slotType === 'basic' || skillDef.category === 'basic') return true;
        return typeof skillDef.id === 'string' && skillDef.id.endsWith('_basic');
    };

    window.onMarksmanAimedShotCrit = function onMarksmanAimedShotCrit(player, refund) {
        if (!isMarksmanTree(player)) return;
        const amt = refund != null ? refund : 5;
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, amt);
        }
    };

    window.isMarksmanAmmoReloadPaused = function isMarksmanAmmoReloadPaused(player, now) {
        if (!player) return false;
        const t = now != null ? now : Date.now();
        if (typeof window.isBreathHoldActive === 'function' && window.isBreathHoldActive(player, t)) {
            return true;
        }
        if (!player._ammoReloadPausedUntil) return false;
        return t < player._ammoReloadPausedUntil;
    };

    window.onMarksmanMarkVictimKilled = function onMarksmanMarkVictimKilled(player, monster, gameInstance, monsters, now) {
        if (!monster || !monster._classSkillMark) return;
        const mark = monster._classSkillMark;
        const markId = mark.markId || '';
        if (markId === 'wind_mark' || markId === 'weakness_mark_de') return;
        if (markId !== 'weakness_mark' && markId !== 'hunters_mark') return;

        const skillDef = typeof window.getSkillDefinition === 'function'
            ? window.getSkillDefinition(markId) : null;
        const ec = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};
        const atkOwner = mark.owner || player;

        if (typeof window.resolveWindMarkExplosion === 'function') {
            window.resolveWindMarkExplosion(atkOwner, monster, gameInstance, monsters, {
                radius: ec.markExplosionRadius || 80,
                dmgMult: ec.markExplosionDamage || 1.5,
                knockback: ec.markExplosionKnockback || 0,
                skillDef,
                label: '标记引爆!'
            }, now);
        }
        monster._classSkillMark = null;
    };
})();
