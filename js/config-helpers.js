/**
 * Pixel Eternal - 配置辅助函数模块
 */

function getSetV2ForEquipment(equipment) {
    if (!equipment) return null;
    return equipment.setId || null;
}

function getSetV2PieceCount(equipment, setId) {
    if (!setId || !equipment) return 0;
    let count = 0;
    Object.values(equipment).forEach(eq => {
        if (eq && eq.setId === setId) count++;
    });
    return count;
}

function getActiveSetEffectsV2(equipment) {
    if (typeof SET_DEFINITIONS_V2 === 'undefined' || !SET_DEFINITIONS_V2 || !SET_DEFINITIONS_V2.sets) return [];
    const activeEffects = [];
    const setCounts = {};
    Object.values(equipment || {}).forEach(eq => {
        if (eq && eq.setId) setCounts[eq.setId] = (setCounts[eq.setId] || 0) + 1;
    });
    const pieceTargets = SET_DEFINITIONS_V2.activationPieces || [2, 4];
    for (const [setId, count] of Object.entries(setCounts)) {
        const setData = SET_DEFINITIONS_V2.sets[setId];
        if (!setData) continue;
        for (const pieceCount of pieceTargets) {
            const pc = String(pieceCount);
            if (count >= pieceCount && setData.effects && setData.effects[pc]) {
                activeEffects.push({
                    setId,
                    setName: setData.name,
                    pieceCount: pieceCount,
                    effect: setData.effects[pc],
                    version: 2
                });
            }
        }
    }
    return activeEffects;
}

function getAllActiveSetEffects(equipment) {
    return getActiveSetEffectsV2(equipment);
}

function resolveSetDefinition(setId) {
    if (!setId) return null;
    if (typeof SET_DEFINITIONS_V2 !== 'undefined' && SET_DEFINITIONS_V2.sets && SET_DEFINITIONS_V2.sets[setId]) {
        return SET_DEFINITIONS_V2.sets[setId];
    }
    return null;
}

function stripSetDescriptionMarkdown(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}

/**
 * 启动期校验 Phase 3 装备配置，避免只有文案而没有运行时处理器。
 * @returns {string[]} 校验错误
 */
