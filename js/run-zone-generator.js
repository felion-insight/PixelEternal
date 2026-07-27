/**
 * Run 区域随机化：每次开局 shuffle 区域顺序与 mutation
 */
(function () {
    'use strict';

    function zoneCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.ZONE_ECOLOGY_CONFIG) ||
            window.ZONE_ECOLOGY_CONFIG || {};
    }

    function mutationCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.ZONE_MUTATIONS_CONFIG) ||
            window.ZONE_MUTATIONS_CONFIG || {};
    }

    function isEnabled() {
        return window.AscensionHub && window.AscensionHub.isEnabled('runZoneRandomizer');
    }

    function allZoneIds() {
        const zones = zoneCfg().zones || {};
        return Object.keys(zones);
    }

    function allMutations() {
        const c = mutationCfg();
        return c.mutations || c.ZONE_MUTATIONS_CONFIG?.mutations || {
            elite_rich: { id: 'elite_rich', name: '精英密集' },
            cursed: { id: 'cursed', name: '强制诅咒' },
            no_heal: { id: 'no_heal', name: '禁疗' },
            double_gold: { id: 'double_gold', name: '双倍金币' }
        };
    }

    function shuffle(arr, rng) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function generateRunZones(run, rng) {
        rng = rng || Math.random;
        const hub = window.AscensionHub ? window.AscensionHub.flag('runZoneRandomizer') : {};
        const pool = allZoneIds();
        if (!pool.length) return { layout: [], mutations: {} };

        const minCount = hub.minZones != null ? hub.minZones : 3;
        const maxCount = hub.maxZones != null ? hub.maxZones : 5;
        const count = minCount + Math.floor(rng() * (maxCount - minCount + 1));
        const layout = shuffle(pool, rng).slice(0, Math.min(count, pool.length));

        const mutKeys = Object.keys(allMutations());
        const mutations = {};
        layout.forEach((zid) => {
            if (!mutKeys.length) return;
            const pick = mutKeys[Math.floor(rng() * mutKeys.length)];
            mutations[zid] = pick;
        });

        return { layout: layout, mutations: mutations };
    }

    function onRunStart(run) {
        if (!isEnabled() || !run || !run.ascension) return;
        const rng = (window.RunStateSystem && window.RunStateSystem.rngFromRun)
            ? window.RunStateSystem.rngFromRun(run) : Math.random;
        const gen = generateRunZones(run, rng);
        if (gen.layout.length) {
            run.ascension.zoneLayout = gen.layout;
            run.ascension.zoneMutations = gen.mutations;
            run.ascension.zoneId = gen.layout[0];
            run.ascension.battlesInZone = 0;
            if (window.ZoneMutationRuntime) {
                window.ZoneMutationRuntime.onZoneEnter(run, gen.layout[0]);
            }
        }
    }

    function getZoneMutation(run, zoneId) {
        if (!run || !run.ascension || !run.ascension.zoneMutations) return null;
        const id = run.ascension.zoneMutations[zoneId];
        if (!id) return null;
        return allMutations()[id] || { id: id, name: id };
    }

    window.RunZoneGenerator = {
        generateRunZones,
        onRunStart,
        getZoneMutation,
        isEnabled
    };
})();
