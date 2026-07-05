/**
 * Pixel Eternal - 职业技能视觉特效
 * 多阶段：施法 → 弹道/斩击 → 命中爆发 + 粒子
 */
(function () {
    'use strict';

    const PALETTE = {
        rage:   { main: '#ff4422', light: '#ffaa44', core: '#fff4cc', dark: '#881100' },
        focus:  { main: '#55dd44', light: '#ccff99', core: '#f4ffe8', dark: '#226611' },
        mana:   { main: '#7755ff', light: '#ccbaff', core: '#f0e8ff', dark: '#331188' },
        energy: { main: '#cc33ee', light: '#ff99ff', core: '#ffe8ff', dark: '#550066' },
        holy:   { main: '#44bbdd', light: '#88eeff', core: '#e8faff', dark: '#116688' },
        fury:   { main: '#ee2211', light: '#ff6644', core: '#ffe8cc', dark: '#660000' },
        guardian: { main: '#ddaa22', light: '#ffee88', core: '#fffbe8', dark: '#886600' }
    };

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
    function clamp01(t) { return Math.max(0, Math.min(1, t)); }

    function paletteFor(family) {
        return PALETTE[family] || PALETTE.rage;
    }

    function addVfx(gameInstance, x, y, opts) {
        if (!gameInstance || typeof gameInstance.addEquipmentEffect !== 'function') return;
        gameInstance.addEquipmentEffect('class_skill_vfx', x, y, opts);
    }

    function burstParticles(gameInstance, x, y, family, count, spread) {
        const pm = gameInstance && gameInstance.particleManager;
        if (!pm || typeof pm.createSystem !== 'function') return;
        const pal = paletteFor(family);
        pm.createSystem(x, y, {
            color: pal.main,
            size: 3,
            count: count || 14,
            lifetime: 420,
            fadeoutTime: 280,
            speed: 2.8,
            speedVariation: 1.6,
            angleSpread: spread || Math.PI * 2,
            spreadRadius: 6,
            pixelStyle: true
        });
        pm.createSystem(x, y, {
            color: pal.light,
            size: 2,
            count: Math.floor((count || 14) * 0.6),
            lifetime: 320,
            fadeoutTime: 220,
            speed: 1.8,
            speedVariation: 1,
            angleSpread: spread || Math.PI * 2,
            spreadRadius: 4,
            pixelStyle: true
        });
    }

    function castFlash(gameInstance, x, y, family, radius) {
        addVfx(gameInstance, x, y, {
            variant: 'cast_flash',
            duration: 220,
            radius: radius || 36,
            family,
            color: paletteFor(family).light
        });
    }

    /**
     * 播放职业技能全套特效
     */
    window.playClassSkillVfx = function playClassSkillVfx(player, skillDef, gameInstance, context) {
        if (!gameInstance || !player || !skillDef) return;

        const family = (typeof window.getSkillVfxFamilyForPlayer === 'function'
            ? window.getSkillVfxFamilyForPlayer(player, skillDef)
            : null) || (typeof window.getResourceFamilyForClass === 'function'
            ? window.getResourceFamilyForClass(player.classData)
            : null) || 'rage';
        const pal = paletteFor(family);
        const angle = typeof player.angle === 'number' ? player.angle : 0;
        const px = player.x;
        const py = player.y;
        const isBuff = skillDef.effectTags && skillDef.effectTags.includes('buff');
        const aoe = skillDef.aoeRadius || 0;
        const primary = context && context.primaryTarget;
        let resolvedPrimary = primary;
        if (!resolvedPrimary && skillDef.id === 'holy_taunt' && gameInstance.monsters) {
            const maxR = ec.maxRange || skillDef.range || 350;
            let bd = Infinity;
            (gameInstance.monsters || []).forEach(m => {
                if (!m || m.hp <= 0) return;
                const d = Math.hypot(m.x - px, m.y - py);
                if (d <= maxR && d < bd) { bd = d; resolvedPrimary = m; }
            });
        }
        const hitTargets = (context && context.hitTargets) || [];
        const ec = skillDef.entityConfig || {};
        const instantShape = context && context.instantShape;

        if (context && context.chargeStart) {
            if (skillDef.id === 'guardian_charge') {
                castFlash(gameInstance, px, py, family, 44);
                addVfx(gameInstance, px, py, {
                    variant: 'guardian_charge_trail',
                    duration: 420,
                    radius: ec.maxDistance || 180,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, px, py, family, 12, Math.PI * 0.5);
                return;
            }
            if (skillDef.id === 'furious_charge') {
                castFlash(gameInstance, px, py, family, 46);
                addVfx(gameInstance, px, py, {
                    variant: 'furious_charge_trail',
                    duration: 400,
                    radius: ec.maxDistance || 220,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, px, py, family, 14, Math.PI * 0.55);
                return;
            }
            if (skillDef.id === 'holy_rush' || skillDef.id === 'divine_rush') {
                castFlash(gameInstance, px, py, family, 48);
                addVfx(gameInstance, px, py, {
                    variant: 'holy_rush_trail',
                    duration: 440,
                    radius: ec.maxDistance || 180,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, px, py, family, 12, Math.PI * 0.48);
                return;
            }
        }

        if (context && context.chargeEnd) {
            if (skillDef.id === 'holy_rush') {
                const endR = context.aoeRadius || ec.endConeRange || 90;
                castFlash(gameInstance, px, py, family, 50);
                addVfx(gameInstance, px, py, {
                    variant: 'holy_consecration_burst',
                    duration: 680,
                    radius: endR,
                    angle,
                    family,
                    halfAngleDeg: ec.endConeHalfAngleDeg || 60,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'holy_shield_ripple',
                    duration: 620,
                    radius: endR * 0.85,
                    family,
                    ox: px,
                    oy: py
                });
                return;
            }
            if (skillDef.id === 'divine_rush') {
                const endR = context.aoeRadius || ec.endExplodeRadius || 100;
                castFlash(gameInstance, px, py, family, 54);
                addVfx(gameInstance, px, py, {
                    variant: 'holy_consecration_burst',
                    duration: 760,
                    radius: endR,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'holy_domain_cast',
                    duration: 820,
                    radius: (ec.spawnHolyFieldOnEnd && ec.spawnHolyFieldOnEnd.radius) || endR,
                    family,
                    ox: px,
                    oy: py
                });
                return;
            }
            if (skillDef.id === 'guardian_charge') {
                const endR = context.aoeRadius || ec.endExplodeRadius || 100;
                castFlash(gameInstance, px, py, family, 52);
                addVfx(gameInstance, px, py, {
                    variant: 'guardian_sanctuary_burst',
                    duration: 720,
                    radius: endR,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'guardian_aegis_aura',
                    duration: 680,
                    delayMs: 80,
                    radius: endR * 0.92,
                    family,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_shock',
                    duration: 520,
                    delayMs: 100,
                    radius: endR,
                    family,
                    ox: px,
                    oy: py
                });
                if (gameInstance.addEquipmentEffect) {
                    gameInstance.addEquipmentEffect('divine_shield', px, py, { radius: endR, duration: 620 });
                }
                hitTargets.forEach((m, i) => {
                    burstParticles(gameInstance, m.x, m.y, family, 8, Math.PI * 1.1);
                    addVfx(gameInstance, m.x, m.y, {
                        variant: 'hit_spark',
                        duration: 300,
                        delayMs: 60 + i * 22,
                        radius: 36,
                        angle,
                        family,
                        ox: px,
                        oy: py
                    });
                });
                return;
            }
            if (skillDef.id === 'furious_charge') {
                const endR = context.aoeRadius || ec.endConeRange || 95;
                const halfAngleDeg = context.halfAngleDeg || ec.endConeHalfAngleDeg || 75;
                castFlash(gameInstance, px, py, family, 50);
                addVfx(gameInstance, px, py, {
                    variant: 'furious_charge_slam',
                    duration: 580,
                    radius: endR,
                    angle,
                    family,
                    halfAngleDeg,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'slash_down',
                    duration: 460,
                    delayMs: 50,
                    radius: endR * 0.95,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_shock',
                    duration: 500,
                    delayMs: 100,
                    radius: endR,
                    family,
                    ox: px,
                    oy: py
                });
                if (gameInstance.addEquipmentEffect) {
                    gameInstance.addEquipmentEffect('fire_explosion', px, py, {
                        radius: endR * 0.75,
                        duration: 480
                    });
                }
                hitTargets.forEach((m, i) => {
                    burstParticles(gameInstance, m.x, m.y, family, 14, Math.PI * 1.4);
                    addVfx(gameInstance, m.x, m.y, {
                        variant: 'hit_spark',
                        duration: 360,
                        delayMs: 70 + i * 25,
                        radius: 46,
                        angle,
                        family,
                        ox: px,
                        oy: py
                    });
                });
                if (gameInstance.soundManager) {
                    try { gameInstance.soundManager.playSound('explosion'); } catch (e) {}
                }
                return;
            }
            const endR = context.aoeRadius || ec.endExplodeRadius || 55;
            const endType = context.chargeEndType || 'radial';
            if (endType === 'cone' || endType === 'devastation_cone') {
                const isDevastation = endType === 'devastation_cone';
                addVfx(gameInstance, px, py, {
                    variant: 'cone_slash',
                    duration: isDevastation ? 560 : 480,
                    radius: endR,
                    angle,
                    family,
                    halfAngleDeg: context.halfAngleDeg || ec.endConeHalfAngleDeg || 70,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_shock',
                    duration: isDevastation ? 520 : 420,
                    delayMs: 60,
                    radius: endR,
                    family,
                    ox: px,
                    oy: py
                });
                if (isDevastation) {
                    addVfx(gameInstance, px, py, {
                        variant: 'devastation_slam',
                        duration: 620,
                        delayMs: 80,
                        radius: endR,
                        angle,
                        family,
                        halfAngleDeg: context.halfAngleDeg || ec.endConeHalfAngleDeg || 70,
                        ox: px,
                        oy: py
                    });
                }
            } else {
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_nova',
                    duration: 520,
                    radius: endR,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_shock',
                    duration: 440,
                    delayMs: 40,
                    radius: endR,
                    family,
                    ox: px,
                    oy: py
                });
            }
            hitTargets.forEach((m, i) => {
                burstParticles(gameInstance, m.x, m.y, family, 10, Math.PI * 1.2);
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 320,
                    delayMs: 50 + i * 20,
                    radius: 40,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
            });
            return;
        }

        if (context && context.holyDomain) {
            const dr = context.domainRadius || aoe || 150;
            castFlash(gameInstance, px, py, family, 56);
            addVfx(gameInstance, px, py, {
                variant: 'holy_domain_cast',
                duration: 900,
                radius: dr,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 520,
                delayMs: 80,
                radius: dr,
                family,
                ox: px,
                oy: py
            });
            burstParticles(gameInstance, px, py, family, 18, Math.PI * 2);
            return;
        }

        if (context && context.lightSpearImpact) {
            const ix = context.impactX != null ? context.impactX : px;
            const iy = context.impactY != null ? context.impactY : py;
            const ir = context.aoeRadius || 100;
            addVfx(gameInstance, ix, iy, {
                variant: 'light_spear_impact',
                duration: 480,
                radius: ir,
                angle,
                family,
                ox: ix,
                oy: iy
            });
            burstParticles(gameInstance, ix, iy, family, 14, Math.PI * 2);
            return;
        }

        if (skillDef.entityType === 'projectile' && (skillDef.id === 'holy_taunt' || ec.visualVariant === 'light_spear')) {
            if (ec.trajectory === 'lob_ground') {
                castFlash(gameInstance, px, py, family, 42);
                return;
            }
            castFlash(gameInstance, px, py, family, 38);
            const range = ec.maxRange || skillDef.range || 350;
            const tx = resolvedPrimary ? resolvedPrimary.x : px + Math.cos(angle) * range * 0.85;
            const ty = resolvedPrimary ? resolvedPrimary.y : py + Math.sin(angle) * range * 0.85;
            addVfx(gameInstance, px, py, {
                variant: 'light_spear_throw',
                duration: 420,
                radius: range,
                angle,
                family,
                targetX: tx,
                targetY: ty,
                ox: px,
                oy: py
            });
            return;
        }

        if (skillDef.id === 'unyielding_wall') {
            const radialR = ec.range || skillDef.aoeRadius || 150;
            castFlash(gameInstance, px, py, family, 56);
            addVfx(gameInstance, px, py, {
                variant: 'guardian_sanctuary_dome',
                duration: 960,
                radius: radialR,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'guardian_aegis_aura',
                duration: 860,
                delayMs: 120,
                radius: radialR,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'guardian_sanctuary_burst',
                duration: 640,
                delayMs: 60,
                radius: radialR,
                family,
                ox: px,
                oy: py
            });
            if (gameInstance.addEquipmentEffect) {
                gameInstance.addEquipmentEffect('divine_shield', px, py, { radius: radialR, duration: 800 });
            }
            burstParticles(gameInstance, px, py, family, 20, Math.PI * 2);
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 340,
                    delayMs: 130 + i * 30,
                    radius: 40,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
            });
            return;
        }

        if (skillDef.id === 'war_cry' && family === 'guardian') {
            const radialR = ec.range || skillDef.aoeRadius || 120;
            castFlash(gameInstance, px, py, family, 50);
            addVfx(gameInstance, px, py, {
                variant: 'guardian_war_cry',
                duration: 680,
                radius: radialR,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'guardian_aegis_aura',
                duration: 600,
                delayMs: 90,
                radius: radialR * 0.88,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 480,
                delayMs: 70,
                radius: radialR,
                family,
                ox: px,
                oy: py
            });
            hitTargets.forEach((m, i) => {
                burstParticles(gameInstance, m.x, m.y, family, 10, Math.PI * 1.2);
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 300,
                    delayMs: 80 + i * 25,
                    radius: 38,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
            });
            if (hitTargets.length === 0) {
                burstParticles(gameInstance, px, py, family, 16, Math.PI * 2);
            }
            return;
        }

        if (skillDef.id === 'shield_slam' && family === 'guardian') {
            const coneRange = ec.range || skillDef.range || 80;
            const halfAngleDeg = ec.halfAngleDeg || 50;
            castFlash(gameInstance, px, py, family, 48);
            addVfx(gameInstance, px, py, {
                variant: 'guardian_shield_slam',
                duration: 600,
                radius: coneRange,
                angle,
                family,
                halfAngleDeg,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'guardian_aegis_ripple',
                duration: 500,
                delayMs: 50,
                radius: 54,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 460,
                delayMs: 110,
                radius: coneRange * 0.8,
                family,
                ox: px,
                oy: py
            });
            if (gameInstance.addEquipmentEffect) {
                gameInstance.addEquipmentEffect('divine_shield', px, py, { radius: 50, duration: 560 });
            }
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 320,
                    delayMs: 100 + i * 28,
                    radius: 42,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 10, Math.PI * 1.15);
            });
            if (hitTargets.length === 0) {
                burstParticles(
                    gameInstance,
                    px + Math.cos(angle) * coneRange * 0.5,
                    py + Math.sin(angle) * coneRange * 0.5,
                    family, 12, (halfAngleDeg * Math.PI / 180) * 1.5
                );
            }
            return;
        }

        if (skillDef.id === 'whirlwind_slash') {
            const radialR = ec.range || skillDef.range || 100;
            castFlash(gameInstance, px, py, family, 48);
            addVfx(gameInstance, px, py, {
                variant: 'berserker_whirlwind',
                duration: 720,
                radius: radialR,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 560,
                delayMs: 160,
                radius: radialR,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'fury_blood_mist',
                duration: 640,
                delayMs: 80,
                radius: radialR * 1.05,
                family,
                ox: px,
                oy: py
            });
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 320,
                    delayMs: 120 + i * 30,
                    radius: 42,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 12, Math.PI * 1.3);
            });
            if (hitTargets.length === 0) {
                burstParticles(gameInstance, px, py, family, 18, Math.PI * 2);
            }
            if (gameInstance.soundManager) {
                try { gameInstance.soundManager.playSound('swing'); } catch (e) {}
            }
            return;
        }

        if (skillDef.id === 'fury_form') {
            const radialR = ec.range || skillDef.aoeRadius || 130;
            castFlash(gameInstance, px, py, family, 58);
            addVfx(gameInstance, px, py, {
                variant: 'fury_transform',
                duration: 900,
                radius: radialR,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'fury_blood_aura',
                duration: 820,
                delayMs: 100,
                radius: radialR * 0.85,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_nova',
                duration: 620,
                delayMs: 60,
                radius: radialR,
                family,
                ox: px,
                oy: py
            });
            if (gameInstance.addEquipmentEffect) {
                gameInstance.addEquipmentEffect('fire_explosion', px, py, { radius: radialR, duration: 650 });
            }
            burstParticles(gameInstance, px, py, family, 24, Math.PI * 2);
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 380,
                    delayMs: 140 + i * 35,
                    radius: 50,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 10, Math.PI * 1.2);
            });
            if (gameInstance.soundManager) {
                try { gameInstance.soundManager.playSound('explosion'); } catch (e) {}
            }
            return;
        }

        if (skillDef.entityType === 'instant' && (instantShape === 'radial' || ec.shape === 'radial')) {
            const radialR = ec.range || skillDef.range || 80;
            const comboStep = (context && context.comboStep) || 0;
            const isFinisher = (context && context.comboChain && comboStep === context.comboChain - 1) || skillDef._comboChain > 1;
            const stepScale = 1 + comboStep * 0.2;
            const isWarriorBasic = skillDef.id === 'warrior_basic' && skillDef.slotType === 'basic';
            const radialVariant = isWarriorBasic ? 'slash_spin' : 'whirlwind_slash';
            const durBase = isWarriorBasic ? 640 : (isFinisher ? 660 : (440 + comboStep * 60));
            addVfx(gameInstance, px, py, {
                variant: radialVariant,
                duration: durBase,
                radius: radialR * stepScale,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: durBase * 0.7,
                delayMs: 140 + comboStep * 40,
                radius: radialR * stepScale,
                family,
                ox: px,
                oy: py
            });
            if (isFinisher && !isWarriorBasic) {
                addVfx(gameInstance, px, py, {
                    variant: 'devastation_slam',
                    duration: 480,
                    delayMs: 100,
                    radius: radialR,
                    angle,
                    family,
                    halfAngleDeg: 180,
                    ox: px,
                    oy: py
                });
            }
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 280 + comboStep * 40,
                    delayMs: 100 + i * 25 + comboStep * 40,
                    radius: 38 + comboStep * 8,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 6 + comboStep * 4, Math.PI * 1.2 + comboStep * 0.3);
            });
            if (hitTargets.length === 0) {
                burstParticles(gameInstance, px, py, family, 10 + comboStep * 6, Math.PI * 2);
            }
            if (isFinisher && gameInstance && gameInstance.soundManager) {
                try { gameInstance.soundManager.playSound('explosion'); } catch (e) {}
            }
            return;
        }

        if (skillDef.id === 'blood_roar') {
            const coneRange = ec.range || skillDef.range || 80;
            const halfAngleDeg = ec.halfAngleDeg || 40;
            castFlash(gameInstance, px, py, family, 54);
            addVfx(gameInstance, px, py, {
                variant: 'blood_roar_wave',
                duration: 640,
                radius: coneRange,
                angle,
                family,
                halfAngleDeg,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'cone_slash',
                duration: 480,
                delayMs: 40,
                radius: coneRange * 0.9,
                angle,
                family,
                halfAngleDeg,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'fury_blood_mist',
                duration: 520,
                delayMs: 120,
                radius: coneRange * 0.7,
                angle,
                family,
                ox: px,
                oy: py
            });
            const tipX = px + Math.cos(angle) * coneRange * 0.92;
            const tipY = py + Math.sin(angle) * coneRange * 0.92;
            addVfx(gameInstance, tipX, tipY, {
                variant: 'light_spear_impact',
                duration: 400,
                delayMs: 150,
                radius: coneRange * 0.5,
                angle,
                family,
                ox: tipX,
                oy: tipY
            });
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 380,
                    delayMs: 110 + i * 28,
                    radius: 44,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 14, Math.PI * 1.25);
            });
            if (hitTargets.length === 0) {
                burstParticles(gameInstance, tipX, tipY, family, 14, (halfAngleDeg * Math.PI / 180) * 1.6);
            }
            if (gameInstance.soundManager) {
                try { gameInstance.soundManager.playSound('explosion'); } catch (e) {}
            }
            return;
        }

        if (skillDef.id === 'holy_shield_slam') {
            const coneRange = ec.range || skillDef.range || 90;
            const halfAngleDeg = ec.halfAngleDeg || 55;
            castFlash(gameInstance, px, py, family, 52);
            addVfx(gameInstance, px, py, {
                variant: 'holy_shield_bash',
                duration: 620,
                radius: coneRange,
                angle,
                family,
                halfAngleDeg,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'holy_shield_ripple',
                duration: 520,
                delayMs: 60,
                radius: 58,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 480,
                delayMs: 120,
                radius: coneRange * 0.85,
                family,
                ox: px,
                oy: py
            });
            const tipX = px + Math.cos(angle) * coneRange * 0.88;
            const tipY = py + Math.sin(angle) * coneRange * 0.88;
            addVfx(gameInstance, tipX, tipY, {
                variant: 'light_spear_impact',
                duration: 420,
                delayMs: 140,
                radius: coneRange * 0.55,
                angle,
                family,
                ox: tipX,
                oy: tipY
            });
            if (gameInstance.addEquipmentEffect) {
                gameInstance.addEquipmentEffect('divine_shield', px, py, { radius: 54, duration: 520 });
            }
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 360,
                    delayMs: 130 + i * 30,
                    radius: 48,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 12, Math.PI * 1.3);
            });
            if (hitTargets.length === 0) {
                burstParticles(
                    gameInstance,
                    tipX, tipY,
                    family, 16, (halfAngleDeg * Math.PI / 180) * 1.8
                );
            }
            return;
        }

        if (skillDef.entityType === 'instant' && (instantShape === 'cone' || ec.shape === 'cone' || instantShape === 'pierce' || ec.shape === 'pierce')) {
            const coneRange = ec.range || skillDef.range || 80;
            const halfAngleDeg = ec.halfAngleDeg || 45;
            const comboStep = (context && context.comboStep) || 0;
            const isFinisher = (context && context.comboChain && comboStep === context.comboChain - 1);
            const stepScale = 1 + comboStep * 0.15;
            // 战士普攻三段斩：①下劈 ②上挑；刺客暗影击：①刺击 ②横扫 ③突刺
            const isWarriorBasic = skillDef.id === 'warrior_basic' && skillDef.slotType === 'basic'
                && (context && context.comboChain > 1);
            const isAssassinBasic = family === 'energy' && skillDef.slotType === 'basic' && (context && context.comboChain > 1);
            let slashVariant = 'cone_slash';
            let durBase = isFinisher ? 520 : (380 + comboStep * 40);
            if (isWarriorBasic && comboStep === 0) { slashVariant = 'slash_down'; durBase = 480; }
            else if (isWarriorBasic && comboStep === 1) { slashVariant = 'slash_up'; durBase = 500; }
            else if (isAssassinBasic && comboStep === 0) { slashVariant = 'shadow_stab'; durBase = 320; }
            else if (isAssassinBasic && comboStep === 1) { slashVariant = 'shadow_sweep'; durBase = 360; }
            else if (isAssassinBasic && comboStep === 2) { slashVariant = 'shadow_pierce'; durBase = 460; }

            const vfxOpts = {
                variant: slashVariant,
                duration: durBase,
                radius: coneRange * stepScale,
                angle,
                family,
                halfAngleDeg,
                ox: px,
                oy: py
            };
            if (isAssassinBasic && comboStep === 2) {
                if (context && context.pierceTargetX != null) {
                    vfxOpts.pierceTargetX = context.pierceTargetX;
                    vfxOpts.pierceTargetY = context.pierceTargetY;
                    vfxOpts.dashEndX = context.dashEndX;
                    vfxOpts.dashEndY = context.dashEndY;
                } else {
                    vfxOpts.dashEndX = px + Math.cos(angle) * coneRange * stepScale * 1.15;
                    vfxOpts.dashEndY = py + Math.sin(angle) * coneRange * stepScale * 1.15;
                }
            }
            addVfx(gameInstance, px, py, vfxOpts);
            if (isFinisher) {
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_shock',
                    duration: 400,
                    delayMs: 80,
                    radius: coneRange * 0.6,
                    family,
                    ox: px,
                    oy: py
                });
            }
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 280 + comboStep * 40,
                    delayMs: 100 + i * 25 + comboStep * 20,
                    radius: 38 + comboStep * 8,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 6 + comboStep * 3, Math.PI * 1.2 + comboStep * 0.2);
            });
            if (hitTargets.length === 0) {
                burstParticles(
                    gameInstance,
                    px + Math.cos(angle) * coneRange * 0.55,
                    py + Math.sin(angle) * coneRange * 0.55,
                    family, 8 + comboStep * 4, (halfAngleDeg * Math.PI / 180) * 1.6
                );
            }
            return;
        }

        // ---- instant: chain ----
        if (skillDef.entityType === 'instant' && (instantShape === 'chain' || ec.shape === 'chain')) {
            const chainRange = ec.range || 200;
            const chainCount = ec.chainCount || 3;
            castFlash(gameInstance, px, py, family, 42);
            addVfx(gameInstance, px, py, {
                variant: 'chain_lightning',
                duration: 560,
                radius: chainRange,
                angle,
                family,
                chainCount,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 420,
                delayMs: 40,
                radius: chainRange * 0.7,
                family,
                ox: px,
                oy: py
            });
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 360,
                    delayMs: 80 + i * 55,
                    radius: 38,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 7, Math.PI * 1.2);
            });
            if (hitTargets.length === 0) {
                burstParticles(gameInstance, px, py, family, 10, Math.PI * 2);
            }
            return;
        }

        // ---- instant: single / precise strike ----
        if (skillDef.entityType === 'instant' && ec.shape !== 'radial' && ec.shape !== 'cone' && ec.shape !== 'chain') {
            castFlash(gameInstance, px, py, family, 36);
            addVfx(gameInstance, px, py, {
                variant: 'precise_strike',
                duration: 350,
                radius: 65,
                angle,
                family,
                ox: px,
                oy: py
            });
            if (primary) {
                addVfx(gameInstance, primary.x, primary.y, {
                    variant: 'hit_spark',
                    duration: 320,
                    delayMs: 100,
                    radius: 42,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, primary.x, primary.y, family, 9, Math.PI * 1.0);
            }
            return;
        }

        if (gameInstance.soundManager && typeof gameInstance.soundManager.playSound === 'function') {
            const sm = gameInstance.soundManager;
            if (family === 'mana') sm.playSound('shock');
            else if (family === 'energy') sm.playSound('hit');
            else sm.playSound('swing');
        }

        castFlash(gameInstance, px, py, family, isBuff || context.defensive ? 48 : 32);

        const isDefense = (skillDef.effectTags && (skillDef.effectTags.includes('defense') || skillDef.effectTags.includes('ice_armor')))
            || context.defensive;
        if (isDefense) {
            addVfx(gameInstance, px, py, {
                variant: 'buff_aura',
                duration: 720,
                radius: 72,
                angle,
                family: 'mana',
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 480,
                delayMs: 60,
                radius: 64,
                family: 'mana',
                ox: px,
                oy: py
            });
            if (gameInstance.addEquipmentEffect) {
                gameInstance.addEquipmentEffect('freeze_ring', px, py, { radius: 62, duration: 800, delayMs: 0 });
            }
            burstParticles(gameInstance, px, py, 'mana', 12, Math.PI * 2);
            return;
        }

        if (isBuff || aoe > 0) {
            addVfx(gameInstance, px, py, {
                variant: isBuff ? 'buff_aura' : 'aoe_nova',
                duration: isBuff ? 720 : 580,
                radius: aoe || (isBuff ? 100 : 90),
                angle,
                family,
                ox: px,
                oy: py
            });
            if (aoe > 0) {
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_shock',
                    duration: 420,
                    delayMs: 80,
                    radius: aoe,
                    family,
                    ox: px,
                    oy: py
                });
            }
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 340,
                    delayMs: 60 + i * 25,
                    radius: 42,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 10, Math.PI * 1.2);
            });
            if (isBuff) burstParticles(gameInstance, px, py, family, 16, Math.PI * 2);
            return;
        }

        // ---- field: 领域/陷阱/场地 ----
        if (skillDef.entityType === 'field') {
            const fieldR = ec.fieldRadius || 80;
            const fieldT = ec.triggerType || 'periodic';
            const isTrap = fieldT === 'proximity_mine' || fieldT === 'delayed_strike';
            const isBurst = fieldT === 'instant_burst';
            castFlash(gameInstance, px, py, family, isBurst ? 50 : 36);
            if (isBurst) {
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_nova',
                    duration: 460,
                    radius: fieldR,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
            } else if (isTrap) {
                addVfx(gameInstance, px, py, {
                    variant: 'field_pulse',
                    duration: 900,
                    radius: fieldR,
                    angle,
                    family,
                    fieldColor: ec.color || '#88ddff',
                    pulseCount: 3,
                    ox: px,
                    oy: py
                });
            } else {
                addVfx(gameInstance, px, py, {
                    variant: 'field_pulse',
                    duration: 1000,
                    radius: fieldR,
                    angle,
                    family,
                    fieldColor: ec.color || '#55aa44',
                    pulseCount: 5,
                    ox: px,
                    oy: py
                });
            }
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 420,
                delayMs: 60,
                radius: fieldR * 0.65,
                family,
                ox: px,
                oy: py
            });
            burstParticles(gameInstance, px, py, family, isBurst ? 18 : 10, Math.PI * 2);
            return;
        }

        // ---- summon: 召唤 ----
        if (skillDef.entityType === 'summon') {
            castFlash(gameInstance, px, py, family, 44);
            addVfx(gameInstance, px, py, {
                variant: 'summon_circle',
                duration: 850,
                radius: 62,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'buff_aura',
                duration: 580,
                radius: 48,
                angle,
                family,
                ox: px,
                oy: py
            });
            burstParticles(gameInstance, px, py, family, 12, Math.PI * 1.5);
            return;
        }

        // ---- blink: 闪烁/位移 ----
        if (skillDef.entityType === 'blink') {
            addVfx(gameInstance, px, py, {
                variant: 'blink_trail',
                duration: 420,
                radius: 48,
                angle,
                family,
                ox: px,
                oy: py
            });
            burstParticles(gameInstance, px, py, family, 10, Math.PI * 1.6);
            if (primary) {
                addVfx(gameInstance, primary.x, primary.y, {
                    variant: 'cast_flash',
                    duration: 200,
                    radius: 32,
                    family,
                    color: pal.light
                });
                burstParticles(gameInstance, primary.x, primary.y, family, 7, Math.PI * 2);
            }
            return;
        }

        // ---- 默认弹道/斩击 travel ----
        const aimX = primary
            ? primary.x
            : px + Math.cos(angle) * Math.min(skillDef.range || 80, 130);
        const aimY = primary
            ? primary.y
            : py + Math.sin(angle) * Math.min(skillDef.range || 80, 130);

        const travelVariant = {
            rage: 'warrior_slash',
            focus: 'archer_shot',
            mana: 'mage_bolt',
            energy: 'assassin_cut'
        }[family] || 'warrior_slash';

        addVfx(gameInstance, aimX, aimY, {
            variant: travelVariant,
            duration: family === 'focus' ? 320 : (family === 'mana' ? 480 : 400),
            radius: family === 'mana' ? 64 : 56,
            angle,
            family,
            ox: px,
            oy: py,
            targetX: aimX,
            targetY: aimY,
            color: pal.main,
            color2: pal.light
        });

        addVfx(gameInstance, aimX, aimY, {
            variant: 'hit_spark',
            duration: 380,
            delayMs: family === 'focus' ? 240 : (family === 'mana' ? 280 : 180),
            radius: 50,
            angle,
            family,
            ox: px,
            oy: py
        });

        burstParticles(gameInstance, aimX, aimY, family, 14, Math.PI * 1.4);
    };

    function drawRing(ctx, x, y, r, color, lw, ringAlpha) {
        ctx.save();
        ctx.globalAlpha = ringAlpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawArcSlash(ctx, x, y, ang, r, startA, endA, color, lw, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, r, ang + startA, ang + endA);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * 战士普攻劈砍刀光（slash_down / slash_up 共用）
     * upward=false → 从上至下劈砍；upward=true → 从下至上挑斩
     */
    function drawWarriorVerticalChop(ctx, r, sweep, fade, alpha, pal, upward) {
        const topX = r * 0.1, topY = -r * 0.95;
        const botX = r * 0.75, botY = r * 0.6;
        const sx = upward ? botX : topX;
        const sy = upward ? botY : topY;
        const ex = upward ? topX : botX;
        const ey = upward ? topY : botY;
        const tipX = sx + (ex - sx) * sweep;
        const tipY = sy + (ey - sy) * sweep;
        const dx = ex - sx;
        const dy = ey - sy;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let g = 1; g <= 7; g++) {
            const gt = Math.max(0, sweep - g * 0.065);
            const gx = sx + (ex - sx) * gt;
            const gy = sy + (ey - sy) * gt;
            const ghostLen = r * 0.58 * (0.35 + gt * 0.65);
            ctx.globalAlpha = alpha * fade * Math.max(0, 0.14 - g * 0.016);
            ctx.strokeStyle = g <= 2 ? pal.light : pal.main;
            ctx.lineWidth = 5 - g * 0.35;
            ctx.beginPath();
            ctx.moveTo(gx - nx * ghostLen * 0.5, gy - ny * ghostLen * 0.5);
            ctx.lineTo(gx + nx * ghostLen * 0.5, gy + ny * ghostLen * 0.5);
            ctx.stroke();
        }

        const arcCx = (sx + ex) * 0.5 - nx * r * 0.1;
        const arcCy = (sy + ey) * 0.5 - ny * r * 0.1;
        const arcR = r * 0.82;
        const curAng = Math.atan2(tipY - arcCy, tipX - arcCx);
        const arcSpan = 0.52;
        const layers = [
            { col: pal.dark, lw: 13, a: 0.32 },
            { col: pal.main, lw: 8, a: 0.92 },
            { col: pal.light, lw: 4, a: 0.82 },
            { col: pal.core, lw: 1.8, a: 0.95 }
        ];
        layers.forEach((layer) => {
            ctx.globalAlpha = alpha * fade * layer.a;
            ctx.strokeStyle = layer.col;
            ctx.lineWidth = layer.lw;
            ctx.beginPath();
            ctx.arc(arcCx, arcCy, arcR, curAng - arcSpan, curAng + arcSpan * 0.25);
            ctx.stroke();
        });

        const bladeLen = r * 0.68 * (0.45 + sweep * 0.55);
        const bx0 = tipX - (dx / len) * bladeLen;
        const by0 = tipY - (dy / len) * bladeLen;
        ctx.globalAlpha = alpha * fade * 0.38;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(bx0, by0);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.globalAlpha = alpha * fade * 0.95;
        ctx.strokeStyle = pal.main;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.globalAlpha = alpha * fade;
        ctx.strokeStyle = pal.core;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (sweep > 0.06) {
            ctx.globalAlpha = alpha * fade * 0.95;
            ctx.fillStyle = pal.core;
            ctx.beginPath();
            ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = alpha * fade * 0.38;
            ctx.fillStyle = pal.light;
            ctx.beginPath();
            ctx.arc(tipX, tipY, 9, 0, Math.PI * 2);
            ctx.fill();
        }

        if (sweep < 0.3) {
            const flashT = 1 - sweep / 0.3;
            ctx.globalAlpha = alpha * fade * flashT * 0.6;
            ctx.fillStyle = pal.light;
            ctx.beginPath();
            ctx.arc(sx, sy, 7 * flashT, 0, Math.PI * 2);
            ctx.fill();
        }

        if (sweep > 0.7) {
            const hitT = (sweep - 0.7) / 0.3;
            ctx.globalAlpha = alpha * fade * (1 - hitT) * 0.65;
            ctx.strokeStyle = pal.light;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(ex, ey, 8 + hitT * 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = alpha * fade * (1 - hitT) * 0.25;
            ctx.fillStyle = pal.main;
            ctx.beginPath();
            ctx.arc(ex, ey, 5 + hitT * 10, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** 刺客弧形刀光（多层描边） */
    function drawAssassinArcBlade(ctx, cx, cy, radius, startA, endA, fade, alpha, pal, widths) {
        ctx.lineCap = 'round';
        widths.forEach((w) => {
            ctx.globalAlpha = alpha * fade * w.a;
            ctx.strokeStyle = w.col;
            ctx.lineWidth = w.lw;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startA, endA);
            ctx.stroke();
        });
    }

    /** 刺客直线刃光 */
    function drawAssassinLineBlade(ctx, x0, y0, x1, y1, fade, alpha, pal, widths) {
        ctx.lineCap = 'round';
        widths.forEach((w) => {
            ctx.globalAlpha = alpha * fade * w.a;
            ctx.strokeStyle = w.col;
            ctx.lineWidth = w.lw;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
        });
    }

    function assassinBladeLayers(pal) {
        return [
            { col: '#1a0028', lw: 8, a: 0.55 },
            { col: pal.dark, lw: 5, a: 0.95 },
            { col: pal.main, lw: 2.2, a: 0.88 },
            { col: pal.core, lw: 1, a: 1 }
        ];
    }

    /**
     * 绘制 class_skill_vfx 特效（由 game-main.drawEquipmentEffects 调用）
     */
    window.drawClassSkillVfxEffect = function drawClassSkillVfxEffect(ctx, effect, progress, alpha, elapsed) {
        const variant = effect.variant || 'warrior_slash';
        const family = effect.family || 'rage';
        const pal = paletteFor(family);
        const ang = effect.angle || 0;
        const x = effect.x;
        const y = effect.y;
        const r = effect.radius || 50;
        const ox = effect.ox != null ? effect.ox : x;
        const oy = effect.oy != null ? effect.oy : y;
        const tx = effect.targetX != null ? effect.targetX : x;
        const ty = effect.targetY != null ? effect.targetY : y;

        switch (variant) {
            case 'cast_flash': {
                const t = easeOutCubic(clamp01(progress / 0.85));
                const rad = r * (0.4 + t * 1.1);
                const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.35, pal.light);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha * (1 - t * 0.7);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, rad, 0, Math.PI * 2);
                ctx.fill();
                drawRing(ctx, x, y, rad * 0.65, pal.main, 3, alpha * 0.8);
                break;
            }

            case 'whirlwind_slash': {
                const sweep = easeOutBack(clamp01(progress / 0.62));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const spin = ang + sweep * Math.PI * 2;
                const rings = [
                    { rm: 0.68, lw: 9, col: pal.dark, alpha: 0.4 },
                    { rm: 0.84, lw: 8, col: pal.main, alpha: 0.9 },
                    { rm: 0.96, lw: 4, col: pal.light, alpha: 0.75 }
                ];

                ctx.save();
                ctx.translate(x, y);
                ctx.globalCompositeOperation = 'lighter';

                rings.forEach((layer, ri) => {
                    const ringR = r * layer.rm;
                    const rotOffset = spin + ri * 0.35;
                    const span = Math.PI * 2 * Math.min(1, sweep * 1.04);
                    const start = rotOffset - span;
                    const end = rotOffset;

                    ctx.globalAlpha = alpha * fade * layer.alpha;
                    ctx.strokeStyle = layer.col;
                    ctx.lineWidth = layer.lw;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, start, end);
                    ctx.stroke();

                    if (ri === 1) {
                        ctx.globalAlpha = alpha * fade * 0.65;
                        ctx.strokeStyle = pal.core;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(0, 0, ringR * 0.98, start + 0.08, end - 0.06);
                        ctx.stroke();
                    }
                });

                if (sweep > 0.55) {
                    const tickAlpha = alpha * fade * clamp01((sweep - 0.55) / 0.45);
                    const tickR = r * 0.88;
                    const tickCount = 16;
                    ctx.globalAlpha = tickAlpha * 0.55;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    ctx.lineCap = 'round';
                    for (let i = 0; i < tickCount; i++) {
                        const a = spin + (i / tickCount) * Math.PI * 2;
                        const tx = Math.cos(a) * tickR;
                        const ty = Math.sin(a) * tickR;
                        const nx = Math.cos(a);
                        const ny = Math.sin(a);
                        ctx.beginPath();
                        ctx.moveTo(tx - nx * 6, ty - ny * 6);
                        ctx.lineTo(tx + nx * 6, ty + ny * 6);
                        ctx.stroke();
                    }
                }

                if (sweep > 0.78) {
                    ctx.globalAlpha = alpha * fade * clamp01((sweep - 0.78) / 0.22) * 0.5;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'cone_slash': {
                const half = (effect.halfAngleDeg || 45) * Math.PI / 180;
                const coneR = r;
                const sweep = easeOutBack(clamp01(progress / 0.55));
                const tail = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';

                const reach = coneR * (0.25 + sweep * 0.75);
                ctx.globalAlpha = alpha * 0.14 * tail;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, reach, -half, half);
                ctx.closePath();
                ctx.fill();

                ctx.globalAlpha = alpha * 0.85 * tail;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 7;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(0, 0, reach * 0.92, -half * 0.95, half * 0.95);
                ctx.stroke();

                ctx.globalAlpha = alpha * tail;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, reach * 0.72, -half * 0.85, half * 0.85);
                ctx.stroke();

                ctx.globalAlpha = alpha * 0.55 * (1 - sweep * 0.3);
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(-half) * reach, Math.sin(-half) * reach);
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(half) * reach, Math.sin(half) * reach);
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'slash_down': {
                const sweep = easeOutCubic(clamp01(progress / 0.4));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.48) / 0.52));
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                drawWarriorVerticalChop(ctx, r, sweep, fade, alpha, pal, false);
                ctx.restore();
                break;
            }

            case 'slash_up': {
                const sweep = easeOutCubic(clamp01(progress / 0.4));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.48) / 0.52));
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                drawWarriorVerticalChop(ctx, r, sweep, fade, alpha, pal, true);
                ctx.restore();
                break;
            }

            case 'slash_spin': {
                const sweep = easeOutCubic(clamp01(progress / 0.52));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.42) / 0.58));
                const spinStart = ang - Math.PI * 0.5;
                const spinEnd = spinStart + sweep * Math.PI * 2;

                ctx.save();
                ctx.translate(x, y);
                ctx.globalCompositeOperation = 'lighter';

                const layers = [
                    { rm: 0.42, lw: 12, col: pal.dark, a: 0.36, offset: 0 },
                    { rm: 0.58, lw: 10, col: pal.main, a: 0.93, offset: 0.18 },
                    { rm: 0.74, lw: 6, col: pal.light, a: 0.78, offset: 0.36 },
                    { rm: 0.55, lw: 2.5, col: pal.core, a: 0.95, offset: 0.52 }
                ];
                layers.forEach((layer) => {
                    const ringR = r * layer.rm;
                    const layerSpin = spinStart + layer.offset + sweep * Math.PI * 2;
                    const trailSpan = Math.PI * 1.1 * (0.25 + sweep * 0.75);
                    ctx.globalAlpha = alpha * fade * layer.a;
                    ctx.strokeStyle = layer.col;
                    ctx.lineWidth = layer.lw;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, layerSpin - trailSpan, layerSpin);
                    ctx.stroke();
                });

                const corePulse = 1 + Math.sin(sweep * Math.PI * 4) * 0.1;
                ctx.globalAlpha = alpha * fade * 0.4;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.2 * corePulse, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.7;
                ctx.fillStyle = pal.core;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
                ctx.fill();

                if (sweep > 0.15) {
                    const lineAlpha = alpha * fade * clamp01((sweep - 0.15) / 0.45) * 0.5;
                    ctx.globalAlpha = lineAlpha;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 1.5;
                    ctx.lineCap = 'round';
                    for (let i = 0; i < 10; i++) {
                        const a = spinEnd + (i / 10) * Math.PI * 2;
                        const inner = r * 0.24;
                        const outer = r * 0.46;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
                        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
                        ctx.stroke();
                    }
                }

                if (sweep > 0.82) {
                    const ringT = (sweep - 0.82) / 0.18;
                    ctx.globalAlpha = alpha * fade * (1 - ringT) * 0.6;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.restore();
                break;
            }

            case 'shadow_stab': {
                const sweep = easeOutCubic(clamp01(progress / 0.28));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const arcR = r * 0.78;
                const startA = -0.55;
                const endA = 0.22;
                const curEnd = startA + (endA - startA) * sweep;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';

                for (let g = 4; g >= 1; g--) {
                    const gt = Math.max(0, sweep - g * 0.09);
                    const gEnd = startA + (endA - startA) * gt;
                    drawAssassinArcBlade(ctx, r * 0.05, -r * 0.08, arcR * 0.96, startA, gEnd, fade, alpha * (0.1 - g * 0.018), pal, [
                        { col: pal.dark, lw: 3, a: 1 }
                    ]);
                }

                drawAssassinArcBlade(ctx, r * 0.05, -r * 0.08, arcR, startA, curEnd, fade, alpha, pal, assassinBladeLayers(pal));

                const tipA = curEnd;
                const tipX = r * 0.05 + Math.cos(tipA) * arcR;
                const tipY = -r * 0.08 + Math.sin(tipA) * arcR;
                if (sweep > 0.15) {
                    ctx.globalAlpha = alpha * fade * 0.9;
                    ctx.fillStyle = pal.core;
                    ctx.beginPath();
                    ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'shadow_sweep': {
                const half = ((effect.halfAngleDeg || 25) * Math.PI / 180) * 1.05;
                const sweep = easeOutCubic(clamp01(progress / 0.38));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const arcR = r * 0.92;
                const curAng = -half + sweep * half * 2;
                const bladeW = half * 0.85;

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';

                ctx.globalAlpha = alpha * fade * 0.18;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, arcR * 0.95, -half, curAng);
                ctx.closePath();
                ctx.fill();

                for (let g = 3; g >= 1; g--) {
                    const gt = Math.max(0, sweep - g * 0.1);
                    const gAng = -half + gt * half * 2;
                    drawAssassinArcBlade(ctx, 0, 0, arcR, gAng - bladeW, gAng, fade, alpha * (0.12 - g * 0.025), pal, [
                        { col: pal.dark, lw: 4, a: 1 }
                    ]);
                }

                drawAssassinArcBlade(ctx, 0, 0, arcR, curAng - bladeW, curAng, fade, alpha, pal, assassinBladeLayers(pal));
                drawAssassinArcBlade(ctx, 0, 0, arcR * 0.72, curAng - bladeW * 0.7, curAng - bladeW * 0.05, fade, alpha * 0.65, pal, [
                    { col: pal.light, lw: 2, a: 0.9 },
                    { col: pal.core, lw: 1, a: 0.95 }
                ]);

                const ex = Math.cos(curAng) * arcR;
                const ey = Math.sin(curAng) * arcR;
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.fillStyle = pal.core;
                ctx.beginPath();
                ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'shadow_pierce': {
                const sweep = easeOutCubic(clamp01(progress / 0.42));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const sx = ox;
                const sy = oy;
                const mx = effect.pierceTargetX != null ? effect.pierceTargetX : (sx + Math.cos(ang) * r * 0.55);
                const my = effect.pierceTargetY != null ? effect.pierceTargetY : (sy + Math.sin(ang) * r * 0.55);
                const ex = effect.dashEndX != null ? effect.dashEndX : (sx + Math.cos(ang) * r * 1.1);
                const ey = effect.dashEndY != null ? effect.dashEndY : (sy + Math.sin(ang) * r * 1.1);
                const tipX = sx + (ex - sx) * sweep;
                const tipY = sy + (ey - sy) * sweep;
                const pathLen = Math.hypot(ex - sx, ey - sy) || 1;
                const pathAng = Math.atan2(ey - sy, ex - sx);
                const pierceT = Math.hypot(mx - sx, my - sy) / pathLen;

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.lineCap = 'round';

                for (let g = 6; g >= 1; g--) {
                    const gt = Math.max(0, sweep - g * 0.065);
                    const gx = sx + (ex - sx) * gt;
                    const gy = sy + (ey - sy) * gt;
                    ctx.globalAlpha = alpha * fade * (0.07 + g * 0.018);
                    ctx.fillStyle = '#12001c';
                    ctx.beginPath();
                    ctx.ellipse(gx, gy, 7, 4, pathAng, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.globalAlpha = alpha * fade * 0.22;
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 14;
                ctx.setLineDash([4, 10]);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                ctx.setLineDash([]);

                drawAssassinLineBlade(ctx, sx, sy, tipX, tipY, fade, alpha, pal, assassinBladeLayers(pal));

                if (sweep > pierceT * 0.85) {
                    const splitT = clamp01((sweep - pierceT * 0.85) / 0.2);
                    const splitR = 6 + splitT * 14;
                    ctx.globalAlpha = alpha * fade * (1 - splitT) * 0.75;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(mx, my, splitR, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = alpha * fade * (1 - splitT) * 0.55;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 1.5;
                    for (let i = 0; i < 4; i++) {
                        const a = pathAng + (i / 4) * Math.PI * 2;
                        ctx.beginPath();
                        ctx.moveTo(mx, my);
                        ctx.lineTo(mx + Math.cos(a) * splitR * 1.2, my + Math.sin(a) * splitR * 1.2);
                        ctx.stroke();
                    }
                }

                if (sweep > 0.55) {
                    const landT = clamp01((sweep - 0.55) / 0.45);
                    ctx.globalAlpha = alpha * fade * (1 - landT) * 0.5;
                    ctx.strokeStyle = pal.main;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(ex, ey, 8 + landT * 16, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = alpha * fade * (1 - landT) * 0.35;
                    ctx.fillStyle = pal.light;
                    ctx.beginPath();
                    ctx.arc(ex, ey, 5 + landT * 8, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (sweep > 0.08) {
                    ctx.globalAlpha = alpha * fade * 0.95;
                    ctx.fillStyle = pal.core;
                    ctx.beginPath();
                    ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'warrior_slash': {
                const sweep = easeOutBack(clamp01(progress / 0.55));
                const slashAng = ang - 1.1 + sweep * 1.6;
                const slashR = r * (0.7 + sweep * 0.45);
                const tail = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                drawArcSlash(ctx, x, y, slashAng, slashR, -0.15, 0.95, pal.dark, 10, alpha * 0.45 * tail);
                drawArcSlash(ctx, x, y, slashAng, slashR, -0.1, 0.85, pal.main, 7, alpha * 0.85 * tail);
                drawArcSlash(ctx, x, y, slashAng, slashR * 0.82, -0.05, 0.7, pal.light, 3, alpha * tail);
                drawArcSlash(ctx, x, y, slashAng, slashR * 0.7, 0, 0.55, pal.core, 2, alpha * 0.9 * tail);
                ctx.restore();

                const shockT = easeOutCubic(clamp01((progress - 0.12) / 0.55));
                if (shockT > 0) {
                    const sr = r * (0.3 + shockT * 0.9);
                    ctx.globalAlpha = alpha * (1 - shockT) * 0.65;
                    drawRing(ctx, x, y, sr, pal.light, 4, alpha * (1 - shockT));
                    ctx.fillStyle = pal.main;
                    ctx.globalAlpha = alpha * (1 - shockT) * 0.18;
                    ctx.beginPath();
                    ctx.arc(x, y, sr * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }

            case 'archer_shot': {
                const t = easeOutCubic(progress);
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                const bang = Math.atan2(ty - oy, tx - ox);

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let i = 4; i >= 0; i--) {
                    const lag = clamp01(t - i * 0.06);
                    if (lag <= 0) continue;
                    const lx = ox + (tx - ox) * lag;
                    const ly = oy + (ty - oy) * lag;
                    ctx.globalAlpha = alpha * (0.15 + 0.12 * (4 - i));
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(lx - Math.cos(bang) * 14, ly - Math.sin(bang) * 14);
                    ctx.lineTo(lx + Math.cos(bang) * 8, ly + Math.sin(bang) * 8);
                    ctx.stroke();
                }
                ctx.restore();

                ctx.save();
                ctx.translate(bx, by);
                ctx.rotate(bang);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.moveTo(14, 0);
                ctx.lineTo(-8, -5);
                ctx.lineTo(-4, 0);
                ctx.lineTo(-8, 5);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = pal.core;
                ctx.fillRect(-10, -1, 8, 2);
                ctx.restore();

                if (progress > 0.75) {
                    const hitT = (progress - 0.75) / 0.25;
                    const star = r * 0.35 * (1 + hitT * 0.8);
                    ctx.save();
                    ctx.globalAlpha = alpha * (1 - hitT);
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 2;
                    for (let i = 0; i < 4; i++) {
                        const a = bang + (i * Math.PI / 2);
                        ctx.beginPath();
                        ctx.moveTo(tx - Math.cos(a) * star, ty - Math.sin(a) * star);
                        ctx.lineTo(tx + Math.cos(a) * star, ty + Math.sin(a) * star);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                break;
            }

            case 'mage_bolt': {
                const t = easeOutQuad(progress);
                const bx = ox + (tx - ox) * Math.min(1, t * 1.15);
                const by = oy + (ty - oy) * Math.min(1, t * 1.15);

                if (progress < 0.35) {
                    const ct = progress / 0.35;
                    const runeR = 22 * (0.6 + ct * 0.5);
                    ctx.save();
                    ctx.translate(ox, oy);
                    ctx.rotate(elapsed * 0.006);
                    ctx.globalAlpha = alpha * (1 - ct * 0.3);
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    for (let i = 0; i < 6; i++) {
                        const a = (i / 6) * Math.PI * 2;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(a) * runeR * 0.5, Math.sin(a) * runeR * 0.5);
                        ctx.lineTo(Math.cos(a) * runeR, Math.sin(a) * runeR);
                        ctx.stroke();
                    }
                    ctx.restore();
                }

                const orbR = 10 + Math.sin(elapsed * 0.02) * 2;
                const g = ctx.createRadialGradient(bx, by, 0, bx, by, orbR * 2.2);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.4, pal.light);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha;
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(bx, by, orbR * 2, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 2;
                ctx.globalAlpha = alpha * 0.7;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();

                if (progress > 0.55) {
                    const nt = (progress - 0.55) / 0.45;
                    const novaR = r * easeOutCubic(nt);
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    for (let ring = 0; ring < 3; ring++) {
                        const rr = novaR * (0.45 + ring * 0.28);
                        ctx.globalAlpha = alpha * (1 - nt) * (0.5 - ring * 0.12);
                        drawRing(ctx, tx, ty, rr, ring === 0 ? pal.core : pal.light, 4 - ring, alpha);
                    }
                    ctx.restore();
                    ctx.globalAlpha = alpha * (1 - nt) * 0.35;
                    ctx.fillStyle = pal.main;
                    ctx.beginPath();
                    ctx.arc(tx, ty, novaR * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                    for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * Math.PI * 2 + elapsed * 0.004;
                        ctx.strokeStyle = pal.light;
                        ctx.lineWidth = 2;
                        ctx.globalAlpha = alpha * (1 - nt) * 0.6;
                        ctx.beginPath();
                        ctx.moveTo(tx, ty);
                        ctx.lineTo(tx + Math.cos(a) * novaR, ty + Math.sin(a) * novaR);
                        ctx.stroke();
                    }
                }
                break;
            }

            case 'assassin_cut': {
                const t = easeOutCubic(progress);
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;

                ctx.save();
                ctx.globalAlpha = alpha * 0.35 * (1 - t);
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 3;
                ctx.setLineDash([6, 8]);
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();

                ctx.save();
                ctx.globalAlpha = alpha * 0.25;
                ctx.fillStyle = '#110018';
                ctx.beginPath();
                ctx.ellipse(tx, ty + 8, r * 0.55, r * 0.22, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                const cutT = clamp01((progress - 0.15) / 0.5);
                if (cutT > 0) {
                    const len = r * (0.5 + cutT * 0.7);
                    const fade = 1 - clamp01((progress - 0.5) / 0.5);
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.lineCap = 'round';
                    for (let i = 0; i < 2; i++) {
                        const a = ang + (i * Math.PI / 2) - Math.PI / 4 + elapsed * 0.002;
                        ctx.strokeStyle = i === 0 ? pal.main : pal.light;
                        ctx.lineWidth = i === 0 ? 5 : 2;
                        ctx.globalAlpha = alpha * fade * (i === 0 ? 0.9 : 0.7);
                        ctx.beginPath();
                        ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
                        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                break;
            }

            case 'aoe_nova': {
                const t = easeOutCubic(progress);
                const nr = r * t;
                const g = ctx.createRadialGradient(x, y, nr * 0.1, x, y, nr);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.25, pal.light);
                g.addColorStop(0.65, pal.main);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha * (1 - t * 0.55);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, nr, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-elapsed * 0.003);
                ctx.globalAlpha = alpha * (1 - t * 0.35);
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 3;
                ctx.setLineDash([10, 7]);
                ctx.beginPath();
                ctx.arc(0, 0, nr * 0.88, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    ctx.fillStyle = pal.core;
                    ctx.fillRect(Math.cos(a) * nr * 0.92 - 2, Math.sin(a) * nr * 0.92 - 2, 4, 4);
                }
                ctx.restore();
                break;
            }

            case 'aoe_shock': {
                const t = easeOutQuad(progress);
                const sr = r * (0.25 + t * 1.05);
                ctx.globalAlpha = alpha * (1 - t);
                drawRing(ctx, x, y, sr, pal.main, 5, alpha * (1 - t));
                drawRing(ctx, x, y, sr * 0.78, pal.light, 2, alpha * (1 - t) * 0.7);
                break;
            }

            case 'buff_aura': {
                const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.012);
                for (let i = 0; i < 3; i++) {
                    const phase = (progress + i * 0.18) % 1;
                    const br = r * (0.35 + phase * 0.75) * pulse;
                    ctx.globalAlpha = alpha * (1 - phase) * 0.55;
                    drawRing(ctx, x, y, br, i === 1 ? pal.light : pal.main, 3 - i, alpha * (1 - phase));
                }
                ctx.globalAlpha = alpha * 0.35;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.arc(x, y, r * 0.22 * pulse, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + elapsed * 0.002;
                    const dist = r * 0.55 + Math.sin(elapsed * 0.008 + i) * 8;
                    ctx.globalAlpha = alpha * 0.5;
                    ctx.fillStyle = pal.core;
                    ctx.fillRect(x + Math.cos(a) * dist - 2, y + Math.sin(a) * dist - 6, 4, 8);
                }
                break;
            }

            case 'hit_spark': {
                const t = easeOutCubic(progress);
                const sr = r * (0.25 + t * 0.85);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (1 - t);
                const g = ctx.createRadialGradient(x, y, 0, x, y, sr);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.4, pal.light);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, sr, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 6; i++) {
                    const a = ang + (i / 6) * Math.PI * 2;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * sr * 0.9, y + Math.sin(a) * sr * 0.9);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'chain_lightning': {
                // 闪电链：多道闪电从原点弹跳到各目标
                const chainCount = (effect.chainCount || 3);
                const chainR = r;
                const t = easeOutCubic(clamp01(progress / 0.6));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < chainCount; i++) {
                    const phase = (i / chainCount) * Math.PI * 2 + elapsed * 0.005;
                    const dist = chainR * (0.35 + (t * 0.55) * (1 - i * 0.12));
                    const segs = 5 + i * 2;
                    const segLen = dist / segs;
                    let cx = x, cy = y;
                    const a0 = phase + ang;

                    // Outer core glow
                    ctx.globalAlpha = alpha * fade * (0.9 - i * 0.25);
                    for (let s = 0; s < segs; s++) {
                        const jitter = (s % 2 === 0 ? 1 : -1) * (8 + Math.sin(elapsed * 0.03 + s * 2) * 6) * (1 - i * 0.2);
                        const segAng = a0 + (s / segs) * 0.4 + jitter * 0.04;
                        const nx = cx + Math.cos(segAng) * segLen;
                        const ny = cy + Math.sin(segAng) * segLen;
                        ctx.strokeStyle = i === 0 ? pal.core : (i === 1 ? pal.light : pal.main);
                        ctx.lineWidth = i === 0 ? 4 : (i === 1 ? 3 : 2);
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(nx, ny);
                        ctx.stroke();
                        cx = nx; cy = ny;
                    }

                    // Inner bright line
                    cx = x; cy = y;
                    ctx.globalAlpha = alpha * fade * (0.7 - i * 0.2);
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    for (let s = 0; s < segs; s++) {
                        const jitter = (s % 2 === 0 ? 1 : -1) * (6 + Math.sin(elapsed * 0.03 + s * 2) * 4);
                        const segAng = a0 + (s / segs) * 0.4 + jitter * 0.04;
                        const nx = cx + Math.cos(segAng) * segLen;
                        const ny = cy + Math.sin(segAng) * segLen;
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(nx, ny);
                        ctx.stroke();
                        cx = nx; cy = ny;
                    }

                    // Fork branches
                    if (i === 0 && t > 0.4) {
                        for (let fk = 0; fk < 3; fk++) {
                            const fa = a0 + (fk - 1) * 0.35 + Math.sin(elapsed * 0.02) * 0.2;
                            const fd = dist * 0.4;
                            const fx = x + Math.cos(a0) * dist * 0.3;
                            const fy = y + Math.sin(a0) * dist * 0.3;
                            ctx.globalAlpha = alpha * fade * 0.4 * (t - 0.4) / 0.6;
                            ctx.strokeStyle = pal.light;
                            ctx.lineWidth = 1.5;
                            ctx.beginPath();
                            ctx.moveTo(fx, fy);
                            ctx.lineTo(fx + Math.cos(fa) * fd, fy + Math.sin(fa) * fd);
                            ctx.stroke();
                        }
                    }
                }
                ctx.restore();
                break;
            }

            case 'precise_strike': {
                // 精准打击：快速交叉斩击 + 冲击波
                const t = easeOutBack(clamp01(progress / 0.5));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.3) / 0.7));
                const cx = x, cy = y;

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';

                // Cross blades
                for (let i = 0; i < 2; i++) {
                    const bladeAng = ang + Math.PI / 4 + i * Math.PI / 2 - (1 - t) * 0.6;
                    const len = r * (0.4 + t * 0.7);

                    ctx.globalAlpha = alpha * fade * 0.7;
                    ctx.strokeStyle = pal.dark;
                    ctx.lineWidth = 8;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(cx - Math.cos(bladeAng) * len * 0.3, cy - Math.sin(bladeAng) * len * 0.3);
                    ctx.lineTo(cx + Math.cos(bladeAng) * len, cy + Math.sin(bladeAng) * len);
                    ctx.stroke();

                    ctx.globalAlpha = alpha * fade * 0.85;
                    ctx.strokeStyle = pal.main;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(cx - Math.cos(bladeAng) * len * 0.3, cy - Math.sin(bladeAng) * len * 0.3);
                    ctx.lineTo(cx + Math.cos(bladeAng) * len, cy + Math.sin(bladeAng) * len);
                    ctx.stroke();

                    ctx.globalAlpha = alpha * fade;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(cx - Math.cos(bladeAng) * len * 0.2, cy - Math.sin(bladeAng) * len * 0.2);
                    ctx.lineTo(cx + Math.cos(bladeAng) * len * 0.85, cy + Math.sin(bladeAng) * len * 0.85);
                    ctx.stroke();
                }

                // Burst ring on hit
                if (t > 0.5) {
                    const brT = (t - 0.5) / 0.5;
                    const brR = r * 0.3 * (1 + brT * 0.8);
                    ctx.globalAlpha = alpha * (1 - brT) * 0.5;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(cx, cy, brR, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.restore();
                break;
            }

            case 'summon_circle': {
                // 召唤法阵：旋转符文圆环 + 光柱
                const t = easeOutCubic(clamp01(progress / 0.7));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.01);
                const cx = x, cy = y;

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.translate(cx, cy);

                // Outer expanding ring
                const ringR = r * t * pulse;
                ctx.globalAlpha = alpha * (1 - t * 0.4);
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 5;
                ctx.setLineDash([14, 8]);
                ctx.beginPath();
                ctx.arc(0, 0, ringR, elapsed * 0.004, elapsed * 0.004 + Math.PI * 2 * 0.92);
                ctx.stroke();
                ctx.setLineDash([]);

                // Inner bright ring
                ctx.globalAlpha = alpha * fade * 0.6;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, ringR * 0.7, -elapsed * 0.006, -elapsed * 0.006 + Math.PI * 2 * 0.85);
                ctx.stroke();

                // Runic dots
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + elapsed * 0.003;
                    const dr = ringR * 0.82;
                    ctx.globalAlpha = alpha * fade * 0.8;
                    ctx.fillStyle = i % 3 === 0 ? pal.core : pal.light;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * dr, Math.sin(a) * dr, 3 + Math.sin(elapsed * 0.015 + i) * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Center light pillar
                const pillarH = 12 + Math.sin(elapsed * 0.012) * 4;
                ctx.globalAlpha = alpha * fade * 0.4;
                const grd = ctx.createLinearGradient(0, -pillarH, 0, pillarH);
                grd.addColorStop(0, 'rgba(255,255,255,0)');
                grd.addColorStop(0.4, pal.core);
                grd.addColorStop(0.6, pal.core);
                grd.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = grd;
                ctx.fillRect(-3, -pillarH, 6, pillarH * 2);

                ctx.restore();
                break;
            }

            case 'blink_trail': {
                // 闪烁轨迹：残影 + 烟雾
                const t = easeOutCubic(clamp01(progress / 0.55));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.2) / 0.8));

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';

                // After-image silhouettes (backward)
                for (let i = 3; i >= 0; i--) {
                    const lag = i * 0.08;
                    const imgT = clamp01(t - lag);
                    if (imgT <= 0) continue;
                    const imgX = x + Math.cos(ang + Math.PI) * r * imgT;
                    const imgY = y + Math.sin(ang + Math.PI) * r * imgT;
                    ctx.globalAlpha = alpha * fade * (0.25 - i * 0.06);
                    ctx.fillStyle = i === 0 ? pal.main : pal.dark;
                    ctx.beginPath();
                    const imgR = 8 - i * 1.5;
                    ctx.arc(imgX, imgY, imgR, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Directional dash line
                const dashLen = r * t;
                ctx.globalAlpha = alpha * fade * 0.4;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 3;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - Math.cos(ang) * dashLen, y - Math.sin(ang) * dashLen);
                ctx.stroke();
                ctx.setLineDash([]);

                // Bright streak
                ctx.globalAlpha = alpha * fade * 0.55;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - 3, y - 3);
                ctx.lineTo(x - Math.cos(ang) * dashLen * 0.7 + 3, y - Math.sin(ang) * dashLen * 0.7 + 3);
                ctx.stroke();

                // Disappear poof at origin
                ctx.globalAlpha = alpha * fade * 0.3;
                ctx.fillStyle = pal.light;
                for (let i = 0; i < 5; i++) {
                    const pa = Math.PI * 2 * i / 5 + elapsed * 0.006;
                    const pd = r * 0.25 * (1 + t);
                    ctx.beginPath();
                    ctx.arc(x + Math.cos(pa) * pd, y + Math.sin(pa) * pd, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
                break;
            }

            case 'field_pulse': {
                // 领域脉冲：多层扩散/收缩光环
                const pulseCount = effect.pulseCount || 3;
                const fieldColor = effect.fieldColor || '#55aa44';
                const t = easeOutCubic(clamp01(progress / 0.75));
                const cx = x, cy = y;

                ctx.save();
                ctx.globalCompositeOperation = 'lighter';

                for (let p = 0; p < pulseCount; p++) {
                    const phase = (progress + p * (1 / pulseCount)) % 1;
                    const pr = r * (0.2 + phase * 0.8);
                    const fa = 1 - phase;

                    // Filled ring
                    ctx.globalAlpha = alpha * fa * 0.15;
                    ctx.fillStyle = fieldColor;
                    ctx.beginPath();
                    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
                    ctx.fill();

                    // Border ring
                    ctx.globalAlpha = alpha * fa * 0.5;
                    ctx.strokeStyle = p === 0 ? pal.core : pal.light;
                    ctx.lineWidth = p === 0 ? 3 : 2;
                    ctx.setLineDash([8, 6]);
                    ctx.beginPath();
                    ctx.arc(cx, cy, pr, elapsed * (p % 2 ? -0.003 : 0.004), elapsed * (p % 2 ? -0.003 : 0.004) + Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Center glow
                const coreR = r * 0.2 * (0.7 + 0.3 * Math.sin(elapsed * 0.015));
                const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
                grd.addColorStop(0, pal.core);
                grd.addColorStop(0.5, fieldColor);
                grd.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha * 0.5;
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(cx, cy, coreR * 2, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
                break;
            }

            case 'devastation_slam': {
                // 毁灭冲击：地面裂痕 + 震荡波 + 碎石迸射（二转专属）
                const half = (effect.halfAngleDeg || 70) * Math.PI / 180;
                const coneR = r;
                const t = easeOutBack(clamp01(progress / 0.55));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';

                // Ground crack lines
                ctx.globalAlpha = alpha * fade * 0.5;
                ctx.strokeStyle = '#ffeebb';
                ctx.lineWidth = 3;
                ctx.setLineDash([10, 4]);
                for (let i = 0; i < 5; i++) {
                    const a = -half + (i / 4) * half * 2;
                    const jitter = Math.sin(i * 2.7 + elapsed * 0.01) * 12;
                    const cr = coneR * (0.5 + t * 0.5);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * cr + jitter * Math.sin(a), Math.sin(a) * cr - jitter * Math.cos(a));
                    ctx.stroke();
                }
                ctx.setLineDash([]);

                // Heavy impact waves
                for (let w = 0; w < 3; w++) {
                    const wp = (t + w * 0.15) % 1;
                    const wr = coneR * wp * 1.1;
                    ctx.globalAlpha = alpha * (1 - wp) * 0.6;
                    ctx.strokeStyle = w === 0 ? pal.core : (w === 1 ? pal.light : pal.main);
                    ctx.lineWidth = w === 0 ? 5 : 3;
                    ctx.beginPath();
                    const segCount = 24;
                    for (let s = 0; s <= segCount; s++) {
                        const pct = s / segCount;
                        const a = -half + pct * half * 2;
                        const rr = wr * (0.85 + Math.sin(pct * 8 + elapsed * 0.015) * 0.15);
                        const sx = Math.cos(a) * rr;
                        const sy = Math.sin(a) * rr;
                        if (s === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    }
                    ctx.stroke();
                }

                // Core explosion
                const coreR = coneR * 0.2 * (t * 1.5);
                const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
                grd.addColorStop(0, '#ffffff');
                grd.addColorStop(0.3, pal.core);
                grd.addColorStop(0.7, pal.main);
                grd.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha * (1 - t * 0.5);
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(0, 0, coreR, 0, Math.PI * 2);
                ctx.fill();

                // Rock debris particles (stylized)
                ctx.globalAlpha = alpha * fade * 0.6;
                for (let i = 0; i < 14; i++) {
                    const a = -half + (Math.random() * half * 2);
                    const dr = coneR * (0.2 + t * 0.8 * Math.random());
                    const sz = 2 + Math.random() * 4;
                    ctx.fillStyle = Math.random() > 0.5 ? '#cc8844' : '#665544';
                    ctx.fillRect(Math.cos(a) * dr - sz / 2, Math.sin(a) * dr - sz / 2, sz, sz);
                }

                ctx.restore();
                break;
            }

            case 'holy_shield_bash': {
                const half = (effect.halfAngleDeg || 55) * Math.PI / 180;
                const coneR = r;
                const sweep = easeOutBack(clamp01(progress / 0.48));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const reach = coneR * (0.2 + sweep * 0.88);

                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';

                ctx.globalAlpha = alpha * fade * 0.22;
                const wg = ctx.createLinearGradient(0, 0, reach, 0);
                wg.addColorStop(0, pal.core);
                wg.addColorStop(0.55, pal.light);
                wg.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = wg;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, reach, -half, half);
                ctx.closePath();
                ctx.fill();

                ctx.globalAlpha = alpha * fade * 0.55;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.moveTo(8, -18);
                ctx.lineTo(reach * 0.92, -half * reach * 0.78);
                ctx.lineTo(reach, 0);
                ctx.lineTo(reach * 0.92, half * reach * 0.78);
                ctx.lineTo(8, 18);
                ctx.closePath();
                ctx.fill();

                ctx.globalAlpha = alpha * fade * 0.9;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(0, 0, reach * 0.94, -half * 0.92, half * 0.92);
                ctx.stroke();

                ctx.globalAlpha = alpha * fade * 0.75;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -14);
                ctx.lineTo(0, 14);
                ctx.moveTo(-6, 0);
                ctx.lineTo(reach * 0.55, 0);
                ctx.stroke();

                if (sweep > 0.5) {
                    ctx.globalAlpha = alpha * fade * clamp01((sweep - 0.5) / 0.5) * 0.65;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(reach * 0.85, 0, 12 + sweep * 8, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'holy_shield_ripple': {
                const t = easeOutCubic(clamp01(progress / 0.65));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const ringR = r * (0.45 + t * 0.95);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                drawRing(ctx, x, y, ringR, pal.main, 4, alpha * fade * 0.85);
                drawRing(ctx, x, y, ringR * 0.72, pal.core, 2, alpha * fade * 0.65);
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                for (let i = 0; i < 4; i++) {
                    const a = ang + (i / 4) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * ringR * 0.35, y + Math.sin(a) * ringR * 0.35);
                    ctx.lineTo(x + Math.cos(a) * ringR * 0.9, y + Math.sin(a) * ringR * 0.9);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'berserker_whirlwind': {
                const sweep = easeOutBack(clamp01(progress / 0.55));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const spin = ang + sweep * Math.PI * 2.4;
                ctx.save();
                ctx.translate(x, y);
                ctx.globalCompositeOperation = 'lighter';
                const layers = [
                    { rm: 0.55, lw: 12, col: pal.dark, a: 0.45 },
                    { rm: 0.72, lw: 10, col: pal.main, a: 0.95 },
                    { rm: 0.88, lw: 6, col: pal.light, a: 0.85 },
                    { rm: 0.65, lw: 3, col: pal.core, a: 1 }
                ];
                layers.forEach((layer, ri) => {
                    const ringR = r * layer.rm;
                    const span = Math.PI * 2 * Math.min(1, sweep * 1.08);
                    const start = spin + ri * 0.4 - span;
                    const end = spin + ri * 0.4;
                    ctx.globalAlpha = alpha * fade * layer.a;
                    ctx.strokeStyle = layer.col;
                    ctx.lineWidth = layer.lw;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(0, 0, ringR, start, end);
                    ctx.stroke();
                });
                if (sweep > 0.4) {
                    ctx.globalAlpha = alpha * fade * 0.35;
                    ctx.fillStyle = pal.main;
                    ctx.beginPath();
                    ctx.arc(0, 0, r * sweep * 0.95, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'fury_blood_mist': {
                const t = easeOutCubic(clamp01(progress / 0.7));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const mistR = r * (0.3 + t * 0.85);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.28;
                const g = ctx.createRadialGradient(x, y, 0, x, y, mistR);
                g.addColorStop(0, 'rgba(255,120,80,0.5)');
                g.addColorStop(0.5, pal.main);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, mistR, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 8; i++) {
                    const a = ang + (i / 8) * Math.PI * 2 + elapsed / 300;
                    ctx.globalAlpha = alpha * fade * 0.4;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * mistR * 0.75, y + Math.sin(a) * mistR * 0.75);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'furious_charge_trail': {
                const t = easeOutCubic(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const len = r * t;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.5;
                ctx.fillStyle = pal.main;
                ctx.fillRect(0, -14, len, 28);
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();
                for (let i = 0; i < 5; i++) {
                    const ox = len * (0.15 + i * 0.18);
                    ctx.globalAlpha = alpha * fade * (0.6 - i * 0.08);
                    ctx.fillStyle = pal.light;
                    ctx.beginPath();
                    ctx.arc(ox, (i % 2 ? 8 : -8), 6 - i, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'holy_rush_trail': {
                const t = easeOutCubic(clamp01(progress / 0.72));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.48) / 0.52));
                const len = r * t;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.4;
                ctx.fillStyle = pal.light;
                ctx.fillRect(0, -12, len, 24);
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 3;
                ctx.strokeRect(0, -10, len * 0.92, 20);
                for (let i = 0; i < 4; i++) {
                    const ox = len * (0.12 + i * 0.22);
                    ctx.globalAlpha = alpha * fade * (0.55 - i * 0.1);
                    ctx.fillStyle = pal.core;
                    ctx.beginPath();
                    ctx.arc(ox, 0, 5 - i * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'holy_consecration_burst': {
                const half = effect.halfAngleDeg ? (effect.halfAngleDeg * Math.PI / 180) : null;
                const t = easeOutBack(clamp01(progress / 0.52));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.38) / 0.62));
                const reach = r * (0.25 + t * 0.92);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                if (half != null) {
                    ctx.translate(x, y);
                    ctx.rotate(ang);
                    ctx.globalAlpha = alpha * fade * 0.3;
                    ctx.fillStyle = pal.light;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.arc(0, 0, reach, -half, half);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = alpha * fade * 0.85;
                    ctx.strokeStyle = pal.main;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(0, 0, reach * 0.95, -half * 0.92, half * 0.92);
                    ctx.stroke();
                } else {
                    ctx.globalAlpha = alpha * fade * 0.35;
                    const g = ctx.createRadialGradient(x, y, 0, x, y, reach);
                    g.addColorStop(0, pal.core);
                    g.addColorStop(0.45, pal.light);
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(x, y, reach, 0, Math.PI * 2);
                    ctx.fill();
                    drawRing(ctx, x, y, reach * 0.95, pal.main, 4, alpha * fade * 0.88);
                }
                ctx.restore();
                break;
            }

            case 'furious_charge_slam': {
                const half = (effect.halfAngleDeg || 75) * Math.PI / 180;
                const coneR = r;
                const sweep = easeOutBack(clamp01(progress / 0.5));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.38) / 0.62));
                const reach = coneR * (0.15 + sweep * 0.92);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.25;
                ctx.fillStyle = pal.dark;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, reach, -half, half);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.9;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 9;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(0, 0, reach * 0.94, -half * 0.92, half * 0.92);
                ctx.stroke();
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, -12);
                ctx.lineTo(reach * 0.85, 0);
                ctx.lineTo(0, 12);
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'blood_roar_wave': {
                const half = (effect.halfAngleDeg || 40) * Math.PI / 180;
                const coneR = r;
                const sweep = easeOutBack(clamp01(progress / 0.52));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const reach = coneR * (0.2 + sweep * 0.9);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.2;
                ctx.fillStyle = '#aa1111';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, reach, -half, half);
                ctx.closePath();
                ctx.fill();
                for (let wave = 0; wave < 3; wave++) {
                    const wr = reach * (0.45 + wave * 0.22) * sweep;
                    ctx.globalAlpha = alpha * fade * (0.85 - wave * 0.2);
                    ctx.strokeStyle = wave === 0 ? pal.core : pal.main;
                    ctx.lineWidth = 6 - wave * 1.5;
                    ctx.beginPath();
                    ctx.arc(0, 0, wr, -half * 0.88, half * 0.88);
                    ctx.stroke();
                }
                ctx.globalAlpha = alpha * fade * 0.7;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                for (let i = -2; i <= 2; i++) {
                    const a = i * 0.12;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * reach * 0.95, Math.sin(a) * reach * 0.95);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'fury_transform': {
                const t = easeOutBack(clamp01(progress / 0.55));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.42) / 0.58));
                const ringR = r * (0.25 + t * 1.05);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.45;
                const g = ctx.createRadialGradient(x, y, 0, x, y, ringR);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.35, pal.main);
                g.addColorStop(0.7, pal.dark);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + elapsed / 250;
                    const fx = x + Math.cos(a) * ringR * 0.55;
                    const fy = y + Math.sin(a) * ringR * 0.55 - t * 30;
                    ctx.globalAlpha = alpha * fade * 0.65;
                    ctx.fillStyle = pal.light;
                    ctx.beginPath();
                    ctx.arc(fx, fy, 5 + t * 4, 0, Math.PI * 2);
                    ctx.fill();
                }
                drawRing(ctx, x, y, ringR * 0.92, pal.main, 5, alpha * fade * 0.9);
                ctx.restore();
                break;
            }

            case 'fury_blood_aura': {
                const t = easeOutCubic(clamp01(progress / 0.65));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const pulse = 1 + Math.sin(elapsed / 120) * 0.06;
                const ringR = r * (0.5 + t * 0.55) * pulse;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                drawRing(ctx, x, y, ringR, pal.main, 4, alpha * fade * 0.8);
                drawRing(ctx, x, y, ringR * 0.78, pal.core, 2, alpha * fade * 0.55);
                ctx.globalAlpha = alpha * fade * 0.2;
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 8;
                ctx.setLineDash([6, 10]);
                ctx.beginPath();
                ctx.arc(x, y, ringR * 1.05, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                break;
            }

            case 'guardian_shield_slam': {
                const half = (effect.halfAngleDeg || 50) * Math.PI / 180;
                const coneR = r;
                const sweep = easeOutBack(clamp01(progress / 0.48));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.36) / 0.64));
                const reach = coneR * (0.18 + sweep * 0.9);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.2;
                ctx.fillStyle = pal.light;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, reach, -half, half);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.88;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.moveTo(6, -20);
                ctx.lineTo(reach * 0.9, -half * reach * 0.82);
                ctx.lineTo(reach, 0);
                ctx.lineTo(reach * 0.9, half * reach * 0.82);
                ctx.lineTo(6, 20);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.7;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(0, 0, reach * 0.92, -half * 0.9, half * 0.9);
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'guardian_aegis_ripple': {
                const t = easeOutCubic(clamp01(progress / 0.62));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.42) / 0.58));
                const ringR = r * (0.42 + t * 0.95);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                drawRing(ctx, x, y, ringR, pal.main, 4, alpha * fade * 0.88);
                drawRing(ctx, x, y, ringR * 0.7, pal.core, 2, alpha * fade * 0.6);
                ctx.globalAlpha = alpha * fade * 0.45;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                for (let i = 0; i < 6; i++) {
                    const a = ang - Math.PI / 2 + (i / 6) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * ringR * 0.25, y + Math.sin(a) * ringR * 0.25);
                    ctx.lineTo(x + Math.cos(a) * ringR, y + Math.sin(a) * ringR);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'guardian_charge_trail': {
                const t = easeOutCubic(clamp01(progress / 0.72));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.48) / 0.52));
                const len = r * t;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.fillStyle = pal.light;
                ctx.fillRect(0, -16, len, 32);
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 4;
                ctx.strokeRect(0, -12, len * 0.92, 24);
                ctx.fillStyle = pal.core;
                ctx.beginPath();
                ctx.moveTo(len * 0.15, -10);
                ctx.lineTo(len * 0.15, 10);
                ctx.lineTo(len * 0.55, 0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'guardian_sanctuary_burst': {
                const t = easeOutBack(clamp01(progress / 0.52));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.38) / 0.62));
                const ringR = r * (0.28 + t * 0.92);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.38;
                const g = ctx.createRadialGradient(x, y, 0, x, y, ringR);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.45, pal.light);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.fill();
                drawRing(ctx, x, y, ringR * 0.95, pal.main, 4, alpha * fade * 0.9);
                ctx.globalAlpha = alpha * fade * 0.55;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.72, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                break;
            }

            case 'guardian_aegis_aura': {
                const t = easeOutCubic(clamp01(progress / 0.62));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.48) / 0.52));
                const pulse = 1 + Math.sin(elapsed / 140) * 0.05;
                const ringR = r * (0.48 + t * 0.52) * pulse;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                drawRing(ctx, x, y, ringR, pal.main, 3, alpha * fade * 0.82);
                drawRing(ctx, x, y, ringR * 0.76, pal.core, 2, alpha * fade * 0.55);
                ctx.globalAlpha = alpha * fade * 0.25;
                ctx.fillStyle = pal.light;
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.55, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'guardian_war_cry': {
                const t = easeOutBack(clamp01(progress / 0.5));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const ringR = r * (0.2 + t * 0.95);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let wave = 0; wave < 3; wave++) {
                    const wr = ringR * (0.55 + wave * 0.2);
                    ctx.globalAlpha = alpha * fade * (0.8 - wave * 0.22);
                    ctx.strokeStyle = wave === 0 ? pal.core : pal.main;
                    ctx.lineWidth = 7 - wave * 2;
                    ctx.beginPath();
                    ctx.arc(x, y, wr, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = alpha * fade * 0.65;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + elapsed / 280;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * ringR * 0.2, y + Math.sin(a) * ringR * 0.2);
                    ctx.lineTo(x + Math.cos(a) * ringR * 0.85, y + Math.sin(a) * ringR * 0.85);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'guardian_sanctuary_dome': {
                const t = easeOutCubic(clamp01(progress / 0.58));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.42) / 0.58));
                const domeR = r * (0.35 + t * 0.95);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.22;
                ctx.fillStyle = pal.light;
                ctx.beginPath();
                ctx.arc(x, y, domeR, Math.PI, 0);
                ctx.lineTo(x + domeR, y);
                ctx.lineTo(x - domeR, y);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.75;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(x, y, domeR, Math.PI, 0);
                ctx.stroke();
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, domeR * 0.65, Math.PI, 0);
                ctx.stroke();
                drawRing(ctx, x, y, domeR * 0.35, pal.core, 2, alpha * fade * 0.5);
                ctx.restore();
                break;
            }

            case 'light_spear_throw': {
                const t = easeOutCubic(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.55) / 0.45));
                const sx = ox;
                const sy = oy;
                const ex = tx;
                const ey = ty;
                const cx = sx + (ex - sx) * t;
                const cy = sy + (ey - sy) * t;
                const spearAng = Math.atan2(ey - sy, ex - sx);
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(spearAng);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade;
                ctx.shadowColor = pal.light;
                ctx.shadowBlur = 12;
                const len = 32 + r * 0.08;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.moveTo(len * 0.5, 0);
                ctx.lineTo(-len * 0.3, -4);
                ctx.lineTo(-len * 0.15, 0);
                ctx.lineTo(-len * 0.3, 4);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(cx, cy);
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'light_spear_impact': {
                const t = easeOutBack(clamp01(progress / 0.55));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const ringR = r * (0.35 + t * 0.85);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.5;
                const g = ctx.createRadialGradient(x, y, 0, x, y, ringR);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.4, pal.light);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.fill();
                drawRing(ctx, x, y, ringR * 0.92, pal.main, 4, alpha * fade * 0.85);
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + elapsed / 200;
                    ctx.globalAlpha = alpha * fade * 0.7;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * ringR * 0.75, y + Math.sin(a) * ringR * 0.75);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'holy_domain_cast': {
                const t = easeOutCubic(clamp01(progress / 0.7));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const ringR = r * (0.2 + t * 0.95);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.35;
                const g = ctx.createRadialGradient(x, y, ringR * 0.1, x, y, ringR);
                g.addColorStop(0, 'rgba(232,250,255,0.55)');
                g.addColorStop(0.5, pal.light);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.75;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 3;
                ctx.setLineDash([10, 8]);
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.98, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                drawRing(ctx, x, y, ringR * 0.55, pal.core, 2, alpha * fade * 0.6);
                ctx.restore();
                break;
            }

            default:
                break;
        }
    };
})();