function validatePhase3EquipmentConfig() {
    const errors = [];
    const slots = new Set(['weapon', 'offHand', 'helmet', 'body', 'hands', 'legs', 'feet', 'amulet', 'ring', 'belt']);
    const qualities = new Set(['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic']);
    const powerHandlers = new Set([
        'dragon_breath', 'chain_lightning', 'thorn_aura', 'phoenix', 'phantom_step',
        'frost_nova', 'greed_power', 'blood_rage', 'war_god_fury', 'immortal_shield',
        'titan_body', 'eagle_eye', 'arrow_rain', 'wind_soul', 'arcane_surge',
        'mana_shield', 'element_avatar', 'assassinate', 'shadow_dance', 'death_arrival'
    ]);
    const setHandlers = new Set([
        'fire_nova', 'frost_touch', 'chain_strike', 'star_stack', 'shadow_counter',
        'dragon_rage', 'valor_shield', 'windchaser_range', 'arcane_combo', 'shadow_strike',
        'oath_shield', 'oath_shield_apex', 'crimson_scar', 'crimson_scar_apex',
        'bulwark_oath', 'bulwark_oath_apex', 'trail_sigil', 'trail_sigil_apex',
        'hundred_pace', 'hundred_pace_apex', 'swift_plume', 'swift_plume_apex',
        'ember_residue', 'ember_residue_apex', 'star_oracle', 'star_oracle_apex',
        'curse_echo', 'curse_echo_apex', 'night_veil', 'night_veil_apex',
        'mirror_mask', 'mirror_mask_apex', 'venom_censer', 'venom_censer_apex',
        'holy_balance', 'holy_balance_apex', 'rift_howl', 'rift_howl_apex',
        'temple_covenant', 'temple_covenant_apex', 'beast_pact', 'beast_pact_apex',
        'breathless_hunt', 'breathless_hunt_apex', 'echo_fold', 'echo_fold_apex',
        'torrent_throne', 'torrent_throne_apex', 'fate_web', 'fate_web_apex',
        'grave_throne', 'grave_throne_apex', 'evernight_seal', 'evernight_seal_apex',
        'myriad_mirror', 'myriad_mirror_apex', 'plague_altar', 'plague_altar_apex'
    ]);
    const configuredWeaponTypes = new Set(Object.keys(
        (window.WEAPON_AFFINITY_CONFIG && window.WEAPON_AFFINITY_CONFIG.weaponTypes) || {}
    ));
    const refinementMechanics = window.WeaponRefinementSystem
        ? window.WeaponRefinementSystem.getMechanics() : {};
    configuredWeaponTypes.forEach(weaponType => {
        const mechanic = refinementMechanics[weaponType];
        if (!mechanic || !mechanic.core || !mechanic.capstone) {
            errors.push(`武器 ${weaponType} 缺少3星或5星精炼机制`);
        }
    });
    const resonanceSystem = window.WeaponRefinementResonance;
    // 含武器位需 5 星共鸣：通用三套 + 全部二转大毕业（均为武器+五甲）
    const resonanceRequired = [
        'fireheart', 'stormfury', 'dragonblood',
        'holy_balance', 'rift_howl', 'temple_covenant', 'beast_pact', 'breathless_hunt',
        'echo_fold', 'torrent_throne', 'fate_web', 'grave_throne', 'evernight_seal',
        'myriad_mirror', 'plague_altar'
    ];
    resonanceRequired.forEach(setId => {
        if (!resonanceSystem || !resonanceSystem.getDefinition('set', setId)) {
            errors.push(`套装武器 ${setId} 缺少5星身份共鸣`);
        }
    });
    if (resonanceSystem && resonanceSystem.getDefinition('power', 'dragon_breath')) {
        errors.push('身份共鸣不应再注册威能共鸣（威能走独立状态机）');
    }
    const setVfxHandlers = new Set(window.EquipmentSetVFX
        ? window.EquipmentSetVFX.getSupportedSpecials() : []);
    const powerVfxHandlers = new Set(window.EquipmentPowerVFX
        ? window.EquipmentPowerVFX.getSupportedPowers() : []);
    const configuredSkillIds = new Set();
    (function collectSkillIds(value) {
        if (!value || typeof value !== 'object') return;
        if (typeof value.id === 'string') configuredSkillIds.add(value.id);
        Object.entries(value).forEach(([key, child]) => {
            if (child && typeof child === 'object' && child.name && (child.type || child.slotType || child.damageMultiplier != null)) {
                configuredSkillIds.add(key);
            }
            collectSkillIds(child);
        });
    })(window.SKILL_CONFIG);

    const powers = [];
    if (window.LEGENDARY_POWERS) {
        powers.push(...(window.LEGENDARY_POWERS.universal || []));
        Object.values(window.LEGENDARY_POWERS.classPowers || {}).forEach(list => powers.push(...(list || [])));
    }
    powers.forEach(power => {
        if (!power || !power.id) {
            errors.push('传奇威能缺少 id');
            return;
        }
        if (!powerHandlers.has(power.id)) errors.push(`传奇威能 ${power.id} 缺少运行时处理器`);
        if (!powerVfxHandlers.has(power.id)) errors.push(`传奇威能 ${power.id} 缺少视觉处理器`);
        if (!qualities.has(power.rarity)) errors.push(`传奇威能 ${power.id} 品质无效: ${power.rarity}`);
        (power.slots || []).forEach(slot => {
            if (!slots.has(slot)) errors.push(`传奇威能 ${power.id} 槽位无效: ${slot}`);
            if (!['amulet', 'ring', 'belt'].includes(slot)) {
                errors.push(`传奇威能 ${power.id} 应仅挂于护符/指环/腰带，当前: ${slot}`);
            }
        });
    });

    Object.entries((window.SET_DEFINITIONS_V2 && window.SET_DEFINITIONS_V2.sets) || {}).forEach(([setId, setDef]) => {
        (setDef.slots || []).forEach(slot => {
            if (!slots.has(slot)) errors.push(`套装 ${setId} 槽位无效: ${slot}`);
        });
        Object.values(setDef.effects || {}).forEach(effect => {
            if (effect.special && !setHandlers.has(effect.special)) {
                errors.push(`套装 ${setId} special 缺少运行时处理器: ${effect.special}`);
            }
            if (effect.special && !setVfxHandlers.has(effect.special)) {
                errors.push(`套装 ${setId} special 缺少视觉处理器: ${effect.special}`);
            }
        });
    });

    ((window.CLASS_BUILD_EQUIPMENT && window.CLASS_BUILD_EQUIPMENT.items) || []).forEach(item => {
        if (!item.equipmentId) errors.push('流派装备缺少 equipmentId');
        if (!slots.has(item.slot)) errors.push(`流派装备 ${item.equipmentId || '?'} 槽位无效: ${item.slot}`);
        if (item.weaponType && !configuredWeaponTypes.has(item.weaponType)) {
            errors.push(`流派装备 ${item.equipmentId || '?'} 武器类型无效: ${item.weaponType}`);
        }
        if (item.slot !== 'offHand') {
            errors.push(`流派装备 ${item.equipmentId || '?'} 应位于副手槽 offHand（当前: ${item.slot}）`);
        }
        if (!Array.isArray(item.classRestriction) || item.classRestriction.length === 0) {
            errors.push(`流派装备 ${item.equipmentId || '?'} 缺少职业限制`);
        }
        (item.skillModifiers || []).forEach(modifier => {
            if (!modifier.skillId || !configuredSkillIds.has(modifier.skillId)) {
                errors.push(`流派装备 ${item.equipmentId || '?'} 引用了未知技能: ${modifier.skillId || '?'}`);
            }
            (modifier.evolvedSkillIds || []).forEach(skillId => {
                if (!configuredSkillIds.has(skillId)) {
                    errors.push(`流派装备 ${item.equipmentId || '?'} 引用了未知进阶技能: ${skillId}`);
                }
            });
        });
    });

    if (errors.length) console.error('[Phase3Equipment] 配置校验失败:\n' + errors.join('\n'));
    else console.info('[Phase3Equipment] 配置校验通过');
    return errors;
}

window.validatePhase3EquipmentConfig = validatePhase3EquipmentConfig;
