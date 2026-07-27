/**
 * Juice 核心：震屏、卡帧、伤害数字、连杀、低血暗角
 */
(function () {
    'use strict';

    function juiceCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.JUICE_CONFIG) ||
            window.JUICE_CONFIG || {};
    }

    function ascEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('juiceSystem');
    }

    function create(battle) {
        const cfg = juiceCfg();
        return {
            battle: battle,
            damageNumbers: [],
            killCombo: { count: 0, lastKillMs: 0 },
            screenScale: 1,
            vignette: 0,
            comboBanner: null,
            lootFlies: []
        };
    }

    function triggerShake(battle, key) {
        if (!ascEnabled()) return;
        const asc = window.AscensionHub.flag('juiceSystem');
        if (asc.screenShakeEnabled === false) return;
        const shakes = juiceCfg().screenShake || {};
        const def = shakes[key] || shakes.crit || { intensity: 3, durationMs: 150 };
        battle.shake = Math.max(battle.shake || 0, def.intensity);
        battle.shakeDecay = def.durationMs;
    }

    function triggerHitStop(battle, frames) {
        if (!ascEnabled()) return;
        const asc = window.AscensionHub.flag('juiceSystem');
        if (asc.hitStopEnabled === false) return;
        battle.hitStopFrames = Math.max(battle.hitStopFrames || 0, frames);
    }

    function spawnDamageNumber(state, x, y, value, type) {
        if (state.battle && state.battle.trueModeNoNumbers) return;
        const asc = window.AscensionHub.flag('juiceSystem');
        if (asc.damageNumbersEnabled === false) return;
        let label;
        if (typeof value === 'string') {
            label = value;
        } else {
            const n = Number(value);
            if (!Number.isFinite(n)) return;
            label = String(Math.floor(n));
        }
        const styles = juiceCfg().damageNumbers || {};
        const style = styles[type] || styles.normal || { color: '#fff', size: 16 };
        state.damageNumbers.push({
            x: x, y: y, value: label, type: type,
            life: 1, vy: -60, vx: (Math.random() - 0.5) * 30,
            style: style
        });
        const max = juiceCfg().particlePoolMax || 100;
        if (state.damageNumbers.length > max) {
            state.damageNumbers.splice(0, state.damageNumbers.length - max);
        }
    }

    function playAudioStub(event) {
        const stub = juiceCfg().audioStub || {};
        const vol = stub[event];
        if (vol == null) return;
        const soundId = event === 'ability' ? 'skill' : (event === 'bossPhase' ? 'boss' : event);
        if (typeof window.playGameSound === 'function') {
            window.playGameSound(soundId, vol);
        } else if (typeof window.AudioManager !== 'undefined' && window.AudioManager.play) {
            window.AudioManager.play(soundId, vol);
        }
    }

    function onDamage(state, attacker, target, dmg, meta) {
        meta = meta || {};
        if (!Number.isFinite(Number(dmg)) || dmg <= 0) return;
        const type = meta.crit ? 'crit' : (meta.isSkill ? 'skill' : 'normal');
        spawnDamageNumber(state, target.x, target.y - 20, dmg, type);
        if (meta.crit) {
            triggerShake(state.battle, 'crit');
            triggerHitStop(state.battle, (juiceCfg().hitStop || {}).critFrames || 2);
            playAudioStub('crit');
        } else {
            playAudioStub('hit');
        }
        if (window.JuiceVfx) window.JuiceVfx.onHit(state.battle, target.x, target.y, type);
    }

    function onKill(state, attacker, target) {
        const cfg = juiceCfg();
        const comboCfg = cfg.killCombo || {};
        const now = state.battle.elapsed || 0;
        const windowMs = comboCfg.windowMs || 3000;

        triggerHitStop(state.battle, (cfg.hitStop || {}).killFrames || 3);
        triggerShake(state.battle, 'kill');
        spawnDamageNumber(state, target.x, target.y - 30, '击杀', 'kill');
        playAudioStub('kill');

        if (now - state.killCombo.lastKillMs <= windowMs) {
            state.killCombo.count += 1;
        } else {
            state.killCombo.count = 1;
        }
        state.killCombo.lastKillMs = now;

        if (state.killCombo.count >= 2) {
            const labels = comboCfg.labels || {};
            const label = labels[String(state.killCombo.count)] || ('x' + state.killCombo.count);
            state.comboBanner = { text: label, life: 1200, maxLife: 1200 };
            playAudioStub('combo');
            if (state.killCombo.count >= 3) triggerShake(state.battle, 'synergy');
        }

        if (window.JuiceVfx) window.JuiceVfx.onKill(state.battle, target.x, target.y, target.color);

        const asc = window.AscensionHub.flag('juiceSystem');
        if (asc.lootFlyEnabled !== false) {
            spawnLootFly(state, target.x, target.y, 'gold');
        }
    }

    function spawnLootFly(state, x, y, kind) {
        const cfg = juiceCfg().lootFly || {};
        state.lootFlies.push({
            x: x, y: y, kind: kind,
            life: cfg.durationMs || 800,
            maxLife: cfg.durationMs || 800,
            tx: 80, ty: 24
        });
    }

    function updateLowHpVignette(state) {
        const cfg = juiceCfg().lowHpVignette || {};
        const allies = (state.battle.allies || []).filter((u) => u.alive && u.hp > 0);
        if (!allies.length) { state.vignette = 0; return; }
        const minRatio = allies.reduce((m, u) => Math.min(m, u.hp / Math.max(1, u.maxHp)), 1);
        state.vignette = minRatio < (cfg.threshold || 0.3) ? (cfg.strength || 0.3) : 0;
    }

    function tick(state, dtMs) {
        state.damageNumbers.forEach((n) => {
            n.x += n.vx * dtMs / 1000;
            n.y += n.vy * dtMs / 1000;
            n.life -= dtMs / 1000;
            n.vy *= 0.98;
        });
        state.damageNumbers = state.damageNumbers.filter((n) => n.life > 0);

        state.lootFlies.forEach((f) => {
            f.life -= dtMs;
            const t = 1 - f.life / f.maxLife;
            const arc = (juiceCfg().lootFly || {}).arcHeight || 60;
            f.x = f.x + (f.tx - f.x) * 0.08;
            f.y = f.y + (f.ty - f.y) * 0.08 - arc * Math.sin(t * Math.PI) * 0.02;
        });
        state.lootFlies = state.lootFlies.filter((f) => f.life > 0);

        if (state.comboBanner) {
            state.comboBanner.life -= dtMs;
            if (state.comboBanner.life <= 0) state.comboBanner = null;
        }

        if (state.battle.shakeDecay != null && state.battle.shake > 0) {
            state.battle.shakeDecay -= dtMs;
            if (state.battle.shakeDecay <= 0) state.battle.shake = 0;
        }

        updateLowHpVignette(state);
    }

    function draw(ctx, state, canvasW, canvasH) {
        if (!state) return;
        state.damageNumbers.forEach((n) => {
            const alpha = Math.max(0, n.life);
            const scale = n.type === 'crit' ? 1 + (1 - alpha) * 0.5 : 1;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(n.x, n.y);
            ctx.scale(scale, scale);
            ctx.fillStyle = n.style.color || '#fff';
            ctx.font = 'bold ' + (n.style.size || 16) + 'px monospace';
            ctx.textAlign = 'center';
            const prefix = n.style.prefix || '';
            const text = prefix + (n.value != null ? String(n.value) : '');
            if (n.style.outline) {
                ctx.strokeStyle = n.style.outline;
                ctx.lineWidth = 2;
                ctx.strokeText(text, 0, 0);
            }
            ctx.fillText(text, 0, 0);
            ctx.restore();
        });

        if (state.vignette > 0) {
            const g = ctx.createRadialGradient(canvasW / 2, canvasH / 2, canvasH * 0.2, canvasW / 2, canvasH / 2, canvasH * 0.75);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(1, 'rgba(80,0,0,' + state.vignette + ')');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, canvasW, canvasH);
        }

        if (state.comboBanner) {
            const t = state.comboBanner.life / state.comboBanner.maxLife;
            ctx.save();
            ctx.globalAlpha = Math.min(1, t * 2);
            ctx.fillStyle = '#ffcc44';
            ctx.font = 'bold 32px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(state.comboBanner.text, canvasW / 2, canvasH * 0.22);
            ctx.restore();
        }

        state.lootFlies.forEach((f) => {
            ctx.save();
            ctx.globalAlpha = Math.min(1, f.life / 400);
            ctx.fillStyle = f.kind === 'gold' ? '#ffd700' : '#88ccff';
            ctx.beginPath();
            ctx.arc(f.x, f.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    function trigger(state, event, data) {
        if (!state) return;
        if (event === 'synergy_activate') {
            triggerShake(state.battle, 'synergy');
            playAudioStub('synergy');
            state.comboBanner = { text: (data && data.name) || '协同激活', life: 1500, maxLife: 1500 };
        }
        if (event === 'boss_phase') {
            triggerShake(state.battle, 'bossPhase');
            triggerHitStop(state.battle, (juiceCfg().hitStop || {}).bossPhaseFrames || 5);
            playAudioStub('bossPhase');
        }
        if (event === 'ability_cast') {
            playAudioStub('ability');
            triggerShake(state.battle, 'crit');
        }
        if (event === 'energy_gain_death') {
            playAudioStub('hit');
            spawnDamageNumber(state, (state.battle._canvasW || 400) * 0.5, 80,
                '+' + ((data && data.amount) || 15), 'kill');
        }
    }

    window.JuiceCore = {
        create, tick, onDamage, onKill, draw, trigger,
        triggerShake, triggerHitStop, spawnDamageNumber, spawnLootFly
    };
})();
