/**
 * 传奇威能视觉注册表。
 * buff：两件套式轻量标志 + HUD 状态栏；attack：代表性战斗特效。
 */
(function () {
    'use strict';

    // buff：增益类，地面轻量环 + 状态栏图标
    // attack：攻击/触发类，绘制专属表现
    const POWER_VFX = {
        // —— 攻击型 ——
        dragon_breath: { style: 'attack', variant: 'dragon_breath', color: '#ff572f', color2: '#ffd166', radius: 145, duration: 1100 },
        chain_lightning: { style: 'attack', variant: 'chain_lightning', color: '#54dcff', color2: '#fff36a', radius: 180, duration: 900 },
        thorn_aura: { style: 'attack', variant: 'thorn_aura', color: '#69d47b', color2: '#c6ff8b', radius: 92, duration: 1200, follow: true },
        phoenix: { style: 'attack', variant: 'phoenix', color: '#ff6538', color2: '#ffe27a', radius: 100, duration: 1300, follow: true },
        frost_nova: { style: 'attack', variant: 'frost_nova', color: '#72e7ff', color2: '#e5fdff', radius: 125, duration: 1100, follow: true },
        eagle_eye: { style: 'attack', variant: 'eagle_eye', color: '#b4ff79', color2: '#f0ffd6', radius: 72, duration: 900 },
        arrow_rain: { style: 'attack', variant: 'arrow_rain', color: '#9ee875', color2: '#e4ffc2', radius: 145, duration: 720 },
        wind_soul: { style: 'attack', variant: 'wind_soul', color: '#83f0c3', color2: '#dcfff1', radius: 100, duration: 1000, follow: true },
        assassinate: { style: 'attack', variant: 'assassinate', color: '#ff477e', color2: '#f4b4ff', radius: 92, duration: 900 },
        death_arrival: { style: 'attack', variant: 'death_arrival', color: '#8d55ce', color2: '#e2b3ff', radius: 118, duration: 1200 },

        // —— 增益型 ——
        phantom_step: { style: 'buff', variant: 'phantom_step', color: '#8c7dff', color2: '#e2dcff', radius: 36, duration: 900, follow: true, iconKey: 'moveSpeed', name: '幻影步' },
        greed_power: { style: 'buff', variant: 'greed_power', color: '#ffd34e', color2: '#fff0a0', radius: 36, duration: 900, follow: true, iconKey: 'potion_effect', name: '贪婪之力' },
        blood_rage: { style: 'buff', variant: 'blood_rage', color: '#ed304f', color2: '#ff8b72', radius: 36, duration: 900, follow: true, iconKey: 'attack', name: '血怒' },
        war_god_fury: { style: 'buff', variant: 'war_god_fury', color: '#ff9d3d', color2: '#ffe27a', radius: 36, duration: 900, follow: true, iconKey: 'damageMultiplier', name: '战神之怒' },
        immortal_shield: { style: 'buff', variant: 'immortal_shield', color: '#ffd86b', color2: '#fff5bd', radius: 36, duration: 1000, follow: true, iconKey: 'divineProtection', name: '不灭圣盾' },
        titan_body: { style: 'buff', variant: 'titan_body', color: '#d9c29a', color2: '#fff0ce', radius: 36, duration: 900, follow: true, iconKey: 'defense', name: '泰坦之体' },
        arcane_surge: { style: 'buff', variant: 'arcane_surge', color: '#b56dff', color2: '#6ce5ff', radius: 36, duration: 900, follow: true, iconKey: 'combo', name: '奥术涌动' },
        mana_shield: { style: 'buff', variant: 'mana_shield', color: '#58bfff', color2: '#b8edff', radius: 36, duration: 1000, follow: true, iconKey: 'divineProtection', name: '魔力护盾' },
        element_avatar: { style: 'buff', variant: 'element_avatar', color: '#ff7c5c', color2: '#72dfff', radius: 36, duration: 900, follow: true, iconKey: 'allStats', name: '元素化身' },
        shadow_dance: { style: 'buff', variant: 'shadow_dance', color: '#a85dff', color2: '#ff69bb', radius: 36, duration: 900, follow: true, iconKey: 'dodge', name: '影舞' }
    };

    function gameOf(player) {
        return player && player.gameInstance;
    }

    function collectMonsters(game) {
        if (!game || typeof game._getSkillMonsters !== 'function') return [];
        const list = game._getSkillMonsters();
        return Array.isArray(list) ? list.filter(m => m && typeof m.x === 'number' && typeof m.y === 'number' && (m.hp == null || m.hp > 0)) : [];
    }

    /** 从击杀点向附近怪物链式跳跃，返回世界坐标点列（含起点） */
    function buildChainPoints(origin, monsters, maxHops, range) {
        const points = [{ x: origin.x, y: origin.y }];
        const used = new Set();
        let cur = origin;
        for (let hop = 0; hop < maxHops; hop++) {
            let best = null;
            let bestDist = Infinity;
            for (let i = 0; i < monsters.length; i++) {
                const m = monsters[i];
                if (used.has(m)) continue;
                const dx = m.x - cur.x;
                const dy = m.y - cur.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 8 || dist > range) continue;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = m;
                }
            }
            if (!best) break;
            used.add(best);
            cur = { x: best.x, y: best.y };
            points.push(cur);
        }
        return points;
    }

    const api = {
        getSupportedPowers() {
            return Object.keys(POWER_VFX);
        },

        getDefinition(powerId) {
            return POWER_VFX[powerId] || null;
        },

        isBuffStyle(powerId) {
            const def = POWER_VFX[powerId];
            return !!(def && def.style === 'buff');
        },

        reset(player) {
            if (player) delete player._equipmentPowerVfxState;
        },

        trigger(player, powerId, detail) {
            const def = POWER_VFX[powerId];
            const game = gameOf(player);
            if (!def || !game || typeof game.addEquipmentEffect !== 'function') return false;
            const now = Date.now();
            const state = player._equipmentPowerVfxState || (player._equipmentPowerVfxState = {
                last: Object.create(null)
            });
            if ((state.last[powerId] || 0) + 120 > now) return false;
            state.last[powerId] = now;

            const target = detail && detail.target;
            const x = target && typeof target.x === 'number' ? target.x : player.x;
            const y = target && typeof target.y === 'number' ? target.y : player.y;

            const opts = {
                variant: def.variant,
                style: def.style || 'attack',
                color: def.color,
                color2: def.color2,
                radius: def.radius,
                duration: def.duration,
                angle: player.angle || 0,
                followTarget: def.follow ? player : null
            };

            if (powerId === 'chain_lightning') {
                const monsters = collectMonsters(game);
                const origin = { x, y };
                let points = buildChainPoints(origin, monsters, 3, 200);
                // 起点已是击杀怪；若附近还有怪则跳过去，否则造出假 hop 方便演示
                if (points.length < 2) {
                    const ang = (player.angle || 0);
                    points = [
                        origin,
                        { x: origin.x + Math.cos(ang) * 70, y: origin.y + Math.sin(ang) * 70 },
                        { x: origin.x + Math.cos(ang + 1.1) * 110, y: origin.y + Math.sin(ang + 1.1) * 90 }
                    ];
                }
                opts.chainPoints = points;
            }

            game.addEquipmentEffect('power_vfx', x, y, opts);
            return true;
        }
    };

    window.EquipmentPowerVFX = api;
})();
