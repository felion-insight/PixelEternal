/**
 * 刺客职业系 · 专属技能视觉特效
 */
(function () {
    'use strict';

    const ASSASSIN_IDS = {
        assassin: true, shadowdancer: true, trickster: true, venomancer: true,
        nightblade: true, illusionist: true, plaguebringer: true
    };

    const PAL = {
        shadow_force: { main: '#8844cc', light: '#cc88ff', core: '#f0e0ff', dark: '#331155' },
        shadow_dancer: { main: '#7733aa', light: '#bb66ee', core: '#eeddff', dark: '#220044' },
        shadow_nightblade: { main: '#552288', light: '#9944dd', core: '#e8d0ff', dark: '#110022' },
        shadow_trickster: { main: '#6688cc', light: '#99bbff', core: '#eef4ff', dark: '#223366' },
        shadow_illusionist: { main: '#4455aa', light: '#7788dd', core: '#e8ecff', dark: '#112244' },
        shadow_venom: { main: '#44aa22', light: '#88dd66', core: '#eeffdd', dark: '#115511' },
        shadow_plague: { main: '#228800', light: '#55cc44', core: '#e8ffcc', dark: '#0a3300' },

        // Direct class ID mappings
        assassin: { main: '#6644aa', light: '#9977cc', core: '#eeddff', dark: '#331155' },
        shadowdancer: { main: '#7733aa', light: '#bb66ee', core: '#eeddff', dark: '#220044' },
        nightblade: { main: '#330066', light: '#663399', core: '#e0c0ff', dark: '#110033' },
        trickster: { main: '#6688cc', light: '#99bbff', core: '#eef4ff', dark: '#223366' },
        illusionist: { main: '#3344aa', light: '#6677dd', core: '#e8ecff', dark: '#111155' },
        venomancer: { main: '#44aa22', light: '#88dd66', core: '#eeffdd', dark: '#115511' },
        plaguebringer: { main: '#228800', light: '#55cc44', core: '#e8ffcc', dark: '#0a3300' }
    };

    function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
    function easeOutBack(t) {
        const c1 = 1.70158; const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    function progId(player) {
        if (!player || !player.classData) return 'assassin';
        return typeof window.getActiveClassProgressionId === 'function'
            ? window.getActiveClassProgressionId(player.classData) : 'assassin';
    }

    function isAssassinTree(player) {
        const id = progId(player);
        return !!(id && ASSASSIN_IDS[id]);
    }

    function isAssassinSkill(skillDef) {
        if (!skillDef) return false;
        if (skillDef.classId && ASSASSIN_IDS[skillDef.classId]) return true;
        if (skillDef.classId === 'assassin') return true;
        const branchIds = [
            'shadow_pierce', 'shadow_vortex', 'shadow_bind', 'midnight_raid',
            'backstab', 'shadow_raid', 'shadow_death_mark', 'nightfall',
            'assassinate', 'shadow_dance', 'death_sentence', 'eternal_night',
            'transposition', 'decoy', 'phantom_trick', 'reality_shift',
            'phantom_reality', 'mirror_domain', 'shadow_feast', 'phantom_array',
            'venom_sting', 'poison_mist', 'contagion', 'toxin_detonation',
            'lethal_venom', 'plague_cloud', 'pandemic', 'withering'
        ];
        return branchIds.includes(skillDef.id) || skillDef.id === 'assassin_basic';
    }

    function familyFor(player) {
        const id = progId(player);
        return id || 'assassin';
    }

    function palette(fam) { return PAL[fam] || PAL.shadow_force; }

    function addVfx(g, x, y, opts) {
        if (g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('class_skill_vfx', x, y, opts);
        }
    }

    function burst(g, x, y, fam, count, col) {
        const pm = g && g.particleManager;
        if (!pm || typeof pm.createSystem !== 'function') return;
        const pal = palette(fam);
        pm.createSystem(x, y, {
            color: col || pal.main, size: 3, count: count || 14,
            lifetime: 400, fadeoutTime: 260, speed: 2.6, speedVariation: 1.4,
            angleSpread: Math.PI * 2, spreadRadius: 6, pixelStyle: true
        });
    }

    function castFlash(g, x, y, fam, r) {
        addVfx(g, x, y, {
            variant: 'cast_flash', duration: 200, radius: r || 32,
            family: fam, color: palette(fam).light
        });
    }

    function aimTarget(primary, g, px, py, range) {
        if (primary) return primary;
        let best = null;
        let nd = Infinity;
        (g && g.monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const d = Math.hypot(m.x - px, m.y - py);
            if (d <= range && d < nd) { nd = d; best = m; }
        });
        return best;
    }

    window.getAssassinVfxFamily = familyFor;

    function playAssassinTricksterSkillVfx(player, skillDef, gameInstance, ec, fam, pal, px, py, angle, range, primary) {
        const id = skillDef.id;
        const ctx = player._tricksterVfxCtx;
        if (ctx) delete player._tricksterVfxCtx;

        if (id === 'mirror_domain') {
            addVfx(gameInstance, px, py, {
                variant: 'asn_mirror_field', duration: 1000,
                radius: ec.fieldRadius || ec.tauntRadius || 120,
                family: fam, ox: px, oy: py
            });
            castFlash(gameInstance, px, py, fam, 56);
            return true;
        }

        if (id === 'transposition' || id === 'phantom_reality') {
            if (ctx && ctx.mode === 'teleport') {
                addVfx(gameInstance, ctx.fromX, ctx.fromY, {
                    variant: 'asn_transposition_swap', duration: 580,
                    radius: ctx.burstRadius || 80, family: fam,
                    ox: ctx.fromX, oy: ctx.fromY,
                    targetX: ctx.toX, targetY: ctx.toY,
                    isPhantomReality: !!ctx.isPhantomReality
                });
                addVfx(gameInstance, ctx.toX, ctx.toY, {
                    variant: 'asn_anchor_place', duration: 420, delayMs: 100,
                    radius: 42, family: fam, ox: ctx.toX, oy: ctx.toY,
                    teleport: true
                });
                const burstPts = ctx.burstPoints || [{ x: ctx.fromX, y: ctx.fromY }, { x: ctx.toX, y: ctx.toY }];
                burstPts.forEach((bp, i) => {
                    addVfx(gameInstance, bp.x, bp.y, {
                        variant: 'asn_transposition_burst', duration: 520, delayMs: 60 + i * 70,
                        radius: ctx.burstRadius || 80, family: fam,
                        ox: bp.x, oy: bp.y, burstMult: bp.mult || 1
                    });
                    burst(gameInstance, bp.x, bp.y, fam, ctx.isPhantomReality ? 18 : 10, pal.light);
                });
                // 引渡三角轨迹：沿三段路径生成粒子拖尾，形成可见三角形
                if (ctx.teleportPath && ctx.teleportPath.length > 1 && !ctx.isPhantomReality) {
                    var TRAIL_STEP = 32;
                    var SEG_DELAY = 180;
                    for (var s = 1; s < ctx.teleportPath.length; s++) {
                        (function (seg, sx, sy, ex, ey) {
                            var segLen = Math.hypot(ex - sx, ey - sy);
                            var steps = Math.max(2, Math.ceil(segLen / TRAIL_STEP));
                            for (var t = 0; t <= steps; t++) {
                                (function (frac) {
                                    var tx = sx + (ex - sx) * frac;
                                    var ty = sy + (ey - sy) * frac;
                                    var dotDelay = (seg - 1) * SEG_DELAY + frac * 50;
                                    setTimeout(function () {
                                        burst(gameInstance, tx, ty, fam, 2, pal.light);
                                    }, dotDelay);
                                })(t / steps);
                            }
                        })(s,
                            ctx.teleportPath[s - 1].x, ctx.teleportPath[s - 1].y,
                            ctx.teleportPath[s].x, ctx.teleportPath[s].y
                        );
                    }
                }
                castFlash(gameInstance, ctx.toX, ctx.toY, fam, 50);
                return true;
            }
            if (ctx && ctx.mode === 'anchor') {
                addVfx(gameInstance, ctx.x, ctx.y, {
                    variant: 'asn_anchor_place', duration: 760,
                    radius: 44, family: fam, ox: ctx.x, oy: ctx.y,
                    anchorIndex: ctx.anchorIndex || 1, maxAnchors: ctx.maxAnchors || 3
                });
                castFlash(gameInstance, ctx.x, ctx.y, fam, 34);
                burst(gameInstance, ctx.x, ctx.y, fam, 14, pal.core);
                return true;
            }
            addVfx(gameInstance, px, py, {
                variant: 'asn_anchor_place', duration: 480, radius: 36,
                family: fam, ox: px, oy: py, anchorIndex: 1
            });
            burst(gameInstance, px, py, fam, 10, pal.light);
            return true;
        }

        if (id === 'decoy') {
            const dx = ctx ? ctx.decoyX : px;
            const dy = ctx ? ctx.decoyY : py;
            const tauntR = (ctx && ctx.tauntRadius) || ec.tauntRadius || 130;
            addVfx(gameInstance, dx, dy, {
                variant: 'asn_decoy_spawn', duration: 720,
                radius: tauntR, family: fam, ox: dx, oy: dy, tauntRadius: tauntR
            });
            addVfx(gameInstance, px, py, {
                variant: 'asn_decoy_fade', duration: (ctx && ctx.stealthMs) || 800,
                radius: 58, family: fam, ox: px, oy: py, targetX: dx, targetY: dy
            });
            addVfx(gameInstance, px, py, {
                variant: 'asn_stealth_shimmer', duration: 900, radius: 54,
                family: fam, ox: px, oy: py
            });
            return true;
        }

        if (id === 'phantom_trick') {
            const cx = ctx ? ctx.cloneX : px;
            const cy = ctx ? ctx.cloneY : py;
            const tx = ctx ? ctx.targetX : px;
            const ty = ctx ? ctx.targetY : py;
            addVfx(gameInstance, cx, cy, {
                variant: 'asn_clone_materialize', duration: 680,
                radius: 52, family: fam, ox: cx, oy: cy
            });
            addVfx(gameInstance, tx, ty, {
                variant: 'asn_phantom_link', duration: 880,
                radius: 130, family: fam,
                ox: cx, oy: cy, targetX: tx, targetY: ty,
                damageTransfer: ctx ? ctx.damageTransfer : 50
            });
            castFlash(gameInstance, tx, ty, fam, 46);
            return true;
        }

        if (id === 'reality_shift') {
            const fx = ctx ? ctx.fromX : px;
            const fy = ctx ? ctx.fromY : py;
            const tx = ctx ? ctx.toX : px + Math.cos(angle) * 150;
            const ty = ctx ? ctx.toY : py + Math.sin(angle) * 150;
            const clones = ctx ? ctx.cloneCount : 3;
            addVfx(gameInstance, fx, fy, {
                variant: 'asn_reality_blink', duration: 540,
                radius: 78, family: fam,
                ox: fx, oy: fy, targetX: tx, targetY: ty, cloneCount: clones
            });
            addVfx(gameInstance, tx, ty, {
                variant: 'asn_clone_materialize', duration: 620, delayMs: 90,
                radius: 68, family: fam, ox: tx, oy: ty,
                cloneCount: clones, ring: true
            });
            addVfx(gameInstance, tx, ty, {
                variant: 'asn_stealth_shimmer', duration: 640, delayMs: 60,
                radius: 50, family: fam, ox: tx, oy: ty
            });
            return true;
        }

        return false;
    }

    window.playAssassinDecoyExplosionVfx = function playAssassinDecoyExplosionVfx(player, x, y, radius, g) {
        if (!g) return;
        const fam = familyFor(player);
        addVfx(g, x, y, {
            variant: 'asn_decoy_explosion', duration: 560,
            radius: radius || 80, family: fam, ox: x, oy: y
        });
        burst(g, x, y, fam, 20, palette(fam).light);
    };

    window.drawTricksterAnchorOverlays = function drawTricksterAnchorOverlays(ctx, player, now) {
        if (!ctx || !player || !player._transpositionAnchors) return;
        const anchors = player._transpositionAnchors.filter(a => a && a.expireTime > now);
        if (!anchors.length) return;
        const fam = familyFor(player);
        const pal = palette(fam);
        anchors.forEach((a, i) => {
            const remain = a.expireTime - now;
            const fade = remain < 1200 ? remain / 1200 : 1;
            const pulse = 0.88 + Math.sin(now / 280 + i) * 0.12;
            ctx.save();
            ctx.globalAlpha = 0.55 * fade;
            ctx.strokeStyle = pal.light;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.arc(a.x, a.y, 18 * pulse, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.75 * fade;
            ctx.fillStyle = pal.core;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y - 10 * pulse);
            ctx.lineTo(a.x + 8 * pulse, a.y);
            ctx.lineTo(a.x, a.y + 10 * pulse);
            ctx.lineTo(a.x - 8 * pulse, a.y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = pal.main;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.globalAlpha = 0.9 * fade;
            ctx.fillStyle = pal.main;
            ctx.font = 'bold 9px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(String(i + 1), a.x, a.y + 3);
            ctx.restore();
        });
    };

    window.drawTricksterDecoySummon = function drawTricksterDecoySummon(ctx, s, now) {
        if (!ctx || !s) return;
        const age = now - (s.spawnTime || now);
        const fadeIn = Math.min(1, age / 380);
        const expireLeft = (s.expireTime || now) - now;
        const fadeOut = expireLeft < 600 ? expireLeft / 600 : 1;
        const alpha = fadeIn * fadeOut;
        const sx = s.x;
        const sy = s.y;
        const r = (s.size || 18) * 0.5;
        const tauntR = s.tauntRadius || 130;
        const pulse = 0.9 + Math.sin(now / 240) * 0.1;

        ctx.save();
        ctx.globalAlpha = alpha * 0.22;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, tauntR * pulse);
        g.addColorStop(0, 'rgba(120,160,255,0.2)');
        g.addColorStop(0.6, 'rgba(80,120,220,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, tauntR * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = 'rgba(140,180,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(sx, sy, tauntR * pulse * 0.92, now / 900, now / 900 + Math.PI * 1.6);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle = s.color || '#aaaaff';
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = 'rgba(200,220,255,0.6)';
        ctx.beginPath();
        ctx.arc(sx - r * 0.25, sy - r * 0.2, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ddeeff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - r * 0.5, sy - r * 0.15);
        ctx.lineTo(sx + r * 0.5, sy - r * 0.15);
        ctx.moveTo(sx, sy - r * 0.55);
        ctx.lineTo(sx, sy + r * 0.35);
        ctx.stroke();

        const bw = s.size || 18;
        ctx.fillStyle = '#334466';
        ctx.fillRect(sx - bw / 2, sy - (s.size || 18) - 8, bw, 4);
        ctx.fillStyle = '#88aaff';
        ctx.fillRect(sx - bw / 2, sy - (s.size || 18) - 8, bw * (s.hp / s.maxHp), 4);
        ctx.restore();
    };

    window.playAssassinBackstabFailVfx = function playAssassinBackstabFailVfx(player, target, g) {
        if (!player || !target || !g) return;
        const fam = familyFor(player);
        addVfx(g, target.x, target.y, {
            variant: 'asn_backstab_zone', duration: 600, radius: 48,
            family: fam, angle: window.getCombatantFacingAngle(target),
            fail: true, ox: target.x, oy: target.y
        });
    };

    window.playAssassinMultiStrikeVfx = function playAssassinMultiStrikeVfx(player, skillDef, g, ec) {
        const fam = familyFor(player);
        const ang = player.angle;
        addVfx(g, player.x, player.y, {
            variant: 'asn_vortex_start', duration: 900, radius: ec.range || 70,
            family: fam, angle: ang, halfAngleDeg: ec.halfAngleDeg || 55,
            ox: player.x, oy: player.y
        });
    };

    window.playAssassinVortexStrikeVfx = function playAssassinVortexStrikeVfx(player, g, idx, total, ec) {
        const fam = familyFor(player);
        addVfx(g, player.x, player.y, {
            variant: 'asn_vortex_strike', duration: 280, delayMs: 0,
            radius: (ec.range || 70) * (0.85 + idx * 0.08),
            family: fam, angle: player.angle, strikeIndex: idx,
            ox: player.x, oy: player.y
        });
        if (idx === total - 1) {
            addVfx(g, player.x, player.y, {
                variant: 'asn_vortex_burst', duration: 520, delayMs: 60,
                radius: ec.finalBurstRadius || 85, family: fam,
                ox: player.x, oy: player.y
            });
        }
    };

    /** 影袭返回 · 专属特效 */
    window.playAssassinShadowRaidReturnVfx = function playAssassinShadowRaidReturnVfx(player, g, opts) {
        if (!player || !g) return;
        const o = opts || {};
        const fromX = o.fromX != null ? o.fromX : player.x;
        const fromY = o.fromY != null ? o.fromY : player.y;
        const toX = o.toX != null ? o.toX : player.x;
        const toY = o.toY != null ? o.toY : player.y;
        const fam = familyFor(player);
        const pal = palette(fam);
        const ang = Math.atan2(toY - fromY, toX - fromX);
        const dist = Math.hypot(toX - fromX, toY - fromY);
        const trailR = Math.max(48, Math.min(150, dist * 0.5 || 80));

        addVfx(g, fromX, fromY, {
            variant: 'asn_raid_return_trail',
            duration: 460, radius: trailR,
            family: fam, angle: ang,
            ox: fromX, oy: fromY,
            targetX: toX, targetY: toY
        });
        addVfx(g, fromX, fromY, {
            variant: 'asn_shadow_dash',
            duration: 400, delayMs: 20,
            radius: Math.max(40, dist * 0.42),
            family: fam, angle: ang,
            ox: fromX, oy: fromY,
            targetX: toX, targetY: toY
        });
        addVfx(g, toX, toY, {
            variant: 'asn_raid_return_arrive',
            duration: 560, delayMs: 300,
            radius: 78, family: fam,
            angle: ang + Math.PI,
            ox: toX, oy: toY
        });
        castFlash(g, toX, toY, fam, 58);
        burst(g, toX, toY, fam, 18, pal.core);
        (o.hitTargets || []).forEach((m, i) => {
            if (!m) return;
            addVfx(g, m.x, m.y, {
                variant: 'asn_backstab_flash',
                duration: 360, delayMs: 280 + i * 40,
                radius: 46, family: fam
            });
            burst(g, m.x, m.y, fam, 10, pal.light);
        });
        if (typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(toX, toY, { skipSound: false, sourceX: fromX, sourceY: fromY });
        }
        if (g.screenShake) {
            g.screenShake.amplitude = Math.max(g.screenShake.amplitude || 0, 4.5);
            g.screenShake.timer = Math.max(g.screenShake.timer || 0, 320);
            g.screenShake.duration = Math.max(g.screenShake.duration || 0, 320);
        }
    };

    /** 暗夜影袭 / 永夜 结束时终结斩特效 */
    window.playAssassinMidnightFinisherVfx = function playAssassinMidnightFinisherVfx(player, g, opts) {
        if (!player || !g) return;
        const fam = familyFor(player);
        const pal = palette(fam);
        const px = player.x;
        const py = player.y;
        const angle = typeof player.angle === 'number' ? player.angle : 0;
        const o = opts || {};
        const radius = o.radius || 100;
        const eternal = !!o.eternal;

        addVfx(g, px, py, {
            variant: 'asn_midnight_finisher_warp',
            duration: 240, radius: radius * 0.55,
            family: fam, angle, ox: px, oy: py
        });
        addVfx(g, px, py, {
            variant: 'asn_midnight_finisher_slash',
            duration: eternal ? 760 : 620,
            delayMs: 70,
            radius: radius * 1.15,
            family: fam, angle, eternal,
            ox: px, oy: py
        });
        addVfx(g, px, py, {
            variant: 'asn_midnight_finisher_burst',
            duration: 560,
            delayMs: eternal ? 460 : 340,
            radius: radius,
            family: fam, ox: px, oy: py, eternal
        });
        burst(g, px, py, fam, eternal ? 30 : 20, pal.core);
        if (typeof g.triggerHitImpact === 'function') {
            g.triggerHitImpact(px, py, { skipSound: false });
        }
        if (g.screenShake) {
            g.screenShake.amplitude = Math.max(g.screenShake.amplitude || 0, eternal ? 7 : 5);
            g.screenShake.timer = Math.max(g.screenShake.timer || 0, eternal ? 480 : 360);
            g.screenShake.duration = Math.max(g.screenShake.duration || 0, eternal ? 480 : 360);
        }
    };

    window.playAssassinSkillVfx = function playAssassinSkillVfx(player, skillDef, gameInstance, context) {
        if (!player || !skillDef || !gameInstance) return false;
        if (!isAssassinTree(player) && skillDef.classId !== 'assassin') return false;
        const ctxEarly = context || {};
        if (!isAssassinSkill(skillDef) && skillDef.slotType !== 'basic'
            && !ctxEarly.parrySuccess && !ctxEarly.perfectDodge && !ctxEarly.returnDash
            && skillDef.id !== 'parry_stance') return false;

        const fam = familyFor(player);
        const pal = palette(fam);
        const angle = typeof player.angle === 'number' ? player.angle : 0;
        const px = player.x;
        const py = player.y;
        const ec = skillDef.entityConfig || {};
        const ctx = context || {};
        const id = skillDef.id;
        const primary = ctx.primaryTarget;
        const hitTargets = ctx.hitTargets || [];
        const comboStep = ctx.comboStep != null ? ctx.comboStep : (skillDef._comboStep || 0);
        const comboChain = ctx.comboChain || skillDef._comboChain || ec.comboChain || 4;
        const range = skillDef.range || ec.range || ec.maxRange || 80;

        if (ctx.parrySuccess) {
            addVfx(gameInstance, px, py, {
                variant: 'asn_parry_burst', duration: 520, radius: 64,
                family: fam, ox: px, oy: py
            });
            return true;
        }
        if (ctx.perfectDodge) {
            addVfx(gameInstance, px, py, {
                variant: 'asn_perfect_dodge', duration: 500, radius: 72,
                family: fam, ox: px, oy: py
            });
            return true;
        }
        if (ctx.returnDash) {
            if (typeof window.playAssassinShadowRaidReturnVfx === 'function') {
                window.playAssassinShadowRaidReturnVfx(player, gameInstance, {
                    fromX: ctx.fromX != null ? ctx.fromX : px,
                    fromY: ctx.fromY != null ? ctx.fromY : py,
                    toX: ctx.dashEndX != null ? ctx.dashEndX : px,
                    toY: ctx.dashEndY != null ? ctx.dashEndY : py,
                    hitTargets
                });
            }
            return true;
        }
        if (id === 'parry_stance') {
            addVfx(gameInstance, px, py, {
                variant: 'asn_parry_burst', duration: 380, radius: 48,
                family: fam, ox: px, oy: py
            });
            return true;
        }

        // ---- 远程分支普攻（骗术师/毒师）----
        if (skillDef.entityType === 'projectile'
            && (id === 'assassin_basic' || skillDef.slotType === 'basic' || skillDef.type === 'basic')
            && isAssassinTree(player)
            && (id.includes('shuriken') || id.includes('flick') || ec.projectileCount)) {
            const count = ec.projectileCount || 3;
            const spread = (ec.spreadAngleDeg || 20) * Math.PI / 180;
            const tgt = aimTarget(primary, gameInstance, px, py, range);
            const tx = tgt ? tgt.x : px + Math.cos(angle) * range * 0.7;
            const ty = tgt ? tgt.y : py + Math.sin(angle) * range * 0.7;
            castFlash(gameInstance, px, py, fam, 28);
            for (let i = 0; i < count; i++) {
                const off = count > 1 ? spread * (i / (count - 1) - 0.5) : 0;
                const a = angle + off;
                const ex = px + Math.cos(a) * range * 0.75;
                const ey = py + Math.sin(a) * range * 0.75;
                addVfx(gameInstance, ex, ey, {
                    variant: 'asn_shuriken_trail', duration: 280, delayMs: i * 40,
                    radius: 36, angle: a, family: fam,
                    ox: px, oy: py, targetX: ex, targetY: ey, shotIndex: i
                });
            }
            if (tgt) {
                addVfx(gameInstance, tx, ty, {
                    variant: 'asn_poison_hit', duration: 360, delayMs: 200,
                    radius: 44, family: fam, ox: px, oy: py
                });
            }
            return true;
        }

        // ---- 普攻：影刃四段（近战）----
        if ((id === 'assassin_basic' || (skillDef.slotType === 'basic' && isAssassinTree(player)))
            && skillDef.entityType !== 'projectile') {
            const variants = ['shadow_stab', 'shadow_sweep', 'asn_whirl_ring', 'shadow_pierce'];
            const durs = [320, 360, 400, 480];
            const v = variants[Math.min(comboStep, variants.length - 1)] || 'shadow_stab';
            const dur = durs[Math.min(comboStep, durs.length - 1)] || 320;
            const coneR = (ec.comboStepRange && ec.comboStepRange[comboStep]) || range;
            const halfAng = (ec.comboStepAngle && ec.comboStepAngle[comboStep] === 360)
                ? 180 : ((ec.comboStepAngle && ec.comboStepAngle[comboStep]) || 35);
            castFlash(gameInstance, px, py, fam, 24 + comboStep * 4);
            const vfxOpts = {
                variant: v, duration: dur, radius: coneR, angle,
                family: fam, halfAngleDeg: halfAng, ox: px, oy: py,
                comboStep, comboChain
            };
            const isPierceFinisher = ec.comboStepDashBehind && ec.comboStepDashBehind[comboStep];
            if (isPierceFinisher) {
                vfxOpts.pierceTargetX = ctx.pierceTargetX;
                vfxOpts.pierceTargetY = ctx.pierceTargetY;
                vfxOpts.dashEndX = ctx.dashEndX || px + Math.cos(angle) * coneR * 1.1;
                vfxOpts.dashEndY = ctx.dashEndY || py + Math.sin(angle) * coneR * 1.1;
            }
            addVfx(gameInstance, px, py, vfxOpts);
            hitTargets.forEach((m, i) => {
                addVfx(gameInstance, m.x, m.y, {
                    variant: comboStep >= 3 ? 'asn_backstab_flash' : 'hit_spark',
                    duration: 300, delayMs: 80 + i * 30, radius: 40 + comboStep * 6,
                    family: fam, ox: px, oy: py
                });
                burst(gameInstance, m.x, m.y, fam, 8);
            });
            return true;
        }

        // ---- 暗影突刺 / 背刺 / 暗杀 ----
        if (id === 'shadow_pierce' || id === 'backstab' || id === 'assassinate') {
            const tgt = primary || aimTarget(null, gameInstance, px, py, range);
            castFlash(gameInstance, px, py, fam, id === 'assassinate' ? 52 : 38);
            if (id === 'shadow_pierce') {
                addVfx(gameInstance, px, py, {
                    variant: 'asn_shadow_dash', duration: 380, radius: range,
                    angle, family: fam, ox: px, oy: py,
                    targetX: tgt ? tgt.x : px + Math.cos(angle) * range,
                    targetY: tgt ? tgt.y : py + Math.sin(angle) * range
                });
            } else {
                addVfx(gameInstance, tgt ? tgt.x : px, tgt ? tgt.y : py, {
                    variant: 'asn_backstab_slash', duration: id === 'assassinate' ? 620 : 480,
                    radius: 72, angle: tgt ? Math.atan2(tgt.y - py, tgt.x - px) : angle,
                    family: fam, execute: id === 'assassinate', ox: px, oy: py
                });
            }
            if (tgt) burst(gameInstance, tgt.x, tgt.y, fam, id === 'assassinate' ? 22 : 14);
            return true;
        }

        // ---- 影涡 / 影袭 / 影舞 ----
        if (id === 'shadow_vortex' || id === 'shadow_raid' || id === 'shadow_dance') {
            castFlash(gameInstance, px, py, fam, 42);
            if (id === 'shadow_vortex') {
                window.playAssassinMultiStrikeVfx(player, skillDef, gameInstance, ec);
            } else {
                const dashDist = ec.maxDistance || ec.dashRange || (id === 'shadow_dance' ? 130 : 110);
                const tx = px + Math.cos(angle) * dashDist;
                const ty = py + Math.sin(angle) * dashDist;
                addVfx(gameInstance, px, py, {
                    variant: 'asn_shadow_dash', duration: id === 'shadow_dance' ? 680 : 460,
                    radius: ec.maxDistance || ec.dashRange || 140,
                    angle, family: fam, dashCount: ec.dashCount || 1,
                    ox: px, oy: py, targetX: tx, targetY: ty
                });
            }
            return true;
        }

        // ---- 印记类 ----
        if (id === 'shadow_bind' || id === 'shadow_death_mark' || id === 'death_sentence') {
            const tgt = primary || aimTarget(null, gameInstance, px, py, range);
            const tx = tgt ? tgt.x : px + Math.cos(angle) * 200;
            const ty = tgt ? tgt.y : py + Math.sin(angle) * 200;
            addVfx(gameInstance, px, py, {
                variant: 'asn_mark_shot', duration: 340, radius: 40,
                angle, family: fam, ox: px, oy: py, targetX: tx, targetY: ty
            });
            addVfx(gameInstance, tx, ty, {
                variant: 'asn_mark_bind', duration: 720, delayMs: 280,
                radius: id === 'death_sentence' ? 56 : 48,
                family: fam, deathMark: id !== 'shadow_bind', ox: tx, oy: ty
            });
            return true;
        }

        // ---- 终极：暗夜/永夜/千影 ----
        if (id === 'midnight_raid' || id === 'nightfall' || id === 'eternal_night') {
            if (id === 'midnight_raid') {
                addVfx(gameInstance, px, py, {
                    variant: 'asn_stealth_shimmer', duration: 4200,
                    radius: 72, family: fam, ox: px, oy: py
                });
            }
            castFlash(gameInstance, px, py, fam, 64);
            burst(gameInstance, px, py, fam, 24, pal.core);
            return true;
        }

        if (id === 'phantom_array') {
            const tgt = primary || aimTarget(null, gameInstance, px, py, 280);
            const cx = tgt ? tgt.x : px;
            const cy = tgt ? tgt.y : py;
            addVfx(gameInstance, cx, cy, {
                variant: 'asn_phantom_ring', duration: 880, radius: ec.ringRadius || 250,
                family: fam, cloneCount: ec.cloneCount || 6, ox: cx, oy: cy
            });
            castFlash(gameInstance, cx, cy, fam, 70);
            return true;
        }

        // ---- 骗术师：引渡/替身/幻影戏法/虚实交错 ----
        if (id === 'shadow_feast') {
            const tgt = primary || aimTarget(null, gameInstance, px, py, range);
            const fx = tgt ? tgt.x : px;
            const fy = tgt ? tgt.y : py;
            addVfx(gameInstance, fx, fy, {
                variant: 'asn_backstab_slash', duration: 560, radius: 72,
                family: fam, ox: px, oy: py,
                angle: tgt ? Math.atan2(tgt.y - py, tgt.x - px) : angle
            });
            if (tgt) burst(gameInstance, tgt.x, tgt.y, fam, 18);
            return true;
        }

        if (id === 'transposition' || id === 'phantom_reality' || id === 'decoy'
            || id === 'phantom_trick' || id === 'reality_shift' || id === 'mirror_domain') {
            if (playAssassinTricksterSkillVfx(player, skillDef, gameInstance, ec, fam, pal, px, py, angle, range, primary)) {
                return true;
            }
        }

        // ---- 毒师 ----
        if (id === 'venom_sting' || id === 'lethal_venom') {
            castFlash(gameInstance, px, py, fam, 32);
            addVfx(gameInstance, px + Math.cos(angle) * 40, py + Math.sin(angle) * 40, {
                variant: 'asn_venom_stab', duration: 380, radius: ec.range || 60,
                angle, family: fam, halfAngleDeg: ec.halfAngleDeg || 40, ox: px, oy: py
            });
            return true;
        }

        if (id === 'poison_mist' || id === 'plague_cloud') {
            const tgt = primary || aimTarget(null, gameInstance, px, py, 400);
            const fx = tgt ? tgt.x : px + Math.cos(angle) * 120;
            const fy = tgt ? tgt.y : py + Math.sin(angle) * 120;
            addVfx(gameInstance, fx, fy, {
                variant: 'asn_poison_mist', duration: ec.fieldDurationMs || 8000,
                radius: ec.fieldRadius || 80, family: fam, ox: fx, oy: fy
            });
            return true;
        }

        if (id === 'contagion' || id === 'pandemic' || id === 'toxin_detonation' || id === 'withering') {
            castFlash(gameInstance, px, py, fam, 48);
            addVfx(gameInstance, px, py, {
                variant: id.includes('detonation') || id === 'withering'
                    ? 'asn_poison_detonate' : 'asn_contagion_wave',
                duration: 620, radius: ec.spreadRadius || 120,
                family: fam, ox: px, oy: py
            });
            hitTargets.forEach((m, i) => {
                burst(gameInstance, m.x, m.y, fam, 12);
                addVfx(gameInstance, m.x, m.y, {
                    variant: 'asn_poison_hit', duration: 400, delayMs: i * 40,
                    radius: 36, family: fam
                });
            });
            return true;
        }

        // ---- 弹反 / 完美闪避（由 shadow-system 调用） ----
        // handled above

        // 默认：暗影斩击
        castFlash(gameInstance, px, py, fam, 34);
        addVfx(gameInstance, px + Math.cos(angle) * 40, py + Math.sin(angle) * 40, {
            variant: 'asn_shadow_slash', duration: 400, radius: range * 0.6,
            angle, family: fam, ox: px, oy: py
        });
        hitTargets.forEach(m => burst(gameInstance, m.x, m.y, fam, 10));
        return true;
    };

    // ---- 绘制 ----
    window.drawAssassinSkillVfxEffect = function drawAssassinSkillVfxEffect(ctx, effect, progress, alpha, elapsed, meta) {
        const variant = (effect && effect.variant) || '';
        if (!variant.startsWith('asn_')) return false;

        const fam = (effect && effect.family) || 'shadow_force';
        const pal = palette(fam);
        const ang = effect.angle || 0;
        const x = effect.x;
        const y = effect.y;
        const r = effect.radius || 50;
        const ox = effect.ox != null ? effect.ox : x;
        const oy = effect.oy != null ? effect.oy : y;
        const tx = effect.targetX != null ? effect.targetX : x;
        const ty = effect.targetY != null ? effect.targetY : y;
        const t = easeOutCubic(clamp01(progress));
        const fade = 1 - easeOutQuad(clamp01((progress - 0.35) / 0.65));

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        switch (variant) {
            case 'asn_whirl_ring': {
                const spin = ang + elapsed * 0.006;
                ctx.translate(x, y);
                ctx.rotate(spin);
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.75 * t, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.5;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 1.5;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
                    ctx.lineTo(Math.cos(a) * r * 0.8 * t, Math.sin(a) * r * 0.8 * t);
                    ctx.stroke();
                }
                ctx.restore();
                return true;
            }
            case 'asn_backstab_slash':
            case 'asn_shadow_slash': {
                const len = r * (0.6 + t * 0.9);
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalAlpha = alpha * fade;
                ctx.lineCap = 'round';
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(-len * 0.2, 0);
                ctx.lineTo(len, 0);
                ctx.stroke();
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(0, -len * 0.15);
                ctx.lineTo(len * 0.95, len * 0.15);
                ctx.stroke();
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(len * 0.5, -len * 0.08);
                ctx.lineTo(len, 0);
                ctx.stroke();
                ctx.restore();
                return true;
            }
            case 'asn_backstab_flash': {
                ctx.globalAlpha = alpha * (1 - t) * 0.9;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r * t);
                g.addColorStop(0, pal.core);
                g.addColorStop(0.4, pal.light);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r * t, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_shadow_dash': {
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 10;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.8;
                ctx.fillStyle = pal.core;
                ctx.beginPath();
                ctx.arc(bx, by, 5 + t * 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.25;
                ctx.fillStyle = '#110018';
                ctx.beginPath();
                ctx.ellipse(bx, by + 6, r * 0.35, r * 0.12, ang, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_raid_return_trail': {
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.globalAlpha = alpha * fade * 0.28;
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 14;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(tx, ty);
                ctx.stroke();
                for (let i = 0; i < 5; i++) {
                    const gt = Math.max(0, t - i * 0.08);
                    const gx = ox + (tx - ox) * gt;
                    const gy = oy + (ty - oy) * gt;
                    ctx.globalAlpha = alpha * (1 - gt) * 0.55;
                    ctx.fillStyle = i % 2 === 0 ? pal.main : pal.light;
                    ctx.beginPath();
                    ctx.arc(gx, gy, 4 + (1 - gt) * 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = alpha * fade * 0.75;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.globalAlpha = alpha * (1 - t * 0.3);
                ctx.fillStyle = pal.core;
                ctx.beginPath();
                ctx.arc(bx, by, 6 + t * 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_raid_return_arrive': {
                const nr = r * easeOutBack(Math.min(1, t * 1.1));
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalAlpha = alpha * (1 - t * 0.45);
                const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, nr);
                grad.addColorStop(0, pal.core);
                grad.addColorStop(0.35, pal.light);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, nr, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * (1 - t * 0.35);
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 3;
                for (let i = 0; i < 4; i++) {
                    const a = (Math.PI / 2) * i + t * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * nr * 0.95, Math.sin(a) * nr * 0.95);
                    ctx.stroke();
                }
                ctx.restore();
                return true;
            }
            case 'asn_vortex_start':
            case 'asn_vortex_strike': {
                const half = (effect.halfAngleDeg || 55) * Math.PI / 180;
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.globalAlpha = alpha * fade * 0.7;
                ctx.fillStyle = pal.dark;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, r * t, -half, half);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = alpha * fade;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(0, 0, r * t * 0.92, -half, half);
                ctx.stroke();
                ctx.restore();
                return true;
            }
            case 'asn_vortex_burst': {
                const nr = r * easeOutBack(t);
                ctx.globalAlpha = alpha * (1 - t * 0.6);
                const grad = ctx.createRadialGradient(x, y, 0, x, y, nr);
                grad.addColorStop(0, pal.core);
                grad.addColorStop(0.35, pal.main);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(x, y, nr, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_mark_shot': {
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.globalAlpha = alpha * fade;
                ctx.fillStyle = pal.core;
                ctx.beginPath();
                ctx.arc(bx, by, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(bx - 5, by);
                ctx.lineTo(bx + 5, by);
                ctx.moveTo(bx, by - 5);
                ctx.lineTo(bx, by + 5);
                ctx.stroke();
                ctx.restore();
                return true;
            }
            case 'asn_mark_bind': {
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.strokeStyle = effect.deathMark ? '#ff2244' : pal.main;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.arc(x, y, r * (0.7 + Math.sin(elapsed * 0.008) * 0.08), 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                return true;
            }
            case 'asn_midnight_veil': {
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = alpha * 0.28 * (0.85 + Math.sin(elapsed * 0.003) * 0.1);
                const grad = ctx.createRadialGradient(x, y, r * 0.05, x, y, r * 0.85);
                grad.addColorStop(0, 'rgba(160,80,255,0.06)');
                grad.addColorStop(0.55, 'rgba(100,40,180,0.16)');
                grad.addColorStop(1, 'rgba(60,20,100,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_midnight_finisher_warp': {
                const shrink = r * (1.1 - t * 0.55);
                ctx.globalAlpha = alpha * (1 - t * 0.35) * 0.75;
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, shrink, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * (1 - t) * 0.45;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + elapsed * 0.004;
                    const ex = x + Math.cos(a) * shrink;
                    const ey = y + Math.sin(a) * shrink;
                    ctx.strokeStyle = pal.main;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(ex, ey);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }
                ctx.restore();
                return true;
            }
            case 'asn_midnight_finisher_slash': {
                const slashCount = effect.eternal ? 6 : 4;
                const len = r * (0.35 + t * 0.95);
                ctx.translate(x, y);
                ctx.rotate(ang + (effect.eternal ? elapsed * 0.0015 : 0));
                ctx.lineCap = 'round';
                for (let i = 0; i < slashCount; i++) {
                    const a = (Math.PI * 2 * i) / slashCount;
                    const fadeSlash = Math.max(0, 1 - Math.max(0, t - 0.15) * 1.4);
                    ctx.globalAlpha = alpha * fadeSlash * 0.9;
                    ctx.strokeStyle = pal.dark;
                    ctx.lineWidth = 10;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * len * 0.08, Math.sin(a) * len * 0.08);
                    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
                    ctx.stroke();
                    ctx.globalAlpha = alpha * fadeSlash;
                    ctx.strokeStyle = i % 2 === 0 ? pal.core : pal.light;
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * len * 0.12, Math.sin(a) * len * 0.12);
                    ctx.lineTo(Math.cos(a) * len * 0.98, Math.sin(a) * len * 0.98);
                    ctx.stroke();
                }
                ctx.globalAlpha = alpha * (1 - t) * 0.35;
                ctx.fillStyle = '#110022';
                ctx.beginPath();
                ctx.arc(0, 0, len * 0.22, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_midnight_finisher_burst': {
                const nr = r * easeOutBack(Math.min(1, t * 1.15));
                ctx.globalAlpha = alpha * (1 - t * 0.55);
                const grad = ctx.createRadialGradient(x, y, 0, x, y, nr);
                grad.addColorStop(0, effect.eternal ? '#eeddff' : pal.core);
                grad.addColorStop(0.25, pal.light);
                grad.addColorStop(0.55, pal.main);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(x, y, nr, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * (1 - t) * 0.85;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = effect.eternal ? 4 : 3;
                ctx.beginPath();
                ctx.arc(x, y, nr * 0.82, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * (1 - t) * 0.5;
                ctx.strokeStyle = pal.dark;
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.arc(x, y, nr * 0.55, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                return true;
            }
            case 'asn_phantom_ring': {
                const count = effect.cloneCount || 6;
                ctx.globalAlpha = alpha * fade;
                for (let i = 0; i < count; i++) {
                    const a = (Math.PI * 2 * i) / count + elapsed * 0.002;
                    const cx = x + Math.cos(a) * r * t;
                    const cy = y + Math.sin(a) * r * t;
                    ctx.fillStyle = pal.light;
                    ctx.globalAlpha = alpha * fade * 0.7;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = pal.main;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }
                ctx.restore();
                return true;
            }
            case 'asn_poison_mist': {
                ctx.globalAlpha = alpha * 0.45;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, 'rgba(100,220,80,0.35)');
                g.addColorStop(0.6, 'rgba(40,120,30,0.25)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r * (0.92 + Math.sin(elapsed * 0.004) * 0.04), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_poison_detonate':
            case 'asn_contagion_wave': {
                const wr = r * easeOutCubic(t);
                ctx.globalAlpha = alpha * (1 - t * 0.7);
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, wr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * (1 - t) * 0.35;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.arc(x, y, wr * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_parry_burst': {
                ctx.translate(x, y);
                ctx.globalAlpha = alpha * (1 - t * 0.5);
                ctx.strokeStyle = '#ffdd44';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(0, 0, r * t, 0, Math.PI * 2);
                ctx.stroke();
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + elapsed * 0.005;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * r * t, Math.sin(a) * r * t);
                    ctx.stroke();
                }
                ctx.restore();
                return true;
            }
            case 'asn_perfect_dodge': {
                ctx.globalAlpha = alpha * (1 - t * 0.4);
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, r * (0.5 + t * 0.5), 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = pal.core;
                ctx.globalAlpha = alpha * (1 - t) * 0.6;
                ctx.beginPath();
                ctx.arc(x, y - r * 0.2, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_backstab_zone': {
                const facing = effect.angle || 0;
                ctx.translate(x, y);
                ctx.rotate(facing + Math.PI);
                ctx.globalAlpha = alpha * fade * 0.55;
                ctx.fillStyle = effect.fail ? 'rgba(255,60,60,0.25)' : 'rgba(120,60,200,0.2)';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, r, -Math.PI / 3, Math.PI / 3);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_shuriken_trail': {
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.globalAlpha = alpha * fade;
                ctx.fillStyle = pal.main;
                ctx.translate(bx, by);
                ctx.rotate(ang + elapsed * 0.02);
                ctx.fillRect(-4, -1, 8, 2);
                ctx.fillRect(-1, -4, 2, 8);
                ctx.restore();
                return true;
            }
            case 'asn_stealth_shimmer': {
                ctx.globalAlpha = alpha * (1 - t) * 0.5;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(x, y, r * (1 + t * 0.3), 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                return true;
            }
            case 'asn_anchor_place': {
                const idx = effect.anchorIndex || 1;
                const maxA = effect.maxAnchors || 3;
                const rot = elapsed * 0.003;
                const sz = r * (0.55 + t * 0.25) * (effect.teleport ? 0.85 : 1);
                ctx.translate(x, y);
                ctx.rotate(rot);
                ctx.globalAlpha = alpha * fade * 0.7;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.arc(0, 0, sz * 1.15, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = alpha * fade;
                ctx.fillStyle = pal.core;
                ctx.beginPath();
                ctx.moveTo(0, -sz);
                ctx.lineTo(sz * 0.75, 0);
                ctx.lineTo(0, sz);
                ctx.lineTo(-sz * 0.75, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 2;
                ctx.stroke();
                if (!effect.teleport) {
                    for (let i = 0; i < maxA; i++) {
                        const a = (Math.PI * 2 * i) / maxA - Math.PI / 2;
                        const on = i < idx;
                        ctx.globalAlpha = alpha * fade * (on ? 0.9 : 0.25);
                        ctx.fillStyle = on ? pal.light : pal.dark;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * sz * 1.35, Math.sin(a) * sz * 1.35, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
                return true;
            }
            case 'asn_transposition_swap': {
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.globalAlpha = alpha * (1 - t) * 0.55;
                ctx.fillStyle = pal.dark;
                ctx.beginPath();
                ctx.arc(ox, oy, r * 0.28, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.45;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 5]);
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = alpha * fade;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(ox - 8, oy - 8);
                ctx.lineTo(tx + 8, ty + 8);
                ctx.moveTo(ox + 8, oy - 8);
                ctx.lineTo(tx - 8, ty + 8);
                ctx.stroke();
                const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.5);
                grad.addColorStop(0, pal.core);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha * fade * 0.8;
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(bx, by, r * 0.45 * (0.6 + t * 0.4), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_transposition_burst': {
                const wr = r * easeOutBack(Math.min(1, t * 1.1));
                ctx.globalAlpha = alpha * (1 - t * 0.65);
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, wr, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * (1 - t) * 0.4;
                const g2 = ctx.createRadialGradient(x, y, 0, x, y, wr * 0.7);
                g2.addColorStop(0, pal.core);
                g2.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g2;
                ctx.beginPath();
                ctx.arc(x, y, wr * 0.7, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_decoy_spawn': {
                const tauntR = effect.tauntRadius || r;
                const bodyR = r * 0.22 * (0.5 + t * 0.5);
                ctx.globalAlpha = alpha * fade * 0.25;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([8, 7]);
                ctx.beginPath();
                ctx.arc(x, y, tauntR * (0.7 + t * 0.3), 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = alpha * fade * 0.5;
                const rg = ctx.createRadialGradient(x, y, 0, x, y, bodyR * 3);
                rg.addColorStop(0, 'rgba(180,200,255,0.5)');
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.beginPath();
                ctx.arc(x, y, bodyR * 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.arc(x, y, bodyR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - bodyR * 0.6, y - bodyR * 0.2);
                ctx.lineTo(x + bodyR * 0.6, y - bodyR * 0.2);
                ctx.moveTo(x, y - bodyR * 0.7);
                ctx.lineTo(x, y + bodyR * 0.5);
                ctx.stroke();
                ctx.restore();
                return true;
            }
            case 'asn_decoy_fade': {
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                ctx.globalAlpha = alpha * (1 - t) * 0.55;
                ctx.fillStyle = pal.light;
                ctx.beginPath();
                ctx.arc(bx, by, r * 0.25 * (1 - t * 0.4), 0, Math.PI * 2);
                ctx.fill();
                for (let i = 1; i <= 3; i++) {
                    const ghostT = Math.max(0, t - i * 0.12);
                    const gx = ox + (tx - ox) * ghostT;
                    const gy = oy + (ty - oy) * ghostT;
                    ctx.globalAlpha = alpha * (1 - ghostT) * 0.22;
                    ctx.fillStyle = pal.main;
                    ctx.beginPath();
                    ctx.arc(gx, gy, r * 0.18, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                return true;
            }
            case 'asn_decoy_explosion': {
                const nr = r * easeOutBack(Math.min(1, t * 1.2));
                ctx.globalAlpha = alpha * (1 - t * 0.5);
                const grad = ctx.createRadialGradient(x, y, 0, x, y, nr);
                grad.addColorStop(0, '#eef4ff');
                grad.addColorStop(0.3, pal.light);
                grad.addColorStop(0.65, pal.main);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(x, y, nr, 0, Math.PI * 2);
                ctx.fill();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + elapsed * 0.004;
                    ctx.globalAlpha = alpha * (1 - t) * 0.7;
                    ctx.strokeStyle = pal.core;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * nr * 0.85, y + Math.sin(a) * nr * 0.85);
                    ctx.stroke();
                }
                ctx.restore();
                return true;
            }
            case 'asn_phantom_link': {
                ctx.globalAlpha = alpha * fade * 0.65;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 2;
                ctx.setLineDash([7, 6]);
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(tx, ty);
                ctx.stroke();
                ctx.setLineDash([]);
                const midX = (ox + tx) * 0.5;
                const midY = (oy + ty) * 0.5;
                const shieldR = 14 + Math.sin(elapsed * 0.006) * 3;
                ctx.globalAlpha = alpha * fade;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(midX, midY - shieldR);
                ctx.lineTo(midX + shieldR * 0.85, midY);
                ctx.lineTo(midX, midY + shieldR);
                ctx.lineTo(midX - shieldR * 0.85, midY);
                ctx.closePath();
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.35;
                ctx.fillStyle = pal.main;
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.fillStyle = pal.light;
                ctx.font = 'bold 10px Courier New';
                ctx.textAlign = 'center';
                ctx.fillText((effect.damageTransfer || 50) + '%', midX, midY + 4);
                ctx.restore();
                return true;
            }
            case 'asn_clone_materialize': {
                const count = effect.ring ? (effect.cloneCount || 3) : 1;
                const baseR = r * (0.35 + t * 0.55);
                if (effect.ring) {
                    for (let i = 0; i < count; i++) {
                        const a = (Math.PI * 2 * i) / count + elapsed * 0.002;
                        const cx = x + Math.cos(a) * baseR;
                        const cy = y + Math.sin(a) * baseR;
                        ctx.globalAlpha = alpha * fade * 0.7;
                        ctx.fillStyle = pal.light;
                        ctx.beginPath();
                        ctx.arc(cx, cy, 7 * t, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = pal.main;
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(x, y);
                        ctx.stroke();
                    }
                }
                ctx.globalAlpha = alpha * fade;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, baseR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * fade * 0.45;
                const rg = ctx.createRadialGradient(x, y, 0, x, y, baseR);
                rg.addColorStop(0, pal.core);
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.beginPath();
                ctx.arc(x, y, baseR * 0.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_reality_blink': {
                const bx = ox + (tx - ox) * t;
                const by = oy + (ty - oy) * t;
                const clones = effect.cloneCount || 3;
                for (let i = 0; i < clones; i++) {
                    const stutter = Math.max(0, t - i * 0.08);
                    const wobble = Math.sin(elapsed * 0.01 + i * 1.7) * 5;
                    const sx = ox + (tx - ox) * stutter + wobble;
                    const sy = oy + (ty - oy) * stutter - wobble * 0.6;
                    ctx.globalAlpha = alpha * (1 - stutter) * 0.35;
                    ctx.fillStyle = pal.main;
                    ctx.beginPath();
                    ctx.arc(sx, sy, r * 0.14, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = alpha * fade;
                ctx.strokeStyle = pal.core;
                ctx.lineWidth = 3;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(bx, by);
                ctx.stroke();
                ctx.setLineDash([]);
                const grad = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.55);
                grad.addColorStop(0, pal.core);
                grad.addColorStop(0.5, pal.main);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = alpha * fade * 0.85;
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(bx, by, r * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            }
            case 'asn_mirror_field': {
                const fieldR = r * (0.75 + t * 0.25);
                ctx.globalAlpha = alpha * 0.35;
                const g3 = ctx.createRadialGradient(x, y, fieldR * 0.1, x, y, fieldR);
                g3.addColorStop(0, 'rgba(180,200,255,0.25)');
                g3.addColorStop(0.55, 'rgba(100,140,220,0.15)');
                g3.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g3;
                ctx.beginPath();
                ctx.arc(x, y, fieldR, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * fade * 0.7;
                ctx.strokeStyle = pal.light;
                ctx.lineWidth = 1.5;
                for (let i = -2; i <= 2; i++) {
                    const off = i * fieldR * 0.22;
                    ctx.beginPath();
                    ctx.moveTo(x - fieldR, y + off);
                    ctx.lineTo(x + fieldR, y + off);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x + off, y - fieldR);
                    ctx.lineTo(x + off, y + fieldR);
                    ctx.stroke();
                }
                ctx.globalAlpha = alpha * fade;
                ctx.strokeStyle = pal.main;
                ctx.lineWidth = 2.5;
                ctx.setLineDash([10, 8]);
                ctx.beginPath();
                ctx.arc(x, y, fieldR * (0.92 + Math.sin(elapsed * 0.004) * 0.04), 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                return true;
            }
            case 'asn_venom_stab':
            case 'asn_poison_hit':
                ctx.globalAlpha = alpha * fade * 0.75;
                ctx.fillStyle = pal.main;
                ctx.beginPath();
                ctx.arc(x, y, r * 0.35 * (0.6 + t * 0.4), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                return true;
            default:
                ctx.restore();
                return false;
        }
    };

    /** 永夜/暗夜降临 — 屏幕空间暗角（不污染 canvas 状态栈） */
    window.drawAssassinNightfallOverlay = function drawAssassinNightfallOverlay(ctx, gameInstance) {
        const player = gameInstance && gameInstance.player;
        if (!ctx || !player || !player._nightfallUntil) return;
        const now = Date.now();
        if (now >= player._nightfallUntil) return;
        if (gameInstance.currentScene === window.SCENE_TYPES.SKILL_LAB) return;
        if (typeof window.isAssassinTreePlayer === 'function' && !window.isAssassinTreePlayer(player)) return;

        const w = (gameInstance.canvas && gameInstance.canvas.width) || 1600;
        const h = (gameInstance.canvas && gameInstance.canvas.height) || 1200;
        const total = Math.max(500, player._nightfallDurationMs || 6000);
        const remain = player._nightfallUntil - now;
        const fadeIn = Math.min(1, (total - remain) / 420);
        const fadeOut = Math.min(1, remain / 520);
        const strength = 0.2 + Math.sin(now * 0.003) * 0.035;
        const alpha = strength * fadeIn * fadeOut;

        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        const cx = w * 0.5;
        const cy = h * 0.5;
        const grad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.12, cx, cy, Math.max(w, h) * 0.72);
        grad.addColorStop(0, 'rgba(8,0,16,0)');
        grad.addColorStop(0.5, `rgba(16,0,32,${alpha * 0.45})`);
        grad.addColorStop(1, `rgba(0,0,0,${alpha * 0.82})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    };
})();
