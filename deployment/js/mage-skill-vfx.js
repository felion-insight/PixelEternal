/**
 * 法师系职业技能视觉特效（巫师 / 贤者 / 术士）
 * 全部使用 streak / beam / ring / field 特效，不使用默认弹道小球。
 */
(function () {
    'use strict';

    const MAGE_IDS = {
        mage: true, wizard: true, archmage: true,
        sage: true, oracle: true,
        warlock: true, necromancer: true
    };

    const PAL = {
        elemental_power: { main: '#ff6633', light: '#ffaa66', core: '#fff0e0', dark: '#882200' },
        chronos_sand: { main: '#ddaa44', light: '#ffdd88', core: '#fff8e0', dark: '#88662a' },
        soul_shard_v2: { main: '#aa44dd', light: '#cc88ff', core: '#f4e8ff', dark: '#552288' },
        mana: { main: '#8855ff', light: '#bb99ff', core: '#eeddff', dark: '#4422aa' },
        mage_phase_fire: { main: '#ff4433', light: '#ff8866', core: '#fff0ee', dark: '#aa2200' },
        mage_phase_frost: { main: '#4499ff', light: '#88ccff', core: '#eef8ff', dark: '#1155aa' },
        mage_phase_overload: { main: '#44aaff', light: '#99ddff', core: '#eefaff', dark: '#1155cc' },

        // Class-specific overrides
        mage: { main: '#8866cc', light: '#bb99ff', core: '#eeddff', dark: '#4422aa' },
        wizard: { main: '#ff6622', light: '#ffaa66', core: '#fff0e0', dark: '#882200' },
        archmage: { main: '#ee4400', light: '#ff8844', core: '#fff0ee', dark: '#771100' },
        sage: { main: '#cc88ff', light: '#e0bbff', core: '#f8f0ff', dark: '#6633aa' },
        oracle: { main: '#7788ee', light: '#aaccff', core: '#f0f4ff', dark: '#223388' },
        warlock: { main: '#663399', light: '#9966cc', core: '#f0e0ff', dark: '#331155' },
        necromancer: { main: '#552288', light: '#8855bb', core: '#e8d0ff', dark: '#220044' }
    };

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
    function easeOutBack(t) {
        const c1 = 1.70158; const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    function clamp01(t) { return Math.max(0, Math.min(1, t)); }

    function classId(player) {
        if (!player || !player.classData) return null;
        return typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
    }

    function isMageTreePlayer(player) {
        const id = classId(player);
        if (id && MAGE_IDS[id]) return true;
        const base = typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId(player.classData) : null;
        return base === 'mage';
    }

    function isMageClassSkill(skillDef) {
        if (!skillDef) return false;
        if (skillDef.classId === 'mage' || MAGE_IDS[skillDef.classId]) return true;
        const cid = skillDef.classId;
        return cid && (cid.indexOf('mage') >= 0 || cid === 'sage' || cid === 'oracle'
            || cid === 'warlock' || cid === 'necromancer' || cid === 'wizard');
    }

    window.shouldHideMageSkillProjectile = function shouldHideMageSkillProjectile(player, skillDef) {
        if (!skillDef || skillDef.entityType !== 'projectile') return false;
        if (!isMageClassSkill(skillDef)) return false;
        if (skillDef.category !== 'class' && skillDef.type !== 'basic' && skillDef.slotType !== 'basic') {
            return false;
        }
        return isMageTreePlayer(player) || skillDef.classId === 'mage';
    };

    function familyFor(player, skillDef) {
        if (typeof window.getSkillVfxFamilyForPlayer === 'function') {
            return window.getSkillVfxFamilyForPlayer(player, skillDef);
        }
        return 'mana';
    }

    function palette(family) {
        return PAL[family] || PAL.mana;
    }

    function addVfx(g, x, y, opts) {
        if (!g || typeof g.addEquipmentEffect !== 'function') return;
        g.addEquipmentEffect('class_skill_vfx', x, y, opts);
    }

    function burst(g, x, y, family, count, spread) {
        const pm = g && g.particleManager;
        if (!pm || typeof pm.createSystem !== 'function') return;
        const pal = palette(family);
        pm.createSystem(x, y, {
            color: pal.main, size: 3, count: count || 12, lifetime: 400,
            fadeoutTime: 260, speed: 2.6, speedVariation: 1.4,
            angleSpread: spread || Math.PI * 2, spreadRadius: 6, pixelStyle: true
        });
    }

    function castFlash(g, x, y, family, radius) {
        const pal = palette(family);
        addVfx(g, x, y, {
            variant: 'cast_flash', duration: 200, radius: radius || 32,
            family, color: pal.light
        });
    }

    function aimTarget(primary, g, px, py, range) {
        if (primary) return primary;
        if (!g || !g.monsters) return null;
        let best = null, bd = Infinity;
        (g.monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const d = Math.hypot(m.x - px, m.y - py);
            if (d <= range && d < bd) { bd = d; best = m; }
        });
        return best;
    }

    function aimXY(target, px, py, angle, range, frac) {
        if (target) return { x: target.x, y: target.y };
        const f = frac != null ? frac : 0.85;
        return {
            x: px + Math.cos(angle) * range * f,
            y: py + Math.sin(angle) * range * f
        };
    }

    function travelStreak(g, family, ox, oy, tx, ty, angle, variant, dur, delay, extra) {
        addVfx(g, tx, ty, Object.assign({
            variant: variant || 'mage_streak',
            duration: dur || 420,
            delayMs: delay || 0,
            radius: Math.hypot(tx - ox, ty - oy) * 0.5,
            angle, family, ox, oy, targetX: tx, targetY: ty
        }, extra || {}));
    }

    function impactBurst(g, x, y, family, variant, radius, delay) {
        addVfx(g, x, y, {
            variant: variant || 'mage_impact',
            duration: 380,
            delayMs: delay || 0,
            radius: radius || 56,
            family, ox: x, oy: y
        });
        burst(g, x, y, family, 10, Math.PI * 1.5);
    }

    function radialPulse(g, x, y, family, variant, radius, dur) {
        addVfx(g, x, y, {
            variant: variant || 'mage_radial',
            duration: dur || 620,
            radius: radius || 100,
            family, ox: x, oy: y
        });
        burst(g, x, y, family, 10, Math.PI * 1.4);
    }

    function drawRing(ctx, x, y, rad, color, lw, a) {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawStreakLine(ctx, ox, oy, bx, by, pal, alpha, fade, width, coreW) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * fade * 0.35;
        ctx.strokeStyle = pal.dark;
        ctx.lineWidth = width + 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.globalAlpha = alpha * fade * 0.85;
        ctx.strokeStyle = pal.main;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.globalAlpha = alpha * fade;
        ctx.strokeStyle = pal.core;
        ctx.lineWidth = coreW || 2;
        ctx.stroke();
        ctx.restore();
    }

    // ---- 播放 VFX ----

    window.playMageSkillVfx = function playMageSkillVfx(player, skillDef, gameInstance, context) {
        if (!player || !skillDef || !gameInstance) return false;
        if (!isMageTreePlayer(player) && skillDef.classId !== 'mage') return false;

        const family = familyFor(player, skillDef);
        const angle = typeof player.angle === 'number' ? player.angle : 0;
        const px = player.x;
        const py = player.y;
        const ec = skillDef.entityConfig || {};
        const skillCtx = context || {};
        const primary = skillCtx.primaryTarget || skillCtx.lockTarget;
        const hitTargets = skillCtx.hitTargets || [];
        const id = skillDef.id;
        const range = skillDef.range || ec.maxRange || ec.range || 400;
        const aoe = skillDef.aoeRadius || 0;

        // ---- 普攻：奥术飞弹 / 巫师相位弹 ----
        if (id === 'mage_basic') {
            const combo = skillCtx.comboStep != null ? skillCtx.comboStep : 0;
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const ap = aimXY(tgt, px, py, angle, range, 0.9);
            const travelMs = 320 + combo * 40;
            const cid = classId(player);
            let streakFamily = 'mana';
            let streakVariant = combo >= 2 ? 'mage_arcane_finisher' : 'mage_arcane_ray';
            if (cid === 'wizard' && typeof window.getWizardPhaseVfxFamily === 'function') {
                streakFamily = window.getWizardPhaseVfxFamily(player) || 'elemental_power';
                const ph = typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : 'fire';
                if (ph === 'fire') streakVariant = combo >= 2 ? 'mage_fire_comet' : 'mage_arcane_ray';
                else if (ph === 'frost') streakVariant = 'mage_arcane_ray';
                else if (ph === 'overload') streakVariant = combo >= 2 ? 'mage_arcane_finisher' : 'mage_arcane_ray';
                else if (ph === 'awakening') streakVariant = 'mage_arcane_finisher';
            } else if (cid === 'mage' && typeof window.getBaseMagePhaseVfxFamily === 'function') {
                streakFamily = window.getBaseMagePhaseVfxFamily(player) || 'mana';
            } else {
                streakFamily = family;
            }
            castFlash(gameInstance, px, py, streakFamily, 28 + combo * 4);
            travelStreak(gameInstance, streakFamily, px, py, ap.x, ap.y, angle,
                streakVariant, travelMs, 60 + combo * 30, { comboStep: combo });
            const impactVar = streakVariant === 'mage_fire_comet' ? 'mage_fire_impact' : 'mage_arcane_impact';
            impactBurst(gameInstance, ap.x, ap.y, streakFamily, impactVar,
                36 + combo * 14, travelMs * 0.85);
            return true;
        }

        // ---- 巫师：元素爆发 ----
        if (id === 'elemental_burst') {
            const phase = ec.wizardBurstPhase
                || (typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : 'fire');
            if (ec.wizardAwakeningBurst || phase === 'awakening') {
                radialPulse(gameInstance, px, py, 'elemental_power', 'mage_element_nova', 200, 820);
                addVfx(gameInstance, px, py, {
                    variant: 'mage_chain_lightning', duration: 680,
                    radius: 420, angle, family: 'mage_phase_overload', chainCount: 6, ox: px, oy: py
                });
                return true;
            }
            if (phase === 'fire') {
                const coneR = ec.coneRange || 300;
                addVfx(gameInstance, px + Math.cos(angle) * coneR * 0.45, py + Math.sin(angle) * coneR * 0.45, {
                    variant: 'mage_flame_cone', duration: (ec.windupMs || 300) + (ec.channelDurationMs || 800),
                    radius: coneR, angle, family: 'mage_phase_fire', ox: px, oy: py
                });
                return true;
            }
            if (phase === 'frost') {
                const gp = skillCtx.groundPoint;
                const fx = gp ? gp.x : px + Math.cos(angle) * 180;
                const fy = gp ? gp.y : py + Math.sin(angle) * 180;
                const rad = ec.fieldRadius || 110;
                addVfx(gameInstance, fx, fy, {
                    variant: 'mage_frost_nova_mark', duration: ec.delayMs || 400,
                    radius: rad, family: 'mage_phase_frost', ox: fx, oy: fy
                });
                return true;
            }
            if (phase === 'overload') {
                const chainR = ec.range || 600;
                addVfx(gameInstance, px, py, {
                    variant: 'mage_chain_lightning', duration: 620,
                    radius: chainR, angle, family: 'mage_phase_overload',
                    chainCount: ec.chainCount || 4, ox: px, oy: py
                });
                hitTargets.forEach((m, i) => {
                    impactBurst(gameInstance, m.x, m.y, 'mage_phase_overload', 'mage_shock_impact', 44, 80 + i * 50);
                });
                return true;
            }
        }

        // ---- 巫师：相位跃迁 ----
        if (id === 'phase_shift' && skillDef.entityType === 'blink') {
            const dist = ec.distance || 150;
            const tx = px + Math.cos(angle) * dist;
            const ty = py + Math.sin(angle) * dist;
            const phase = typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : null;
            let fam = 'elemental_power';
            if (phase === 'fire') fam = 'mage_phase_fire';
            else if (phase === 'frost') fam = 'mage_phase_frost';
            else if (phase === 'overload') fam = 'mage_phase_overload';
            addVfx(gameInstance, px, py, {
                variant: 'mage_arcane_blink', duration: 480,
                radius: ec.landRadius || 70, angle, family: fam,
                phase, ox: px, oy: py, targetX: tx, targetY: ty
            });
            addVfx(gameInstance, tx, ty, {
                variant: 'mage_arcane_blink', duration: 440, delayMs: 90,
                radius: ec.landRadius || 70, angle, family: fam,
                phase, ox: tx, oy: ty, isEnd: true
            });
            burst(gameInstance, px, py, fam, 12, Math.PI * 1.6);
            burst(gameInstance, tx, ty, fam, 14, Math.PI * 2);
            return true;
        }

        // ---- 巫师：元素共鸣场 ----
        if (id === 'resonance_field') {
            const gp = skillCtx.groundPoint;
            const fx = gp ? gp.x : px + Math.cos(angle) * 160;
            const fy = gp ? gp.y : py + Math.sin(angle) * 160;
            const rad = ec.fieldRadius || skillDef.aoeRadius || 120;
            const phase = ec.wizardFieldPhase
                || (typeof window.getElementPhase === 'function' ? window.getElementPhase(player) : 'fire');
            let fam = 'elemental_power';
            let fieldVar = 'mage_resonance_field';
            if (phase === 'fire') fam = 'mage_phase_fire';
            else if (phase === 'frost') { fam = 'mage_phase_frost'; fieldVar = 'mage_frozen_ground'; }
            else if (phase === 'overload') fam = 'mage_phase_overload';
            addVfx(gameInstance, fx, fy, {
                variant: 'mage_field_deploy', duration: 1100,
                radius: rad, family: fam, ox: fx, oy: fy, wizardFieldPhase: phase
            });
            addVfx(gameInstance, fx, fy, {
                variant: fieldVar, duration: 900, delayMs: 120,
                radius: rad, family: fam, ox: fx, oy: fy, wizardFieldPhase: phase
            });
            burst(gameInstance, fx, fy, fam, 18, Math.PI * 2);
            return true;
        }

        // ---- 巫师：元素觉醒 ----
        if (id === 'elemental_awakening') {
            const rad = Math.min(skillDef.aoeRadius || ec.range || 220, 240);
            addVfx(gameInstance, px, py, {
                variant: 'mage_element_liberation', duration: 1400,
                radius: rad, family: 'elemental_power', ox: px, oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'mage_element_nova', duration: 1000, delayMs: 80,
                radius: rad * 0.95, family: 'elemental_power', ox: px, oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'mage_chain_lightning', duration: 880, delayMs: 160,
                radius: rad * 1.1, angle, family: 'mage_phase_overload', chainCount: 8, ox: px, oy: py
            });
            burst(gameInstance, px, py, 'mage_phase_fire', 14, Math.PI * 2);
            burst(gameInstance, px, py, 'mage_phase_frost', 14, Math.PI * 2);
            burst(gameInstance, px, py, 'mage_phase_overload', 14, Math.PI * 2);
            return true;
        }

        // ---- 火系弹丸 ----
        if (id === 'fireball' || id === 'flame_bolt' || id === 'lava_storm') {
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const ap = aimXY(tgt, px, py, angle, range, 0.92);
            const windup = ec.windupMs || 150;
            const travelMs = id === 'lava_storm' ? 520 : (id === 'flame_bolt' ? 480 : 400);
            const explodeR = ec.explodeRadius || 70;
            if (ec.chargeRequired || windup > 800) {
                addVfx(gameInstance, px, py, {
                    variant: 'mage_fire_charge', duration: windup + 80,
                    radius: 48, family: 'elemental_power', ox: px, oy: py
                });
            }
            castFlash(gameInstance, px, py, 'elemental_power', 36);
            travelStreak(gameInstance, 'elemental_power', px, py, ap.x, ap.y, angle,
                'mage_fire_comet', travelMs, windup, { explodeRadius: explodeR });
            impactBurst(gameInstance, ap.x, ap.y, 'elemental_power', 'mage_fire_impact',
                explodeR, windup + travelMs * 0.88);
            if (gameInstance.addEquipmentEffect) {
                gameInstance.addEquipmentEffect('fire_explosion', ap.x, ap.y, {
                    radius: explodeR, duration: 560, delayMs: windup + travelMs * 0.85
                });
            }
            return true;
        }

        // ---- 时序弹 ----
        if (id === 'timely_shot' || id === 'timely_shot_plus') {
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const ap = aimXY(tgt, px, py, angle, range, 0.88);
            castFlash(gameInstance, px, py, 'chronos_sand', 30);
            travelStreak(gameInstance, 'chronos_sand', px, py, ap.x, ap.y, angle,
                'mage_chrono_spiral', 400, 80);
            impactBurst(gameInstance, ap.x, ap.y, 'chronos_sand', 'mage_chrono_impact', 44, 360);
            return true;
        }

        // ---- 暗影连箭 / 死亡缠绕 ----
        if (id === 'shadow_arrow') {
            const combo = skillCtx.comboStep != null ? skillCtx.comboStep
                : (skillDef._comboStep != null ? skillDef._comboStep : 0);
            const colors = ec.comboStepColor || ['#663399', '#552277', '#aa44ff'];
            const col = colors[combo] || colors[0];
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const ap = aimXY(tgt, px, py, angle, range, 0.9);
            castFlash(gameInstance, px, py, 'soul_shard_v2', 28 + combo * 4);
            if (combo === 2) {
                travelStreak(gameInstance, 'soul_shard_v2', px, py, ap.x, ap.y, angle,
                    'mage_pain_arrow', 420, 60, { streakColor: col, streakWidth: 11, comboStep: 2 });
                impactBurst(gameInstance, ap.x, ap.y, 'soul_shard_v2', 'mage_pain_impact', 52, 320);
            } else if (combo === 1) {
                travelStreak(gameInstance, 'soul_shard_v2', px, py, ap.x, ap.y, angle,
                    'mage_shadow_corrupt', 400, 65, { streakColor: col, streakWidth: 9, comboStep: 1 });
                impactBurst(gameInstance, ap.x, ap.y, 'soul_shard_v2', 'mage_corruption_mist', 40, 330);
            } else {
                travelStreak(gameInstance, 'soul_shard_v2', px, py, ap.x, ap.y, angle,
                    'mage_shadow_lance', 380, 70, { streakColor: col, streakWidth: 7, comboStep: 0 });
                impactBurst(gameInstance, ap.x, ap.y, 'soul_shard_v2', 'mage_shadow_impact', 48, 340);
            }
            return true;
        }
        if (id === 'death_coil') {
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const ap = aimXY(tgt, px, py, angle, range, 0.9);
            castFlash(gameInstance, px, py, 'soul_shard_v2', 32);
            travelStreak(gameInstance, 'soul_shard_v2', px, py, ap.x, ap.y, angle,
                'mage_death_coil', 380, 70);
            impactBurst(gameInstance, ap.x, ap.y, 'soul_shard_v2', 'mage_shadow_impact', 48, 340);
            return true;
        }

        // ---- 极寒之地（冰霜新星）----
        if (id === 'frost_nova') {
            const gp = skillCtx.groundPoint;
            const fx = gp ? gp.x : px;
            const fy = gp ? gp.y : py;
            const rad = ec.fieldRadius || skillDef.aoeRadius || 100;
            castFlash(gameInstance, fx, fy, 'mage_phase_frost', 36);
            addVfx(gameInstance, fx, fy, {
                variant: 'mage_frozen_ground', duration: 720,
                radius: rad, family: 'mage_phase_frost', ox: fx, oy: fy
            });
            radialPulse(gameInstance, fx, fy, 'mage_phase_frost', 'mage_frost_ring', rad, 520);
            burst(gameInstance, fx, fy, 'mage_phase_frost', 14, Math.PI * 2);
            return true;
        }

        // ---- 闪电链 ----
        if (id === 'chain_lightning' || (skillDef.entityType === 'instant' && ec.shape === 'chain'
            && family === 'elemental_power')) {
            const chainR = ec.range || 250;
            castFlash(gameInstance, px, py, 'elemental_power', 42);
            addVfx(gameInstance, px, py, {
                variant: 'mage_chain_lightning', duration: 580,
                radius: chainR, angle, family: 'elemental_power',
                chainCount: ec.chainCount || 5, ox: px, oy: py
            });
            hitTargets.forEach((m, i) => {
                impactBurst(gameInstance, m.x, m.y, 'elemental_power', 'mage_shock_impact', 40, 90 + i * 55);
            });
            return true;
        }

        // ---- 极光束 ----
        if (id === 'aurora_beam' || (ec.shape === 'fissure' && ec.arcticPhase)) {
            const beamR = ec.range || 400;
            castFlash(gameInstance, px, py, 'elemental_power', 40);
            addVfx(gameInstance, px + Math.cos(angle) * beamR * 0.5, py + Math.sin(angle) * beamR * 0.5, {
                variant: 'mage_frost_beam', duration: 720,
                radius: beamR, angle, family: 'elemental_power',
                pierceWidth: ec.pierceWidth || 50, ox: px, oy: py
            });
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'mage_frost_hit', duration: 340, delayMs: 120 + i * 40,
                    radius: 36, family: 'elemental_power', ox: m.x, oy: m.y
                });
            });
            return true;
        }

        // ---- 闪现 ----
        if (id === 'blink' && skillDef.entityType === 'blink') {
            const dist = ec.distance || 120;
            const tx = px + Math.cos(angle) * dist;
            const ty = py + Math.sin(angle) * dist;
            const phase = typeof window.getElementPhase === 'function'
                ? window.getElementPhase(player) : null;
            addVfx(gameInstance, px, py, {
                variant: 'mage_arcane_blink', duration: 480,
                radius: ec.blastOnStartRadius || 60, angle, family,
                phase, ox: px, oy: py, targetX: tx, targetY: ty
            });
            addVfx(gameInstance, tx, ty, {
                variant: 'mage_arcane_blink', duration: 420, delayMs: 100,
                radius: ec.blastOnEndRadius || 60, angle, family,
                phase, ox: tx, oy: ty, isEnd: true
            });
            burst(gameInstance, px, py, family, 12, Math.PI * 1.6);
            burst(gameInstance, tx, ty, family, 10, Math.PI * 2);
            return true;
        }

        // ---- 元素协奏 / 元素风暴 ----
        if (id === 'elemental_symphony' || id === 'elemental_storm') {
            let rad = skillDef.aoeRadius || ec.range || 140;
            let stormFamily = 'elemental_power';
            if (id === 'elemental_storm' && typeof window.getElementPhase === 'function') {
                const ph = window.getElementPhase(player);
                if (ph === 'fire') {
                    stormFamily = 'mage_phase_fire';
                    rad = 180;
                } else if (ph === 'frost') {
                    stormFamily = 'mage_phase_frost';
                    rad = 130;
                }
            }
            castFlash(gameInstance, px, py, stormFamily, 58);
            addVfx(gameInstance, px, py, {
                variant: 'mage_element_liberation', duration: 920,
                radius: rad, family: stormFamily, ox: px, oy: py
            });
            radialPulse(gameInstance, px, py, stormFamily, 'mage_element_nova', rad, 760);
            hitTargets.forEach((m) => {
                burst(gameInstance, m.x, m.y, stormFamily, 8, Math.PI * 1.2);
            });
            return true;
        }

        // ---- 陨石 ----
        if (id === 'meteor') {
            const rad = skillDef.aoeRadius || ec.range || 160;
            castFlash(gameInstance, px, py, 'elemental_power', 62);
            addVfx(gameInstance, px, py, {
                variant: 'mage_meteor_fall', duration: 1100,
                radius: rad, family: 'elemental_power', ox: px, oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'mage_element_liberation', duration: 800, delayMs: 350,
                radius: rad * 1.1, family: 'elemental_power', ox: px, oy: py
            });
            if (gameInstance.addEquipmentEffect) {
                gameInstance.addEquipmentEffect('fire_explosion', px, py, {
                    radius: rad, duration: 720, delayMs: 400
                });
            }
            return true;
        }

        // ---- 预知之盾 ----
        if (id === 'foresight_shield') {
            const tgt = primary || player;
            castFlash(gameInstance, px, py, 'chronos_sand', 36);
            addVfx(gameInstance, tgt.x, tgt.y, {
                variant: 'mage_foresight_shield', duration: 900,
                radius: 52, family: 'chronos_sand', ox: tgt.x, oy: tgt.y
            });
            return true;
        }

        // ---- 净化时序 ----
        if (id === 'purify_time') {
            const tgt = primary || player;
            castFlash(gameInstance, px, py, 'chronos_sand', 34);
            addVfx(gameInstance, tgt.x, tgt.y, {
                variant: 'mage_chrono_purge', duration: 680,
                radius: 48, family: 'chronos_sand', ox: tgt.x, oy: tgt.y
            });
            return true;
        }

        // ---- 时光光环 ----
        if (id === 'chrono_aura') {
            castFlash(gameInstance, px, py, 'chronos_sand', 50);
            addVfx(gameInstance, px, py, {
                variant: 'mage_chrono_aura', duration: 1000,
                radius: ec.fieldRadius || 150, family: 'chronos_sand', ox: px, oy: py
            });
            return true;
        }

        // ---- 神圣回溯 / 命运系 ----
        if (id === 'sacred_rewind') {
            const tgt = primary || player;
            addVfx(gameInstance, tgt.x, tgt.y, {
                variant: 'mage_rewind_mark', duration: 760,
                radius: 44, family: 'chronos_sand', ox: tgt.x, oy: tgt.y
            });
            return true;
        }
        if (id === 'time_field') {
            radialPulse(gameInstance, px, py, 'chronos_sand', 'mage_time_dome',
                skillDef.aoeRadius || 120, 900);
            return true;
        }
        if (id === 'fate_weave' || id === 'fate_reversal') {
            const tgt = primary || player;
            addVfx(gameInstance, tgt.x, tgt.y, {
                variant: 'mage_fate_threads', duration: 820,
                radius: 56, family: 'chronos_sand', ox: tgt.x, oy: tgt.y,
                fateType: id
            });
            return true;
        }
        if (id === 'time_rewind') {
            castFlash(gameInstance, px, py, 'chronos_sand', 54);
            addVfx(gameInstance, px, py, {
                variant: 'mage_time_rewind', duration: 880,
                radius: 120, family: 'chronos_sand', ox: px, oy: py
            });
            return true;
        }

        // ---- 术士：诅咒 / 汲取 / 丰收 ----
        if (id === 'agony_curse') {
            castFlash(gameInstance, px, py, 'soul_shard_v2', 32);
            return true;
        }
        if (id === 'spreading_curse') {
            castFlash(gameInstance, px, py, 'soul_shard_v2', 36);
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            if (tgt) {
                addVfx(gameInstance, tgt.x, tgt.y, {
                    variant: 'warlock_spread_cast',
                    duration: 320,
                    radius: 28,
                    family: 'soul_shard_v2',
                    ox: px, oy: py,
                    targetX: tgt.x, targetY: tgt.y
                });
            }
            return true;
        }
        if (id === 'soul_link') {
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const ap = aimXY(tgt, px, py, angle, range, 0.85);
            const burning = typeof window.isSoulBurning === 'function' && window.isSoulBurning(player);
            addVfx(gameInstance, ap.x, ap.y, {
                variant: 'warlock_soul_link_cast', duration: 600,
                radius: Math.hypot(ap.x - px, ap.y - py), family: 'soul_shard_v2',
                ox: px, oy: py, targetX: ap.x, targetY: ap.y, soulBurn: burning
            });
            return true;
        }
        if (id === 'dark_harvest') {
            return true;
        }
        if (id === 'soul_harvest') {
            castFlash(gameInstance, px, py, 'soul_shard_v2', 40);
            const tgt = aimTarget(primary, gameInstance, px, py, range) || primary;
            if (tgt) {
                const resonance = typeof window.getDeathResonanceStacks === 'function'
                    && window.getDeathResonanceStacks(player) >= 5;
                addVfx(gameInstance, tgt.x, tgt.y, {
                    variant: 'warlock_soul_harvest_cast',
                    duration: 280,
                    radius: 36,
                    family: 'soul_shard_v2',
                    ox: px, oy: py,
                    targetX: tgt.x, targetY: tgt.y,
                    resonanceBurst: !!resonance
                });
            }
            return true;
        }

        // ---- 召唤 ----
        if (skillDef.entityType === 'summon'
            && (id === 'summon_skeleton_warrior' || id === 'summon_skeleton' || id === 'shadow_fiend'
                || id === 'undead_legion' || ec.undeadLegion || family === 'soul_shard_v2')) {
            castFlash(gameInstance, px, py, 'soul_shard_v2', 48);
            addVfx(gameInstance, px, py, {
                variant: id === 'shadow_fiend' ? 'warlock_shadow_summon' : 'mage_necro_summon',
                duration: id === 'shadow_fiend' ? 820 : 920,
                radius: id === 'undead_legion' ? 72 : (id === 'shadow_fiend' ? 52 : 58),
                family: 'soul_shard_v2', ox: px, oy: py
            });
            burst(gameInstance, px, py, 'soul_shard_v2', 14, Math.PI * 2);
            if (id === 'shadow_fiend' && gameInstance.particleManager) {
                gameInstance.particleManager.createSystem(px, py, {
                    color: '#221133', size: 4, count: 10, lifetime: 520,
                    fadeoutTime: 320, speed: 2.2, speedVariation: 1.2,
                    angleSpread: Math.PI * 2, spreadRadius: 8, pixelStyle: true
                });
            }
            return true;
        }

        // ---- 冥界之门 ----
        if (id === 'nether_gate' || ec.netherGate) {
            const fx = skillCtx.fieldX != null ? skillCtx.fieldX : px;
            const fy = skillCtx.fieldY != null ? skillCtx.fieldY : py;
            const fr = ec.fieldRadius || skillDef.aoeRadius || 120;
            addVfx(gameInstance, fx, fy, {
                variant: 'mage_nether_gate', duration: ec.fieldDurationMs || 8000,
                radius: fr, family: 'soul_shard_v2', ox: fx, oy: fy
            });
            castFlash(gameInstance, fx, fy, 'soul_shard_v2', fr * 0.4);
            return true;
        }

        // ---- 场域（法师 field） ----
        if (skillDef.entityType === 'field' && isMageClassSkill(skillDef)) {
            const fx = skillCtx.fieldX != null ? skillCtx.fieldX : px;
            const fy = skillCtx.fieldY != null ? skillCtx.fieldY : py;
            const fr = ec.fieldRadius || skillDef.aoeRadius || 80;
            addVfx(gameInstance, fx, fy, {
                variant: 'mage_field_pulse', duration: ec.fieldDurationMs || 4000,
                radius: fr, family,
                fieldColor: ec.color || pal.main, ox: fx, oy: fy
            });
            return true;
        }

        // ---- 默认 instant radial（法师） ----
        if (skillDef.entityType === 'instant' && ec.shape === 'radial') {
            radialPulse(gameInstance, px, py, family, 'mage_radial', ec.range || aoe, 600);
            hitTargets.forEach(m => burst(gameInstance, m.x, m.y, family, 6, Math.PI * 1.2));
            return true;
        }

        // ---- 默认 instant single ----
        if (skillDef.entityType === 'instant' && ec.shape === 'single') {
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const ap = aimXY(tgt, px, py, angle, range, 0.7);
            castFlash(gameInstance, px, py, family, 32);
            travelStreak(gameInstance, family, px, py, ap.x, ap.y, angle, 'mage_streak', 340, 80);
            impactBurst(gameInstance, ap.x, ap.y, family, 'mage_impact', 42, 300);
            return true;
        }

        // ---- 兜底：无小球，用 streak ----
        castFlash(gameInstance, px, py, family, 34);
        const ap = aimXY(aimTarget(primary, gameInstance, px, py, range), px, py, angle, range, 0.8);
        travelStreak(gameInstance, family, px, py, ap.x, ap.y, angle, 'mage_streak', 380, 60);
        impactBurst(gameInstance, ap.x, ap.y, family, 'mage_impact', 40, 320);
        return true;
    };

    // ---- 元素对冲 VFX ----

    window.playMageElementClashVfx = function playMageElementClashVfx(g, x, y, type, opts) {
        if (!g || !type) return;
        opts = opts || {};
        const variantMap = {
            thermal_shatter: 'mage_clash_shatter',
            thermal_shockwave: 'mage_clash_shockwave',
            resonance: 'mage_clash_resonance',
            blink_rift: 'mage_blink_rift',
            blink_start: 'mage_blink_phase_start',
            blink_end: 'mage_blink_phase_end',
            surge_echo: 'mage_surge_echo',
            surge_awakening: 'mage_surge_awakening'
        };
        const durMap = {
            thermal_shatter: 820,
            thermal_shockwave: 780,
            resonance: 480,
            blink_rift: opts.durationMs || 1500,
            blink_start: 420,
            blink_end: 520,
            surge_echo: 400,
            surge_awakening: 900
        };
        const variant = variantMap[type];
        if (!variant) return;
        const radius = opts.radius || 100;
        addVfx(g, x, y, {
            variant,
            duration: durMap[type] || 600,
            radius,
            family: 'elemental_power',
            ox: opts.ox != null ? opts.ox : x,
            oy: opts.oy != null ? opts.oy : y,
            targetX: opts.targetX,
            targetY: opts.targetY,
            fromPhase: opts.fromPhase,
            toPhase: opts.toPhase,
            phase: opts.phase
        });
        if (type === 'thermal_shatter' || type === 'thermal_shockwave') {
            burst(g, x, y, 'elemental_power', type === 'thermal_shatter' ? 18 : 14, Math.PI * 2);
        }
    };

    window.playWizardFlameStormStartVfx = function (player, skillDef, g, ec) {
        if (!player || !g) return;
        const angle = player.angle || 0;
        const coneR = (ec && ec.coneRange) || 300;
        addVfx(g, player.x + Math.cos(angle) * coneR * 0.35, player.y + Math.sin(angle) * coneR * 0.35, {
            variant: 'mage_flame_cone', duration: (ec.windupMs || 300) + (ec.channelDurationMs || 800),
            radius: coneR, angle, family: 'mage_phase_fire', ox: player.x, oy: player.y
        });
    };

    window.playWizardFlameConeTickVfx = function (player, g, angle, range) {
        if (!player || !g) return;
        addVfx(g, player.x + Math.cos(angle) * range * 0.55, player.y + Math.sin(angle) * range * 0.55, {
            variant: 'mage_flame_cone', duration: 180, radius: range * 0.55,
            angle, family: 'mage_phase_fire', ox: player.x, oy: player.y, tickOnly: true
        });
    };

    window.playWizardFrostNovaMarkVfx = function (player, skillDef, g, x, y, radius) {
        if (!g) return;
        const rad = radius || 110;
        addVfx(g, x, y, {
            variant: 'mage_field_deploy', duration: 900,
            radius: rad, family: 'mage_phase_frost', ox: x, oy: y, wizardFieldPhase: 'frost'
        });
        addVfx(g, x, y, {
            variant: 'mage_frost_nova_mark', duration: 520, delayMs: 80,
            radius: rad, family: 'mage_phase_frost', ox: x, oy: y
        });
        burst(g, x, y, 'mage_phase_frost', 12, Math.PI * 2);
    };

    window.playWizardFrostNovaBurstVfx = function (player, skillDef, g, x, y, radius) {
        if (!g) return;
        radialPulse(g, x, y, 'mage_phase_frost', 'mage_frost_ring', radius || 110, 560);
        burst(g, x, y, 'mage_phase_frost', 16, Math.PI * 2);
        if (g.addEquipmentEffect) {
            g.addEquipmentEffect('freeze_ring', x, y, { radius: radius || 110, duration: 520 });
        }
    };

    window.playWizardResonanceFieldVfx = function (player, skillDef, g, x, y, radius) {
        if (!g || !skillDef) return;
        const ec = skillDef.entityConfig || {};
        const phase = ec.wizardFieldPhase
            || (typeof window.getElementPhase === 'function' && player ? window.getElementPhase(player) : 'fire');
        let fam = 'mage_phase_fire';
        if (phase === 'frost') fam = 'mage_phase_frost';
        else if (phase === 'overload') fam = 'mage_phase_overload';
        else if (phase === 'awakening') fam = 'elemental_power';
        const rad = radius || 120;
        addVfx(g, x, y, {
            variant: 'mage_field_deploy', duration: 1100,
            radius: rad, family: fam, ox: x, oy: y, wizardFieldPhase: phase
        });
        addVfx(g, x, y, {
            variant: 'mage_resonance_field', duration: 900, delayMs: 100,
            radius: rad, family: fam, ox: x, oy: y, wizardFieldPhase: phase
        });
        burst(g, x, y, fam, 16, Math.PI * 2);
    };

    function fusionShake(g, amp, dur) {
        if (!g || !g.screenShake) return;
        g.screenShake.amplitude = Math.max(g.screenShake.amplitude || 0, amp);
        g.screenShake.timer = Math.max(g.screenShake.timer || 0, dur);
        g.screenShake.duration = Math.max(g.screenShake.duration || 0, dur);
    }

    /** 熔岩爆发 · 0.6s 蓄力地面标记（火→冰） */
    window.playArchmageFusionMagmaChargeVfx = function playArchmageFusionMagmaChargeVfx(g, x, y, radius) {
        if (!g) return;
        const r = radius || 130;
        addVfx(g, x, y, {
            variant: 'mage_fusion_magma_charge',
            duration: 620,
            radius: r,
            family: 'elemental_power',
            ox: x, oy: y,
            fusionType: 'magma'
        });
        addVfx(g, x, y, {
            variant: 'mage_frost_nova_mark',
            duration: 580,
            radius: r * 0.72,
            family: 'mage_phase_frost',
            ox: x, oy: y,
            fusionOverlay: true
        });
        burst(g, x, y, 'mage_phase_fire', 10, Math.PI * 2);
    };

    /** 熔岩爆发 · 火山柱 + 熔岩地面（火→冰） */
    window.playArchmageFusionMagmaBurstVfx = function playArchmageFusionMagmaBurstVfx(g, x, y, radius) {
        if (!g) return;
        const r = radius || 130;
        fusionShake(g, 9, 420);
        addVfx(g, x, y, {
            variant: 'mage_fusion_magma_burst',
            duration: 1100,
            radius: r,
            family: 'elemental_power',
            ox: x, oy: y,
            fusionType: 'magma'
        });
        addVfx(g, x, y, {
            variant: 'mage_fusion_magma_ground',
            duration: 4200,
            radius: r,
            family: 'mage_phase_fire',
            ox: x, oy: y
        });
        burst(g, x, y, 'mage_phase_fire', 28, Math.PI * 2);
        burst(g, x, y, 'mage_phase_frost', 14, Math.PI * 1.4);
        if (g.addEquipmentEffect) {
            g.addEquipmentEffect('fire_explosion', x, y, { radius: r * 0.85, duration: 520 });
        }
    };

    /** 暴风眼 · 冰雷漩涡（冰→过载） */
    window.playArchmageFusionTempestVfx = function playArchmageFusionTempestVfx(g, x, y, radius) {
        if (!g) return;
        const r = radius || 150;
        fusionShake(g, 6, 360);
        addVfx(g, x, y, {
            variant: 'mage_fusion_tempest',
            duration: 980,
            radius: r,
            family: 'mage_phase_overload',
            ox: x, oy: y,
            fusionType: 'tempest'
        });
        addVfx(g, x, y, {
            variant: 'mage_chain_lightning',
            duration: 720,
            delayMs: 120,
            radius: r * 1.05,
            family: 'mage_phase_overload',
            chainCount: 8,
            ox: x, oy: y
        });
        addVfx(g, x, y, {
            variant: 'mage_frost_ring',
            duration: 640,
            delayMs: 80,
            radius: r * 0.92,
            family: 'mage_phase_frost',
            ox: x, oy: y
        });
        burst(g, x, y, 'mage_phase_frost', 20, Math.PI * 2);
        burst(g, x, y, 'mage_phase_overload', 18, Math.PI * 2);
    };

    /** 等离子波 · 锥形电浆冲击（过载→火） */
    window.playArchmageFusionPlasmaVfx = function playArchmageFusionPlasmaVfx(g, player, angle, range, halfAngleDeg) {
        if (!g || !player) return;
        const r = range || 350;
        const ang = angle != null ? angle : (player.angle || 0);
        const half = (halfAngleDeg || 60) * Math.PI / 180;
        const tipX = player.x + Math.cos(ang) * r;
        const tipY = player.y + Math.sin(ang) * r;
        fusionShake(g, 7, 380);
        castFlash(g, player.x, player.y, 'mage_phase_overload', 48);
        addVfx(g, player.x, player.y, {
            variant: 'mage_fusion_plasma',
            duration: 880,
            radius: r,
            angle: ang,
            halfAngleDeg: halfAngleDeg || 60,
            family: 'elemental_power',
            ox: player.x, oy: player.y,
            targetX: tipX, targetY: tipY,
            fusionType: 'plasma'
        });
        addVfx(g, tipX, tipY, {
            variant: 'mage_fusion_plasma_impact',
            duration: 520,
            delayMs: 140,
            radius: r * 0.22,
            family: 'mage_phase_overload',
            ox: tipX, oy: tipY
        });
        burst(g, player.x, player.y, 'mage_phase_fire', 12, Math.PI * 0.35);
        burst(g, tipX, tipY, 'mage_phase_overload', 22, Math.PI * 2);
    };

    // ---- 绘制 VFX ----

    window.drawMageSkillVfxEffect = function drawMageSkillVfxEffect(ctx, effect, progress, alpha, elapsed, meta) {
        const variant = meta.variant;
        if (!variant || (variant.indexOf('mage_') !== 0 && variant.indexOf('warlock_') !== 0)) return false;

        const pal = palette(meta.family || 'mana');
        const ang = meta.ang || 0;
        const x = meta.x; const y = meta.y;
        const r = meta.r || 50;
        const ox = meta.ox != null ? meta.ox : x;
        const oy = meta.oy != null ? meta.oy : y;
        const tx = meta.tx != null ? meta.tx : x;
        const ty = meta.ty != null ? meta.ty : y;

        const eff = meta.effect || {};
        const streakCol = eff.streakColor;
        const streakW = eff.streakWidth;
        const soulBurnFx = !!eff.soulBurn;
        const curseStacks = eff.stacks || 0;

        function drawCustomStreak(ctx, ox0, oy0, bx, by, col, width, alpha0, fade0) {
            ctx.save();
            ctx.globalAlpha = alpha0 * fade0 * 0.35;
            ctx.strokeStyle = col;
            ctx.globalAlpha = alpha0 * fade0 * 0.25;
            ctx.lineWidth = width + 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(ox0, oy0);
            ctx.lineTo(bx, by);
            ctx.stroke();
            ctx.globalAlpha = alpha0 * fade0 * 0.85;
            ctx.lineWidth = width;
            ctx.stroke();
            ctx.globalAlpha = alpha0 * fade0;
            ctx.strokeStyle = '#f4e8ff';
            ctx.lineWidth = Math.max(2, width * 0.25);
            ctx.stroke();
            ctx.restore();
        }

        switch (variant) {
            case 'mage_streak':
            case 'mage_arcane_streak':
            case 'mage_arcane_ray':
            case 'mage_fire_comet':
            case 'mage_shadow_lance':
            case 'mage_shadow_corrupt':
            case 'mage_pain_arrow':
            case 'mage_death_coil':
            case 'mage_chrono_spiral': {
                const t = easeOutCubic(clamp01(progress / 0.88));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                let w = 7;
                if (variant === 'mage_pain_arrow') w = streakW || 11;
                else if (variant === 'mage_shadow_corrupt') w = streakW || 9;
                else if (variant === 'mage_chrono_spiral') w = 5;
                else w = streakW || 7;
                if (streakCol) {
                    drawCustomStreak(ctx, ox, oy, bx, by, streakCol, w, alpha, fade);
                } else {
                    drawStreakLine(ctx, ox, oy, bx, by, pal, alpha, fade, w, 2);
                }

                if (variant === 'mage_pain_arrow' && t > 0.08) {
                    ctx.save();
                    ctx.globalAlpha = alpha * fade * 0.55;
                    const tailLen = Math.min(110, Math.hypot(bx - ox, by - oy) * 0.5);
                    const ba = Math.atan2(by - oy, bx - ox);
                    const rg = ctx.createLinearGradient(
                        bx - Math.cos(ba) * tailLen, by - Math.sin(ba) * tailLen, bx, by
                    );
                    rg.addColorStop(0, '#552288');
                    rg.addColorStop(0.45, streakCol || '#aa44ff');
                    rg.addColorStop(0.85, '#f4e8ff');
                    rg.addColorStop(1, 'rgba(255,255,255,0.8)');
                    ctx.strokeStyle = rg;
                    ctx.lineWidth = 12;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(bx - Math.cos(ba) * tailLen, by - Math.sin(ba) * tailLen);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                    ctx.restore();
                }

                if (variant === 'mage_arcane_ray' && t > 0.05) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * fade * 0.55;
                    const tailLen = Math.min(100, Math.hypot(bx - ox, by - oy) * 0.55);
                    const ba = Math.atan2(by - oy, bx - ox);
                    const rg = ctx.createLinearGradient(
                        bx, by,
                        bx - Math.cos(ba) * tailLen, by - Math.sin(ba) * tailLen
                    );
                    rg.addColorStop(0, pal.core);
                    rg.addColorStop(0.35, pal.main);
                    rg.addColorStop(0.75, pal.light);
                    rg.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.strokeStyle = rg;
                    ctx.lineWidth = 8;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(bx - Math.cos(ba) * tailLen, by - Math.sin(ba) * tailLen);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                    ctx.globalAlpha = alpha * fade * 0.9;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(bx - Math.cos(ba) * tailLen * 0.6, by - Math.sin(ba) * tailLen * 0.6);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                    ctx.restore();
                }

                if (variant === 'mage_chrono_spiral') {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    for (let i = 0; i < 5; i++) {
                        const sp = t - i * 0.08;
                        if (sp <= 0) continue;
                        const sx = ox + (tx - ox) * sp;
                        const sy = oy + (ty - oy) * sp;
                        const sr = 6 - i;
                        ctx.globalAlpha = alpha * fade * (0.5 - i * 0.08);
                        ctx.strokeStyle = pal.light;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(sx, sy, sr, elapsed * 0.004 + i, elapsed * 0.004 + i + Math.PI * 1.2);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                if (variant === 'mage_fire_comet' && t > 0.15) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * fade * 0.4;
                    const tailLen = Math.min(80, Math.hypot(bx - ox, by - oy) * 0.35);
                    const ba = Math.atan2(by - oy, bx - ox);
                    const g = ctx.createLinearGradient(
                        bx, by,
                        bx - Math.cos(ba) * tailLen, by - Math.sin(ba) * tailLen
                    );
                    g.addColorStop(0, pal.core);
                    g.addColorStop(0.5, pal.main);
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.strokeStyle = g;
                    ctx.lineWidth = 14;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(bx - Math.cos(ba) * tailLen, by - Math.sin(ba) * tailLen);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                    ctx.restore();
                }
                break;
            }

            case 'mage_arcane_finisher': {
                const t = easeOutBack(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                drawStreakLine(ctx, ox, oy, bx, by, pal, alpha, fade, 11, 3);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.6;
                for (let i = 0; i < 3; i++) {
                    const off = (i - 1) * 0.22;
                    const ba = Math.atan2(by - oy, bx - ox) + off;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(bx, by);
                    ctx.lineTo(bx + Math.cos(ba) * r * 0.35, by + Math.sin(ba) * r * 0.35);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_impact':
            case 'mage_arcane_impact':
            case 'mage_fire_impact':
            case 'mage_chrono_impact':
            case 'mage_shadow_impact':
            case 'mage_shock_impact':
            case 'mage_frost_hit': {
                const t = easeOutCubic(clamp01(progress / 0.7));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const ringR = r * (0.3 + t * 0.9);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 3; i++) {
                    ctx.globalAlpha = alpha * fade * (0.55 - i * 0.14);
                    drawRing(ctx, x, y, ringR * (1 - i * 0.18), i === 0 ? pal.core : pal.light, 4 - i, 1);
                }
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'mage_frozen_ground': {
                const pulse = 0.9 + Math.sin(elapsed / 320) * 0.08;
                const fr = r * pulse;
                const fade = 1 - easeOutQuad(clamp01((progress - 0.2) / 0.8));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.35;
                const g2 = ctx.createRadialGradient(x, y, fr * 0.1, x, y, fr);
                g2.addColorStop(0, 'rgba(220,245,255,0.6)');
                g2.addColorStop(0.5, 'rgba(100,180,255,0.25)');
                g2.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g2;
                ctx.beginPath();
                ctx.arc(x, y, fr, 0, Math.PI * 2);
                ctx.fill();
                drawRing(ctx, x, y, fr * 0.85, pal.light, 2, alpha * fade * 0.7);
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2 + elapsed * 0.001;
                    ctx.globalAlpha = alpha * fade * 0.55;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * fr * 0.35, y + Math.sin(a) * fr * 0.35);
                    ctx.lineTo(x + Math.cos(a) * fr * 0.7, y + Math.sin(a) * fr * 0.7);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_frost_ring':
            case 'mage_radial':
            case 'mage_element_nova': {
                const t = easeOutCubic(clamp01(progress / 0.65));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const ringR = r * t;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const spikes = variant === 'mage_frost_ring' ? 8 : 6;
                for (let i = 0; i < spikes; i++) {
                    const a = (i / spikes) * Math.PI * 2 + elapsed * 0.001;
                    ctx.globalAlpha = alpha * fade * 0.7;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * ringR * 0.55, y + Math.sin(a) * ringR * 0.55);
                    ctx.lineTo(x + Math.cos(a) * ringR, y + Math.sin(a) * ringR);
                    ctx.stroke();
                }
                drawRing(ctx, x, y, ringR, pal.main, 5, alpha * fade * 0.85);
                drawRing(ctx, x, y, ringR * 0.72, pal.core, 2, alpha * fade * 0.6);
                ctx.restore();
                break;
            }

            case 'mage_chain_lightning': {
                const chainCount = effect.chainCount || 5;
                const t = easeOutCubic(clamp01(progress / 0.62));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.38) / 0.62));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < chainCount; i++) {
                    const phase = (i / chainCount) * Math.PI * 2 + elapsed * 0.006;
                    const dist = r * (0.3 + t * 0.6) * (1 - i * 0.08);
                    let cx = x, cy = y;
                    const segs = 6 + i;
                    const segLen = dist / segs;
                    const a0 = phase + ang;
                    ctx.globalAlpha = alpha * fade * (0.95 - i * 0.15);
                    for (let s = 0; s < segs; s++) {
                        const jitter = (s % 2 ? 1 : -1) * (10 + Math.sin(elapsed * 0.04 + s) * 8);
                        const segAng = a0 + (s / segs) * 0.35 + jitter * 0.035;
                        const nx = cx + Math.cos(segAng) * segLen;
                        const ny = cy + Math.sin(segAng) * segLen;
                        ctx.strokeStyle = s % 2 ? pal.core : pal.light;
                        ctx.lineWidth = i === 0 ? 4 : 2.5;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(nx, ny);
                        ctx.stroke();
                        cx = nx; cy = ny;
                    }
                }
                ctx.restore();
                break;
            }

            case 'mage_frost_beam':
            case 'mage_flame_cone': {
                const t = easeOutCubic(clamp01(progress / 0.7));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const len = r * (variant === 'mage_flame_cone' ? (0.55 + t * 0.45) : t);
                const halfAng = variant === 'mage_flame_cone' ? Math.PI / 6 : 0;
                const hw = variant === 'mage_flame_cone' ? len * Math.tan(halfAng) : (effect.pierceWidth || 50) * 0.5;
                ctx.save();
                ctx.translate(ox, oy);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                if (variant === 'mage_flame_cone') {
                    ctx.globalAlpha = alpha * fade * 0.3;
                    ctx.fillStyle = pal.dark;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(len, -hw);
                    ctx.lineTo(len, hw);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = alpha * fade * 0.75;
                    ctx.fillStyle = pal.main;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(len * 0.92, -hw * 0.85);
                    ctx.lineTo(len * 0.92, hw * 0.85);
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = alpha * fade;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(len, 0);
                    ctx.stroke();
                } else {
                    ctx.globalAlpha = alpha * fade * 0.25;
                    ctx.fillStyle = pal.main;
                    ctx.fillRect(0, -hw, len, hw * 2);
                    ctx.globalAlpha = alpha * fade * 0.85;
                    ctx.fillStyle = pal.core;
                    ctx.fillRect(0, -hw * 0.35, len, hw * 0.7);
                }
                ctx.restore();
                break;
            }

            case 'mage_field_deploy': {
                const t = easeOutCubic(clamp01(progress / 0.72));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.55) / 0.45));
                const fr = r * (0.15 + t * 0.95);
                const ph = effect.wizardFieldPhase || 'fire';
                const cols = ph === 'awakening'
                    ? ['#ff6622', '#88ccff', '#44aaff', '#ffdd88']
                    : ph === 'frost' ? ['#cceeff', '#88ccff', '#aaddff']
                    : ph === 'overload' ? ['#aaddff', '#44aaff', '#ffffff']
                    : ['#ffcc66', '#ff6622', '#ff4400'];
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                cols.forEach((col, i) => {
                    const rot = elapsed * 0.003 * (i % 2 ? 1 : -1) + i * 0.8;
                    ctx.globalAlpha = alpha * fade * (0.85 - i * 0.12);
                    ctx.strokeStyle = col;
                    ctx.lineWidth = 4 - i * 0.5;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.arc(x, y, fr * (0.92 - i * 0.04), rot, rot + Math.PI * (1.1 - i * 0.08));
                    ctx.stroke();
                });
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + elapsed * 0.002;
                    ctx.globalAlpha = alpha * fade * 0.65;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * fr * 0.2, y + Math.sin(a) * fr * 0.2);
                    ctx.lineTo(x + Math.cos(a) * fr, y + Math.sin(a) * fr);
                    ctx.stroke();
                }
                ctx.globalAlpha = alpha * fade * 0.35;
                const rg = ctx.createRadialGradient(x, y, 0, x, y, fr * 0.5);
                rg.addColorStop(0, pal.core);
                rg.addColorStop(0.5, pal.main);
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.beginPath();
                ctx.arc(x, y, fr * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'mage_frost_nova_mark': {
                const pulse = 0.85 + Math.sin(elapsed / 180) * 0.15;
                const fr = r * pulse;
                const fade = 1 - easeOutQuad(clamp01(progress));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                drawRing(ctx, x, y, fr, pal.light, 3, alpha * fade * 0.9);
                drawRing(ctx, x, y, fr * 0.65, pal.core, 2, alpha * fade * 0.65);
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.arc(x, y, fr * 0.25, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'mage_resonance_field': {
                const pulse = 0.92 + Math.sin(elapsed / 400) * 0.06;
                const fr = r * pulse;
                const fade = 1 - easeOutQuad(clamp01((progress - 0.15) / 0.85));
                const ph = effect.wizardFieldPhase || 'fire';
                const col = ph === 'frost' ? '#88ccff' : ph === 'overload' ? '#44aaff' : '#ff6622';
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.28;
                const rg = ctx.createRadialGradient(x, y, fr * 0.1, x, y, fr);
                rg.addColorStop(0, col);
                rg.addColorStop(0.55, pal.main);
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.beginPath();
                ctx.arc(x, y, fr, 0, Math.PI * 2);
                ctx.fill();
                drawRing(ctx, x, y, fr * 0.88, pal.light, 2, alpha * fade * 0.75);
                if (ph === 'overload') {
                    ctx.globalAlpha = alpha * fade * 0.5;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 2;
                    for (let i = 0; i < 3; i++) {
                        const a = elapsed * 0.004 + i * 2.1;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + Math.cos(a) * fr * 0.7, y + Math.sin(a) * fr * 0.7);
                        ctx.stroke();
                    }
                }
                ctx.restore();
                break;
            }

            case 'mage_arcane_blink': {
                const t = easeOutCubic(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const ringR = r * (0.4 + t * 0.85);
                const phaseCol = effect.phase === 'fire' ? '#ff6633'
                    : effect.phase === 'frost' ? '#88ccff'
                    : effect.phase === 'overload' ? '#44aaff' : pal.main;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.45;
                const g = ctx.createRadialGradient(x, y, 0, x, y, ringR);
                g.addColorStop(0, '#ffffff');
                g.addColorStop(0.35, phaseCol);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.8;
                ctx.strokeStyle = phaseCol;
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 7]);
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.75, -elapsed * 0.003, -elapsed * 0.003 + Math.PI * 1.8);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                break;
            }

            case 'mage_element_liberation': {
                const t = easeOutCubic(clamp01(progress / 0.8));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const cols = ['#ff6633', '#88ccff', '#44aaff', '#ffdd44'];
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                cols.forEach((col, i) => {
                    const rot = elapsed * 0.002 + i * Math.PI / 2;
                    const rr = r * (0.55 + t * 0.4);
                    ctx.globalAlpha = alpha * fade * 0.35;
                    ctx.strokeStyle = col;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(x, y, rr, rot, rot + Math.PI * 0.9);
                    ctx.stroke();
                });
                drawRing(ctx, x, y, r * t * 0.5, pal.core, 3, alpha * fade * 0.7);
                ctx.restore();
                break;
            }

            case 'mage_meteor_fall': {
                const t = easeOutCubic(clamp01(progress / 0.85));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.55) / 0.45));
                const skyY = y - r * 1.8 * (1 - t);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.9;
                const g = ctx.createRadialGradient(x, skyY, 0, x, skyY, 22);
                g.addColorStop(0, '#fff8e0');
                g.addColorStop(0.4, '#ff6622');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, skyY, 22, 0, Math.PI * 2);
                ctx.fill();
                if (t > 0.5) {
                    const gt = (t - 0.5) / 0.5;
                    const crater = r * gt;
                    ctx.globalAlpha = alpha * fade * 0.5;
                    drawRing(ctx, x, y, crater, '#ff4400', 6, 1);
                    ctx.globalAlpha = alpha * fade * 0.25;
                    ctx.fillStyle = '#ff2200';
                    ctx.beginPath();
                    ctx.arc(x, y, crater * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'mage_foresight_shield': {
                const t = clamp01(progress);
                const pulse = 0.9 + Math.sin(elapsed * 0.005) * 0.08;
                const rr = r * pulse;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(elapsed * 0.0015);
                ctx.globalAlpha = alpha * 0.85;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 3;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, rr * 0.12, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.globalAlpha = alpha * 0.5;
                drawRing(ctx, 0, 0, rr, pal.main, 4, 1);
                ctx.restore();
                break;
            }

            case 'mage_chrono_purge':
            case 'mage_chrono_aura':
            case 'mage_time_dome':
            case 'mage_time_rewind': {
                const t = easeOutCubic(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const ringR = r * (variant === 'mage_time_dome' ? 1 : 0.5 + t * 0.55);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.35;
                const g = ctx.createRadialGradient(x, y, ringR * 0.2, x, y, ringR);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.6, pal.main);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.fill();
                drawRing(ctx, x, y, ringR * 0.85, pal.light, 2, alpha * fade * 0.7);
                ctx.restore();
                break;
            }

            case 'mage_rewind_mark':
            case 'mage_fate_threads': {
                const pulse = 0.88 + Math.sin(elapsed * 0.006) * 0.1;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-elapsed * 0.002);
                ctx.globalAlpha = alpha * 0.8;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -r * pulse);
                ctx.lineTo(r * 0.35 * pulse, 0);
                ctx.lineTo(0, r * pulse);
                ctx.lineTo(-r * 0.35 * pulse, 0);
                ctx.closePath();
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'mage_curse_bind': {
                const t = easeOutCubic(clamp01(progress / 0.7));
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(elapsed * 0.003);
                ctx.globalAlpha = alpha * (1 - t * 0.3);
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 3;
                for (let i = 0; i < 3; i++) {
                    const rr = r * (0.4 + i * 0.22) * t;
                    ctx.beginPath();
                    ctx.arc(0, 0, rr, i * 0.8, i * 0.8 + Math.PI * 1.4);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_life_tether': {
                const t = easeOutCubic(clamp01(progress / 0.85));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.5;
                ctx.strokeStyle = '#44ff88';
                ctx.lineWidth = 6;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.strokeStyle = '#aaffcc';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'mage_soul_nova':
            case 'mage_soul_detonate': {
                const t = easeOutCubic(clamp01(progress / 0.68));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const ringR = r * (0.35 + t * 0.95);
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + elapsed * 0.003;
                    ctx.globalAlpha = alpha * fade * 0.55;
                    ctx.strokeStyle = pal.light;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * ringR, y + Math.sin(a) * ringR);
                    ctx.stroke();
                }
                drawRing(ctx, x, y, ringR * 0.6, pal.main, 4, alpha * fade * 0.8);
                ctx.restore();
                break;
            }

            case 'mage_necro_summon': {
                const t = easeOutBack(clamp01(progress / 0.55));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const ringR = r * t;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.5;
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 5;
                ctx.setLineDash([10, 8]);
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = alpha * fade * 0.75;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.82, elapsed * 0.002, elapsed * 0.002 + Math.PI * 1.6);
                ctx.stroke();
                ctx.fillStyle = pal.core;
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.font = 'bold 14px Courier New';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('☠', x, y - ringR * 0.15);
                ctx.restore();
                break;
            }

            case 'mage_nether_gate': {
                const pulse = 0.92 + Math.sin(elapsed * 0.004) * 0.06;
                const gateR = r * pulse;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * 0.28;
                const g = ctx.createRadialGradient(x, y, gateR * 0.15, x, y, gateR);
                g.addColorStop(0, '#220033');
                g.addColorStop(0.55, pal.dark);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, gateR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * 0.75;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.ellipse(x, y, gateR * 0.55, gateR * 0.35, elapsed * 0.001, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.45;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * gateR * 0.2, y + Math.sin(a) * gateR * 0.2);
                    ctx.lineTo(x + Math.cos(a) * gateR * 0.9, y + Math.sin(a) * gateR * 0.9);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_fire_charge': {
                const t = clamp01(progress);
                const chargeR = r * (0.6 + t * 0.7);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * 0.4 * t;
                const g = ctx.createRadialGradient(x, y, 0, x, y, chargeR);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.5, pal.main);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, chargeR, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'mage_field_pulse': {
                const pulse = 0.85 + Math.sin(elapsed * 0.004) * 0.12;
                const fc = effect.fieldColor || pal.main;
                ctx.save();
                ctx.globalAlpha = alpha * 0.22;
                ctx.strokeStyle = fc;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.12;
                ctx.fillStyle = fc;
                ctx.beginPath();
                ctx.arc(x, y, r * pulse * 0.92, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'mage_clash_shatter': {
                const firePal = PAL.mage_phase_fire;
                const frostPal = PAL.mage_phase_frost;
                const t = easeOutCubic(clamp01(progress));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                if (progress < 0.38) {
                    const ct = progress / 0.38;
                    const cr = r * (1.05 - ct * 0.55);
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * (1 - ct * 0.3);
                    const g0 = ctx.createRadialGradient(x, y, 0, x, y, cr);
                    g0.addColorStop(0, firePal.core);
                    g0.addColorStop(0.45, firePal.main);
                    g0.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g0;
                    ctx.beginPath();
                    ctx.arc(x, y, cr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else {
                    const bt = (progress - 0.38) / 0.62;
                    const br = r * (0.35 + bt * 0.95);
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * fade * 0.35;
                    const g1 = ctx.createRadialGradient(x, y, br * 0.1, x, y, br);
                    g1.addColorStop(0, '#eef8ff');
                    g1.addColorStop(0.35, frostPal.light);
                    g1.addColorStop(0.7, frostPal.main);
                    g1.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g1;
                    ctx.beginPath();
                    ctx.arc(x, y, br, 0, Math.PI * 2);
                    ctx.fill();
                    for (let i = 0; i < 10; i++) {
                        const a = (i / 10) * Math.PI * 2 + elapsed * 0.002;
                        const len = br * (0.55 + bt * 0.5);
                        ctx.globalAlpha = alpha * fade * 0.65;
                        ctx.strokeStyle = i % 2 ? frostPal.core : frostPal.light;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
                        ctx.stroke();
                    }
                    ctx.globalAlpha = alpha * fade * 0.25;
                    ctx.fillStyle = 'rgba(240,248,255,0.6)';
                    ctx.beginPath();
                    ctx.arc(x, y, br * 0.55, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                break;
            }

            case 'mage_clash_shockwave': {
                const firePal = PAL.mage_phase_fire;
                const frostPal = PAL.mage_phase_frost;
                const t = easeOutCubic(clamp01(progress / 0.85));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const ringR = r * (0.25 + t * 0.95);
                if (progress < 0.32) {
                    const ct = progress / 0.32;
                    const cr = r * (0.9 - ct * 0.45);
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * (1 - ct * 0.2);
                    const g0 = ctx.createRadialGradient(x, y, 0, x, y, cr);
                    g0.addColorStop(0, frostPal.core);
                    g0.addColorStop(0.5, frostPal.main);
                    g0.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g0;
                    ctx.beginPath();
                    ctx.arc(x, y, cr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.55;
                const grad = ctx.createRadialGradient(x, y, ringR * 0.6, x, y, ringR);
                grad.addColorStop(0, firePal.core);
                grad.addColorStop(0.35, firePal.main);
                grad.addColorStop(0.65, frostPal.main);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 10 - t * 4;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.strokeStyle = firePal.light;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.82, -elapsed * 0.003, -elapsed * 0.003 + Math.PI * 1.6);
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'mage_clash_resonance': {
                const phaseKey = effect.phase || meta.phase;
                const phasePal = phaseKey === 'frost' ? PAL.mage_phase_frost : PAL.mage_phase_fire;
                const t = easeOutCubic(clamp01(progress / 0.7));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const rr = r * (0.55 + t * 0.35);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.45;
                ctx.strokeStyle = phasePal.main;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, rr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.2;
                ctx.fillStyle = phasePal.light;
                ctx.beginPath();
                ctx.arc(x, y, rr * 0.85, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'mage_blink_rift': {
                const firePal = PAL.mage_phase_fire;
                const frostPal = PAL.mage_phase_frost;
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const bx = ox;
                const by = oy;
                const ex = tx;
                const ey = ty;
                const len = Math.hypot(ex - bx, ey - by) || 1;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 6; i++) {
                    const off = (i - 2.5) * 4;
                    const perpA = Math.atan2(ey - by, ex - bx) + Math.PI / 2;
                    const ox2 = Math.cos(perpA) * off;
                    const oy2 = Math.sin(perpA) * off;
                    const palUse = i % 2 ? firePal : frostPal;
                    ctx.globalAlpha = alpha * fade * (0.35 - i * 0.03);
                    ctx.strokeStyle = palUse.main;
                    ctx.lineWidth = 5 - i * 0.4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(bx + ox2, by + oy2);
                    ctx.lineTo(ex + ox2, ey + oy2);
                    ctx.stroke();
                }
                const spiralT = (elapsed * 0.003) % 1;
                for (let s = 0; s < 8; s++) {
                    const st = spiralT + s * 0.1;
                    if (st > 1) continue;
                    const sx = bx + (ex - bx) * st;
                    const sy = by + (ey - by) * st;
                    const sr = 5 + s * 0.8;
                    ctx.globalAlpha = alpha * fade * 0.5;
                    ctx.strokeStyle = s % 2 ? firePal.light : frostPal.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(sx, sy, sr, elapsed * 0.005 + s, elapsed * 0.005 + s + Math.PI);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_blink_phase_start':
            case 'mage_blink_phase_end': {
                const phaseKey = effect.phase || meta.phase;
                const phaseCol = phaseKey === 'fire' ? PAL.mage_phase_fire.main
                    : phaseKey === 'frost' ? PAL.mage_phase_frost.main : pal.main;
                const t = easeOutCubic(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const ringR = r * (0.35 + t * 0.75);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.5;
                const g2 = ctx.createRadialGradient(x, y, 0, x, y, ringR);
                g2.addColorStop(0, '#ffffff');
                g2.addColorStop(0.4, phaseCol);
                g2.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g2;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.fill();
                if (variant === 'mage_blink_phase_end' && (effect.fromPhase || meta.fromPhase)) {
                    const fp = effect.fromPhase || meta.fromPhase;
                    ctx.globalAlpha = alpha * fade * 0.35;
                    ctx.strokeStyle = fp === 'fire' ? PAL.mage_phase_fire.light : PAL.mage_phase_frost.light;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, y, ringR * 1.15, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_surge_echo': {
                const fade = 1 - easeOutQuad(clamp01((progress - 0.25) / 0.75));
                const cols = [PAL.mage_phase_fire.main, PAL.mage_phase_frost.main];
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                cols.forEach((col, i) => {
                    const flash = progress < 0.5 ? (i === 0 ? 1 : 0.2) : (i === 1 ? 1 : 0.2);
                    ctx.globalAlpha = alpha * fade * flash * 0.55;
                    drawRing(ctx, x, y, r * (0.5 + progress * 0.3), col, 3, 1);
                });
                ctx.restore();
                break;
            }

            case 'mage_surge_awakening': {
                const t = easeOutCubic(clamp01(progress / 0.8));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const cols = [PAL.mage_phase_fire, PAL.mage_phase_frost];
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                cols.forEach((cp, i) => {
                    const rot = elapsed * 0.003 + i * Math.PI;
                    ctx.globalAlpha = alpha * fade * 0.4;
                    ctx.strokeStyle = cp.main;
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(x, y, r * (0.6 + t * 0.5), rot, rot + Math.PI * 1.2);
                    ctx.stroke();
                });
                drawRing(ctx, x, y, r * t * 0.65, '#ffdd44', 4, alpha * fade * 0.8);
                ctx.restore();
                break;
            }

            case 'warlock_soul_link_cast':
            case 'warlock_soul_link': {
                const t = easeOutCubic(clamp01(progress / 0.85));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                const lineW = soulBurnFx ? 6 : 4;
                const lineCol = soulBurnFx ? '#ff44ff' : '#8844cc';
                const dotR = soulBurnFx ? 14 : 10;
                ctx.save();
                ctx.globalAlpha = alpha * fade * 0.65;
                ctx.strokeStyle = lineCol;
                ctx.lineWidth = lineW;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.fillStyle = soulBurnFx ? '#ff66ff' : '#aa44ff';
                ctx.globalAlpha = alpha * fade * 0.8;
                ctx.beginPath();
                ctx.arc(bx, by, dotR * (0.85 + 0.15 * Math.sin(progress * Math.PI * 4)), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'mage_curse_beam': {
                const t = easeOutCubic(clamp01(progress / 0.92));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.45) / 0.55));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const lg = ctx.createLinearGradient(ox, oy, bx, by);
                lg.addColorStop(0, 'rgba(136,68,170,0.15)');
                lg.addColorStop(0.35, '#8844aa');
                lg.addColorStop(0.75, '#aa44ff');
                lg.addColorStop(1, '#f4e8ff');
                ctx.strokeStyle = lg;
                ctx.lineWidth = 10;
                ctx.lineCap = 'round';
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.9;
                ctx.lineWidth = 4;
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'mage_corruption_mist': {
                const pr = r * (0.4 + 0.6 * easeOutCubic(progress));
                ctx.save();
                ctx.globalAlpha = alpha * (1 - progress) * 0.65;
                const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
                g.addColorStop(0, 'rgba(85,34,119,0.55)');
                g.addColorStop(0.55, 'rgba(68,0,102,0.35)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'mage_pain_impact': {
                const pr = r * (0.25 + 0.75 * easeOutCubic(progress));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (1 - progress * 0.7);
                ctx.strokeStyle = '#aa44ff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.45 * (1 - progress);
                ctx.fillStyle = 'rgba(170,68,255,0.25)';
                ctx.beginPath();
                ctx.arc(x, y, pr * 0.55, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'warlock_pierce_flash': {
                const pr = r * (0.15 + 0.85 * easeOutCubic(progress));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (1 - progress);
                ctx.strokeStyle = '#f4e8ff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.4 * (1 - progress);
                ctx.fillStyle = 'rgba(170,68,255,0.35)';
                ctx.beginPath();
                ctx.arc(x, y, pr * 0.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'warlock_curse_detonate': {
                const phase1 = clamp01(progress / 0.4);
                const phase2 = clamp01((progress - 0.4) / 0.6);
                if (progress < 0.4) {
                    const shrink = r * (1 - phase1 * 0.35);
                    ctx.save();
                    ctx.globalAlpha = alpha * (0.5 + phase1 * 0.5);
                    ctx.strokeStyle = '#8844aa';
                    ctx.lineWidth = 3 + phase1 * 2;
                    ctx.beginPath();
                    ctx.arc(x, y, shrink, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    const pr = r * (0.2 + 0.8 * easeOutCubic(phase2));
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * (1 - phase2 * 0.65);
                    ctx.strokeStyle = '#cc2244';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(x, y, pr, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.strokeStyle = '#aa44ff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, y, pr * 0.72, 0, Math.PI * 2);
                    ctx.stroke();
                    for (let i = 0; i < 8; i++) {
                        const a = (Math.PI * 2 * i) / 8 + phase2 * 0.4;
                        ctx.globalAlpha = alpha * 0.45 * (1 - phase2);
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + Math.cos(a) * pr * 1.15, y + Math.sin(a) * pr * 1.15);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                break;
            }
            case 'warlock_dark_vortex': {
                const pr = r * (0.35 + 0.65 * easeOutCubic(progress));
                ctx.save();
                ctx.globalAlpha = alpha * (1 - progress * 0.55);
                ctx.strokeStyle = '#8844cc';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.5 * (1 - progress);
                for (let i = 0; i < 6; i++) {
                    const a = (Math.PI * 2 * i) / 6 + progress * 0.5;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * pr * 1.2, y + Math.sin(a) * pr * 1.2);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }
            case 'warlock_shadow_burst': {
                const pr = r * (0.3 + 0.7 * easeOutCubic(progress));
                ctx.save();
                ctx.globalAlpha = alpha * (1 - progress * 0.6);
                const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
                g.addColorStop(0, 'rgba(68,34,102,0.5)');
                g.addColorStop(0.5, 'rgba(136,68,204,0.25)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#442266';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, pr * 0.85, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'warlock_fiend_collapse': {
                const p1 = clamp01(progress / 0.25);
                const p2 = clamp01((progress - 0.25) / 0.35);
                const p3 = clamp01((progress - 0.6) / 0.4);
                if (progress < 0.25) {
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.7;
                    ctx.strokeStyle = '#442266';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(x, y, r * (1 - p1 * 0.5), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else if (progress < 0.6) {
                    const pr = r * (0.3 + 0.7 * easeOutCubic(p2));
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * (1 - p2 * 0.5);
                    ctx.fillStyle = 'rgba(68,34,102,0.45)';
                    ctx.beginPath();
                    ctx.arc(x, y, pr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#8844cc';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(x, y, pr, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    const pr = r * (0.5 + 0.5 * p3);
                    ctx.save();
                    ctx.globalAlpha = alpha * (1 - p3) * 0.5;
                    const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
                    g.addColorStop(0, 'rgba(170,68,255,0.2)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(x, y, pr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                break;
            }
            case 'warlock_dark_harvest_strike': {
                [0, 0.12, 0.24].forEach((delay, wi) => {
                    const wp = clamp01((progress - delay) / 0.55);
                    if (wp <= 0) return;
                    const pr = r * (0.15 + 0.85 * easeOutCubic(wp));
                    const cols = ['#aa44ff', '#8844cc', '#442266'];
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * (1 - wp) * (0.85 - wi * 0.15);
                    ctx.strokeStyle = cols[wi];
                    ctx.lineWidth = 4 - wi;
                    ctx.beginPath();
                    ctx.arc(x, y, pr, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                });
                if (progress > 0.15) {
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.2 * (1 - progress);
                    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.6);
                    g.addColorStop(0, 'rgba(170,68,255,0.35)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                break;
            }
            case 'warlock_harvest_bonus': {
                const pr = r * (0.25 + 0.75 * easeOutCubic(progress));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (1 - progress * 0.7);
                ctx.strokeStyle = '#cc66ff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.35 * (1 - progress);
                ctx.fillStyle = 'rgba(204,102,255,0.2)';
                ctx.beginPath();
                ctx.arc(x, y, pr * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'warlock_dark_vortex_deploy': {
                const deploy = 1 - easeOutCubic(progress);
                const pr = r * (0.35 + 0.65 * deploy);
                ctx.save();
                ctx.globalAlpha = alpha * (0.45 + 0.35 * (1 - progress));
                const g = ctx.createRadialGradient(x, y, pr * 0.2, x, y, pr);
                g.addColorStop(0, 'rgba(68,34,102,0.55)');
                g.addColorStop(0.6, 'rgba(34,0,51,0.35)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#442266';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 5]);
                ctx.beginPath();
                ctx.arc(x, y, pr * (0.85 + progress * 0.15), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'warlock_soul_link_pulse': {
                const t = clamp01(progress);
                const px2 = tx + (ox - tx) * t;
                const py2 = ty + (oy - ty) * t;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (1 - t);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(px2, py2, 6 + t * 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(120,255,160,0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(px2, py2);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'warlock_link_break':
            case 'warlock_link_rebind': {
                const pr = r * (variant === 'warlock_link_break'
                    ? (1 - easeOutCubic(progress))
                    : (0.2 + 0.8 * easeOutCubic(progress)));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (1 - progress * 0.5);
                ctx.strokeStyle = variant === 'warlock_link_break' ? '#ff44aa' : '#aa44ff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, Math.max(4, pr), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                break;
            }
            case 'warlock_shadow_swipe': {
                const ang = eff.angle != null ? eff.angle : 0;
                const span = Math.PI * 0.55;
                const pr = r * (0.3 + 0.7 * easeOutCubic(progress));
                ctx.save();
                ctx.globalAlpha = alpha * (1 - progress);
                ctx.strokeStyle = soulBurnFx ? '#aa44ff' : '#552288';
                ctx.lineWidth = soulBurnFx ? 5 : 3;
                ctx.beginPath();
                ctx.arc(x, y, pr, ang - span * 0.5, ang + span * 0.5);
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'warlock_shadow_summon': {
                const t = easeOutBack(clamp01(progress / 0.55));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.5) / 0.5));
                const ringR = r * t;
                ctx.save();
                ctx.globalAlpha = alpha * fade * 0.65;
                ctx.strokeStyle = '#442266';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#663399';
                ctx.globalAlpha = alpha * fade * 0.4;
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.35, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'warlock_spread_cast': {
                const t = easeOutCubic(clamp01(progress / 0.85));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.45;
                ctx.strokeStyle = '#552288';
                ctx.lineWidth = 6;
                ctx.setLineDash([6, 5]);
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = alpha * fade * 0.75;
                ctx.strokeStyle = '#aa66cc';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'warlock_spread_curse_mark': {
                const pulse = 0.9 + Math.sin(elapsed * 0.005) * 0.08;
                const ringR = r * pulse;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(elapsed * 0.0018);
                ctx.globalAlpha = alpha * (1 - progress * 0.35);
                ctx.strokeStyle = '#8844cc';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.arc(0, 0, ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + elapsed * 0.002;
                    const dx = Math.cos(a) * ringR * 0.72;
                    const dy = Math.sin(a) * ringR * 0.72;
                    ctx.globalAlpha = alpha * 0.55;
                    ctx.fillStyle = i % 2 ? '#44aa66' : '#aa44ff';
                    ctx.beginPath();
                    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'warlock_curse_spread': {
                const phase1 = clamp01(progress / 0.28);
                const phase2 = clamp01((progress - 0.28) / 0.72);
                if (progress < 0.28) {
                    const shrink = r * 0.18 * (1 - phase1 * 0.6);
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * (0.6 + phase1 * 0.4);
                    ctx.fillStyle = 'rgba(85,34,136,0.45)';
                    ctx.beginPath();
                    ctx.arc(x, y, Math.max(6, shrink), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                } else {
                    const pr = r * (0.12 + 0.88 * easeOutCubic(phase2));
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = alpha * (1 - phase2 * 0.7);
                    ctx.strokeStyle = '#aa44ff';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(x, y, pr, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.globalAlpha = alpha * 0.35 * (1 - phase2);
                    const g = ctx.createRadialGradient(x, y, pr * 0.15, x, y, pr);
                    g.addColorStop(0, 'rgba(68,34,102,0.5)');
                    g.addColorStop(0.6, 'rgba(85,34,119,0.25)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(x, y, pr, 0, Math.PI * 2);
                    ctx.fill();
                    for (let i = 0; i < 8; i++) {
                        const a = (Math.PI * 2 * i) / 8 + phase2 * 0.35;
                        const wobble = Math.sin(elapsed * 0.004 + i) * 0.08;
                        ctx.globalAlpha = alpha * 0.5 * (1 - phase2);
                        ctx.strokeStyle = '#66aa88';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(x + Math.cos(a) * pr * 0.2, y + Math.sin(a) * pr * 0.2);
                        ctx.lineTo(
                            x + Math.cos(a + wobble) * pr * 1.05,
                            y + Math.sin(a + wobble) * pr * 1.05
                        );
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                break;
            }

            case 'warlock_soul_harvest_cast': {
                const t = easeOutCubic(clamp01(progress / 0.9));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                const resonanceFx = !!eff.resonanceBurst;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.5;
                ctx.strokeStyle = resonanceFx ? '#ff88ff' : '#8844cc';
                ctx.lineWidth = resonanceFx ? 5 : 4;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade;
                ctx.fillStyle = resonanceFx ? '#ffccff' : '#f4e8ff';
                ctx.beginPath();
                ctx.arc(bx, by, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                break;
            }

            case 'warlock_soul_harvest': {
                const t = easeOutCubic(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                const resonanceFx = !!eff.resonanceBurst;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const lg = ctx.createLinearGradient(ox, oy, bx, by);
                lg.addColorStop(0, resonanceFx ? '#ff88ff' : '#aa44ff');
                lg.addColorStop(0.5, resonanceFx ? '#cc66ff' : '#8844cc');
                lg.addColorStop(1, '#f4e8ff');
                ctx.strokeStyle = lg;
                ctx.lineWidth = resonanceFx ? 12 : 9;
                ctx.lineCap = 'round';
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.9;
                ctx.lineWidth = resonanceFx ? 4 : 3;
                ctx.stroke();
                for (let i = 0; i < 3; i++) {
                    const sp = t - i * 0.12;
                    if (sp <= 0) continue;
                    const sx = ox + (tx - ox) * sp;
                    const sy = oy + (ty - oy) * sp;
                    ctx.globalAlpha = alpha * fade * (0.65 - i * 0.15);
                    ctx.fillStyle = resonanceFx ? '#ffccff' : '#cc88ff';
                    ctx.beginPath();
                    ctx.arc(sx, sy, 5 - i, 0, Math.PI * 2);
                    ctx.fill();
                }
                if (t > 0.55) {
                    const impl = r * (0.2 + 0.8 * clamp01((t - 0.55) / 0.45));
                    ctx.globalAlpha = alpha * fade * 0.55;
                    ctx.strokeStyle = resonanceFx ? '#ff88ff' : '#aa44ff';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(ox, oy, impl, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'warlock_soul_harvest_resonance': {
                const pr = r * (0.35 + 0.65 * easeOutCubic(progress));
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (1 - progress * 0.75);
                ctx.strokeStyle = '#ff88ff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * 0.35 * (1 - progress);
                ctx.fillStyle = 'rgba(255,136,255,0.25)';
                ctx.beginPath();
                ctx.arc(x, y, pr * 0.55, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 5; i++) {
                    const a = (Math.PI * 2 * i) / 5 + progress * 0.5;
                    ctx.globalAlpha = alpha * 0.45 * (1 - progress);
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * pr * 1.1, y + Math.sin(a) * pr * 1.1);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_fusion_magma_charge': {
                const firePal = PAL.mage_phase_fire;
                const frostPal = PAL.mage_phase_frost;
                const t = easeOutCubic(clamp01(progress / 0.92));
                const pulse = 1 + Math.sin(elapsed * 0.012) * 0.06;
                const rr = r * (0.35 + t * 0.55) * pulse;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * (0.25 + t * 0.35);
                const g0 = ctx.createRadialGradient(x, y, rr * 0.1, x, y, rr);
                g0.addColorStop(0, firePal.core);
                g0.addColorStop(0.45, firePal.main);
                g0.addColorStop(0.75, frostPal.main);
                g0.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g0;
                ctx.beginPath();
                ctx.arc(x, y, rr, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * (0.55 + t * 0.35);
                ctx.strokeStyle = firePal.light;
                ctx.lineWidth = 2.5;
                ctx.setLineDash([7, 5]);
                ctx.beginPath();
                ctx.arc(x, y, rr * 0.88, elapsed * 0.002, elapsed * 0.002 + Math.PI * 1.7);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.strokeStyle = frostPal.core;
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + elapsed * 0.0015;
                    ctx.beginPath();
                    ctx.moveTo(x + Math.cos(a) * rr * 0.55, y + Math.sin(a) * rr * 0.55);
                    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
                    ctx.stroke();
                }
                const colH = r * (0.15 + t * 0.55);
                ctx.globalAlpha = alpha * t * 0.45;
                const colG = ctx.createLinearGradient(x, y, x, y - colH);
                colG.addColorStop(0, firePal.main);
                colG.addColorStop(0.6, firePal.core);
                colG.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = colG;
                ctx.fillRect(x - 8, y - colH, 16, colH);
                ctx.restore();
                break;
            }

            case 'mage_fusion_magma_burst': {
                const firePal = PAL.mage_phase_fire;
                const frostPal = PAL.mage_phase_frost;
                const t = easeOutBack(clamp01(progress / 0.78));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.42) / 0.58));
                const ringR = r * (0.2 + t * 0.95);
                const colH = r * (0.5 + t * 1.1);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                if (progress < 0.28) {
                    const rt = progress / 0.28;
                    ctx.globalAlpha = alpha * (1 - rt * 0.3);
                    for (let i = 0; i < 12; i++) {
                        const a = (i / 12) * Math.PI * 2;
                        const len = r * (0.15 + rt * 0.35);
                        ctx.strokeStyle = i % 2 ? firePal.main : frostPal.main;
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = alpha * fade * 0.55;
                const colG = ctx.createLinearGradient(x, y, x, y - colH);
                colG.addColorStop(0, '#ff2200');
                colG.addColorStop(0.35, firePal.core);
                colG.addColorStop(0.7, firePal.main);
                colG.addColorStop(1, 'rgba(255,255,255,0.15)');
                ctx.fillStyle = colG;
                ctx.fillRect(x - 14 * (1 - t * 0.4), y - colH, 28 * (1 - t * 0.35), colH);
                ctx.globalAlpha = alpha * fade * 0.7;
                ctx.strokeStyle = firePal.light;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(x, y, ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.strokeStyle = frostPal.light;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.arc(x, y, ringR * 0.78, -elapsed * 0.004, -elapsed * 0.004 + Math.PI * 1.4);
                ctx.stroke();
                ctx.setLineDash([]);
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + elapsed * 0.003;
                    ctx.globalAlpha = alpha * fade * 0.5;
                    ctx.fillStyle = i % 2 ? firePal.core : '#ffaa44';
                    ctx.beginPath();
                    ctx.arc(
                        x + Math.cos(a) * ringR * 0.65,
                        y + Math.sin(a) * ringR * 0.65 - Math.abs(Math.sin(elapsed * 0.008 + i)) * 12,
                        4 + i * 0.5, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
                ctx.restore();
                break;
            }

            case 'mage_fusion_magma_ground': {
                const firePal = PAL.mage_phase_fire;
                const t = clamp01(progress);
                const fade = 1 - easeOutQuad(t * 0.15);
                const rr = r * (0.85 + Math.sin(elapsed * 0.002) * 0.04);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.22;
                const g0 = ctx.createRadialGradient(x, y, rr * 0.15, x, y, rr);
                g0.addColorStop(0, 'rgba(255,80,0,0.55)');
                g0.addColorStop(0.6, 'rgba(180,40,0,0.28)');
                g0.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g0;
                ctx.beginPath();
                ctx.arc(x, y, rr, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.45;
                ctx.strokeStyle = firePal.main;
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.arc(x, y, rr * 0.92, elapsed * 0.0008, elapsed * 0.0008 + Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                break;
            }

            case 'mage_fusion_tempest': {
                const frostPal = PAL.mage_phase_frost;
                const boltPal = PAL.mage_phase_overload;
                const t = easeOutCubic(clamp01(progress / 0.72));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.38) / 0.62));
                const spin = elapsed * 0.004;
                const eyeR = r * (0.12 + t * 0.08);
                const ringR = r * (0.45 + t * 0.48);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.35;
                const eyeG = ctx.createRadialGradient(x, y, 0, x, y, eyeR * 2.2);
                eyeG.addColorStop(0, '#ffffff');
                eyeG.addColorStop(0.35, frostPal.core);
                eyeG.addColorStop(0.75, boltPal.main);
                eyeG.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = eyeG;
                ctx.beginPath();
                ctx.arc(x, y, eyeR * 2.2, 0, Math.PI * 2);
                ctx.fill();
                for (let ring = 0; ring < 3; ring++) {
                    const rr = ringR * (0.72 + ring * 0.14);
                    const rot = spin * (ring % 2 ? -1 : 1) + ring * 0.4;
                    ctx.globalAlpha = alpha * fade * (0.65 - ring * 0.15);
                    ctx.strokeStyle = ring === 1 ? boltPal.light : frostPal.main;
                    ctx.lineWidth = ring === 0 ? 4 : 2.5;
                    ctx.setLineDash(ring === 2 ? [5, 7] : []);
                    ctx.beginPath();
                    ctx.arc(x, y, rr, rot, rot + Math.PI * 1.85);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
                for (let i = 0; i < 6; i++) {
                    const baseA = (i / 6) * Math.PI * 2 + spin;
                    let cx = x, cy = y;
                    const segs = 5;
                    const segLen = ringR / segs;
                    ctx.globalAlpha = alpha * fade * 0.85;
                    for (let s = 0; s < segs; s++) {
                        const jitter = (s % 2 ? 1 : -1) * (8 + Math.sin(elapsed * 0.05 + s + i) * 6);
                        const segAng = baseA + (s / segs) * 0.25 + jitter * 0.025;
                        const nx = cx + Math.cos(segAng) * segLen;
                        const ny = cy + Math.sin(segAng) * segLen;
                        ctx.strokeStyle = s % 2 ? boltPal.core : frostPal.light;
                        ctx.lineWidth = s === 0 ? 3.5 : 2;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(nx, ny);
                        ctx.stroke();
                        cx = nx; cy = ny;
                    }
                }
                for (let i = 0; i < 4; i++) {
                    const a = spin + (i / 4) * Math.PI * 2;
                    ctx.globalAlpha = alpha * fade * 0.25;
                    ctx.strokeStyle = frostPal.core;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x - Math.cos(a) * ringR * 0.3, y - Math.sin(a) * ringR * 0.3);
                    ctx.quadraticCurveTo(
                        x + Math.cos(a + 0.5) * ringR * 0.5,
                        y + Math.sin(a + 0.5) * ringR * 0.5,
                        x + Math.cos(a) * ringR,
                        y + Math.sin(a) * ringR
                    );
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            case 'mage_fusion_plasma': {
                const firePal = PAL.mage_phase_fire;
                const boltPal = PAL.mage_phase_overload;
                const t = easeOutCubic(clamp01(progress / 0.75));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.4) / 0.6));
                const len = r * (0.35 + t * 0.65);
                const halfAng = (effect.halfAngleDeg || 60) * Math.PI / 360;
                const hw = len * Math.tan(halfAng);
                ctx.save();
                ctx.translate(ox, oy);
                ctx.rotate(ang);
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.28;
                const coneG = ctx.createLinearGradient(0, 0, len, 0);
                coneG.addColorStop(0, boltPal.core);
                coneG.addColorStop(0.35, firePal.main);
                coneG.addColorStop(0.7, boltPal.light);
                coneG.addColorStop(1, 'rgba(255,255,255,0.9)');
                ctx.fillStyle = coneG;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(len, -hw);
                ctx.lineTo(len, hw);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.9;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();
                ctx.strokeStyle = boltPal.core;
                ctx.lineWidth = 1.5;
                for (let z = 0; z < 4; z++) {
                    const zt = len * (0.25 + z * 0.18);
                    const wob = Math.sin(elapsed * 0.04 + z * 1.7) * hw * 0.35;
                    ctx.beginPath();
                    ctx.moveTo(zt * 0.6, wob * 0.5);
                    ctx.lineTo(zt, wob);
                    ctx.lineTo(zt + len * 0.08, -wob * 0.6);
                    ctx.stroke();
                }
                ctx.globalAlpha = alpha * fade * 0.45;
                ctx.strokeStyle = firePal.light;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -hw * 0.85);
                ctx.lineTo(len * 0.95, -hw * 0.75);
                ctx.moveTo(0, hw * 0.85);
                ctx.lineTo(len * 0.95, hw * 0.75);
                ctx.stroke();
                ctx.restore();
                break;
            }

            case 'mage_fusion_plasma_impact': {
                const boltPal = PAL.mage_phase_overload;
                const firePal = PAL.mage_phase_fire;
                const t = easeOutBack(clamp01(progress / 0.7));
                const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));
                const pr = r * (0.4 + t * 1.4);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = alpha * fade * 0.5;
                const g0 = ctx.createRadialGradient(x, y, 0, x, y, pr);
                g0.addColorStop(0, '#ffffff');
                g0.addColorStop(0.25, boltPal.core);
                g0.addColorStop(0.55, firePal.main);
                g0.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g0;
                ctx.beginPath();
                ctx.arc(x, y, pr, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + elapsed * 0.005;
                    ctx.globalAlpha = alpha * fade * 0.75;
                    ctx.strokeStyle = i % 2 ? boltPal.light : firePal.core;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * pr * 1.05, y + Math.sin(a) * pr * 1.05);
                    ctx.stroke();
                }
                ctx.restore();
                break;
            }

            default:
                return false;
        }
        return true;
    };
})();
