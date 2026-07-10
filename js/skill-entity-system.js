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

    function sanitizeSkillDamage(dmg) {
        const n = Number(dmg);
        return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
    }

    function applyDmg(player, monster, dmg, skillDef, g, statusList) {
        if (!monster || monster.hp <= 0) return;
        dmg = sanitizeSkillDamage(dmg);
        if (typeof window.getClassSkillMarkBonus === 'function') {
            const markBonus = window.getClassSkillMarkBonus(monster, skillDef);
            const mult = markBonus && Number.isFinite(markBonus.mult) ? markBonus.mult : 1;
            dmg = sanitizeSkillDamage(dmg * mult);
        }
        if (typeof window.getDeadeyeMarkDamageMultiplier === 'function') {
            const dm = window.getDeadeyeMarkDamageMultiplier(monster, player, skillDef);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(dm) ? dm : 1));
        }
        if (typeof window.getMarkExecuteDamageMultiplier === 'function') {
            const em = window.getMarkExecuteDamageMultiplier(monster, player);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(em) ? em : 1));
        }
        if (typeof window.getCombatStatusDamageMultiplier === 'function') {
            const cm = window.getCombatStatusDamageMultiplier(monster);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(cm) ? cm : 1));
        }
        if (typeof window.getStrikerDamageBonus === 'function') {
            const sm = window.getStrikerDamageBonus(player, monster);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(sm) ? sm : 1));
        }
        if (typeof window.getBuildDamageMultiplier === 'function') {
            const bm = window.getBuildDamageMultiplier(player, monster, skillDef);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(bm) ? bm : 1));
        }
        if (typeof window.getWizardSkillDamageMult === 'function') {
            const wm = window.getWizardSkillDamageMult(player, skillDef, monster);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(wm) ? wm : 1));
        }
        if (skillDef && skillDef.id === 'shadow_arrow' && typeof window.onShadowArrowHit === 'function') {
            const sm = window.onShadowArrowHit(player, monster, (skillDef.entityConfig || {}));
            if (sm && sm !== 1) dmg = sanitizeSkillDamage(dmg * sm);
        }
        if (skillDef && skillDef.id === 'death_coil' && typeof window.onDeathCoilHit === 'function') {
            const dm = window.onDeathCoilHit(player, monster);
            if (dm && dm !== 1) dmg = sanitizeSkillDamage(dmg * dm);
        }
        const defRed = typeof window.getCombatStatusDefenseReduction === 'function'
            ? window.getCombatStatusDefenseReduction(monster) : 0;
        if (defRed > 0) dmg = sanitizeSkillDamage(dmg * (1 + defRed / 100));
        const killed = monster.takeDamage(dmg);
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
        if (killed && player && g && g.player === player && typeof player.processKillRewards === 'function') {
            const isDummy = typeof TrainingDummy !== 'undefined' && monster instanceof TrainingDummy;
            const isMonDummy = typeof MonsterTrainingDummy !== 'undefined' && monster instanceof MonsterTrainingDummy;
            if (!isDummy) player.processKillRewards([monster]);
        }
        if (killed && monster._classSkillMark && typeof window.onPhantomMarkVictimKilled === 'function') {
            window.onPhantomMarkVictimKilled(player, monster, g, null, Date.now());
        }
        if (killed && monster._classSkillMark && typeof window.onWindMarkVictimKilled === 'function') {
            window.onWindMarkVictimKilled(player, monster, g, null, Date.now());
        }
        if (killed && monster._classSkillMark && typeof window.onDeadeyeMarkVictimKilled === 'function') {
            window.onDeadeyeMarkVictimKilled(player, monster, g, null, Date.now());
        }
        if (killed && monster._classSkillMark && typeof window.onMarksmanMarkVictimKilled === 'function') {
            window.onMarksmanMarkVictimKilled(player, monster, g, null, Date.now());
        }
        if (killed && monster.isBoss && typeof window.onDeadeyeBossKill === 'function') {
            window.onDeadeyeBossKill(player, monster, skillDef, g);
        }
        if (killed && monster._classSkillMark && typeof window.onPackRoarMarkKill === 'function') {
            window.onPackRoarMarkKill(player, monster, g);
        }
        if (killed && typeof window.onWarlockKill === 'function') {
            window.onWarlockKill(player);
        }
        if (killed && monster._spreadCurseOnDeath && typeof window.onSpreadCurseDeath === 'function') {
            window.onSpreadCurseDeath(monster, g);
        }
        if (typeof window.onTimelyShotHit === 'function' && skillDef
            && (skillDef.id === 'timely_shot' || skillDef.id === 'timely_shot_plus')) {
            window.onTimelyShotHit(player, monster, false, g, skillDef.entityConfig || {});
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

    function nearestEnemyInCone(px, py, angle, monsters, range, halfAngleRad, exclude) {
        let best = null, bestD = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0 || (exclude && exclude.has(m))) return;
            if (typeof TrainingDummy !== 'undefined' && m instanceof TrainingDummy) return;
            const dx = m.x - px, dy = m.y - py;
            const d = Math.hypot(dx, dy);
            if (d > range || d >= bestD) return;
            let diff = Math.atan2(dy, dx) - angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) <= halfAngleRad) { bestD = d; best = m; }
        });
        return best;
    }

    function getAimPoint(monster) {
        if (!monster) return null;
        if (typeof window.getCombatTargetAimPoint === 'function') {
            return window.getCombatTargetAimPoint(monster);
        }
        return { x: monster.x, y: monster.y };
    }

    function angleToAimPoint(fromX, fromY, monster) {
        const ap = getAimPoint(monster);
        if (!ap) return null;
        return Math.atan2(ap.y - fromY, ap.x - fromX);
    }

    function resolveProjectileTarget(player, monsters, skillDef, c, castOptions) {
        const range = skillDef.range || c.maxRange || 500;
        if (castOptions && castOptions.lockTarget && castOptions.lockTarget.hp > 0) {
            return castOptions.lockTarget;
        }
        if (c.lockTargetCenter !== false && shouldUseArcherCenterLock(player, skillDef, c)) {
            if (typeof window.pickArcherAutoLockTarget === 'function') {
                return window.pickArcherAutoLockTarget(player, monsters, range, {
                    gameInstance: player && player.gameInstance,
                    preferFacingCone: skillDef.type === 'basic' || skillDef.slotType === 'basic'
                });
            }
        }
        return nearestEnemy(player, monsters, range);
    }

    function snapPlayerAngleToTarget(player, target) {
        if (!player || !target) return;
        const ang = angleToAimPoint(player.x, player.y, target);
        if (ang != null) player.angle = ang;
    }

    function applyProjectileMarkOnHit(monster, c, skillDef, player, now, g) {
        if (!monster || !c || !c.markTarget) return;
        if (typeof window.applyClassSkillMarkOnMonster === 'function') {
            window.applyClassSkillMarkOnMonster(monster, {
                durationMs: c.markDurationMs || 8000,
                damageBonus: c.markDmgBonus != null ? c.markDmgBonus : 15,
                critBonus: c.markCritBonus || 0,
                critDmgBonus: c.markCritDmgBonus || 0,
                windDamageBonus: c.markWindDmgBonus || 0,
                phantomEchoDamageBonus: c.markPhantomDmgBonus || 0,
                phantomConfuseChance: c.phantomConfuseChance || 0,
                phantomConfuseRadius: c.phantomConfuseRadius || 0,
                ownerDamageBonus: c.markOwnerDamageBonus,
                ownerCritDmgBonus: c.markOwnerCritDmgBonus,
                executeThreshold: c.markExecuteThreshold,
                executeMultiplier: c.markExecuteMultiplier,
                owner: player,
                markId: skillDef && skillDef.id
            }, skillDef, now);
        } else {
            monster._classSkillMark = {
                expireTime: now + (c.markDurationMs || 8000),
                damageBonus: c.markDmgBonus != null ? c.markDmgBonus : 15,
                critBonus: c.markCritBonus || 0,
                name: skillDef && skillDef.name,
                owner: player
            };
        }
        floatText(g, monster.x, monster.y - 16, '标记!', '#ffcc44');
        if (c.petFocusMark && g && typeof window.rallyPetsToMark === 'function') {
            window.rallyPetsToMark(player, monster, g, c.petMarkDamageBonus || 30);
        }
        if (g && typeof window.playClassSkillVfx === 'function' && player) {
            window.playClassSkillVfx(player, skillDef, g, {
                markApplied: true,
                primaryTarget: monster,
                hitTargets: [monster],
                hit: true
            });
        }
    }

    function spawnFieldFromHit(player, skillDef, fieldCfg, x, y, g, now) {
        if (!fieldCfg || !player) return;
        const st = ensureState(g);
        st.fields.push({
            x, y,
            radius: fieldCfg.fieldRadius || 60,
            expireTime: now + (fieldCfg.fieldDurationMs || 4000),
            tickIntervalMs: fieldCfg.tickIntervalMs || 1000,
            lastTick: now,
            triggerType: 'periodic',
            damage: 0,
            statusOnTick: fieldCfg.statusOnTick,
            owner: player,
            skillDef,
            entityConfig: fieldCfg,
            color: fieldCfg.color || '#55dd44'
        });
    }

    function spawnWindBlades(player, g, monsters, bladeCfg, skillDef, now) {
        if (!player || !g || !bladeCfg) return;
        const st = ensureState(g);
        const count = bladeCfg.count || 3;
        const spread = (bladeCfg.spreadAngleDeg || 20) * Math.PI / 180;
        const baseAng = bladeCfg.angle != null ? bladeCfg.angle : player.angle;
        const ox = bladeCfg.originX != null ? bladeCfg.originX : player.x;
        const oy = bladeCfg.originY != null ? bladeCfg.originY : player.y;
        const dmgMult = bladeCfg.damageMultiplier || 0.5;
        const maxRange = bladeCfg.maxRange || 380;
        const speed = bladeCfg.speed || 750;
        const refDef = skillDef || { id: 'wind_blade', name: '风刃', entityConfig: { damageMultiplier: dmgMult } };
        const refEc = refDef.entityConfig || {};
        const bladeRadius = bladeCfg.collisionRadius || refEc.collisionRadius || 14;
        const bladeEc = {
            damageMultiplier: dmgMult,
            collisionRadius: bladeRadius,
            pierceCount: refEc.pierceCount != null ? refEc.pierceCount : 99,
            coneTrackDeg: refEc.coneTrackDeg || 18
        };
        let markTarget = bladeCfg.markTarget || null;
        if (!markTarget && (bladeCfg.homingToMark || bladeCfg.fromPhantomEcho)
            && typeof window.findWindrunnerMarkTarget === 'function') {
            markTarget = window.findWindrunnerMarkTarget(player, monsters, now);
        }
        const echoBlade = !!bladeCfg.fromPhantomEcho;
        const useHoming = !!(markTarget && markTarget.hp > 0 && !echoBlade);
        for (let i = 0; i < count; i++) {
            let ang = baseAng;
            let trajectory = 'cone_track';
            let targetRef = null;
            let guaranteedHit = false;
            if (useHoming) {
                const ap = getAimPoint(markTarget);
                ang = ap ? Math.atan2(ap.y - oy, ap.x - ox) : Math.atan2(markTarget.y - oy, markTarget.x - ox);
                trajectory = 'homing';
                targetRef = markTarget;
                guaranteedHit = true;
            } else if (echoBlade && markTarget && markTarget.hp > 0) {
                const ap = getAimPoint(markTarget);
                ang = ap ? Math.atan2(ap.y - oy, ap.x - ox) : Math.atan2(markTarget.y - oy, markTarget.x - ox);
            } else {
                const offset = count > 1 ? spread * (i / (count - 1) - 0.5) : 0;
                ang = baseAng + offset;
            }
            st.projectiles.push({
                x: ox, y: oy,
                angle: ang,
                initialAngle: ang,
                speed,
                maxRange,
                traveled: 0,
                radius: bladeRadius,
                pierceLeft: bladeEc.pierceCount != null ? bladeEc.pierceCount : 99,
                damage: calcDmg(player, refDef, bladeEc, dmgMult),
                skillDef: refDef,
                player,
                trajectory,
                targetRef,
                guaranteedHit,
                coneTrackDeg: useHoming ? 0 : 12,
                color: bladeCfg.fromPhantomEcho ? '#9944ff' : '#66eedd',
                visualVariant: 'wind_blade',
                hitIds: new Set(),
                spawnTime: now,
                active: true,
                hideVisual: !bladeCfg.fromPhantomEcho,
                _fromWindStepBlade: !!(skillDef && skillDef.id === 'wind_step'),
                _fromPhantomEcho: !!bladeCfg.fromPhantomEcho,
                _cloneDamagePercent: bladeCfg.echoDamagePercent,
                entityConfig: bladeEc
            });
        }
        if (useHoming && g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 36, '风刃追踪!', '#66eedd', 800, 13);
        }
    }

    window.spawnWindrunnerWindBlades = spawnWindBlades;

    window.resolveWindMarkExplosion = function resolveWindMarkExplosion(player, center, g, monsters, opts, now) {
        if (!player || !center || !opts) return;
        const t = now != null ? now : Date.now();
        const radius = opts.radius || 90;
        const skillDef = opts.skillDef || { id: 'wind_mark', name: '风之印记' };
        const ec = { damageMultiplier: opts.dmgMult || 1.8 };
        const dmg = calcDmg(player, skillDef, ec, ec.damageMultiplier);
        const list = monsters || (g && typeof g.getCurrentSceneTargets === 'function' ? g.getCurrentSceneTargets() : []);
        const cx = center.x;
        const cy = center.y;
        (list || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - cx, m.y - cy) > radius + (m.size || 20) * 0.5) return;
            applyDmg(player, m, dmg, skillDef, g);
            const kb = opts.knockback || 45;
            const dx = m.x - cx;
            const dy = m.y - cy;
            const dist = Math.hypot(dx, dy) || 1;
            m.x += (dx / dist) * kb;
            m.y += (dy / dist) * kb;
        });
        floatText(g, cx, cy - 20, opts.label || '风爆!', '#66eedd');
        if (g && typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(cx, cy, { isRanged: true, isCrit: false, sourceX: player.x, sourceY: player.y });
        }
        if (g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('freeze_ring', cx, cy, { radius, duration: 480, delayMs: 0 });
        }
    };

    function rollSkillCrit(player, c, monster) {
        if (!player) return false;
        if (c && c.guaranteedCrit) return true;
        let critRate = typeof window.getPlayerEffectiveCritRate === 'function'
            ? window.getPlayerEffectiveCritRate(player)
            : (player.baseCritRate || 0);
        if (monster && typeof window.getClassSkillMarkBonus === 'function') {
            critRate += window.getClassSkillMarkBonus(monster, null).crit || 0;
        }
        return Math.random() * 100 < critRate;
    }

    function applySkillCritDamage(player, dmg, isCrit, c, monster) {
        if (!isCrit || typeof applyCritDamageMultiplier !== 'function') return dmg;
        let extra = (c && c.critDmgBonus) || 0;
        if (monster && typeof window.getClassSkillMarkBonus === 'function') {
            extra += window.getClassSkillMarkBonus(monster, null).critDmg || 0;
        }
        if (typeof window.getDeadeyeMarkCritDmgBonus === 'function') {
            extra += window.getDeadeyeMarkCritDmgBonus(monster, player);
        }
        if (typeof window.getPlayerPrecisionCritDmgBonus === 'function') {
            extra += window.getPlayerPrecisionCritDmgBonus(player);
        }
        if (typeof window.getBreathHoldSelfCritDmg === 'function') {
            extra += window.getBreathHoldSelfCritDmg(player);
        }
        if (typeof window.getBreathHoldTeamCritDmgBonus === 'function' && player && player.gameInstance) {
            extra += window.getBreathHoldTeamCritDmgBonus(player, player.gameInstance);
        }
        return applyCritDamageMultiplier(dmg, player.baseCritDamage, 1 + extra / 100);
    }

    function applyDefenseIgnoreBonus(dmg, c) {
        const ignore = c && c.ignoreDefensePercent;
        if (!ignore) return dmg;
        return Math.max(1, Math.floor(dmg * (1 + ignore / 100 * 0.35)));
    }

    function applyProjectileHitEffects(player, monster, p, g, now) {
        const ec = entityCfg(p.skillDef);
        const c = Object.assign({}, (ec && ec.entityConfig) || {}, p.entityConfig || {});
        if (p.precisionCritDmgBonus) {
            c.critDmgBonus = (c.critDmgBonus || 0) + p.precisionCritDmgBonus;
        }
        let dmg = p.damage;
        if (p._fromPhantomClone && p.player && typeof window.calcPhantomCloneDamage === 'function') {
            dmg = window.calcPhantomCloneDamage(p.player, p._cloneDamagePercent || 60);
        }
        if (p._fromPhantomEcho && typeof window.getPhantomEchoMarkDamageMultiplier === 'function') {
            const em = window.getPhantomEchoMarkDamageMultiplier(monster, player, p);
            dmg = sanitizeSkillDamage(dmg * (Number.isFinite(em) ? em : 1));
        }
        dmg = sanitizeSkillDamage(dmg);
        dmg = applyDefenseIgnoreBonus(dmg, c);

        const skillId = p.skillDef && p.skillDef.id;
        if (skillId === 'death_gaze' && monster.maxHp > 0) {
            const threshold = c.executeHpThreshold != null ? c.executeHpThreshold : 0.3;
            const execMult = c.executeDamageMult != null ? c.executeDamageMult : 1.5;
            if (monster.hp / monster.maxHp < threshold) {
                dmg = Math.max(1, Math.floor(dmg * execMult));
                if (g && typeof g.addFloatingText === 'function') {
                    g.addFloatingText(monster.x, monster.y - 24, '斩杀!', '#ff2244', 800, 16);
                }
            }
        }

        const hpBefore = monster.hp;
        const isCrit = rollSkillCrit(player, c, monster);
        if (isCrit) dmg = applySkillCritDamage(player, dmg, true, c, monster);
        applyDmg(player, monster, dmg, p.skillDef, g, p.statusOnHit);
        const killed = monster.hp <= 0 && hpBefore > 0;

        if (typeof window.onWindrunnerWindBladeMarkHit === 'function') {
            window.onWindrunnerWindBladeMarkHit(player, monster, p.skillDef, p, g, now);
        }
        if (c.resourcePerHit && typeof window.grantSkillResource === 'function') {
            window.grantSkillResource(player, c.resourcePerHit);
        }
        if (isCrit && typeof window.onPlayerCritResource === 'function') {
            window.onPlayerCritResource(player);
        }
        if (isCrit && p.skillDef && p.skillDef.id === 'aimed_shot'
            && typeof window.onMarksmanAimedShotCrit === 'function' && !p._critRefundDone) {
            p._critRefundDone = true;
            window.onMarksmanAimedShotCrit(player, c.critRefundAmmo || 5);
        }
        applyProjectileMarkOnHit(monster, c, p.skillDef, player, now, g);
        if (p.skillDef && p.skillDef.id === 'weakness_mark'
            && typeof window.onMarksmanWeaknessMarkHit === 'function') {
            window.onMarksmanWeaknessMarkHit(player, g);
        }
        if (p.skillDef && p.skillDef.id === 'weakness_mark_de'
            && typeof window.onDeadeyeWeaknessMarkHit === 'function') {
            window.onDeadeyeWeaknessMarkHit(player, g);
        }
        if (isCrit && typeof window.onDeadeyeAllyCritMarkedTarget === 'function') {
            window.onDeadeyeAllyCritMarkedTarget(player, monster, now);
        }
        if (p.skillDef && typeof window.isMarksmanBasicAttackSkill === 'function'
            && window.isMarksmanBasicAttackSkill(p.skillDef)
            && typeof window.onMarksmanBasicAttackHit === 'function') {
            window.onMarksmanBasicAttackHit(player, g);
        }
        if (c.spawnFieldOnHit) {
            spawnFieldFromHit(player, p.skillDef, c.spawnFieldOnHit, monster.x, monster.y, g, now);
        }
        return { killed, isCrit };
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
    function easeOutBackStep(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    window.startPlayerBackstepShot = function startPlayerBackstepShot(player, g, opts, now) {
        if (!player) return 0;
        const t = now != null ? now : Date.now();
        const dist = (opts && opts.distance) || 100;
        const durationMs = (opts && opts.durationMs) || 320;
        const ang = (opts && opts.angle != null) ? opts.angle : player.angle;
        const end = clampInRoom(g,
            player.x - Math.cos(ang) * dist,
            player.y - Math.sin(ang) * dist);
        player._backstepShot = {
            startX: player.x,
            startY: player.y,
            endX: end.x,
            endY: end.y,
            startTime: t,
            durationMs,
            peakHeight: (opts && opts.peakHeight) || 32,
            angle: ang,
            invincibleMs: (opts && opts.invincibleMs != null) ? opts.invincibleMs : (durationMs + 80)
        };
        player._backstepVisualOffset = 0;
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, t + player._backstepShot.invincibleMs);
        player.isCastingSkill = true;
        player.vx = 0;
        player.vy = 0;
        return durationMs;
    };

    window.updatePlayerBackstepShot = function updatePlayerBackstepShot(player, now) {
        const bs = player && player._backstepShot;
        if (!bs) return false;
        const t = clamp01Pierce((now - bs.startTime) / bs.durationMs);
        const ease = easeOutBackStep(t);
        player.x = bs.startX + (bs.endX - bs.startX) * ease;
        player.y = bs.startY + (bs.endY - bs.startY) * ease;
        player._backstepVisualOffset = bs.peakHeight * Math.sin(t * Math.PI);
        player.angle = bs.angle;
        player.vx = 0;
        player.vy = 0;
        if (t >= 1) {
            player.x = bs.endX;
            player.y = bs.endY;
            player._backstepVisualOffset = 0;
            delete player._backstepShot;
            player.isCastingSkill = false;
            return false;
        }
        return true;
    };

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

    function resolveLeapLanding(player, c, g, monsters, castOptions) {
        const maxRange = c.leapRange || 200;
        const impactR = c.range || c.leapSlamRadius || 90;
        const manualGroundAim = castOptions && castOptions._manualGroundAim && castOptions.groundPoint;

        if (!manualGroundAim && c.autoLockOnTap !== false
            && typeof window.pickBestLeapSlamGroundPoint === 'function') {
            const pick = window.pickBestLeapSlamGroundPoint(player, monsters, maxRange, impactR);
            return clampInRoom(g, pick.x, pick.y);
        }

        if (castOptions && castOptions.groundPoint) {
            const gp = castOptions.groundPoint;
            const dist = Math.hypot(gp.x - player.x, gp.y - player.y);
            if (dist > maxRange) {
                const ang = Math.atan2(gp.y - player.y, gp.x - player.x);
                return clampInRoom(g,
                    player.x + Math.cos(ang) * maxRange,
                    player.y + Math.sin(ang) * maxRange);
            }
            return clampInRoom(g, gp.x, gp.y);
        }
        if (c.autoLockOnTap !== false && typeof window.pickBestLeapSlamGroundPoint === 'function') {
            const pick = window.pickBestLeapSlamGroundPoint(player, monsters, maxRange, impactR);
            return clampInRoom(g, pick.x, pick.y);
        }
        const ang = (castOptions && castOptions.angle != null)
            ? castOptions.angle
            : (typeof window.pickNearestEnemyAngle === 'function'
                ? window.pickNearestEnemyAngle(player, monsters, maxRange)
                : player.angle);
        const dist = Math.min(c.leapDistance || maxRange * 0.45, maxRange);
        return clampInRoom(g,
            player.x + Math.cos(ang) * dist,
            player.y + Math.sin(ang) * dist);
    }

    function startLeapSlam(player, endX, endY, skillDef, ec, g, monsters, now) {
        const c = ec.entityConfig;
        const ang = Math.atan2(endY - player.y, endX - player.x);
        player.angle = ang;
        player._leapSlam = {
            startX: player.x,
            startY: player.y,
            endX,
            endY,
            startTime: now,
            durationMs: c.leapDurationMs || 400,
            peakHeight: c.leapPeakHeight || 58,
            skillDef,
            ec,
            g,
            monsters,
            angle: ang
        };
        player._leapSlamVisualOffset = 0;
        player.isCastingSkill = true;
        if (c.superArmor) player._chargeSuperArmor = true;
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, now + (c.leapDurationMs || 400) + 80);
        player.vx = 0;
        player.vy = 0;
    }

    function finishLeapSlamImpact(player, ls, now) {
        player.x = ls.endX;
        player.y = ls.endY;
        player.angle = ls.angle;
        player._leapSlamVisualOffset = 0;
        player.isCastingSkill = false;
        if (!player.isDashing) player._chargeSuperArmor = false;
        execInstant(player, ls.skillDef, ls.ec, ls.g, ls.monsters, now, null, { skipLeap: true, leapLand: true });
    }

    window.updatePlayerLeapSlam = function updatePlayerLeapSlam(player, now) {
        const ls = player && player._leapSlam;
        if (!ls) return false;
        const t = clamp01Pierce((now - ls.startTime) / ls.durationMs);
        const ease = t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2;
        player.x = ls.startX + (ls.endX - ls.startX) * ease;
        player.y = ls.startY + (ls.endY - ls.startY) * ease;
        player._leapSlamVisualOffset = ls.peakHeight * Math.sin(t * Math.PI);
        player.angle = ls.angle;
        player.vx = 0;
        player.vy = 0;
        if (t >= 1) {
            finishLeapSlamImpact(player, ls, now);
            delete player._leapSlam;
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

    function getSkillWindupMs(player, skillDef, c) {
        if (typeof window.getEffectiveSkillWindupMs === 'function') {
            return window.getEffectiveSkillWindupMs(player, skillDef, c);
        }
        return c.windupMs || 0;
    }

    function applyCastAimAngle(player, castOptions, monsters, skillDef, c) {
        if (castOptions && castOptions.angle != null) {
            player.angle = castOptions.angle;
            return;
        }
        const range = c.range || skillDef.range || 80;
        if (c.shape === 'fissure' || c.shape === 'pierce') {
            if (typeof window.pickBestLineAngle === 'function') {
                player.angle = window.pickBestLineAngle(
                    player, monsters, range, (c.pierceWidth || 40) * 2
                );
            }
        } else if (c.shape === 'cone' && c.autoLockOnTap !== false) {
            if (typeof window.pickBestConeAngle === 'function') {
                player.angle = window.pickBestConeAngle(
                    player, monsters, range, c.halfAngleDeg || 45
                );
            }
        }
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
            _consecrationGround: true,
            _ruinGround: !!cfg._ruinGround
        });
    }

    function applyAttackSpeedOnHit(player, c, skillDef, hitCount, now) {
        if (!player || !c.attackSpeedOnHitPercent || hitCount <= 0) return;
        const per = c.attackSpeedOnHitPercent;
        const maxStacks = c.attackSpeedOnHitMaxStacks || 5;
        const dur = c.attackSpeedOnHitDurationMs || 4000;
        const stacks = Math.min(maxStacks, hitCount);
        const buffId = 'skill_' + skillDef.id + '_as_stack';
        player.buffs = player.buffs || [];
        player.buffs = player.buffs.filter(b => b.id !== buffId);
        player.buffs.push({
            name: skillDef.name + '·狂怒',
            id: buffId,
            expireTime: now + dur,
            effects: { attackSpeedPercent: per * stacks },
            hudVisible: true,
            iconKey: 'attackSpeed'
        });
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    function applyAllyProtectionOnLand(player, c, skillDef, g, now) {
        const ap = c.allyProtectionOnLand;
        if (!player || !ap) return;
        const dur = ap.durationMs || 6000;
        const dr = ap.drPercent || 20;
        const buffId = 'skill_' + skillDef.id + '_protect';
        player.buffs = player.buffs || [];
        player.buffs = player.buffs.filter(b => b.id !== buffId);
        player.buffs.push({
            name: skillDef.name + '·守护',
            id: buffId,
            expireTime: now + dur,
            effects: { damageReduction: dr },
            hudVisible: true
        });
        player._damageRedirectField = {
            expireTime: now + dur,
            redirectPercent: ap.redirectPercent || 30,
            selfDrPercent: dr,
            radius: c.range || skillDef.aoeRadius || 90,
            x: player.x,
            y: player.y,
            healAllyPerSecPercent: ap.healAllyPerSecPercent || 0,
            lastHealTick: now
        };
        if (typeof player.updateStats === 'function') player.updateStats();
        floatText(g, player.x, player.y - 32, `减伤${dr}% · 承伤${ap.redirectPercent || 30}%`, '#ddaa44');
    }

    function applyLeapSlamLandingExtras(player, c, skillDef, g, monsters, now, targets) {
        if (!player || !c) return;
        const st = ensureState(g);
        if (c.spawnConsecrationOnLand) {
            spawnConsecrationField(st, player, skillDef, player.x, player.y, c.spawnConsecrationOnLand, now);
        }
        if (c.attackSpeedOnHitPercent && targets && targets.length > 0) {
            applyAttackSpeedOnHit(player, c, skillDef, targets.length, now);
        }
        if (c.allyProtectionOnLand) {
            applyAllyProtectionOnLand(player, c, skillDef, g, now);
        }
    }

    function detonateMarksOnTargets(targets, player, skillDef, g, multPerStack, now) {
        if (!targets || !multPerStack || typeof window.detonateDestroyMarks !== 'function') return;
        const seen = new Set();
        targets.forEach(m => {
            if (!m || seen.has(m)) return;
            seen.add(m);
            window.detonateDestroyMarks(m, player, skillDef, g, multPerStack, now);
        });
    }

    function spawnFissureGround(st, player, skillDef, c, g, now) {
        if (!st || !player || !c.spawnFissureGround) return;
        const range = c.range || 300;
        const steps = c.fissureGroundSteps || 8;
        const cfg = c.spawnFissureGround;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const fx = player.x + Math.cos(player.angle) * range * t;
            const fy = player.y + Math.sin(player.angle) * range * t;
            spawnConsecrationField(st, player, skillDef, fx, fy, cfg, now);
        }
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
        if (c.detonateMarksOnEnd != null && typeof window.detonateDestroyMarks === 'function') {
            const endR = c.endExplodeRadius || 100;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - ch.player.x, m.y - ch.player.y) <= endR + 60) {
                    window.detonateDestroyMarks(m, ch.player, ch.skillDef, g, c.detonateMarksOnEnd, now);
                }
            });
        }
        if (c.spawnHolyFieldOnEnd && g) {
            const st = ensureState(g);
            spawnConsecrationField(st, ch.player, ch.skillDef, ch.player.x, ch.player.y,
                c.spawnHolyFieldOnEnd, Date.now());
        }
        if (c.endAllyDrPercent && g && g._skillEntities) {
            const endR = c.endExplodeRadius || 100;
            const dur = c.endAllyDrDurationMs || 4000;
            (g._skillEntities.summons || []).forEach(s => {
                if (!s || s.owner !== ch.player || s.hp <= 0) return;
                if (Math.hypot(s.x - ch.player.x, s.y - ch.player.y) > endR) return;
                s._guardDrPercent = c.endAllyDrPercent;
                s._guardShieldUntil = now + dur;
            });
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
        } else if (c.autoLockOnTap !== false
            && (c.trajectory === 'lob_ground' || (c.explodeRadius && c.explodeRadius > 0))) {
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

    /** 弓箭手弹道默认锁定敌人中心，便于箭矢视觉与命中对齐 */
    function shouldUseArcherCenterLock(player, skillDef, c) {
        if (c && c.lockTargetCenter === false) return false;
        if (c && c.lockTargetCenter) return true;
        return shouldHideProjectileVisual(player, skillDef, c);
    }

    /** 弓箭手/法师职业技能由 VFX 层表现，不再绘制默认色块弹道 */
    function shouldHideProjectileVisual(player, skillDef, c) {
        if (c && c.hideVisual) return true;
        if (!skillDef || !player || !player.classData) return false;
        const isClassProjectile = skillDef.entityType === 'projectile'
            && (skillDef.category === 'class' || skillDef.type === 'basic' || skillDef.slotType === 'basic');
        if (!isClassProjectile) return false;
        const base = typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId(player.classData) : null;
        return base === 'archer' || base === 'mage';
    }

    window.shouldHideClassProjectileVisual = shouldHideProjectileVisual;

    function spawnProjectile(player, skillDef, ec, g, monsters, now, castOptions) {
        let c = ec.entityConfig;
        if ((skillDef.id === 'wind_blade' || skillDef.id === 'phantom_echo_blade' || c.visualVariant === 'wind_blade')
            && typeof window.applyWindBladeProjectileMods === 'function') {
            c = window.applyWindBladeProjectileMods(player, c, now);
        }
        const st = ensureState(g);
        const isLobGround = c.trajectory === 'lob_ground';
        let target = isLobGround ? null : resolveProjectileTarget(player, monsters, skillDef, c, castOptions);
        let angle = player.angle;
        const lockCenter = shouldUseArcherCenterLock(player, skillDef, c);
        if (target) {
            const aimAng = angleToAimPoint(player.x, player.y, target);
            if (aimAng != null) angle = aimAng;
            if (lockCenter) snapPlayerAngleToTarget(player, target);
        }

        let trajectory = c.trajectory || 'straight';
        if (c.guaranteedHit && target) trajectory = 'homing';
        else if (trajectory === 'straight_toward_target' && target) trajectory = 'straight';

        const count = c.projectileCount || 1;
        const spread = (c.spreadAngleDeg || 0) * Math.PI / 180;
        const windupMs = getSkillWindupMs(player, skillDef, c);
        let backstepDelayMs = 0;
        if (c.preCast === 'backstep' && typeof window.startPlayerBackstepShot === 'function') {
            backstepDelayMs = window.startPlayerBackstepShot(player, g, {
                distance: c.backstepDistance || 100,
                durationMs: c.backstepDurationMs || 320,
                peakHeight: c.backstepPeakHeight || 32,
                invincibleMs: c.backstepInvincibleMs,
                angle: player.angle
            }, now);
        }
        if (windupMs > 0) {
            setCastBar(player, skillDef, now, now + windupMs + backstepDelayMs, '#ffaa44');
        }
        for (let i = 0; i < count; i++) {
            const offset = (count > 1 && spread > 0) ? spread * (i / (count - 1) - 0.5) : 0;
            const projAngle = angle + offset;
            const staggerMs = (c.projectileStaggerMs || 0) * i;
            const spawnAt = now + windupMs + backstepDelayMs + staggerMs;
            const precisionBonus = player._pendingPrecisionCritBonus || 0;
            const shotDmg = calcDmg(player, skillDef, c, c.damageMultiplier);
            const base = {
                x: player.x, y: player.y,
                angle: projAngle,
                initialAngle: projAngle,
                spreadOffset: offset,
                speed: c.speed || 400,
                maxRange: c.maxRange || 600,
                traveled: 0,
                radius: c.collisionRadius || 20,
                pierceLeft: c.pierceCount != null ? c.pierceCount : 0,
                damage: shotDmg,
                skillDef, player,
                trajectory,
                targetRef: target,
                lockTargetCenter: lockCenter,
                guaranteedHit: !!c.guaranteedHit,
                coneTrackDeg: c.coneTrackDeg,
                entityConfig: c,
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
                spawnTime: spawnAt,
                active: spawnAt <= now,
                hideVisual: shouldHideProjectileVisual(player, skillDef, c),
                spawnFromOwner: c.preCast === 'backstep',
                recalcAngleOnSpawn: c.preCast === 'backstep',
                spawnTrapOnLand: c.spawnTrapOnLand || null,
                precisionCritDmgBonus: precisionBonus
            };
            if (precisionBonus > 0) {
                base.entityConfig = Object.assign({}, c, { critDmgBonus: (c.critDmgBonus || 0) + precisionBonus });
            }
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
        if (player._pendingPrecisionCritBonus) {
            player._pendingPrecisionCritBonus = 0;
        }
        if (typeof window.recordPhantomEchoAction === 'function') {
            window.recordPhantomEchoAction(player, {
                skillDef: skillDef,
                entityConfig: c,
                angle: angle,
                targetRef: target,
                trajectory: trajectory,
                speed: c.speed || 400,
                maxRange: c.maxRange || 600,
                pierceCount: c.pierceCount != null ? c.pierceCount : 0,
                collisionRadius: c.collisionRadius || 20,
                echoReplayDelayMs: c.echoReplayDelayMs,
                echoDamagePercent: c.echoDamagePercent
            }, g, now);
        }
        floatText(g, player.x, player.y - 20, skillDef.name, '#ffaa44');
        if (c._windSynergyActive) {
            floatText(g, player.x, player.y - 36, '疾风强化!', '#66eedd');
        }
        return true;
    }

    function spawnSummon(player, skillDef, ec, g, monsters, now) {
        const c = ec.entityConfig;
        const st = ensureState(g);

        if (c.undeadLegion && typeof window.spendAllSoulShardsForLegion === 'function') {
            const shardCount = window.spendAllSoulShardsForLegion(player);
            if (shardCount <= 0) {
                floatText(g, player.x, player.y, '无灵魂碎片', '#ff6666');
                return false;
            }
            const weights = c.legionWeights || {
                skeleton_warrior: 40, skeleton_mage: 30, specter: 20, bone_dragon: 10
            };
            const units = Object.keys(weights);
            const inh = c.inheritStats || {};
            let spawned = 0;
            for (let i = 0; i < shardCount && spawned < (c.maxCount || 6); i++) {
                const roll = Math.random() * 100;
                let acc = 0;
                let unitId = units[0];
                for (const u of units) {
                    acc += weights[u] || 0;
                    if (roll <= acc) { unitId = u; break; }
                }
                const ang = Math.random() * Math.PI * 2;
                const off = (c.spawnOffset || 50) + i * 14;
                const pos = clampInRoom(g, player.x + Math.cos(ang) * off, player.y + Math.sin(ang) * off);
                st.summons.push({
                    x: pos.x, y: pos.y,
                    hp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.35))),
                    maxHp: Math.max(1, Math.floor(player.maxHp * (inh.hp || 0.35))),
                    attack: Math.max(1, Math.floor(baseAtk(player) * (inh.attack || 0.42))),
                    defense: Math.floor((player.baseDefense || 5) * (inh.defense || 0.12)),
                    owner: player, unitId: unitId,
                    aiType: unitId.includes('mage') ? 'ranged_chase' : 'melee_chase',
                    attackIntervalMs: 1000,
                    lastAttack: 0,
                    expireTime: now + (c.durationMs || 30000),
                    size: c.size || 22,
                    color: c.color || '#aaaacc',
                    skillDef, vx: 0, vy: 0,
                    isUndead: true
                });
                spawned++;
            }
            floatText(g, player.x, player.y - 24, '亡灵军团×' + spawned, '#8844aa');
            return true;
        }

        if (c.beastPackCommand && typeof window.tryBeastPackCommand === 'function') {
            return window.tryBeastPackCommand(player, skillDef, ec, g, monsters, now);
        }

        if (c.pounceCommand && !c.skipPounceCommand
            && typeof window.maintainPetCap === 'function') {
            const unitId = c.summonUnitId || 'wolf_pet';
            const maxCount = c.maxCount || 2;
            const capOpts = typeof window.buildPetCapOpts === 'function'
                ? window.buildPetCapOpts(c, { unitId: unitId })
                : { unitId: unitId, maxCount: maxCount, durationMs: c.durationMs };
            const result = window.maintainPetCap(player, g, capOpts, now, skillDef);
            if (result.atCap && typeof window.tryWolfPounceCommand === 'function') {
                if (result.refreshed > 0 && typeof g.addFloatingText === 'function') {
                    g.addFloatingText(player.x, player.y - 28, '兽群刷新!', '#aaddff', 800, 13);
                }
                return window.tryWolfPounceCommand(player, skillDef, ec, g, monsters, now);
            }
            if (result.spawned > 0 || result.refreshed > 0) {
                floatText(g, player.x, player.y - 20, skillDef.name, '#aaddff');
                return true;
            }
            return true;
        }

        if (c.summonUnitId && c.capAndRefresh !== false
            && typeof window.maintainPetCap === 'function') {
            const capOpts = typeof window.buildPetCapOpts === 'function'
                ? window.buildPetCapOpts(c, { unitId: c.summonUnitId })
                : { unitId: c.summonUnitId, maxCount: c.maxCount || 1 };
            const result = window.maintainPetCap(player, g, capOpts, now, skillDef);
            if (result.spawned > 0 || result.refreshed > 0) {
                floatText(g, player.x, player.y - 20,
                    result.refreshed > 0 ? '宠物刷新!' : skillDef.name, '#aaddff');
            }
            return true;
        }

        const existing = st.summons.filter(s => s.owner === player && s.unitId === c.summonUnitId);
        const maxCount = c.maxCount || 1;
        if (existing.length >= maxCount) {
            existing.sort((a, b) => a.expireTime - b.expireTime);
            existing[0].expireTime = 0;
        }

        const aliveCount = st.summons.filter(s => s.owner === player && s.unitId === c.summonUnitId && s.hp > 0).length;
        const spawnPerCast = c.spawnPerCast != null
            ? c.spawnPerCast
            : Math.max(1, maxCount - aliveCount);
        const inh = c.inheritStats || {};
        const permanent = !!(c.permanent || c.durationMs === 0);
        const expireAt = permanent ? Number.MAX_SAFE_INTEGER : now + (c.durationMs || 20000);

        for (let n = 0; n < spawnPerCast; n++) {
            if (st.summons.filter(s => s.owner === player && s.unitId === c.summonUnitId && s.hp > 0).length >= maxCount) break;
            const ang = Math.random() * Math.PI * 2;
            const off = (c.spawnOffset || 50) + n * 12;
            const pos = clampInRoom(g, player.x + Math.cos(ang) * off, player.y + Math.sin(ang) * off);
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
                expireTime: expireAt,
                size: c.size || 20,
                color: c.color || '#888888',
                statusOnHit: c.statusOnHit,
                skillDef, vx: 0, vy: 0,
                tauntRadius: c.tauntRadius || 0,
                isGhost: !!c.isGhost,
                bleedDmgPerSecMult: c.bleedDmgPerSecMult
            });
        }

        if (c.ownerDamageBonusPercent && !permanent) {
            player.buffs = player.buffs || [];
            player.buffs.push({
                id: 'summon_bonus_' + skillDef.id,
                name: skillDef.name,
                expireTime: now + (c.durationMs || 20000),
                effects: { attackPercent: c.ownerDamageBonusPercent }
            });
        }
        floatText(g, player.x, player.y - 20, skillDef.name, '#aaddff');
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
            } else if (c.autoLockOnTap !== false && typeof window.pickBestAoeGroundPoint === 'function') {
                const pick = window.pickBestAoeGroundPoint(
                    player, monsters,
                    skillDef.range || 220,
                    c.fieldRadius || skillDef.aoeRadius || 80
                );
                fx = pick.x;
                fy = pick.y;
            } else {
                const t = nearestEnemy(player, monsters, skillDef.range || 220);
                if (t) { fx = t.x; fy = t.y; }
            }
        } else if (c.spawnAtCaster) {
            fx = player.x; fy = player.y;
        }
        const clampedField = clampInRoom(g, fx, fy);
        fx = clampedField.x;
        fy = clampedField.y;

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

        if ((c.triggerType === 'proximity_mine' || c.triggerType === 'hunter_net') && c.maxCount) {
            const mineFields = st.fields.filter(
                f => f.owner === player && f.triggerType === c.triggerType
                    && f.skillDef && f.skillDef.id === skillDef.id
            );
            if (mineFields.length >= c.maxCount) {
                mineFields.sort((a, b) => a.expireTime - b.expireTime);
                mineFields[0].expireTime = 0;
            }
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
            struck: false,
            spawnTime: now,
            _arrowsSpawned: 0
        };
        st.fields.push(field);
        if (c.spawnPhantomCount && typeof window.spawnVoidStormPhantoms === 'function') {
            window.spawnVoidStormPhantoms(player, g, skillDef, c, now);
        }
        if (skillDef.id === 'void_storm' && player) {
            player._voidStormActiveUntil = now + (c.fieldDurationMs || 8000);
        }
        if (skillDef.id === 'phantom_storm' && player) {
            player._phantomStormActiveUntil = now + (c.fieldDurationMs || 6000);
        }
        if (c.invincibleDuringField && player) {
            player.buffs = player.buffs || [];
            const stormBuffId = 'phantom_storm_' + skillDef.id;
            player.buffs = player.buffs.filter(b => b.id !== stormBuffId);
            player.buffs.push({
                id: stormBuffId,
                name: skillDef.name,
                expireTime: now + (c.fieldDurationMs || 6000),
                effects: { moveSpeed: 40 },
                _windSpeedBoost: true,
                hudVisible: true
            });
            if (typeof player.updateStats === 'function') player.updateStats();
        }
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

    function resolveInstant(player, skillDef, ec, g, monsters, now, castOptions) {
        const c = ec.entityConfig;
        const windupMs = getSkillWindupMs(player, skillDef, c);
        if (windupMs > 0) {
            setCastBar(player, skillDef, now, now + windupMs, '#ffcc66');
            const st = ensureState(g);
            st.pendingInstants = st.pendingInstants || [];
            st.pendingInstants.push({
                activateTime: now + windupMs,
                player, skillDef, ec, monsters, castOptions
            });
            floatText(g, player.x, player.y - 20, skillDef.name, '#ffcc66');
            return true;
        }
        return execInstant(player, skillDef, ec, g, monsters, now, castOptions);
    }

    function execInstant(player, skillDef, ec, g, monsters, now, castOptions, impactOpts) {
        const c = ec.entityConfig;
        const opts = impactOpts || {};
        if (c.breathHold || c.deadeyeSnipe) return true;
        if (c.leapSlam && !opts.skipLeap) {
            if (player._leapSlam) return false;
            const landing = resolveLeapLanding(player, c, g, monsters, castOptions);
            startLeapSlam(player, landing.x, landing.y, skillDef, ec, g, monsters, now);
            return true;
        }
        const range = c.range || skillDef.range || 80;
        applyCastAimAngle(player, castOptions, monsters, skillDef, c);
        const dmg = calcDmg(player, skillDef, c, c.damageMultiplier);
        const targets = [];

        const dashBehind = !!(c._comboDashBehind || skillDef._comboDashBehind);

        if (c.shape === 'pierce' || c.shape === 'fissure' || dashBehind) {
            const pierceWidth = c.pierceWidth || (c.shape === 'fissure' ? 40 : 28);
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
                const monR = ((m.size || m.radius || 32) / 2);
                if (Math.hypot(m.x - player.x, m.y - player.y) <= range + monR) targets.push(m);
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
            if (c.destroyMarkStacks && typeof window.applySkillDestroyMarks === 'function') {
                window.applySkillDestroyMarks(player, m, skillDef, c.destroyMarkStacks, g, { now });
            }
            if (c.lifeStealPercent) healPlayerPercent(player, c.lifeStealPercent, g, '吸血');
            if (m.hp <= 0 && hpBefore > 0) {
                onInstantSkillKill(player, skillDef, c, g, monsters, now, m);
            }
        });
        if (c.detonateMarksOnHit != null) {
            detonateMarksOnTargets(targets, player, skillDef, g, c.detonateMarksOnHit, now);
        }
        if (opts.leapLand) {
            applyLeapSlamLandingExtras(player, c, skillDef, g, monsters, now, targets);
        }
        if (c.shape === 'fissure' && c.spawnFissureGround) {
            const st = ensureState(g);
            spawnFissureGround(st, player, skillDef, c, g, now);
        }
        if (c.resourcePerHit && targets.length > 0 && player) {
            const gain = c.resourcePerHit * targets.length;
            if (typeof window.grantSkillResource === 'function') {
                window.grantSkillResource(player, gain);
            }
        }
        applyInstantAllyBuffs(player, c, skillDef, g, now);
        if (c.beastRampageUlt && typeof window.applyBeastRampageUlt === 'function') {
            window.applyBeastRampageUlt(player, Object.assign({
                durationMs: c.ultDurationMs || 10000
            }, c.petBloodlust || {}), g, now);
        } else if (c.petBloodlust && typeof window.applyPetBloodlust === 'function') {
            window.applyPetBloodlust(player, c.petBloodlust, g, now);
        }
        if (c.spawnGhostWolves && typeof window.spawnGhostWolvesForUlt === 'function') {
            window.spawnGhostWolvesForUlt(player, skillDef, c.spawnGhostWolves, g, monsters, now);
        }
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
                hit: targets.length > 0 || opts.leapLand,
                instantShape: c.shape,
                comboStep: skillDef._comboStep,
                comboChain: skillDef._comboChain,
                leapLand: opts.leapLand,
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
            || (c.autoLockOnTap !== false ? window.pickNearestSkillTarget(player, monsters, c.range || 100) : null)
            || nearestEnemy(player, monsters, c.range || 100);
        if (c.behindTarget && target) {
            const ang = Math.atan2(target.y - player.y, target.x - player.x);
            tx = target.x - Math.cos(ang) * 28;
            ty = target.y - Math.sin(ang) * 28;
            player.angle = ang;
        } else {
            const dist = c.distance || 100;
            let ang = (castOptions && castOptions.angle != null) ? castOptions.angle : player.angle;
            if (castOptions == null || castOptions.angle == null) {
                if (typeof window.pickBestLineAngle === 'function') {
                    ang = window.pickBestLineAngle(player, monsters, dist, 28);
                }
            }
            player.angle = ang;
            tx = player.x + Math.cos(ang) * dist;
            ty = player.y + Math.sin(ang) * dist;
        }
        const originX = player.x;
        const originY = player.y;
        const blinkAngle = player.angle;
        player._lastBlinkOriginX = originX;
        player._lastBlinkOriginY = originY;
        if (skillDef.id === 'wind_step' && c.onCastWindBlades
            && typeof window.spawnWindrunnerWindBlades === 'function') {
            window.spawnWindrunnerWindBlades(player, g, monsters, {
                count: c.onCastWindBlades,
                damageMultiplier: c.windBladeDamageMultiplier || 0.5,
                spreadAngleDeg: c.windBladeSpreadDeg || 22,
                maxRange: c.windBladeRange || 380,
                speed: c.windBladeSpeed || 750,
                angle: blinkAngle,
                originX,
                originY,
                homingToMark: c.homingToMarkedTarget !== false
            }, skillDef, now);
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
                effects: { moveSpeed: c.grantMoveSpeed },
                _windSpeedBoost: true,
                hudVisible: true
            });
            if (typeof player.updateStats === 'function') player.updateStats();
        }
        if (skillDef.id === 'wind_step' && typeof window.onWindStepCastComplete === 'function') {
            window.onWindStepCastComplete(player, skillDef, ec, g, monsters, now);
        }
        if (c.leaveEchoOnCast || c.leaveCloneOnCast) {
            const echoOpts = {
                durationMs: c.echoDurationMs || c.cloneDurationMs || 8000,
                damagePercent: c.echoDamagePercent || c.cloneDamagePercent || 70,
                echoReplayDelayMs: c.echoReplayDelayMs || 350,
                skillDef: skillDef,
                faceAngle: blinkAngle,
                maxCount: c.echoMaxCount || 4
            };
            if (typeof window.spawnPhantomEcho === 'function') {
                window.spawnPhantomEcho(player, g, originX, originY, echoOpts);
            } else if (typeof window.spawnPhantomClone === 'function') {
                window.spawnPhantomClone(player, g, originX, originY, echoOpts);
            }
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
        } else if (typeof window.pickBestLineAngle === 'function') {
            angle = window.pickBestLineAngle(
                player, monsters,
                c.maxDistance || 150,
                (c.collisionRadius || 35) * 2
            );
        } else {
            const target = nearestEnemy(player, monsters, skillDef.range || 200);
            if (target) angle = Math.atan2(target.y - player.y, target.x - player.x);
        }
        player.angle = angle;
        const windupMs = getSkillWindupMs(player, skillDef, c);
        if (windupMs > 0) {
            setCastBar(player, skillDef, now, now + windupMs, '#ff8844');
            player.isCastingSkill = true;
            if (c.superArmor || c.superArmorWindup) player._chargeSuperArmor = true;
            const st = ensureState(g);
            st.pendingCharges = st.pendingCharges || [];
            st.pendingCharges.push({
                activateTime: now + windupMs,
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

        const pLeap = gameInstance.player;
        if (pLeap && pLeap._leapSlam && typeof window.updatePlayerLeapSlam === 'function') {
            window.updatePlayerLeapSlam(pLeap, now);
        }
        if (pLeap && pLeap._backstepShot && typeof window.updatePlayerBackstepShot === 'function') {
            window.updatePlayerBackstepShot(pLeap, now);
        }

        if (pLeap && typeof window.tickDeadeyeStates === 'function') {
            window.tickDeadeyeStates(pLeap, monsters, gameInstance, now);
        }
        if (pLeap && typeof window.tickWizardElementStates === 'function') {
            window.tickWizardElementStates(pLeap, gameInstance, now);
        }
        if (pLeap && typeof window.tickSageChronosStates === 'function') {
            window.tickSageChronosStates(pLeap, gameInstance, monsters, now);
        }
        if (pLeap && typeof window.tickWarlockSoulStates === 'function') {
            window.tickWarlockSoulStates(pLeap, gameInstance, monsters, now);
        }

        // Projectiles
        st.projectiles = st.projectiles.filter(p => {
            if (now < p.spawnTime) return true;
            if (!p.active) {
                p.active = true;
                if (p.spawnFromOwner && p.player) {
                    p.x = p.player.x;
                    p.y = p.player.y;
                    if (p.recalcAngleOnSpawn && p.targetRef && p.targetRef.hp > 0) {
                        const baseAng = angleToAimPoint(p.x, p.y, p.targetRef);
                        if (baseAng != null) {
                            p.angle = baseAng + (p.spreadOffset || 0);
                            p.initialAngle = p.angle;
                        }
                    }
                }
            }
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
                    if (p.spawnTrapOnLand && typeof window.spawnTrapFieldAt === 'function') {
                        window.spawnTrapFieldAt(p.player, p.skillDef, p.spawnTrapOnLand, ex, ey, gameInstance, now);
                    } else if (p.explodeRadius) {
                        applyProjectileExplodeEffects(p, ex, ey, monsters, gameInstance, now);
                    }
                    return false;
                }
                return true;
            }
            let vx, vy;
            const homingTarget = (p.guaranteedHit || p.trajectory === 'homing') && p.targetRef
                && p.targetRef.hp > 0 && !p.hitIds.has(p.targetRef) ? p.targetRef : null;
            if (homingTarget) {
                const ap = getAimPoint(homingTarget);
                const ang = ap ? Math.atan2(ap.y - p.y, ap.x - p.x)
                    : Math.atan2(homingTarget.y - p.y, homingTarget.x - p.x);
                vx = Math.cos(ang) * p.speed * dt;
                vy = Math.sin(ang) * p.speed * dt;
                p.angle = ang;
                p.traveled = (p.traveled || 0) + p.speed * dt;
                if (p.traveled >= p.maxRange) {
                    if (p.explodeRadius) applyProjectileExplodeEffects(p, p.x, p.y, monsters, gameInstance, now);
                    return false;
                }
            } else if (p.trajectory === 'cone_track' || p.coneTrackDeg) {
                const trackDeg = (p.coneTrackDeg || 20) * Math.PI / 180;
                let targetAng = null;
                if (p.lockTargetCenter && p.targetRef && p.targetRef.hp > 0) {
                    targetAng = angleToAimPoint(p.x, p.y, p.targetRef);
                } else {
                    const remain = Math.max(80, (p.maxRange || 600) - (p.traveled || 0));
                    const trackTarget = nearestEnemyInCone(
                        p.x, p.y, p.initialAngle != null ? p.initialAngle : p.angle,
                        monsters, remain, trackDeg, p.hitIds
                    );
                    if (trackTarget) targetAng = angleToAimPoint(p.x, p.y, trackTarget);
                }
                if (targetAng != null) {
                    let diff = targetAng - p.angle;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    const maxTurn = trackDeg * Math.max(1, dt * 60) * 0.08;
                    p.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
                }
                vx = Math.cos(p.angle) * p.speed * dt;
                vy = Math.sin(p.angle) * p.speed * dt;
                p.traveled += p.speed * dt;
                if (!p.guaranteedHit && p.traveled >= p.maxRange) {
                    if (p.explodeRadius) applyProjectileExplodeEffects(p, p.x, p.y, monsters, gameInstance, now);
                    return false;
                }
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
                if (!p.guaranteedHit && p.traveled >= p.maxRange) {
                    if (p.explodeRadius) applyProjectileExplodeEffects(p, p.x, p.y, monsters, gameInstance, now);
                    return false;
                }
            }
            const np = clampInRoom(gameInstance, p.x + vx, p.y + vy);
            p.x = np.x; p.y = np.y;

            if (p.visualVariant === 'death_reaper_bolt') {
                p._reaperTrail = p._reaperTrail || [];
                p._reaperTrail.push({ x: p.x, y: p.y });
                if (p._reaperTrail.length > 18) p._reaperTrail.shift();
            }
            if (p.visualVariant === 'phantom_bolt') {
                p._phantomTrail = p._phantomTrail || [];
                p._phantomTrail.push({ x: p.x, y: p.y });
                if (p._phantomTrail.length > 12) p._phantomTrail.shift();
            }

            let hit = false;
            (monsters || []).forEach(m => {
                if (!m || m.hp <= 0 || p.hitIds.has(m)) return;
                if (Math.hypot(m.x - p.x, m.y - p.y) <= p.radius + (m.size || 20) * 0.5) {
                    const hitFx = applyProjectileHitEffects(p.player, m, p, gameInstance, now);
                    if (p.visualVariant === 'death_reaper_bolt'
                        && typeof window.playDeathReaperImpactVfx === 'function') {
                        window.playDeathReaperImpactVfx(
                            p.player, gameInstance, p.x, p.y, hitFx && hitFx.isCrit
                        );
                    }
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
                    const ecHit = p.entityConfig || {};
                    const critContinue = ecHit.continueOnCritKill && hitFx && hitFx.isCrit && hitFx.killed;
                    if (p.pierceLeft <= 0 && !critContinue) {
                        hit = true;
                    } else if (!critContinue) {
                        p.pierceLeft--;
                        if (p.guaranteedHit || p.trajectory === 'homing') {
                            p.targetRef = null;
                            p.guaranteedHit = false;
                            p.trajectory = 'cone_track';
                            if (p.coneTrackDeg == null && ecHit.coneTrackDeg != null) {
                                p.coneTrackDeg = ecHit.coneTrackDeg;
                            }
                        }
                    }
                }
            });
            return !hit;
        });

        // Summons
        st.summons = st.summons.filter(s => {
            if (!s) return false;
            if (s.hp <= 0) {
                if (s.isUndead && typeof window.onUndeadDeath === 'function') {
                    window.onUndeadDeath(s, gameInstance);
                }
                return false;
            }
            if (s.expireTime == null || !isFinite(s.expireTime)) return false;
            if (now >= s.expireTime) return false;
            if (s.isPhantomClone && typeof window.updatePhantomCloneSummon === 'function') {
                return window.updatePhantomCloneSummon(s, monsters, gameInstance, now);
            }
            if (typeof window.updatePetPounce === 'function'
                && window.updatePetPounce(s, monsters, gameInstance, now)) {
                return true;
            }
            if (typeof window.isPetAttackBusy === 'function'
                && window.isPetAttackBusy(s, now)) {
                if (typeof window.tickPetMeleeAttack === 'function') {
                    window.tickPetMeleeAttack(s, gameInstance, now);
                }
                return true;
            }
            if (s.aiType === 'taunt_static') return true;
            if (!s.attack) return true;
            let target = null;
            if (s.focusTarget && s.focusTarget.hp > 0
                && (!s.focusUntil || now < s.focusUntil)) {
                target = s.focusTarget;
            }
            if (!target && typeof window.findMarkedTargetForOwner === 'function') {
                target = window.findMarkedTargetForOwner(s.owner, monsters);
            }
            let td = Infinity;
            if (!target) {
                (monsters || []).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    const d = Math.hypot(m.x - s.x, m.y - s.y);
                    if (d < td) { td = d; target = m; }
                });
            }
            if (!target) return true;
            const dx = target.x - s.x, dy = target.y - s.y;
            const dist = Math.hypot(dx, dy) || 1;
            s.faceAngle = Math.atan2(dy, dx);
            if (dist > (typeof window.PET_MELEE_RANGE === 'number' ? window.PET_MELEE_RANGE : 38)) {
                const sp = 2.5;
                s.x += (dx / dist) * sp;
                s.y += (dy / dist) * sp;
            } else {
                const atkInterval = typeof window.getPetBloodlustAttackInterval === 'function'
                    ? window.getPetBloodlustAttackInterval(s, s.attackIntervalMs)
                    : s.attackIntervalMs;
                if (typeof window.tryStartPetMeleeAttack === 'function'
                    && window.tryStartPetMeleeAttack(s, target, atkInterval, now)) {
                    // windup started; damage lands in tickPetMeleeAttack
                }
            }
            return true;
        });

        if (gameInstance && gameInstance.player
            && typeof window.updateBearGuardPassive === 'function') {
            window.updateBearGuardPassive(gameInstance.player, gameInstance, now);
        }

        // Fields
        st.fields = st.fields.filter(f => {
            if (now >= f.expireTime) {
                const ecEnd = f.entityConfig || {};
                if (f.skillDef && f.skillDef.id === 'phantom_storm' && f.owner) {
                    delete f.owner._phantomStormActiveUntil;
                }
                if (f.skillDef && f.skillDef.id === 'void_storm' && f.owner) {
                    delete f.owner._voidStormActiveUntil;
                }
                if (f.skillDef && f.skillDef.id === 'beast_rampage' && f.owner) {
                    delete f.owner._beastRampageUntil;
                }
                if (ecEnd.endExplosionDamage && f.owner) {
                    const exDmg = calcDmg(f.owner, f.skillDef, ecEnd, ecEnd.endExplosionDamage);
                    (monsters || []).forEach(m => {
                        if (!m || m.hp <= 0) return;
                        if (Math.hypot(m.x - f.x, m.y - f.y) <= f.radius) {
                            applyDmg(f.owner, m, exDmg, f.skillDef, gameInstance);
                        }
                    });
                    floatText(gameInstance, f.x, f.y, '风暴冲击!', '#88eeff');
                    if (gameInstance && typeof gameInstance.triggerHitImpact === 'function') {
                        gameInstance.triggerHitImpact(f.x, f.y, {
                            isRanged: true, isCrit: true,
                            sourceX: f.owner.x, sourceY: f.owner.y
                        });
                    }
                }
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

            const ecField = f.entityConfig || {};
            if (ecField.echoTrailIntervalMs && f.owner
                && typeof window.updateVoidStormEchoTrail === 'function') {
                window.updateVoidStormEchoTrail(f, gameInstance, monsters, now);
            }
            if (ecField.invincibleDuringField && f.owner) {
                f.owner.invincibleUntil = Math.max(f.owner.invincibleUntil || 0, now + 200);
            }
            if (ecField.pullEnemiesIn && ecField.pullStrength) {
                (monsters || []).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    const d = Math.hypot(m.x - f.x, m.y - f.y);
                    if (d > f.radius || d < 8) return;
                    const pull = ecField.pullStrength * dt;
                    m.x -= ((m.x - f.x) / d) * pull;
                    m.y -= ((m.y - f.y) / d) * pull;
                });
            }
            if (ecField.windBladeIntervalMs && f.owner) {
                if (f._lastWindBlade == null) f._lastWindBlade = now;
                if (now - f._lastWindBlade >= ecField.windBladeIntervalMs) {
                    f._lastWindBlade = now;
                    f._windBladeIndex = (f._windBladeIndex || 0) + 1;
                    const totalBlades = Math.max(1, Math.ceil(
                        (ecField.fieldDurationMs || 6000) / ecField.windBladeIntervalMs
                    ));
                    const evenAng = ((f._windBladeIndex - 1) % totalBlades) * (Math.PI * 2 / totalBlades);
                    spawnWindBlades(f.owner, gameInstance, monsters, {
                        count: 1,
                        damageMultiplier: ecField.windBladeDamageMultiplier || 0.6,
                        maxRange: f.radius * 1.2,
                        speed: 780,
                        angle: evenAng,
                        originX: f.x,
                        originY: f.y,
                        homingToMark: ecField.homingToMarkedTarget !== false
                    }, f.skillDef, now);
                }
            }

            if (f.triggerType === 'arrow_rain') {
                const ec = f.entityConfig || {};
                const spawnTime = f.spawnTime || (f.expireTime - (ec.fieldDurationMs || 2000));
                const elapsed = now - spawnTime;
                const rainDur = ec.arrowRainDurationMs || 1200;
                const total = ec.totalArrows || 24;
                const pc = ec.projectileConfig || {};
                const shouldSpawn = Math.min(total, Math.floor(total * Math.min(1, elapsed / Math.max(1, rainDur))));
                while ((f._arrowsSpawned || 0) < shouldSpawn) {
                    f._arrowsSpawned = (f._arrowsSpawned || 0) + 1;
                    const ang = Math.random() * Math.PI * 2;
                    const dist = Math.sqrt(Math.random()) * f.radius;
                    const lx = f.x + Math.cos(ang) * dist;
                    const ly = f.y + Math.sin(ang) * dist;
                    const hitR = pc.collisionRadius || 14;
                    const dmg = calcDmg(f.owner, f.skillDef, pc, pc.damageMultiplier);
                    (monsters || []).forEach(m => {
                        if (!m || m.hp <= 0) return;
                        if (Math.hypot(m.x - lx, m.y - ly) <= hitR + (m.size || 20) * 0.5) {
                            applyDmg(f.owner, m, dmg, f.skillDef, gameInstance);
                        }
                    });
                    if (gameInstance && typeof gameInstance.triggerHitImpact === 'function') {
                        gameInstance.triggerHitImpact(lx, ly, {
                            skipSound: true, isRanged: true,
                            sourceX: f.x, sourceY: f.y - 80
                        });
                    }
                }
                if (ec.enemySlowPercent) {
                    (monsters || []).forEach(m => {
                        if (!m || m.hp <= 0) return;
                        if (Math.hypot(m.x - f.x, m.y - f.y) <= f.radius) {
                            applyCcEffects(m, now, {
                                enemySlowPercent: ec.enemySlowPercent,
                                enemySlowMs: ec.enemySlowMs || 400
                            }, gameInstance);
                        }
                    });
                }
                return true;
            }

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

            if (f.triggerType === 'hunter_net') {
                if (typeof window.tickHunterNetField === 'function') {
                    window.tickHunterNetField(f, monsters, gameInstance, now);
                }
                return now < f.expireTime;
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
                        if (gameInstance && typeof gameInstance.triggerHitImpact === 'function') {
                            gameInstance.triggerHitImpact(f.x, f.y, {
                                isRanged: true,
                                sourceX: f.owner ? f.owner.x : f.x,
                                sourceY: f.owner ? f.owner.y : f.y
                            });
                        }
                        if (gameInstance && typeof gameInstance.addEquipmentEffect === 'function') {
                            gameInstance.addEquipmentEffect('freeze_ring', f.x, f.y, {
                                radius: ot.explodeRadius || f.radius,
                                duration: 520,
                                delayMs: 0
                            });
                        }
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
                    if (ec.grantShieldStacksPerTick && f.owner
                        && typeof window.grantHolyShieldStacks === 'function') {
                        if (Math.hypot(f.owner.x - f.x, f.owner.y - f.y) <= f.radius) {
                            window.grantHolyShieldStacks(f.owner, ec.grantShieldStacksPerTick, {
                                stackMax: ec.stackMax || 3,
                                absorbPercentPerStack: ec.shieldPercentPerStack || 5
                            });
                        }
                    }
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
            if (c.shieldOnAllyHit && gameInstance._skillEntities) {
                (gameInstance._skillEntities.summons || []).forEach(s => {
                    if (!s || s.owner !== ch.player || s.hp <= 0) return;
                    if (Math.hypot(s.x - ch.player.x, s.y - ch.player.y) > ch.radius + 36) return;
                    s._guardDrPercent = c.shieldOnAllyHit.drPercent || 15;
                    s._guardShieldUntil = now + (c.shieldOnAllyHit.durationMs || 6000);
                });
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
                    if (c.destroyMarkOnPath && typeof window.applySkillDestroyMarks === 'function') {
                        window.applySkillDestroyMarks(ch.player, m, ch.skillDef, c.destroyMarkOnPath, gameInstance, { now });
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
        if (typeof window.updateDestructionForm === 'function') {
            window.updateDestructionForm(gameInstance, monsters, now);
        }

        const p = gameInstance.player;
        if (p && p._skillCastBar && now >= p._skillCastBar.endTime) {
            p._skillCastBar = null;
            p.isCastingSkill = false;
        }
    };

    function drawDeathReaperBolt(ctx, p, now) {
        const ang = p.angle || 0;
        const pulse = 0.88 + 0.12 * Math.sin((now || Date.now()) * 0.028);
        const trail = p._reaperTrail || [];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < trail.length - 1; i++) {
            const tp = trail[i];
            const fade = (i + 1) / Math.max(1, trail.length);
            ctx.globalAlpha = fade * 0.22;
            ctx.strokeStyle = i % 2 ? '#ff0044' : '#220008';
            ctx.lineWidth = 3 + fade * 4;
            ctx.beginPath();
            ctx.moveTo(tp.x, tp.y);
            if (trail[i + 1]) ctx.lineTo(trail[i + 1].x, trail[i + 1].y);
            ctx.stroke();
        }

        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        const boltLen = 36 + pulse * 14;
        const wingSpan = 14 + pulse * 6;

        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#110008';
        ctx.beginPath();
        ctx.moveTo(-boltLen * 0.55, -wingSpan);
        ctx.quadraticCurveTo(-boltLen * 0.1, 0, -boltLen * 0.55, wingSpan);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.55;
        const bg = ctx.createLinearGradient(-boltLen * 0.5, 0, boltLen * 0.65, 0);
        bg.addColorStop(0, '#220008');
        bg.addColorStop(0.45, '#ff0044');
        bg.addColorStop(1, '#ffe8ee');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(boltLen * 0.72, 0);
        ctx.lineTo(-boltLen * 0.35, -5.5);
        ctx.lineTo(-boltLen * 0.15, 0);
        ctx.lineTo(-boltLen * 0.35, 5.5);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#ffe8ee';
        ctx.beginPath();
        ctx.arc(boltLen * 0.58, 0, 6.5 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#110008';
        ctx.beginPath();
        ctx.arc(boltLen * 0.52, -1.5, 2.2, 0, Math.PI * 2);
        ctx.arc(boltLen * 0.64, -1.5, 2.2, 0, Math.PI * 2);
        ctx.fillRect(boltLen * 0.56, 1.5, 2.4, 1.5);

        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = '#ff6688';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-boltLen * 0.45, 0);
        ctx.lineTo(boltLen * 0.85, 0);
        ctx.stroke();

        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-boltLen * 0.2, -wingSpan * 0.55);
        ctx.lineTo(boltLen * 0.35, 0);
        ctx.lineTo(-boltLen * 0.2, wingSpan * 0.55);
        ctx.stroke();
        ctx.restore();
    }

    function drawPhantomBolt(ctx, p, now) {
        const ang = p.angle || 0;
        const pulse = 0.9 + 0.1 * Math.sin((now || Date.now()) * 0.03);
        const trail = p._reaperTrail || p._phantomTrail || [];
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < trail.length - 1; i++) {
            const tp = trail[i];
            const fade = (i + 1) / Math.max(1, trail.length);
            ctx.globalAlpha = fade * 0.25;
            ctx.strokeStyle = '#9944ff';
            ctx.lineWidth = 2 + fade * 3;
            ctx.beginPath();
            ctx.moveTo(tp.x, tp.y);
            if (trail[i + 1]) ctx.lineTo(trail[i + 1].x, trail[i + 1].y);
            ctx.stroke();
        }

        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        const len = 22 + pulse * 8;

        ctx.globalAlpha = 0.5;
        const bg = ctx.createLinearGradient(-len * 0.4, 0, len * 0.6, 0);
        bg.addColorStop(0, 'rgba(80,20,140,0)');
        bg.addColorStop(0.35, '#9944ff');
        bg.addColorStop(1, '#eeccff');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(len * 0.55, 0);
        ctx.lineTo(-len * 0.35, -4);
        ctx.lineTo(-len * 0.15, 0);
        ctx.lineTo(-len * 0.35, 4);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(len * 0.42, 0, 4 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cc88ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-len * 0.3, 0);
        ctx.lineTo(len * 0.55, 0);
        ctx.stroke();
        ctx.restore();
    }

    function drawWindBladeProjectile(ctx, p, now) {
        const len = Math.max(36, (p.radius || 30) * 1.8);
        const traveled = p.traveled || 0;
        const pulse = 0.88 + 0.12 * Math.sin((now + (p.spawnTime || 0)) / 90);
        const col = p.color || '#9944ff';
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45 + Math.min(0.35, traveled / Math.max(1, p.maxRange || 400));
        ctx.strokeStyle = col;
        ctx.lineWidth = len * 0.22 * pulse;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(len * 0.3, 0, len * 0.48, -0.5, 0.5);
        ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = p._fromPhantomEcho ? '#eeccff' : '#aaffee';
        ctx.lineWidth = Math.max(2, len * 0.08);
        ctx.beginPath();
        ctx.moveTo(-len * 0.15, 0);
        ctx.lineTo(len * 0.55, 0);
        ctx.stroke();
        ctx.restore();
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
            if (p.visualVariant === 'death_reaper_bolt') {
                drawDeathReaperBolt(ctx, p, now);
                return;
            }
            if (p.visualVariant === 'wind_blade') {
                drawWindBladeProjectile(ctx, p, now);
                return;
            }
            if (p.visualVariant === 'phantom_bolt') {
                drawPhantomBolt(ctx, p, now);
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
            if (s.isPhantomClone && typeof window.drawPhantomCloneSummon === 'function') {
                window.drawPhantomCloneSummon(ctx, s, s.owner, Date.now());
                return;
            }
            ctx.save();
            const face = s.faceAngle != null ? s.faceAngle : 0;
            const nowDraw = Date.now();
            const windingUp = s._attackStrikeAt && !s._attackExecuted && nowDraw < s._attackStrikeAt;
            const sx = s.x;
            const sy = s.y;
            const r = s.size * 0.5;

            if (windingUp || (s._attackExecuted && s._attackBusyUntil && nowDraw < s._attackBusyUntil)) {
                const ang = s._attackAngle != null ? s._attackAngle : face;
                const t = windingUp
                    ? Math.min(1, (nowDraw - (s._attackStrikeAt - 220)) / 220)
                    : 1;
                const arcR = r * (1.4 + t * 0.35);
                ctx.strokeStyle = s.isGhost ? 'rgba(160,200,255,0.85)' : 'rgba(255,170,80,0.9)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(sx, sy, arcR, ang - 0.55, ang + 0.55);
                ctx.stroke();
                ctx.fillStyle = s.isGhost ? 'rgba(120,180,255,0.35)' : 'rgba(255,120,40,0.25)';
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.arc(sx, sy, arcR * 0.85, ang - 0.45, ang + 0.45);
                ctx.closePath();
                ctx.fill();
            }

            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = s.isGhost ? '#aaccee' : '#664422';
            ctx.beginPath();
            ctx.arc(
                sx + Math.cos(face) * r * 0.55,
                sy + Math.sin(face) * r * 0.55,
                r * 0.28, 0, Math.PI * 2
            );
            ctx.fill();
            ctx.fillStyle = '#ff4444';
            const bw = s.size;
            ctx.fillRect(sx - bw / 2, sy - s.size - 8, bw * (s.hp / s.maxHp), 4);
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
                    if (f._ruinGround) {
                        g2.addColorStop(0, 'rgba(255,120,60,0.5)');
                        g2.addColorStop(0.5, 'rgba(180,40,20,0.28)');
                        g2.addColorStop(1, 'rgba(80,10,5,0)');
                        ctx.fillStyle = g2;
                        ctx.beginPath();
                        ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255,80,40,0.6)';
                    } else {
                        g2.addColorStop(0, 'rgba(255,240,180,0.45)');
                        g2.addColorStop(0.5, 'rgba(120,220,255,0.22)');
                        g2.addColorStop(1, 'rgba(40,100,160,0)');
                        ctx.fillStyle = g2;
                        ctx.beginPath();
                        ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(180,240,255,0.55)';
                    }
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

    /**
     * 清除场景中持续存在的技能实体（召唤物、陷阱/场域、弹道等）
     * 场景切换或技能实验场换职业时调用
     */
    window.clearPlayerSkillWorldEntities = function clearPlayerSkillWorldEntities(gameInstance, options) {
        if (!gameInstance) return;
        const opts = options || {};
        const st = ensureState(gameInstance);
        st.summons = [];
        st.fields = [];
        st.projectiles = [];
        st.charges = [];
        st.pendingInstants = [];

        const player = gameInstance.player;
        if (player) {
            delete player._packAssaultUntil;
            player._wolfPounceCd = {};
            if (Array.isArray(player.buffs)) {
                player.buffs = player.buffs.filter(b => !b.id || !String(b.id).startsWith('summon_bonus_'));
            }
        }

        if (opts.clearMarks !== false) {
            let targets = [];
            if (typeof gameInstance._getSkillMonsters === 'function') {
                targets = gameInstance._getSkillMonsters() || [];
            } else if (gameInstance.monsters) {
                targets = gameInstance.monsters;
            }
            (targets || []).forEach(m => {
                if (m && m._classSkillMark) delete m._classSkillMark;
            });
        }

        if (typeof gameInstance.cancelClassSkillAim === 'function') {
            gameInstance.cancelClassSkillAim();
        }
        if (typeof gameInstance.cancelWeaponSkillAim === 'function') {
            gameInstance.cancelWeaponSkillAim();
        }
        if (gameInstance.player && typeof window.clearMarksmanPrecisionState === 'function') {
            window.clearMarksmanPrecisionState(gameInstance.player);
        }
        if (gameInstance.player && typeof window.clearWindrunnerCombatState === 'function') {
            window.clearWindrunnerCombatState(gameInstance.player);
        }
    };

})();
