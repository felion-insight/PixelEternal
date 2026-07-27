/**
 * 区域生态：环境特质、特殊节点、区域切换
 */
(function () {
    'use strict';

    function zoneCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.ZONE_ECOLOGY_CONFIG) ||
            window.ZONE_ECOLOGY_CONFIG || {};
    }

    let _runZoneLayout = null;

    function zones() {
        return zoneCfg().zones || {};
    }

    function zoneLayout() {
        if (_runZoneLayout && _runZoneLayout.length) return _runZoneLayout.slice();
        const hub = window.AscensionHub;
        const base = ['ashen_wastes', 'magma_rift', 'void_abyss', 'throne_of_end'];
        if (hub && hub.isEnabled('zoneEcology')) {
            const z = hub.flag('zoneEcology').zoneLayout;
            if (z && z.length) {
                const branch = zoneCfg().branchZones || [];
                return z.concat(branch.filter((b) => z.indexOf(b) < 0));
            }
        }
        const branch = zoneCfg().branchZones || [];
        if (branch.length) return base.concat(branch);
        return base;
    }

    function zoneForLayer(layer) {
        const layout = zoneLayout();
        let acc = 0;
        for (let i = 0; i < layout.length; i++) {
            const z = zones()[layout[i]];
            if (!z) continue;
            acc += z.layers || 10;
            if (layer <= acc) return z;
        }
        return zones()[layout[layout.length - 1]] || null;
    }

    function onRunStart(run) {
        if (!run || !run.ascension) return;
        if (run.ascension.zoneLayout && run.ascension.zoneLayout.length) {
            _runZoneLayout = run.ascension.zoneLayout.slice();
        } else {
            _runZoneLayout = null;
        }
        run.ascension.zoneId = zoneLayout()[0];
        run.ascension.battlesInZone = 0;
        run.ascension.visionPenalty = 0;
        if (window.ZoneMutationRuntime && run.ascension.zoneId) {
            window.ZoneMutationRuntime.onZoneEnter(run, run.ascension.zoneId);
        }
    }

    function onBattleStart(run, battle) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('zoneEcology')) return;
        if (!run || !battle) return;
        const layer = run.path ? run.path.length + 1 : 1;
        const zone = zoneForLayer(layer);
        if (!zone) return;
        run.ascension.zoneId = zone.id;
        run.ascension.battlesInZone += 1;
        battle.zoneTrait = zone.trait || null;
        battle.zoneHazard = zone.hazard || null;
        battle.zoneId = zone.id;

        const trait = zone.trait;
        if (trait && trait.effect) {
            if (trait.effect.visionReduce && trait.applyEveryNBattles &&
                run.ascension.battlesInZone % trait.applyEveryNBattles === 0) {
                run.ascension.visionPenalty = Math.min(0.6, run.ascension.visionPenalty + trait.effect.visionReduce);
            }
            if (trait.effect.lavaCell && battle.board) {
                battle.lavaCells = battle.lavaCells || [];
                battle.lavaCells.push({
                    col: Math.floor(Math.random() * (battle.board.cols || 4)),
                    row: Math.floor(Math.random() * (battle.board.rows || 3)),
                    dpsPct: trait.effect.lavaDpsPct || 0.05
                });
            }
            if (trait.effect.swapIntervalMs) {
                battle.zoneSwapTimer = trait.effect.swapIntervalMs;
            }
        }
    }

    function onCombatEnd(run, victory) {
        if (!run || !run.ascension) return;
        const zone = zones()[run.ascension.zoneId];
        if (!zone) return;
        if (run.ascension.battlesInZone >= (zone.layers || 10)) {
            const layout = zoneLayout();
            const idx = layout.indexOf(run.ascension.zoneId);
            if (idx >= 0 && idx < layout.length - 1) {
                run.ascension.zoneId = layout[idx + 1];
                run.ascension.battlesInZone = 0;
                if (window.ZoneMutationRuntime) {
                    window.ZoneMutationRuntime.onZoneEnter(run, run.ascension.zoneId);
                }
            }
        }
    }

    function getCommanderRegenMult(run) {
        if (!run || !run.ascension) return 1;
        const zone = zones()[run.ascension.zoneId];
        if (zone && zone.trait && zone.trait.effect && zone.trait.effect.commanderRegenMult) {
            return zone.trait.effect.commanderRegenMult;
        }
        return 1;
    }

    function getZoneDisplay(run) {
        if (!run || !run.ascension) return null;
        const z = zones()[run.ascension.zoneId];
        return z ? { id: z.id, name: z.name, trait: z.trait } : null;
    }

    function tickZoneBattle(battle, dtMs) {
        if (!battle.zoneSwapTimer) return;
        battle.zoneSwapAcc = (battle.zoneSwapAcc || 0) + dtMs;
        if (battle.zoneSwapAcc >= battle.zoneSwapTimer) {
            battle.zoneSwapAcc = 0;
            swapRandomUnits(battle);
        }
        if (battle.lavaCells && battle.lavaCells.length) {
            const allies = (battle.allies || []).filter((u) => u.alive && u.hp > 0);
            battle.lavaCells.forEach((cell) => {
                allies.forEach((u) => {
                    if ((u.col || 0) === cell.col && (u.row || 0) === cell.row) {
                        u.hp = Math.max(0, u.hp - Math.floor(u.maxHp * cell.dpsPct * dtMs / 1000));
                        if (u.hp <= 0) u.alive = false;
                    }
                });
            });
        }
    }

    function swapRandomUnits(battle) {
        const all = (battle.allies || []).concat(battle.enemies || []).filter((u) => u.alive && u.hp > 0);
        if (all.length < 2) return;
        const a = all[Math.floor(Math.random() * all.length)];
        let b = all[Math.floor(Math.random() * all.length)];
        while (b === a) b = all[Math.floor(Math.random() * all.length)];
        const tmpCol = a.col; const tmpRow = a.row;
        a.col = b.col; a.row = b.row;
        b.col = tmpCol; b.row = tmpRow;
    }

    window.ZoneEcology = {
        zones,
        zoneLayout,
        zoneForLayer,
        onRunStart,
        onBattleStart,
        onCombatEnd,
        getCommanderRegenMult,
        getZoneDisplay,
        tickZoneBattle
    };
})();
