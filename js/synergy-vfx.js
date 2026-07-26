/**
 * 协同激活全屏光波特效
 */
(function () {
    'use strict';

    function ensureEdgeWave(battle) {
        if (!battle.synergyEdgeWave) battle.synergyEdgeWave = null;
    }

    function onSynergy(battle, color) {
        ensureEdgeWave(battle);
        battle.synergyEdgeWave = {
            color: color || '#ff44aa',
            life: 1000,
            maxLife: 1000
        };
    }

    function tick(battle, dtMs) {
        if (battle.synergyEdgeWave) {
            battle.synergyEdgeWave.life -= dtMs;
            if (battle.synergyEdgeWave.life <= 0) battle.synergyEdgeWave = null;
        }
    }

    function draw(ctx, battle, w, h) {
        const wave = battle.synergyEdgeWave;
        if (!wave) return;
        const t = wave.life / wave.maxLife;
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.6;
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = 8 + (1 - t) * 12;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.restore();
    }

    window.SynergyVfx = { onSynergy, tick, draw };
})();
