/**
 * Phase 6 — 副本入口、次数与奖励
 */
(function () {
    'use strict';

    function todayKey() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function weekKey() {
        const d = new Date();
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
        return d.getFullYear() + '-W' + String(week).padStart(2, '0');
    }

    window.ensurePlayerDungeonProgress = function ensurePlayerDungeonProgress(player) {
        if (!player) return;
        if (!player.dungeonProgress || typeof player.dungeonProgress !== 'object') {
            player.dungeonProgress = {};
        }
        const p = player.dungeonProgress;
        const dk = todayKey();
        const wk = weekKey();
        if (p.dailyKey !== dk) {
            p.dailyKey = dk;
            p.daily = {};
        }
        if (p.weeklyKey !== wk) {
            p.weeklyKey = wk;
            p.weekly = {};
            p.trialTowerBestFloor = 0;
        }
        if (!p.daily) p.daily = {};
        if (!p.weekly) p.weekly = {};
        if (!p.firstClear) p.firstClear = {};
        if (typeof p.riftWindowEnd !== 'number') p.riftWindowEnd = 0;
    };

    window.refreshRiftWindow = function refreshRiftWindow(player) {
        window.ensurePlayerDungeonProgress(player);
        const now = Date.now();
        if (player.dungeonProgress.riftWindowEnd > now) return true;
        player.dungeonProgress.riftWindowEnd = now + 2 * 60 * 60 * 1000;
        return true;
    };

    window.isRiftWindowActive = function isRiftWindowActive(player) {
        window.ensurePlayerDungeonProgress(player);
        return Date.now() < (player.dungeonProgress.riftWindowEnd || 0);
    };

    window.getDungeonDefinition = function getDungeonDefinition(dungeonId) {
        const list = window.DUNGEON_DEFINITIONS;
        if (!list || !dungeonId) return null;
        return list.find(d => d.id === dungeonId) || null;
    };

    window.getDungeonTier = function getDungeonTier(def, tierId) {
        if (!def || !def.tiers || !def.tiers.length) return null;
        if (tierId) return def.tiers.find(t => t.id === tierId) || null;
        return def.tiers[def.tiers.length - 1];
    };

    window.getDungeonAttemptsUsed = function getDungeonAttemptsUsed(player, def) {
        window.ensurePlayerDungeonProgress(player);
        if (!def) return 0;
        if (def.dailyLimit != null) return player.dungeonProgress.daily[def.id] || 0;
        if (def.weeklyLimit != null) return player.dungeonProgress.weekly[def.id] || 0;
        return 0;
    };

    window.getDungeonAttemptsRemaining = function getDungeonAttemptsRemaining(player, def) {
        if (!def) return 0;
        if (def.dailyLimit == null && def.weeklyLimit == null) return 999;
        const limit = def.dailyLimit != null ? def.dailyLimit : def.weeklyLimit;
        return Math.max(0, limit - window.getDungeonAttemptsUsed(player, def));
    };

    window.isDungeonOpenToday = function isDungeonOpenToday(def) {
        if (!def || !def.openDays || !def.openDays.length) return true;
        const day = new Date().getDay();
        return def.openDays.includes(day);
    };

    window.isSigilFridayBonus = function isSigilFridayBonus() {
        return new Date().getDay() === 5;
    };

    window.canEnterDungeon = function canEnterDungeon(player, dungeonId, tierId) {
        if (!player) return { ok: false, message: '无效角色' };
        const def = window.getDungeonDefinition(dungeonId);
        if (!def) return { ok: false, message: '副本不存在' };
        if (def.category === 'rift') {
            window.refreshRiftWindow(player);
        }
        if (player.level < (def.unlockLevel || 1)) {
            return { ok: false, message: `需要 Lv.${def.unlockLevel}` };
        }
        if (!window.isDungeonOpenToday(def)) {
            return { ok: false, message: '今日未开放（周一/三/五）' };
        }
        const tier = window.getDungeonTier(def, tierId);
        if (!tier) return { ok: false, message: '难度不存在' };
        if (player.level < (tier.unlockLevel || def.unlockLevel || 1)) {
            return { ok: false, message: `该难度需要 Lv.${tier.unlockLevel}` };
        }
        const remaining = window.getDungeonAttemptsRemaining(player, def);
        if (def.dailyLimit != null || (def.weeklyLimit != null && def.weeklyLimit < 999)) {
            if (remaining <= 0) {
                const kind = def.dailyLimit != null ? '今日' : '本周';
                return { ok: false, message: `${kind}次数已用完` };
            }
        }
        if (def.category === 'rift') {
            const cost = def.riftCost || 1;
            if (window.getMaterialCount(player, 'rift_stone') < cost) {
                return { ok: false, message: `需要裂隙石 ×${cost}` };
            }
        }
        return { ok: true, def, tier, remaining };
    };

    window.consumeDungeonAttempt = function consumeDungeonAttempt(player, def) {
        window.ensurePlayerDungeonProgress(player);
        if (!def) return;
        if (def.dailyLimit != null) {
            player.dungeonProgress.daily[def.id] = (player.dungeonProgress.daily[def.id] || 0) + 1;
        } else if (def.weeklyLimit != null && def.weeklyLimit < 999) {
            player.dungeonProgress.weekly[def.id] = (player.dungeonProgress.weekly[def.id] || 0) + 1;
        }
        if (def.category === 'rift') {
            window.spendMaterial(player, 'rift_stone', def.riftCost || 1);
        }
    };

    function rollAmount(entry, mult, playerLevel) {
        const m = mult || 1;
        let min = entry.min || 0;
        let max = entry.max != null ? entry.max : min;
        if (entry.levelScale && playerLevel) {
            const scale = 1 + (playerLevel - 1) * (entry.levelScale / 1000);
            min = Math.floor(min * scale);
            max = Math.floor(max * scale);
        }
        if (min >= max) return Math.max(0, Math.floor(min * m));
        return Math.max(0, Math.floor((min + Math.random() * (max - min + 1)) * m));
    }

    window.grantDungeonRewardEntry = function grantDungeonRewardEntry(game, entry, mult) {
        if (!game || !game.player || !entry) return [];
        const p = game.player;
        const granted = [];
        const m = mult || 1;
        if (entry.type === 'gold') {
            const amt = rollAmount(entry, m, p.level);
            if (amt > 0) {
                p.gold += amt;
                granted.push({ type: 'gold', amount: amt });
            }
        } else if (entry.type === 'material' && entry.id) {
            const amt = rollAmount(entry, m, p.level);
            if (amt > 0) {
                window.addMaterial(p, entry.id, amt);
                granted.push({ type: 'material', id: entry.id, amount: amt, name: window.getMaterialName(entry.id) });
            }
        } else if (entry.type === 'equipment') {
            const rawEq = window.EquipmentCodex && window.EquipmentCodex.generateLootEquipment
                ? window.EquipmentCodex.generateLootEquipment({
                    monsterLevel: entry.level || p.level,
                    monsterTier: 'boss',
                    quality: entry.quality || 'epic',
                    playerClass: typeof window.getPlayerBaseClassId === 'function'
                        ? window.getPlayerBaseClassId(p.classData) : null
                }) : null;
            if (rawEq && typeof game.addItemToInventory === 'function') {
                const eq = window.EquipmentCodex?.cloneEquipmentForGrant(rawEq)
                    || (typeof Equipment !== 'undefined' ? new Equipment(rawEq) : null);
                if (eq && game.addItemToInventory(eq, true)) {
                    granted.push({ type: 'equipment', name: eq.name });
                }
            }
        }
        return granted;
    };

    window.grantDungeonRewards = function grantDungeonRewards(game, rewardList, mult) {
        const all = [];
        (rewardList || []).forEach(entry => {
            all.push(...window.grantDungeonRewardEntry(game, entry, mult));
        });
        return all;
    };

    window.buildDungeonVictoryRewards = function buildDungeonVictoryRewards(game, run) {
        if (!game || !run || !run.def || !run.tier) return [];
        const def = run.def;
        const tier = run.tier;
        let mult = (tier.rewardMult || 1) * (run.rewardMult || 1);
        if (def.id === 'sigil_ruins' && window.isSigilFridayBonus()) mult *= 1.5;
        if (def.speedRankS && run.elapsedMs != null && run.elapsedMs <= def.speedRankS) {
            mult *= 1.5;
            run.speedRank = 'S';
        }
        const rewards = [];
        if (tier.rewards) rewards.push(...tier.rewards);
        if (run.wavesReached && tier.waveRewards) {
            for (let w = 1; w <= run.wavesReached; w++) {
                const wr = tier.waveRewards[String(w)];
                if (wr) rewards.push(...wr);
            }
        }
        if (run.fullClear && tier.fullClearBonus) rewards.push(...tier.fullClearBonus);
        if (run.eliteCleared && tier.eliteBonus) rewards.push(...tier.eliteBonus);
        if (run.abyssGateCleared && tier.abyssGateRewards) rewards.push(...tier.abyssGateRewards);
        if (run.trialTowerFloor && tier.floorRewards) {
            tier.floorRewards.forEach(fr => {
                const every = fr.every || 5;
                const times = Math.floor(run.trialTowerFloor / every);
                for (let i = 0; i < times; i++) rewards.push(fr);
            });
        }
        window.ensurePlayerDungeonProgress(game.player);
        const fcKey = def.id + ':' + tier.id;
        if (tier.firstClearBonus && !game.player.dungeonProgress.firstClear[fcKey]) {
            rewards.push(...tier.firstClearBonus);
            game.player.dungeonProgress.firstClear[fcKey] = true;
        }
        return window.grantDungeonRewards(game, rewards, mult);
    };

    window.formatGrantedRewards = function formatGrantedRewards(granted) {
        if (!granted || !granted.length) return '无';
        return granted.map(g => {
            if (g.type === 'gold') return `金币 +${g.amount}`;
            if (g.type === 'material') return `${g.name} ×${g.amount}`;
            if (g.type === 'equipment') return g.name;
            return '';
        }).filter(Boolean).join(' · ');
    };

    window.listDungeonsByCategory = function listDungeonsByCategory() {
        const list = window.DUNGEON_DEFINITIONS || [];
        const cats = { daily: [], weekly: [], abyss: [], rift: [], endgame: [], raid: [] };
        list.forEach(d => {
            const c = d.category || 'daily';
            if (cats[c]) cats[c].push(d);
        });
        if (window.TEAM_RAIDS) cats.raid = window.TEAM_RAIDS.slice();
        return cats;
    };
})();
