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
        if (typeof window.getBuildDamageMultiplier === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getBuildDamageMultiplier(player, monster, skillDef)));
        }
        const defRed = typeof window.getCombatStatusDefenseReduction === 'function'
            ? window.getCombatStatusDefenseReduction(monster) : 0;
        if (defRed > 0) dmg = Math.max(1, Math.floor(dmg * (1 + defRed / 100)));
        monster.takeDamage(dmg);
        if (typeof window.onBuildSkillHit === 'function') {
            window.onBuildSkillHit(player, monster, skillDef, dmg, g);
        }
        if (typeof window.applyBreakDamage === 'function') {
            window.applyBreakDamage(monster, dmg, player, skillDef);
        }
        applyStatusFromConfig(player, monster, skillDef, g, statusList);
        if (g && typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(monster.x, monster.y, { target: monster, sourceX: player.x, sourceY: player.y, skipSound: true });
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
        pad = pad || 40;
        if (room) {
            return {
                x: Math.max((room.x || 0) + pad, Math.min((room.x || 0) + (room.width || 800) - pad, x)),
                y: Math.max((room.y || 0) + pad, Math.min((room.y || 0) + (room.height || 600) - pad, y))
            };
        }
        const cw = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_WIDTH) || 800;
        const ch = (typeof CONFIG !== 'undefined' && CONFIG.CANVAS_HEIGHT) || 600;
        return {
            x: Math.max(pad, Math.min(cw - pad, x)),
            y: Math.max(pad, Math.min(ch - pad, y))
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

    function collectPierceTargets(player, monsters, range, pierceWidth) {
        const targets = [];
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const dx = m.x - player.x;
            const dy = m.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > range || dist < 1) return;
            const toMon = Math.atan2(dy, dx);
            let diff = toMon - player.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > Math.PI * 0.55) return;
            const perpDist = Math.abs(dist * Math.sin(diff));
            const monR = (m.size || m.radius || 32) / 2;
            if (perpDist <= pierceWidth + monR) targets.push(m);
        });
        targets.sort((a, b) => {
            const da = Math.hypot(a.x - player.x, a.y - player.y);
            const db = Math.hypot(b.x - player.x, b.y - player.y);
            return da - db;
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

    function applyProjectileCc(proj, m, now, monsters, g) {
        if (!m || !proj) return;
        const ec = entityCfg(proj.skillDef);
        const cfg = Object.assign({}, ec && ec.entityConfig, {
            debuffSlowPercent: proj.debuffSlowPercent,
            debuffDurationMs: proj.debuffDurationMs,
            stunMs: proj.stunMs,
            tauntDurationMs: proj.tauntDurationMs
        });
        applyCcEffects(m, now, cfg, g, proj.player);
    }

    function applyCcEffects(m, now, opts, g, tauntTarget) {
        if (!m || !opts) return;
        if (typeof window.applyMonsterSkillDebuffs === 'function') {
            window.applyMonsterSkillDebuffs(m, opts, g, now, {
                tauntTarget: tauntTarget || opts.tauntTarget || opts.player
            });
        }
    }

    function applyInstantAllyBuffs(player, c, skillDef, g, now) {
        if (!player || !c) return;
        const buffId = 'skill_' + skillDef.id + '_ally';
        const dur = c.allySpeedMs || c.debuffDurationMs || 5000;
        if (c.allySpeedPercent || c.allyAttackSpeedPercent) {
            const effects = {};
            if (c.allySpeedPercent) effects.moveSpeed = c.allySpeedPercent;
            if (c.allyAttackSpeedPercent) effects.attackSpeedPercent = c.allyAttackSpeedPercent;
            player.buffs = player.buffs || [];
            player.buffs = player.buffs.filter(b => b.id !== buffId);
            player.buffs.push({
                name: skillDef.name + '·加速',
                id: buffId,
                expireTime: now + dur,
                effects,
                hudVisible: true
            });
            if (typeof player.updateStats === 'function') player.updateStats();
            floatText(g, player.x, player.y - 28, '时间加速', '#cc88ff');
        }
    }

    function onInstantSkillKill(player, skillDef, c, g, monsters, now, killedMonster) {
        if (!player || !c || !killedMonster) return;
        if (c.resetCDOnKill && typeof window.setSkillCooldown === 'function') {
            const cdDef = Object.assign({}, skillDef, {
                id: skillDef.evolutionPath && skillDef.evolutionPath.baseSkillId
                    ? skillDef.evolutionPath.baseSkillId : skillDef.id
            });
            player.skillCooldowns = player.skillCooldowns || {};
            player.skillCooldowns[cdDef.id] = 0;
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
    }

    function healPlayerPercent(player, pct, g, label) {
        if (!player || !pct) return;
        const heal = Math.max(1, Math.floor(player.maxHp * pct / 100));
        player.hp = Math.min(player.maxHp, player.hp + heal);
        floatText(g, player.x, player.y - 26, (label || '回复') + ' +' + heal, '#44ff88');
    }

    function grantPlayerShieldPercent(player, pct, skillDef, now, g) {
        if (!player || !pct) return;
        const amount = Math.max(1, Math.floor(player.maxHp * pct / 100));
        const buffId = 'skill_' + (skillDef && skillDef.id || 'shield') + '_ally_shield';
        player.buffs = player.buffs || [];
        player.buffs = player.buffs.filter(b => b.id !== buffId);
        player.buffs.push({
            name: (skillDef && skillDef.name || '圣光') + '·护盾',
            id: buffId,
            expireTime: now + 8000,
            effects: {},
            shieldRemaining: amount,
            shieldMax: amount,
            hudVisible: true
        });
        if (typeof player.updateStats === 'function') player.updateStats();
        floatText(g, player.x, player.y - 28, `护盾 +${amount}`, '#88eeff');
    }

    function applyTeamMarkOnMonster(m, bonusPct, skillDef, until, now) {
        if (!m || !bonusPct) return;
        m._classSkillMark = {
            expireTime: until || (now + 8000),
            damageBonus: bonusPct,
            critBonus: 0,
            name: skillDef && skillDef.name
        };
    }

    function applyAllyFieldBuffs(f, ec, gameInstance, now) {
        const owner = f.owner;
        if (!owner || !ec) return;
        if (Math.hypot(owner.x - f.x, owner.y - f.y) > f.radius) return;
        if (ec.healAllyPerTick) {
            healPlayerPercent(owner, ec.healAllyPerTick, gameInstance, '圣光');
        }
        if (ec.allyDmgBonusPercent) {
            const buffId = 'skill_' + f.skillDef.id + '_consecration_dmg';
            owner.buffs = owner.buffs || [];
            owner.buffs = owner.buffs.filter(b => b.id !== buffId);
            owner.buffs.push({
                name: f.skillDef.name + '·增伤',
                id: buffId,
                expireTime: now + (f.tickIntervalMs || 1000) + 300,
                effects: { attackPercent: ec.allyDmgBonusPercent },
                hudVisible: true
            });
            if (typeof owner.updateStats === 'function') owner.updateStats();
        }
    }

    function spawnConsecrationField(st, player, skillDef, x, y, cfg, now) {
        if (!st || !player || !cfg) return;
        const tickMs = cfg.tickIntervalMs || 1000;
        const mult = cfg.damageMultiplierPerTick != null ? cfg.damageMultiplierPerTick : 0.3;
        st.fields.push({
            x, y,
            radius: cfg.radius || 50,
            expireTime: now + (cfg.durationMs || 4000),
            tickIntervalMs: tickMs,
            lastTick: now,
            triggerType: 'periodic',
            damage: calcDmg(player, skillDef, cfg, mult),
            entityConfig: cfg,
            statusOnTick: cfg.statusOnTick,
            owner: player,
            skillDef,
            color: cfg.color || '#66ddff',
            _consecrationGround: true
        });
    }

    function applyProjectileExplodeEffects(proj, x, y, monsters, g, now) {
        if (!proj.explodeRadius) return;
        const ec = entityCfg(proj.skillDef);
        const cfg = (ec && ec.entityConfig) || {};
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - x, m.y - y) <= proj.explodeRadius) {
                applyDmg(proj.player, m, proj.damage, proj.skillDef, g, proj.statusOnHit);
                applyProjectileCc(proj, m, now, monsters, g);
                if (proj.teamDmgBonus && proj.tauntDurationMs) {
                    applyTeamMarkOnMonster(m, proj.teamDmgBonus, proj.skillDef,
                        now + proj.tauntDurationMs, now);
                }
            }
        });
        if (proj.allyShieldPercent && proj.player) {
            grantPlayerShieldPercent(proj.player, proj.allyShieldPercent, proj.skillDef, now, g);
        }
        const consecCfg = proj.consecrationOnExplode || cfg.consecrationOnExplode;
        if (consecCfg && proj.player) {
            const st = ensureState(g);
            spawnConsecrationField(st, proj.player, proj.skillDef, x, y, consecCfg, now);
        }
        if (g && typeof g.addEquipmentEffect === 'function') {
            const fx = proj.visualVariant === 'light_spear' ? 'holy_blast' : 'fire_explosion';
            g.addEquipmentEffect(fx, x, y, { radius: proj.explodeRadius, duration: 450 });
        }
        if (proj.visualVariant === 'light_spear' && typeof window.playClassSkillVfx === 'function' && proj.player) {
            window.playClassSkillVfx(proj.player, proj.skillDef, g, {
                hitTargets: [],
                hit: true,
                lightSpearImpact: true,
                impactX: x,
                impactY: y,
                aoeRadius: proj.explodeRadius
            });
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
                const ccCfg = Object.assign({}, c, {
                    stunMs: c.endStunMs != null ? c.endStunMs : c.stunMs
                });
                applyCcEffects(m, now, ccCfg, g, ch.player);
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
                applyCcEffects(m, now, Object.assign({}, c, {
                    stunMs: c.endStunMs != null ? c.endStunMs : (isDev ? 1200 : 700)
                }), g, ch.player);
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
        if (c.spawnHolyFieldOnEnd && g) {
            const st = ensureState(g);
            spawnConsecrationField(st, ch.player, ch.skillDef, ch.player.x, ch.player.y,
                c.spawnHolyFieldOnEnd, Date.now());
        }
    }

    function execCharge(player, skillDef, ec, g, monsters, now, angle) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        const baseSpeed = c.speed || 450;
        st.charges.push({
            player, skillDef, ec,
            angle,
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
        if (typeof window.playClassSkillVfx === 'function') {
            window.playClassSkillVfx(player, skillDef, g, { chargeStart: true, angle });
        }
    }


    function resolveProjectileGroundPoint(player, c, skillDef, g, castOptions, monsters) {
        const maxR = c.maxRange || skillDef.range || 350;
        let tx;
        let ty;
        if (castOptions && castOptions.groundPoint) {
            tx = castOptions.groundPoint.x;
            ty = castOptions.groundPoint.y;
        } else if (castOptions && castOptions.lockTarget && castOptions.lockTarget.hp > 0) {
            tx = castOptions.lockTarget.x;
            ty = castOptions.lockTarget.y;
        } else if (c.autoLockOnTap !== false && c.trajectory === 'lob_ground') {
            const aoeR = c.explodeRadius || skillDef.aoeRadius || 100;
            if (typeof window.pickBestAoeGroundPoint === 'function') {
                const pick = window.pickBestAoeGroundPoint(player, monsters, maxR, aoeR);
                tx = pick.x;
                ty = pick.y;
                if (pick.hitCount > 0) {
                    player.angle = Math.atan2(ty - player.y, tx - player.x);
                }
            } else {
                const enemy = nearestEnemy(player, monsters, maxR);
                if (enemy) {
                    tx = enemy.x;
                    ty = enemy.y;
                    player.angle = Math.atan2(ty - player.y, tx - player.x);
                } else {
                    tx = player.x + Math.cos(player.angle) * maxR * 0.65;
                    ty = player.y + Math.sin(player.angle) * maxR * 0.65;
                }
            }
        } else {
            tx = player.x + Math.cos(player.angle) * maxR * 0.65;
            ty = player.y + Math.sin(player.angle) * maxR * 0.65;
        }
        const dx = tx - player.x;
        const dy = ty - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxR) {
            tx = player.x + (dx / dist) * maxR;
            ty = player.y + (dy / dist) * maxR;
        }
        return clampInRoom(g, tx, ty);
    }

    function spawnProjectile(player, skillDef, ec, g, monsters, now, castOptions) {
        const c = ec.entityConfig;
        const st = ensureState(g);
        const isLobGround = c.trajectory === 'lob_ground';
        const target = isLobGround ? null : nearestEnemy(player, monsters, skillDef.range || 500);
        let angle = player.angle;
        if (target) angle = Math.atan2(target.y - player.y, target.x - player.x);

        const count = c.projectileCount || 1;
        const spread = (c.spreadAngleDeg || 0) * Math.PI / 180;
        if (c.windupMs > 0) {
            setCastBar(player, skillDef, now, now + c.windupMs, '#ffaa44');
        }
        for (let i = 0; i < count; i++) {
            const offset = count > 1 ? spread * (i / (count - 1) - 0.5) : 0;
            const base = {
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
                visualVariant: c.visualVariant || (skillDef.id === 'holy_taunt' ? 'light_spear' : null),
                tauntDurationMs: c.tauntDurationMs,
                debuffSlowPercent: c.debuffSlowPercent,
                debuffDurationMs: c.debuffDurationMs,
                consecrationOnExplode: c.consecrationOnExplode,
                teamDmgBonus: c.teamDmgBonus,
                allyShieldPercent: c.allyShieldPercent,
                hitIds: new Set(),
                spawnTime: now + (c.windupMs || 0),
                active: !(c.windupMs > 0),
                hideVisual: c.hideVisual === true
            };
            if (isLobGround) {
                const land = resolveProjectileGroundPoint(player, c, skillDef, g, castOptions, monsters);
                base.trajectory = 'lob_ground';
                base.lobStartX = player.x;
                base.lobStartY = player.y;
                base.lobTargetX = land.x;
                base.lobTargetY = land.y;
                base.lobArcHeight = c.lobArcHeight || 120;
                base.lobDurationMs = c.lobFlightMs || 650;
                base.lobElapsed = 0;
                base.pierceLeft = 0;
                base.angle = Math.atan2(land.y - player.y, land.x - player.x);
            }
            st.projectiles.push(base);
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

    function isBehindPlayer(player, monster) {
        const dx = monster.x - player.x, dy = monster.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        const toMon = Math.atan2(dy, dx);
        let diff = toMon - player.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) > Math.PI * 0.5;
    }

    function resolveInstant(player, skillDef, ec, g, monsters, now) {
        const c = ec.entityConfig;
        if ((c.windupMs || 0) > 0) {
            setCastBar(player, skillDef, now, now + c.windupMs, '#ffcc66');
            const st = ensureState(g);
            st.pendingInstants = st.pendingInstants || [];
            st.pendingInstants.push({
                activateTime: now + c.windupMs,
                player, skillDef, ec, monsters
            });
            floatText(g, player.x, player.y - 20, skillDef.name, '#ffcc66');
            return true;
        }
        return execInstant(player, skillDef, ec, g, monsters, now);
    }

    function execInstant(player, skillDef, ec, g, monsters, now) {
        const c = ec.entityConfig;
        const dmg = calcDmg(player, skillDef, c, c.damageMultiplier);
        const range = c.range || skillDef.range || 80;
        const targets = [];

        const dashBehind = !!(c._comboDashBehind || skillDef._comboDashBehind);

        if (c.shape === 'pierce' || dashBehind) {
            const pierceWidth = c.pierceWidth || 28;
            targets.push(...collectPierceTargets(player, monsters, range, pierceWidth));
        } else if (c.shape === 'cone') {
            const half = (c.halfAngleDeg || 45) * Math.PI / 180;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const dx = m.x - player.x, dy = m.y - player.y;
                const dist = Math.hypot(dx, dy);
                if (dist > range) return;
                let diff = Math.atan2(dy, dx) - player.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                if (Math.abs(diff) <= half) targets.push(m);
            });
        } else if (c.shape === 'radial') {
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - player.x, m.y - player.y) <= range) targets.push(m);
            });
        } else if (c.shape === 'chain') {
            let cur = nearestEnemy(player, monsters, c.range || 200);
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
        } else {
            const t = nearestEnemy(player, monsters, range);
            if (t) {
                if (!c.requiresBehind || isBehindPlayer(player, t)) targets.push(t);
            }
        }

        if (c.executeThreshold != null) {
            const t = targets[0] || nearestEnemy(player, monsters, range);
            if (!t) return false;
            const ratio = t.hp / (t.maxHp || 1);
            const thresh = (t.isBoss || t.isElite) ? (c.executeBossThreshold || 0.35) : c.executeThreshold;
            if (ratio > thresh) {
                floatText(g, player.x, player.y - 24, '血量过高', '#ff6666');
                return false;
            }
            applyDmg(player, t, dmg, skillDef, g, c.statusOnHit);
            floatText(g, t.x, t.y, '处决!', '#ff0044');
            return true;
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

        let chainMult = 1;
        targets.forEach((m, i) => {
            if (c.shape === 'chain' && c.chainDecay) chainMult = 1 - i * c.chainDecay;
            let d = Math.max(1, Math.floor(dmg * chainMult));
            if (c.executeMultiplier != null && c.executeThresholdPercent != null) {
                const ratio = m.hp / (m.maxHp || 1);
                if (ratio <= c.executeThresholdPercent / 100) {
                    d = Math.max(1, Math.floor(d * c.executeMultiplier));
                }
            }
            const hpBefore = m.hp;
            applyDmg(player, m, d, skillDef, g, c.statusOnHit);
            applyCcEffects(m, now, c, g, player);
            if (c.lifeStealPercent) healPlayerPercent(player, c.lifeStealPercent, g, '吸血');
            if (m.hp <= 0 && hpBefore > 0) {
                onInstantSkillKill(player, skillDef, c, g, monsters, now, m);
            }
        });
        if (c.resourcePerHit && targets.length > 0 && player) {
            const gain = c.resourcePerHit * targets.length;
            if (typeof window.grantSkillResource === 'function') {
                window.grantSkillResource(player, gain);
            }
        }
        applyInstantAllyBuffs(player, c, skillDef, g, now);
        floatText(g, player.x, player.y - 20, skillDef.name, '#ffcc66');

        if (c.grantShieldStacks > 0 && typeof window.grantHolyShieldStacks === 'function') {
            const stacks = window.grantHolyShieldStacks(player, c.grantShieldStacks, {
                stackMax: c.stackMax || 3,
                absorbPercentPerStack: c.shieldPercentPerStack || 5
            });
            floatText(g, player.x, player.y - 36, `圣盾 ${stacks}/${c.stackMax || 3}`, '#66ddff');
            if (g && typeof g.addEquipmentEffect === 'function') {
                g.addEquipmentEffect('divine_shield', player.x, player.y, { radius: 52, duration: 680 });
            }
        }

        const originX = player.x;
        const originY = player.y;
        let pierceCtx = null;
        if (dashBehind && targets.length > 0) {
            pierceCtx = computePierceBehind(player, targets[0]);
        }

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
        }
        if (pierceCtx) {
            startPierceDash(player, g, originX, originY, pierceCtx.dashEndX, pierceCtx.dashEndY, pierceCtx.pierceAngle, now, 220);
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
                skipSound: false, isCrit: false, sourceX, sourceY
            });
        }
        return targets.length > 0 || c.shape === 'cone' || c.shape === 'radial' || c.shape === 'pierce';
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
            case 'projectile': return spawnProjectile(player, skillDef, cfg, gameInstance, monsters, now, castOptions);
            case 'summon': return spawnSummon(player, skillDef, cfg, gameInstance, monsters, now);
            case 'field': return spawnField(player, skillDef, cfg, gameInstance, monsters, now, castOptions);
            case 'instant': return resolveInstant(player, skillDef, cfg, gameInstance, monsters, now);
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
                execInstant(pi.player, pi.skillDef, pi.ec, gameInstance, pi.monsters, now);
                return false;
            });
        }

        // Projectiles
        st.projectiles = st.projectiles.filter(p => {
            if (now < p.spawnTime) return true;
            if (!p.active) p.active = true;
            if (p.trajectory === 'lob_ground') {
                p.lobElapsed = (p.lobElapsed || 0) + dt * 1000;
                const dur = p.lobDurationMs || 650;
                const t = Math.min(1, p.lobElapsed / dur);
                const arcH = p.lobArcHeight || 120;
                const sx = p.lobStartX;
                const sy = p.lobStartY;
                const ex = p.lobTargetX;
                const ey = p.lobTargetY;
                const tNext = Math.min(1, t + 0.03);
                p.x = sx + (ex - sx) * t;
                p.y = sy + (ey - sy) * t - arcH * Math.sin(Math.PI * t);
                const nx = sx + (ex - sx) * tNext;
                const ny = sy + (ey - sy) * tNext - arcH * Math.sin(Math.PI * tNext);
                p.angle = Math.atan2(ny - p.y, nx - p.x);
                if (t >= 1) {
                    p.x = ex;
                    p.y = ey;
                    if (p.explodeRadius) {
                        applyProjectileExplodeEffects(p, ex, ey, monsters, gameInstance, now);
                    }
                    return false;
                }
                return true;
            }
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
                    if (p.explodeRadius) applyProjectileExplodeEffects(p, p.x, p.y, monsters, gameInstance, now);
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
                    if (p.stunMs) applyCcEffects(m, now, { stunMs: p.stunMs });
                    applyProjectileCc(p, m, now, monsters, gameInstance);
                    if (p.healOnHitPercent && p.player) {
                        const heal = Math.max(1, Math.floor(p.player.maxHp * p.healOnHitPercent / 100));
                        p.player.hp = Math.min(p.player.maxHp, p.player.hp + heal);
                    }
                    if (p.lifeStealPercent && p.player) {
                        const heal = Math.max(1, Math.floor(p.damage * p.lifeStealPercent / 100));
                        p.player.hp = Math.min(p.player.maxHp, p.player.hp + heal);
                    }
                    p.hitIds.add(m);
                    if (p.explodeRadius) applyProjectileExplodeEffects(p, p.x, p.y, monsters, gameInstance, now);
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
                            applyCcEffects(m, now, { stunMs: f.stunMs }, gameInstance, f.owner);
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
                                    applyStatusFromConfig(f.owner, m2, f.skillDef, gameInstance, ot.statusOnHit);
                                    applyCcEffects(m2, now, ot, gameInstance, f.owner);
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
                    const ec = f.entityConfig || {};
                    (monsters || []).forEach(m => {
                        if (!m || m.hp <= 0) return;
                        if (Math.hypot(m.x - f.x, m.y - f.y) <= f.radius) {
                            let tickDmg = f.damage;
                            if (ec.damageEnemyPerTick != null && f.owner) {
                                tickDmg = Math.max(1, Math.floor(baseAtk(f.owner) * ec.damageEnemyPerTick));
                            }
                            if (tickDmg > 0) applyDmg(f.owner, m, tickDmg, f.skillDef, gameInstance, f.statusOnTick);
                            if (ec.enemySlowPercent) {
                                applyCcEffects(m, now, {
                                    enemySlowPercent: ec.enemySlowPercent,
                                    enemySlowMs: ec.enemySlowMs || f.tickIntervalMs * 2 || 2000
                                }, gameInstance);
                            }
                            if (f.randomStatusOnTick && f.randomStatusOnTick.length) {
                                const stype = f.randomStatusOnTick[Math.floor(Math.random() * f.randomStatusOnTick.length)];
                                applyStatusFromConfig(f.owner, m, f.skillDef, gameInstance, [{ type: stype, durationMs: 4000 }]);
                            } else {
                                applyStatusFromConfig(f.owner, m, f.skillDef, gameInstance, f.statusOnTick);
                            }
                        }
                    });
                    if (ec.allyDmgBonusPercent || ec.healAllyPerTick) {
                        applyAllyFieldBuffs(f, ec, gameInstance, now);
                    }
                    if (ec.allyDmgBonusPerTick && f.owner) {
                        const buffId = 'skill_' + f.skillDef.id + '_field_dmg';
                        f.owner.buffs = f.owner.buffs || [];
                        f.owner.buffs = f.owner.buffs.filter(b => b.id !== buffId);
                        f.owner.buffs.push({
                            name: f.skillDef.name + '·命运',
                            id: buffId,
                            expireTime: now + (f.tickIntervalMs || 1000) + 200,
                            effects: { attackPercent: ec.allyDmgBonusPerTick },
                            hudVisible: true
                        });
                        if (typeof f.owner.updateStats === 'function') f.owner.updateStats();
                    }
                }
            }
            return true;
        });

        // Charges
        st.charges = st.charges.filter(ch => {
            if (!ch.active) return false;
            const c = ch.ec && ch.ec.entityConfig ? ch.ec.entityConfig : {};
            const step = ch.speed * dt;
            ch.traveled += step;
            const nx = ch.player.x + Math.cos(ch.angle) * step;
            const ny = ch.player.y + Math.sin(ch.angle) * step;
            const p = clampInRoom(gameInstance, nx, ny);
            ch.player.x = p.x;
            ch.player.y = p.y;
            if (c.leaveConsecrationTrail) {
                ch.trailDist = (ch.trailDist || 0) + step;
                const trail = c.leaveConsecrationTrail;
                if (ch.trailDist >= (trail.interval || 45)) {
                    ch.trailDist = 0;
                    spawnConsecrationField(st, ch.player, ch.skillDef, ch.player.x, ch.player.y, trail, now);
                }
            }
            let stopped = ch.traveled >= ch.maxDist;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || ch.hitIds.has(m)) return;
                if (Math.hypot(m.x - ch.player.x, m.y - ch.player.y) <= ch.radius + 15) {
                    if (ch.stopOnFirstHit) {
                        const dx = ch.player.x - m.x;
                        const dy = ch.player.y - m.y;
                        const dist = Math.hypot(dx, dy) || 1;
                        const monR = (m.size || CONFIG.MONSTER_SIZE || 32) / 2;
                        const stopDist = monR + ch.radius + 4;
                        const stopX = m.x + (dx / dist) * stopDist;
                        const stopY = m.y + (dy / dist) * stopDist;
                        const clamped = clampInRoom(gameInstance, stopX, stopY);
                        ch.player.x = clamped.x;
                        ch.player.y = clamped.y;
                        stopped = true;
                        return;
                    }
                    applyDmg(ch.player, m, ch.damage, ch.skillDef, gameInstance);
                    ch.hitIds.add(m);
                    const pathStun = ch.pathStunMs != null ? ch.pathStunMs : ch.stunMs;
                    const ccCfg = Object.assign({}, c, { stunMs: pathStun, slowMult: ch.slowMult || c.slowMult, slowMs: ch.slowMs || c.slowMs });
                    applyCcEffects(m, now, ccCfg, gameInstance, ch.player);
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
                        if (stacks > 0 && stacks === ch.hitCount) {
                            floatText(gameInstance, ch.player.x, ch.player.y - 36, `加速 ×${stacks}`, '#ffcc66');
                        }
                    }
                }
            });
            if (stopped) {
                finishCharge(ch, ch.ec, gameInstance, monsters, now);
                return false;
            }
            return true;
        });
        if (st.charges.length === 0 && gameInstance.player) {
            gameInstance.player.isDashing = false;
            gameInstance.player._chargeSuperArmor = false;
        }

        if (typeof window.updateHolyLightFields === 'function') {
            window.updateHolyLightFields(gameInstance, now);
        }
        if (typeof window.updateClassSkillTransformEffects === 'function') {
            window.updateClassSkillTransformEffects(gameInstance, now);
        }

        const p = gameInstance.player;
        if (p && p._skillCastBar && now >= p._skillCastBar.endTime) {
            p._skillCastBar = null;
            p.isCastingSkill = false;
        }
    };

    function explodeAt(player, proj, x, y, monsters, g) {
        applyProjectileExplodeEffects(proj, x, y, monsters, g, Date.now());
    }

    function drawLightSpear(ctx, p) {
        const len = Math.max(44, (p.radius || 14) * 3.2);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const col = p.color || '#66ddff';
        ctx.shadowColor = col;
        ctx.shadowBlur = 16;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(len * 0.58, 0);
        ctx.lineTo(-len * 0.38, -5);
        ctx.lineTo(-len * 0.18, 0);
        ctx.lineTo(-len * 0.38, 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e8ffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-len * 0.12, -2.5, len * 0.68, 5);
        ctx.restore();
    }

    window.drawSkillEntities = function drawSkillEntities(ctx, gameInstance) {
        if (!ctx || !gameInstance || !gameInstance._skillEntities) return;
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
            if (p.visualVariant === 'light_spear') {
                drawLightSpear(ctx, p);
                return;
            }
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

        const pl = gameInstance.player;
        if (pl && typeof window.getHolyShieldStacks === 'function') {
            const stacks = window.getHolyShieldStacks(pl);
            if (stacks > 0) {
                const baseR = (pl.size || 24) * 0.52;
                ctx.save();
                for (let i = 0; i < stacks; i++) {
                    const phase = now / 380 + i * Math.PI * 2 / 3;
                    ctx.strokeStyle = `rgba(102,221,255,${0.4 + i * 0.12})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(pl.x, pl.y, baseR + 3 + i * 5 + Math.sin(phase) * 2, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.fillStyle = '#e8faff';
                ctx.font = 'bold 10px Courier New';
                ctx.textAlign = 'center';
                ctx.fillText('盾×' + stacks, pl.x, pl.y - baseR - 14);
                ctx.restore();
            }
        }
        if (pl && pl._holyLightField && now < pl._holyLightField.expireTime) {
            const f = pl._holyLightField;
            const pulse = 0.92 + Math.sin(now / 180) * 0.06;
            ctx.save();
            ctx.globalAlpha = 0.22 + Math.sin(now / 320) * 0.06;
            const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * pulse);
            g.addColorStop(0, 'rgba(180,240,255,0.35)');
            g.addColorStop(0.55, 'rgba(68,200,255,0.18)');
            g.addColorStop(1, 'rgba(40,120,180,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(120,220,255,0.55)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

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
                ctx.save();
                if (f._consecrationGround) {
                    const pulse = 0.9 + Math.sin(now / 200) * 0.08;
                    ctx.globalAlpha = 0.28 + Math.sin(now / 350) * 0.06;
                    const g2 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * pulse);
                    g2.addColorStop(0, 'rgba(255,240,180,0.45)');
                    g2.addColorStop(0.5, 'rgba(120,220,255,0.22)');
                    g2.addColorStop(1, 'rgba(40,100,160,0)');
                    ctx.fillStyle = g2;
                    ctx.beginPath();
                    ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(180,240,255,0.55)';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 5]);
                    ctx.beginPath();
                    ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else {
                    ctx.fillStyle = f.color.startsWith('#') ? f.color + '44' : f.color;
                    ctx.beginPath();
                    ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        });

        if (typeof window.drawBuildCombatHud === 'function') {
            window.drawBuildCombatHud(ctx, gameInstance);
        }
    };

})();
