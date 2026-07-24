/**

 * 单局 Run 状态：技能槽、装备、遗物、金币、节点进度

 * 技能实例：{ id, stars }；基础职业按等级扩大掉落技能池（开局仅起始技），转职后切换独立技能池；重复技能自动升星

 */

(function () {

    'use strict';



    const EQUIP_SLOTS = ['weapon', 'head', 'chest', 'hands', 'feet'];



    function cfg() {

        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||

            window.AUTO_BATTLER_CONFIG || {};

    }



    function skillProgressionCfg() {

        return cfg().skillProgression || {};

    }



    function emptyEquipment() {

        const o = {};

        (cfg().equipmentSlots || EQUIP_SLOTS).forEach((s) => { o[s] = null; });

        return o;

    }



    function makeSkillEntry(id, stars) {

        return { id: id, stars: Math.max(1, stars | 0 || 1) };

    }



    function normalizeSkillEntry(entry) {

        if (!entry) return null;

        if (typeof entry === 'string') return makeSkillEntry(entry, 1);

        if (typeof entry === 'object' && entry.id) {

            return makeSkillEntry(entry.id, entry.stars || 1);

        }

        return null;

    }



    function skillEntryId(entry) {

        const e = normalizeSkillEntry(entry);

        return e ? e.id : (typeof entry === 'string' ? entry : null);

    }



    function getHeroActiveClassId(hero) {

        const PMS = window.PartyMetaSystem;

        if (PMS && PMS.getActiveClassIdForHero) {

            return PMS.getActiveClassIdForHero(hero);

        }

        const cd = (hero && hero.classData) || {};

        return cd.secondAdvancement || cd.firstAdvancement || cd.baseClass || (hero && hero.baseClass);

    }



    function poolUnlockTiersForClass(baseClass) {

        const c = cfg();

        const tiers = c.baseSkillPoolUnlockByClass || c.baseSkillUnlockByClass || {};

        return tiers[baseClass] || [];

    }



    function normalizePoolUnlockTier(entry) {

        if (!entry) return null;

        if (Array.isArray(entry.skillIds) && entry.skillIds.length) {

            return { level: entry.level || 1, skillIds: entry.skillIds.slice() };

        }

        if (entry.skillId) {

            return { level: entry.level || 1, skillIds: [entry.skillId] };

        }

        return null;

    }



    function effectiveHeroLevel(hero) {

        return (hero && hero.level || 1) + (hero && hero.runLevel || 0);

    }



    function getLevelUnlockedSkillIds(hero) {

        const tiers = poolUnlockTiersForClass(hero.baseClass);

        const level = effectiveHeroLevel(hero);

        const ids = new Set();

        tiers.forEach((raw) => {

            const tier = normalizePoolUnlockTier(raw);

            if (tier && level >= tier.level) {

                tier.skillIds.forEach((id) => ids.add(id));

            }

        });

        const PMS = window.PartyMetaSystem;

        if (PMS && PMS.getStartingActiveSkillId) {

            ids.add(PMS.getStartingActiveSkillId(hero));

        }

        return ids;

    }



    function getLevelUnlockedSkills(hero) {

        const tiers = poolUnlockTiersForClass(hero.baseClass);

        const level = effectiveHeroLevel(hero);

        const result = [];

        tiers.forEach((raw) => {

            const tier = normalizePoolUnlockTier(raw);

            if (tier && level >= tier.level) {

                tier.skillIds.forEach((skillId) => {

                    result.push({ level: tier.level, skillId: skillId });

                });

            }

        });

        return result;

    }



    function buildInitialSkillSlots(metaHero) {

        const slots = [null, null, null, null];

        const PMS = window.PartyMetaSystem;

        slots[0] = makeSkillEntry(PMS.getStartingActiveSkillId(metaHero), 1);

        return slots;

    }



    function createHeroRunState(metaHero) {

        const PMS = window.PartyMetaSystem;

        return {

            heroId: metaHero.baseClass,

            baseClass: metaHero.baseClass,

            displayName: metaHero.displayName,

            level: metaHero.level,

            runLevel: 0,

            classData: JSON.parse(JSON.stringify(metaHero.classData || { baseClass: metaHero.baseClass })),

            skillSlots: buildInitialSkillSlots(metaHero),

            basicAttackId: PMS.getBasicAttackId(metaHero),

            equipment: emptyEquipment(),

            hp: 0,

            maxHp: 0,

            boardCol: -1,

            boardRow: -1

        };

    }



    function createRunState(partyMeta, seed) {

        const heroes = (partyMeta.heroes || []).map((h) => createHeroRunState(h));

        heroes.forEach((h, i) => {

            if (h.baseClass === 'warrior') { h.boardCol = 1; h.boardRow = 0; }

            else if (h.baseClass === 'assassin') { h.boardCol = 2; h.boardRow = 0; }

            else if (h.baseClass === 'archer') { h.boardCol = 1; h.boardRow = 2; }

            else if (h.baseClass === 'mage') { h.boardCol = 2; h.boardRow = 2; }

            else { h.boardCol = i % 4; h.boardRow = 1; }

        });

        return {

            seed: seed || (Date.now() & 0x7fffffff),

            gold: 0,

            runExpEarned: 0,

            inRunExpPool: 0,

            skillsGainedThisRun: 0,

            gearGainedThisRun: 0,

            restResolved: false,

            relics: [],

            pendingLoot: [],

            inventorySkills: [],

            inventoryGear: [],

            heroes: heroes,

            map: null,

            currentNodeId: null,

            path: [],

            finished: false,

            victory: false,

            phase: 'map'

        };

    }



    function mulberry32(a) {

        return function () {

            let t = a += 0x6D2B79F5;

            t = Math.imul(t ^ t >>> 15, t | 1);

            t ^= t + Math.imul(t ^ t >>> 7, t | 61);

            return ((t ^ t >>> 14) >>> 0) / 4294967296;

        };

    }



    function rngFromRun(run) {

        if (!run._rng) run._rng = mulberry32(run.seed >>> 0);

        return run._rng;

    }



    const CLASS_NAMES = {

        warrior: '战士', archer: '弓箭手', mage: '法师', assassin: '刺客', generic: '通用'

    };



    function findHero(run, heroId) {

        return (run.heroes || []).find((h) => h.heroId === heroId || h.baseClass === heroId);

    }



    function skillDefById(skillId) {

        const pool = cfg().skillPool || [];

        return pool.find((s) => s.id === skillId) || null;

    }



    function getSkillPoolForHero(hero) {

        if (!hero) return [];

        const activeId = getHeroActiveClassId(hero);

        const advPools = cfg().advancementSkillPools || {};

        const advIds = advPools[activeId];

        if (advIds && advIds.length) {

            return advIds.map((id) => skillDefById(id)).filter(Boolean);

        }

        const unlockedIds = getLevelUnlockedSkillIds(hero);

        const pool = cfg().skillPool || [];

        return pool.filter((s) => {

            if (!unlockedIds.has(s.id)) return false;

            const tags = s.classTags || [];

            return tags.includes(hero.baseClass) || tags.includes('generic');

        });

    }



    function getStarScaling(stars) {

        const sc = skillProgressionCfg();

        const maxStars = sc.maxStars || 5;

        const s = Math.min(maxStars, Math.max(1, stars | 0 || 1));

        const bonus = s - 1;

        const dmgPer = sc.starDamageMultPerStar != null ? sc.starDamageMultPerStar : 0.12;

        const cdPer = sc.starCooldownMultPerStar != null ? sc.starCooldownMultPerStar : 0.04;

        return {

            stars: s,

            damageMult: 1 + bonus * dmgPer,

            cooldownMult: Math.max(0.55, 1 - bonus * cdPer),

            chainJumpBonus: s >= (sc.chainJumpBonusAtStar || 3) ? 1 : 0,

            lifestealBonus: s >= (sc.lifestealBonusAtStar || 5)

                ? (sc.lifestealBonusPct || 0.08) : 0

        };

    }



    function formatStarLabel(stars) {

        const s = Math.max(1, stars | 0 || 1);

        return '★'.repeat(s) + '☆'.repeat(Math.max(0, (skillProgressionCfg().maxStars || 5) - s));

    }



    function heroHasSkillEquipped(hero, skillId) {

        return (hero && hero.skillSlots || []).some((s) => skillEntryId(s) === skillId);

    }



    function canHeroUseSkill(hero, skillId) {

        if (!hero || !skillId) return false;

        if (heroHasSkillEquipped(hero, skillId)) return true;

        const pool = getSkillPoolForHero(hero);

        return pool.some((s) => s.id === skillId);

    }



    function canHeroWearGear(hero, gear) {

        if (!hero || !gear) return false;

        const tags = gear.classTags || [];

        if (!tags.length || tags.includes('generic')) return true;

        return tags.includes(hero.baseClass);

    }



    function getEligibleHeroesForSkill(run, skillId) {

        return (run && run.heroes || []).filter((h) => canHeroUseSkill(h, skillId));

    }



    function getEligibleHeroesForGear(run, gear) {

        return (run && run.heroes || []).filter((h) => canHeroWearGear(h, gear));

    }



    function formatClassTags(tags) {

        return (tags || []).map((t) => CLASS_NAMES[t] || t).join('、') || '通用';

    }



    function findInventorySkillIndex(run, skillId) {

        return (run.inventorySkills || []).findIndex((s) => skillEntryId(s) === skillId);

    }



    function tryAutoMergeSkill(run, skillId) {

        const maxStars = skillProgressionCfg().maxStars || 5;

        for (const hero of run.heroes || []) {

            for (let i = 0; i < 4; i++) {

                const slot = normalizeSkillEntry(hero.skillSlots[i]);

                if (slot && slot.id === skillId && slot.stars < maxStars) {

                    slot.stars = Math.min(maxStars, slot.stars + 1);

                    hero.skillSlots[i] = slot;

                    return {

                        ok: true, merged: true, starUp: true,

                        heroId: hero.heroId, slotIndex: i, stars: slot.stars,

                        prevStars: slot.stars - 1, skillId: skillId

                    };

                }

            }

        }

        const invIdx = findInventorySkillIndex(run, skillId);

        if (invIdx >= 0) {

            const inv = normalizeSkillEntry(run.inventorySkills[invIdx]);

            if (inv && inv.stars < maxStars) {

                inv.stars = Math.min(maxStars, inv.stars + 1);

                run.inventorySkills[invIdx] = inv;

                return {

                    ok: true, merged: true, starUp: true,

                    inventoryIndex: invIdx, stars: inv.stars,

                    prevStars: inv.stars - 1, skillId: skillId

                };

            }

        }

        return { ok: true, merged: false };

    }



    function addSkillToInventory(run, skillId, stars) {

        if (!run || !skillId) return { ok: false, message: '无效技能' };

        const merge = tryAutoMergeSkill(run, skillId);

        if (merge.merged) return merge;

        const entry = makeSkillEntry(skillId, stars || 1);

        run.inventorySkills.push(entry);

        return { ok: true, merged: false, entry: entry, skillId: skillId, stars: entry.stars };

    }



    function equipSkill(run, heroId, skillIdOrEntry, slotIndex) {

        const hero = findHero(run, heroId);

        const skillId = skillEntryId(skillIdOrEntry) || skillIdOrEntry;

        if (!hero || !skillId) return { ok: false, message: '无效' };

        if (!canHeroUseSkill(hero, skillId)) {

            return { ok: false, message: '该角色无法学习此技能（职业/转职池不匹配）' };

        }

        const slots = hero.skillSlots;

        if (slotIndex == null) {

            slotIndex = slots.findIndex((s) => !s);

            if (slotIndex < 0) return { ok: false, message: '技能槽已满' };

        }

        if (slotIndex < 0 || slotIndex > 3) return { ok: false, message: '槽位无效' };



        let entry = normalizeSkillEntry(skillIdOrEntry);

        const invIdx = findInventorySkillIndex(run, skillId);

        if (invIdx >= 0) {

            entry = normalizeSkillEntry(run.inventorySkills.splice(invIdx, 1)[0]);

        }

        if (!entry) entry = makeSkillEntry(skillId, 1);



        const old = normalizeSkillEntry(slots[slotIndex]);

        if (old) run.inventorySkills.push(old);

        slots[slotIndex] = entry;

        return { ok: true };

    }



    function equipGear(run, heroId, gear) {

        const hero = findHero(run, heroId);

        if (!hero || !gear || !gear.slot) return { ok: false, message: '无效装备' };

        if (!canHeroWearGear(hero, gear)) {

            return { ok: false, message: '该角色无法穿戴（职业：' + formatClassTags(gear.classTags) + '）' };

        }

        const slot = gear.slot;

        if (!(slot in hero.equipment)) return { ok: false, message: '无此槽位' };

        const invIdx = run.inventoryGear.findIndex((g) => g.uid === gear.uid);

        if (invIdx >= 0) run.inventoryGear.splice(invIdx, 1);

        const old = hero.equipment[slot];

        if (old) run.inventoryGear.push(old);

        hero.equipment[slot] = gear;

        return { ok: true };

    }



    function unequipSkill(run, heroId, slotIndex) {

        const hero = findHero(run, heroId);

        if (!hero || slotIndex == null || slotIndex < 0 || slotIndex > 3) return { ok: false, message: '无效' };

        const old = normalizeSkillEntry(hero.skillSlots[slotIndex]);

        if (!old) return { ok: false, message: '空槽' };

        hero.skillSlots[slotIndex] = null;

        run.inventorySkills.push(old);

        return { ok: true, skillId: old.id, entry: old };

    }



    function unequipGear(run, heroId, slot) {

        const hero = findHero(run, heroId);

        if (!hero || !slot || !(slot in hero.equipment)) return { ok: false, message: '无效' };

        const old = hero.equipment[slot];

        if (!old) return { ok: false, message: '空槽' };

        hero.equipment[slot] = null;

        run.inventoryGear.push(old);

        return { ok: true, gear: old };

    }



    function addRelic(run, relicId) {

        if (!relicId || !run) return false;

        if ((run.relics || []).includes(relicId)) return false;

        const RS = window.RelicSystem;

        if (RS && RS.atSoftCap && RS.atSoftCap(run.relics)) return false;

        run.relics.push(relicId);

        return true;

    }



    function clearRunLoadoutOnEnd(run) {

        run.relics = [];

        run.inventorySkills = [];

        run.inventoryGear = [];

        run.pendingLoot = [];

        run.gold = 0;

        (run.heroes || []).forEach((h) => {

            h.equipment = emptyEquipment();

            h.skillSlots = [null, null, null, null];

        });

    }



    function makeSkillLoot(skillId, stars) {

        const def = skillDefById(skillId) || { id: skillId, name: skillId };

        const scale = getStarScaling(stars || 1);

        return {

            type: 'skill',

            id: def.id,

            name: def.name || def.id,

            classTags: def.classTags || [],

            damageMult: (def.damageMult || 1.5) * scale.damageMult,

            cooldownMs: Math.floor((def.cooldownMs || 5000) * scale.cooldownMult),

            range: def.range || 60,

            aoe: !!def.aoe,

            stars: scale.stars,

            description: def.description || ''

        };

    }



    function makeGearLoot(rng, preferSlot, preferClass) {

        const slots = cfg().equipmentSlots || EQUIP_SLOTS;

        const r = rng || Math.random;

        const rewards = cfg().rewards || {};

        const gearLoot = cfg().gearLoot || {};

        const weaponShare = rewards.weaponShare || 0.35;

        let slot = preferSlot;

        if (!slot) {

            slot = r() < weaponShare ? 'weapon' : slots.filter((s) => s !== 'weapon')[Math.floor(r() * 4)] || 'chest';

        }

        const rarityRoll = r();

        let rarity = 'common';

        if (rarityRoll > 0.92) rarity = 'legendary';

        else if (rarityRoll > 0.75) rarity = 'rare';

        else if (rarityRoll > 0.45) rarity = 'uncommon';

        const rarityMult = (gearLoot.rarityStatMult && gearLoot.rarityStatMult[rarity]) || 1;

        let atk = slot === 'weapon' ? 4 + Math.floor(r() * 10) : Math.floor(r() * 3);

        let def = slot === 'weapon' ? Math.floor(r() * 2) : 2 + Math.floor(r() * 6);

        let hp = slot === 'weapon' ? 0 : 8 + Math.floor(r() * 20);

        atk = Math.max(0, Math.round(atk * rarityMult));

        def = Math.max(0, Math.round(def * rarityMult));

        hp = Math.max(0, Math.round(hp * rarityMult));

        const classes = ['warrior', 'archer', 'mage', 'assassin'];

        const namesByClass = {

            warrior: {

                weapon: ['破魔刃', '钢铁巨剑', '塔盾斧'],

                head: ['守望盔', '战痕面甲'],

                chest: ['铁甲', '重铠胸甲'],

                hands: ['握力手套', '铁拳护手'],

                feet: ['磐石履', '战靴']

            },

            archer: {

                weapon: ['疾风弓', '猎手长弓', '穿云弩'],

                head: ['游侠帽', '鹰眼罩'],

                chest: ['皮衣', '猎手背心'],

                hands: ['射指手套', '皮护腕'],

                feet: ['疾行靴', '轻步鞋']

            },

            mage: {

                weapon: ['星火杖', '奥术书', '水晶法杖'],

                head: ['贤者帽', '星纹头环'],

                chest: ['法袍', '星纱长袍'],

                hands: ['符文护手', '奥术手套'],

                feet: ['星界履', '浮空靴']

            },

            assassin: {

                weapon: ['暗牙匕', '影刃', '毒牙短刀'],

                head: ['影罩', '夜行面巾'],

                chest: ['影衣', '潜行皮甲'],

                hands: ['毒刺手套', '暗影护手'],

                feet: ['无声靴', '影步鞋']

            }

        };

        let gearClass = preferClass && classes.includes(preferClass) ? preferClass : classes[Math.floor(r() * 4)];

        let classTags;

        if (slot === 'weapon') {

            classTags = [gearClass];

        } else if (r() < 0.12) {

            classTags = ['generic'];

            gearClass = 'generic';

        } else {

            classTags = [gearClass];

        }

        const bag = (namesByClass[gearClass] && namesByClass[gearClass][slot])

            || namesByClass.warrior[slot]

            || ['遗物碎片'];

        const name = bag[Math.floor(r() * bag.length)];

        let skillDamageMult = slot === 'weapon' && r() > 0.5 ? 1.08 + r() * 0.12 : 1;

        let critChance = 0;

        let cooldownMult = 1;

        let onHitHeal = 0;

        const affixLines = [];

        const affixPool = gearLoot.affixes || [];

        const countByRarity = gearLoot.affixCountByRarity || {

            common: [0, 0], uncommon: [0, 1], rare: [1, 2], legendary: [1, 2]

        };

        const countRange = countByRarity[rarity] || [0, 1];

        const affixCount = countRange[0] + Math.floor(r() * (countRange[1] - countRange[0] + 1));

        const bagAffix = affixPool.slice();

        for (let i = 0; i < affixCount && bagAffix.length; i++) {

            const idx = Math.floor(r() * bagAffix.length);

            const aff = bagAffix.splice(idx, 1)[0];

            if (!aff) break;

            const lo = aff.min != null ? aff.min : 0;

            const hi = aff.max != null ? aff.max : lo;

            let val = lo + r() * (hi - lo);

            if (aff.stat === 'onHitHeal') val = Math.round(val);

            else if (aff.stat === 'critChance') val = Math.round(val * 1000) / 1000;

            else if (aff.stat === 'cooldownMult' || aff.stat === 'skillDamageMult') {
                val = Math.round(val * 100) / 100;
            }

            if (aff.stat === 'critChance') critChance += val;

            else if (aff.stat === 'cooldownMult') cooldownMult *= val;

            else if (aff.stat === 'onHitHeal') onHitHeal += val;

            else if (aff.stat === 'skillDamageMult') skillDamageMult *= val;

            let label = aff.name || aff.id || aff.stat;

            if (aff.stat === 'critChance') label += ' +' + Math.round(val * 100) + '%';

            else if (aff.stat === 'cooldownMult') label += ' ×' + val.toFixed(2);

            else if (aff.stat === 'onHitHeal') label += ' +' + val;

            else if (aff.stat === 'skillDamageMult') label += ' ×' + val.toFixed(2);

            affixLines.push(label);

        }

        return {

            type: 'gear',

            uid: 'g_' + Date.now().toString(36) + '_' + Math.floor(r() * 1e6),

            slot: slot,

            name: name,

            rarity: rarity,

            classTags: classTags,

            attack: atk,

            defense: def,

            maxHp: hp,

            skillDamageMult: skillDamageMult,

            critChance: critChance,

            cooldownMult: cooldownMult,

            onHitHeal: onHitHeal,

            affixLines: affixLines

        };

    }



    function pickSkillFromPool(rng, heroOrClass) {

        const hero = typeof heroOrClass === 'object'

            ? heroOrClass

            : { baseClass: heroOrClass, classData: { baseClass: heroOrClass }, level: 1 };

        const bag = getSkillPoolForHero(hero);

        const r = rng || Math.random;

        const pool = bag.length ? bag : (cfg().skillPool || []);

        if (!pool.length) return { id: 'shield_slam', name: '盾击' };

        return pool[Math.floor(r() * pool.length)];

    }



    function collectEquippedSkillIds(run) {

        const ids = [];

        (run && run.heroes || []).forEach((h) => {

            (h.skillSlots || []).forEach((entry) => {

                if (!entry) return;

                ids.push(typeof entry === 'string' ? entry : entry.id);

            });

        });

        return ids;

    }



    /** 偏向已装构筑：同职/同已装技能池优先 */
    function pickSynergySkill(run, rng) {

        const r = rng || Math.random;

        const equipped = collectEquippedSkillIds(run);

        const heroes = (run && run.heroes) || [];

        if (equipped.length && heroes.length) {

            const sid = equipped[Math.floor(r() * equipped.length)];

            const def = skillDefById(sid);

            const tag = (def && def.classTags && def.classTags[0]) || null;

            const hero = tag

                ? heroes.find((h) => h.baseClass === tag) || heroes[Math.floor(r() * heroes.length)]

                : heroes[Math.floor(r() * heroes.length)];

            const pool = getSkillPoolForHero(hero);

            if (pool.length) {

                // 优先同职池内与已装不同的技能，保证「跟构筑」
                const prefer = pool.filter((s) => equipped.indexOf(s.id) < 0);

                const bag = prefer.length ? prefer : pool;

                return bag[Math.floor(r() * bag.length)];

            }

        }

        const hero = heroes[Math.floor(r() * Math.max(1, heroes.length))] || { baseClass: 'warrior', level: 1 };

        return pickSkillFromPool(r, hero);

    }



    function skillBudgetReached(run) {

        const range = (cfg().rewards || {}).skillPerRunBudget || [14, 20];

        const cap = range[1] != null ? range[1] : 20;

        return (run.skillsGainedThisRun || 0) >= cap;

    }



    function gearBudgetReached(run) {

        const range = (cfg().rewards || {}).gearPerRunBudget || [14, 20];

        const cap = range[1] != null ? range[1] : 20;

        return (run.gearGainedThisRun || 0) >= cap;

    }



    /**
     * 普通战三选一：构筑技能 / 随机技能或装备 / 金币或治疗
     */
    function buildBattleDraftOptions(run, rng) {

        const r = rng || Math.random;

        const rewards = cfg().rewards || {};

        const options = [];

        const skBudget = skillBudgetReached(run);

        const gBudget = gearBudgetReached(run);

        if (!skBudget) {

            const syn = pickSynergySkill(run, r);

            options.push({ type: 'skill', skill: makeSkillLoot(syn.id), bias: 'synergy' });

        } else {

            const goldRange = rewards.battleDraftGold || [18, 32];

            const amt = Math.floor(goldRange[0] + r() * (goldRange[1] - goldRange[0]));

            options.push({ type: 'gold', amount: amt, bias: 'budget' });

        }

        if (!skBudget && r() > 0.45) {

            const hero = run.heroes[Math.floor(r() * run.heroes.length)];

            const sk = pickSkillFromPool(r, hero);

            options.push({ type: 'skill', skill: makeSkillLoot(sk.id), bias: 'random' });

        } else if (!gBudget) {

            const hero = run.heroes[Math.floor(r() * run.heroes.length)];

            options.push({

                type: 'gear',

                gear: makeGearLoot(r, null, hero.baseClass),

                bias: 'gear'

            });

        } else {

            options.push({ type: 'heal', pct: 0.18, bias: 'budget' });

        }

        if (r() > 0.55) {

            const goldRange = rewards.battleDraftGold || [18, 32];

            const amt = Math.floor(goldRange[0] + r() * (goldRange[1] - goldRange[0]));

            options.push({ type: 'gold', amount: amt, bias: 'gold' });

        } else {

            options.push({ type: 'heal', pct: 0.22, bias: 'heal' });

        }

        while (options.length < 3) {

            const goldRange = rewards.battleDraftGold || [18, 32];

            const amt = Math.floor(goldRange[0] + r() * (goldRange[1] - goldRange[0]));

            options.push({ type: 'gold', amount: amt, bias: 'fill' });

        }

        return options.slice(0, 3);

    }



    function grantInRunExp(run, amount) {

        if (!run || !amount) return 0;

        run.inRunExpPool = (run.inRunExpPool || 0) + amount;

        const per = ((cfg().rewards || {}).inRunExpPerLevel) || 280;

        const cap = ((cfg().rewards || {}).inRunLevelCap) || 8;

        let gained = 0;

        while (run.inRunExpPool >= per) {

            const underCap = (run.heroes || []).filter((h) => (h.runLevel || 0) < cap);

            if (!underCap.length) break;

            run.inRunExpPool -= per;

            // 优先给等级最低者
            underCap.sort((a, b) => (a.runLevel || 0) - (b.runLevel || 0));

            underCap[0].runLevel = (underCap[0].runLevel || 0) + 1;

            gained += 1;

        }

        return gained;

    }



    function addRunLevelToHero(run, heroId) {

        const hero = findHero(run, heroId);

        if (!hero) return { ok: false, message: '无效角色' };

        const cap = ((cfg().rewards || {}).inRunLevelCap) || 8;

        if ((hero.runLevel || 0) >= cap) return { ok: false, message: '已达局内等级上限' };

        hero.runLevel = (hero.runLevel || 0) + 1;

        return { ok: true, hero: hero, runLevel: hero.runLevel };

    }



    function starUpRandomEquippedSkill(run, rng) {

        const r = rng || Math.random;

        const slots = [];

        (run.heroes || []).forEach((h) => {

            (h.skillSlots || []).forEach((entry, idx) => {

                if (!entry) return;

                const norm = normalizeSkillEntry(entry);

                if ((norm.stars || 1) < ((skillProgressionCfg().maxStars) || 5)) {

                    slots.push({ hero: h, idx: idx, entry: norm });

                }

            });

        });

        if (!slots.length) return { ok: false, message: '没有可升星的已装技能' };

        const pick = slots[Math.floor(r() * slots.length)];

        const next = Math.min((skillProgressionCfg().maxStars) || 5, (pick.entry.stars || 1) + 1);

        pick.hero.skillSlots[pick.idx] = makeSkillEntry(pick.entry.id, next);

        return {

            ok: true,

            skillId: pick.entry.id,

            stars: next,

            heroId: pick.hero.heroId,

            name: (skillDefById(pick.entry.id) || {}).name || pick.entry.id

        };

    }



    function getNextSkillUnlock(hero) {

        const tiers = poolUnlockTiersForClass(hero.baseClass);

        const level = effectiveHeroLevel(hero);

        const activeId = getHeroActiveClassId(hero);

        if ((cfg().advancementSkillPools || {})[activeId]) return null;

        for (let i = 0; i < tiers.length; i++) {

            const tier = normalizePoolUnlockTier(tiers[i]);

            if (tier && level < tier.level) {

                return {

                    level: tier.level,

                    skillIds: tier.skillIds,

                    skillId: tier.skillIds[0]

                };

            }

        }

        return null;

    }



    window.RunStateSystem = {

        EQUIP_SLOTS,

        createRunState,

        createHeroRunState,

        rngFromRun,

        mulberry32,

        findHero,

        skillDefById,

        normalizeSkillEntry,

        skillEntryId,

        makeSkillEntry,

        getHeroActiveClassId,

        getSkillPoolForHero,

        getStarScaling,

        formatStarLabel,

        getLevelUnlockedSkillIds,

        getLevelUnlockedSkills,

        effectiveHeroLevel,

        pickSynergySkill,

        buildBattleDraftOptions,

        skillBudgetReached,

        gearBudgetReached,

        grantInRunExp,

        addRunLevelToHero,

        starUpRandomEquippedSkill,

        getNextSkillUnlock,

        canHeroUseSkill,

        canHeroWearGear,

        getEligibleHeroesForSkill,

        getEligibleHeroesForGear,

        formatClassTags,

        CLASS_NAMES,

        equipSkill,

        equipGear,

        unequipSkill,

        unequipGear,

        addRelic,

        addSkillToInventory,

        tryAutoMergeSkill,

        clearRunLoadoutOnEnd,

        makeSkillLoot,

        makeGearLoot,

        pickSkillFromPool,

        emptyEquipment

    };

})();


