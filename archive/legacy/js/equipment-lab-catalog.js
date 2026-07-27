/**
 * 装备试验场目录与确定性配装构造器。
 */
(function () {
    'use strict';

    const TRIGGERS = {
        dragon_breath: 'crit', chain_lightning: 'kill', thorn_aura: 'passive',
        phoenix: 'death', phantom_step: 'dodge', frost_nova: 'damage',
        greed_power: 'basic', blood_rage: 'low_hp', war_god_fury: 'skill_combo',
        immortal_shield: 'block', titan_body: 'damage', eagle_eye: 'range',
        arrow_rain: 'move', wind_soul: 'move', arcane_surge: 'skill_combo',
        mana_shield: 'skill', element_avatar: 'resource', assassinate: 'basic',
        shadow_dance: 'crit', death_arrival: 'kill',
        fire_nova: 'crit', frost_touch: 'damage', chain_strike: 'basic',
        star_stack: 'kill', shadow_counter: 'dodge', dragon_rage: 'low_hp',
        valor_shield: 'damage', windchaser_range: 'range',
        arcane_combo: 'skill', shadow_strike: 'crit',
        oath_shield: 'damage', crimson_scar: 'low_hp', bulwark_oath: 'damage',
        trail_sigil: 'range', hundred_pace: 'range', swift_plume: 'dodge',
        ember_residue: 'skill', star_oracle: 'skill', curse_echo: 'low_hp',
        night_veil: 'crit', mirror_mask: 'dodge', venom_censer: 'basic',
        holy_balance: 'damage', rift_howl: 'skill', temple_covenant: 'damage',
        beast_pact: 'range', breathless_hunt: 'range', echo_fold: 'dodge',
        torrent_throne: 'skill', fate_web: 'kill', grave_throne: 'low_hp',
        evernight_seal: 'crit', myriad_mirror: 'dodge', plague_altar: 'basic'
    };

    const CLASS_PATHS = {
        warrior: { baseClass: 'warrior', firstAdvancement: null, secondAdvancement: null },
        archer: { baseClass: 'archer', firstAdvancement: null, secondAdvancement: null },
        mage: { baseClass: 'mage', firstAdvancement: null, secondAdvancement: null },
        assassin: { baseClass: 'assassin', firstAdvancement: null, secondAdvancement: null },
        // 一转
        knight: { baseClass: 'warrior', firstAdvancement: 'knight', secondAdvancement: null },
        berserker: { baseClass: 'warrior', firstAdvancement: 'berserker', secondAdvancement: null },
        guardian: { baseClass: 'warrior', firstAdvancement: 'guardian', secondAdvancement: null },
        ranger: { baseClass: 'archer', firstAdvancement: 'ranger', secondAdvancement: null },
        marksman: { baseClass: 'archer', firstAdvancement: 'marksman', secondAdvancement: null },
        windrunner: { baseClass: 'archer', firstAdvancement: 'windrunner', secondAdvancement: null },
        wizard: { baseClass: 'mage', firstAdvancement: 'wizard', secondAdvancement: null },
        sage: { baseClass: 'mage', firstAdvancement: 'sage', secondAdvancement: null },
        warlock: { baseClass: 'mage', firstAdvancement: 'warlock', secondAdvancement: null },
        shadowdancer: { baseClass: 'assassin', firstAdvancement: 'shadowdancer', secondAdvancement: null },
        trickster: { baseClass: 'assassin', firstAdvancement: 'trickster', secondAdvancement: null },
        venomancer: { baseClass: 'assassin', firstAdvancement: 'venomancer', secondAdvancement: null },
        // 二转
        paladin: { baseClass: 'warrior', firstAdvancement: 'knight', secondAdvancement: 'paladin' },
        destroyer: { baseClass: 'warrior', firstAdvancement: 'berserker', secondAdvancement: 'destroyer' },
        temple_knight: { baseClass: 'warrior', firstAdvancement: 'guardian', secondAdvancement: 'temple_knight' },
        beastmaster: { baseClass: 'archer', firstAdvancement: 'ranger', secondAdvancement: 'beastmaster' },
        deadeye: { baseClass: 'archer', firstAdvancement: 'marksman', secondAdvancement: 'deadeye' },
        phantom: { baseClass: 'archer', firstAdvancement: 'windrunner', secondAdvancement: 'phantom' },
        archmage: { baseClass: 'mage', firstAdvancement: 'wizard', secondAdvancement: 'archmage' },
        oracle: { baseClass: 'mage', firstAdvancement: 'sage', secondAdvancement: 'oracle' },
        necromancer: { baseClass: 'mage', firstAdvancement: 'warlock', secondAdvancement: 'necromancer' },
        nightblade: { baseClass: 'assassin', firstAdvancement: 'shadowdancer', secondAdvancement: 'nightblade' },
        illusionist: { baseClass: 'assassin', firstAdvancement: 'trickster', secondAdvancement: 'illusionist' },
        plaguebringer: { baseClass: 'assassin', firstAdvancement: 'venomancer', secondAdvancement: 'plaguebringer' }
    };

    const RESONANCE_WEAPON_TYPES = {
        fireheart: 'sword', stormfury: 'bow', dragonblood: 'axe',
        holy_balance: 'sword', rift_howl: 'hammer', temple_covenant: 'sword',
        beast_pact: 'bow', breathless_hunt: 'longbow', echo_fold: 'shortbow',
        torrent_throne: 'staff', fate_web: 'book', grave_throne: 'staff',
        evernight_seal: 'dagger', myriad_mirror: 'dagger', plague_altar: 'dagger'
    };

    /** 毕业套演示用默认武器（取该职 A 亲和首项） */
    const SET_DEMO_WEAPON = {
        knight: 'sword', berserker: 'axe', guardian: 'sword',
        ranger: 'bow', marksman: 'longbow', windrunner: 'shortbow',
        wizard: 'staff', sage: 'book', warlock: 'staff',
        shadowdancer: 'dagger', trickster: 'dagger', venomancer: 'dagger',
        paladin: 'sword', destroyer: 'hammer', temple_knight: 'sword',
        beastmaster: 'bow', deadeye: 'longbow', phantom: 'shortbow',
        archmage: 'staff', oracle: 'book', necromancer: 'staff',
        nightblade: 'dagger', illusionist: 'dagger', plaguebringer: 'dagger'
    };

    function classData(classId) {
        if (CLASS_PATHS[classId]) {
            return Object.assign({}, CLASS_PATHS[classId]);
        }
        const cfg = window.CLASS_CONFIG;
        if (cfg && cfg.secondAdvancements && cfg.secondAdvancements[classId]) {
            const sec = cfg.secondAdvancements[classId];
            const firstId = sec.firstAdvancement;
            const first = cfg.firstAdvancements && cfg.firstAdvancements[firstId];
            return {
                baseClass: (first && first.baseClass) || 'warrior',
                firstAdvancement: firstId,
                secondAdvancement: classId
            };
        }
        if (cfg && cfg.firstAdvancements && cfg.firstAdvancements[classId]) {
            const first = cfg.firstAdvancements[classId];
            return {
                baseClass: first.baseClass || 'warrior',
                firstAdvancement: classId,
                secondAdvancement: null
            };
        }
        return Object.assign({}, CLASS_PATHS.warrior);
    }

    function preferredWeaponForAffinity(classId) {
        if (SET_DEMO_WEAPON[classId]) return SET_DEMO_WEAPON[classId];
        const wa = window.WEAPON_AFFINITY_CONFIG && window.WEAPON_AFFINITY_CONFIG.classWeaponAffinity;
        const table = wa && (wa[classId] || wa[(classData(classId).baseClass)]);
        if (table && Array.isArray(table.A) && table.A[0]) return table.A[0];
        return 'sword';
    }

    function activeClass(data) {
        return data.secondAdvancement || data.firstAdvancement || data.baseClass;
    }

    function hash(text) {
        let value = 2166136261;
        for (const char of String(text || '')) {
            value ^= char.charCodeAt(0);
            value = Math.imul(value, 16777619);
        }
        return value >>> 0;
    }

    function withSeed(seed, callback) {
        const original = Math.random;
        let state = (seed >>> 0) || 1;
        Math.random = function equipmentLabRandom() {
            state += 0x6D2B79F5;
            let n = state;
            n = Math.imul(n ^ (n >>> 15), n | 1);
            n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
            return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
        };
        try {
            return callback();
        } finally {
            Math.random = original;
        }
    }

    function createItem(entry, slot, data, extra) {
        const baseClass = data.baseClass || 'warrior';
        const currentClass = activeClass(data);
        const item = window.generateProceduralEquipment(Object.assign({
            level: 60,
            monsterLevel: 60,
            monsterTier: 'boss',
            quality: 'legendary',
            slot,
            playerClass: baseClass,
            classId: currentClass
        }, extra || {}));
        if (item) item.id = `equipment_lab_${entry.id}_${slot}`;
        return item;
    }

    function flattenPowers() {
        const cfg = window.LEGENDARY_POWERS || {};
        const result = [];
        (cfg.universal || []).forEach(power => result.push({ power, classId: 'warrior' }));
        Object.entries(cfg.classPowers || {}).forEach(([classId, list]) => {
            (list || []).forEach(power => result.push({ power, classId }));
        });
        return result;
    }

    function buildCatalog() {
        const entries = [];
        flattenPowers().forEach(({ power, classId }) => {
            entries.push({
                id: `power:${power.id}`,
                category: 'power',
                name: `威能 · ${power.name}`,
                description: power.description,
                effectId: power.id,
                trigger: TRIGGERS[power.id] || 'basic',
                classData: classData(classId),
                power
            });
        });

        Object.entries((window.SET_DEFINITIONS_V2 && window.SET_DEFINITIONS_V2.sets) || {}).forEach(([setId, setDef]) => {
            const pieceTargets = (window.SET_DEFINITIONS_V2 && window.SET_DEFINITIONS_V2.activationPieces)
                || [2, 4, 6];
            pieceTargets.forEach(pieceCount => {
                const effect = setDef.effects && setDef.effects[String(pieceCount)];
                if (!effect) return;
                entries.push({
                    id: `set:${setId}:${pieceCount}`,
                    category: 'set',
                    name: `${setDef.name} · ${pieceCount}件`,
                    description: effect.description,
                    effectId: effect.special || `${setId}_${pieceCount}`,
                    trigger: effect.special ? (TRIGGERS[effect.special] || 'basic') : 'basic',
                    classData: classData(setDef.classAffinity || 'warrior'),
                    setId,
                    pieceCount
                });
            });
        });

        ((window.CLASS_BUILD_EQUIPMENT && window.CLASS_BUILD_EQUIPMENT.items) || []).forEach(def => {
            const classId = (def.classRestriction && def.classRestriction[0]) || 'warrior';
            entries.push({
                id: `build:${def.equipmentId}`,
                category: 'build',
                name: `流派 · ${def.name}`,
                description: def.description,
                effectId: def.equipmentId,
                trigger: 'skill',
                classData: classData(classId),
                buildDef: def
            });
        });

        Object.entries((window.WEAPON_AFFINITY_CONFIG && window.WEAPON_AFFINITY_CONFIG.weaponTypes) || {}).forEach(([weaponType, def]) => {
            [0, 3, 5].forEach(refineLevel => {
                const mechanics = window.WeaponRefinementSystem
                    ? window.WeaponRefinementSystem.getMechanic(weaponType) : null;
                const mechanic = refineLevel === 3 ? mechanics?.core : (refineLevel === 5 ? mechanics?.capstone : null);
                entries.push({
                id: `weapon:${weaponType}:${refineLevel}`,
                category: 'weapon',
                name: `${def.name} · ${refineLevel ? `精炼${'★'.repeat(refineLevel)}` : '基础'}`,
                description: mechanic
                    ? `${mechanic.name}：${mechanic.description}`
                    : '展示该武器类型的基础技能',
                effectId: `weapon_${weaponType}_${refineLevel}`,
                trigger: 'weapon',
                classData: classData(def.baseClass),
                weaponType,
                refineLevel,
                refinementMechanic: mechanic
                });
            });
        });

        const resonanceDefs = window.WeaponRefinementResonance
            ? Object.values(window.WeaponRefinementResonance.getDefinitions()) : [];
        resonanceDefs.forEach(resonance => {
            const source = window.SET_DEFINITIONS_V2 && window.SET_DEFINITIONS_V2.sets[resonance.sourceId];
            const sourceName = source && source.name;
            const classId = (source && source.classAffinity) || 'warrior';
            const weaponType = RESONANCE_WEAPON_TYPES[resonance.sourceId] || 'sword';
            entries.push({
                id: `resonance:set:${resonance.sourceId}`,
                category: 'resonance',
                name: `身份共鸣 · ${sourceName || resonance.sourceId}`,
                description: `${resonance.name}：${resonance.description}`,
                effectId: resonance.id,
                trigger: 'resonance',
                classData: classData(classId),
                sourceType: 'set',
                sourceId: resonance.sourceId,
                weaponType,
                refineLevel: 5,
                resonance
            });
        });

        ['prefixes', 'suffixes'].forEach(group => {
            ((window.AFFIX_POOL && window.AFFIX_POOL[group]) || []).forEach(affix => entries.push({
                id: `affix:${affix.id}`,
                category: 'affix',
                name: `${group === 'prefixes' ? '前缀' : '后缀'} · ${affix.name}`,
                description: `${affix.stat}${affix.isPercent ? '（百分比）' : ''}`,
                effectId: affix.id,
                trigger: 'basic',
                classData: classData('warrior'),
                affix,
                affixGroup: group
            }));
        });
        return entries;
    }

    function buildLoadout(entry, seed) {
        if (!entry) throw new Error('装备试验场条目不存在');
        const equipment = window.createEmptyEquipmentSlots();
        const data = entry.classData || classData('warrior');
        return withSeed(hash(`${seed || 1}|${entry.id}`), () => {
            if (entry.category === 'power') {
                const slot = (entry.power.slots || ['weapon'])[0];
                const item = createItem(entry, slot, data);
                if (item) {
                    item.legendaryPowers = [Object.assign({}, entry.power)];
                    equipment[slot] = item;
                }
            } else if (entry.category === 'set') {
                const setDef = window.SET_DEFINITIONS_V2.sets[entry.setId];
                const affinity = setDef.classAffinity || data.baseClass;
                const demoWeapon = preferredWeaponForAffinity(affinity);
                (setDef.slots || []).slice(0, entry.pieceCount).forEach(slot => {
                    const extra = { setId: entry.setId };
                    if (slot === 'weapon') extra.weaponType = demoWeapon;
                    equipment[slot] = createItem(entry, slot, data, extra);
                });
            } else if (entry.category === 'build') {
                const def = entry.buildDef;
                equipment[def.slot] = createItem(entry, def.slot, data, {
                    weaponType: def.weaponType,
                    buildEquipmentId: def.equipmentId
                });
            } else if (entry.category === 'weapon') {
                const item = createItem(entry, 'weapon', data, { weaponType: entry.weaponType });
                if (item) {
                    item.refineLevel = entry.refineLevel;
                    item.setId = null; // 清除可能随机卷出的套装以防止共鸣劫持
                    item.legendaryPowers = []; // 清除可能随机卷出的威能以防止共鸣劫持
                    item.applyEnhancement();
                    equipment.weapon = item;
                }
            } else if (entry.category === 'resonance') {
                const item = createItem(entry, 'weapon', data, {
                    weaponType: entry.weaponType,
                    setId: entry.sourceId
                });
                if (item) {
                    item.refineLevel = 5;
                    item.setId = entry.sourceId;
                    item.legendaryPowers = [];
                    item.applyEnhancement();
                    equipment.weapon = item;
                }
            } else if (entry.category === 'affix') {
                const slot = (entry.affix.slots || ['weapon'])[0];
                const item = createItem(entry, slot, data, { quality: 'rare' });
                if (item) {
                    const tier = (entry.affix.tiers || []).slice(-1)[0] || { tier: 1, max: 1 };
                    const rolled = {
                        id: entry.affix.id,
                        name: entry.affix.name,
                        type: entry.affixGroup === 'prefixes' ? 'prefix' : 'suffix',
                        tier: tier.tier,
                        stat: entry.affix.stat,
                        isPercent: !!entry.affix.isPercent,
                        value: tier.max
                    };
                    item.prefixes = entry.affixGroup === 'prefixes' ? [rolled] : [];
                    item.suffixes = entry.affixGroup === 'suffixes' ? [rolled] : [];
                    if (typeof window.rebuildProceduralEquipmentStats === 'function') {
                        window.rebuildProceduralEquipmentStats(item, activeClass(data));
                    }
                    equipment[slot] = item;
                }
            }
            return equipment;
        });
    }

    function applyLoadout(player, equipment) {
        if (!player || !equipment) return false;
        if (window.EquipmentEffectSystem) window.EquipmentEffectSystem.reset(player);
        player.equipment = equipment;
        Object.keys(equipment).forEach(slot => {
            if (typeof player.onEquipmentSlotChanged === 'function') player.onEquipmentSlotChanged(slot);
        });
        if (typeof player.updateStats === 'function') player.updateStats();
        player.hp = player.maxHp;
        if (player.classResource) player.classResource.current = player.classResource.max;
        player.skillCooldowns = {};
        player.weaponSkillCooldown = 0;
        return true;
    }

    window.EquipmentLabCatalog = {
        buildCatalog,
        buildLoadout,
        applyLoadout,
        classDataFor: classData
    };
})();
