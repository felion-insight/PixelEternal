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
        energy: { main: '#cc33ee', light: '#ff99ff', core: '#ffe8ff', dark: '#550066' }
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

        const family = (typeof window.getResourceFamilyForClass === 'function'
            ? window.getResourceFamilyForClass(player.classData)
            : null) || 'rage';
        const pal = paletteFor(family);
        const angle = typeof player.angle === 'number' ? player.angle : 0;
        const px = player.x;
        const py = player.y;
        const isBuff = skillDef.effectTags && skillDef.effectTags.includes('buff');
        const aoe = skillDef.aoeRadius || 0;
        const primary = context && context.primaryTarget;
        const hitTargets = (context && context.hitTargets) || [];
        const ec = skillDef.entityConfig || {};
        const instantShape = context && context.instantShape;

        if (context && context.chargeEnd) {
            const endR = context.aoeRadius || ec.endExplodeRadius || 55;
            const endType = context.chargeEndType || 'radial';
            if (endType === 'cone' || endType === 'devastation_cone') {
                addVfx(gameInstance, px, py, {
                    variant: 'cone_slash',
                    duration: endType === 'devastation_cone' ? 560 : 480,
                    radius: endR,
                    angle,
                    family,
                    halfAngleDeg: context.halfAngleDeg || ec.endConeHalfAngleDeg || 70,
                    ox: px,
                    oy: py
                });
                addVfx(gameInstance, px, py, {
                    variant: 'aoe_shock',
                    duration: endType === 'devastation_cone' ? 520 : 420,
                    delayMs: 60,
                    radius: endR,
                    family,
                    ox: px,
                    oy: py
                });
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

        if (skillDef.entityType === 'instant' && (instantShape === 'radial' || ec.shape === 'radial')) {
            const radialR = ec.range || skillDef.range || 80;
            addVfx(gameInstance, px, py, {
                variant: 'whirlwind_slash',
                duration: 520,
                radius: radialR,
                angle,
                family,
                ox: px,
                oy: py
            });
            addVfx(gameInstance, px, py, {
                variant: 'aoe_shock',
                duration: 380,
                delayMs: 180,
                radius: radialR,
                family,
                ox: px,
                oy: py
            });
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 340,
                    delayMs: 140 + i * 25,
                    radius: 42,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 8, Math.PI * 1.2);
            });
            if (hitTargets.length === 0) {
                burstParticles(gameInstance, px, py, family, 14, Math.PI * 2);
            }
            return;
        }

        if (skillDef.entityType === 'instant' && (instantShape === 'cone' || ec.shape === 'cone')) {
            const coneRange = ec.range || skillDef.range || 80;
            const halfAngleDeg = ec.halfAngleDeg || 45;
            addVfx(gameInstance, px, py, {
                variant: 'cone_slash',
                duration: 420,
                radius: coneRange,
                angle,
                family,
                halfAngleDeg,
                ox: px,
                oy: py
            });
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'hit_spark',
                    duration: 340,
                    delayMs: 120 + i * 25,
                    radius: 42,
                    angle,
                    family,
                    ox: px,
                    oy: py
                });
                burstParticles(gameInstance, m.x, m.y, family, 8, Math.PI * 1.2);
            });
            if (hitTargets.length === 0) {
                burstParticles(
                    gameInstance,
                    px + Math.cos(angle) * coneRange * 0.55,
                    py + Math.sin(angle) * coneRange * 0.55,
                    family, 10, (halfAngleDeg * Math.PI / 180) * 1.6
                );
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

            default:
                break;
        }
    };
})();
