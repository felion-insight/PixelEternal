/**
 * 区域动态天气：影响全场战斗规则
 */
(function () {
    'use strict';

    function weatherRootCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.WEATHER_CONFIG) ||
            window.WEATHER_CONFIG || {};
    }

    function weatherCfg() {
        const cfg = weatherRootCfg();
        return cfg.weathers || cfg.WEATHER_CONFIG?.weathers || {};
    }

    function rollWeatherForZone(zoneId, rng) {
        const pool = Object.keys(weatherCfg());
        if (!pool.length) return null;
        const r = rng || Math.random;
        const root = weatherRootCfg();
        const spawnChance = root.spawnChance != null ? root.spawnChance : 0.4;
        if (r() > spawnChance) return null;
        const id = pool[Math.floor(r() * pool.length)];
        const def = weatherCfg()[id];
        return def ? { id: id, name: def.name, battlesLeft: def.durationBattles || 2, def: def } : null;
    }

    function onRunStart(run) {
        if (!run || !run.ascension) return;
        run.ascension.weather = null;
    }

    function onBattleStart(run, battle) {
        if (!run || !run.ascension) return;
        if (!run.ascension.weather || run.ascension.weather.battlesLeft <= 0) {
            const zoneId = run.ascension.zoneId || 'ashen_wastes';
            run.ascension.weather = rollWeatherForZone(zoneId, run._rng);
        }
        const w = run.ascension.weather;
        if (!w || !w.def) return;
        battle.weather = w;
        battle.weatherFx = Object.assign({}, w.def.effects || {});
        if (w.def.effects) {
            if (w.def.effects.enemyAttackMult) battle.weatherEnemyAttackMult = w.def.effects.enemyAttackMult;
            const cd = w.def.effects.skillCooldownMult != null ? w.def.effects.skillCooldownMult : w.def.effects.cooldownMult;
            if (cd != null) battle.weatherSkillCdMult = cd;
            if (w.def.effects.basicDamageMult) battle.weatherBasicDmgMult = w.def.effects.basicDamageMult;
            if (w.def.effects.fireDamageMult) battle.weatherFireDmgMult = w.def.effects.fireDamageMult;
            if (w.def.effects.lightningDamageMult) battle.weatherLightningDmgMult = w.def.effects.lightningDamageMult;
            if (w.def.effects.rangeMult) battle.weatherRangeMult = w.def.effects.rangeMult;
            if (w.def.effects.dodgeBonus) battle.weatherDodgeBonus = w.def.effects.dodgeBonus;
            if (w.def.effects.moveSpeedMult) battle.weatherMoveMult = w.def.effects.moveSpeedMult;
            battle.weatherFx = Object.assign({}, w.def.effects);
        }
    }

    function onCombatEnd(run) {
        if (!run || !run.ascension || !run.ascension.weather) return;
        run.ascension.weather.battlesLeft -= 1;
        if (run.ascension.weather.battlesLeft <= 0) run.ascension.weather = null;
    }

    function tick(battle, dtMs) {
        const fx = battle.weatherFx;
        if (!fx) return;
        if (fx.globalDotPct) {
            const all = (battle.allies || []).concat(battle.enemies || []).filter((u) => u.alive && u.hp > 0);
            all.forEach((u) => {
                u.hp = Math.max(0, u.hp - Math.floor(u.maxHp * fx.globalDotPct * dtMs / 1000));
                if (u.hp <= 0) u.alive = false;
            });
        }
    }

    function getDisplay(run) {
        const w = run && run.ascension && run.ascension.weather;
        return w ? { name: w.name, battlesLeft: w.battlesLeft } : null;
    }

    window.WeatherSystem = { rollWeatherForZone, onRunStart, onBattleStart, onCombatEnd, tick, getDisplay };
})();
