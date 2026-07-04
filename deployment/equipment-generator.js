/**
 * Pixel Eternal - Phase 3 程序化装备生成
 * 基型 / 词缀 / 威能 / 套装 / 命名 / 掉落偏向
 */
(function () {
    'use strict';

    let _dropId = 0;

    function rng() {
        return Math.random();
    }

    function pick(arr) {
        return arr[Math.floor(rng() * arr.length)];
    }

    function pickWeighted(items, weightFn) {
        let total = 0;
        const weights = items.map(it => {
            const w = Math.max(0, weightFn(it));
            total += w;
            return w;
        });
        if (total <= 0) return pick(items);
        let roll = rng() * total;
        for (let i = 0; i < items.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    function rollInt(min, max) {
        return Math.floor(min + rng() * (max - min + 1));
    }

    function resolveAffixCount(spec) {
        if (typeof spec === 'number') return spec;
        if (Array.isArray(spec)) return rollInt(spec[0], spec[1]);
        return 0;
    }

    const ARMOR_SLOTS = ['helmet', 'body', 'hands', 'legs', 'feet'];
    const ALL_SLOTS = ['weapon', 'offHand', 'helmet', 'body', 'hands', 'legs', 'feet', 'amulet', 'ring', 'belt'];

    function getDropBiasConfig() {
        const cfg = window.DROP_BIAS_CONFIG || {};
        return {
            weaponAffinityChance: cfg.weaponAffinityChance ?? 0.7,
            armorAffinityChance: cfg.armorAffinityChance ?? 0.5,
            classWeaponWeight: cfg.classWeaponWeight ?? 0.5,
            sameFamilyWeight: cfg.sameFamilyWeight ?? 0.15,
            otherFamilyWeight: cfg.otherFamilyWeight ?? 0.05,
            setChance: cfg.setChance ?? 0.12,
            setChanceBoss: cfg.setChanceBoss ?? 0.35
        };
    }

    function getRarityTable(monsterTier) {
        const tables = window.DROP_RARITY_TABLES || {
            normal: { normal: 60, magic: 30, rare: 10, epic: 0, legendary: 0, mythic: 0 },
            elite: { normal: 0, magic: 40, rare: 40, epic: 20, legendary: 0, mythic: 0 },
            boss: { normal: 0, magic: 0, rare: 30, epic: 40, legendary: 25, mythic: 5 }
        };
        return tables[monsterTier] || tables.normal;
    }

    function rollRarity(monsterTier, monsterLevel) {
        const table = getRarityTable(monsterTier);
        const entries = Object.entries(table).filter(([, w]) => w > 0);
        const total = entries.reduce((s, [, w]) => s + w, 0);
        let roll = rng() * total;
        let quality = 'normal';
        for (const [q, w] of entries) {
            roll -= w;
            if (roll <= 0) { quality = q; break; }
        }
        if (quality === 'mythic' && monsterLevel < 40) quality = 'legendary';
        if (quality === 'legendary' && monsterLevel < 20) quality = 'epic';
        if (quality === 'epic' && monsterLevel < 10) quality = 'rare';
        if (quality === 'rare' && monsterLevel < 5) quality = 'magic';
        return quality;
    }

    function scaleStatsPerLevel(basePerLevel, level) {
        const lv = Math.max(1, level | 0);
        const out = {};
        for (const [k, v] of Object.entries(basePerLevel || {})) {
            out[k] = Math.max(1, Math.round(v * lv));
        }
        return out;
    }

    function mergeStats(target, source, mult) {
        mult = mult == null ? 1 : mult;
        for (const [k, v] of Object.entries(source || {})) {
            if (typeof v !== 'number') continue;
            target[k] = (target[k] || 0) + Math.round(v * mult);
        }
        return target;
    }

    function getTierForLevel(affixDef, level) {
        const tiers = affixDef.tiers || [];
        let best = tiers[0];
        for (const t of tiers) {
            if (level >= (t.minLevel || 1)) best = t;
        }
        return best || { tier: 1, min: 1, max: 1 };
    }

    function rollAffixValue(affixDef, level) {
        const tier = getTierForLevel(affixDef, level);
        return { tier: tier.tier, value: rollInt(tier.min, tier.max) };
    }

    function rollAffixes(slot, quality, level, classId) {
        const pool = window.AFFIX_POOL;
        if (!pool) return { prefixes: [], suffixes: [] };
        const counts = pool.affixCounts && pool.affixCounts[quality];
        if (!counts) return { prefixes: [], suffixes: [] };

        const pCount = resolveAffixCount(counts.prefixes);
        const sCount = resolveAffixCount(counts.suffixes);
        const usedIds = new Set();

        function rollFrom(list, n) {
            const eligible = list.filter(a => Array.isArray(a.slots) && a.slots.includes(slot));
            const out = [];
            for (let i = 0; i < n; i++) {
                const candidates = eligible.filter(a => !usedIds.has(a.id));
                if (!candidates.length) break;
                const aff = pickWeighted(candidates, a => {
                    let w = 1;
                    if (classId && a.classWeights && a.classWeights[classId]) {
                        w *= a.classWeights[classId];
                    }
                    return w;
                });
                usedIds.add(aff.id);
                const rolled = rollAffixValue(aff, level);
                out.push({
                    id: aff.id,
                    name: aff.name,
                    type: list === pool.prefixes ? 'prefix' : 'suffix',
                    tier: rolled.tier,
                    stat: aff.stat,
                    isPercent: !!aff.isPercent,
                    value: rolled.value
                });
            }
            return out;
        }

        return {
            prefixes: rollFrom(pool.prefixes || [], pCount),
            suffixes: rollFrom(pool.suffixes || [], sCount)
        };
    }

    function affixesToStats(prefixes, suffixes) {
        const stats = {};
        const all = (prefixes || []).concat(suffixes || []);
        for (const a of all) {
            if (!a.stat) continue;
            stats[a.stat] = (stats[a.stat] || 0) + a.value;
        }
        return stats;
    }

    function rollLegendaryPowers(slot, quality, classId) {
        const cfg = window.LEGENDARY_POWERS;
        if (!cfg) return [];
        const need = quality === 'mythic' ? 2 : (quality === 'legendary' || quality === 'epic') ? 1 : 0;
        if (need <= 0) return [];
        if (quality === 'epic' && rng() > 0.35) return [];

        const powers = [];
        const used = new Set();
        for (let i = 0; i < need; i++) {
            const useUniversal = rng() < (cfg.rollWeights && cfg.rollWeights.universal != null ? cfg.rollWeights.universal : 0.6);
            let pool = [];
            if (useUniversal) {
                pool = (cfg.universal || []).filter(p => p.slots.includes(slot));
            } else if (classId && cfg.classPowers && cfg.classPowers[classId]) {
                pool = cfg.classPowers[classId].filter(p => p.slots.includes(slot));
            }
            if (!pool.length) {
                pool = (cfg.universal || []).filter(p => p.slots.includes(slot));
            }
            pool = pool.filter(p => {
                if (used.has(p.id)) return false;
                if (quality !== 'mythic' && p.rarity === 'mythic') return false;
                return true;
            });
            if (!pool.length) break;
            const p = pick(pool);
            used.add(p.id);
            powers.push({ id: p.id, name: p.name, description: p.description, source: useUniversal ? '通用池' : '职业专属' });
        }
        return powers;
    }

    function pickSetId(slot, classId, isBoss) {
        const cfg = window.SET_DEFINITIONS_V2;
        if (!cfg || !cfg.sets) return null;
        const bias = getDropBiasConfig();
        const chance = isBoss ? bias.setChanceBoss : bias.setChance;
        if (rng() > chance) return null;

        const eligible = Object.entries(cfg.sets).filter(([, s]) => {
            if (!s.slots || !s.slots.includes(slot)) return false;
            if (s.classAffinity && classId && s.classAffinity !== classId) return false;
            return true;
        });
        if (!eligible.length) return null;
        return pickWeighted(eligible, ([, s]) => s.dropWeight || 1)[0];
    }

    function composeEquipmentName(baseName, quality, prefixes, suffixes, classId) {
        const bt = window.BASE_TYPES || {};
        const qPrefixes = bt.qualityPrefixes && bt.qualityPrefixes[quality];
        const styleWords = classId && bt.classStyleWords && bt.classStyleWords[classId];
        let name = baseName;

        if (quality !== 'normal' && qPrefixes && qPrefixes.length) {
            const qPre = pick(qPrefixes.filter(Boolean));
            if (styleWords && styleWords.length && rng() < 0.5) {
                name = `${pick(styleWords)}${qPre}${baseName}`;
            } else if (qPre) {
                name = `${qPre}${baseName}`;
            }
        }

        const pre = prefixes && prefixes.length ? prefixes[0] : null;
        const suf = suffixes && suffixes.length ? suffixes[suffixes.length - 1] : null;
        if (pre && ['rare', 'epic', 'legendary', 'mythic'].includes(quality)) {
            name = `${pre.name}·${name}`;
        } else if (suf && ['epic', 'legendary', 'mythic'].includes(quality)) {
            name = `${name}·${suf.name}`;
        }
        return name;
    }

    function pickWeaponType(classId) {
        const wa = window.WEAPON_AFFINITY_CONFIG;
        if (!wa || !wa.weaponTypes) return 'sword';
        const bias = getDropBiasConfig();
        const allTypes = Object.keys(wa.weaponTypes);

        if (!classId || rng() > bias.weaponAffinityChance) {
            return pick(allTypes);
        }

        const baseClass = typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId({ baseClass: classId, firstAdvancement: null, secondAdvancement: null })
            : classId;

        const table = wa.classWeaponAffinity && wa.classWeaponAffinity[baseClass];
        if (!table) return pick(allTypes);

        const weighted = [];
        for (const wt of allTypes) {
            let w = bias.otherFamilyWeight;
            if (table.A && table.A.includes(wt)) w = bias.classWeaponWeight;
            else if (table.B && table.B.includes(wt)) w = bias.sameFamilyWeight * 1.2;
            else if (table.C && table.C.includes(wt)) w = bias.sameFamilyWeight;
            weighted.push({ wt, w });
        }
        return pickWeighted(weighted, x => x.w).wt;
    }

    function pickBaseTypeForSlot(slot, level, classId, weaponType) {
        const bt = window.BASE_TYPES;
        if (!bt) return null;

        if (slot === 'weapon') {
            const wt = weaponType || pickWeaponType(classId);
            const candidates = Object.entries(bt.weapons || {}).filter(([, d]) => d.weaponType === wt);
            if (!candidates.length) return null;
            const [id, def] = pick(candidates);
            return { id, def, weaponType: wt };
        }

        if (slot === 'offHand') {
            const baseClass = classId || 'warrior';
            const cls = ['warrior', 'archer', 'mage', 'assassin'].includes(baseClass) ? baseClass : 'warrior';
            const candidates = Object.entries(bt.offHand || {}).filter(([, d]) => d.classAffinity === cls);
            if (!candidates.length) return null;
            const [id, def] = rng() < getDropBiasConfig().armorAffinityChance && candidates.length
                ? pick(candidates) : pick(Object.entries(bt.offHand || {}));
            return { id, def, classAffinity: def.classAffinity };
        }

        if (ARMOR_SLOTS.includes(slot)) {
            const candidates = Object.entries(bt.armor || {}).filter(([, d]) => d.slot === slot);
            if (!candidates.length) return null;
            let pool = candidates;
            if (classId && rng() < getDropBiasConfig().armorAffinityChance) {
                const heavy = classId === 'warrior';
                const light = classId === 'assassin' || classId === 'archer';
                const style = heavy ? 'heavy' : light ? 'light' : 'medium';
                const filtered = candidates.filter(([, d]) => d.style === style);
                if (filtered.length) pool = filtered;
            }
            const [id, def] = pick(pool);
            return { id, def, classAffinity: classId || null };
        }

        const accCandidates = Object.entries(bt.accessories || {}).filter(([, d]) => d.slot === slot);
        if (!accCandidates.length) return null;
        const [id, def] = pick(accCandidates);
        return { id, def };
    }

    window.generateProceduralEquipment = function generateProceduralEquipment(context) {
        if (typeof Equipment === 'undefined') return null;
        const ctx = context || {};
        const level = Math.max(1, Math.min(60, ctx.monsterLevel || ctx.level || 1));
        const tierLevels = typeof getEquipmentDropTierLevelsForMonsterLevel === 'function'
            ? getEquipmentDropTierLevelsForMonsterLevel(level)
            : [level];
        const eqLevel = pick(tierLevels);
        const classId = ctx.playerClass || ctx.classId || null;
        const monsterTier = ctx.monsterTier || 'normal';
        const quality = ctx.quality || rollRarity(monsterTier, eqLevel);
        const slot = ctx.slot || pick(ALL_SLOTS);
        const weaponType = slot === 'weapon' ? (ctx.weaponType || pickWeaponType(classId)) : null;

        const picked = pickBaseTypeForSlot(slot, eqLevel, classId, weaponType);
        if (!picked) return null;

        const { id: baseTypeId, def } = picked;
        let stats = {};
        if (def.baseStatsPerLevel) {
            stats = scaleStatsPerLevel(def.baseStatsPerLevel, eqLevel);
        } else if (def.baseStats) {
            const scale = eqLevel / 20;
            for (const [k, v] of Object.entries(def.baseStats)) {
                stats[k] = Math.max(1, Math.round(v * Math.max(0.5, scale)));
            }
        }
        mergeStats(stats, def.implicit);

        const affixRoll = rollAffixes(slot, quality, eqLevel, classId);
        mergeStats(stats, affixesToStats(affixRoll.prefixes, affixRoll.suffixes));

        const legendaryPowers = rollLegendaryPowers(slot, quality, classId);
        const setId = pickSetId(slot, classId, monsterTier === 'boss');

        const equipClassAffinity = picked.classAffinity || def.classAffinity ||
            (slot === 'weapon' && weaponType && window.WEAPON_AFFINITY_CONFIG &&
                window.WEAPON_AFFINITY_CONFIG.weaponTypes &&
                window.WEAPON_AFFINITY_CONFIG.weaponTypes[weaponType] &&
                window.WEAPON_AFFINITY_CONFIG.weaponTypes[weaponType].baseClass) || null;

        const name = composeEquipmentName(def.name, quality, affixRoll.prefixes, affixRoll.suffixes, equipClassAffinity);

        const data = {
            id: 'proc_' + (++_dropId) + '_' + Date.now(),
            name,
            slot,
            weaponType: def.weaponType || weaponType || 'sword',
            quality,
            level: eqLevel,
            stats: JSON.parse(JSON.stringify(stats)),
            baseTypeId,
            implicit: def.implicit ? { ...def.implicit } : {},
            prefixes: affixRoll.prefixes,
            suffixes: affixRoll.suffixes,
            legendaryPowers,
            setId,
            classAffinity: equipClassAffinity,
            procedural: true,
            isCrafted: false
        };

        const eq = new Equipment(data);
        eq.baseTypeId = baseTypeId;
        eq.implicit = data.implicit;
        eq.prefixes = data.prefixes;
        eq.suffixes = data.suffixes;
        eq.legendaryPowers = data.legendaryPowers;
        eq.setId = data.setId;
        eq.classAffinity = data.classAffinity;
        eq.procedural = true;
        if (typeof window.refreshEquipmentGearScore === 'function') {
            window.refreshEquipmentGearScore(eq);
        }
        return eq;
    };

    window.refreshEquipmentGearScore = function refreshEquipmentGearScore(equipment) {
        if (!equipment) return 0;
        if (typeof window.computeEquipmentGearScoreV2 === 'function') {
            equipment.gearScore = window.computeEquipmentGearScoreV2(equipment);
        } else if (typeof window.computeEquipmentGearScore === 'function') {
            equipment.gearScore = window.computeEquipmentGearScore(equipment);
        }
        return equipment.gearScore;
    };
})();
