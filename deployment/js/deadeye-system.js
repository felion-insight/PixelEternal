/**
 * 死眼 · 维持型精准 + 屏息 + 死神狙击（v3.0）
 */
(function () {
    'use strict';

    const DEADEYE_TREE = { deadeye: true };
    const BREAK_REWARD_RANGE = 800;
    const ALLY_CRIT_STACK_CD_MS = 3000;
    const SEALED_SLOTS = ['core1', 'core2', 'team'];

    function isDeadeye(player) {
        if (!player || !player.classData) return false;
        const id = typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
        return !!(id && DEADEYE_TREE[id]);
    }

    window.isDeadeyePlayer = isDeadeye;

    window.isBreathHoldActive = function isBreathHoldActive(player, now) {
        if (!player || !player._breathHoldUntil) return false;
        return (now != null ? now : Date.now()) < player._breathHoldUntil;
    };

    window.isDeadeyeSnipeActive = function isDeadeyeSnipeActive(player, now) {
        if (!player || !player._deadeyeSnipeUntil) return false;
        return (now != null ? now : Date.now()) < player._deadeyeSnipeUntil;
    };

    window.isDeadeyeSkillSealed = function isDeadeyeSkillSealed(player, skillDef, now) {
        if (!player || !skillDef || !window.isDeadeyeSnipeActive(player, now)) return false;
        if (skillDef.id === 'deadeye_snipe') return false;
        const slot = skillDef.slotType;
        return SEALED_SLOTS.includes(slot);
    };

    function scalePrecisionGain(player, amount) {
        if (!amount) return 0;
        if (window.isBreathHoldActive(player)) return amount * 2;
        return amount;
    }

    window.scaleDeadeyePrecisionGain = scalePrecisionGain;

    function hasActiveDeadeyeMark(player, monsters) {
        const t = Date.now();
        return (monsters || []).some(m => {
            if (!m || !m._classSkillMark) return false;
            const mark = m._classSkillMark;
            if (mark.expireTime <= t) return false;
            if ((mark.markId || '') !== 'weakness_mark_de') return false;
            return !mark.owner || mark.owner === player;
        });
    }

    window.applyDeadeyeSkillOverrides = function applyDeadeyeSkillOverrides(player, skillDef) {
        if (!isDeadeye(player) || !skillDef) return skillDef;
        if (skillDef.id === 'weakness_mark_de' && skillDef.entityConfig && skillDef.entityConfig.emptyFieldHalfCD) {
            const g = player.gameInstance;
            const monsters = g && typeof g.getCurrentSceneTargets === 'function'
                ? g.getCurrentSceneTargets() : null;
            if (!hasActiveDeadeyeMark(player, monsters)) {
                return Object.assign({}, skillDef, { cooldownMs: Math.floor((skillDef.cooldownMs || 8000) / 2) });
            }
        }
        return skillDef;
    };

    window.getDeadeyeMarkDamageMultiplier = function getDeadeyeMarkDamageMultiplier(monster, attacker, skillDef) {
        if (!monster || !attacker || !monster._classSkillMark) return 1;
        const mark = monster._classSkillMark;
        if (mark.expireTime <= Date.now()) return 1;
        if ((mark.markId || '') !== 'weakness_mark_de') return 1;
        if (mark.owner && mark.owner !== attacker) return 1;
        const ownerBonus = mark.ownerDamageBonus || 0;
        const setWeak = typeof window.getSetModifier === 'function'
            ? window.getSetModifier(attacker, 'weaknessDamage', 0) : 0;
        if ((ownerBonus > 0 || setWeak > 0) && isDeadeye(attacker)) {
            return 1 + ownerBonus / 100 + setWeak;
        }
        return 1;
    };

    window.getDeadeyeMarkCritDmgBonus = function getDeadeyeMarkCritDmgBonus(monster, attacker) {
        if (!monster || !attacker || !monster._classSkillMark) return 0;
        const mark = monster._classSkillMark;
        if (mark.expireTime <= Date.now()) return 0;
        if ((mark.markId || '') !== 'weakness_mark_de') return 0;
        if (mark.owner && mark.owner !== attacker) return 0;
        if (!isDeadeye(attacker)) return 0;
        return mark.ownerCritDmgBonus || 0;
    };

    window.getBreathHoldSelfCritRate = function getBreathHoldSelfCritRate(player) {
        if (!window.isBreathHoldActive(player)) return 0;
        return player._breathHoldCritRate || 40;
    };

    window.getBreathHoldSelfCritDmg = function getBreathHoldSelfCritDmg(player) {
        if (!window.isBreathHoldActive(player)) return 0;
        return player._breathHoldCritDmg || 25;
    };

    window.getBreathHoldTeamCritDmgBonus = function getBreathHoldTeamCritDmgBonus(attacker, gameInstance) {
        if (!attacker || !gameInstance || !gameInstance.player) return 0;
        const owner = gameInstance.player;
        if (!window.isBreathHoldActive(owner)) return 0;
        if (attacker === owner) return 0;
        const radius = owner._breathHoldAuraRadius || 300;
        const dist = Math.hypot(attacker.x - owner.x, attacker.y - owner.y);
        if (dist > radius) return 0;
        return owner._breathHoldTeamCritDmg || 15;
    };

    window.applyBreathHold = function applyBreathHold(player, skillDef, g, now) {
        if (!isDeadeye(player) || !skillDef) return false;
        // 屏息的冷却从状态结束后开始计算；重复按键不能在状态期间
        // 不断刷新持续时间，否则自动轮转会永久占用输出窗口。
        if (window.isBreathHoldActive(player, now)) return false;
        const c = skillDef.entityConfig || {};
        const t = now != null ? now : Date.now();
        const dur = c.durationMs || 8000;
        player._breathHoldUntil = t + dur;
        player._breathHoldCritRate = c.selfCritRate || 40;
        player._breathHoldCritDmg = c.selfCritDmg || 25;
        player._breathHoldAuraRadius = c.teamAuraRadius || 300;
        player._breathHoldTeamCritDmg = c.teamCritDmgBonus || 15;
        player._breathHoldRefreshUsed = false;
        player._breathHoldCdPending = true;
        player.buffs = player.buffs || [];
        const buffId = 'breath_hold_active';
        player.buffs = player.buffs.filter(b => b.id !== buffId);
        player.buffs.push({
            id: buffId,
            name: '屏息',
            expireTime: player._breathHoldUntil,
            effects: {},
            hudVisible: true
        });
        if (typeof player.updateStats === 'function') player.updateStats();
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 36, '屏息!', '#ffcc88', 1000, 16);
        }
        return true;
    };

    window.applyDeadeyeSnipe = function applyDeadeyeSnipe(player, skillDef, g, monsters, now) {
        if (!isDeadeye(player) || !skillDef) return false;
        if (window.isDeadeyeSnipeActive(player, now)) return false;
        const c = skillDef.entityConfig || {};
        const t = now != null ? now : Date.now();
        const dur = c.durationMs || 8000;
        player._deadeyeSnipeUntil = t + dur;
        player._deadeyeSnipeNextShot = t + 400;
        player._deadeyeSnipeShotsLeft = c.shotCount || 5;
        player._deadeyeSnipeCfg = c;
        player._deadeyeSnipeSkillDef = skillDef;
        player._deadeyeSnipeRooted = true;
        player.vx = 0;
        player.vy = 0;
        const dr = c.damageReduction || 30;
        const mobList = monsters || (g && typeof g.getCurrentSceneTargets === 'function'
            ? g.getCurrentSceneTargets()
            : (g && g.monsters));
        player.buffs = player.buffs || [];
        const buffId = 'deadeye_snipe_stance';
        player.buffs = player.buffs.filter(b => b.id !== buffId);
        player.buffs.push({
            id: buffId,
            name: '死神狙击',
            expireTime: player._deadeyeSnipeUntil,
            effects: { damageReduction: dr },
            hudVisible: true
        });
        if (typeof player.updateStats === 'function') player.updateStats();
        player._deadeyeSnipeTarget = resolveSnipeTarget(player, mobList);
        player._deadeyeSnipeShotIndex = 0;
        if (typeof window.playDeadeyeSnipeEnterVfx === 'function') {
            window.playDeadeyeSnipeEnterVfx(player, g, player._deadeyeSnipeTarget, dur);
        }
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 40, '架枪!', '#ff2244', 1100, 18);
        }
        return true;
    };

    function endBreathHold(player, g, now) {
        if (!player || !player._breathHoldCdPending) return;
        player._breathHoldCdPending = false;
        const skillDef = typeof window.getSkillDefinition === 'function'
            ? window.getSkillDefinition('breath_hold') : null;
        if (skillDef && typeof window.setSkillCooldown === 'function') {
            window.setSkillCooldown(player, skillDef);
        }
        delete player._breathHoldUntil;
        delete player._breathHoldCritRate;
        delete player._breathHoldCritDmg;
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 28, '屏息结束', '#aaaaaa', 800, 13);
        }
    }

    function endDeadeyeSnipe(player, g) {
        if (!player) return;
        if (typeof window.clearDeadeyeSnipeVfx === 'function') {
            window.clearDeadeyeSnipeVfx(player, g);
        }
        delete player._deadeyeSnipeUntil;
        delete player._deadeyeSnipeNextShot;
        delete player._deadeyeSnipeShotsLeft;
        delete player._deadeyeSnipeCfg;
        delete player._deadeyeSnipeSkillDef;
        delete player._deadeyeSnipeRooted;
        delete player._deadeyeSnipeTarget;
        delete player._deadeyeSnipeChargeAt;
        delete player._deadeyeSnipeShotIndex;
        player.buffs = (player.buffs || []).filter(b => b.id !== 'deadeye_snipe_stance');
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    function resolveSnipeTarget(player, monsters) {
        let target = typeof window.findMarkedTargetForOwner === 'function'
            ? window.findMarkedTargetForOwner(player, monsters) : null;
        if (!target) {
            let td = Infinity;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const d = Math.hypot(m.x - player.x, m.y - player.y);
                if (d < td) { td = d; target = m; }
            });
        }
        return target;
    }

    function fireDeadeyeSnipeShot(player, g, monsters, now) {
        const c = player._deadeyeSnipeCfg || {};
        const skillDef = player._deadeyeSnipeSkillDef
            || (typeof window.getSkillDefinition === 'function' ? window.getSkillDefinition('deadeye_snipe') : null);
        const ammoCost = c.shotAmmoCost || 4;
        const st = window.getPlayerResourceState && window.getPlayerResourceState(player);
        if (!st || st.current < ammoCost) {
            if (g && typeof g.addFloatingText === 'function') {
                g.addFloatingText(player.x, player.y - 24, '弹药不足', '#ff6666', 800, 13);
            }
            return false;
        }
        if (typeof window.spendSkillResource === 'function') {
            window.spendSkillResource(player, { resourceCost: ammoCost });
        } else if (player.classResource) {
            player.classResource.current = Math.max(0, player.classResource.current - ammoCost);
        }

        let target = typeof window.findMarkedTargetForOwner === 'function'
            ? window.findMarkedTargetForOwner(player, monsters) : null;
        if (!target) {
            let td = Infinity;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const d = Math.hypot(m.x - player.x, m.y - player.y);
                if (d < td) { td = d; target = m; }
            });
        }
        if (!target) return false;

        const stacks = typeof window.getPrecisionStacks === 'function'
            ? window.getPrecisionStacks(player) : 0;
        const perStack = c.precisionCritDmgPerStack || 15;
        const precisionBonus = stacks * perStack;

        let markedMult = 1;
        if (target._classSkillMark && target._classSkillMark.expireTime > now
            && (target._classSkillMark.markId || '') === 'weakness_mark_de') {
            markedMult = c.markedTargetMult || 1.8;
        }

        const ec = {
            speed: 1800,
            maxRange: 900,
            trajectory: 'homing',
            pierceCount: 0,
            collisionRadius: 10,
            damageMultiplier: (c.shotDamageMult || 8) * markedMult,
            guaranteedCrit: true,
            guaranteedHit: true,
            ignoreDefensePercent: c.ignoreDefensePercent || 40,
            critDmgBonus: precisionBonus + (window.getBreathHoldSelfCritDmg(player) || 0),
            color: '#ff0044',
            visualVariant: 'death_reaper_bolt'
        };

        if (typeof window.castSkillEntity === 'function') {
            const shotDef = Object.assign({}, skillDef || { id: 'deadeye_snipe', name: '死神之弹' }, {
                entityType: 'projectile',
                entityConfig: ec,
                breakDamageMultiplier: skillDef ? skillDef.breakDamageMultiplier : 5
            });
            window.castSkillEntity(player, shotDef, g, monsters, now, { lockTarget: target });
        }
        const shotIndex = player._deadeyeSnipeShotIndex || 0;
        if (typeof window.playDeadeyeSnipeFireVfx === 'function') {
            window.playDeadeyeSnipeFireVfx(player, g, target, shotIndex);
        }
        player._deadeyeSnipeShotIndex = shotIndex + 1;
        player._deadeyeSnipeShotsLeft = Math.max(0, (player._deadeyeSnipeShotsLeft || 0) - 1);
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 20, '死神之弹!', '#ff4466', 600, 14);
        }
        return true;
    }

    window.tickDeadeyeStates = function tickDeadeyeStates(player, monsters, gameInstance, now) {
        if (!player || !isDeadeye(player)) return;
        const t = now != null ? now : Date.now();
        const g = gameInstance;

        if (player._breathHoldUntil && t >= player._breathHoldUntil) {
            endBreathHold(player, g, t);
        }

        if (player._deadeyeSnipeUntil) {
            if (t >= player._deadeyeSnipeUntil
                || (player._deadeyeSnipeShotsLeft != null && player._deadeyeSnipeShotsLeft <= 0)) {
                endDeadeyeSnipe(player, g);
            } else {
                player._deadeyeSnipeTarget = resolveSnipeTarget(player, monsters)
                    || player._deadeyeSnipeTarget;
                if (typeof window.tickDeadeyeSnipeVfx === 'function') {
                    window.tickDeadeyeSnipeVfx(player, g, player._deadeyeSnipeTarget, t);
                }
                const chargeLead = 350;
                if (player._deadeyeSnipeNextShot != null
                    && t >= player._deadeyeSnipeNextShot - chargeLead
                    && player._deadeyeSnipeChargeAt !== player._deadeyeSnipeNextShot) {
                    player._deadeyeSnipeChargeAt = player._deadeyeSnipeNextShot;
                    if (typeof window.playDeadeyeSnipeChargeVfx === 'function') {
                        window.playDeadeyeSnipeChargeVfx(player, g, player._deadeyeSnipeTarget);
                    }
                }
                if (player._deadeyeSnipeNextShot != null && t >= player._deadeyeSnipeNextShot) {
                    const fired = fireDeadeyeSnipeShot(player, g, monsters, t);
                    const interval = (player._deadeyeSnipeCfg && player._deadeyeSnipeCfg.shotIntervalMs) || 1600;
                    player._deadeyeSnipeNextShot = t + interval;
                    if (!fired && player._deadeyeSnipeShotsLeft > 0) {
                        /* 弹药不足提前结束 */
                        endDeadeyeSnipe(player, g);
                    }
                }
            }
        }
    };

    window.onDeadeyeWeaknessMarkHit = function onDeadeyeWeaknessMarkHit(player, gameInstance) {
        if (!isDeadeye(player)) return;
        const gain = scalePrecisionGain(player, 2);
        if (typeof window.addPrecisionStacks === 'function') {
            window.addPrecisionStacks(player, gain, gameInstance);
        }
    };

    window.onDeadeyeAllyCritMarkedTarget = function onDeadeyeAllyCritMarkedTarget(attacker, monster, now) {
        if (!monster || !monster._classSkillMark) return;
        const mark = monster._classSkillMark;
        if ((mark.markId || '') !== 'weakness_mark_de') return;
        const owner = mark.owner;
        if (!owner || !isDeadeye(owner)) return;
        if (attacker === owner) return;
        const t = now != null ? now : Date.now();
        owner._deadeyeAllyCritAt = owner._deadeyeAllyCritAt || 0;
        if (t - owner._deadeyeAllyCritAt < ALLY_CRIT_STACK_CD_MS) return;
        owner._deadeyeAllyCritAt = t;
        const gi = owner.gameInstance || (attacker && attacker.gameInstance);
        if (typeof window.addPrecisionStacks === 'function') {
            window.addPrecisionStacks(owner, 1, gi);
        }
    };

    window.onMonsterBreakGaugeBroken = function onMonsterBreakGaugeBroken(monster, breaker, now) {
        if (!monster || !breaker) return;
        const t = now != null ? now : Date.now();
        const gameInstance = breaker.gameInstance || monster.gameInstance;
        const candidates = [];
        if (isDeadeye(breaker)) candidates.push(breaker);
        if (gameInstance && gameInstance.player && gameInstance.player !== breaker
            && isDeadeye(gameInstance.player)) {
            candidates.push(gameInstance.player);
        }
        candidates.forEach(player => {
            const dist = Math.hypot(monster.x - player.x, monster.y - player.y);
            if (dist > BREAK_REWARD_RANGE) return;
            if (typeof window.addPrecisionStacks === 'function') {
                window.addPrecisionStacks(player, 2, gameInstance);
            }
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(player.x, player.y - 32, '破防·精准+2', '#cc66ff', 900, 13);
            }
        });
    };

    function spreadDeadeyeMark(owner, fromMonster, monsters, markCfg, skillDef, now) {
        if (!owner || !fromMonster || !markCfg) return;
        const radius = markCfg.markSpreadRadius || 120;
        const duration = markCfg.markDurationMs || 10000;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0 || m === fromMonster) return;
            if (Math.hypot(m.x - fromMonster.x, m.y - fromMonster.y) > radius + (m.size || 20) * 0.5) return;
            if (typeof window.applyClassSkillMarkOnMonster === 'function') {
                window.applyClassSkillMarkOnMonster(m, {
                    durationMs: duration,
                    ownerDamageBonus: markCfg.markOwnerDamageBonus || 30,
                    ownerCritDmgBonus: markCfg.markOwnerCritDmgBonus || 15,
                    owner: owner,
                    markId: 'weakness_mark_de'
                }, skillDef, now);
            }
        });
    }

    window.onDeadeyeMarkVictimKilled = function onDeadeyeMarkVictimKilled(player, monster, gameInstance, monsters, now) {
        if (!monster || !monster._classSkillMark) return;
        const mark = monster._classSkillMark;
        if ((mark.markId || '') !== 'weakness_mark_de') return;
        const atkOwner = mark.owner || player;
        const skillDef = typeof window.getSkillDefinition === 'function'
            ? window.getSkillDefinition('weakness_mark_de') : null;
        const ec = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};

        if (typeof window.resolveWindMarkExplosion === 'function') {
            window.resolveWindMarkExplosion(atkOwner, monster, gameInstance, monsters, {
                radius: ec.markExplosionRadius || 90,
                dmgMult: ec.markExplosionDamage || 1.8,
                knockback: 0,
                skillDef,
                label: '标记引爆!'
            }, now);
        }

        if (ec.markSpreadOnKill) {
            spreadDeadeyeMark(atkOwner, monster, monsters, ec, skillDef, now);
        }

        if (window.isBreathHoldActive(atkOwner, now) && !atkOwner._breathHoldRefreshUsed) {
            atkOwner._breathHoldUntil = now + 8000;
            atkOwner._breathHoldRefreshUsed = true;
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(atkOwner.x, atkOwner.y - 44, '屏息刷新!', '#ffdd88', 900, 14);
            }
        }

        monster._classSkillMark = null;
    };

    window.resetDeadeyeTeamCooldowns = function resetDeadeyeTeamCooldowns(player, gameInstance) {
        if (!player) return;
        player.skillCooldowns = player.skillCooldowns || {};
        Object.keys(player.skillCooldowns).forEach(k => {
            player.skillCooldowns[k] = 0;
        });
        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(player.x, player.y - 44, '全队冷却重置!', '#ffdd44', 1000, 15);
        }
    };

    window.onDeadeyeBossKill = function onDeadeyeBossKill(player, monster, skillDef, gameInstance) {
        if (!player || !monster || !monster.isBoss) return;
        const ec = skillDef && skillDef.entityConfig ? skillDef.entityConfig : {};
        if (!ec.resetTeamCDOnBossKill) return;
        window.resetDeadeyeTeamCooldowns(player, gameInstance);
    };

    window.clearDeadeyeCombatState = function clearDeadeyeCombatState(player) {
        if (!player) return;
        delete player._breathHoldUntil;
        delete player._breathHoldCdPending;
        delete player._breathHoldRefreshUsed;
        delete player._deadeyeSnipeUntil;
        delete player._deadeyeSnipeRooted;
        delete player._deadeyeAllyCritAt;
        endDeadeyeSnipe(player, null);
    };
})();
