/**
 * 大魔导师 · 相位桥梁 / 元素熔合 / 维度裂隙 / 三圣所 / 元素化身
 */
(function () {
    'use strict';

    const ARCHMAGE_SKILLS = {
        mage_basic: true,
        elemental_burst: true,
        phase_shift: true,
        resonance_field: true,
        elemental_awakening: true
    };

    const FUSION_HOLD_MS = 400;
    const RIFT_DURATION_MS = 4000;
    const RIFT_PULSE_MS = 1000;

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function isArchmage(player) {
        return classId(player) === 'archmage';
    }

    function floatText(g, x, y, text, color, size) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#cc88ff', size ? 1100 : 900, size || 14);
        }
    }

    function archmageDmg(player, skillDef, ec, mult) {
        let m = mult || 1;
        if (typeof window.getWizardSkillDamageMult === 'function') {
            m *= window.getWizardSkillDamageMult(player, skillDef, null);
        }
        return typeof window.calcSkillEntityDamage === 'function'
            ? window.calcSkillEntityDamage(player, skillDef, ec || {}, m)
            : Math.max(1, Math.floor((player.baseMagicAttack || player.baseAttack || 10) * m));
    }

    function hitMonster(player, monster, dmg, skillDef, g, status) {
        if (!monster || monster.hp <= 0) return;
        if (typeof window.applySkillEntityDamage === 'function') {
            window.applySkillEntityDamage(player, monster, dmg, skillDef, g, status);
        } else {
            monster.takeDamage(dmg);
        }
    }

    function liveMonsters(g, cached) {
        if (cached && cached.length) return cached;
        if (g) {
            if (typeof g.getCurrentSceneTargets === 'function') {
                const t = g.getCurrentSceneTargets();
                if (t && t.length) return t;
            }
            if (typeof g._getSkillMonsters === 'function') {
                const t = g._getSkillMonsters();
                if (t && t.length) return t;
            }
            if (g.currentRoom && g.currentRoom.monsters) return g.currentRoom.monsters;
            if (g.monsters) return g.monsters;
        }
        return cached || [];
    }

    function consumeResonance(player, amount) {
        player._resonanceStacks = Math.max(0, (player._resonanceStacks || 0) - (amount || 1));
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    function inAvatar(player, now) {
        return typeof window.isArchmageAvatar === 'function' && window.isArchmageAvatar(player, now);
    }

    window.applyArchmageSkillOverrides = function applyArchmageSkillOverrides(player, skillDef) {
        if (!isArchmage(player) || !skillDef || !ARCHMAGE_SKILLS[skillDef.id]) return skillDef;
        const ec = skillDef.entityConfig || {};
        const bridge = typeof window.isInBridgeWindow === 'function' && window.isInBridgeWindow(player);
        const awake = typeof window.isWizardAwakening === 'function' && window.isWizardAwakening(player)
            || inAvatar(player);

        if (skillDef.id === 'mage_basic') {
            const patch = {
                maxRange: 520,
                comboChain: 3,
                comboChainWindowMs: 2000,
                trajectory: 'homing',
                wizardPhaseMorph: true
            };
            if (awake) {
                Object.assign(patch, {
                    archmageTriShot: true,
                    comboStepDamage: [0.7, 0.7, 0.7],
                    resourcePerHit: 8,
                    speed: 700
                });
            } else if (bridge) {
                Object.assign(patch, {
                    archmageTwinShot: true,
                    comboStepDamage: [0.65, 0.65, 0.9],
                    comboStepSpeed: [null, 1.15, null],
                    resourcePerHit: 16
                });
            } else {
                Object.assign(patch, {
                    comboStepDamage: [1.0, 1.0, 1.3],
                    resourcePerHit: 8
                });
            }
            return Object.assign({}, skillDef, {
                name: awake ? '三合弹' : (bridge ? '相位双生弹' : skillDef.name),
                description: bridge
                    ? '【大魔导师·双生弹】桥接窗口内双弹齐发，3连击触发熔合终结。'
                    : '【大魔导师·相位弹】巫师三相位普攻，桥接切换后双弹爆发。',
                entityConfig: Object.assign({}, ec, patch)
            });
        }

        if (skillDef.id === 'elemental_burst') {
            return Object.assign({}, skillDef, {
                name: '元素熔爆',
                resourceCost: 28,
                description: '【大魔导师·元素熔爆】轻按=巫师爆发；桥接窗口内自动消耗1共鸣释放双元素熔合。',
                entityConfig: Object.assign({}, ec, {
                    wizardPhaseMorph: true,
                    skipPhaseSwitch: true,
                    archmageFusionBurst: true,
                    fusionHoldMs: FUSION_HOLD_MS
                })
            });
        }

        if (skillDef.id === 'phase_shift') {
            const riftActive = player._dimensionalRift
                && Date.now() < (player._dimensionalRift.expireTime || 0);
            return Object.assign({}, skillDef, {
                name: '维度裂隙',
                cooldownMs: 6000,
                resourceCost: 22,
                range: 220,
                description: riftActive
                    ? '【大魔导师·维度裂隙】单击传送到新方向；0.3s内连按两次返回裂隙起点并爆炸。'
                    : '【大魔导师·维度裂隙】220码传送+裂隙标记4s，连按两次可返回起点并触发双元素爆炸。',
                entityConfig: Object.assign({}, ec, {
                    distance: 220,
                    maxCharges: 2,
                    phaseShift: true,
                    dimensionalRift: true,
                    pathDamageMult: bridge ? 1.5 : 1.0,
                    landRadius: bridge ? 105 : 70,
                    skipPhaseSwitch: true,
                    color: '#9944ff'
                })
            });
        }

        if (skillDef.id === 'resonance_field') {
            const av = inAvatar(player);
            return Object.assign({}, skillDef, {
                name: '三圣所',
                resourceCost: 30,
                cooldownMs: 14000,
                aoeRadius: av ? 200 : 160,
                description: '【大魔导师·三圣所】三元素场叠加，自身共鸣获取×2、桥接窗口延长至5s。',
                entityConfig: Object.assign({}, ec, {
                    wizardPhaseMorph: true,
                    triSanctuary: true,
                    targeted: true,
                    fieldRadius: av ? 200 : 160,
                    fieldDurationMs: 8000,
                    allyDmgBonusPercent: av ? 23 : 18,
                    allyDrPercent: av ? 31 : 24,
                    allyAttackSpeedPercent: av ? 39 : 30,
                    damageEnemyPerTick: av ? 1.0 : 0.6,
                    enemySlowPercent: 35,
                    shockTickDamageMult: 0.6,
                    shockTickIntervalMs: 1200,
                    statusOnTick: [{ type: 'burn', durationMs: 4000, stacks: 1 }],
                    skipPhaseSwitch: true,
                    color: '#ffdd88'
                })
            });
        }

        if (skillDef.id === 'elemental_awakening') {
            return Object.assign({}, skillDef, {
                name: '元素化身',
                cooldownMs: 55000,
                damageMultiplier: 2.0,
                description: '【大魔导师·元素化身】8s三元素模式，+60%/-60%CD，击杀延长1s(最多+4s)。',
                entityConfig: Object.assign({}, ec, {
                    shape: 'radial',
                    range: 999,
                    damageMultiplier: 2.0,
                    wizardAwakening: true,
                    archmageAvatar: true,
                    skipPhaseSwitch: true,
                    color: '#ffdd00'
                }),
                skillEffect: {
                    mode: 'primary',
                    type: 'archmage_avatar',
                    durationMs: 8000,
                    damageBonus: 60,
                    cdReduction: 0.6,
                    refreshCooldowns: true,
                    autoLiberationMs: 4000,
                    liberationDmg: 60,
                    liberationCd: 0.6
                }
            });
        }

        return skillDef;
    };

    window.castArchmageElementalBurst = function castArchmageElementalBurst(player, skillDef, g, monsters, now, castOptions) {
        if (!isArchmage(player) || !skillDef) return false;
        const bridge = typeof window.isInBridgeWindow === 'function' && window.isInBridgeWindow(player);
        const avatar = inAvatar(player, now);
        const fusionType = typeof window.getBridgeFusionType === 'function'
            ? window.getBridgeFusionType(player) : null;
        const stacks = typeof window.getWizardResonanceStacks === 'function'
            ? window.getWizardResonanceStacks(player) : 0;

        const canFusion = avatar || (bridge && fusionType && stacks >= 1);

        if (canFusion && fusionType) {
            if (typeof window.tryTriggerWizardLiberationOnBurst === 'function') {
                window.tryTriggerWizardLiberationOnBurst(player, g);
            }
            const stacksAfterLib = typeof window.getWizardResonanceStacks === 'function'
                ? window.getWizardResonanceStacks(player) : 0;
            if (!avatar && stacksAfterLib >= 1) {
                consumeResonance(player, 1);
            }
            return castArchmageFusionBurst(player, skillDef, skillDef.entityConfig || {}, g, monsters, now, castOptions, fusionType, avatar);
        }

        if (typeof window.castWizardElementalBurst === 'function') {
            return window.castWizardElementalBurst(player, skillDef, g, monsters, now, castOptions);
        }
        return false;
    };

    function castArchmageFusionBurst(player, skillDef, ec, g, monsters, now, castOptions, fusionType, avatar) {
        if (typeof window.enrichArchmageFusionCastOptions === 'function') {
            castOptions = window.enrichArchmageFusionCastOptions(
                player, skillDef, monsters, castOptions, fusionType
            );
        }
        if (avatar && typeof window.isWizardAwakening === 'function' && window.isWizardAwakening(player, now)) {
            return castAvatarTriFusion(player, skillDef, ec || {}, g, monsters, now);
        }
        if (fusionType === 'magma') return castMagmaEruption(player, skillDef, ec || {}, g, monsters, now, castOptions);
        if (fusionType === 'tempest') return castTempestEye(player, skillDef, ec || {}, g, monsters, now);
        if (fusionType === 'plasma') return castPlasmaWave(player, skillDef, ec || {}, g, monsters, now, castOptions);
        return false;
    }

    window.enrichArchmageFusionCastOptions = function enrichArchmageFusionCastOptions(
        player, skillDef, monsters, castOptions, fusionType
    ) {
        castOptions = castOptions || {};
        const targets = liveMonsters(null, monsters);
        if (fusionType === 'magma') {
            if (!castOptions._manualGroundAim && typeof window.pickBestAoeGroundPoint === 'function') {
                const pick = window.pickBestAoeGroundPoint(
                    player, targets, (skillDef && skillDef.range) || 500, 130
                );
                castOptions.groundPoint = { x: pick.x, y: pick.y };
                const dx = pick.x - player.x;
                const dy = pick.y - player.y;
                if (Math.hypot(dx, dy) > 6) player.angle = Math.atan2(dy, dx);
            }
        } else if (fusionType === 'plasma') {
            if ((castOptions.angle == null || !castOptions._manualConeAim)
                && typeof window.pickBestConeAngle === 'function') {
                castOptions.angle = window.pickBestConeAngle(player, targets, 350, 60);
                player.angle = castOptions.angle;
            }
        } else if (fusionType === 'tempest' && typeof window.pickNearestSkillTarget === 'function') {
            const nearest = window.pickNearestSkillTarget(player, targets, 400);
            if (nearest) {
                player.angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
            }
        }
        return castOptions;
    };

    window.getArchmageFusionAimProfile = function getArchmageFusionAimProfile(player) {
        if (!isArchmage(player) || typeof window.isInBridgeWindow !== 'function'
            || !window.isInBridgeWindow(player)) return null;
        const fusion = typeof window.getBridgeFusionType === 'function'
            ? window.getBridgeFusionType(player) : null;
        if (fusion === 'magma') {
            return { mode: 'ground_aoe', castRange: 500, aoeRadius: 130, autoLockOnTap: true };
        }
        if (fusion === 'plasma') {
            return { mode: 'cone', range: 350, halfAngleDeg: 60, autoLockOnTap: true };
        }
        if (fusion === 'tempest') {
            return { mode: 'self_aoe', aoeRadius: 150, autoLockOnTap: true };
        }
        return null;
    };

    function castMagmaEruption(player, skillDef, ec, g, monsters, now, castOptions) {
        let fx = player.x;
        let fy = player.y;
        if (castOptions && castOptions.groundPoint) {
            fx = castOptions.groundPoint.x;
            fy = castOptions.groundPoint.y;
        } else if (typeof window.pickBestAoeGroundPoint === 'function') {
            const pick = window.pickBestAoeGroundPoint(player, monsters, skillDef.range || 500, 130);
            fx = pick.x;
            fy = pick.y;
        }
        const st = g && g._skillEntities;
        if (!st) return false;
        st.pendingInstants = st.pendingInstants || [];
        st.pendingInstants.push({
            activateTime: now + 600,
            player, skillDef,
            ec: { entityConfig: { archmageMagmaBurst: true, burstX: fx, burstY: fy, fieldRadius: 130 } },
            monsters,
            castOptions: { magmaPoint: { x: fx, y: fy } }
        });
        floatText(g, fx, fy - 24, '熔岩爆发', '#ff6622', 15);
        if (typeof window.playArchmageFusionMagmaChargeVfx === 'function') {
            window.playArchmageFusionMagmaChargeVfx(g, fx, fy, 130);
        }
        return true;
    }

    window.resolveArchmageMagmaBurst = function resolveArchmageMagmaBurst(player, skillDef, ecWrap, g, monsters, now) {
        // execInstant 传入的 ecWrap 是 { entityConfig: { burstX, burstY, ... } } 结构
        const c = (ecWrap && ecWrap.entityConfig) || {};
        const x = c.burstX != null ? c.burstX : player.x;
        const y = c.burstY != null ? c.burstY : player.y;
        const radius = c.fieldRadius || 130;
        (monsters || liveMonsters(g, null)).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - x, m.y - y) > radius) return;
            hitMonster(player, m, archmageDmg(player, skillDef, c, 2.5), skillDef, g,
                [{ type: 'burn', durationMs: 6000 }]);
            if (typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(m, now, { freezeMs: 2000, enemySlowPercent: 30, enemySlowMs: 4000 }, g, player);
            }
        });
        const st = g && g._skillEntities;
        if (st) {
            st.fields = st.fields || [];
            st.fields.push({
                x, y, radius,
                expireTime: now + 4000,
                tickIntervalMs: 1000,
                lastTick: now,
                triggerType: 'periodic',
                damage: archmageDmg(player, skillDef, c, 0.6),
                owner: player,
                skillDef,
                entityConfig: { enemySlowPercent: 30, archmageLavaGround: true },
                statusOnTick: [{ type: 'burn', durationMs: 4000, stacks: 1 }],
                color: '#ff4400',
                _archmageLavaField: true
            });
        }
        if (typeof window.playArchmageFusionMagmaBurstVfx === 'function') {
            window.playArchmageFusionMagmaBurstVfx(g, x, y, radius);
        }
    };

    function castTempestEye(player, skillDef, ec, g, monsters, now) {
        const targets = liveMonsters(g, monsters);
        const ringRadius = 150;
        targets.forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - player.x, m.y - player.y) > ringRadius) return;
            hitMonster(player, m, archmageDmg(player, skillDef, ec, 1.5), skillDef, g,
                [{ type: 'frostbite', durationMs: 4000 }]);
            if (typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(m, now, { enemySlowPercent: 40, enemySlowMs: 3000 }, g, player);
            }
        });
        if (typeof window.playArchmageFusionTempestVfx === 'function') {
            window.playArchmageFusionTempestVfx(g, player.x, player.y, ringRadius);
        }
        for (let i = 0; i < 6; i++) {
            const ang = (Math.PI * 2 * i) / 6;
            const tx = player.x + Math.cos(ang) * ringRadius;
            const ty = player.y + Math.sin(ang) * ringRadius;
            let nearest = null;
            let bestD = Infinity;
            targets.forEach(m => {
                if (!m || m.hp <= 0) return;
                const d = Math.hypot(m.x - tx, m.y - ty);
                if (d < bestD) { bestD = d; nearest = m; }
            });
            if (nearest && typeof window.execSkillInstantDirect === 'function') {
                const chainDef = Object.assign({}, skillDef, {
                    entityType: 'instant',
                    entityConfig: {
                        shape: 'chain', range: 400, chainCount: 2, chainDecay: 0.15,
                        damageMultiplier: 0.8, _wizardInternalCast: true, elementTag: 'lightning'
                    }
                });
                window.execSkillInstantDirect(player, chainDef, g, [nearest], now, null);
            }
        }
        floatText(g, player.x, player.y - 32, '暴风眼', '#88ccff', 16);
        return true;
    }

    function castPlasmaWave(player, skillDef, ec, g, monsters, now, castOptions) {
        let angle = (castOptions && castOptions.angle != null) ? castOptions.angle : player.angle;
        if ((castOptions == null || castOptions.angle == null || !castOptions._manualConeAim)
            && typeof window.pickBestConeAngle === 'function') {
            angle = window.pickBestConeAngle(player, liveMonsters(g, monsters), 350, 60);
        }
        player.angle = angle;
        const range = 350;
        const half = 60 * Math.PI / 180;
        let hitCount = 0;
        liveMonsters(g, monsters).forEach(m => {
            if (!m || m.hp <= 0) return;
            const dx = m.x - player.x;
            const dy = m.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist > range) return;
            let diff = Math.atan2(dy, dx) - angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > half) return;
            const edge = dist > range * 0.75;
            const mult = edge ? 3.0 : 2.0;
            hitMonster(player, m, archmageDmg(player, skillDef, ec, mult), skillDef, g,
                [{ type: 'shock', durationMs: 3000 }, { type: 'burn', durationMs: 6000 }]);
            hitCount++;
        });
        if (typeof window.playArchmageFusionPlasmaVfx === 'function') {
            window.playArchmageFusionPlasmaVfx(g, player, angle, range, 60);
        }
        floatText(g, player.x, player.y - 28, '等离子波', '#44aaff', 15);
        return true;
    }

    function castAvatarTriFusion(player, skillDef, ec, g, monsters, now) {
        liveMonsters(g, monsters).forEach(m => {
            if (!m || m.hp <= 0) return;
            hitMonster(player, m, archmageDmg(player, skillDef, ec || {}, 4.0), skillDef, g, [
                { type: 'burn', durationMs: 6000 },
                { type: 'frostbite', durationMs: 6000 },
                { type: 'shock', durationMs: 6000 }
            ]);
        });
        // VFX: 全屏觉醒级爆炸 + 三元素共鸣环
        if (typeof window.playMageElementClashVfx === 'function') {
            window.playMageElementClashVfx(g, player.x, player.y, 'surge_awakening', { radius: 200, phase: 'fire' });
            window.playMageElementClashVfx(g, player.x, player.y, 'resonance', { radius: 160, phase: 'frost' });
            window.playMageElementClashVfx(g, player.x, player.y, 'surge_echo', { radius: 120, phase: 'overload' });
        }
        floatText(g, player.x, player.y - 40, '三元素熔合!', '#ffdd00', 18);
        return true;
    }

    window.tryArchmageRiftReturn = function tryArchmageRiftReturn(player, skillDef, g, monsters, now) {
        if (!isArchmage(player)) return false;
        const rift = player._dimensionalRift;
        if (!rift || now >= rift.expireTime) return false;

        const ox = rift.originX;
        const oy = rift.originY;
        player.x = ox;
        player.y = oy;
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, now + 200);

        const fromPh = rift.fromPhase || 'fire';
        const toPh = typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : 'frost';
        liveMonsters(g, monsters).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - ox, m.y - oy) > 90 + (m.size || 20) * 0.5) return;
            hitMonster(player, m, archmageDmg(player, skillDef, {}, 2.0), skillDef, g);
            if (fromPh === 'fire' && typeof window.applyCombatStatus === 'function') {
                window.applyCombatStatus(m, 'burn', { durationMs: 3000 }, player, g);
            }
            if (toPh === 'frost' && typeof window.applyCcEffects === 'function') {
                window.applyCcEffects(m, now, { freezeMs: 800 }, g, player);
            }
            if (toPh === 'overload' && typeof window.applyCombatStatus === 'function') {
                window.applyCombatStatus(m, 'shock', { durationMs: 2000 }, player, g);
            }
        });

        delete player._dimensionalRift;
        floatText(g, ox, oy - 28, '裂隙收拢!', '#9944ff', 16);
        if (typeof window.playMageElementClashVfx === 'function') {
            window.playMageElementClashVfx(g, ox, oy, 'surge_awakening', { radius: 100 });
        }
        return true;
    };

    window.onArchmageDimensionalRiftOpen = function onArchmageDimensionalRiftOpen(player, skillDef, g, originX, originY, now) {
        if (!isArchmage(player)) return;
        player._dimensionalRift = {
            originX, originY,
            expireTime: now + RIFT_DURATION_MS,
            nextPulse: now + RIFT_PULSE_MS,
            fromPhase: player._phaseShiftPrevPhase || player._elementPhase || 'fire',
            skillDef
        };
    };

    window.tickArchmageDimensionalRift = function tickArchmageDimensionalRift(player, g, monsters, now) {
        if (!isArchmage(player)) return;
        const rift = player._dimensionalRift;
        if (!rift) return;
        if (now >= rift.expireTime) {
            delete player._dimensionalRift;
            return;
        }
        if (now >= rift.nextPulse) {
            rift.nextPulse = now + RIFT_PULSE_MS;
            const pulseRadius = 80;
            liveMonsters(g, monsters).forEach(m => {
                if (!m || m.hp <= 0) return;
                if (Math.hypot(m.x - rift.originX, m.y - rift.originY) > pulseRadius) return;
                hitMonster(player, m, archmageDmg(player, rift.skillDef, {}, 0.4), rift.skillDef, g);
            });
            if (Math.hypot(player.x - rift.originX, player.y - rift.originY) <= 40) {
                liveMonsters(g, monsters).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    if (Math.hypot(m.x - rift.originX, m.y - rift.originY) > 40) return;
                    hitMonster(player, m, Math.max(1, Math.floor(archmageDmg(player, rift.skillDef, {}, 0.2) / 5)), rift.skillDef, g);
                });
            }
        }
    };

    window.spawnArchmageTriSanctuary = function spawnArchmageTriSanctuary(player, skillDef, g, monsters, now, castOptions) {
        if (!isArchmage(player)) return false;
        player._triSanctuaryActive = true;
        player._triSanctuaryUntil = now + ((skillDef.entityConfig && skillDef.entityConfig.fieldDurationMs) || 8000);
        if (typeof window.spawnWizardResonanceField === 'function') {
            return window.spawnWizardResonanceField(player, skillDef, g, monsters, now, castOptions);
        }
        return false;
    };

    window.tickArchmageTriSanctuary = function tickArchmageTriSanctuary(player, now) {
        if (!player || !player._triSanctuaryUntil) return;
        if (now >= player._triSanctuaryUntil) {
            player._triSanctuaryActive = false;
            player._triSanctuaryUntil = 0;
        }
    };

    window.spawnArchmageTwinProjectiles = function spawnArchmageTwinProjectiles(player, skillDef, ec, g, monsters, now, castOptions, spawnFn) {
        if (!isArchmage(player) || typeof spawnFn !== 'function') return false;
        const bridge = typeof window.isInBridgeWindow === 'function' && window.isInBridgeWindow(player);
        const fromPh = player._bridgeFromPhase;
        const toPh = player._bridgeToPhase || (typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : 'fire');
        const phases = bridge ? [toPh, fromPh] : [toPh];
        if (ec.archmageTriShot) {
            phases.length = 0;
            phases.push('fire', 'frost', 'overload');
        }
        const results = [];
        phases.forEach((ph, idx) => {
            const phaseEc = Object.assign({}, ec, {
                wizardBasicPhase: ph,
                archmageTwinIndex: idx,
                archmageTwinGroup: now,
                archmageTwinShot: false,
                archmageTriShot: false,
                damageMultiplier: (ec.comboStepDamage && ec.comboStepDamage[0]) || ec.damageMultiplier || 1
            });
            if (ph === 'fire') { phaseEc.color = '#ff6622'; phaseEc.speed = phaseEc.speed || 480; }
            else if (ph === 'frost') { phaseEc.color = '#88ccff'; phaseEc.speed = phaseEc.speed || 600; }
            else if (ph === 'overload') { phaseEc.color = '#44aaff'; phaseEc.speed = phaseEc.speed || 700; }
            const patchDef = Object.assign({}, skillDef, { entityConfig: phaseEc });
            results.push(spawnFn(player, patchDef, { entityType: 'projectile', entityConfig: phaseEc }, g, monsters, now, castOptions));
        });
        return results.some(Boolean);
    };

    window.onArchmageBasicHitPair = function onArchmageBasicHitPair(player, monster, p, g, now) {
        if (!isArchmage(player) || !p || p._bridgeFinisherDone) return;
        const ec = p.entityConfig || {};
        if (!ec.archmageTwinShot && !ec.archmageTriShot) return;
        const fusion = typeof window.getBridgeFusionType === 'function' ? window.getBridgeFusionType(player) : null;
        const step = p.skillDef && p.skillDef._comboStep;
        if (step !== 2) return;
        p._bridgeFinisherDone = true;

        if (fusion === 'magma' && typeof window.applyCombatStatus === 'function') {
            window.applyCombatStatus(monster, 'burn', { durationMs: 4000, stacks: 2 }, player, g);
            floatText(g, monster.x, monster.y - 20, '热冲击!', '#ff4400', 13);
        } else if (fusion === 'tempest' && p.bounceLeft == null && ec.bounceCount > 0) {
            p.bounceLeft = ec.finisherBounceCount || 2;
            p.bounceRadius = ec.bounceRadius || 100;
        } else if (fusion === 'plasma') {
            liveMonsters(g, null).forEach(m => {
                if (!m || m.hp <= 0 || m === monster) return;
                if (Math.hypot(m.x - monster.x, m.y - monster.y) > 40) return;
                hitMonster(player, m, archmageDmg(player, p.skillDef, ec, 0.8), p.skillDef, g,
                    [{ type: 'shock', durationMs: 2000 }]);
            });
        }
    };

    window.onArchmageSkillHitResonance = function onArchmageSkillHitResonance(player, g) {
        if (!inAvatar(player)) return;
        const prev = player._resonanceStacks || 0;
        player._resonanceStacks = Math.min(4, prev + 1);
        if (player._resonanceStacks > prev && g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 50, '+共鸣', '#ffdd44', 600, 12);
        }
    };

    window.onArchmageKillExtendAvatar = function onArchmageKillExtendAvatar(player, g) {
        if (!player || !player._archmageAvatarUntil) return;
        const maxExtend = 4000;
        player._archmageAvatarExtended = Math.min(maxExtend, (player._archmageAvatarExtended || 0) + 1000);
        player._archmageAvatarUntil += 1000;
        player._wizardAwakeningUntil = player._archmageAvatarUntil;
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 44, '化身+1s', '#ffdd00', 700, 13);
        }
    };

    window.getArchmageBridgeRemaining = function getArchmageBridgeRemaining(player, now) {
        if (!player || !player._bridgeWindowUntil) return 0;
        return Math.max(0, player._bridgeWindowUntil - (now || Date.now()));
    };

    window.getArchmageRiftRemaining = function getArchmageRiftRemaining(player, now) {
        const r = player && player._dimensionalRift;
        if (!r) return 0;
        return Math.max(0, r.expireTime - (now || Date.now()));
    };

    window.getArchmageFusionHoldMs = function getArchmageFusionHoldMs() {
        return FUSION_HOLD_MS;
    };

    window.getArchmageBridgeMaxMs = function getArchmageBridgeMaxMs(player) {
        if (!player) return 3000;
        return player._triSanctuaryActive ? 5000 : 3000;
    };

    window.getArchmageFusionLabel = function getArchmageFusionLabel(player) {
        const fusion = typeof window.getBridgeFusionType === 'function'
            ? window.getBridgeFusionType(player) : null;
        if (fusion === 'magma') return '熔岩爆发';
        if (fusion === 'tempest') return '暴风眼';
        if (fusion === 'plasma') return '等离子波';
        return null;
    };

    window.isArchmageFusionReady = function isArchmageFusionReady(player) {
        if (!isArchmage(player)) return false;
        if (inAvatar(player)) return true;
        const bridge = typeof window.isInBridgeWindow === 'function' && window.isInBridgeWindow(player);
        const stacks = typeof window.getWizardResonanceStacks === 'function'
            ? window.getWizardResonanceStacks(player) : 0;
        const fusion = typeof window.getBridgeFusionType === 'function'
            ? window.getBridgeFusionType(player) : null;
        return !!(bridge && fusion && stacks >= 1);
    };
})();
