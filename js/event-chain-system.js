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
        if (choice.costHpPct && run.heroes) {
            run.heroes.forEach((h) => {
                h.hp = Math.max(1, h.hp - Math.floor(h.maxHp * choice.costHpPct));
            });
        }
        if (choice.rewards && choice.rewards.permanentBuff && run.heroes) {
            const h = run.heroes[Math.floor(Math.random() * run.heroes.length)];
            if (h) h.maxHp = Math.floor(h.maxHp * 1.1);
        }
        if (choice.rewards && choice.rewards.curseRelic && window.CurseSystem) {
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
        if (choice.forcedCombat) run.ascension.pendingForcedCombat = choice.forcedCombat;
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

    function getActiveChainEvent(run) {
        if (!run || !run.ascension || !run.ascension.activeChains.length) return null;
        const active = run.ascension.activeChains[0];
        const def = (chainCfg().chains || {})[active.chainId];
        if (!def) return null;
        const node = (def.nodes || []).find((n) => n.id === active.currentNode);
        if (!node) return null;
        return {
            id: 'chain_' + active.chainId + '_' + node.id,
            title: def.name,
            chainId: active.chainId,
            nodeId: node.id,
            desc: node.description || node.eventId || def.description || '',
            description: node.description || node.eventId || def.description || '',
            choices: (node.choices || []).map((c) => ({
                id: c.id,
                label: c.label,
                desc: c.label,
                resultHint: c.label
            }))
        };
    }

    function resolveChainChoice(run, choiceId) {
        const ev = getActiveChainEvent(run);
        if (!ev) return { ok: false, message: '无活跃事件链' };
        const result = advanceChain(run, ev.chainId, choiceId);
        if (!result) return { ok: false, message: '无效选项' };
        return { ok: true, messages: [result.completed ? '事件链完成' : '事件链推进'], chainResult: result };
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
            desc: def.description || def.name,
            description: def.description || def.name,
            choices: (def.choices || []).map((c) => ({
                id: c.id,
                label: c.label,
                desc: c.label,
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

    function maybeStartChainOnEvent(run, zoneId) {
        if (!window.AscensionHub || !window.AscensionHub.isEnabled('eventChains')) return false;
        if (run.ascension.activeChains.length >= maxConcurrent()) return false;
        const id = pickRandomChainForZone(zoneId || 'any');
        if (!id || Math.random() > 0.35) return false;
        return startChain(run, id);
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
        maybeStartChainOnEvent,
        maxConcurrent
    };
})();
