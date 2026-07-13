/**
 * Pixel Eternal - 技能实体系统
 * projectile | summon | field | instant | blink | charge
 */
(function () {
    'use strict';

    function ensureState(g) {
        if (!g._skillEntities) {
            g._skillEntities = {
                projectiles: [], summons: [], fields: [], charges: [], pendingInstants: []
            };
        }
        return g._skillEntities;
    }

    function entityCfg(skillDef) {
        if (skillDef && skillDef.entityType && skillDef.entityConfig) {
            return { entityType: skillDef.entityType, entityConfig: skillDef.entityConfig };
        }
        const map = window.SKILL_ENTITY_CONFIG && window.SKILL_ENTITY_CONFIG.skills;
        if (map && skillDef && map[skillDef.id]) return map[skillDef.id];
        return null;
    }

    window.getSkillEntityConfig = function getSkillEntityConfig(skillDef) {
        return entityCfg(skillDef);
    };

    window.inferSkillEntityType = function inferSkillEntityType(skillDef) {
        const ec = entityCfg(skillDef);
        if (ec) return ec.entityType;
        const se = skillDef.skillEffect;
        if (!se) return null;
        if (se.type === 'fireball') return 'projectile';
        if (se.type === 'charge') return 'charge';
        if (se.type === 'blink_behind') return 'blink';
        if (se.type === 'freeze') return 'field';
        if (se.type === 'stun' && skillDef.name && skillDef.name.includes('盾')) return 'instant';
        return null;
    };

    function baseAtk(player) {
        return typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(player) : (player.baseAttack || 10);
    }

    function calcDmg(player, skillDef, ec, multOverride) {
        const enh = window.getSkillEnhanceLevel ? window.getSkillEnhanceLevel(player, skillDef.id) : 0;
        const enhMult = 1 + enh * 0.1;
        let mult = multOverride != null ? multOverride
            : (ec.damageMultiplier != null ? ec.damageMultiplier : (skillDef.damageMultiplier || 1));
        return Math.max(1, Math.floor(baseAtk(player) * mult * enhMult));
    }

    function isClassBasicSkill(skillDef) {
        return !!(skillDef && (skillDef.slotType === 'basic' || skillDef.type === 'basic'));
    }

    function applyDmg(player, monster, dmg, skillDef, g, statusList) {
        if (!monster || monster.hp <= 0) return;
        if (typeof window.getClassSkillMarkBonus === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getClassSkillMarkBonus(monster).mult));
        }
        if (typeof window.getCombatStatusDamageMultiplier === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getCombatStatusDamageMultiplier(monster)));
        }
        if (typeof window.getStrikerDamageBonus === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getStrikerDamageBonus(player, monster)));
        }
        if (typeof window.getAssassinSkillDamageMult === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getAssassinSkillDamageMult(player, skillDef, monster)));
        }
        if (typeof window.getBuildDamageMultiplier === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getBuildDamageMultiplier(player, monster, skillDef)));
        }
        const defRed = typeof window.getCombatStatusDefenseReduction === 'function'
            ? window.getCombatStatusDefenseReduction(monster) : 0;
        if (defRed > 0) dmg = Math.max(1, Math.floor(dmg * (1 + defRed / 100)));
        if (skillDef && (typeof TrainingDummy !== 'undefined' && (monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy))) {
            monster._pendingDamageSource = 'skill:' + (skillDef.id || skillDef._sourceSkillId || 'unknown');
        }
        monster.takeDamage(dmg);
        if (typeof window.onCombatantHitFaceAttacker === 'function') {
            window.onCombatantHitFaceAttacker(monster, player);
        }
        if (typeof window.onBuildSkillHit === 'function') {
            window.onBuildSkillHit(player, monster, skillDef, dmg, g);
        }
        if (typeof window.applyBreakDamage === 'function') {
            window.applyBreakDamage(monster, dmg, player, skillDef);
        }
        applyStatusFromConfig(player, monster, skillDef, g, statusList);
        if (g && typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(monster.x, monster.y, {
                target: monster,
                sourceX: player.x,
                sourceY: player.y,
                skipSound: true,
                skipEnemyKnock: isClassBasicSkill(skillDef)
            });
        }
    }

    function applyStatusFromConfig(player, monster, skillDef, g, statusList) {
        const ec = entityCfg(skillDef);
        const list = statusList || (ec && ec.entityConfig && ec.entityConfig.statusOnHit)
            || skillDef.statusEffects || [];
        if (!list.length || typeof window.applySkillStatusEffects !== 'function') return;
        const patched = Object.assign({}, skillDef, { statusEffects: list });
        window.applySkillStatusEffects(patched, monster, player, g);
    }

    function nearestEnemy(player, monsters, range) {
        let best = null, bestD = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (typeof TrainingDummy !== 'undefined' && m instanceof TrainingDummy) return;
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d <= range && d < bestD) { bestD = d; best = m; }
        });
        return best;
    }

    function clampInRoom(g, x, y, pad) {
        const room = g && g.currentRoom;
        if (!room) return { x, y };
        pad = pad || 40;
        return {
            x: Math.max((room.x || 0) + pad, Math.min((room.x || 0) + (room.width || 800) - pad, x)),
            y: Math.max((room.y || 0) + pad, Math.min((room.y || 0) + (room.height || 600) - pad, y))
        };
    }

    function setCastBar(player, skillDef, start, end, color) {
        player._skillCastBar = {
            label: skillDef.name,
            startTime: start,
            endTime: end,
            color: color || '#88ccff'
        };
    }

    function floatText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') g.addFloatingText(x, y, text, color || '#88ccff');
    }

    /** 眩晕/击退/击飞（位移）：训练假人与怪物通用 */
    function applyCcEffects(m, now, opts, g) {
        if (!m) return;
        const stunMs = opts.stunMs || 0;
        const knockback = opts.knockback || 0;
        const kbAngle = opts.knockbackAngle;
        if (stunMs > 0) {
            m.frozenUntil = Math.max(m.frozenUntil || 0, now + stunMs);
            if (m.statusEffects) {
                m.statusEffects.frozen = { until: now + stunMs };
            }
        }
        if (knockback > 0 && kbAngle != null) {
            const kbDist = opts.knockup ? knockback * 1.35 : knockback;
            m.x += Math.cos(kbAngle) * kbDist;
            m.y += Math.sin(kbAngle) * kbDist;
        }
        if (opts.knockup && g) {
            floatText(g, m.x, m.y - 14, '击飞', '#ff8844');
        }
    }

    function collectConeTargets(player, monsters, angle, range, halfAngleDeg) {
        const half = (halfAngleDeg || 60) * Math.PI / 180;
        const targets = [];
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const dx = m.x - player.x;
            const dy = m.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > range) return;
            let diff = Math.atan2(dy, dx) - angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) <= half) targets.push(m);
        });
        return targets;
    }

    function pickNearestSkillTarget(player, monsters, range) {
        let best = null, bestD = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const monR = ((m.size || m.radius || 32) / 2);
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d <= range + monR + 8 && d < bestD) { bestD = d; best = m; }
        });
        return best;
    }

    function snapBasicAttackFacing(player, skillDef, monsters, g, castOptions) {
        const isBasic = skillDef && (skillDef.slotType === 'basic' || skillDef.type === 'basic');
        if (!isBasic || !player) return null;
        const c = (skillDef.entityConfig) || {};
        const aimRange = (c.range || skillDef.range || 55) + 28;
        let lockT = castOptions && castOptions.lockTarget;
        if (lockT && lockT.hp <= 0) lockT = null;
        if (typeof window.pickMeleeBasicLockTarget === 'function') {
            const pick = window.pickMeleeBasicLockTarget(player, monsters, aimRange, {
                gameInstance: g,
                preferFacingCone: c.shape === 'cone',
                halfAngleDeg: c.halfAngleDeg || 17.5
            });
            if (pick) lockT = pick;
        } else if (!lockT) {
            lockT = pickNearestSkillTarget(player, monsters, aimRange);
        }
        if (lockT && typeof window.snapPlayerAngleToCombatTarget === 'function') {
            window.snapPlayerAngleToCombatTarget(player, lockT);
        }
        return lockT;
    }

    function isBehindPlayer(player, monster, angleDegOverride) {
        if (typeof window.isPlayerBehindMonster === 'function') {
            return window.isPlayerBehindMonster(player, monster, angleDegOverride);
        }
        const dx = monster.x - player.x, dy = monster.y - player.y;
        const toMon = Math.atan2(dy, dx);
        let diff = toMon - player.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) > Math.PI * 0.5;
    }

    function rollSkillCrit(player, c, monster) {
        if (!player) return false;
        if (c && c.guaranteedCrit) return true;
        if (c && c.guaranteedCritOnBackstab && monster
            && typeof window.isPlayerBehindMonster === 'function'
            && window.isPlayerBehindMonster(player, monster)) return true;
        let critRate = typeof window.getPlayerEffectiveCritRate === 'function'
            ? window.getPlayerEffectiveCritRate(player)
            : (player.baseCritRate || 0);
        if (monster && typeof window.getClassSkillMarkBonus === 'function') {
            const mb = window.getClassSkillMarkBonus(monster, null);
            critRate += (mb && mb.crit) || 0;
        }
        return Math.random() * 100 < critRate;
    }

    function applySkillCritDamage(player, dmg, isCrit, c, monster) {
        if (!isCrit || typeof applyCritDamageMultiplier !== 'function') return dmg;
        let extra = (c && c.critDmgBonus) || 0;
        if (monster && typeof window.getClassSkillMarkBonus === 'function') {
            const mb = window.getClassSkillMarkBonus(monster, null);
            extra += (mb && mb.critDmg) || 0;
        }
        if (typeof window.getAssassinCritDmgBonus === 'function') {
            extra += window.getAssassinCritDmgBonus(player, monster);
        }
        return applyCritDamageMultiplier(dmg, player.baseCritDamage, 1 + extra / 100);
    }

    function distPointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.001) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function resolveSkillMonsters(g, monsters) {
        if (monsters && monsters.length) return monsters;
        if (g && typeof g.getCurrentSceneTargets === 'function') {
            const targets = g.getCurrentSceneTargets();
            if (targets && targets.length) return targets;
        }
        if (g && typeof g._getSkillMonsters === 'function') {
            const targets = g._getSkillMonsters();
            if (targets && targets.length) return targets;
        }
        return monsters || [];
    }

    function onInstantSkillKill(player, skillDef, c, g, monsters, now, killedMonster) {
        if (!player || !c || !killedMonster) return;
        if (c.resetCDOnKill && typeof window.setSkillCooldown === 'function') {
            const cdId = skillDef.evolutionPath && skillDef.evolutionPath.baseSkillId
                ? skillDef.evolutionPath.baseSkillId : skillDef.id;
            player.skillCooldowns = player.skillCooldowns || {};
            player.skillCooldowns[cdId] = 0;
            floatText(g, player.x, player.y - 36, '冷却重置', '#ffdd44');
        }
        if (c.fearRadiusOnKill && c.fearMsOnKill) {
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || m === killedMonster) return;
                if (Math.hypot(m.x - killedMonster.x, m.y - killedMonster.y) <= c.fearRadiusOnKill) {
                    applyCcEffects(m, now, { fearMs: c.fearMsOnKill }, g);
                }
            });
        }
        if (c.chainOnKill && c.chainOnKill > 0
            && typeof window.triggerAssassinChainOnKill === 'function') {
            window.triggerAssassinChainOnKill(
                player, skillDef, { entityConfig: c }, g, monsters, now, killedMonster, c.chainOnKill - 1
            );
        }
    }

    function applyInstantSkillSingleHit(player, m, skillDef, ec, g, monsters, now, chainMult, hitOpts) {
        const c = ec.entityConfig || ec;
        const opts = hitOpts || {};
        const baseDmg = opts.baseDmg != null
            ? opts.baseDmg
            : calcDmg(player, skillDef, c, c.damageMultiplier);
        let d = Math.max(1, Math.floor(baseDmg * (chainMult || 1)));
        if (typeof window.applyComboPointDamageMult === 'function') {
            d = window.applyComboPointDamageMult(player, c, d, g);
        }
        const hpRatio = m.hp / (m.maxHp || 1);
        let isExecute = false;
        if (c.executeThreshold != null) {
            const execTh = (m.isBoss || m.isElite)
                ? (c.executeBossThreshold != null ? c.executeBossThreshold : c.executeThreshold)
                : c.executeThreshold;
            if (hpRatio <= execTh) {
                isExecute = true;
                if (c.executeMultiplier != null) {
                    d = Math.max(1, Math.floor(d * c.executeMultiplier));
                }
                if (!m.isBoss && !m.isElite) {
                    d = Math.max(d, m.hp);
                }
                floatText(g, m.x, m.y - 28, '暗杀·处决!', '#ff2244', 18);
            }
        }
        const isCrit = rollSkillCrit(player, c, m);
        d = applySkillCritDamage(player, d, isCrit, c, m);
        const hpBefore = m.hp;
        applyDmg(player, m, d, skillDef, g, c.statusOnHit);
        if (typeof window.onAssassinSkillHit === 'function') {
            window.onAssassinSkillHit(player, m, skillDef, isCrit, g);
        }
        if (!isExecute && c.nonExecuteComboPoints && typeof window.grantComboPoints === 'function') {
            window.grantComboPoints(player, c.nonExecuteComboPoints);
        }
        applyCcEffects(m, now, {
            stunMs: c.stunMs || c.confuseMs,
            knockback: isClassBasicSkill(skillDef) ? 0 : c.knockback,
            knockbackAngle: Math.atan2(m.y - player.y, m.x - player.x)
        }, g);
        const killed = m.hp <= 0 && hpBefore > 0;
        if (killed && !opts.skipChainOnKill) {
            onInstantSkillKill(player, skillDef, c, g, monsters, now, m);
        }
        return { killed, isExecute, isCrit, damage: d };
    }
    window.applyInstantSkillSingleHit = applyInstantSkillSingleHit;

    function shadowRaidBaseSkillId(skillDef) {
        if (!skillDef) return null;
        if (skillDef.evolutionPath && skillDef.evolutionPath.baseSkillId) {
            return skillDef.evolutionPath.baseSkillId;
        }
        if (skillDef.id === 'shadow_raid' || skillDef.id === 'shadow_dance') return 'shadow_vortex';
        return skillDef.id;
    }

    const SHADOW_RAID_SKILL_IDS = { shadow_raid: true, shadow_vortex: true, shadow_dance: true };

    window.shadowRaidSkillMatches = function shadowRaidSkillMatches(player, skillDef, pending) {
        if (!pending || !skillDef) return false;
        const resolved = (typeof window.getResolvedSkillForPlayer === 'function'
            ? window.getResolvedSkillForPlayer(player, skillDef) : null) || skillDef;
        if (pending.skillId === resolved.id) return true;
        if (pending.baseSkillId && resolved.id === pending.baseSkillId) return true;
        if (pending.slotType === 'core2' && resolved.slotType === 'core2'
            && SHADOW_RAID_SKILL_IDS[pending.skillId] && SHADOW_RAID_SKILL_IDS[resolved.id]) {
            return true;
        }
        return false;
    };

    window.canShadowRaidReturnCast = function canShadowRaidReturnCast(player, skillDef, now) {
        if (!player || !skillDef || player.isDashing) return false;
        const pending = player._shadowRaidReturn;
        if (!pending || now > pending.expireTime) return false;
        return window.shadowRaidSkillMatches(player, skillDef, pending);
    };

    function offerShadowRaidReturn(ch, g, now) {
        const c = ch.ec && ch.ec.entityConfig ? ch.ec.entityConfig : {};
        if (!c.returnWindowMs) return;
        ch.player._shadowRaidReturn = {
            skillId: ch.skillDef.id,
            baseSkillId: shadowRaidBaseSkillId(ch.skillDef),
            slotType: ch.skillDef.slotType || 'core2',
            skillDef: ch.skillDef,
            ec: ch.ec,
            startX: ch.startX,
            startY: ch.startY,
            endX: ch.player.x,
            endY: ch.player.y,
            expireTime: now + c.returnWindowMs,
            returnMult: c.returnDamageMultiplier != null ? c.returnDamageMultiplier : 1.2,
            hitIds: ch.hitIds ? new Set(ch.hitIds) : new Set()
        };
        floatText(g, ch.player.x, ch.player.y - 28, '影袭·可返回', '#bb88ff');
        if (c.autoReturnMs !== false) {
            floatText(g, ch.player.x, ch.player.y - 44, '自动返回中…', '#9966cc');
        }
    }

    function scheduleShadowRaidAutoReturn(ch, g, monsters, now) {
        const c = ch.ec && ch.ec.entityConfig ? ch.ec.entityConfig : {};
        if (!c.returnWindowMs || c.autoReturnMs === false) return;
        const delay = c.autoReturnMs != null ? c.autoReturnMs : 220;
        const st = ensureState(g);
        st.pendingShadowReturns = st.pendingShadowReturns || [];
        st.pendingShadowReturns.push({
            activateTime: now + delay,
            expireTime: now + c.returnWindowMs,
            player: ch.player,
            skillDef: ch.skillDef,
            monsters
        });
    }

    function tickPendingShadowReturns(st, g, monsters, now) {
        if (!st.pendingShadowReturns || !st.pendingShadowReturns.length) return;
        st.pendingShadowReturns = st.pendingShadowReturns.filter(pr => {
            if (now < pr.activateTime) return true;
            if (pr.player && pr.player._shadowRaidReturn && now <= pr.expireTime
                && typeof window.tryShadowRaidReturn === 'function') {
                window.tryShadowRaidReturn(pr.player, pr.skillDef, g, pr.monsters || monsters, now);
            }
            return false;
        });
    }

    window.tryShadowRaidReturn = function tryShadowRaidReturn(player, skillDef, g, monsters, now) {
        if (!player || !skillDef) return null;
        if (player.isDashing) return null;
        const pending = player._shadowRaidReturn;
        if (!pending || !window.shadowRaidSkillMatches(player, skillDef, pending)) return null;
        if (now > pending.expireTime) {
            delete player._shadowRaidReturn;
            return null;
        }
        delete player._shadowRaidReturn;
        const ec = pending.ec || { entityConfig: {} };
        const c = ec.entityConfig || {};
        if (typeof window.clearComboPointDamageMult === 'function') {
            window.clearComboPointDamageMult(player);
        }
        if (c.consumeAllComboPoints && typeof window.prepareComboPointDamageMult === 'function') {
            window.prepareComboPointDamageMult(player, c, g);
        }
        const fromX = player.x;
        const fromY = player.y;
        const toX = pending.startX;
        const toY = pending.startY;
        player.x = toX;
        player.y = toY;
        player.angle = Math.atan2(toY - fromY, toX - fromX);
        const hitRadius = (c.collisionRadius || 22) + 15;
        const returnDmg = calcDmg(player, pending.skillDef, c, pending.returnMult);
        const hitTargets = [];
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (distPointToSegment(m.x, m.y, fromX, fromY, pending.endX, pending.endY) > hitRadius + (m.size || 16) * 0.35) return;
            let d = returnDmg;
            if (typeof window.applyComboPointDamageMult === 'function') {
                d = window.applyComboPointDamageMult(player, c, d, g);
            }
            const isCrit = rollSkillCrit(player, c, m);
            d = applySkillCritDamage(player, d, isCrit, c, m);
            applyDmg(player, m, d, pending.skillDef, g, c.statusOnHit);
            if (typeof window.onAssassinSkillHit === 'function') {
                window.onAssassinSkillHit(player, m, pending.skillDef, isCrit, g);
            }
            hitTargets.push(m);
        });
        if (c.grantBackstabStance && typeof window.grantBackstabStance === 'function') {
            window.grantBackstabStance(player, c.grantBackstabStance.angleDeg || 180, c.grantBackstabStance.durationMs || 3500);
        }
        floatText(g, player.x, player.y - 24, '影袭返回!', '#aa66ee');
        if (typeof window.playAssassinShadowRaidReturnVfx === 'function') {
            window.playAssassinShadowRaidReturnVfx(player, g, {
                fromX, fromY, toX, toY, hitTargets, skillDef: pending.skillDef
            });
        } else if (typeof window.playAssassinSkillVfx === 'function') {
            window.playAssassinSkillVfx(player, pending.skillDef, g, { returnDash: true, fromX, fromY, hitTargets });
        }
        if (typeof window.clearComboPointDamageMult === 'function') {
            window.clearComboPointDamageMult(player);
        }
        return true;
    };

    function applyChargeHitDamage(ch, m, g, now) {
        const c = ch.ec && ch.ec.entityConfig ? ch.ec.entityConfig : {};
        let d = ch.damage;
        if (typeof window.applyComboPointDamageMult === 'function') {
            d = window.applyComboPointDamageMult(ch.player, c, d, g);
        }
        const isCrit = rollSkillCrit(ch.player, c, m);
        d = applySkillCritDamage(ch.player, d, isCrit, c, m);
        applyDmg(ch.player, m, d, ch.skillDef, g, c.statusOnHit);
        if (typeof window.onAssassinSkillHit === 'function') {
            window.onAssassinSkillHit(ch.player, m, ch.skillDef, isCrit, g);
        }
        return isCrit;
    }

    function beginMultiDashSegment(ch, g, now) {
        const c = ch.ec && ch.ec.entityConfig ? ch.ec.entityConfig : {};
        const mult = ch.dashDamage[ch.dashIndex];
        ch.traveled = 0;
        ch.hitIds = new Set();
        ch.maxDist = ch.dashRange;
        ch.damage = calcDmg(ch.player, ch.skillDef, c, mult);
        ch.dashPhase = 'moving';
        ch.player.isDashing = true;
        if (c.dashInvincibilityMs) {
            ch.player.invincibleUntil = now + c.dashInvincibilityMs;
        }
        if (typeof window.playAssassinSkillVfx === 'function') {
            window.playAssassinSkillVfx(ch.player, ch.skillDef, g, {
                dashIndex: ch.dashIndex, dashTotal: ch.dashCount
            });
        }
    }

    function finishShadowDance(ch, ec, g, monsters, now) {
        ch.player.isDashing = false;
        ch.player._chargeSuperArmor = false;
        ch.active = false;
        if (ch.startX != null && ch.startY != null) {
            ch.player.x = ch.startX;
            ch.player.y = ch.startY;
        }
        floatText(g, ch.player.x, ch.player.y - 28, '影舞!', '#aa44ff');
        if (typeof window.playAssassinSkillVfx === 'function') {
            window.playAssassinSkillVfx(ch.player, ch.skillDef, g, { shadowDanceEnd: true });
        }
        applyChargeBuffOnEnd(ch.player, ec.entityConfig, ch.skillDef, now);
    }

    function pickNearestBehindTarget(player, monsters, range, angleDegOverride) {
        let best = null;
        let nd = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const monR = ((m.size || m.radius || 32) / 2);
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d > range + monR) return;
            if (!isBehindPlayer(player, m, angleDegOverride)) return;
            if (d < nd) { nd = d; best = m; }
        });
        return best;
    }

    function collectPierceTargets(player, monsters, range, pierceWidth) {
        const halfW = (pierceWidth || 28) / 2;
        const endX = player.x + Math.cos(player.angle) * range;
        const endY = player.y + Math.sin(player.angle) * range;
        const targets = [];
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const monR = ((m.size || m.radius || 32) / 2);
            const dLine = distPointToSegment(m.x, m.y, player.x, player.y, endX, endY);
            const dOrigin = Math.hypot(m.x - player.x, m.y - player.y);
            if (dLine <= halfW + monR && dOrigin <= range + monR) targets.push(m);
        });
        return targets;
    }

    function computePierceBehind(player, primary) {
        const tang = Math.atan2(primary.y - player.y, primary.x - player.x);
        const monR = (primary.size || primary.radius || 32) / 2;
        const playerR = (player.size || player.playerGifSize || 24) / 2;
        const behindDist = monR + playerR + 14;
        return {
            pierceTargetX: primary.x,
            pierceTargetY: primary.y,
            dashEndX: primary.x + Math.cos(tang) * behindDist,
            dashEndY: primary.y + Math.sin(tang) * behindDist,
            pierceAngle: tang
        };
    }

    function easeOutCubicPierce(t) { return 1 - Math.pow(1 - t, 3); }
    function clamp01Pierce(t) { return Math.max(0, Math.min(1, t)); }

    function startPierceDash(player, g, fromX, fromY, toX, toY, angle, now, durationMs) {
        const p = clampInRoom(g, toX, toY);
        player._pierceDash = {
            startX: fromX,
            startY: fromY,
            endX: p.x,
            endY: p.y,
            startTime: now,
            durationMs: durationMs || 220,
            angle: angle
        };
        player.vx = 0;
        player.vy = 0;
        player.angle = angle;
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, now + (durationMs || 220) + 40);
    }

    window.updatePlayerPierceDash = function updatePlayerPierceDash(player, now) {
        const pd = player && player._pierceDash;
        if (!pd) return false;
        const t = clamp01Pierce((now - pd.startTime) / pd.durationMs);
        const ease = easeOutCubicPierce(t);
        player.x = pd.startX + (pd.endX - pd.startX) * ease;
        player.y = pd.startY + (pd.endY - pd.startY) * ease;
        player.angle = pd.angle;
        player.vx = 0;
        player.vy = 0;
        if (t >= 1) {
            player.x = pd.endX;
            player.y = pd.endY;
            delete player._pierceDash;
            return false;
        }
        return true;
    };

    function computePierceBehind(player, primary, fromX, fromY) {
        const px = fromX != null ? fromX : player.x;
        const py = fromY != null ? fromY : player.y;
        const tang = Math.atan2(primary.y - py, primary.x - px);
        const monR = (primary.size || primary.radius || 32) / 2;
        const playerR = (player.size || player.playerGifSize || 24) / 2;
        const behindDist = monR + playerR + 14;
        return {
            pierceTargetX: primary.x,
            pierceTargetY: primary.y,
            dashEndX: primary.x + Math.cos(tang) * behindDist,
            dashEndY: primary.y + Math.sin(tang) * behindDist,
            pierceAngle: tang
        };
    }

    function easeOutCubicPierce(t) { return 1 - Math.pow(1 - t, 3); }
    function clamp01Pierce(t) { return Math.max(0, Math.min(1, t)); }

    function startPierceDash(player, g, fromX, fromY, toX, toY, angle, now, durationMs) {
        const p = clampInRoom(g, toX, toY);
        player._pierceDash = {
            startX: fromX,
            startY: fromY,
            endX: p.x,
            endY: p.y,
            startTime: now,
            durationMs: durationMs || 220,
            angle: angle
        };
        player.vx = 0;
        player.vy = 0;
        player.angle = angle;
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, now + (durationMs || 220) + 40);
    }

    window.updatePlayerPierceDash = function updatePlayerPierceDash(player, now) {
        const pd = player && player._pierceDash;
        if (!pd) return false;
        const t = clamp01Pierce((now - pd.startTime) / pd.durationMs);
        const ease = easeOutCubicPierce(t);
        player.x = pd.startX + (pd.endX - pd.startX) * ease;
        player.y = pd.startY + (pd.endY - pd.startY) * ease;
        player.angle = pd.angle;
        player.vx = 0;
        player.vy = 0;
        if (t >= 1) {
            player.x = pd.endX;
            player.y = pd.endY;
            delete player._pierceDash;
            return false;
        }
        return true;
    };

    function blinkPlayerBehindTarget(player, target) {
        if (!player || !target) return false;
        const facing = typeof window.getCombatantFacingAngle === 'function'
            ? window.getCombatantFacingAngle(target) : (target.angle || 0);
        const monR = (target.size || target.radius || 32) / 2;
        const playerR = (player.size || player.playerGifSize || 24) / 2;
        const dist = monR + playerR + 14;
        player.x = target.x - Math.cos(facing) * dist;
        player.y = target.y - Math.sin(facing) * dist;
        player.angle = facing;
        return true;
    }

    function applyChargeBuffOnEnd(player, c, skillDef, now) {
        const b = c.buffOnEnd;
        if (!b || !player) return;
        const buffId = 'skill_' + skillDef.id + '_end';
        player.buffs = player.buffs || [];
        player.buffs = player.buffs.filter(x => x.id !== buffId);
        const effects = {};
        if (b.attackSpeedPercent) effects.attackSpeedPercent = b.attackSpeedPercent;
        if (b.attackPercent) effects.attackPercent = b.attackPercent;
        if (b.moveSpeed) effects.moveSpeed = b.moveSpeed;
        if (!Object.keys(effects).length) return;
        player.buffs.push({
            name: skillDef.name + '·余势',
            id: buffId,
            expireTime: now + (b.durationMs || 3000),
            effects,
            hudVisible: true,
            iconKey: b.attackSpeedPercent ? 'attackSpeed' : 'attack'
        });
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    function resolveChargeEndFinish(ch, ec, g, monsters, now) {
        const c = ec.entityConfig;
        const finish = c.endFinish || (c.endExplodeRadius > 0 ? 'radial' : null);
        if (!finish) return [];

        if (finish === 'radial') {
            const endR = c.endExplodeRadius || 0;
            if (endR <= 0) return [];
            const endMult = c.endDamageMultiplier != null ? c.endDamageMultiplier : 1;
            const endDmg = calcDmg(ch.player, ch.skillDef, c, endMult);
            const hitTargets = [];
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - ch.player.x, m.y - ch.player.y) > endR) return;
                applyDmg(ch.player, m, endDmg, ch.skillDef, g, c.statusOnHit);
                applyCcEffects(m, now, {
                    stunMs: c.endStunMs != null ? c.endStunMs : c.stunMs,
                    knockback: c.endKnockback != null ? c.endKnockback : (c.knockback || 0),
                    knockbackAngle: ch.angle
                }, g);
                hitTargets.push(m);
            });
            return hitTargets;
        }

        if (finish === 'cone' || finish === 'devastation_cone') {
            const range = c.endConeRange || c.endExplodeRadius || 90;
            const halfAngle = c.endConeHalfAngleDeg || 70;
            const endMult = c.endDamageMultiplier != null ? c.endDamageMultiplier : 1.2;
            const isDev = finish === 'devastation_cone';
            const hitTargets = collectConeTargets(ch.player, monsters, ch.angle, range, halfAngle);
            hitTargets.forEach(m => {
                let dmg = calcDmg(ch.player, ch.skillDef, c, endMult);
                if (isDev && c.endBreakDamageMultiplier > 1 && m.breakGauge) {
                    const bg = m.breakGauge;
                    const broken = bg.broken || (bg.brokenUntil && bg.brokenUntil > now);
                    if (broken) {
                        dmg = Math.max(1, Math.floor(dmg * c.endBreakDamageMultiplier));
                    }
                }
                applyDmg(ch.player, m, dmg, ch.skillDef, g, c.statusOnHit);
                if (isDev && typeof window.applyBreakDamage === 'function') {
                    window.applyBreakDamage(m, Math.floor(dmg * 0.35), ch.player, ch.skillDef);
                }
                applyCcEffects(m, now, {
                    stunMs: c.endStunMs != null ? c.endStunMs : (isDev ? 1200 : 700),
                    knockback: c.endKnockback != null ? c.endKnockback : (c.knockback || 0),
                    knockbackAngle: ch.angle,
                    knockup: !!(c.endKnockup || (isDev && c.knockup))
                }, g);
            });
            return hitTargets;
        }
        return [];
    }

    function finishCharge(ch, ec, g, monsters, now) {
        const c = ec.entityConfig;
        ch.player.isDashing = false;
        ch.player._chargeSuperArmor = false;
        ch.active = false;

        if (!ch.multiDash) {
            offerShadowRaidReturn(ch, g, now);
            scheduleShadowRaidAutoReturn(ch, g, monsters, now);
        }

        const finish = c.endFinish || (c.endExplodeRadius > 0 ? 'radial' : null);
        const hitTargets = finish ? resolveChargeEndFinish(ch, ec, g, monsters, now) : [];
        applyChargeBuffOnEnd(ch.player, c, ch.skillDef, now);

        if (finish && typeof window.playClassSkillVfx === 'function') {
            const endR = finish === 'radial'
                ? (c.endExplodeRadius || 55)
                : (c.endConeRange || 90);
            window.playClassSkillVfx(ch.player, ch.skillDef, g, {
                hitTargets,
                hit: hitTargets.length > 0,
                chargeEnd: true,
                chargeEndType: finish,
                aoeRadius: endR,
                halfAngleDeg: c.endConeHalfAngleDeg || 70
            });
        } else if (finish === 'radial' && g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('fire_explosion', ch.player.x, ch.player.y, {
                radius: c.endExplodeRadius || 55,
                duration: 420
            });
        }

        if (hitTargets.length > 0 && g && typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(ch.player.x, ch.player.y, {
                skipSound: false,
                isCrit: false,
                sourceX: ch.player.x,
                sourceY: ch.player.y
            });
        }
    }

    function execCharge(player, skillDef, ec, g, monsters, now, angle) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        const isMultiDash = c.type === 'shadow_dance'
            || (c.dashCount > 1 && c.dashDamage && c.dashDamage.length > 1);
        if (isMultiDash) {
            const dashCount = c.dashCount || 3;
            const dashDamage = c.dashDamage || [1.5, 1.875, 2.34];
            const dashRange = c.dashRange || 130;
            st.charges.push({
                player, skillDef, ec,
                angle,
                startX: player.x,
                startY: player.y,
                speed: c.speed || 680,
                baseSpeed: c.speed || 680,
                radius: c.collisionRadius || 30,
                superArmor: !!c.superArmor,
                multiDash: true,
                dashIndex: 0,
                dashCount,
                dashDamage,
                dashRange,
                dashIntervalMs: c.dashIntervalMs || 150,
                dashWaitUntil: 0,
                dashPhase: 'moving',
                traveled: 0,
                maxDist: dashRange,
                damage: calcDmg(player, skillDef, c, dashDamage[0]),
                hitIds: new Set(),
                stopOnFirstHit: false,
                active: true
            });
            player.isDashing = true;
            player.isCastingSkill = false;
            player._chargeSuperArmor = !!c.superArmor;
            if (c.dashInvincibilityMs) {
                player.invincibleUntil = now + c.dashInvincibilityMs;
            }
            floatText(g, player.x, player.y - 20, skillDef.name, '#ff8844');
            if (typeof window.playAssassinSkillVfx === 'function') {
                window.playAssassinSkillVfx(player, skillDef, g, { chargeStart: true, angle, dashIndex: 0, dashTotal: dashCount });
            }
            return;
        }
        const baseSpeed = c.speed || 450;
        st.charges.push({
            player, skillDef, ec,
            angle,
            startX: player.x,
            startY: player.y,
            speed: baseSpeed,
            baseSpeed,
            maxDist: c.maxDistance || 150,
            traveled: 0,
            radius: c.collisionRadius || 35,
            damage: calcDmg(player, skillDef, c, c.damageMultiplier),
            stopOnFirstHit: c.stopOnFirstHit === true,
            superArmor: !!c.superArmor,
            stunMs: c.stunMs,
            knockback: c.knockback,
            knockup: !!c.knockup,
            slowMult: c.slowMult,
            slowMs: c.slowMs,
            pathStunMs: c.pathStunMs,
            healOnHitMaxHpPercent: c.healOnHitMaxHpPercent,
            speedPerHitPercent: c.speedPerHitPercent,
            speedPerHitMaxStacks: c.speedPerHitMaxStacks,
            hitCount: 0,
            hitIds: new Set(),
            active: true
        });
        player.isDashing = true;
        player.isCastingSkill = false;
        player._chargeSuperArmor = !!c.superArmor;
        floatText(g, player.x, player.y - 20, skillDef.name, '#ff8844');
    }


    function spawnProjectile(player, skillDef, ec, g, monsters, now) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        const target = nearestEnemy(player, monsters, skillDef.range || 500);
        let angle = player.angle;
        if (target) angle = Math.atan2(target.y - player.y, target.x - player.x);

        const count = c.projectileCount || 1;
        const spread = (c.spreadAngleDeg || 0) * Math.PI / 180;
        if (c.windupMs > 0) {
            setCastBar(player, skillDef, now, now + c.windupMs, '#ffaa44');
        }
        for (let i = 0; i < count; i++) {
            const offset = count > 1 ? spread * (i / (count - 1) - 0.5) : 0;
            st.projectiles.push({
                x: player.x, y: player.y,
                angle: angle + offset,
                speed: c.speed || 400,
                maxRange: c.maxRange || 600,
                traveled: 0,
                radius: c.collisionRadius || 20,
                pierceLeft: c.pierceCount != null ? c.pierceCount : 0,
                damage: calcDmg(player, skillDef, c, c.damageMultiplier),
                skillDef, player,
                trajectory: c.trajectory || 'straight',
                targetRef: target,
                hitEffect: c.hitEffect,
                explodeRadius: c.explodeRadius || 0,
                stunMs: c.stunMs,
                healOnHitPercent: c.healOnHitPercent,
                lifeStealPercent: c.lifeStealPercent,
                boomerang: c.trajectory === 'boomerang',
                boomerangPhase: 'out',
                startX: player.x, startY: player.y,
                color: c.color || '#ff6600',
                statusOnHit: c.statusOnHit,
                projectileSpriteId: c.projectileSpriteId || null,
                markTarget: !!c.markTarget,
                markDurationMs: c.markDurationMs,
                markOwnerDamageBonus: c.markOwnerDamageBonus,
                deathSentenceThreshold: c.deathSentenceThreshold,
                deathSentenceDamageBonus: c.deathSentenceDamageBonus,
                hitIds: new Set(),
                spawnTime: now + (c.windupMs || 0),
                active: !(c.windupMs > 0),
                hideVisual: c.hideVisual === true
            });
        }
        if (c.preCast === 'backstep' && typeof window.applyClassSkillHybridEffect === 'function') {
            const fake = { skillEffect: { type: 'backstep', distance: c.backstepDistance || 100 } };
            window.applyClassSkillHybridEffect(player, fake, g, now, { monsters, hitTargets: [], baseDamage: 0 });
        }
        floatText(g, player.x, player.y - 20, skillDef.name, '#ffaa44');
        return true;
    }

    function spawnSummon(player, skillDef, ec, g, monsters, now) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        const existing = st.summons.filter(s => s.owner === player && s.unitId === c.summonUnitId);
        if (existing.length >= (c.maxCount || 1)) {
            existing.sort((a, b) => a.expireTime - b.expireTime);
            existing[0].expireTime = 0;
        }
        const ang = Math.random() * Math.PI * 2;
        const off = c.spawnOffset || 50;
        const pos = clampInRoom(g, player.x + Math.cos(ang) * off, player.y + Math.sin(ang) * off);
        const inh = c.inheritStats || {};
        st.summons.push({
            x: pos.x, y: pos.y,
            hp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.4))),
            maxHp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.4))),
            attack: Math.max(1, Math.floor(baseAtk(player) * (inh.attack || 0.3))),
            defense: Math.floor((player.baseDefense || 5) * (inh.defense || 0.2)),
            owner: player, unitId: c.summonUnitId,
            aiType: c.aiType || 'melee_chase',
            attackIntervalMs: c.attackIntervalMs || 1000,
            lastAttack: 0,
            expireTime: now + (c.durationMs || 20000),
            size: c.size || 20,
            color: c.color || '#888888',
            statusOnHit: c.statusOnHit,
            skillDef, vx: 0, vy: 0,
            tauntRadius: c.tauntRadius || 0
        });
        if (c.ownerDamageBonusPercent) {
            player.buffs = player.buffs || [];
            player.buffs.push({
                id: 'summon_bonus_' + skillDef.id,
                name: skillDef.name,
                expireTime: now + (c.durationMs || 20000),
                effects: { attackPercent: c.ownerDamageBonusPercent }
            });
        }
        floatText(g, pos.x, pos.y, '召唤!', '#aaddff');
        return true;
    }

    function spawnField(player, skillDef, ec, g, monsters, now, castOptions) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        let fx = player.x, fy = player.y;
        if (c.targeted) {
            if (castOptions && castOptions.groundPoint) {
                fx = castOptions.groundPoint.x;
                fy = castOptions.groundPoint.y;
            } else {
                const t = nearestEnemy(player, monsters, skillDef.range || 220);
                if (t) { fx = t.x; fy = t.y; }
            }
        } else if (c.spawnAtCaster) {
            fx = player.x; fy = player.y;
        }

        if (c.triggerType === 'instant_burst') {
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - fx, m.y - fy) <= (c.fieldRadius || 100)) {
                    applyDmg(player, m, calcDmg(player, skillDef, c, c.damageMultiplier), skillDef, g, c.statusOnHit);
                }
            });
            if (c.spreadRadius && c.spreadPoisonStacks) {
                (monsters || []).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    if (Math.hypot(m.x - fx, m.y - fy) <= c.spreadRadius) {
                        applyStatusFromConfig(player, m, skillDef, g, [{ 'type': 'poison', 'durationMs': 6000, 'stacks': c.spreadPoisonStacks }]);
                    }
                });
            }
            floatText(g, fx, fy, skillDef.name, '#55dd44');
            return true;
        }

        const ot = c.onTrigger || {};
        const fieldDmgMult = (c.triggerType === 'proximity_mine' && ot.damageMultiplier != null)
            ? ot.damageMultiplier : c.damageMultiplier;
        const field = {
            x: fx, y: fy,
            radius: c.fieldRadius || 80,
            expireTime: c.triggerType === 'delayed_strike'
                ? now + (c.delayMs || 3000) + 500
                : now + (c.fieldDurationMs || 4000),
            strikeTime: c.triggerType === 'delayed_strike' ? now + (c.delayMs || 3000) : 0,
            tickIntervalMs: c.tickIntervalMs || 1000,
            lastTick: now,
            triggerType: c.triggerType || 'periodic',
            armed: !(c.armDelayMs > 0),
            armTime: now + (c.armDelayMs || 0),
            invisible: !!c.invisible,
            onTrigger: c.onTrigger,
            damage: calcDmg(player, skillDef, c, fieldDmgMult),
            statusOnTick: c.statusOnTick,
            statusOnHit: c.statusOnHit,
            followCaster: !!c.followCaster,
            owner: player,
            skillDef,
            entityConfig: c,
            color: c.color || '#55aa44',
            projectilesPerTick: c.projectilesPerTick,
            projectileConfig: c.projectileConfig,
            stunMs: c.stunMs,
            summonOnImpact: c.summonOnImpact,
            randomStatusOnTick: c.randomStatusOnTick,
            leaveBurnGroundMs: c.leaveBurnGroundMs,
            struck: false
        };
        st.fields.push(field);
        floatText(g, fx, fy, skillDef.name, '#88ddff');
        return true;
    }

    function resolveInstant(player, skillDef, ec, g, monsters, now, castOptions) {
        const c = ec.entityConfig;
        if ((c.windupMs || 0) > 0) {
            setCastBar(player, skillDef, now, now + c.windupMs, '#ffcc66');
            const st = ensureState(g);
            st.pendingInstants = st.pendingInstants || [];
            st.pendingInstants.push({
                activateTime: now + c.windupMs,
                player, skillDef, ec, monsters,
                castOptions: castOptions || null
            });
            floatText(g, player.x, player.y - 20, skillDef.name, '#ffcc66');
            return true;
        }
        return execInstant(player, skillDef, ec, g, monsters, now, castOptions);
    }

    function execInstant(player, skillDef, ec, g, monsters, now, castOptions) {
        monsters = resolveSkillMonsters(g, monsters);
        snapBasicAttackFacing(player, skillDef, monsters, g, castOptions);
        const c = ec.entityConfig;
        const range = c.range || skillDef.range || 80;
        const targets = [];
        const dashBehind = !!(c._comboDashBehind || skillDef._comboDashBehind);
        const originX = player.x;
        const originY = player.y;

        if (c.type === 'multi_strike' && typeof window.resolveAssassinMultiStrike === 'function') {
            return window.resolveAssassinMultiStrike(player, skillDef, ec, g, monsters, now);
        }

        if (c.shape === 'pierce' || dashBehind) {
            const pierceWidth = c.pierceWidth || 28;
            targets.push(...collectPierceTargets(player, monsters, range, pierceWidth));
        } else if (c.shape === 'cone') {
            const half = (c.halfAngleDeg || 45) * Math.PI / 180;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const dx = m.x - player.x, dy = m.y - player.y;
                const dist = Math.hypot(dx, dy);
                const monR = ((m.size || m.radius || 32) / 2);
                if (dist > range + monR) return;
                let diff = Math.atan2(dy, dx) - player.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) <= half) targets.push(m);
            });
        } else if (c.shape === 'radial') {
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const monR = ((m.size || m.radius || 32) / 2);
                if (Math.hypot(m.x - player.x, m.y - player.y) <= range + monR) targets.push(m);
            });
        } else if (c.shape === 'chain') {
            let cur = pickNearestSkillTarget(player, monsters, c.range || 200);
            const hit = new Set();
            for (let i = 0; i < (c.chainCount || 3) && cur; i++) {
                targets.push(cur);
                hit.add(cur);
                let next = null, nd = Infinity;
                (monsters || []).forEach(m => {
                    if (!m || m.hp <= 0 || hit.has(m)) return;
                    const d = Math.hypot(m.x - cur.x, m.y - cur.y);
                    if (d < (c.range || 200) && d < nd) { nd = d; next = m; }
                });
                cur = next;
            }
        } else if (c.requiresBehind) {
            const behindDeg = c.behindAngleDeg != null ? c.behindAngleDeg : undefined;
            const t = pickNearestBehindTarget(player, monsters, range, behindDeg);
            if (!t) {
                floatText(g, player.x, player.y - 24, '需从背后', '#ff6666');
                if (typeof window.playAssassinBackstabFailVfx === 'function') {
                    window.playAssassinBackstabFailVfx(player, null, g);
                }
                return false;
            }
            targets.push(t);
        } else {
            const t = pickNearestSkillTarget(player, monsters, range);
            if (t) targets.push(t);
        }

        let pierceCtx = null;
        if (dashBehind) {
            let primary = targets[0]
                || (castOptions && castOptions.lockTarget)
                || pickNearestSkillTarget(player, monsters, range + 28);
            if (primary && primary.hp > 0) {
                if (targets.indexOf(primary) < 0) {
                    if (typeof window.snapPlayerAngleToCombatTarget === 'function') {
                        window.snapPlayerAngleToCombatTarget(player, primary);
                    } else {
                        player.angle = Math.atan2(primary.y - player.y, primary.x - player.x);
                    }
                    targets.length = 0;
                    targets.push(...collectPierceTargets(player, monsters, range, c.pierceWidth || 28));
                    if (targets.indexOf(primary) < 0) targets.push(primary);
                }
                pierceCtx = computePierceBehind(player, primary, originX, originY);
            }
        }

        if (player._allowFaceOnPierce) {
            player._allowFaceOnPierce = false;
        }

        if (typeof window.clearComboPointDamageMult === 'function') {
            window.clearComboPointDamageMult(player);
        }

        if (c.spreadPoisonStacks && c.requiresPoisonedTarget) {
            let hit = false;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const hasPoison = m.combatStatuses && m.combatStatuses.poison;
                if (!hasPoison) return;
                if (Math.hypot(m.x - player.x, m.y - player.y) <= (c.spreadRadius || 120)) {
                    applyStatusFromConfig(player, m, skillDef, g, [{ type: 'poison', durationMs: 6000, stacks: c.spreadPoisonStacks }]);
                    hit = true;
                }
            });
            return hit;
        }

        if (targets.length > 0 && c.consumeAllComboPoints
            && typeof window.prepareComboPointDamageMult === 'function') {
            window.prepareComboPointDamageMult(player, c, g);
        }

        let chainMult = 1;
        targets.forEach((m, i) => {
            if (c.shape === 'chain' && c.chainDecay) chainMult = 1 - i * c.chainDecay;
            applyInstantSkillSingleHit(player, m, skillDef, ec, g, monsters, now, chainMult);
        });
        if (typeof window.clearComboPointDamageMult === 'function') {
            window.clearComboPointDamageMult(player);
        }

        floatText(g, player.x, player.y - 20, skillDef.name, '#ffcc66');
        if (typeof window.playClassSkillVfx === 'function') {
            window.playClassSkillVfx(player, skillDef, g, {
                primaryTarget: targets[0] || null,
                hitTargets: targets,
                hit: targets.length > 0,
                instantShape: c.shape,
                comboStep: skillDef._comboStep,
                comboChain: skillDef._comboChain,
                pierceTargetX: pierceCtx && pierceCtx.pierceTargetX,
                pierceTargetY: pierceCtx && pierceCtx.pierceTargetY,
                dashEndX: pierceCtx && pierceCtx.dashEndX,
                dashEndY: pierceCtx && pierceCtx.dashEndY,
                pierceAngle: pierceCtx && pierceCtx.pierceAngle
            });
        } else if (typeof window.playAssassinSkillVfx === 'function' && targets.length > 0) {
            window.playAssassinSkillVfx(player, skillDef, g, {
                hitTargets: targets,
                pierceTargetX: pierceCtx && pierceCtx.pierceTargetX,
                pierceTargetY: pierceCtx && pierceCtx.pierceTargetY,
                dashEndX: pierceCtx && pierceCtx.dashEndX,
                dashEndY: pierceCtx && pierceCtx.dashEndY
            });
        }
        if (pierceCtx) {
            startPierceDash(player, g, originX, originY, pierceCtx.dashEndX, pierceCtx.dashEndY,
                pierceCtx.pierceAngle, now, c.pierceDashMs || 220);
            if (typeof window.updatePlayerPierceDash === 'function') {
                window.updatePlayerPierceDash(player, now);
            }
        } else if (c._comboDash && c._comboDash > 0) {
            const nx = player.x + Math.cos(player.angle) * c._comboDash;
            const ny = player.y + Math.sin(player.angle) * c._comboDash;
            const clamped = clampInRoom(g, nx, ny);
            player.x = clamped.x;
            player.y = clamped.y;
        }
        if (targets.length > 0 && g && typeof g.triggerHitImpact === 'function'
            && (c.shape === 'cone' || c.shape === 'radial' || c.shape === 'pierce' || dashBehind)) {
            const hitR = c.range || skillDef.range || 80;
            let fx;
            let fy;
            let sourceX = player.x;
            let sourceY = player.y;
            if (pierceCtx) {
                fx = pierceCtx.pierceTargetX;
                fy = pierceCtx.pierceTargetY;
                sourceX = originX;
                sourceY = originY;
            } else if (c.shape === 'radial') {
                fx = player.x;
                fy = player.y;
            } else {
                fx = player.x + Math.cos(player.angle) * hitR * 0.45;
                fy = player.y + Math.sin(player.angle) * hitR * 0.45;
            }
            g.triggerHitImpact(fx, fy, {
                skipSound: false,
                isCrit: false,
                sourceX,
                sourceY,
                skipEnemyKnock: isClassBasicSkill(skillDef)
            });
        }
        return targets.length > 0 || c.shape === 'cone' || c.shape === 'radial' || dashBehind;
    }

    function resolveBlink(player, skillDef, ec, g, monsters, now, castOptions) {
        const c = ec.entityConfig;
        if (c.stealthMs) {
            player.buffs = player.buffs || [];
            player.buffs.push({
                id: 'stealth_' + skillDef.id,
                name: skillDef.name,
                expireTime: now + c.stealthMs,
                effects: { dodge: c.dodgeBonus || 25, moveSpeed: c.moveSpeedBonus || 30 }
            });
            floatText(g, player.x, player.y - 20, '隐身', '#aaaaaa');
            return true;
        }
        let tx = player.x, ty = player.y;
        const target = (castOptions && castOptions.lockTarget)
            || nearestEnemy(player, monsters, c.range || 100);
        if (c.behindTarget && target) {
            const ang = Math.atan2(target.y - player.y, target.x - player.x);
            tx = target.x - Math.cos(ang) * 28;
            ty = target.y - Math.sin(ang) * 28;
            player.angle = ang;
        } else {
            const dist = c.distance || 100;
            const ang = (castOptions && castOptions.angle != null) ? castOptions.angle : player.angle;
            player.angle = ang;
            tx = player.x + Math.cos(ang) * dist;
            ty = player.y + Math.sin(ang) * dist;
        }
        const p = clampInRoom(g, tx, ty);
        player.x = p.x; player.y = p.y;
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, now + (c.invincibleMs || 280));
        if (c.bonusDamageMultiplier && target) {
            const bd = Math.max(1, Math.floor(baseAtk(player) * c.bonusDamageMultiplier));
            applyDmg(player, target, bd, skillDef, g, c.statusOnHit);
        }
        if (c.grantMoveSpeed) {
            player.buffs = player.buffs || [];
            player.buffs.push({
                id: 'wind_step_' + skillDef.id,
                name: skillDef.name,
                expireTime: now + (c.grantMoveSpeedMs || 4000),
                effects: { moveSpeed: c.grantMoveSpeed }
            });
        }
        if (c.spawnSummonsOnCast) {
            const sc = c.spawnSummonsOnCast;
            const fakeEc = { entityType: 'summon', entityConfig: {
                summonUnitId: sc.unitId, spawnOffset: 40, durationMs: sc.durationMs || 8000,
                maxCount: sc.count || 2, inheritStats: { hp: 0.15, attack: 0.12, defense: 0.05 },
                aiType: 'melee_chase', attackIntervalMs: 1200, size: 14, color: '#ccccff'
            }};
            for (let i = 0; i < (sc.count || 2); i++) {
                spawnSummon(player, skillDef, fakeEc, g, monsters, now);
            }
        }
        floatText(g, player.x, player.y - 20, skillDef.name, '#cc88ff');
        return true;
    }

    function startCharge(player, skillDef, ec, g, monsters, now, castOptions) {
        const c = ec.entityConfig;
        let angle = player.angle;
        if (castOptions && castOptions.angle != null) {
            angle = castOptions.angle;
        } else {
            const target = nearestEnemy(player, monsters, skillDef.range || 200);
            if (target) angle = Math.atan2(target.y - player.y, target.x - player.x);
        }
        player.angle = angle;
        if (c.windupMs > 0) {
            setCastBar(player, skillDef, now, now + c.windupMs, '#ff8844');
            player.isCastingSkill = true;
            if (c.superArmor || c.superArmorWindup) player._chargeSuperArmor = true;
            const st = ensureState(g);
            st.pendingCharges = st.pendingCharges || [];
            st.pendingCharges.push({
                activateTime: now + c.windupMs,
                player, skillDef, ec, monsters, angle
            });
            floatText(g, player.x, player.y - 24, '蓄力…', '#ffaa44');
            return true;
        }
        execCharge(player, skillDef, ec, g, monsters, now, angle);
        return true;
    }

    window.castSkillEntity = function castSkillEntity(player, skillDef, gameInstance, monsters, now, castOptions) {
        const ec = entityCfg(skillDef);
        const type = (ec && ec.entityType) || window.inferSkillEntityType(skillDef);
        if (!type) return null;
        const cfg = ec || { entityType: type, entityConfig: {} };
        switch (type) {
            case 'projectile': return spawnProjectile(player, skillDef, cfg, gameInstance, monsters, now);
            case 'summon': return spawnSummon(player, skillDef, cfg, gameInstance, monsters, now);
            case 'field': return spawnField(player, skillDef, cfg, gameInstance, monsters, now, castOptions);
            case 'instant': return resolveInstant(player, skillDef, cfg, gameInstance, monsters, now, castOptions);
            case 'blink': return resolveBlink(player, skillDef, cfg, gameInstance, monsters, now, castOptions);
            case 'charge': return startCharge(player, skillDef, cfg, gameInstance, monsters, now, castOptions);
            default: return null;
        }
    };

    window.hasSkillEntityBehavior = function hasSkillEntityBehavior(skillDef) {
        if (!skillDef) return false;
        if (skillDef.entityType && skillDef.entityConfig) return true;
        return !!(entityCfg(skillDef) || window.inferSkillEntityType(skillDef));
    };

    // ---- Update loop ----

    window.updateSkillEntities = function updateSkillEntities(gameInstance, monsters, dtSec) {
        if (!gameInstance) return;
        const st = ensureState(gameInstance);
        const now = Date.now();
        const dt = dtSec || 0.016;

        if (gameInstance.player && gameInstance.player._pierceDash
            && typeof window.updatePlayerPierceDash === 'function') {
            window.updatePlayerPierceDash(gameInstance.player, now);
        }

        if (st.pendingCharges && st.pendingCharges.length) {
            st.pendingCharges.forEach(pc => {
                const wc = pc.ec && pc.ec.entityConfig ? pc.ec.entityConfig : {};
                if (wc.superArmor || wc.superArmorWindup) {
                    pc.player._chargeSuperArmor = true;
                }
            });
            st.pendingCharges = st.pendingCharges.filter(pc => {
                if (now < pc.activateTime) return true;
                execCharge(pc.player, pc.skillDef, pc.ec, gameInstance, pc.monsters, now, pc.angle);
                return false;
            });
            if (st.pendingCharges.length === 0 && gameInstance.player) {
                gameInstance.player.isCastingSkill = false;
                if (!gameInstance.player.isDashing) {
                    gameInstance.player._chargeSuperArmor = false;
                }
            }
        }

        if (st.pendingInstants && st.pendingInstants.length) {
            st.pendingInstants = st.pendingInstants.filter(pi => {
                if (now < pi.activateTime) return true;
                execInstant(pi.player, pi.skillDef, pi.ec, gameInstance, pi.monsters, now, pi.castOptions);
                return false;
            });
        }

        // Projectiles
        st.projectiles = st.projectiles.filter(p => {
            if (now < p.spawnTime) return true;
            if (!p.active) p.active = true;
            let vx, vy;
            if (p.trajectory === 'homing' && p.targetRef && p.targetRef.hp > 0) {
                const ang = Math.atan2(p.targetRef.y - p.y, p.targetRef.x - p.x);
                vx = Math.cos(ang) * p.speed * dt;
                vy = Math.sin(ang) * p.speed * dt;
                p.angle = ang;
            } else if (p.boomerang) {
                if (p.boomerangPhase === 'out') {
                    vx = Math.cos(p.angle) * p.speed * dt;
                    vy = Math.sin(p.angle) * p.speed * dt;
                    p.traveled += p.speed * dt;
                    if (p.traveled >= p.maxRange * 0.5) {
                        p.boomerangPhase = 'return';
                        p.angle = Math.atan2(p.player.y - p.y, p.player.x - p.x);
                    }
                } else {
                    vx = Math.cos(p.angle) * p.speed * dt;
                    vy = Math.sin(p.angle) * p.speed * dt;
                    if (Math.hypot(p.player.x - p.x, p.player.y - p.y) < 30) return false;
                }
            } else {
                vx = Math.cos(p.angle) * p.speed * dt;
                vy = Math.sin(p.angle) * p.speed * dt;
                p.traveled += p.speed * dt;
                if (p.traveled >= p.maxRange) {
                    if (p.explodeRadius) explodeAt(p.player, p, p.x, p.y, monsters, gameInstance);
                    return false;
                }
            }
            const np = clampInRoom(gameInstance, p.x + vx, p.y + vy);
            p.x = np.x; p.y = np.y;

            let hit = false;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || p.hitIds.has(m)) return;
                if (Math.hypot(m.x - p.x, m.y - p.y) <= p.radius + (m.size || 20) * 0.5) {
                    applyDmg(p.player, m, p.damage, p.skillDef, gameInstance, p.statusOnHit);
                    if (p.stunMs) m.frozenUntil = Math.max(m.frozenUntil || 0, now + p.stunMs);
                    if (p.healOnHitPercent && p.player) {
                        const heal = Math.max(1, Math.floor(p.player.maxHp * p.healOnHitPercent / 100));
                        p.player.hp = Math.min(p.player.maxHp, p.player.hp + heal);
                    }
                    if (p.lifeStealPercent && p.player) {
                        const heal = Math.max(1, Math.floor(p.damage * p.lifeStealPercent / 100));
                        p.player.hp = Math.min(p.player.maxHp, p.player.hp + heal);
                    }
                    p.hitIds.add(m);
                    if (p.markTarget && typeof window.applyClassSkillMarkOnMonster === 'function') {
                        const se = (p.skillDef && p.skillDef.skillEffect) || {};
                        const ec = (p.skillDef && p.skillDef.entityConfig) || {};
                        window.applyClassSkillMarkOnMonster(m, {
                            durationMs: p.markDurationMs || ec.markDurationMs || se.durationMs || 10000,
                            damageBonus: p.markOwnerDamageBonus != null
                                ? p.markOwnerDamageBonus
                                : (se.damageBonus != null ? se.damageBonus : 25),
                            markId: se.markId || 'death_mark',
                            deathSentence: !!(se.deathSentence || ec.deathSentenceThreshold),
                            owner: p.player
                        }, p.skillDef, now);
                    }
                    if (p.explodeRadius) explodeAt(p.player, p, p.x, p.y, monsters, gameInstance);
                    if (p.pierceLeft <= 0) { hit = true; }
                    else p.pierceLeft--;
                }
            });
            return !hit;
        });

        // Summons
        st.summons = st.summons.filter(s => {
            if (now >= s.expireTime || s.hp <= 0) return false;
            if (s.aiType === 'taunt_static') return true;
            if (!s.attack) return true;
            let target = null, td = Infinity;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const d = Math.hypot(m.x - s.x, m.y - s.y);
                if (d < td) { td = d; target = m; }
            });
            if (!target) return true;
            const dx = target.x - s.x, dy = target.y - s.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist > 35) {
                const sp = 2.5;
                s.x += (dx / dist) * sp;
                s.y += (dy / dist) * sp;
            } else if (now - s.lastAttack >= s.attackIntervalMs) {
                s.lastAttack = now;
                target.takeDamage(s.attack);
                if (s.statusOnHit && typeof window.applySkillStatusEffects === 'function') {
                    window.applySkillStatusEffects({ statusEffects: s.statusOnHit }, target, s.owner, gameInstance);
                }
            }
            return true;
        });

        // Fields
        st.fields = st.fields.filter(f => {
            if (now >= f.expireTime) {
                if (f.leaveBurnGroundMs && f.owner && !f._burnSpawned) {
                    st.fields.push({
                        x: f.x, y: f.y,
                        radius: Math.floor(f.radius * 0.75),
                        expireTime: now + f.leaveBurnGroundMs,
                        tickIntervalMs: 500,
                        lastTick: now,
                        triggerType: 'periodic',
                        damage: Math.max(1, Math.floor(f.damage * 0.35)),
                        statusOnTick: f.statusOnTick || [{ type: 'burn', durationMs: 4000 }],
                        owner: f.owner,
                        skillDef: f.skillDef,
                        color: '#ff4400',
                        _burnGround: true
                    });
                }
                return false;
            }
            if (f.followCaster && f.owner) { f.x = f.owner.x; f.y = f.owner.y; }

            if (f.triggerType === 'delayed_strike') {
                if (!f.struck && now >= f.strikeTime) {
                    f.struck = true;
                    (monsters || []).forEach(m => {
                        if (!m || m.hp <= 0) return;
                        if (Math.hypot(m.x - f.x, m.y - f.y) <= f.radius) {
                            applyDmg(f.owner, m, f.damage, f.skillDef, gameInstance, f.statusOnHit);
                            if (f.stunMs) m.frozenUntil = Math.max(m.frozenUntil || 0, now + f.stunMs);
                        }
                    });
                    if (f.summonOnImpact && f.owner) {
                        const si = f.summonOnImpact;
                        const fakeEc = { entityType: 'summon', entityConfig: {
                            summonUnitId: si.unitId, spawnOffset: 50, durationMs: si.durationMs || 20000,
                            maxCount: si.count || 3, inheritStats: { hp: 0.25, attack: 0.3, defense: 0.1 },
                            aiType: 'melee_chase', attackIntervalMs: 1000, size: 18, color: '#ccccaa'
                        }};
                        for (let i = 0; i < (si.count || 3); i++) {
                            spawnSummon(f.owner, f.skillDef, fakeEc, gameInstance, monsters, now);
                        }
                    }
                    if (gameInstance && typeof gameInstance.addEquipmentEffect === 'function') {
                        gameInstance.addEquipmentEffect('fire_explosion', f.x, f.y, { radius: f.radius, duration: 600 });
                    }
                    if (gameInstance && typeof gameInstance.triggerHitImpact === 'function') {
                        gameInstance.triggerHitImpact(f.x, f.y, {
                            skipSound: false, isCrit: true, sourceX: f.owner.x, sourceY: f.owner.y
                        });
                    }
                    return false;
                }
                return true;
            }

            if (f.triggerType === 'proximity_mine') {
                if (!f.armed && now >= f.armTime) f.armed = true;
                if (!f.armed) return true;
                let triggered = false;
                (monsters || []).forEach(m => {
                    if (!m || m.hp <= 0 || triggered) return;
                    if (Math.hypot(m.x - f.x, m.y - f.y) <= f.radius + 15) {
                        triggered = true;
                        const ot = f.onTrigger || {};
                        if (ot.explodeRadius) {
                            (monsters || []).forEach(m2 => {
                                if (!m2 || m2.hp <= 0) return;
                                if (Math.hypot(m2.x - f.x, m2.y - f.y) <= ot.explodeRadius) {
                                    applyDmg(f.owner, m2, f.damage, f.skillDef, gameInstance);
                                    if (ot.freezeMs) m2.frozenUntil = Math.max(m2.frozenUntil || 0, now + ot.freezeMs);
                                    applyStatusFromConfig(f.owner, m2, f.skillDef, gameInstance, ot.statusOnHit);
                                }
                            });
                        }
                        floatText(gameInstance, f.x, f.y, '触发!', '#88ddff');
                    }
                });
                return !triggered;
            }
            if (now - f.lastTick >= f.tickIntervalMs) {
                f.lastTick = now;
                if (f.projectilesPerTick && f.projectileConfig) {
                    const pc = f.projectileConfig;
                    for (let i = 0; i < f.projectilesPerTick; i++) {
                        const ang = Math.random() * Math.PI * 2;
                        st.projectiles.push({
                            x: f.x, y: f.y, angle: ang,
                            speed: pc.speed || 500, maxRange: f.radius * 2, traveled: 0,
                            radius: pc.collisionRadius || 14,
                            pierceLeft: 0,
                            damage: calcDmg(f.owner, f.skillDef, pc, pc.damageMultiplier),
                            skillDef: f.skillDef, player: f.owner,
                            trajectory: pc.trajectory || 'straight',
                            targetRef: nearestEnemy(f.owner, monsters, f.radius),
                            color: f.color || '#6688aa',
                            statusOnHit: f.statusOnTick,
                            hitIds: new Set(), spawnTime: now, active: true
                        });
                    }
                } else {
                    (monsters || []).forEach(m => {
                        if (!m || m.hp <= 0) return;
                        if (Math.hypot(m.x - f.x, m.y - f.y) <= f.radius) {
                            if (f.damage > 0) applyDmg(f.owner, m, f.damage, f.skillDef, gameInstance, f.statusOnTick);
                            if (f.randomStatusOnTick && f.randomStatusOnTick.length) {
                                const stype = f.randomStatusOnTick[Math.floor(Math.random() * f.randomStatusOnTick.length)];
                                applyStatusFromConfig(f.owner, m, f.skillDef, gameInstance, [{ type: stype, durationMs: 4000 }]);
                            } else {
                                applyStatusFromConfig(f.owner, m, f.skillDef, gameInstance, f.statusOnTick);
                            }
                        }
                    });
                }
            }
            return true;
        });

        // Charges
        tickPendingShadowReturns(st, gameInstance, monsters, now);
        if (typeof window.tickAssassinMultiStrikes === 'function') {
            window.tickAssassinMultiStrikes(gameInstance, monsters, now);
        }
        st.charges = st.charges.filter(ch => {
            if (!ch.active) return false;
            const c = ch.ec && ch.ec.entityConfig ? ch.ec.entityConfig : {};

            if (ch.multiDash && ch.dashPhase === 'waiting') {
                if (now < ch.dashWaitUntil) return true;
                ch.dashIndex += 1;
                if (ch.dashIndex >= ch.dashCount) {
                    finishShadowDance(ch, ch.ec, gameInstance, monsters, now);
                    return false;
                }
                const enemy = pickNearestSkillTarget(ch.player, monsters, ch.dashRange + 80);
                if (enemy) {
                    ch.angle = Math.atan2(enemy.y - ch.player.y, enemy.x - ch.player.x);
                }
                beginMultiDashSegment(ch, gameInstance, now);
                return true;
            }

            const step = ch.speed * dt;
            ch.traveled += step;
            const nx = ch.player.x + Math.cos(ch.angle) * step;
            const ny = ch.player.y + Math.sin(ch.angle) * step;
            const p = clampInRoom(gameInstance, nx, ny);
            ch.player.x = p.x;
            ch.player.y = p.y;
            let stopped = ch.traveled >= ch.maxDist;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || ch.hitIds.has(m)) return;
                if (Math.hypot(m.x - ch.player.x, m.y - ch.player.y) <= ch.radius + 15) {
                    applyChargeHitDamage(ch, m, gameInstance, now);
                    ch.hitIds.add(m);
                    const pathStun = ch.pathStunMs != null ? ch.pathStunMs : ch.stunMs;
                    applyCcEffects(m, now, {
                        stunMs: pathStun,
                        knockback: ch.knockback != null ? ch.knockback : c.knockback,
                        knockbackAngle: ch.angle,
                        knockup: ch.knockup
                    }, gameInstance);
                    if (ch.slowMult) {
                        if (!m.slowEffects) m.slowEffects = [];
                        m.slowEffects.push({ multiplier: ch.slowMult, expireTime: now + (ch.slowMs || 2000) });
                    }
                    if (ch.healOnHitMaxHpPercent > 0) {
                        const heal = Math.max(1, Math.floor(ch.player.maxHp * ch.healOnHitMaxHpPercent));
                        ch.player.hp = Math.min(ch.player.maxHp, ch.player.hp + heal);
                        floatText(gameInstance, ch.player.x, ch.player.y - 26, `+${heal}`, '#44ff88');
                    }
                    if (ch.speedPerHitPercent > 0) {
                        ch.hitCount = (ch.hitCount || 0) + 1;
                        const maxStacks = ch.speedPerHitMaxStacks || 5;
                        const stacks = Math.min(maxStacks, ch.hitCount);
                        ch.speed = ch.baseSpeed * (1 + (ch.speedPerHitPercent / 100) * stacks);
                    }
                    if (ch.stopOnFirstHit) stopped = true;
                }
            });
            if (stopped) {
                if (ch.multiDash) {
                    if (ch.dashIndex < ch.dashCount - 1) {
                        ch.dashPhase = 'waiting';
                        ch.dashWaitUntil = now + ch.dashIntervalMs;
                        ch.player.isDashing = false;
                        return true;
                    }
                    finishShadowDance(ch, ch.ec, gameInstance, monsters, now);
                    return false;
                }
                finishCharge(ch, ch.ec, gameInstance, monsters, now);
                return false;
            }
            return true;
        });
        if (st.charges.length === 0 && gameInstance.player) {
            gameInstance.player.isDashing = false;
            gameInstance.player._chargeSuperArmor = false;
        }

        const p = gameInstance.player;
        if (p && p._skillCastBar && now >= p._skillCastBar.endTime) {
            p._skillCastBar = null;
            p.isCastingSkill = false;
        }
    };

    function explodeAt(player, proj, x, y, monsters, g) {
        if (!proj.explodeRadius) return;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - x, m.y - y) <= proj.explodeRadius) {
                applyDmg(player, m, proj.damage, proj.skillDef, g);
            }
        });
        if (g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('fire_explosion', x, y, { radius: proj.explodeRadius, duration: 400 });
        }
    }

    window.drawSkillEntities = function drawSkillEntities(ctx, gameInstance) {
        if (!ctx || !gameInstance || !gameInstance._skillEntities) return;
        try {
        const st = gameInstance._skillEntities;
        const now = Date.now();

        st.projectiles.forEach(p => {
            if (now < p.spawnTime || p.hideVisual) return;
            const drawn = gameInstance.assetManager && p.projectileSpriteId
                && typeof gameInstance.assetManager.drawProjectileSprite === 'function'
                && gameInstance.assetManager.drawProjectileSprite(
                    ctx, p.x, p.y, p.angle, p.projectileSpriteId, Math.max(16, p.radius * 2)
                );
            if (drawn) return;
            ctx.save();
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = p.explodeRadius ? 8 : 4;
            ctx.beginPath();
            const r = Math.max(5, p.radius * 0.4);
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        });

        st.summons.forEach(s => {
            ctx.save();
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff4444';
            const bw = s.size;
            ctx.fillRect(s.x - bw / 2, s.y - s.size - 8, bw * (s.hp / s.maxHp), 4);
            ctx.restore();
        });

        st.fields.forEach(f => {
            const now = Date.now();
            if (f.entityConfig && f.entityConfig._nightfallField) return;
            if (f.triggerType === 'delayed_strike' && !f.struck && now < f.strikeTime) {
                const ratio = Math.min(1, (now - (f.strikeTime - (f.entityConfig && f.entityConfig.delayMs || 3000))) / (f.entityConfig && f.entityConfig.delayMs || 3000));
                ctx.save();
                ctx.strokeStyle = 'rgba(255,100,0,0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.radius * Math.max(0.3, ratio), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (f.invisible && f.triggerType === 'proximity_mine' && f.armed) {
                ctx.save();
                ctx.strokeStyle = 'rgba(136,221,255,0.35)';
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (!f.invisible) {
                const color = f.color || '#552288';
                ctx.save();
                if (typeof color === 'string' && color.startsWith('#')) {
                    ctx.fillStyle = color + '44';
                } else if (typeof color === 'string') {
                    ctx.fillStyle = color.replace(')', ',0.25)').replace('rgb', 'rgba');
                } else {
                    ctx.fillStyle = 'rgba(85,34,136,0.25)';
                }
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });

        if (typeof window.drawBuildCombatHud === 'function') {
            window.drawBuildCombatHud(ctx, gameInstance);
        }
        } catch (err) {
            console.error('drawSkillEntities error:', err);
        }
    };

})();
