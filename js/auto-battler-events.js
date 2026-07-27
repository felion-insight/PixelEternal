/**
 * 自走棋 Roguelike — 随机事件池与选项结算
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function rollRange(spec, rng) {
        const r = rng || Math.random;
        const min = spec.min != null ? spec.min : (spec.value != null ? spec.value : 0);
        const max = spec.max != null ? spec.max : min;
        if (min === max) return min;
        return min + Math.floor(r() * (max - min + 1));
    }

    function pickWeighted(items, rng) {
        const r = rng || Math.random;
        let total = 0;
        items.forEach((it) => { total += it.weight != null ? it.weight : 1; });
        let roll = r() * total;
        for (let i = 0; i < items.length; i++) {
            roll -= items[i].weight != null ? items[i].weight : 1;
            if (roll <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    function pickHero(run, rng, classHint) {
        const heroes = run.heroes || [];
        if (!heroes.length) return null;
        if (classHint) {
            const matched = heroes.filter((h) => h.baseClass === classHint);
            if (matched.length) return matched[Math.floor(rng() * matched.length)];
        }
        return heroes[Math.floor(rng() * heroes.length)];
    }

    function applyEffects(run, effects, rng, ctx) {
        const RSS = window.RunStateSystem;
        const messages = [];
        let pendingEquip = ctx.pendingEquip || null;

        (effects || []).forEach((eff) => {
            if (!eff || !eff.type) return;
            switch (eff.type) {
                case 'gold_add': {
                    const amt = rollRange(eff, rng);
                    run.gold += amt;
                    messages.push('获得 ' + amt + ' 金币');
                    break;
                }
                case 'gold_spend': {
                    const amt = rollRange(eff, rng);
                    run.gold = Math.max(0, run.gold - amt);
                    messages.push('失去 ' + amt + ' 金币');
                    break;
                }
                case 'exp_add': {
                    const amt = rollRange(eff, rng);
                    run.runExpEarned += amt;
                    messages.push('本局经验 +' + amt);
                    break;
                }
                case 'heal_percent': {
                    const pct = eff.value != null ? eff.value : 0.35;
                    run.heroes.forEach((h) => {
                        h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * pct));
                    });
                    messages.push('全队回复 ' + Math.round(pct * 100) + '% 生命');
                    break;
                }
                case 'heal_one_full': {
                    const hero = pickHero(run, rng, eff.class);
                    if (hero) {
                        hero.hp = hero.maxHp;
                        messages.push(hero.displayName + ' 生命全满');
                    }
                    break;
                }
                case 'damage_percent': {
                    const pct = eff.value != null ? eff.value : -0.2;
                    run.heroes.forEach((h) => {
                        h.hp = Math.max(1, Math.floor(h.hp * (1 + pct)));
                    });
                    messages.push('全队失去 ' + Math.round(Math.abs(pct) * 100) + '% 当前生命');
                    break;
                }
                case 'skill_loot': {
                    const hero = pickHero(run, rng, eff.class);
                    const cls = hero ? hero.baseClass : 'warrior';
                    const sk = RSS.pickSkillFromPool(rng, hero || { baseClass: cls, classData: { baseClass: cls }, level: 1 });
                    const add = RSS.addSkillToInventory(run, sk.id, 1);
                    pendingEquip = {
                        kind: 'skill',
                        skillId: sk.id,
                        merged: !!add.merged,
                        starUp: !!add.starUp,
                        stars: add.stars,
                        prevStars: add.prevStars,
                        heroId: add.heroId,
                        slotIndex: add.slotIndex,
                        inventoryIndex: add.inventoryIndex
                    };
                    messages.push(add.merged
                        ? '技能升星：「' + (sk.name || sk.id) + '」' + RSS.formatStarLabel(add.stars)
                        : '获得技能「' + (sk.name || sk.id) + '」');
                    break;
                }
                case 'gear_loot': {
                    const hero = pickHero(run, rng, eff.class);
                    const cls = hero ? hero.baseClass : 'warrior';
                    const gear = RSS.makeGearLoot(rng, eff.slot || null, cls);
                    run.inventoryGear.push(gear);
                    pendingEquip = { kind: 'gear', gear: gear };
                    messages.push('获得装备「' + (gear.name || gear.slot) + '」');
                    break;
                }
                case 'relic_add': {
                    const relics = window.RelicSystem.pickRelicChoices(rng, 1, run.relics || [], 'event', run);
                    if (relics[0] && RSS.addRelic(run, relics[0].id)) {
                        messages.push('获得遗物「' + relics[0].name + '」');
                    } else {
                        run.gold += 25;
                        messages.push('没有遗物了，改给 25 金币');
                    }
                    break;
                }
                case 'random': {
                    const outcome = pickWeighted(eff.outcomes || [], rng);
                    if (outcome && outcome.message) messages.push(outcome.message);
                    const sub = applyEffects(run, outcome && outcome.effects, rng, { pendingEquip: pendingEquip });
                    messages.push.apply(messages, sub.messages);
                    if (sub.pendingEquip) pendingEquip = sub.pendingEquip;
                    break;
                }
                default:
                    break;
            }
        });

        return { messages: messages, pendingEquip: pendingEquip };
    }

    function getEvents() {
        return cfg().events || [];
    }

    function pickEvent(run) {
        const rng = window.RunStateSystem.rngFromRun(run);
        const seen = run.eventHistory || [];
        const pool = getEvents().filter((ev) => !ev.oncePerRun || seen.indexOf(ev.id) < 0);
        if (!pool.length) return getEvents()[0] || null;
        const picked = pickWeighted(pool, rng);
        if (!run.eventHistory) run.eventHistory = [];
        if (picked && picked.id) run.eventHistory.push(picked.id);
        return picked;
    }

    function getCurrentEvent(run) {
        return run && run.currentEvent;
    }

    function canAffordChoice(run, choice) {
        if (!choice || !choice.costGold) return true;
        return (run.gold || 0) >= choice.costGold;
    }

    function resolveChoice(run, choiceId) {
        const ev = run.currentEvent;
        if (!ev) return { ok: false, message: '无效事件' };
        const choice = (ev.choices || []).find((c) => c.id === choiceId);
        if (!choice) return { ok: false, message: '无效选项' };

        if (choice.costGold && run.gold < choice.costGold) {
            return { ok: false, message: '金币不足（需要 ' + choice.costGold + '）' };
        }
        if (choice.costGold) run.gold -= choice.costGold;

        const rng = window.RunStateSystem.rngFromRun(run);
        const result = applyEffects(run, choice.effects, rng, {});
        const messages = result.messages.slice();
        if (choice.resultHint && messages.length === 0) messages.push(choice.resultHint);
        if (messages.length === 0 && (!choice.effects || !choice.effects.length)) {
            messages.push('离开了');
        }

        const eventTitle = window.EventChainSystem && window.EventChainSystem.resolveEventDisplayTitle
            ? window.EventChainSystem.resolveEventDisplayTitle(ev)
            : ev.title;
        return {
            ok: true,
            messages: messages,
            pendingEquip: result.pendingEquip,
            eventTitle: eventTitle
        };
    }

    window.AutoBattlerEvents = {
        getEvents,
        pickEvent,
        getCurrentEvent,
        canAffordChoice,
        resolveChoice
    };
})();
