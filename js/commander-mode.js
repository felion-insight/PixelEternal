/**
 * 指挥官模式：战术能量、幽灵位置、指令冷却
 */
(function () {
    'use strict';

    function commanderCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.COMMANDER_CONFIG) ||
            window.COMMANDER_CONFIG || {};
    }

    function energyCfg() {
        return commanderCfg().energy || {};
    }

    function allAbilities() {
        return commanderCfg().abilities || {};
    }

    function zoneIndex(zoneId) {
        if (!window.ZoneEcology || !window.ZoneEcology.zoneLayout) return -1;
        return window.ZoneEcology.zoneLayout().indexOf(zoneId);
    }

    function abilityMeetsUnlock(run, meta, id, def) {
        if (!def) return false;
        if (def.basic) return true;
        if (def.unlockRelic && run && run.relics) {
            const owned = run.relics.map((r) => typeof r === 'string' ? r : r.id);
            if (owned.indexOf(def.unlockRelic) >= 0) return true;
        }
        if (def.unlockPactStars) {
            const pact = run && run.ascension && run.ascension.pact;
            if (!pact || (pact.stars || 1) < def.unlockPactStars) return false;
        }
        if (run && run.ascension && run.ascension.pact && run.ascension.pact.disableTimeStop &&
            def.effectType === 'time_stop') {
            return false;
        }
        if (def.unlockZone && run && run.ascension) {
            const need = zoneIndex(def.unlockZone);
            const cur = zoneIndex(run.ascension.zoneId);
            if (need >= 0 && cur >= 0 && cur < need) return false;
        }
        if (def.unlockChain && meta && meta.ascension) {
            const done = meta.ascension.completedChains || [];
            const active = (run && run.ascension && run.ascension.activeChains || []).some((c) => c.chainId === def.unlockChain);
            if (done.indexOf(def.unlockChain) < 0 && !active) return false;
        }
        const extra = (run && run.ascension && run.ascension.commanderUnlocks) || [];
        if (extra.indexOf(id) >= 0) return true;
        const metaUnlocks = meta && meta.ascension ? meta.ascension.unlockedCommanderAbilities || [] : [];
        if (metaUnlocks.indexOf(id) >= 0) return true;
        if (def.unlockCurse && run && run.ascension && run.ascension.cursedRelicIds.indexOf(def.unlockCurse) >= 0) return true;
        if (!def.basic && !def.unlockRelic && !def.unlockPactStars && !def.unlockZone && !def.unlockChain && !def.unlockCurse) {
            return extra.indexOf(id) >= 0 || metaUnlocks.indexOf(id) >= 0;
        }
        return true;
    }

    function unlockedAbilityIds(run) {
        const basic = Object.keys(allAbilities()).filter((id) => allAbilities()[id].basic);
        const meta = window.__partyMetaRef;
        const metaUnlocks = meta && meta.ascension ? meta.ascension.unlockedCommanderAbilities || [] : [];
        if (meta && meta.ascension && meta.ascension.firstVictory) {
            metaUnlocks.push('revive_ally');
        }
        const relicUnlocks = [];
        if (run && run.relics) {
            const owned = run.relics.map((r) => typeof r === 'string' ? r : r.id);
            Object.keys(allAbilities()).forEach((aid) => {
                const a = allAbilities()[aid];
                if (a.unlockRelic && owned.indexOf(a.unlockRelic) >= 0) relicUnlocks.push(aid);
            });
        }
        const extra = (run && run.ascension && run.ascension.commanderUnlocks) || [];
        const allIds = Array.from(new Set(basic.concat(extra, metaUnlocks, relicUnlocks, Object.keys(allAbilities()))));
        return allIds.filter((id) => abilityMeetsUnlock(run, meta, id, allAbilities()[id]));
    }

    function getSlotCount(run) {
        const cfg = commanderCfg();
        let n = cfg.slotCount != null ? cfg.slotCount : 4;
        const max = cfg.maxSlotCount || 5;
        let disabled = 0;
        if (run && run.ascension && run.ascension.pact) {
            disabled = run.ascension.pact.commanderDisabledSlots | 0 || 0;
        }
        return Math.max(1, Math.min(max, n - disabled));
    }

    function defaultLoadout(run) {
        const unlocked = unlockedAbilityIds(run);
        const preferred = (commanderCfg().defaultLoadout || [
            'focus_fire', 'shield_burst', 'battle_cry', 'tactical_retreat',
            'time_stop', 'tactical_withdraw'
        ]).slice();
        const slots = getSlotCount(run);
        const picked = [];
        preferred.forEach((id) => {
            if (picked.length >= slots) return;
            if (unlocked.indexOf(id) >= 0 && picked.indexOf(id) < 0) picked.push(id);
        });
        unlocked.forEach((id) => {
            if (picked.length >= slots) return;
            if (picked.indexOf(id) < 0) picked.push(id);
        });
        return picked.slice(0, slots);
    }

    function normalizeLoadout(run, ids) {
        const unlocked = new Set(unlockedAbilityIds(run));
        const slots = getSlotCount(run);
        const out = [];
        (ids || []).forEach((id) => {
            if (out.length >= slots) return;
            if (unlocked.has(id) && out.indexOf(id) < 0) out.push(id);
        });
        return out;
    }

    function fillLoadout(run, partial) {
        const slots = getSlotCount(run);
        const out = normalizeLoadout(run, partial).slice();
        if (out.length >= slots) return out.slice(0, slots);
        defaultLoadout(run).forEach((id) => {
            if (out.length >= slots) return;
            if (out.indexOf(id) < 0) out.push(id);
        });
        return out.slice(0, slots);
    }

    function getLoadout(run) {
        if (!run || !run.ascension) return defaultLoadout(null);
        const raw = run.ascension.commanderLoadout;
        if (!Array.isArray(raw) || !raw.length) return defaultLoadout(run);
        return fillLoadout(run, raw);
    }

    function setLoadout(run, ids, opts) {
        opts = opts || {};
        if (!run || !run.ascension) return false;
        const slots = getSlotCount(run);
        const norm = normalizeLoadout(run, ids);
        if (norm.length !== slots) return false;
        run.ascension.commanderLoadout = norm.slice();
        if (opts.customized !== false) run.ascension.commanderLoadoutCustomized = true;
        if (run.battleRef && run.battleRef.commanderMode) {
            run.battleRef.commanderMode.abilityIds = norm.slice();
        }
        return true;
    }

    function ensureLoadout(run) {
        if (!run || !run.ascension) return [];
        const loadout = getLoadout(run);
        run.ascension.commanderLoadout = loadout.slice();
        return loadout;
    }

    function equippedAbilityIds(run) {
        return getLoadout(run);
    }

    function needsLoadoutPrompt(run) {
        if (!run || !run.ascension) return false;
        if (run.ascension.commanderLoadoutCustomized) return false;
        return getLoadout(run).length < getSlotCount(run);
    }

    function defaultGhostPosition(battle) {
        const ox = (battle.origin && battle.origin.x) != null ? battle.origin.x
            : (battle.boardOriginX != null ? battle.boardOriginX : 200);
        const oy = (battle.origin && battle.origin.y) != null ? battle.origin.y
            : (battle.boardOriginY != null ? battle.boardOriginY : 200);
        const board = battle.board || {};
        const cols = board.cols || 4;
        const cell = board.cellSize || 72;
        const gap = board.gap || 8;
        const allyWidth = cols * cell + Math.max(0, cols - 1) * gap;
        return { x: ox + allyWidth * 0.5, y: oy - 40 };
    }

    function syncGhostWithBattle(battle, oldOrigin, scale) {
        const cm = battle && battle.commanderMode;
        if (!cm || !cm.ghost) return;
        if (oldOrigin && scale != null && battle.origin) {
            cm.ghost.x = battle.origin.x + (cm.ghost.x - oldOrigin.x) * scale;
            cm.ghost.y = battle.origin.y + (cm.ghost.y - oldOrigin.y) * scale;
            return;
        }
        const pos = defaultGhostPosition(battle);
        cm.ghost.x = pos.x;
        cm.ghost.y = pos.y;
    }

    function create(battle, run, opts) {
        opts = opts || {};
        const e = energyCfg();
        const cm = {
            battle: battle,
            run: run,
            enabled: true,
            energy: e.startEnergy != null ? e.startEnergy : 20,
            maxEnergy: e.maxEnergy || 100,
            overflowCap: e.overflowCap || 120,
            cooldowns: {},
            ghost: defaultGhostPosition(battle),
            selectedAbility: null,
            focusTargetId: null,
            forcedTutorial: !!opts.forcedTutorial,
            disabledSlots: 0,
            regenMult: 1
        };
        if (run && run.ascension && run.ascension.pact) {
            const pact = run.ascension.pact;
            if (pact.commanderRegenMult) cm.regenMult *= pact.commanderRegenMult;
        }
        if (window.ZoneEcology) {
            const zm = window.ZoneEcology.getCommanderRegenMult(run);
            if (zm != null) cm.regenMult *= zm;
        }
        if (run && run.ascension && run.ascension.pact && run.ascension.pact.disableCommander) {
            cm.enabled = false;
        }
        if (run && run.ascension && run.ascension.pact && run.ascension.pact.commanderDisabledSlots) {
            cm.disabledSlots = run.ascension.pact.commanderDisabledSlots | 0 || 0;
        }
        cm.slotCount = getSlotCount(run);
        cm.abilityIds = equippedAbilityIds(run);
        battle.commanderMode = cm;
        return cm;
    }

    function regenEnergy(cm, dtMs) {
        const battle = cm.battle;
        const now = battle && battle.elapsed != null ? battle.elapsed : 0;
        if (cm.regenBlockedUntil != null && now < cm.regenBlockedUntil) return;
        const e = energyCfg();
        const rate = (e.regenPerSecond || 5) * cm.regenMult * dtMs / 1000;
        cm.energy = Math.min(cm.maxEnergy + cm.overflowCap, cm.energy + rate);
    }

    function tick(cm, dtMs) {
        if (!cm || !cm.enabled) return;
        regenEnergy(cm, dtMs);
        Object.keys(cm.cooldowns).forEach((k) => {
            cm.cooldowns[k] = Math.max(0, cm.cooldowns[k] - dtMs);
        });
    }

    function onAllyKill(cm) {
        const e = energyCfg();
        cm.energy = Math.min(cm.maxEnergy + cm.overflowCap, cm.energy + (e.regenPerKill || 8));
    }

    function onAllyDamage(cm, hero, amount) {
        const e = energyCfg();
        cm.energy = Math.min(cm.maxEnergy + cm.overflowCap,
            cm.energy + Math.floor(amount * (e.regenPerDamageTaken || 0.5)));
    }

    function onAllyDeath(cm) {
        const e = energyCfg();
        cm.energy = Math.min(cm.maxEnergy + cm.overflowCap, cm.energy + (e.regenPerAllyDeath || 15));
        if (cm.battle && cm.battle.juiceSystem && window.JuiceCore) {
            window.JuiceCore.trigger(cm.battle.juiceSystem, 'energy_gain_death', { amount: e.regenPerAllyDeath || 15 });
        }
    }

    function getAbilityCost(id) {
        const a = allAbilities()[id];
        return a ? (a.cost || 0) : 999;
    }

    function canUse(cm, abilityId) {
        if (!cm || !cm.enabled) return false;
        if (cm.abilityIds.indexOf(abilityId) < 0) return false;
        const cd = cm.cooldowns[abilityId] || 0;
        return cm.energy >= getAbilityCost(abilityId) && cd <= 0;
    }

    function useAbility(cm, abilityId, target) {
        if (!canUse(cm, abilityId)) return false;
        const def = allAbilities()[abilityId];
        if (!def) return false;
        cm.energy -= getAbilityCost(abilityId);
        const pact = cm.run && cm.run.ascension && cm.run.ascension.pact;
        const cdMult = window.DemonPact && window.DemonPact.getCommanderCooldownMult
            ? window.DemonPact.getCommanderCooldownMult(cm.run) : 1;
        cm.cooldowns[abilityId] = Math.floor((def.cooldownMs || 10000) * cdMult);
        if (window.CommanderAbilities) {
            window.CommanderAbilities.execute(cm, def, target);
        }
        if (cm.battle && cm.battle.juiceSystem && window.JuiceCore) {
            window.JuiceCore.trigger(cm.battle.juiceSystem, 'ability_cast', { id: abilityId });
        }
        if (cm.run && cm.run.ascension && cm.run.ascension.analytics && window.RunAnalytics) {
            window.RunAnalytics.recordCommand(cm.run.ascension.analytics, abilityId);
        }
        return true;
    }

    function livingUnits(battle) {
        return (battle.allies || []).concat(battle.enemies || []).filter((u) => u && u.alive !== false && (u.hp == null || u.hp > 0));
    }

    function getTargetSpec(def) {
        if (!def || !def.effectType) return 'none';
        const t = def.effectType;
        if (t === 'focus_fire' || t === 'mana_burn' || t === 'void_banish') return 'enemy';
        if (t === 'tactical_retreat') return 'ally_low_hp';
        if (t === 'taunt_aura' || t === 'mirror_unit' || t === 'ultimate_sacrifice') return 'ally';
        if (t === 'revive_ally') return 'ally_dead';
        if (t === 'swap_positions' || t === 'soul_link') return 'ally_pair';
        return 'none';
    }

    function pickAbilityTarget(cm, def, battle) {
        if (!battle || !def) return null;
        const spec = getTargetSpec(def);
        const allies = (battle.allies || []).filter((u) => u);
        const livingAllies = allies.filter((u) => u.alive !== false && (u.hp == null || u.hp > 0));
        const enemies = (battle.enemies || []).filter((u) => u.alive !== false && (u.hp == null || u.hp > 0));
        if (spec === 'enemy') {
            return enemies.sort((a, b) => (a.hp / Math.max(1, a.maxHp)) - (b.hp / Math.max(1, b.maxHp)))[0] || null;
        }
        if (spec === 'ally') return livingAllies[0] || null;
        if (spec === 'ally_dead') {
            return allies.find((u) => u.alive === false || (u.hp != null && u.hp <= 0)) || null;
        }
        if (spec === 'ally_low_hp') {
            return livingAllies.slice().sort((a, b) => (a.hp / Math.max(1, a.maxHp)) - (b.hp / Math.max(1, b.maxHp)))[0] || null;
        }
        if (spec === 'ally_pair') {
            const pair = livingAllies.slice(0, 2);
            return pair.length >= 2 ? pair : (pair[0] || null);
        }
        return null;
    }

    function needsTotemPick(def) {
        return def && def.effectType === 'summon_totem' && (def.totemTypes || []).length > 1;
    }

    function needsManualTarget(def) {
        const spec = getTargetSpec(def);
        return spec === 'enemy' || spec === 'ally' || spec === 'ally_low_hp' || spec === 'ally_dead';
    }

    function setGhostPosition(cm, x, y) {
        if (!cm) return;
        cm.ghost.x = x;
        cm.ghost.y = y;
    }

    function describeUnlockRequirement(run, meta, id, def) {
        if (!def) return '';
        if (def.basic) return '默认可用';
        if (def.unlockRelic) return '需要遗物：' + def.unlockRelic;
        if (def.unlockPactStars) return '契约 ' + def.unlockPactStars + ' 星';
        if (def.unlockZone) return '通关区域：' + def.unlockZone;
        if (def.unlockChain) return '完成事件链：' + def.unlockChain;
        if (def.unlockCurse) return '持有诅咒遗物：' + def.unlockCurse;
        if (id === 'revive_ally' && meta && meta.ascension && meta.ascension.firstVictory) return '首次通关解锁';
        return '特殊解锁';
    }

    window.CommanderMode = {
        create, tick, onAllyKill, onAllyDamage, onAllyDeath, canUse, useAbility,
        setGhostPosition, syncGhostWithBattle, defaultGhostPosition, unlockedAbilityIds, allAbilities, energyCfg,
        describeUnlockRequirement,
        getTargetSpec, pickAbilityTarget, needsTotemPick, needsManualTarget,
        getSlotCount, defaultLoadout, normalizeLoadout, getLoadout, setLoadout, ensureLoadout,
        equippedAbilityIds, needsLoadoutPrompt, fillLoadout
    };
})();
