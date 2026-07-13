/**
 * 刺客职业系 · 影之力 / 完美闪避 / 弹反 / 连击计数 / 背刺
 */
(function () {
    'use strict';

    const ASSASSIN_TREE = {
        assassin: true, shadowdancer: true, trickster: true, venomancer: true,
        nightblade: true, illusionist: true, plaguebringer: true
    };

    const COMBO_DECAY_MS = 3000;
    const COMBO_TIERS = [
        { stacks: 10, moveSpeed: 10 },
        { stacks: 30, attackSpeed: 15 },
        { stacks: 50, damage: 20 },
        { stacks: 100, liberation: true }
    ];
    const PERFECT_DODGE_WINDOW_MS = 50;
    const PERFECT_DODGE_SLOW_MS = 500;
    const PERFECT_DODGE_DMG_BONUS = 50;
    const PERFECT_DODGE_SF_GAIN = 30;
    const PARRY_WINDUP_MS = 200;
    const PARRY_WINDOW_MS = 150;
    const PARRY_SUCCESS_IFRAME_MS = 300;
    const PARRY_FAIL_STUN_MS = 400;
    const PARRY_SUCCESS_CD_MS = 8000;
    const PARRY_FAIL_CD_MS = 3000;
    const BACKSTAB_DMG_BONUS = 50;
    const BACKSTAB_CRIT_DMG_BONUS = 50;
    const DEFAULT_BACKSTAB_ANGLE = 135;

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function progressionId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassProgressionId === 'function'
            ? window.getActiveClassProgressionId(player.classData) : null;
    }

    function isAssassinTree(player) {
        const id = progressionId(player);
        return !!(id && ASSASSIN_TREE[id]);
    }

    function floatText(g, x, y, text, color, size) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#aa66ff', size ? 1100 : 900, size || 14);
        }
    }

    function monsters(g) {
        if (!g) return [];
        if (typeof g.getCurrentSceneTargets === 'function') return g.getCurrentSceneTargets() || [];
        return g.monsters || [];
    }

    window.isAssassinTreePlayer = isAssassinTree;

    window.initAssassinShadowState = function initAssassinShadowState(player) {
        if (!player || !isAssassinTree(player)) return;
        player._shadowCombo = 0;
        player._shadowComboLastHit = 0;
        player._shadowLiberationUntil = 0;
        player._perfectDodgeBuff = false;
        player._parryStanceUntil = 0;
        player._parryWindowUntil = 0;
        player._parryCooldownUntil = 0;
        player._backstabStanceUntil = 0;
        player._backstabStanceAngle = DEFAULT_BACKSTAB_ANGLE;
        player._midnightRaidUntil = 0;
        player._nightfallUntil = 0;
        player._assassinSecondary = player._assassinSecondary || {};
        initSecondaryResource(player);
    };

    function initSecondaryResource(player) {
        const id = progressionId(player);
        const sec = player._assassinSecondary || {};
        if (id === 'shadowdancer' || id === 'nightblade') {
            sec.type = 'combo_point';
            sec.current = sec.current != null ? Math.min(5, sec.current) : 0;
            sec.max = 5;
        } else if (id === 'trickster' || id === 'illusionist') {
            sec.type = 'illusion';
            sec.current = sec.current != null ? Math.min(100, sec.current) : 0;
            sec.max = 100;
        } else if (id === 'venomancer' || id === 'plaguebringer') {
            sec.type = 'catalyst';
            sec.current = sec.current != null ? Math.min(10, sec.current) : 0;
            sec.max = 10;
        } else {
            sec.type = null;
            sec.current = 0;
            sec.max = 0;
        }
        player._assassinSecondary = sec;
    }

    window.getAssassinSecondaryResource = function getAssassinSecondaryResource(player) {
        if (!player || !isAssassinTree(player)) return null;
        if (!player._assassinSecondary) initSecondaryResource(player);
        return player._assassinSecondary;
    };

    window.grantAssassinSecondary = function grantAssassinSecondary(player, amount) {
        const sec = window.getAssassinSecondaryResource(player);
        if (!sec || !sec.type || !amount) return;
        sec.current = Math.min(sec.max, (sec.current || 0) + amount);
        if (typeof window.updateAssassinShadowUI === 'function') window.updateAssassinShadowUI(player);
    };

    window.spendAssassinSecondary = function spendAssassinSecondary(player, amount) {
        const sec = window.getAssassinSecondaryResource(player);
        if (!sec || !sec.type) return true;
        if ((sec.current || 0) < amount) return false;
        sec.current -= amount;
        if (typeof window.updateAssassinShadowUI === 'function') window.updateAssassinShadowUI(player);
        return true;
    };

    window.grantComboPoints = function grantComboPoints(player, n) {
        if (!player || !n) return;
        const id = progressionId(player);
        if (id !== 'shadowdancer' && id !== 'nightblade') return;
        window.grantAssassinSecondary(player, n);
    };

    window.getComboPointCount = function getComboPointCount(player) {
        const sec = window.getAssassinSecondaryResource(player);
        if (!sec || sec.type !== 'combo_point') return 0;
        return sec.current || 0;
    };

    window.consumeAllComboPoints = function consumeAllComboPoints(player) {
        const sec = window.getAssassinSecondaryResource(player);
        if (!sec || sec.type !== 'combo_point') return 0;
        const spent = sec.current || 0;
        if (spent <= 0) return 0;
        sec.current = 0;
        if (typeof window.updateAssassinShadowUI === 'function') window.updateAssassinShadowUI(player);
        return spent;
    };

    /** 准备连击点增伤（单次施法只消耗一次） */
    window.prepareComboPointDamageMult = function prepareComboPointDamageMult(player, ec, g) {
        if (!player || !ec || !ec.consumeAllComboPoints) {
            player._comboPointDmgMult = 1;
            return 1;
        }
        const spent = window.consumeAllComboPoints(player);
        const per = ec.perComboPointMult != null ? ec.perComboPointMult : 0.30;
        const mult = spent > 0 ? 1 + spent * per : 1;
        player._comboPointDmgMult = mult;
        if (spent > 0 && g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 32,
                `连击×${spent} +${Math.round(spent * per * 100)}%`, '#cc66ff', 1100, 14);
        }
        return mult;
    };

    window.clearComboPointDamageMult = function clearComboPointDamageMult(player) {
        if (player) player._comboPointDmgMult = 1;
    };

    /** 消耗全部连击点并按 perComboPointMult 增伤（默认每点 +30%） */
    window.applyComboPointDamageMult = function applyComboPointDamageMult(player, ec, baseDmg, g) {
        if (!player || !ec || !ec.consumeAllComboPoints || !baseDmg) return baseDmg;
        if (player._comboPointDmgMult == null || player._comboPointDmgMult === 1) {
            window.prepareComboPointDamageMult(player, ec, g);
        }
        const mult = player._comboPointDmgMult != null ? player._comboPointDmgMult : 1;
        return Math.max(1, Math.floor(baseDmg * mult));
    };

    window.grantCatalyst = function grantCatalyst(player, n) {
        const id = progressionId(player);
        if (id !== 'venomancer' && id !== 'plaguebringer') return;
        window.grantAssassinSecondary(player, n);
    };

    window.getBackstabAngleDeg = function getBackstabAngleDeg(player) {
        if (!player) return DEFAULT_BACKSTAB_ANGLE;
        const now = Date.now();
        if (player._backstabStanceUntil && now < player._backstabStanceUntil) {
            return player._backstabStanceAngle || 180;
        }
        if (player._midnightRaidUntil && now < player._midnightRaidUntil) return 360;
        if (player._nightfallUntil && now < player._nightfallUntil) return 360;
        if (progressionId(player) === 'nightblade') return 180;
        return DEFAULT_BACKSTAB_ANGLE;
    };

    /** 获取战斗单位朝向（面向角度） */
    window.getCombatantFacingAngle = function getCombatantFacingAngle(entity) {
        if (!entity) return 0;
        if (typeof entity.facingAngle === 'number') return entity.facingAngle;
        if (typeof entity.angle === 'number') return entity.angle;
        return 0;
    };

    window.setCombatantFacingAngle = function setCombatantFacingAngle(entity, angleRad) {
        if (!entity || typeof angleRad !== 'number') return;
        entity.angle = angleRad;
        entity.facingAngle = angleRad;
    };

    /** 令战斗单位朝向目标点（平滑可选） */
    window.updateCombatantFacingToward = function updateCombatantFacingToward(entity, tx, ty, opts) {
        if (!entity || tx == null || ty == null) return;
        const dx = tx - entity.x;
        const dy = ty - entity.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) return;
        const targetAng = Math.atan2(dy, dx);
        if (opts && opts.smooth && typeof entity.angle === 'number') {
            let diff = targetAng - entity.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const blend = opts.blend != null ? opts.blend : 0.35;
            window.setCombatantFacingAngle(entity, entity.angle + diff * blend);
        } else {
            window.setCombatantFacingAngle(entity, targetAng);
        }
    };

    /** 受击时朝向攻击者（训练假人/静止敌人），刺客系攻击时不转向以保留背刺窗口 */
    window.onCombatantHitFaceAttacker = function onCombatantHitFaceAttacker(entity, attacker) {
        if (!entity || !attacker) return;
        if (isAssassinTree(attacker) && !attacker._allowFaceOnPierce) return;
        window.updateCombatantFacingToward(entity, attacker.x, attacker.y);
        if (typeof entity.facingAngle === 'number') {
            entity.angle = entity.facingAngle;
        }
    };

    /**
     * 玩家是否在目标身后（背刺有效区）
     * 以目标朝向为基准，身后 ±angleDeg/2 扇形
     */
    window.isPlayerBehindMonster = function isPlayerBehindMonster(player, monster, angleDegOverride) {
        if (!player || !monster) return false;
        const angleDeg = angleDegOverride != null ? angleDegOverride : window.getBackstabAngleDeg(player);
        if (angleDeg >= 360) return true;
        const facing = window.getCombatantFacingAngle(monster);
        const dx = player.x - monster.x;
        const dy = player.y - monster.y;
        if (Math.hypot(dx, dy) < 0.5) return false;
        const toPlayer = Math.atan2(dy, dx);
        let diff = toPlayer - (facing + Math.PI);
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const halfArc = (angleDeg / 2) * Math.PI / 180;
        return Math.abs(diff) <= halfArc;
    };

    /** 兼容旧名：背刺判定 = 玩家在怪物身后 */
    window.isMonsterBehindPlayer = function isMonsterBehindPlayer(player, monster, angleDegOverride) {
        return window.isPlayerBehindMonster(player, monster, angleDegOverride);
    };

    window.canAssassinBackstab = function canAssassinBackstab(player, monster) {
        return window.isPlayerBehindMonster(player, monster);
    };

    /** 绘制单位身后背刺有效区（训练假人） */
    window.drawCombatantBackstabZone = function drawCombatantBackstabZone(ctx, entity, player, opts) {
        if (!ctx || !entity) return;
        const facing = window.getCombatantFacingAngle(entity);
        const radius = (opts && opts.radius) || Math.max(36, (entity.size || 32) * 0.92);
        const angleDeg = (opts && opts.angleDeg != null)
            ? opts.angleDeg
            : (player && typeof window.getBackstabAngleDeg === 'function'
                ? window.getBackstabAngleDeg(player) : DEFAULT_BACKSTAB_ANGLE);
        const halfArc = angleDeg >= 360 ? Math.PI : (angleDeg / 2) * Math.PI / 180;
        const behind = player && window.isPlayerBehindMonster(player, entity, angleDeg);

        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.rotate(facing + Math.PI);
        ctx.globalAlpha = 0.38;
        ctx.fillStyle = behind ? 'rgba(80,220,120,0.42)' : 'rgba(140,70,200,0.32)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        if (angleDeg >= 360) {
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
        } else {
            ctx.arc(0, 0, radius, -halfArc, halfArc);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.82;
        ctx.strokeStyle = behind ? '#66ff99' : '#bb88ee';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.rotate(-Math.PI);
        ctx.strokeStyle = '#ff9966';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(radius * 0.9, 0);
        ctx.stroke();
        ctx.fillStyle = '#ffccaa';
        ctx.beginPath();
        ctx.arc(radius * 0.9, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    window.grantBackstabStance = function grantBackstabStance(player, angleDeg, durationMs) {
        if (!player) return;
        const now = Date.now();
        player._backstabStanceUntil = now + (durationMs || 2000);
        player._backstabStanceAngle = angleDeg || 180;
    };

    window.onAssassinHit = function onAssassinHit(player, monster, skillDef, g) {
        if (!player || !isAssassinTree(player)) return;
        const now = Date.now();
        player._shadowComboLastHit = now;
        player._shadowCombo = Math.min(150, (player._shadowCombo || 0) + 1);
        checkComboTiers(player, g, now);
        if (typeof window.onAssassinHitSecondary === 'function') {
            window.onAssassinHitSecondary(player, monster, skillDef, g);
        }
        if (typeof window.updateAssassinShadowUI === 'function') window.updateAssassinShadowUI(player);
    };

    function checkComboTiers(player, g, now) {
        const combo = player._shadowCombo || 0;
        let moveSpeed = 0;
        let attackSpeed = 0;
        let damage = 0;
        COMBO_TIERS.forEach(t => {
            if (combo >= t.stacks) {
                if (t.moveSpeed) moveSpeed = t.moveSpeed;
                if (t.attackSpeed) attackSpeed = t.attackSpeed;
                if (t.damage) damage = t.damage;
                if (t.liberation && !(player._shadowLiberationUntil && now < player._shadowLiberationUntil)) {
                    player._shadowLiberationUntil = now + 6000;
                    player._shadowCombo = 0;
                    floatText(g, player.x, player.y - 48, '影之解放!', '#ff44ff', 18);
                    if (g && g.screenShake) {
                        g.screenShake.amplitude = Math.max(g.screenShake.amplitude || 0, 3);
                        g.screenShake.timer = 250;
                    }
                }
            }
        });
        player._shadowComboMoveSpeed = moveSpeed;
        player._shadowComboAttackSpeed = attackSpeed;
        player._shadowComboDamage = damage;
    }

    window.getAssassinComboDamageMult = function getAssassinComboDamageMult(player) {
        if (!player || !isAssassinTree(player)) return 1;
        const now = Date.now();
        if (player._shadowComboLastHit && now - player._shadowComboLastHit > COMBO_DECAY_MS) {
            player._shadowCombo = 0;
            player._shadowComboMoveSpeed = 0;
            player._shadowComboAttackSpeed = 0;
            player._shadowComboDamage = 0;
        }
        let mult = 1 + (player._shadowComboDamage || 0) / 100;
        if (player._shadowLiberationUntil && now < player._shadowLiberationUntil) mult *= 1.2;
        return mult;
    };

    window.getAssassinComboAttackSpeedBonus = function getAssassinComboAttackSpeedBonus(player) {
        if (!player || !isAssassinTree(player)) return 0;
        return player._shadowComboAttackSpeed || 0;
    };

    window.getAssassinComboMoveSpeedBonus = function getAssassinComboMoveSpeedBonus(player) {
        if (!player || !isAssassinTree(player)) return 0;
        return player._shadowComboMoveSpeed || 0;
    };

    window.getAssassinLiberationCdHaste = function getAssassinLiberationCdHaste(player) {
        if (!player) return 0;
        const now = Date.now();
        if (player._shadowLiberationUntil && now < player._shadowLiberationUntil) return 50;
        return 0;
    };

    window.getAssassinSkillDamageMult = function getAssassinSkillDamageMult(player, skillDef, monster) {
        if (!player || !isAssassinTree(player)) return 1;
        let mult = window.getAssassinComboDamageMult(player);
        const now = Date.now();
        if (player._perfectDodgeBuff) {
            mult *= 1 + PERFECT_DODGE_DMG_BONUS / 100;
            player._perfectDodgeBuff = false;
        }
        if (player._midnightRaidUntil && now < player._midnightRaidUntil) {
            mult *= 1.4;
        }
        if (player._nightfallUntil && now < player._nightfallUntil) {
            mult *= 1.3;
        }
        if (monster && window.isMonsterBehindPlayer(player, monster)) {
            mult *= 1 + BACKSTAB_DMG_BONUS / 100;
            if (typeof window.grantSkillResource === 'function') {
                window.grantSkillResource(player, 12);
            }
        }
        if (typeof window.getAssassinBranchDamageMult === 'function') {
            mult *= window.getAssassinBranchDamageMult(player, skillDef, monster);
        }
        return mult;
    };

    window.getAssassinCritDmgBonus = function getAssassinCritDmgBonus(player, monster) {
        if (!player || !monster || !isAssassinTree(player)) return 0;
        if (window.isMonsterBehindPlayer(player, monster)) return BACKSTAB_CRIT_DMG_BONUS;
        return 0;
    };

    window.onAssassinDashStart = function onAssassinDashStart(player, g) {
        if (!player || !isAssassinTree(player)) return;
        const dashDur = (window.CONFIG && window.CONFIG.PLAYER_DASH_DURATION) || 200;
        player._assassinDashStart = Date.now();
        player._assassinDashEnd = player._assassinDashStart + dashDur;
        player._assassinPerfectDodgeClaimed = false;
        if (player.dashCooldown > 0) {
            player.dashCooldown = Math.max(0, player.dashCooldown - 300);
        }
    };

    window.onAssassinPerfectDodgeCheck = function onAssassinPerfectDodgeCheck(player, g) {
        if (!player || !isAssassinTree(player) || player._assassinPerfectDodgeClaimed) return;
        const now = Date.now();
        if (!player._assassinDashEnd || now < player._assassinDashEnd - PERFECT_DODGE_WINDOW_MS) return;
        if (now > player._assassinDashEnd + 50) return;
        player._assassinPerfectDodgeClaimed = true;
        player._perfectDodgeBuff = true;
        player._perfectDodgeSlowUntil = now + PERFECT_DODGE_SLOW_MS;
        if (typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, PERFECT_DODGE_SF_GAIN);
        }
        floatText(g, player.x, player.y - 36, '完美闪避!', '#cc44ff', 16);
        if (typeof window.playAssassinSkillVfx === 'function') {
            window.playAssassinSkillVfx(player, { id: 'perfect_dodge', slotType: 'passive' }, g, { perfectDodge: true });
        }
        if (g && g.screenShake) {
            g.screenShake.amplitude = Math.max(g.screenShake.amplitude || 0, 2);
            g.screenShake.timer = 180;
        }
        if (typeof window.onAssassinShadowRhythmPerfectDodge === 'function') {
            window.onAssassinShadowRhythmPerfectDodge(player, g);
        }
    };

    window.isAssassinTimeSlowActive = function isAssassinTimeSlowActive(player) {
        if (!player) return false;
        return !!(player._perfectDodgeSlowUntil && Date.now() < player._perfectDodgeSlowUntil);
    };

    window.tryAssassinParry = function tryAssassinParry(player, g) {
        if (!player || !isAssassinTree(player)) return false;
        const now = Date.now();
        if (player._parryCooldownUntil && now < player._parryCooldownUntil) {
            floatText(g, player.x, player.y - 20, '弹反冷却中', '#ff6666');
            return true;
        }
        if (player._parryStanceUntil && now < player._parryStanceUntil) return true;
        player._parryStanceUntil = now + PARRY_WINDUP_MS + PARRY_WINDOW_MS;
        player._parryWindowStart = now + PARRY_WINDUP_MS;
        player._parryWindowUntil = player._parryWindowStart + PARRY_WINDOW_MS;
        player.isCastingSkill = true;
        floatText(g, player.x, player.y - 24, '弹反架势', '#aa88ff');
        if (typeof window.playAssassinSkillVfx === 'function') {
            window.playAssassinSkillVfx(player, { id: 'parry_stance', slotType: 'passive' }, g, {});
        }
        setTimeout(() => {
            if (!player._parryWindowUntil) return;
            if (Date.now() >= player._parryWindowUntil && !player._parrySuccess) {
                resolveParryFail(player, g);
            }
        }, PARRY_WINDUP_MS + PARRY_WINDOW_MS + 20);
        setTimeout(() => { player.isCastingSkill = false; }, PARRY_WINDUP_MS);
        return true;
    };

    function resolveParryFail(player, g) {
        const now = Date.now();
        if (player._parrySuccess) return;
        player._parryStanceUntil = 0;
        player._parryWindowUntil = 0;
        player._parryStunUntil = now + PARRY_FAIL_STUN_MS;
        player._parryCooldownUntil = now + PARRY_FAIL_CD_MS;
        floatText(g, player.x, player.y - 20, '弹反失败', '#ff4444');
    }

    window.onAssassinParryIncoming = function onAssassinParryIncoming(player, attacker, damage, g) {
        if (!player || !isAssassinTree(player)) return damage;
        const now = Date.now();
        if (!player._parryWindowUntil || now < player._parryWindowStart || now > player._parryWindowUntil) {
            return damage;
        }
        player._parrySuccess = true;
        player._parryStanceUntil = 0;
        player._parryWindowUntil = 0;
        player._parryCooldownUntil = now + PARRY_SUCCESS_CD_MS;
        player.invincibleUntil = now + PARRY_SUCCESS_IFRAME_MS;
        if (player.classResource) player.classResource.current = player.classResource.max;
        player.dashCooldown = 0;
        if (attacker) {
            attacker._stunnedUntil = now + (attacker.isBoss ? 500 : 1000);
            const dx = attacker.x - player.x;
            const dy = attacker.y - player.y;
            const dist = Math.hypot(dx, dy) || 1;
            const behindX = attacker.x + (dx / dist) * 35;
            const behindY = attacker.y + (dy / dist) * 35;
            player.x = behindX;
            player.y = behindY;
            player.angle = Math.atan2(attacker.y - player.y, attacker.x - player.x);
            const ec = { damageMultiplier: 2.0, guaranteedCrit: true };
            const skillDef = { id: 'parry_counter', name: '影之反击' };
            const dmg = Math.max(1, Math.floor((player.baseAttack || 10) * 2));
            if (typeof window.applyAssassinParryCounter === 'function') {
                window.applyAssassinParryCounter(player, attacker, g);
            } else if (attacker.takeDamage) {
                attacker.takeDamage(dmg);
            }
        }
        floatText(g, player.x, player.y - 40, '弹反成功!', '#ffdd44', 18);
        if (typeof window.playAssassinSkillVfx === 'function') {
            window.playAssassinSkillVfx(player, { id: 'parry_counter', slotType: 'passive' }, g, { parrySuccess: true });
        }
        setTimeout(() => { player._parrySuccess = false; }, 100);
        return 0;
    };

    window.isAssassinParryStance = function isAssassinParryStance(player) {
        if (!player) return false;
        const now = Date.now();
        return !!(player._parryStanceUntil && now < player._parryStanceUntil)
            || !!(player._parryWindowUntil && now <= player._parryWindowUntil);
    };

    window.tickAssassinShadowStates = function tickAssassinShadowStates(player, g, monsters, now) {
        if (!player || !isAssassinTree(player)) return;
        const t = now != null ? now : Date.now();
        if (player._shadowComboLastHit && t - player._shadowComboLastHit > COMBO_DECAY_MS) {
            if (player._shadowCombo > 0) {
                player._shadowCombo = Math.max(0, player._shadowCombo - 1);
                player._shadowComboLastHit = t;
                checkComboTiers(player, g, t);
            }
        }
        if (player._parryStunUntil && t >= player._parryStunUntil) player._parryStunUntil = 0;
        if (typeof window.tickAssassinBranchStates === 'function') {
            window.tickAssassinBranchStates(player, g, monsters, t);
        }
    };

    window.clearAssassinCombatState = function clearAssassinCombatState(player) {
        if (!player) return;
        delete player._shadowCombo;
        delete player._shadowLiberationUntil;
        delete player._perfectDodgeBuff;
        delete player._parryStanceUntil;
        delete player._midnightRaidUntil;
        delete player._nightfallUntil;
        delete player._nightfallDurationMs;
        if (typeof window.clearAssassinBranchState === 'function') {
            window.clearAssassinBranchState(player);
        }
    };

    window.getAssassinDashCooldownMs = function getAssassinDashCooldownMs(player) {
        if (!isAssassinTree(player)) return 1000;
        const now = Date.now();
        if (player._shadowStepBuffUntil && now < player._shadowStepBuffUntil) return 600;
        return 1200;
    };

    window.updateAssassinShadowUI = function updateAssassinShadowUI(player) {
        if (!player || !player.gameInstance) return;
        const g = player.gameInstance;
        if (g.classUI && typeof g.classUI.updateResourceBar === 'function') {
            g.classUI.updateResourceBar();
        }
    };
})();
