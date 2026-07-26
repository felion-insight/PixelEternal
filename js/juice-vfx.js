/**
 * Juice VFX 粒子池（命中/暴击/击杀）
 */
(function () {
    'use strict';

    function poolMax() {
        const cfg = (typeof CONFIG !== 'undefined' && CONFIG.JUICE_CONFIG) || window.JUICE_CONFIG || {};
        return cfg.particlePoolMax || 100;
    }

    function ensureParticles(battle) {
        if (!battle.juiceParticles) battle.juiceParticles = [];
        return battle.juiceParticles;
    }

    function spawnBurst(battle, x, y, count, color, life) {
        const pool = ensureParticles(battle);
        for (let i = 0; i < count; i++) {
            const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
            const spd = 80 + Math.random() * 120;
            pool.push({
                x: x, y: y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: life || 400,
                maxLife: life || 400,
                color: color || '#ffffff',
                size: 2 + Math.random() * 3
            });
        }
        while (pool.length > poolMax()) pool.shift();
    }

    function onHit(battle, x, y, type) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('juiceSystem')) return;
        const count = type === 'crit' ? 14 : 5;
        const color = type === 'crit' ? '#ffaa00' : '#ffffff';
        spawnBurst(battle, x, y, count, color, type === 'crit' ? 500 : 300);
    }

    function onKill(battle, x, y, color) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('juiceSystem')) return;
        spawnBurst(battle, x, y, 24, color || '#ff6644', 800);
    }

    function onSynergy(battle, color) {
        spawnBurst(battle, battle.boardOriginX || 400, battle.boardOriginY || 300, 40, color || '#ff44aa', 1000);
    }

    function tick(battle, dtMs) {
        const pool = battle.juiceParticles;
        if (!pool) return;
        pool.forEach((p) => {
            p.x += p.vx * dtMs / 1000;
            p.y += p.vy * dtMs / 1000;
            p.life -= dtMs;
            p.vy += 40 * dtMs / 1000;
        });
        battle.juiceParticles = pool.filter((p) => p.life > 0);
    }

    function draw(ctx, battle) {
        const pool = battle.juiceParticles;
        if (!pool) return;
        pool.forEach((p) => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    window.JuiceVfx = { onHit, onKill, onSynergy, tick, draw, spawnBurst };
})();
