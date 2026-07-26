/**
 * 局内遗物：队伍共享被动 + 技能/职业向改造（skillMutators）
 */
(function () {
    'use strict';

    const RARITY_WEIGHT = {
        common: 45,
        uncommon: 30,
        rare: 18,
        legendary: 7
    };

    const SOURCE_WEIGHT_MULT = {
        elite: { common: 1.25, uncommon: 1.15, rare: 0.75, legendary: 0.08 },
        boss: { common: 0.4, uncommon: 0.7, rare: 1.5, legendary: 2.4 },
        shop: { common: 1, uncommon: 1, rare: 1.1, legendary: 0.65 },
        event: { common: 1, uncommon: 1.1, rare: 1, legendary: 0.45 },
        default: { common: 1, uncommon: 1, rare: 1, legendary: 1 }
    };

    const BUILD_TAG_LABEL = {
        economy: '经济',
        wall: '铁壁',
        sustain: '续航',
        tempo: '节奏',
        backline: '后排',
        cleave: '顺劈',
        warrior: '战士',
        archer: '弓手',
        mage: '法师',
        assassin: '刺客',
        control: '控制',
        lifesteal: '吸血',
        execute: '斩杀',
        poison: '毒素',
        mark: '印记',
        aoe: '群体',
        chain: '连锁',
        range: '射程',
        burn: '灼烧'
    };

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function allRelics() {
        return cfg().relics || [];
    }

    function getRelicDef(id) {
        return allRelics().find((r) => r.id === id) || null;
    }

    function relicIconId(defOrId) {
        const def = typeof defOrId === 'string' ? getRelicDef(defOrId) : defOrId;
        if (!def) return typeof defOrId === 'string' ? defOrId : '';
        return def.iconId || def.id;
    }

    function softCap(run) {
        const n = (cfg().rewards || {}).relicSoftCap;
        let cap = n != null ? n : 16;
        if (run && run.ascension && window.CurseSystem) {
            (run.ascension.cursedRelicIds || []).forEach((rid) => {
                const def = window.CurseSystem.cursedRelics()[rid];
                const pos = def && (def.positive || (def.effects && def.effects.positive));
                if (pos && pos.relicCapBonus) cap += pos.relicCapBonus;
            });
        }
        return cap;
    }

    function atSoftCap(ownedIds, run) {
        return (ownedIds || []).length >= softCap(run);
    }

    function skillDefById(skillId) {
        const pool = cfg().skillPool || [];
        return pool.find((s) => s.id === skillId) || null;
    }

    function formatBuildTags(tags) {
        return (tags || []).map((t) => BUILD_TAG_LABEL[t] || t).filter(Boolean);
    }

    /** 遗物强化的技能名列表（供 UI） */
    function relicTargetSkillNames(defOrId) {
        const def = typeof defOrId === 'string' ? getRelicDef(defOrId) : defOrId;
        if (!def || !def.effects || !def.effects.skillMutators) return [];
        const names = [];
        const seen = new Set();
        def.effects.skillMutators.forEach((mut) => {
            const m = (mut && mut.match) || {};
            const ids = m.ids || (m.id ? [m.id] : []);
            ids.forEach((id) => {
                if (seen.has(id)) return;
                seen.add(id);
                const sk = skillDefById(id);
                names.push(sk ? sk.name : id);
            });
        });
        return names;
    }

    function collectRunBuildTags(run) {
        const tags = new Set();
        (run && run.relics || []).forEach((id) => {
            const def = getRelicDef(id);
            (def && def.buildTags || []).forEach((t) => tags.add(t));
        });
        (run && run.heroes || []).forEach((h) => {
            (h.skillSlots || []).forEach((entry) => {
                if (!entry) return;
                const sid = typeof entry === 'string' ? entry : entry.id;
                const sk = skillDefById(sid);
                if (!sk) return;
                (sk.classTags || []).forEach((t) => tags.add(t));
                const shape = inferSkillShape(sk);
                if (shape === 'aoe') tags.add('aoe');
                if (shape === 'chain') tags.add('chain');
                if ((sk.effects || []).some((e) => e && (e.type === 'dot' || e.type === 'stack_dot'))) {
                    tags.add('poison');
                }
                if ((sk.effects || []).some((e) => e && e.executeThreshold != null)) {
                    tags.add('execute');
                }
                if ((sk.effects || []).some((e) => e && e.type === 'mark')) {
                    tags.add('mark');
                }
            });
        });
        return tags;
    }

    function relicSynergyMult(item, ownedTags, source) {
        let mult = 1;
        const tags = item.buildTags || [];
        if (!tags.length || !ownedTags || !ownedTags.size) return mult;
        let hits = 0;
        tags.forEach((t) => {
            if (ownedTags.has(t)) hits += 1;
        });
        if (hits > 0) mult *= 1.25 + Math.min(0.35, hits * 0.12);
        // Boss 更偏向带 buildTags 的技能/职业件
        if (source === 'boss' && tags.length) mult *= 1.15;
        if (source === 'elite' && !tags.length) mult *= 1.1;
        return mult;
    }

    /**
     * @param {function} rng
     * @param {number} count
     * @param {string[]} ownedIds
     * @param {string} source
     * @param {object} [run] 用于构筑协同加权
     */
    function pickRelicChoices(rng, count, ownedIds, source, run) {
        const r = rng || Math.random;
        if (atSoftCap(ownedIds, run)) return [];
        const owned = new Set(ownedIds || []);
        const pool = allRelics().filter((x) => !owned.has(x.id));
        if (!pool.length) return [];
        const srcMult = SOURCE_WEIGHT_MULT[source] || SOURCE_WEIGHT_MULT.default;
        const ownedTags = collectRunBuildTags(run || null);
        const out = [];
        const bag = pool.slice();
        const n = Math.min(count || 3, bag.length);
        for (let i = 0; i < n; i++) {
            let total = 0;
            const weights = bag.map((item) => {
                const base = RARITY_WEIGHT[item.rarity] || 20;
                const m = srcMult[item.rarity] != null ? srcMult[item.rarity] : 1;
                const syn = relicSynergyMult(item, ownedTags, source);
                const w = Math.max(0.01, base * m * syn);
                total += w;
                return w;
            });
            let roll = r() * total;
            let idx = 0;
            for (; idx < bag.length; idx++) {
                roll -= weights[idx];
                if (roll <= 0) break;
            }
            if (idx >= bag.length) idx = bag.length - 1;
            out.push(bag.splice(idx, 1)[0]);
        }
        return out;
    }

    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function inferSkillShape(def) {
        if (!def) return 'single';
        const effects = def.effects || [];
        if (effects.some((e) => e && e.type === 'chain')) return 'chain';
        if (def.aoe || effects.some((e) => e && e.aoe)) return 'aoe';
        const hasDmg = effects.some((e) => e && (
            e.type === 'damage' || e.type === 'chain' || e.type === 'dot' ||
            e.type === 'dot_aoe' || e.type === 'stack_dot'
        ));
        if (!hasDmg && effects.length) return 'support';
        if (!hasDmg && !(def.damageMult > 0)) return 'support';
        return 'single';
    }

    function mutatorMatches(mut, def, shape) {
        const m = (mut && mut.match) || {};
        if (m.shape && m.shape !== shape) return false;
        if (m.notShape && m.notShape === shape) return false;
        if (m.id && def && m.id !== def.id) return false;
        if (m.ids && def && m.ids.indexOf(def.id) < 0) return false;
        if (m.classTag && def) {
            const tags = def.classTags || [];
            if (tags.indexOf(m.classTag) < 0) return false;
        }
        return true;
    }

    function scaleDamageFields(eff, mult) {
        if (!eff || mult == null || mult === 1) return;
        if (eff.mult != null) eff.mult *= mult;
        if (eff.pctOfAttack != null) eff.pctOfAttack *= mult;
    }

    function applySkillMutatorsToEffects(effects, def, mutators) {
        let list = deepClone(effects || []);
        const shape = inferSkillShape(def);
        (mutators || []).forEach((mut) => {
            if (!mutatorMatches(mut, def, shape)) return;
            const op = mut.mutate || {};
            if (op.replaceEffects && op.replaceEffects.length) {
                list = deepClone(op.replaceEffects);
            }
            if (op.forceAoe) {
                list.forEach((eff) => {
                    if (!eff) return;
                    if (eff.type === 'damage' || eff.type === 'stun' || eff.type === 'debuff' ||
                        eff.type === 'dot' || eff.type === 'stack_dot') {
                        eff.aoe = true;
                    }
                    if (op.damageMult != null) scaleDamageFields(eff, op.damageMult);
                });
                if (!list.some((e) => e && e.type === 'damage') && (def && def.damageMult > 0)) {
                    list.unshift({
                        type: 'damage',
                        mult: (def.damageMult || 1) * (op.damageMult != null ? op.damageMult : 1),
                        aoe: true
                    });
                }
            }
            if (op.addChainJumps) {
                let chain = list.find((e) => e && e.type === 'chain');
                if (chain) {
                    chain.jumps = (chain.jumps || 2) + (op.addChainJumps | 0);
                    if (op.damageMult != null) scaleDamageFields(chain, op.damageMult);
                } else {
                    const dmg = list.find((e) => e && e.type === 'damage');
                    const baseMult = dmg && dmg.mult != null ? dmg.mult : (def && def.damageMult) || 1.3;
                    const jumps = Math.max(2, 1 + (op.addChainJumps | 0));
                    const chainEff = {
                        type: 'chain',
                        mult: baseMult * (op.damageMult != null ? op.damageMult : 1),
                        jumps: jumps,
                        falloff: 0.88
                    };
                    if (dmg) {
                        const idx = list.indexOf(dmg);
                        list.splice(idx, 1, chainEff);
                    } else {
                        list.unshift(chainEff);
                    }
                }
            }
            if (op.damageMult != null && !op.forceAoe && !op.addChainJumps && !op.replaceEffects) {
                list.forEach((eff) => {
                    if (eff && (eff.type === 'damage' || eff.type === 'chain' ||
                        eff.type === 'dot' || eff.type === 'stack_dot')) {
                        scaleDamageFields(eff, op.damageMult);
                    }
                });
            }
            if (op.splashMult != null) {
                list.forEach((eff) => {
                    if (eff && (eff.type === 'damage' || eff.aoe)) {
                        eff.splashMult = (eff.splashMult != null ? eff.splashMult : 1) * op.splashMult;
                    }
                });
            }
            if (op.addLifestealPct) {
                list.forEach((eff) => {
                    if (eff && eff.type === 'damage') {
                        eff.lifestealPct = (eff.lifestealPct || 0) + op.addLifestealPct;
                    }
                });
            }
            if (op.executeBonus) {
                const th = op.executeBonus.threshold != null ? op.executeBonus.threshold : 0.3;
                const bonus = op.executeBonus.bonusMult != null ? op.executeBonus.bonusMult : 2.5;
                list.forEach((eff) => {
                    if (eff && eff.type === 'damage') {
                        if (eff.executeThreshold == null || th < eff.executeThreshold) {
                            eff.executeThreshold = th;
                        }
                        eff.executeBonusMult = Math.max(eff.executeBonusMult || 0, bonus);
                    }
                });
            }
            if (op.appendEffects && op.appendEffects.length) {
                list = list.concat(deepClone(op.appendEffects));
            }
        });
        return list;
    }

    function applySkillMutatorsToInstance(sk, def, mutators) {
        if (!sk) return sk;
        const shape = inferSkillShape(def);
        (mutators || []).forEach((mut) => {
            if (!mutatorMatches(mut, def, shape)) return;
            const op = mut.mutate || {};
            if (op.forceAoe || (op.replaceEffects && op.replaceEffects.some((e) => e && e.aoe))) {
                sk.aoe = true;
            }
            if (op.addChainJumps) sk.chainJumpBonus = (sk.chainJumpBonus || 0) + (op.addChainJumps | 0);
            if (op.rangeBonus) sk.range = (sk.range || (def && def.range) || 120) + op.rangeBonus;
            if (op.cooldownMult != null) {
                sk.cooldownMs = Math.floor((sk.cooldownMs || 5000) * op.cooldownMult);
            }
            if (op.cooldownFlatMs) {
                sk.cooldownMs = Math.max(800, (sk.cooldownMs || 5000) + (op.cooldownFlatMs | 0));
            }
        });
        return sk;
    }

    function aggregateRelicEffects(relicEntries) {
        const agg = {
            attackMult: 1,
            maxHpMult: 1,
            flatDefense: 0,
            critChance: 0,
            cooldownMult: 1,
            skillDamageMult: 1,
            expMult: 1,
            onHitHeal: 0,
            goldMult: 1,
            backRowDamageMult: 1,
            frontRowDamageTakenMult: 1,
            startSkillReady: false,
            startAllSkillsReady: false,
            suppressStartSkillReady: false,
            basicIntervalMult: 1,
            onKillHeal: 0,
            executeBelow: 0,
            executeDamageMult: 1,
            belowHpRatio: 0,
            belowHpDamageMult: 1,
            skillMutators: [],
            reduceGearDrop: false,
            extraAttackChance: 0,
            onHitDot: null,
            moveSpeedMult: 1,
            armorBreak: null,
            skillRangeMult: 1,
            battleStartHealPct: 0,
            thornsPct: 0,
            lowHpAttackMult: null,
            meleeOnHit: null,
            skillChainChance: null,
            dodgeNextCrit: false,
            cheatDeath: null,
            killGoldBonus: 0,
            skillExpMult: 1,
            battleStartBuff: null,
            armorPenPct: 0,
            reviveOnDeath: null,
            disableBasicAttack: false,
            lifesteal: 0,
            battleStartMirror: null,
            basicAttackIntervalMult: 1,
            phoenixRevive: null,
            chainLightning: null
        };
        const CEB = window.CombatEffectsBridge;
        (relicEntries || []).forEach((entry) => {
            const id = typeof entry === 'string' ? entry : entry.id;
            const def = getRelicDef(id);
            if (!def || !def.effects) return;
            const e = CEB && CEB.flattenRelicEntry ? CEB.flattenRelicEntry(def) : def.effects;
            if (e.attackMult) agg.attackMult *= e.attackMult;
            if (e.maxHpMult) agg.maxHpMult *= e.maxHpMult;
            if (e.flatDefense) agg.flatDefense += e.flatDefense;
            if (e.critChance) agg.critChance += e.critChance;
            if (e.cooldownMult) agg.cooldownMult *= e.cooldownMult;
            if (e.skillDamageMult) agg.skillDamageMult *= e.skillDamageMult;
            if (e.expMult) agg.expMult *= e.expMult;
            if (e.skillExpMult) agg.expMult *= e.skillExpMult;
            if (e.onHitHeal) agg.onHitHeal += e.onHitHeal;
            if (e.goldMult) agg.goldMult *= e.goldMult;
            if (e.killGoldBonus) agg.killGoldBonus = (agg.killGoldBonus || 0) + e.killGoldBonus;
            if (e.backRowDamageMult) agg.backRowDamageMult *= e.backRowDamageMult;
            if (e.frontRowDamageTakenMult) agg.frontRowDamageTakenMult *= e.frontRowDamageTakenMult;
            if (e.startSkillReady) agg.startSkillReady = true;
            if (e.startAllSkillsReady) agg.startAllSkillsReady = true;
            if (e.suppressStartSkillReady) agg.suppressStartSkillReady = true;
            if (e.basicIntervalMult) agg.basicIntervalMult *= e.basicIntervalMult;
            if (e.basicAttackIntervalMult != null) {
                agg.basicIntervalMult *= e.basicAttackIntervalMult === 0 ? 0.12 : e.basicAttackIntervalMult;
            }
            if (e.onKillHeal) agg.onKillHeal += e.onKillHeal;
            if (e.executeBelow) agg.executeBelow = Math.max(agg.executeBelow, e.executeBelow);
            if (e.executeDamageMult) agg.executeDamageMult *= e.executeDamageMult;
            if (e.belowHpRatio) agg.belowHpRatio = Math.max(agg.belowHpRatio, e.belowHpRatio);
            if (e.belowHpDamageMult) agg.belowHpDamageMult *= e.belowHpDamageMult;
            if (e.reduceGearDrop) agg.reduceGearDrop = true;
            if (e.extraAttackChance) agg.extraAttackChance = Math.max(agg.extraAttackChance, e.extraAttackChance);
            if (e.onHitDot) agg.onHitDot = e.onHitDot;
            if (e.moveSpeedMult) agg.moveSpeedMult *= e.moveSpeedMult;
            if (e.armorBreak) agg.armorBreak = e.armorBreak;
            if (e.skillRangeMult) agg.skillRangeMult *= e.skillRangeMult;
            if (e.battleStartHealPct) agg.battleStartHealPct = Math.max(agg.battleStartHealPct, e.battleStartHealPct);
            if (e.thornsPct) agg.thornsPct = Math.max(agg.thornsPct, e.thornsPct);
            if (e.lowHpAttackMult) agg.lowHpAttackMult = e.lowHpAttackMult;
            if (e.meleeOnHit) agg.meleeOnHit = e.meleeOnHit;
            if (e.skillChainChance) agg.skillChainChance = e.skillChainChance;
            if (e.dodgeNextCrit) agg.dodgeNextCrit = true;
            if (e.cheatDeath) agg.cheatDeath = e.cheatDeath;
            if (e.battleStartBuff) agg.battleStartBuff = e.battleStartBuff;
            if (e.armorPenPct) agg.armorPenPct = Math.max(agg.armorPenPct, e.armorPenPct);
            if (e.reviveOnDeath) agg.reviveOnDeath = e.reviveOnDeath;
            if (e.disableBasicAttack) agg.disableBasicAttack = true;
            if (e.lifesteal) agg.lifesteal = e.lifesteal;
            if (e.battleStartMirror) agg.battleStartMirror = e.battleStartMirror;
            if (e.phoenixRevive) agg.phoenixRevive = e.phoenixRevive;
            if (e.chainLightning) agg.chainLightning = e.chainLightning;
            if (e.randomElementOnSkill) agg.randomElementOnSkill = e.randomElementOnSkill;
            if (e.onHitSlow) agg.onHitSlow = e.onHitSlow;
            if (e.defenseMult) { /* curse positive handled in buildBattleModifiers */ }
            if (e.attackSpeedMult) agg.basicIntervalMult /= e.attackSpeedMult;
            if (e.skillMutators && e.skillMutators.length) {
                agg.skillMutators = agg.skillMutators.concat(e.skillMutators);
            }
        });
        return agg;
    }

    window.RelicSystem = {
        allRelics,
        getRelicDef,
        relicIconId,
        softCap,
        atSoftCap,
        pickRelicChoices,
        aggregateRelicEffects,
        inferSkillShape,
        applySkillMutatorsToEffects,
        applySkillMutatorsToInstance,
        formatBuildTags,
        relicTargetSkillNames,
        collectRunBuildTags,
        BUILD_TAG_LABEL
    };
})();
