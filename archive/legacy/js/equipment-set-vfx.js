/**
 * Phase 3 套装视觉注册表。
 * 4/6 件 special 触发；2 件低频徽记。
 * graduation style：按职业族分化绘制（见 game-main set_special_vfx）。
 */
(function () {
    'use strict';

    function def(variant, color, color2, radius, style, extra) {
        return Object.assign({
            variant: variant,
            color: color,
            color2: color2,
            radius: radius,
            style: style || 'slash'
        }, extra || {});
    }

    const SPECIAL_VFX = {
        fire_nova: def('fireheart', '#ff5a22', '#ffcf66', 120, 'fireheart'),
        frost_touch: def('frostborn', '#72e7ff', '#d9fbff', 92, 'frostborn'),
        chain_strike: def('stormfury', '#58dfff', '#fff47a', 145, 'stormfury'),
        star_stack: def('starlight', '#ffe37a', '#9b8cff', 78, 'starlight'),
        shadow_counter: def('shadowmantle', '#9b62ff', '#29134d', 85, 'shadowmantle'),
        dragon_rage: def('dragonblood', '#ff334f', '#ff9a55', 100, 'dragonblood'),
        valor_shield: def('valor', '#ffd86a', '#fff4bb', 88, 'shield_burst'),
        windchaser_range: def('windchaser', '#8effb1', '#d8fff0', 105, 'windchaser'),
        arcane_combo: def('arcane', '#aa74ff', '#62d9ff', 94, 'arcane'),
        shadow_strike: def('shadow', '#c044ff', '#ff5cb8', 92, 'shadow_slash'),

        // 一转 4
        oath_shield: def('oath_shield', '#ffe08a', '#fff6d0', 88, 'shield_burst', { follow: true }),
        crimson_scar: def('crimson_scar', '#ff3a4a', '#ff9a55', 100, 'blood_surge', { follow: true, throttle: 900 }),
        bulwark_oath: def('bulwark_oath', '#c8d6ff', '#eef2ff', 90, 'shield_burst', { follow: true }),
        trail_sigil: def('trail_sigil', '#7dff9a', '#d8ffe8', 100, 'pack_mark'),
        hundred_pace: def('hundred_pace', '#9ad0ff', '#e8f4ff', 105, 'sniper_gaze'),
        swift_plume: def('swift_plume', '#a8ffd4', '#eafff5', 92, 'wind_feather'),
        ember_residue: def('ember_residue', '#ff8a4a', '#ffd29a', 94, 'element_wave'),
        star_oracle: def('star_oracle', '#d4b8ff', '#f0e6ff', 90, 'chronos_ring'),
        curse_echo: def('curse_echo', '#9b6aff', '#d0b0ff', 96, 'curse_chain'),
        night_veil: def('night_veil', '#b050ff', '#ff6ab8', 92, 'shadow_slash'),
        mirror_mask: def('mirror_mask', '#88e0ff', '#e8f9ff', 88, 'mirror_shatter'),
        venom_censer: def('venom_censer', '#7dff62', '#d8ff9a', 130, 'poison_cloud'),

        // 二转 4
        holy_balance: def('holy_balance', '#ffe9a0', '#fff8d8', 95, 'shield_burst', { follow: true }),
        rift_howl: def('rift_howl', '#ff6735', '#ffcf66', 120, 'fireheart', { throttle: 700 }),
        temple_covenant: def('temple_covenant', '#d0e0ff', '#ffffff', 92, 'shield_burst', { follow: true }),
        beast_pact: def('beast_pact', '#8bff7a', '#e0ffd0', 108, 'pack_mark'),
        breathless_hunt: def('breathless_hunt', '#6ab8ff', '#d8ecff', 110, 'sniper_gaze'),
        echo_fold: def('echo_fold', '#c070ff', '#ff90d0', 95, 'shadow_slash'),
        torrent_throne: def('torrent_throne', '#8a6aff', '#62d9ff', 100, 'element_wave'),
        fate_web: def('fate_web', '#ffe68a', '#c8a8ff', 85, 'chronos_ring', { duration: 1100 }),
        grave_throne: def('grave_throne', '#8a9a7a', '#d0e0b0', 100, 'curse_chain'),
        evernight_seal: def('evernight_seal', '#a040ff', '#ff50b0', 95, 'shadow_slash'),
        myriad_mirror: def('myriad_mirror', '#90e8ff', '#ffffff', 90, 'mirror_shatter'),
        plague_altar: def('plague_altar', '#6dff50', '#c8ff80', 135, 'poison_cloud'),

        // apex（6 件）：同族更大、更久
        oath_shield_apex: def('oath_shield', '#ffe08a', '#fff6d0', 110, 'shield_burst', { follow: true, apex: true, duration: 1000 }),
        crimson_scar_apex: def('crimson_scar', '#ff3a4a', '#ff9a55', 125, 'blood_surge', { follow: true, apex: true, throttle: 900 }),
        bulwark_oath_apex: def('bulwark_oath', '#c8d6ff', '#eef2ff', 110, 'shield_burst', { follow: true, apex: true }),
        trail_sigil_apex: def('trail_sigil', '#7dff9a', '#d8ffe8', 120, 'pack_mark', { apex: true }),
        hundred_pace_apex: def('hundred_pace', '#9ad0ff', '#e8f4ff', 125, 'sniper_gaze', { apex: true, duration: 1000 }),
        swift_plume_apex: def('swift_plume', '#a8ffd4', '#eafff5', 110, 'wind_feather', { apex: true }),
        ember_residue_apex: def('ember_residue', '#ff8a4a', '#ffd29a', 115, 'element_wave', { apex: true }),
        star_oracle_apex: def('star_oracle', '#d4b8ff', '#f0e6ff', 110, 'chronos_ring', { apex: true, duration: 1100 }),
        curse_echo_apex: def('curse_echo', '#9b6aff', '#d0b0ff', 118, 'curse_chain', { apex: true }),
        night_veil_apex: def('night_veil', '#b050ff', '#ff6ab8', 115, 'shadow_slash', { apex: true }),
        mirror_mask_apex: def('mirror_mask', '#88e0ff', '#e8f9ff', 110, 'mirror_shatter', { apex: true }),
        venom_censer_apex: def('venom_censer', '#7dff62', '#d8ff9a', 150, 'poison_cloud', { apex: true }),
        holy_balance_apex: def('holy_balance', '#ffe9a0', '#fff8d8', 120, 'shield_burst', { follow: true, apex: true, duration: 1000 }),
        rift_howl_apex: def('rift_howl', '#ff6735', '#ffcf66', 140, 'fireheart', { apex: true, throttle: 700, duration: 850 }),
        temple_covenant_apex: def('temple_covenant', '#d0e0ff', '#ffffff', 115, 'shield_burst', { follow: true, apex: true, duration: 1000 }),
        beast_pact_apex: def('beast_pact', '#8bff7a', '#e0ffd0', 130, 'pack_mark', { apex: true }),
        breathless_hunt_apex: def('breathless_hunt', '#6ab8ff', '#d8ecff', 130, 'sniper_gaze', { apex: true, duration: 1100 }),
        echo_fold_apex: def('echo_fold', '#c070ff', '#ff90d0', 120, 'shadow_slash', { apex: true }),
        torrent_throne_apex: def('torrent_throne', '#8a6aff', '#62d9ff', 125, 'element_wave', { apex: true }),
        fate_web_apex: def('fate_web', '#ffe68a', '#c8a8ff', 110, 'chronos_ring', { apex: true, duration: 1200 }),
        grave_throne_apex: def('grave_throne', '#8a9a7a', '#d0e0b0', 125, 'curse_chain', { apex: true }),
        evernight_seal_apex: def('evernight_seal', '#a040ff', '#ff50b0', 120, 'shadow_slash', { apex: true }),
        myriad_mirror_apex: def('myriad_mirror', '#90e8ff', '#ffffff', 115, 'mirror_shatter', { apex: true }),
        plague_altar_apex: def('plague_altar', '#6dff50', '#c8ff80', 160, 'poison_cloud', { apex: true })
    };

    const SET_VARIANTS = {
        fireheart: '#ff6735', frostborn: '#78e8ff', stormfury: '#5adfff',
        starlight: '#ffe68a', shadowmantle: '#9e6aff', dragonblood: '#ff4b5f',
        oath_shield: '#ffe08a', crimson_scar: '#ff3a4a', bulwark_oath: '#c8d6ff',
        trail_sigil: '#7dff9a', hundred_pace: '#9ad0ff', swift_plume: '#a8ffd4',
        ember_residue: '#ff8a4a', star_oracle: '#d4b8ff', curse_echo: '#9b6aff',
        night_veil: '#b050ff', mirror_mask: '#88e0ff', venom_censer: '#7dff62',
        holy_balance: '#ffe9a0', rift_howl: '#ff4a3a', temple_covenant: '#d0e0ff',
        beast_pact: '#8bff7a', breathless_hunt: '#6ab8ff', echo_fold: '#c070ff',
        torrent_throne: '#8a6aff', fate_web: '#ffe68a', grave_throne: '#8a9a7a',
        evernight_seal: '#a040ff', myriad_mirror: '#90e8ff', plague_altar: '#6dff50'
    };

    function gameOf(player) {
        return player && player.gameInstance;
    }

    function spawn(player, type, options) {
        const game = gameOf(player);
        if (!game || typeof game.addEquipmentEffect !== 'function') return false;
        game.addEquipmentEffect(type, player.x, player.y, Object.assign({
            followTarget: player
        }, options || {}));
        return true;
    }

    const api = {
        getSupportedSpecials() {
            return Object.keys(SPECIAL_VFX);
        },

        getDefinition(specialId) {
            return SPECIAL_VFX[specialId] || null;
        },

        reset(player) {
            if (player) delete player._equipmentSetVfxState;
        },

        trigger(player, specialId, detail) {
            const def = SPECIAL_VFX[specialId];
            if (!def) return false;
            const now = Date.now();
            const state = player._equipmentSetVfxState || (player._equipmentSetVfxState = {
                nextAt: 0,
                cursor: 0,
                last: Object.create(null)
            });
            state.last = state.last || Object.create(null);
            const throttle = def.throttle || 300;
            if ((state.last[specialId] || 0) + throttle > now) return false;
            state.last[specialId] = now;
            const target = detail && detail.target;
            const game = gameOf(player);
            const x = target && typeof target.x === 'number' ? target.x : player.x;
            const y = target && typeof target.y === 'number' ? target.y : player.y;
            if (!game || typeof game.addEquipmentEffect !== 'function') return false;
            const angle = detail && detail.angle != null ? detail.angle : (player.angle || 0);
            const radius = detail && detail.radius != null
                ? detail.radius
                : def.radius * (def.apex ? 1.08 : 1);
            game.addEquipmentEffect('set_special_vfx', x, y, {
                variant: def.variant,
                style: def.style,
                color: def.color,
                color2: def.color2,
                radius: radius,
                duration: def.duration || (def.apex ? 950 : 750),
                angle: angle,
                followTarget: def.follow ? player : null,
                apex: !!def.apex,
                strikeIndex: detail && detail.stacks,
                mode: detail && detail.mode
            });
            return true;
        },

        tick(player) {
            if (!player || typeof window.getAllActiveSetEffects !== 'function') return;
            const active = window.getAllActiveSetEffects(player.equipment)
                .filter(entry => entry.pieceCount === 2);
            if (!active.length) return;
            const now = Date.now();
            const state = player._equipmentSetVfxState || (player._equipmentSetVfxState = {
                nextAt: 0,
                cursor: 0,
                last: Object.create(null)
            });
            if (now < state.nextAt) return;
            const entry = active[state.cursor % active.length];
            state.cursor++;
            state.nextAt = now + 2600;
            spawn(player, 'set_two_piece_aura', {
                variant: entry.setId,
                color: SET_VARIANTS[entry.setId] || '#ffffff',
                radius: 38,
                duration: 900
            });
        }
    };

    window.EquipmentSetVFX = api;
})();
