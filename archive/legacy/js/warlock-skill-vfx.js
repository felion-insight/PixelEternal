/**
 * 术士专属 VFX：诅咒光环、灵魂燃烧、链接 tether、暗影魔 aura 等
 */
(function () {
    'use strict';

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

    function addVfx(g, x, y, opts) {
        if (g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect('class_skill_vfx', x, y, opts);
        }
    }

    function burstAt(g, x, y, color, count) {
        const pm = g && g.particleManager;
        if (!pm || typeof pm.createSystem !== 'function') return;
        pm.createSystem(x, y, {
            color: color || '#8844cc',
            size: 3,
            count: count || 14,
            lifetime: 420,
            fadeoutTime: 280,
            speed: 2.8,
            speedVariation: 1.6,
            angleSpread: Math.PI * 2,
            spreadRadius: 6,
            pixelStyle: true
        });
    }

    window.spawnWarlockVfx = addVfx;

    window.playWarlockAgonyApplyVfx = function playWarlockAgonyApplyVfx(player, target, g) {
        if (!player || !target || !g) return;
        const stacks = typeof window.getAgonyCurseStacks === 'function'
            ? window.getAgonyCurseStacks(target) : 1;
        addVfx(g, target.x, target.y, {
            variant: 'mage_curse_beam',
            duration: 350,
            family: 'soul_shard_v2',
            ox: player.x, oy: player.y,
            targetX: target.x, targetY: target.y,
            radius: Math.hypot(target.x - player.x, target.y - player.y) * 0.5,
            stacks
        });
        addVfx(g, target.x, target.y, {
            variant: 'mage_curse_bind',
            duration: 760,
            radius: 40 + stacks * 3,
            family: 'soul_shard_v2',
            stacks
        });
    };

    window.playWarlockDetonateVfx = function playWarlockDetonateVfx(g, x, y, radius) {
        if (!g) return;
        addVfx(g, x, y, {
            variant: 'warlock_curse_detonate',
            duration: 520,
            radius: radius || 80,
            family: 'soul_shard_v2'
        });
        burstAt(g, x, y, '#aa44ff', 18);
    };

    window.playWarlockCorruptionHitVfx = function playWarlockCorruptionHitVfx(g, x, y) {
        addVfx(g, x, y, {
            variant: 'mage_corruption_mist',
            duration: 480,
            radius: 32,
            family: 'soul_shard_v2'
        });
    };

    window.playWarlockPierceFlash = function playWarlockPierceFlash(g, x, y) {
        addVfx(g, x, y, {
            variant: 'warlock_pierce_flash',
            duration: 220,
            radius: 28,
            family: 'soul_shard_v2',
            color: '#aa44ff'
        });
        burstAt(g, x, y, '#cc88ff', 8);
    };

    window.playWarlockSoulLinkPulse = function playWarlockSoulLinkPulse(player, target, g, healAmount) {
        if (!player || !target || !g) return;
        const burning = typeof window.isSoulBurning === 'function' && window.isSoulBurning(player);
        addVfx(g, target.x, target.y, {
            variant: 'warlock_soul_link_pulse',
            duration: 220,
            family: 'soul_shard_v2',
            ox: player.x, oy: player.y,
            targetX: target.x, targetY: target.y,
            soulBurn: burning
        });
        if (healAmount > 0 && typeof g.addFloatingText === 'function') {
            g.addFloatingText(player.x, player.y - 28, '+' + healAmount, '#66ff99', 700, 14);
        }
    };

    window.playWarlockLinkTransferVfx = function playWarlockLinkTransferVfx(g, deadX, deadY, newTarget, player) {
        if (!g) return;
        addVfx(g, deadX, deadY, {
            variant: 'warlock_link_break',
            duration: 360,
            radius: 36,
            family: 'soul_shard_v2'
        });
        if (newTarget && player) {
            addVfx(g, newTarget.x, newTarget.y, {
                variant: 'warlock_link_rebind',
                duration: 480,
                radius: 40,
                family: 'soul_shard_v2',
                ox: player.x, oy: player.y,
                targetX: newTarget.x, targetY: newTarget.y,
                soulBurn: typeof window.isSoulBurning === 'function' && window.isSoulBurning(player)
            });
        }
    };

    window.playWarlockShadowSwipe = function playWarlockShadowSwipe(g, pet, target, soulBurn) {
        if (!g || !pet || !target) return;
        const ang = pet._attackAngle != null ? pet._attackAngle : Math.atan2(target.y - pet.y, target.x - pet.x);
        addVfx(g, target.x, target.y, {
            variant: 'warlock_shadow_swipe',
            duration: soulBurn ? 160 : 120,
            radius: (pet.size || 20) * 0.9,
            angle: ang,
            family: 'soul_shard_v2',
            soulBurn: !!soulBurn
        });
    };

    window.playWarlockFiendDeathVfx = function playWarlockFiendDeathVfx(g, x, y, radius) {
        addVfx(g, x, y, {
            variant: 'warlock_fiend_collapse',
            duration: 680,
            radius: radius || 60,
            family: 'soul_shard_v2'
        });
        burstAt(g, x, y, '#442266', 16);
    };

    window.playWarlockHarvestDeployVfx = function playWarlockHarvestDeployVfx(g, x, y, radius, delayMs) {
        addVfx(g, x, y, {
            variant: 'warlock_dark_vortex_deploy',
            duration: delayMs || 400,
            radius: radius || 120,
            family: 'soul_shard_v2',
            color: '#442266'
        });
    };

    window.playWarlockHarvestStrikeVfx = function playWarlockHarvestStrikeVfx(g, x, y, radius) {
        addVfx(g, x, y, {
            variant: 'warlock_dark_harvest_strike',
            duration: 960,
            radius: radius || 120,
            family: 'soul_shard_v2'
        });
        burstAt(g, x, y, '#aa44ff', 24);
    };

    window.playWarlockHarvestBonusVfx = function playWarlockHarvestBonusVfx(g, x, y, radius) {
        addVfx(g, x, y, {
            variant: 'warlock_harvest_bonus',
            duration: 520,
            delayMs: 400,
            radius: radius || 60,
            family: 'soul_shard_v2'
        });
        burstAt(g, x, y, '#cc66ff', 12);
    };

    window.playWarlockSpreadingCurseVfx = function playWarlockSpreadingCurseVfx(player, target, g) {
        if (!player || !target || !g) return;
        const dist = Math.hypot(target.x - player.x, target.y - player.y);
        addVfx(g, target.x, target.y, {
            variant: 'mage_curse_beam',
            duration: 420,
            family: 'soul_shard_v2',
            ox: player.x, oy: player.y,
            targetX: target.x, targetY: target.y,
            radius: dist * 0.5
        });
        addVfx(g, target.x, target.y, {
            variant: 'mage_curse_bind',
            duration: 820,
            radius: 44,
            family: 'soul_shard_v2',
            stacks: 1
        });
        addVfx(g, target.x, target.y, {
            variant: 'mage_corruption_mist',
            duration: 560,
            radius: 38,
            family: 'soul_shard_v2'
        });
        addVfx(g, target.x, target.y, {
            variant: 'warlock_spread_curse_mark',
            duration: 1100,
            radius: 52,
            family: 'soul_shard_v2'
        });
        burstAt(g, target.x, target.y, '#552288', 12);
    };

    window.playWarlockSoulHarvestVfx = function playWarlockSoulHarvestVfx(player, target, g, resonanceBurst) {
        if (!player || !target || !g) return;
        const dist = Math.hypot(target.x - player.x, target.y - player.y);
        addVfx(g, target.x, target.y, {
            variant: 'warlock_soul_harvest',
            duration: resonanceBurst ? 920 : 780,
            radius: Math.max(48, dist * 0.45),
            family: 'soul_shard_v2',
            ox: target.x, oy: target.y,
            targetX: player.x, targetY: player.y,
            resonanceBurst: !!resonanceBurst
        });
        if (resonanceBurst) {
            addVfx(g, target.x, target.y, {
                variant: 'warlock_soul_harvest_resonance',
                duration: 680,
                radius: 72,
                family: 'soul_shard_v2'
            });
        }
        burstAt(g, target.x, target.y, resonanceBurst ? '#ff88ff' : '#aa44ff', resonanceBurst ? 22 : 16);
        if (resonanceBurst) burstAt(g, player.x, player.y, '#cc66ff', 10);
    };

    window.playWarlockSpreadCurseDeathVfx = function playWarlockSpreadCurseDeathVfx(g, x, y, radius) {
        if (!g) return;
        addVfx(g, x, y, {
            variant: 'warlock_curse_spread',
            duration: 720,
            radius: radius || 150,
            family: 'soul_shard_v2'
        });
        burstAt(g, x, y, '#442266', 20);
    };

    window.drawAgonyCurseOverlay = function drawAgonyCurseOverlay(ctx, monster, now) {
        if (!ctx || !monster || !monster._agonyCurse) return;
        const ac = monster._agonyCurse;
        if (ac.until <= now || ac.stacks <= 0) return;
        const stacks = ac.stacks;
        const tickFlash = ac._tickFlashUntil > now;
        let rad = 10;
        let col = '#8844aa';
        let alpha = 0.28;
        if (stacks >= 5) {
            rad = 22 + Math.sin(now / 180) * 3;
            col = '#440066';
            alpha = 0.42 + Math.sin(now / 120) * 0.12;
        } else if (stacks >= 3) {
            rad = 16 + Math.sin(now / 220) * 2;
            col = '#662288';
            alpha = 0.34;
        } else {
            rad = 10 + stacks;
            alpha = 0.22 + stacks * 0.03;
        }
        if (tickFlash) {
            alpha += 0.18;
            rad += 4;
        }
        const x = monster.x;
        const y = monster.y - (monster.size || 24) * 0.15;
        ctx.save();
        ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, col);
        g.addColorStop(0.55, 'rgba(136,68,170,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = tickFlash ? 0.85 : 0.55 + Math.sin(now / 100) * 0.2;
        ctx.strokeStyle = tickFlash ? '#dd99ff' : '#aa44ff';
        ctx.lineWidth = tickFlash ? 2.5 : 2;
        ctx.beginPath();
        ctx.arc(x, y, rad * 0.92, now / 400, now / 400 + Math.PI * 1.6);
        ctx.stroke();
        if (stacks >= 5) {
            ctx.globalAlpha = 0.35 + Math.sin(now / 80) * 0.15;
            ctx.strokeStyle = '#ff88ff';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.arc(x, y, rad * 1.15, -now / 350, -now / 350 + Math.PI);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    };

    window.drawWarlockSoulBurnPlayerAura = function drawWarlockSoulBurnPlayerAura(ctx, x, y, now) {
        if (!ctx) return;
        const pulse = 0.88 + Math.sin(now / 160) * 0.12;
        const rad = 28 * pulse;
        ctx.save();
        ctx.globalAlpha = 0.22 + Math.sin(now / 200) * 0.08;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.2);
        g.addColorStop(0, 'rgba(255,68,255,0.45)');
        g.addColorStop(0.45, 'rgba(170,68,255,0.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ff44ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rad, now / 300, now / 300 + Math.PI * 1.4);
        ctx.stroke();
        ctx.restore();
    };

    window.drawWarlockSoulBurnVignette = function drawWarlockSoulBurnVignette(ctx, w, h) {
        if (!ctx || !w || !h) return;
        ctx.save();
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.65, 'rgba(40,0,60,0.08)');
        g.addColorStop(1, 'rgba(30,0,50,0.28)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    };

    window.drawWarlockSoulLinkTethers = function drawWarlockSoulLinkTethers(ctx, gameInstance, now) {
        if (!ctx || !gameInstance || !gameInstance.player) return;
        const player = gameInstance.player;
        if (typeof window.isWarlockTreePlayer !== 'function' || !window.isWarlockTreePlayer(player)) return;
        const targets = gameInstance.getCurrentSceneTargets
            ? gameInstance.getCurrentSceneTargets()
            : (gameInstance.monsters || []);
        const burning = typeof window.isSoulBurning === 'function' && window.isSoulBurning(player);
        (targets || []).forEach(m => {
            if (!m || !m._soulLinkMark || m._soulLinkMark.until <= now) return;
            if (m._soulLinkMark.owner !== player) return;
            ctx.save();
            ctx.globalAlpha = burning ? 0.75 : 0.55;
            ctx.strokeStyle = burning ? '#ff44ff' : '#8844cc';
            ctx.lineWidth = burning ? 6 : 4;
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
            ctx.fillStyle = burning ? '#ff66ff' : '#aa44ff';
            ctx.globalAlpha = burning ? 0.85 : 0.7;
            ctx.beginPath();
            ctx.arc(m.x, m.y - (m.size || 20) * 0.2, burning ? 14 : 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    };

    window.drawShadowFiendAura = function drawShadowFiendAura(ctx, summon, now) {
        if (!ctx || !summon || summon.hp <= 0) return;
        if (summon.unitId !== 'shadow_fiend') return;
        const owner = summon.owner;
        const burning = owner && typeof window.isSoulBurning === 'function' && window.isSoulBurning(owner);
        const rad = (burning ? 22 : 18) + Math.sin(now / 240) * 2;
        ctx.save();
        ctx.globalAlpha = burning ? 0.38 : 0.28;
        const g = ctx.createRadialGradient(summon.x, summon.y, 0, summon.x, summon.y, rad);
        g.addColorStop(0, burning ? 'rgba(100,40,120,0.5)' : 'rgba(68,34,102,0.45)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(summon.x, summon.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };
})();
