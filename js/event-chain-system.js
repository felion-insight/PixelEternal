/**
 * 事件链进度与独立事件
 */
(function () {
    'use strict';

    function chainCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.EVENT_CHAINS_CONFIG) ||
            window.EVENT_CHAINS_CONFIG || {};
    }

    function maxConcurrent() {
        const hub = window.AscensionHub;
        if (hub) return hub.flag('eventChains').maxConcurrentChains || 3;
        return chainCfg().maxConcurrentChains || 3;
    }

    function onRunStart(run) {
        if (!run || !run.ascension) return;
        run.ascension.activeChains = run.ascension.activeChains || [];
    }

    function startChain(run, chainId, nodeId) {
        if (!run || !run.ascension) return false;
        if (run.ascension.activeChains.length >= maxConcurrent()) return false;
        const chains = chainCfg().chains || {};
        if (!chains[chainId]) return false;
        const existing = run.ascension.activeChains.find((c) => c.chainId === chainId);
        if (existing) return false;
        const firstNode = (chains[chainId].nodes || [])[0];
        run.ascension.activeChains.push({
            chainId: chainId,
            currentNode: nodeId || (firstNode && firstNode.id),
            progress: 0
        });
        return true;
    }

    function applyChoiceEffects(run, choice, result) {
        const RSS = window.RunStateSystem;
        const rw = choice.rewards || {};
        if (choice.costHpPct && run.heroes) {
            run.heroes.forEach((h) => {
                h.hp = Math.max(1, h.hp - Math.floor(h.maxHp * choice.costHpPct));
            });
        }
        if (rw.permanentBuff && run.heroes) {
            const h = run.heroes[Math.floor(Math.random() * run.heroes.length)];
            if (h) h.maxHp = Math.floor(h.maxHp * 1.1);
        }
        if (choice.rewards && choice.rewards.permanentBuff && run.heroes) {
            const h = run.heroes[Math.floor(Math.random() * run.heroes.length)];
            if (h) h.maxHp = Math.floor(h.maxHp * 1.1);
        }
        if (rw.gold) run.gold = (run.gold || 0) + rw.gold;
        if (rw.relic && RSS) {
            const relicId = rw.relic;
            if (relicId === 'legendary_random' && window.RelicSystem) {
                const rng = RSS.rngFromRun(run);
                const picks = window.RelicSystem.pickRelicChoices(rng, 1, run.relics, 'chain', run);
                const leg = (picks || []).find((r) => r.rarity === 'legendary') || (picks && picks[0]);
                if (leg && leg.id && RSS.addRelic(run, leg.id) && result) result.relicGranted = leg.id;
            } else if (RSS.addRelic(run, relicId) && result) {
                result.relicGranted = relicId;
            }
        }
        if (rw.gear && RSS) {
            const rng = RSS.rngFromRun(run);
            const hero = (run.heroes || [])[0];
            const gear = RSS.makeGearLoot(rng, null, hero && hero.baseClass);
            run.inventoryGear = run.inventoryGear || [];
            run.inventoryGear.push(gear);
            if (result) result.gearGranted = gear;
        }
        if (rw.curseRelic && window.CurseSystem) {
            const ids = Object.keys(window.CurseSystem.cursedRelics());
            const pick = ids[Math.floor(Math.random() * ids.length)];
            if (pick && RSS) RSS.addRelic(run, pick);
        }
        if (choice.curseRelic === 'random' || choice.curseRelic === 'random_powerful') {
            const ids = Object.keys(window.CurseSystem ? window.CurseSystem.cursedRelics() : {});
            const pick = ids[Math.floor(Math.random() * ids.length)];
            if (pick && RSS) RSS.addRelic(run, pick);
        }
        if (choice.tempAlly) {
            run.ascension.tempAllies = run.ascension.tempAllies || [];
            run.ascension.tempAllies.push({ id: choice.tempAlly, battlesLeft: choice.battles || 1 });
        }
        if (choice.forcedCombat || choice.startEncounter) {
            run.ascension.pendingForcedCombat = choice.forcedCombat || choice.startEncounter;
        }
        if (choice.randomEncounter) {
            run.ascension.pendingForcedCombat = choice.randomEncounter === true ? 'battle' : choice.randomEncounter;
        }
        if (choice.battlesInRow) {
            run.ascension.chainArenaBattles = (run.ascension.chainArenaBattles || 0) + 1;
            run.ascension.chainArenaRequired = choice.battlesInRow;
            if (choice.failDeath) run.ascension.chainArenaFailDeath = true;
        }
        if (choice.startChain) startChain(run, choice.startChain);
        if (choice.unlockMeta && window.__partyMetaRef && window.__partyMetaRef.ascension) {
            const mu = window.__partyMetaRef.ascension.metaUnlocks || [];
            if (mu.indexOf(choice.unlockMeta) < 0) mu.push(choice.unlockMeta);
            window.__partyMetaRef.ascension.metaUnlocks = mu;
        }
        if (choice.unlockCommander && run.ascension.commanderUnlocks.indexOf(choice.unlockCommander) < 0) {
            run.ascension.commanderUnlocks.push(choice.unlockCommander);
        }
    }

    function advanceChain(run, chainId, choiceId) {
        const chains = chainCfg().chains || {};
        const def = chains[chainId];
        if (!def || !run || !run.ascension) return null;
        const active = run.ascension.activeChains.find((c) => c.chainId === chainId);
        if (!active) return null;
        const nodeDef = (def.nodes || []).find((n) => n.id === active.currentNode);
        if (!nodeDef) return null;
        const choice = (nodeDef.choices || []).find((c) => c.id === choiceId);
        if (!choice) return null;

        const result = { rewards: choice.rewards, gold: choice.gold, corruption: choice.corruption };
        applyChoiceEffects(run, choice, result);

        if (choice.corruption && window.CurseSystem) {
            window.CurseSystem.addCorruption(run, choice.corruption);
        }
        if (choice.gold) run.gold = (run.gold || 0) + choice.gold;

        if (choice.next) {
            active.currentNode = choice.next;
            active.progress += 1;
        } else {
            run.ascension.activeChains = run.ascension.activeChains.filter((c) => c.chainId !== chainId);
            if (window.__partyMetaRef && window.__partyMetaRef.ascension) {
                const completed = window.__partyMetaRef.ascension.completedChains || [];
                if (completed.indexOf(chainId) < 0) completed.push(chainId);
                window.__partyMetaRef.ascension.completedChains = completed;
            }
            result.completed = true;
        }
        return result;
    }

    const DEFAULT_EVENT_ID_TITLES = {
        wounded_demon_hunter: '负伤的恶魔猎手',
        hunter_reward: '猎手的谢礼',
        hunter_finale: '复仇终局',
        ancient_barracks: '古代军营',
        wake_phantoms: '苏醒的幽灵',
        legion_aid: '军团援军',
        shop_robbery: '商铺劫案',
        assassin_pursuit: '刺客追击',
        merchant_boss: '商人首领',
        alchemist_notes: '炼金笔记',
        potion_success: '炼金成功',
        potion_explosion: '药剂爆炸',
        sell_notes: '出售笔记',
        alchemist_ghost: '炼金幽魂',
        defected_knight: '叛逃骑士',
        knight_joins: '骑士入队',
        knight_loot: '骑士遗物',
        demon_pursuit: '恶魔追杀',
        knight_betrayal: '骑士背叛',
        abyss_whisper: '深渊的低语',
        curse_gift: '诅咒馈赠',
        purify_unlock: '净化之路',
        seal_fail: '封印崩解',
        underground_arena: '地下竞技场',
        arena_trials: '竞技试炼',
        champion_duel: '冠军决斗',
        dragon_lair: '龙穴深处',
        steal_treasure: '盗取宝藏',
        dragon_battle: '与龙之战',
        dragon_pursuit: '龙息追杀'
    };

    const CHAIN_DISPLAY_NAMES = {
        demon_hunter_revenge: '恶魔猎手的复仇',
        lost_legion: '失落军团',
        merchant_revenge: '商人的复仇',
        alchemist_legacy: '炼金术士的遗产',
        traitor_knight: '背叛的骑士',
        abyss_whisper: '深渊的低语',
        arena_champion: '竞技场冠军',
        dragon_hoard: '龙的宝藏'
    };

    function eventIdTitleMap() {
        const cfg = chainCfg();
        return Object.assign({}, DEFAULT_EVENT_ID_TITLES, cfg.eventIdTitles || {});
    }

    function looksLikeInternalId(text) {
        return !!text && /^[a-z][a-z0-9_]*$/i.test(text) && text.indexOf('_') >= 0;
    }

    function resolveNodeTitle(node, def) {
        const titles = eventIdTitleMap();
        if (node && node.title && !looksLikeInternalId(node.title)) return node.title;
        if (node && node.eventId && titles[node.eventId]) return titles[node.eventId];
        return (def && def.name) || '遭遇';
    }

    function resolveEventDisplayTitle(ev) {
        if (!ev) return '遭遇';
        const titles = eventIdTitleMap();
        const raw = ev.title || '';
        if (raw && !looksLikeInternalId(raw)) return raw;
        if (ev.eventId && titles[ev.eventId]) return titles[ev.eventId];
        if (raw && titles[raw]) return titles[raw];
        if (ev.chainId && CHAIN_DISPLAY_NAMES[ev.chainId]) return CHAIN_DISPLAY_NAMES[ev.chainId];
        return (raw && !looksLikeInternalId(raw)) ? raw : '遭遇';
    }

    function resolveNodeDesc(node, def) {
        if (node && (node.narrative || node.description)) {
            return node.narrative || node.description;
        }
        return (def && def.description) || '';
    }

    function getActiveChainEvent(run) {
        if (!run || !run.ascension || !run.ascension.activeChains.length) return null;
        const active = run.ascension.activeChains[0];
        const def = (chainCfg().chains || {})[active.chainId];
        if (!def) return null;
        const node = (def.nodes || []).find((n) => n.id === active.currentNode);
        if (!node) return null;
        const title = resolveNodeTitle(node, def);
        const desc = resolveNodeDesc(node, def);
        return {
            id: 'chain_' + active.chainId + '_' + node.id,
            title: title,
            eventId: node.eventId,
            chainId: active.chainId,
            nodeId: node.id,
            desc: desc,
            description: desc,
            choices: (node.choices || []).map((c) => ({
                id: c.id,
                label: c.label,
                desc: c.narrative || c.description || c.desc || c.label,
                narrative: c.narrative || c.description || c.desc || '',
                effectHint: c.effectHint || '',
                resultHint: c.resultHint || c.label
            }))
        };
    }

    function resolveChainChoice(run, choiceId) {
        const ev = getActiveChainEvent(run);
        if (!ev) return { ok: false, message: '无效遭遇' };
        const result = advanceChain(run, ev.chainId, choiceId);
        if (!result) return { ok: false, message: '无效选项' };
        const choice = (ev.choices || []).find((c) => c.id === choiceId);
        const messages = [];
        if (choice && choice.resultHint && !looksLikeInternalId(choice.resultHint)) {
            messages.push(choice.resultHint);
        }
        return {
            ok: true,
            messages: messages,
            eventTitle: resolveEventDisplayTitle(ev),
            chainResult: result
        };
    }

    function getStandaloneEvent(eventId) {
        return (chainCfg().standaloneEvents || {})[eventId] || null;
    }

    function pickRandomStandalone(rng) {
        const pool = Object.keys(chainCfg().standaloneEvents || {});
        if (!pool.length) return null;
        const r = rng || Math.random;
        const id = pool[Math.floor(r() * pool.length)];
        return getStandaloneEvent(id);
    }

    function standaloneToCurrentEvent(def) {
        if (!def) return null;
        return {
            id: 'standalone_' + def.id,
            eventId: def.id,
            title: def.name,
            desc: def.narrative || def.description || def.name,
            description: def.narrative || def.description || def.name,
            choices: (def.choices || []).map((c) => ({
                id: c.id,
                label: c.label,
                desc: c.narrative || c.description || c.desc || c.label,
                narrative: c.narrative || c.description || c.desc || '',
                effectHint: c.effectHint || '',
                resultHint: c.label
            }))
        };
    }

    function resolveStandalone(run, eventId, choiceId) {
        const ev = getStandaloneEvent(eventId);
        if (!ev || !run) return null;
        const choice = (ev.choices || []).find((c) => c.id === choiceId);
        if (!choice) return null;
        if (choiceId === 'leave') return { ok: true, messages: ['你离开了'] };
        const RSS = window.RunStateSystem;
        if (choice.costHpPct && run.heroes) {
            run.heroes.forEach((h) => {
                if ((h.hp || 0) > 0) h.hp = Math.max(1, h.hp - Math.floor(h.maxHp * choice.costHpPct));
            });
        }
        if (choice.costGold && (run.gold || 0) < choice.costGold) {
            return { ok: false, message: '金币不足' };
        }
        if (choice.costGold) run.gold -= choice.costGold;
        if (choice.requiresClass) {
            const has = (run.heroes || []).some((h) => (h.hp || 0) > 0 && h.baseClass === choice.requiresClass);
            if (!has) return { ok: false, message: '需要 ' + choice.requiresClass + ' 职业' };
        }
        if (choice.trapChance && Math.random() < choice.trapChance) {
            run.heroes.forEach((h) => {
                if ((h.hp || 0) > 0) h.hp = Math.max(1, h.hp - Math.floor(h.maxHp * 0.15));
            });
            return { ok: true, messages: ['陷阱！受到 15% 生命伤害'] };
        }
        if (choice.purifyCorruption && window.CurseSystem) {
            run.ascension.corruption = Math.max(0, (run.ascension.corruption || 0) - choice.purifyCorruption);
        }
        if (choice.healPct) {
            run.heroes.forEach((h) => {
                if ((h.hp || 0) > 0) h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * choice.healPct));
            });
        }
        if (choice.reward === 'random_relic' && window.RelicSystem && RSS) {
            const rng = RSS.rngFromRun(run);
            const picks = window.RelicSystem.pickRelicChoices(rng, 1, run.relics, 'event', run);
            if (picks && picks[0]) RSS.addRelic(run, picks[0].id);
        }
        if (choice.reward === 'random_loot' && RSS) {
            run.gold = (run.gold || 0) + 20 + Math.floor(Math.random() * 30);
        }
        if (choice.action === 'shop') {
            run.phase = 'shop';
            return { ok: true, messages: ['流浪商人打开了商店'], openShop: true };
        }
        if (choice.action === 'start_chain' && choice.chainId) {
            startChain(run, choice.chainId);
        }
        applyChoiceEffects(run, choice, { ok: true });
        return { ok: true, choice: choice, messages: [choice.label || '完成'] };
    }

    function pickRandomChainForZone(zoneId) {
        const chains = chainCfg().chains || {};
        const keys = Object.keys(chains).filter((k) => {
            const z = chains[k].zone;
            return z === zoneId || z === 'any';
        });
        return keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;
    }

    function tryStartChainByTrigger(run, trigger, zoneId) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('eventChains')) return null;
        if (!run || !run.ascension) return null;
        if (run.ascension.activeChains.length >= maxConcurrent()) return null;
        const chains = chainCfg().chains || {};
        const candidates = Object.keys(chains).filter((k) => {
            const def = chains[k];
            const first = (def.nodes || [])[0];
            if (!first) return false;
            const t = first.trigger || def.trigger || 'event_node';
            if (t !== trigger) return false;
            const z = def.zone;
            if (z && z !== 'any' && zoneId && z !== zoneId) return false;
            if (run.ascension.activeChains.some((c) => c.chainId === k)) return false;
            return true;
        });
        if (!candidates.length) return null;
        const rng = window.RunStateSystem ? window.RunStateSystem.rngFromRun(run) : Math.random;
        const r = typeof rng === 'function' ? rng : Math.random;
        if (r() > 0.35) return null;
        const pick = candidates[Math.floor(r() * candidates.length)];
        return startChain(run, pick) ? pick : null;
    }

    function maybeStartChainOnEvent(run, zoneId) {
        return !!tryStartChainByTrigger(run, 'event_node', zoneId);
    }

    window.EventChainSystem = {
        chainCfg,
        onRunStart,
        startChain,
        advanceChain,
        getActiveChainEvent,
        resolveChainChoice,
        getStandaloneEvent,
        resolveStandalone,
        pickRandomStandalone,
        standaloneToCurrentEvent,
        pickRandomChainForZone,
        tryStartChainByTrigger,
        maybeStartChainOnEvent,
        maxConcurrent,
        looksLikeInternalId,
        resolveEventDisplayTitle,
        resolveNodeTitle,
        CHAIN_DISPLAY_NAMES
    };
})();
