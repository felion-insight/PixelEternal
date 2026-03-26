/**
 * Pixel Eternal - 数据类模块
 * 包含AlchemyMaterial、Potion、Equipment类及其生成函数
 */

/**
 * 炼金材料类
 * 用于表示炼金材料，包含词条和保留率等信息
 */
class AlchemyMaterial {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = 'material'; // 标识为材料类型（炼金材料）
        this.quality = data.quality || 'common'; // 品质
        this.description = data.description || '';
        this.alchemyTraits = data.alchemyTraits || {}; // 炼金词条：{ attack: 5, critRate: 3 } 等
        this.traitRetentionRate = data.traitRetentionRate || 0.5; // 词条保留概率（基础值，品质越高越高）
    }

    getTooltipHTML() {
        let html = `<h4 style="color: ${QUALITY_COLORS[this.quality]}">${this.name}</h4>`;
        html += `<p>类型: 炼金材料</p>`;
        html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
        if (this.description) {
            html += `<p>${this.description}</p>`;
        }
        html += `<p>---</p>`;
        html += `<p><strong>炼金词条:</strong></p>`;
        
        const traitNames = {
            attack: '攻击力',
            defense: '防御力',
            critRate: '暴击率',
            critDamage: '暴击伤害',
            dodge: '闪避率',
            attackSpeed: '攻击速度',
            moveSpeed: '移动速度',
            health: '生命值恢复',
            duration: '持续时间'
        };
        
        let hasTraits = false;
        for (const [key, value] of Object.entries(this.alchemyTraits)) {
            if (value !== 0) {
                hasTraits = true;
                const suffix = key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : 
                             key === 'duration' ? '秒' : '';
                html += `<p>${traitNames[key] || key}: +${value}${suffix}</p>`;
            }
        }
        
        if (!hasTraits) {
            html += `<p style="color: #aaa;">无词条</p>`;
        }
        
        html += `<p style="color: #aaa; font-size: 12px;">词条保留率: ${Math.floor(this.traitRetentionRate * 100)}%</p>`;
        html += `<p style="color: #aaa; font-size: 12px;">用于炼金房间炼制</p>`;
        
        return html;
    }
}

/**
 * 生成炼金材料数据
 * @returns {AlchemyMaterial[]} 所有炼金材料的数组
 * 材料定义数据从 config/alchemy-material-config.json 中读取
 */
function generateAlchemyMaterials() {
    const materials = [];
    let id = 20000; // 炼金材料ID从20000开始（炼金系统已移除，保留空实现以兼容存档）
    
    const materialTypes = typeof ALCHEMY_MATERIAL_DEFINITIONS !== 'undefined' ? ALCHEMY_MATERIAL_DEFINITIONS : [];
    if (!materialTypes.length) return materials;
    
    // 获取词条保留率（如果未定义，使用默认值）
    const retentionRates = TRAIT_RETENTION_RATES || {
        common: 0.4,
        rare: 0.5,
        fine: 0.6,
        epic: 0.7,
        legendary: 0.8
    };
    
    // 获取额外词条池（如果未定义，使用空数组）
    const extraTraitsPool = EXTRA_TRAITS_POOL || [];
    
    materialTypes.forEach(materialData => {
        // 根据品质可能增加额外词条
        const traits = JSON.parse(JSON.stringify(materialData.baseTraits));
        const qualityIndex = ['common', 'rare', 'fine', 'epic', 'legendary'].indexOf(materialData.quality);
        
        // 高品质材料可能有多条词条
        if (qualityIndex >= 2 && extraTraitsPool.length > 0) {
            // 随机添加1-2个额外词条
            const extraTraits = [...extraTraitsPool];
            
            const numExtra = Math.floor(Math.random() * 2) + 1;
            for (let i = 0; i < numExtra && extraTraits.length > 0; i++) {
                const randomTrait = extraTraits.splice(Math.floor(Math.random() * extraTraits.length), 1)[0];
                for (const [key, value] of Object.entries(randomTrait)) {
                    traits[key] = (traits[key] || 0) + value;
                }
            }
        }
        
        materials.push(new AlchemyMaterial({
            id: id++,
            name: materialData.name,
            quality: materialData.quality,
            description: materialData.description || `品质为${QUALITY_NAMES[materialData.quality]}的炼金材料`,
            alchemyTraits: traits,
            traitRetentionRate: retentionRates[materialData.quality] || 0.5
        }));
    });
    
    return materials;
}

/**
 * 消耗品类
 * 用于表示消耗品，包括药水、背包扩容、副本门票、打造配方、神圣十字架等
 */
class Consumable {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = 'consumable'; // 标识为消耗品类型
        this.consumableType = data.consumableType || 'potion'; // 消耗品子类型：potion（药水）、backpack_expansion（背包扩容）、dungeon_ticket（副本门票）、recipe（打造配方）、resurrection（神圣十字架）
        this.quality = data.quality || 'common'; // 品质
        this.description = data.description || '';
        this.effects = data.effects || {}; // 效果（仅药水）：{ attack: 10, duration: 30000 } 表示攻击力+10，持续30秒
        this.duration = data.duration || 30000; // 持续时间（毫秒，仅药水）
        this.price = data.price || 50; // 价格
        this.isCrafted = data.isCrafted || false; // 是否为炼金得到的药水
        // 配方相关属性
        if (data.recipeId !== undefined) {
            this.recipeId = data.recipeId; // 配方ID（仅打造配方）
        }
    }

    getTooltipHTML() {
        let html = `<h4 style="color: ${QUALITY_COLORS[this.quality]}">${this.name}</h4>`;
        html += `<p>类型: 消耗品</p>`;
        
        if (this.consumableType === 'potion') {
            html += `<p>子类型: 药水</p>`;
            html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
            if (this.description) {
                html += `<p>${this.description}</p>`;
            }
            html += `<p>---</p>`;
            html += `<p><strong>效果:</strong></p>`;
            
            const effectNames = {
                attack: '攻击力',
                defense: '防御力',
                critRate: '暴击率',
                critDamage: '暴击伤害',
                dodge: '闪避率',
                attackSpeed: '攻击速度',
                moveSpeed: '移动速度',
                health: '生命值恢复'
            };
            
            for (const [key, value] of Object.entries(this.effects)) {
                if (key !== 'duration' && value !== 0) {
                    const suffix = key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : '';
                    html += `<p>${effectNames[key] || key}: +${value}${suffix}</p>`;
                }
            }
            
            html += `<p>持续时间: ${this.duration / 1000}秒</p>`;
            html += `<p style="color: #aaa; font-size: 12px;">双击使用</p>`;
        } else if (this.consumableType === 'resurrection') {
            html += `<p>子类型: 复活道具</p>`;
            html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
            if (this.description) {
                html += `<p>${this.description}</p>`;
            }
            html += `<p>---</p>`;
            html += `<p><strong>效果:</strong></p>`;
            html += `<p>死亡时可以使用，恢复满血并获得3秒无敌</p>`;
            html += `<p style="color: #aaa; font-size: 12px;">死亡时自动询问是否使用</p>`;
        } else if (this.consumableType === 'recipe') {
            html += `<p>子类型: 武器图纸</p>`;
            html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
            if (this.description) {
                html += `<p>${this.description}</p>`;
            }
            html += `<p>---</p>`;
            html += `<p><strong>用途:</strong></p>`;
            html += `<p>在铁匠铺中使用此图纸打造装备</p>`;
            html += `<p style="color: #aaa; font-size: 12px;">在铁匠铺的打造界面使用</p>`;
        } else {
            html += `<p>子类型: ${this.consumableType}</p>`;
            html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
            if (this.description) {
                html += `<p>${this.description}</p>`;
            }
        }
        
        return html;
    }
}

/**
 * 药水类（保持向后兼容，实际使用Consumable）
 * 用于表示药水，包含效果、持续时间等信息
 */
class Potion extends Consumable {
    constructor(data) {
        super({
            ...data,
            consumableType: 'potion'
        });
        // 保持type为potion以兼容旧代码
        this.type = 'potion';
    }

    getTooltipHTML() {
        let html = `<h4 style="color: ${QUALITY_COLORS[this.quality]}">${this.name}</h4>`;
        html += `<p>类型: 药水</p>`;
        html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
        if (this.description) {
            html += `<p>${this.description}</p>`;
        }
        html += `<p>---</p>`;
        html += `<p><strong>效果:</strong></p>`;
        
        const effectNames = {
            attack: '攻击力',
            defense: '防御力',
            critRate: '暴击率',
            critDamage: '暴击伤害',
            dodge: '闪避率',
            attackSpeed: '攻击速度',
            moveSpeed: '移动速度',
            health: '生命值恢复'
        };
        
        for (const [key, value] of Object.entries(this.effects)) {
            if (key !== 'duration' && value !== 0) {
                const suffix = key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : '';
                html += `<p>${effectNames[key] || key}: +${value}${suffix}</p>`;
            }
        }
        
        html += `<p>持续时间: ${this.duration / 1000}秒</p>`;
        html += `<p style="color: #aaa; font-size: 12px;">双击使用</p>`;
        
        return html;
    }
}

/**
 * 生成药水数据
 * @returns {Potion[]} 所有药水的数组
 * 药水定义数据从 config/potion-config.json 中读取
 */
function generatePotions() {
    const potions = [];
    let id = 10000; // 药水ID从10000开始，避免与装备ID冲突
    
    // 从全局配置中读取药水定义
    const potionTypes = POTION_DEFINITIONS;
    
    potionTypes.forEach(potionData => {
        potions.push(new Potion({
            id: id++,
            name: potionData.name,
            quality: potionData.quality,
            description: potionData.description,
            effects: potionData.effects,
            duration: potionData.duration,
            price: potionData.price
        }));
    });
    
    return potions;
}

/**
 * 生成消耗品数据
 * @returns {Consumable[]} 所有消耗品的数组
 */
function generateConsumables() {
    const consumables = [];
    let id = 30000; // 消耗品ID从30000开始
    
    // 生成神圣十字架
    consumables.push(new Consumable({
        id: id++,
        name: '神圣十字架',
        consumableType: 'resurrection',
        quality: 'epic',
        description: '死亡时可以使用，恢复满血并获得3秒无敌',
        price: 500
    }));
    
    // 生成武器图纸（图纸可以在商店中购买，也可以在随机礼箱中出现）
    // 注意：图纸不会在这里直接生成Consumable实例，而是在商店购买或随机礼箱中生成
    // 这里只是定义图纸的数据结构，实际生成在商店刷新或随机礼箱时进行
    
    return consumables;
}

/**
 * 生成随机消耗品（用于随机礼箱）
 * @returns {Consumable|Potion} 随机消耗品
 */
function generateRandomConsumable() {
    const allPotions = generatePotions();
    const allConsumables = generateConsumables();
    
    // 将所有消耗品合并
    const allItems = [...allPotions, ...allConsumables];
    
    // 随机决定是否生成图纸（20%概率）
    // 图纸也可以从随机礼箱中获得
    if (typeof CRAFTING_RECIPE_DEFINITIONS !== 'undefined' && 
        CRAFTING_RECIPE_DEFINITIONS.length > 0 && 
        Math.random() < 0.2) {
        // 随机选择一个图纸
        const randomRecipe = CRAFTING_RECIPE_DEFINITIONS[Math.floor(Math.random() * CRAFTING_RECIPE_DEFINITIONS.length)];
        return new Consumable({
            id: Date.now() + Math.random(), // 使用时间戳+随机数作为唯一ID
            name: randomRecipe.name,
            consumableType: 'recipe',
            recipeId: randomRecipe.id,
            quality: randomRecipe.resultEquipment.quality,
            description: randomRecipe.description,
            price: randomRecipe.price
        });
    }
    
    // 否则从普通消耗品中随机选择
    const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
    
    // 如果是药水，返回Potion实例
    if (randomItem instanceof Potion || randomItem.type === 'potion') {
        return new Potion({
            id: randomItem.id,
            name: randomItem.name,
            quality: randomItem.quality,
            description: randomItem.description,
            effects: JSON.parse(JSON.stringify(randomItem.effects || {})),
            duration: randomItem.duration,
            price: randomItem.price,
            isCrafted: randomItem.isCrafted
        });
    }
    
    // 否则返回Consumable实例
    const consumableData = {
        id: randomItem.id,
        name: randomItem.name,
        consumableType: randomItem.consumableType,
        quality: randomItem.quality,
        description: randomItem.description,
        price: randomItem.price
    };
    
    // 如果是图纸，添加图纸相关属性
    if (randomItem.consumableType === 'recipe' && randomItem.recipeId) {
        consumableData.recipeId = randomItem.recipeId;
    }
    return new Consumable(consumableData);
}

/**
 * 装备类
 * 用于表示装备，包含属性、强化等级等信息
 */
class Equipment {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.type = 'equipment'; // 标识为装备类型
        this.slot = data.slot; // weapon, helmet, chest, legs, boots, necklace, ring, belt
        this.weaponType = data.weaponType || 'melee'; // melee | ranged，仅武器有效
        this.quality = data.quality; // common, rare, fine, epic, legendary
        this.level = data.level || 1;
        this.enhanceLevel = data.enhanceLevel || 0; // 强化等级
        this.refineLevel = data.refineLevel || 0; // 精炼等级（0-5）
        this.baseStats = JSON.parse(JSON.stringify(data.stats || {})); // 基础属性（用于强化计算）
        this.stats = data.stats || {};
        // 根据部位设置默认词条
        if (this.slot === 'weapon') {
            this.stats.attack = this.stats.attack || 0;
            this.stats.critRate = this.stats.critRate || 0;
            this.stats.critDamage = this.stats.critDamage || 0;
        } else if (['helmet', 'chest', 'legs', 'boots'].includes(this.slot)) {
            this.stats.health = this.stats.health || 0;
            this.stats.defense = this.stats.defense || 0;
        } else if (['necklace', 'ring', 'belt'].includes(this.slot)) {
            this.stats.dodge = this.stats.dodge || 0;
            this.stats.attackSpeed = this.stats.attackSpeed || 0;
            this.stats.moveSpeed = this.stats.moveSpeed || 0;
        }
        
        // 保存基础属性
        if (!this.baseStats.attack) this.baseStats.attack = this.stats.attack || 0;
        if (!this.baseStats.critRate) this.baseStats.critRate = this.stats.critRate || 0;
        if (!this.baseStats.critDamage) this.baseStats.critDamage = this.stats.critDamage || 0;
        if (!this.baseStats.health) this.baseStats.health = this.stats.health || 0;
        if (!this.baseStats.defense) this.baseStats.defense = this.stats.defense || 0;
        if (!this.baseStats.dodge) this.baseStats.dodge = this.stats.dodge || 0;
        if (!this.baseStats.attackSpeed) this.baseStats.attackSpeed = this.stats.attackSpeed || 0;
        if (!this.baseStats.moveSpeed) this.baseStats.moveSpeed = this.stats.moveSpeed || 0;
        
        // 应用强化等级
        this.applyEnhancement();
        
        // 应用精炼等级
        if (this.refineLevel > 0) {
            const refineMultiplier = 1 + this.refineLevel * 0.5;
            Object.keys(this.baseStats).forEach(key => {
                if (this.baseStats[key] !== 0) {
                    this.stats[key] = Math.floor(this.baseStats[key] * refineMultiplier);
                }
            });
        }
        
        // 为所有武器添加技能
        if (this.slot === 'weapon') {
            this.skill = this.getWeaponSkill();
            // 初始化精炼效果
            this.refineEffects = this.getWeaponRefineEffects();
        } else {
            this.skill = null;
            this.refineEffects = null;
        }
        
        // 装备词条系统（合铸装备可传入自定义词条）
        if (data.equipmentTraits && typeof data.equipmentTraits === 'object') {
            this.equipmentTraits = data.equipmentTraits;
        } else {
            this.equipmentTraits = this.generateEquipmentTraits();
        }
        
        // 是否为打造的装备（通过配方打造的装备）
        this.isCrafted = data.isCrafted || false;
        // 合铸装备：同时计入多个套装的件数（用于激活两套套装效果）
        this.fusionSetIds = data.fusionSetIds || null;
        // 合铸原材料对稳定键（与两件原料的名称+词条 id 等相关），用于同一存档内复用相同贴图
        this.fusionPairKey = data.fusionPairKey || null;
    }
    
    /**
     * 获取武器精炼效果
     * @param {number} refineLevel - 精炼等级 (1-5)
     * @returns {Object|null} 精炼效果对象
     */
    getRefineEffect(refineLevel) {
        if (!this.refineEffects || refineLevel < 1 || refineLevel > 5) {
            return null;
        }
        return this.refineEffects[refineLevel - 1] || null;
    }
    
    /**
     * 获取武器精炼效果配置（1-5级）
     * @returns {Array} 精炼效果数组，每个元素对应一级精炼效果
     */
    getWeaponRefineEffects() {
        if (this.slot !== 'weapon') return null;
        
        const refineEffectsConfig = {
            // 普通品质武器
            '斑驳铁剑': [
                { // 1级：伤害+10%
                    damageMultiplier: 0.1,
                    description: '伤害+10%'
                },
                { // 2级：伤害+20%，冷却-1秒
                    damageMultiplier: 0.2,
                    cooldownReduction: 1000,
                    description: '伤害+20%，冷却-1秒'
                },
                { // 3级：伤害+30%，冷却-2秒
                    damageMultiplier: 0.3,
                    cooldownReduction: 2000,
                    description: '伤害+30%，冷却-2秒'
                },
                { // 4级：伤害+40%，冷却-3秒，范围+20%
                    damageMultiplier: 0.4,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.2,
                    description: '伤害+40%，冷却-3秒，范围+20%'
                },
                { // 5级：伤害+50%，冷却-4秒，范围+30%，额外造成50%伤害
                    damageMultiplier: 0.5,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.3,
                    extraDamage: 0.5,
                    description: '伤害+50%，冷却-4秒，范围+30%，额外造成50%伤害'
                }
            ],
            '锋锐骑士长剑': [
                { // 1级：伤害+10%，暴击率+5%
                    damageMultiplier: 0.1,
                    critRateBonus: 5,
                    description: '伤害+10%，暴击率+5%'
                },
                { // 2级：伤害+20%，暴击率+10%，冷却-1秒
                    damageMultiplier: 0.2,
                    critRateBonus: 10,
                    cooldownReduction: 1000,
                    description: '伤害+20%，暴击率+10%，冷却-1秒'
                },
                { // 3级：伤害+30%，暴击率+15%，冷却-2秒，暴击伤害+20%
                    damageMultiplier: 0.3,
                    critRateBonus: 15,
                    critDamageBonus: 0.2,
                    cooldownReduction: 2000,
                    description: '伤害+30%，暴击率+15%，冷却-2秒，暴击伤害+20%'
                },
                { // 4级：伤害+40%，暴击率+20%，冷却-3秒，暴击伤害+30%，范围+20%
                    damageMultiplier: 0.4,
                    critRateBonus: 20,
                    critDamageBonus: 0.3,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.2,
                    description: '伤害+40%，暴击率+20%，冷却-3秒，暴击伤害+30%，范围+20%'
                },
                { // 5级：伤害+50%，暴击率+25%，冷却-4秒，暴击伤害+50%，范围+30%，必定暴击
                    damageMultiplier: 0.5,
                    critRateBonus: 25,
                    critDamageBonus: 0.5,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.3,
                    guaranteedCrit: true,
                    description: '伤害+50%，暴击率+25%，冷却-4秒，暴击伤害+50%，范围+30%，必定暴击'
                }
            ],
            
            // 稀有品质武器
            '淬火精钢剑': [
                { // 1级：伤害+10%，移速提升+5%
                    damageMultiplier: 0.1,
                    speedBoostBonus: 0.05,
                    description: '伤害+10%，移速提升+5%'
                },
                { // 2级：伤害+20%，移速提升+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    speedBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，移速提升+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，移速提升+15%，持续时间+2秒，冷却-1秒
                    damageMultiplier: 0.3,
                    speedBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    description: '伤害+30%，移速提升+15%，持续时间+2秒，冷却-1秒'
                },
                { // 4级：伤害+40%，移速提升+20%，持续时间+3秒，冷却-2秒，范围+20%，附加持续伤害
                    damageMultiplier: 0.4,
                    speedBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    dotDamage: 0.05,
                    dotDuration: 3000,
                    description: '伤害+40%，移速提升+20%，持续时间+3秒，冷却-2秒，范围+20%，附加持续伤害'
                },
                { // 5级：伤害+50%，移速提升+30%，持续时间+4秒，冷却-3秒，范围+30%，持续伤害翻倍，技能后3秒内攻击附加火焰伤害
                    damageMultiplier: 0.5,
                    speedBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    dotDamage: 0.1,
                    dotDuration: 3000,
                    postSkillFireDamage: 0.2,
                    postSkillFireDuration: 3000,
                    description: '伤害+50%，移速提升+30%，持续时间+4秒，冷却-3秒，范围+30%，持续伤害翻倍，技能后3秒内攻击附加20%火焰伤害'
                }
            ],
            '幽冥绝影刃': [
                { // 1级：伤害+10%，闪避率+5%
                    damageMultiplier: 0.1,
                    dodgeBoostBonus: 0.05,
                    description: '伤害+10%，闪避率+5%'
                },
                { // 2级：伤害+20%，闪避率+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    dodgeBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，闪避率+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，闪避率+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    dodgeBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，闪避率+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，闪避率+20%，持续时间+3秒，冷却-2秒，范围+30%，闪避后下次攻击必定暴击
                    damageMultiplier: 0.4,
                    dodgeBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    dodgeCritBonus: true,
                    description: '伤害+40%，闪避率+20%，持续时间+3秒，冷却-2秒，范围+30%，闪避后下次攻击必定暴击'
                },
                { // 5级：伤害+50%，闪避率+30%，持续时间+4秒，冷却-3秒，范围+40%，闪避后3秒内无敌，技能可穿透敌人
                    damageMultiplier: 0.5,
                    dodgeBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    dodgeCritBonus: true,
                    dodgeInvincibleDuration: 3000,
                    pierce: true,
                    description: '伤害+50%，闪避率+30%，持续时间+4秒，冷却-3秒，范围+40%，闪避后3秒内无敌，技能可穿透敌人'
                }
            ],
            '鸣霜青铜剑': [
                { // 1级：伤害+10%，减速效果+5%
                    damageMultiplier: 0.1,
                    slowEffectBonus: 0.05,
                    description: '伤害+10%，减速效果+5%'
                },
                { // 2级：伤害+20%，减速效果+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    slowEffectBonus: 0.1,
                    debuffDurationBonus: 1000,
                    description: '伤害+20%，减速效果+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，减速效果+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    slowEffectBonus: 0.15,
                    debuffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，减速效果+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，减速效果+20%，持续时间+3秒，冷却-2秒，范围+30%，减速叠加
                    damageMultiplier: 0.4,
                    slowEffectBonus: 0.2,
                    debuffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    slowStackable: true,
                    description: '伤害+40%，减速效果+20%，持续时间+3秒，冷却-2秒，范围+30%，减速叠加'
                },
                { // 5级：伤害+50%，减速效果+30%，持续时间+4秒，冷却-3秒，范围+40%，减速叠加，减速达到50%时冰冻敌人
                    damageMultiplier: 0.5,
                    slowEffectBonus: 0.3,
                    debuffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    slowStackable: true,
                    slowToFreeze: 0.5,
                    freezeDuration: 2000,
                    description: '伤害+50%，减速效果+30%，持续时间+4秒，冷却-3秒，范围+40%，减速叠加，减速达到50%时冰冻敌人2秒'
                }
            ],
            
            // 精良品质武器
            '辉光秘银刃': [
                { // 1级：伤害+10%，暴击伤害+10%
                    damageMultiplier: 0.1,
                    critDamageBonus: 0.1,
                    description: '伤害+10%，暴击伤害+10%'
                },
                { // 2级：伤害+20%，暴击伤害+20%，冷却-1秒
                    damageMultiplier: 0.2,
                    critDamageBonus: 0.2,
                    cooldownReduction: 1000,
                    description: '伤害+20%，暴击伤害+20%，冷却-1秒'
                },
                { // 3级：伤害+30%，暴击伤害+30%，冷却-2秒，范围+20%，暴击时触发连锁闪电
                    damageMultiplier: 0.3,
                    critDamageBonus: 0.3,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    chainLightning: true,
                    chainDamage: 0.5,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    description: '伤害+30%，暴击伤害+30%，冷却-2秒，范围+20%，暴击时触发连锁闪电'
                },
                { // 4级：伤害+40%，暴击伤害+40%，冷却-3秒，范围+30%，连锁闪电伤害+50%，可连锁2次
                    damageMultiplier: 0.4,
                    critDamageBonus: 0.4,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    chainLightning: true,
                    chainDamage: 0.75,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    chainCount: 2,
                    description: '伤害+40%，暴击伤害+40%，冷却-3秒，范围+30%，连锁闪电伤害+75%，可连锁2次'
                },
                { // 5级：伤害+50%，暴击伤害+50%，冷却-4秒，范围+40%，连锁闪电伤害+100%，可连锁3次，暴击必定触发
                    damageMultiplier: 0.5,
                    critDamageBonus: 0.5,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    chainLightning: true,
                    chainDamage: 1.0,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    chainCount: 3,
                    guaranteedChain: true,
                    description: '伤害+50%，暴击伤害+50%，冷却-4秒，范围+40%，连锁闪电伤害+100%，可连锁3次，暴击必定触发'
                }
            ],
            '逐月银芒剑': [
                { // 1级：伤害+10%，攻击速度+5%
                    damageMultiplier: 0.1,
                    attackSpeedBoostBonus: 0.05,
                    description: '伤害+10%，攻击速度+5%'
                },
                { // 2级：伤害+20%，攻击速度+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    attackSpeedBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，攻击速度+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，攻击速度+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    attackSpeedBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，攻击速度+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，攻击速度+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击速度提升时移动速度也提升
                    damageMultiplier: 0.4,
                    attackSpeedBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    attackSpeedAlsoBoostsMoveSpeed: true,
                    description: '伤害+40%，攻击速度+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击速度提升时移动速度也提升'
                },
                { // 5级：伤害+50%，攻击速度+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击速度提升时移动速度也提升，技能命中敌人后重置普通攻击冷却
                    damageMultiplier: 0.5,
                    attackSpeedBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    attackSpeedAlsoBoostsMoveSpeed: true,
                    resetAttackCooldown: true,
                    description: '伤害+50%，攻击速度+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击速度提升时移动速度也提升，技能命中敌人后重置普通攻击冷却'
                }
            ],
            '晶曜寒锋': [
                { // 1级：伤害+10%，冰冻持续时间+0.5秒
                    damageMultiplier: 0.1,
                    freezeDurationBonus: 500,
                    description: '伤害+10%，冰冻持续时间+0.5秒'
                },
                { // 2级：伤害+20%，冰冻持续时间+1秒，冷却-1秒
                    damageMultiplier: 0.2,
                    freezeDurationBonus: 1000,
                    cooldownReduction: 1000,
                    description: '伤害+20%，冰冻持续时间+1秒，冷却-1秒'
                },
                { // 3级：伤害+30%，冰冻持续时间+1.5秒，冷却-2秒，范围+20%，冰冻时造成额外伤害
                    damageMultiplier: 0.3,
                    freezeDurationBonus: 1500,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    freezeExtraDamage: 0.3,
                    description: '伤害+30%，冰冻持续时间+1.5秒，冷却-2秒，范围+20%，冰冻时造成额外30%伤害'
                },
                { // 4级：伤害+40%，冰冻持续时间+2秒，冷却-3秒，范围+30%，冰冻时造成额外50%伤害，冰冻可扩散
                    damageMultiplier: 0.4,
                    freezeDurationBonus: 2000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    freezeExtraDamage: 0.5,
                    freezeSpread: true,
                    freezeSpreadRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    description: '伤害+40%，冰冻持续时间+2秒，冷却-3秒，范围+30%，冰冻时造成额外50%伤害，冰冻可扩散'
                },
                { // 5级：伤害+50%，冰冻持续时间+3秒，冷却-4秒，范围+40%，冰冻时造成额外100%伤害，冰冻可扩散，冰冻敌人死亡时爆炸造成范围伤害
                    damageMultiplier: 0.5,
                    freezeDurationBonus: 3000,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    freezeExtraDamage: 1.0,
                    freezeSpread: true,
                    freezeSpreadRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    freezeExplosion: true,
                    freezeExplosionDamage: 0.5,
                    freezeExplosionRange: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                    description: '伤害+50%，冰冻持续时间+3秒，冷却-4秒，范围+40%，冰冻时造成额外100%伤害，冰冻可扩散，冰冻敌人死亡时爆炸造成50%范围伤害'
                }
            ],
            
            // 史诗品质武器
            '逆鳞屠龙锋': [
                { // 1级：伤害+10%，持续伤害+2%
                    damageMultiplier: 0.1,
                    dotDamageBonus: 0.02,
                    description: '伤害+10%，持续伤害+2%'
                },
                { // 2级：伤害+20%，持续伤害+4%，持续时间+1秒
                    damageMultiplier: 0.2,
                    dotDamageBonus: 0.04,
                    dotDurationBonus: 1000,
                    description: '伤害+20%，持续伤害+4%，持续时间+1秒'
                },
                { // 3级：伤害+30%，持续伤害+6%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    dotDamageBonus: 0.06,
                    dotDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，持续伤害+6%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，持续伤害+8%，持续时间+3秒，冷却-2秒，范围+30%，持续伤害可叠加
                    damageMultiplier: 0.4,
                    dotDamageBonus: 0.08,
                    dotDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    dotStackable: true,
                    description: '伤害+40%，持续伤害+8%，持续时间+3秒，冷却-2秒，范围+30%，持续伤害可叠加'
                },
                { // 5级：伤害+50%，持续伤害+10%，持续时间+4秒，冷却-3秒，范围+40%，持续伤害可叠加，持续伤害达到5层时触发爆炸
                    damageMultiplier: 0.5,
                    dotDamageBonus: 0.1,
                    dotDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    dotStackable: true,
                    dotExplosionThreshold: 5,
                    dotExplosionDamage: 2.0,
                    dotExplosionRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    description: '伤害+50%，持续伤害+10%，持续时间+4秒，冷却-3秒，范围+40%，持续伤害可叠加，持续伤害达到5层时触发200%爆炸伤害'
                }
            ],
            '劫火焚伤': [
                { // 1级：伤害+10%，攻击力提升+5%
                    damageMultiplier: 0.1,
                    attackBoostBonus: 0.05,
                    description: '伤害+10%，攻击力提升+5%'
                },
                { // 2级：伤害+20%，攻击力提升+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    attackBoostBonus: 0.1,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，攻击力提升+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，攻击力提升+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    attackBoostBonus: 0.15,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，攻击力提升+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，攻击力提升+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升时暴击率也提升
                    damageMultiplier: 0.4,
                    attackBoostBonus: 0.2,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    attackBoostAlsoBoostsCrit: true,
                    critRateFromAttackBoost: 0.15,
                    description: '伤害+40%，攻击力提升+20%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升时暴击率也提升15%'
                },
                { // 5级：伤害+50%，攻击力提升+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升时暴击率也提升，技能命中敌人后刷新攻击力提升持续时间
                    damageMultiplier: 0.5,
                    attackBoostBonus: 0.3,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    attackBoostAlsoBoostsCrit: true,
                    critRateFromAttackBoost: 0.25,
                    refreshAttackBoostOnHit: true,
                    description: '伤害+50%，攻击力提升+30%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升时暴击率也提升25%，技能命中敌人后刷新攻击力提升持续时间'
                }
            ],
            '凛冬之拥': [
                { // 1级：伤害+10%，敌人攻击速度降低+5%
                    damageMultiplier: 0.1,
                    enemySlowEffectBonus: 0.05,
                    description: '伤害+10%，敌人攻击速度降低+5%'
                },
                { // 2级：伤害+20%，敌人攻击速度降低+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    enemySlowEffectBonus: 0.1,
                    debuffDurationBonus: 1000,
                    description: '伤害+20%，敌人攻击速度降低+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，敌人攻击速度降低+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    enemySlowEffectBonus: 0.15,
                    debuffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，敌人攻击速度降低+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，敌人攻击速度降低+20%，持续时间+3秒，冷却-2秒，范围+30%，减速可叠加，减速敌人时提升自身防御
                    damageMultiplier: 0.4,
                    enemySlowEffectBonus: 0.2,
                    debuffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    enemySlowStackable: true,
                    defenseBoostFromSlow: 0.1,
                    description: '伤害+40%，敌人攻击速度降低+20%，持续时间+3秒，冷却-2秒，范围+30%，减速可叠加，减速敌人时提升自身10%防御'
                },
                { // 5级：伤害+50%，敌人攻击速度降低+30%，持续时间+4秒，冷却-3秒，范围+40%，减速可叠加，减速敌人时提升自身防御，减速达到50%时冰冻敌人
                    damageMultiplier: 0.5,
                    enemySlowEffectBonus: 0.3,
                    debuffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    enemySlowStackable: true,
                    defenseBoostFromSlow: 0.2,
                    slowToFreeze: 0.5,
                    freezeDuration: 2000,
                    description: '伤害+50%，敌人攻击速度降低+30%，持续时间+4秒，冷却-3秒，范围+40%，减速可叠加，减速敌人时提升自身20%防御，减速达到50%时冰冻敌人2秒'
                }
            ],
            
            // 传说品质武器
            '圣耀·断罪': [
                { // 1级：伤害+10%，冷却-1秒
                    damageMultiplier: 0.1,
                    cooldownReduction: 1000,
                    description: '伤害+10%，冷却-1秒'
                },
                { // 2级：伤害+20%，冷却-2秒，范围+10%
                    damageMultiplier: 0.2,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.1,
                    description: '伤害+20%，冷却-2秒，范围+10%'
                },
                { // 3级：伤害+30%，冷却-3秒，范围+20%，暴击伤害+50%
                    damageMultiplier: 0.3,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.2,
                    critDamageBonus: 0.5,
                    description: '伤害+30%，冷却-3秒，范围+20%，暴击伤害+50%'
                },
                { // 4级：伤害+40%，冷却-4秒，范围+30%，暴击伤害+100%，技能命中敌人后减少所有技能冷却时间
                    damageMultiplier: 0.4,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.3,
                    critDamageBonus: 1.0,
                    reduceAllCooldownsOnHit: 2000,
                    description: '伤害+40%，冷却-4秒，范围+30%，暴击伤害+100%，技能命中敌人后减少所有技能冷却时间2秒'
                },
                { // 5级：伤害+50%，冷却-5秒，范围+40%，暴击伤害+150%，技能命中敌人后减少所有技能冷却时间，击杀敌人后重置技能冷却
                    damageMultiplier: 0.5,
                    cooldownReduction: 5000,
                    rangeMultiplier: 0.4,
                    critDamageBonus: 1.5,
                    reduceAllCooldownsOnHit: 3000,
                    resetCooldownOnKill: true,
                    description: '伤害+50%，冷却-5秒，范围+40%，暴击伤害+150%，技能命中敌人后减少所有技能冷却时间3秒，击杀敌人后重置技能冷却'
                }
            ],
            '惊雷破晓': [
                { // 1级：伤害+10%，全属性提升+3%
                    damageMultiplier: 0.1,
                    allStatsBoostBonus: 0.03,
                    description: '伤害+10%，全属性提升+3%'
                },
                { // 2级：伤害+20%，全属性提升+6%，持续时间+1秒
                    damageMultiplier: 0.2,
                    allStatsBoostBonus: 0.06,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，全属性提升+6%，持续时间+1秒'
                },
                { // 3级：伤害+30%，全属性提升+9%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    allStatsBoostBonus: 0.09,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，全属性提升+9%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，全属性提升+12%，持续时间+3秒，冷却-2秒，范围+30%，全属性提升时免疫控制效果
                    damageMultiplier: 0.4,
                    allStatsBoostBonus: 0.12,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    immuneToCC: true,
                    description: '伤害+40%，全属性提升+12%，持续时间+3秒，冷却-2秒，范围+30%，全属性提升时免疫控制效果'
                },
                { // 5级：伤害+50%，全属性提升+15%，持续时间+4秒，冷却-3秒，范围+40%，全属性提升时免疫控制效果，技能命中敌人后触发连锁闪电
                    damageMultiplier: 0.5,
                    allStatsBoostBonus: 0.15,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    immuneToCC: true,
                    chainLightning: true,
                    chainDamage: 0.8,
                    chainRange: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                    chainCount: 3,
                    description: '伤害+50%，全属性提升+15%，持续时间+4秒，冷却-3秒，范围+40%，全属性提升时免疫控制效果，技能命中敌人后触发连锁闪电（80%伤害，3次）'
                }
            ],
            '坠星裁决': [
                { // 1级：伤害+10%，生命恢复+5%
                    damageMultiplier: 0.1,
                    healPercentBonus: 0.05,
                    description: '伤害+10%，生命恢复+5%'
                },
                { // 2级：伤害+20%，生命恢复+10%，冷却-1秒
                    damageMultiplier: 0.2,
                    healPercentBonus: 0.1,
                    cooldownReduction: 1000,
                    description: '伤害+20%，生命恢复+10%，冷却-1秒'
                },
                { // 3级：伤害+30%，生命恢复+15%，冷却-2秒，范围+20%，恢复生命时提升攻击力
                    damageMultiplier: 0.3,
                    healPercentBonus: 0.15,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    healBoostsAttack: true,
                    healAttackBoost: 0.1,
                    healAttackBoostDuration: 5000,
                    description: '伤害+30%，生命恢复+15%，冷却-2秒，范围+20%，恢复生命时提升10%攻击力5秒'
                },
                { // 4级：伤害+40%，生命恢复+20%，冷却-3秒，范围+30%，恢复生命时提升攻击力，技能命中敌人后恢复生命
                    damageMultiplier: 0.4,
                    healPercentBonus: 0.2,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    healBoostsAttack: true,
                    healAttackBoost: 0.15,
                    healAttackBoostDuration: 5000,
                    healOnHit: 0.05,
                    description: '伤害+40%，生命恢复+20%，冷却-3秒，范围+30%，恢复生命时提升15%攻击力5秒，技能命中敌人后恢复5%最大生命值'
                },
                { // 5级：伤害+50%，生命恢复+25%，冷却-4秒，范围+40%，恢复生命时提升攻击力，技能命中敌人后恢复生命，生命值低于50%时技能伤害翻倍
                    damageMultiplier: 0.5,
                    healPercentBonus: 0.25,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    healBoostsAttack: true,
                    healAttackBoost: 0.2,
                    healAttackBoostDuration: 5000,
                    healOnHit: 0.1,
                    lowHpDamageBonus: true,
                    lowHpThreshold: 0.5,
                    lowHpDamageMultiplier: 2.0,
                    description: '伤害+50%，生命恢复+25%，冷却-4秒，范围+40%，恢复生命时提升20%攻击力5秒，技能命中敌人后恢复10%最大生命值，生命值低于50%时技能伤害翻倍'
                }
            ],
            
            // 打造武器精炼效果
            '精钢长剑': [
                { // 1级：伤害+10%，攻击力提升+3%
                    damageMultiplier: 0.1,
                    attackBoostBonus: 0.03,
                    description: '伤害+10%，攻击力提升+3%'
                },
                { // 2级：伤害+20%，攻击力提升+6%，持续时间+1秒
                    damageMultiplier: 0.2,
                    attackBoostBonus: 0.06,
                    buffDurationBonus: 1000,
                    description: '伤害+20%，攻击力提升+6%，持续时间+1秒'
                },
                { // 3级：伤害+30%，攻击力提升+9%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    attackBoostBonus: 0.09,
                    buffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，攻击力提升+9%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，攻击力提升+12%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升可叠加2层
                    damageMultiplier: 0.4,
                    attackBoostBonus: 0.12,
                    buffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    attackBoostStackable: true,
                    attackBoostMaxStacks: 2,
                    description: '伤害+40%，攻击力提升+12%，持续时间+3秒，冷却-2秒，范围+30%，攻击力提升可叠加2层'
                },
                { // 5级：伤害+50%，攻击力提升+15%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升可叠加2层，技能命中敌人后额外提升攻击力
                    damageMultiplier: 0.5,
                    attackBoostBonus: 0.15,
                    buffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    attackBoostStackable: true,
                    attackBoostMaxStacks: 2,
                    attackBoostOnHit: 0.1,
                    description: '伤害+50%，攻击力提升+15%，持续时间+4秒，冷却-3秒，范围+40%，攻击力提升可叠加2层，技能命中敌人后额外提升10%攻击力'
                }
            ],
            '魔法水晶剑': [
                { // 1级：伤害+10%，范围伤害+5%
                    damageMultiplier: 0.1,
                    aoeDamageBonus: 0.05,
                    description: '伤害+10%，范围伤害+5%'
                },
                { // 2级：伤害+20%，范围伤害+10%，冷却-1秒
                    damageMultiplier: 0.2,
                    aoeDamageBonus: 0.1,
                    cooldownReduction: 1000,
                    description: '伤害+20%，范围伤害+10%，冷却-1秒'
                },
                { // 3级：伤害+30%，范围伤害+15%，冷却-2秒，范围+20%，魔法爆炸范围扩大
                    damageMultiplier: 0.3,
                    aoeDamageBonus: 0.15,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.2,
                    aoeRangeBonus: 0.2,
                    description: '伤害+30%，范围伤害+15%，冷却-2秒，范围+20%，魔法爆炸范围扩大20%'
                },
                { // 4级：伤害+40%，范围伤害+20%，冷却-3秒，范围+30%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸
                    damageMultiplier: 0.4,
                    aoeDamageBonus: 0.2,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.3,
                    aoeRangeBonus: 0.3,
                    chainExplosion: true,
                    chainExplosionDamage: 0.5,
                    description: '伤害+40%，范围伤害+20%，冷却-3秒，范围+30%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸（50%伤害）'
                },
                { // 5级：伤害+50%，范围伤害+25%，冷却-4秒，范围+40%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸，技能必定触发魔法爆炸词条效果
                    damageMultiplier: 0.5,
                    aoeDamageBonus: 0.25,
                    cooldownReduction: 4000,
                    rangeMultiplier: 0.4,
                    aoeRangeBonus: 0.4,
                    chainExplosion: true,
                    chainExplosionDamage: 0.75,
                    guaranteedCrystalMagic: true,
                    description: '伤害+50%，范围伤害+25%，冷却-4秒，范围+40%，魔法爆炸范围扩大，爆炸命中敌人后触发二次爆炸（75%伤害），技能必定触发魔法爆炸词条效果'
                }
            ],
            '远古龙刃': [
                { // 1级：伤害+10%，持续伤害+3%
                    damageMultiplier: 0.1,
                    dotDamageBonus: 0.03,
                    description: '伤害+10%，持续伤害+3%'
                },
                { // 2级：伤害+20%，持续伤害+6%，持续时间+1秒
                    damageMultiplier: 0.2,
                    dotDamageBonus: 0.06,
                    dotDurationBonus: 1000,
                    description: '伤害+20%，持续伤害+6%，持续时间+1秒'
                },
                { // 3级：伤害+30%，持续伤害+9%，持续时间+2秒，冷却-1秒，扇形角度+20%
                    damageMultiplier: 0.3,
                    dotDamageBonus: 0.09,
                    dotDurationBonus: 2000,
                    cooldownReduction: 1000,
                    coneAngleBonus: 0.2,
                    description: '伤害+30%，持续伤害+9%，持续时间+2秒，冷却-1秒，扇形角度+20%'
                },
                { // 4级：伤害+40%，持续伤害+12%，持续时间+3秒，冷却-2秒，扇形角度+30%，龙息可穿透敌人
                    damageMultiplier: 0.4,
                    dotDamageBonus: 0.12,
                    dotDurationBonus: 3000,
                    cooldownReduction: 2000,
                    coneAngleBonus: 0.3,
                    pierce: true,
                    description: '伤害+40%，持续伤害+12%，持续时间+3秒，冷却-2秒，扇形角度+30%，龙息可穿透敌人'
                },
                { // 5级：伤害+50%，持续伤害+15%，持续时间+4秒，冷却-3秒，扇形角度+40%，龙息可穿透敌人，技能必定触发龙息词条效果
                    damageMultiplier: 0.5,
                    dotDamageBonus: 0.15,
                    dotDurationBonus: 4000,
                    cooldownReduction: 3000,
                    coneAngleBonus: 0.4,
                    pierce: true,
                    guaranteedDragonBreath: true,
                    description: '伤害+50%，持续伤害+15%，持续时间+4秒，冷却-3秒，扇形角度+40%，龙息可穿透敌人，技能必定触发龙息词条效果'
                }
            ],
            '混沌之刃': [
                { // 1级：伤害+10%，敌人属性降低+5%
                    damageMultiplier: 0.1,
                    enemyDebuffBonus: 0.05,
                    description: '伤害+10%，敌人属性降低+5%'
                },
                { // 2级：伤害+20%，敌人属性降低+10%，持续时间+1秒
                    damageMultiplier: 0.2,
                    enemyDebuffBonus: 0.1,
                    debuffDurationBonus: 1000,
                    description: '伤害+20%，敌人属性降低+10%，持续时间+1秒'
                },
                { // 3级：伤害+30%，敌人属性降低+15%，持续时间+2秒，冷却-1秒，范围+20%
                    damageMultiplier: 0.3,
                    enemyDebuffBonus: 0.15,
                    debuffDurationBonus: 2000,
                    cooldownReduction: 1000,
                    rangeMultiplier: 0.2,
                    description: '伤害+30%，敌人属性降低+15%，持续时间+2秒，冷却-1秒，范围+20%'
                },
                { // 4级：伤害+40%，敌人属性降低+20%，持续时间+3秒，冷却-2秒，范围+30%，debuff可叠加
                    damageMultiplier: 0.4,
                    enemyDebuffBonus: 0.2,
                    debuffDurationBonus: 3000,
                    cooldownReduction: 2000,
                    rangeMultiplier: 0.3,
                    debuffStackable: true,
                    description: '伤害+40%，敌人属性降低+20%，持续时间+3秒，冷却-2秒，范围+30%，debuff可叠加'
                },
                { // 5级：伤害+50%，敌人属性降低+25%，持续时间+4秒，冷却-3秒，范围+40%，debuff可叠加，技能必定触发混沌词条效果，debuff达到3层时造成额外伤害
                    damageMultiplier: 0.5,
                    enemyDebuffBonus: 0.25,
                    debuffDurationBonus: 4000,
                    cooldownReduction: 3000,
                    rangeMultiplier: 0.4,
                    debuffStackable: true,
                    guaranteedChaosBlade: true,
                    debuffExplosionThreshold: 3,
                    debuffExplosionDamage: 1.5,
                    description: '伤害+50%，敌人属性降低+25%，持续时间+4秒，冷却-3秒，范围+40%，debuff可叠加，技能必定触发混沌词条效果，debuff达到3层时造成150%额外伤害'
                }
            ],
            // 远程武器精炼效果（1–5级：伤害/射程/冷却）
            '猎风短弓': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '幽影弩': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '曦光长弓': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '穿云破月': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ],
            '永夜·星坠': [ { damageMultiplier: 0.1, description: '伤害+10%' }, { damageMultiplier: 0.2, rangeMultiplier: 0.05, description: '伤害+20%，射程+5%' }, { damageMultiplier: 0.3, rangeMultiplier: 0.1, cooldownReduction: 500, description: '伤害+30%，射程+10%，冷却-0.5秒' }, { damageMultiplier: 0.4, rangeMultiplier: 0.15, cooldownReduction: 1000, description: '伤害+40%，射程+15%，冷却-1秒' }, { damageMultiplier: 0.5, rangeMultiplier: 0.2, cooldownReduction: 1500, description: '伤害+50%，射程+20%，冷却-1.5秒' } ]
        };
        
        return refineEffectsConfig[this.name] || null;
    }
    
    /**
     * 根据武器名称和品质获取技能定义
     * @returns {Object|null} 技能对象，包含名称、冷却时间、效果等
     */
    getWeaponSkill() {
        // 根据武器名称匹配特定技能
        const weaponSkills = {
            // 普通品质武器技能
            '斑驳铁剑': {
                name: '崩山击',
                cooldown: 8000, // 8秒冷却
                description: '对目标造成150%攻击力伤害',
                damageMultiplier: 1.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.0
            },
            '锋锐骑士长剑': {
                name: '银芒贯刺',
                cooldown: 8000,
                description: '对目标造成160%攻击力伤害，小幅提升暴击率',
                damageMultiplier: 1.6,
                critBonus: 0.2,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1
            },
            
            // 稀有品质武器技能
            '淬火精钢剑': {
                name: '赤炎斩',
                cooldown: 9000, // 9秒冷却
                description: '对目标造成180%攻击力伤害，并提升移动速度',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                speedBoost: 0.2, // 提升20%移动速度
                speedBoostDuration: 3000 // 持续3秒
            },
            '幽冥绝影刃': {
                name: '幽冥闪袭',
                cooldown: 9000,
                description: '对目标造成175%攻击力伤害，提升闪避率',
                damageMultiplier: 1.75,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2,
                dodgeBoost: 0.15, // 提升15%闪避率
                dodgeBoostDuration: 3000
            },
            '鸣霜青铜剑': {
                name: '凛冬刺',
                cooldown: 9000,
                description: '对目标造成180%攻击力伤害，并降低目标移动速度',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                slowEffect: 0.3, // 降低30%移动速度
                slowDuration: 2000 // 持续2秒
            },
            
            // 精良品质武器技能
            '辉光秘银刃': {
                name: '鸣雷裁决',
                cooldown: 10000, // 10秒冷却
                description: '对目标造成200%攻击力伤害，并额外造成50%暴击伤害',
                damageMultiplier: 2.0,
                critBonus: 0.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2
            },
            '逐月银芒剑': {
                name: '银月弧光',
                cooldown: 10000,
                description: '对周围敌人造成180%攻击力伤害，提升攻击速度',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                attackSpeedBoost: 0.25, // 提升25%攻击速度
                attackSpeedBoostDuration: 4000
            },
            '晶曜寒锋': {
                name: '霜华碎灭',
                cooldown: 10000,
                description: '对目标造成195%攻击力伤害，并附加冰冻效果',
                damageMultiplier: 1.95,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2,
                freezeEffect: true,
                freezeDuration: 1500 // 冰冻1.5秒
            },
            
            // 史诗品质武器技能
            '逆鳞屠龙锋': {
                name: '龙炎漩涡',
                cooldown: 12000, // 12秒冷却
                description: '对周围所有敌人造成250%攻击力伤害，并附加持续伤害',
                damageMultiplier: 2.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                dotDamage: 0.1, // 持续伤害：每秒10%攻击力
                dotDuration: 3000 // 持续3秒
            },
            '劫火焚伤': {
                name: '烬灭天火',
                cooldown: 12000,
                description: '对周围所有敌人造成240%攻击力伤害，并提升自身攻击力',
                damageMultiplier: 2.4,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                attackBoost: 0.2, // 提升20%攻击力
                attackBoostDuration: 5000
            },
            '凛冬之拥': {
                name: '永冻新星',
                cooldown: 12000,
                description: '对周围所有敌人造成245%攻击力伤害，并降低敌人攻击速度',
                damageMultiplier: 2.45,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                enemySlowEffect: 0.4, // 降低敌人40%攻击速度
                slowDuration: 4000
            },
            
            // 传说品质武器技能
            '圣耀·断罪': {
                name: '神裁',
                cooldown: 15000, // 15秒冷却
                description: '对周围所有敌人造成300%攻击力伤害，必定暴击',
                damageMultiplier: 3.0,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                guaranteedCrit: true
            },
            '惊雷破晓': {
                name: '万钧雷狱',
                cooldown: 15000,
                description: '对周围所有敌人造成280%攻击力伤害，并提升自身所有属性',
                damageMultiplier: 2.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                allStatsBoost: 0.15, // 提升15%所有属性
                allStatsBoostDuration: 6000
            },
            '坠星裁决': {
                name: '星坠审判',
                cooldown: 15000,
                description: '对周围所有敌人造成290%攻击力伤害，并恢复生命值',
                damageMultiplier: 2.9,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                healPercent: 0.2 // 恢复20%最大生命值
            },
            
            // 打造武器技能
            '精钢长剑': {
                name: '钢魂崩击',
                cooldown: 8500,
                description: '对目标造成180%攻击力伤害，并提升15%攻击力，持续5秒',
                damageMultiplier: 1.8,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1,
                attackBoost: 0.15,
                attackBoostDuration: 5000
            },
            '魔法水晶剑': {
                name: '魔晶绽裂',
                cooldown: 10000,
                description: '对目标及周围敌人造成200%攻击力伤害，并附加魔法爆炸效果',
                damageMultiplier: 2.0,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.5,
                aoeDamage: 0.8 // 周围敌人受到80%伤害
            },
            '远古龙刃': {
                name: '古龙吐息',
                cooldown: 12000,
                description: '向前方扇形区域释放龙息，造成250%攻击力伤害，并附加持续火焰伤害',
                damageMultiplier: 2.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                dotDamage: 0.15, // 持续伤害：每秒15%攻击力
                dotDuration: 4000 // 持续4秒
            },
            '混沌之刃': {
                name: '虚空崩解',
                cooldown: 15000,
                description: '对周围所有敌人造成320%攻击力伤害，并降低敌人30%所有属性，持续5秒',
                damageMultiplier: 3.2,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                enemyDebuff: 0.3, // 降低30%所有属性
                debuffDuration: 5000
            },
            // 远程武器技能（射程使用 PLAYER_RANGED_ATTACK_RANGE）
            '猎风短弓': { name: '追风箭', cooldown: 8000, description: '对锁定目标造成150%攻击力伤害', damageMultiplier: 1.5, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0 },
            '幽影弩': { name: '暗影贯穿', cooldown: 9000, description: '对锁定目标造成175%攻击力伤害', damageMultiplier: 1.75, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0 },
            '曦光长弓': { name: '破晓之矢', cooldown: 10000, description: '对锁定目标造成200%攻击力伤害', damageMultiplier: 2.0, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0 },
            '穿云破月': { name: '贯月连珠', cooldown: 12000, description: '对锁定目标造成250%攻击力伤害', damageMultiplier: 2.5, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0 },
            '永夜·星坠': { name: '星陨', cooldown: 15000, description: '对锁定目标造成300%攻击力伤害', damageMultiplier: 3.0, range: (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220) * 1.0 }
        };
        
        // 优先匹配武器名称，如果没有匹配则根据品质使用默认技能
        if (weaponSkills[this.name]) {
            return weaponSkills[this.name];
        }
        
        // 品质默认技能（作为后备，名称与武器技能区分开以免图标雷同）
        const qualitySkills = {
            common: {
                name: '破势一击',
                cooldown: 8000,
                description: '对目标造成150%攻击力伤害',
                damageMultiplier: 1.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.0
            },
            rare: {
                name: '战意迸发',
                cooldown: 9000,
                description: '对目标造成175%攻击力伤害',
                damageMultiplier: 1.75,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.1
            },
            fine: {
                name: '闪霆',
                cooldown: 10000,
                description: '对目标造成200%攻击力伤害，并额外造成50%暴击伤害',
                damageMultiplier: 2.0,
                critBonus: 0.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 1.2
            },
            epic: {
                name: '炎狱风暴',
                cooldown: 12000,
                description: '对周围所有敌人造成250%攻击力伤害，并附加持续伤害',
                damageMultiplier: 2.5,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.0,
                dotDamage: 0.1,
                dotDuration: 3000
            },
            legendary: {
                name: '天谴',
                cooldown: 15000,
                description: '对周围所有敌人造成300%攻击力伤害，必定暴击',
                damageMultiplier: 3.0,
                range: CONFIG.PLAYER_ATTACK_RANGE * 2.5,
                guaranteedCrit: true
            }
        };
        
        return qualitySkills[this.quality] || null;
    }
    
    /**
     * 生成装备词条
     * 根据装备名称、品质和部位生成特色词条
     * @returns {Object} 装备词条对象
     */
    generateEquipmentTraits() {
        const traits = {};
        
        // 根据装备名称匹配特定词条
        const nameTraits = {
            // 武器词条
            '斑驳铁剑': { id: 'toughness', description: '坚韧：受到伤害时，有10%概率恢复5%最大生命值' },
            '锋锐骑士长剑': { id: 'knight_spirit', description: '骑士精神：攻击时有15%概率提升10%防御力，持续3秒' },
            '淬火精钢剑': { id: 'quench', description: '淬火：暴击时有20%概率触发额外伤害，造成50%攻击力伤害' },
            '幽冥绝影刃': { id: 'shadow', description: '暗影：闪避攻击后，下次攻击必定暴击' },
            '鸣霜青铜剑': { id: 'frost', description: '霜寒：攻击时有15%概率降低目标20%移动速度，持续2秒' },
            '辉光秘银刃': { id: 'radiance', description: '辉光：每次攻击有10%概率提升15%攻击速度，持续5秒' },
            '逐月银芒剑': { id: 'moonlight', description: '月华：在夜晚（或低血量时）提升20%所有属性' },
            '晶曜寒锋': { id: 'ice_crystal', description: '冰晶：攻击时有20%概率冰冻目标1秒' },
            '逆鳞屠龙锋': { id: 'reverse_scale', description: '逆鳞：生命值低于30%时，攻击力提升30%' },
            '劫火焚伤': { id: 'flame_burn', description: '焚天：击杀敌人后，攻击力提升5%，最多叠加5层' },
            '凛冬之拥': { id: 'winter', description: '极地：受到攻击时，有25%概率降低攻击者30%攻击速度，持续3秒' },
            '圣耀·断罪': { id: 'divine_judgment', description: '圣耀：暴击伤害提升50%，暴击时有30%概率触发范围伤害' },
            '惊雷破晓': { id: 'thunder_god', description: '雷神：攻击时有20%概率触发连锁闪电，对附近敌人造成80%攻击力伤害' },
            '坠星裁决': { id: 'starfall', description: '星辰：每次击杀敌人恢复10%最大生命值，并提升5%所有属性，持续10秒' },
            
            // 打造装备词条（武器）
            '精钢长剑': { id: 'steel_blade', description: '精钢：攻击时有20%概率提升15%攻击力，持续5秒，可叠加2层' },
            '魔法水晶剑': { id: 'crystal_magic', description: '水晶魔法：攻击时有25%概率触发魔法爆炸，对目标及周围敌人造成100%攻击力伤害' },
            '远古龙刃': { id: 'ancient_dragon', description: '龙族之力：每次攻击有15%概率召唤龙息，对前方扇形区域造成150%攻击力伤害' },
            '混沌之刃': { id: 'chaos_blade', description: '混沌：攻击时有30%概率触发混沌之力，造成200%攻击力伤害并降低目标30%所有属性，持续5秒' },
            '猎风短弓': { id: 'hunt_wind', description: '猎风：远程命中时提升5%移速，持续2秒' },
            '幽影弩': { id: 'shadow_crossbow', description: '幽影：远程暴击时额外造成20%伤害' },
            '曦光长弓': { id: 'dawn_bow', description: '曦光：远程攻击有10%概率穿透目标' },
            '穿云破月': { id: 'cloud_pierce', description: '穿云：远程攻击射程+10%' },
            '永夜·星坠': { id: 'starfall_bow', description: '星坠：远程暴击时对目标周围小范围造成50%伤害' },
            
            // 防具词条（头盔）
            '猎手皮帽': { id: 'hunter', description: '猎手：攻击怪物时，有10%概率获得额外经验' },
            '古朴青铜盔': { id: 'ancient', description: '古朴：受到暴击时，有20%概率免疫此次伤害' },
            '坚毅铁盔': { id: 'perseverance', description: '坚毅：生命值低于50%时，防御力提升20%' },
            '骁勇钢盔': { id: 'brave', description: '骁勇：击杀敌人后，攻击力提升3%，最多叠加3层' },
            '龙息战盔': { id: 'dragon_breath_helmet', description: '龙息：受到攻击时，有15%概率对攻击者造成50%攻击力的火焰伤害' },
            '众神冠冕': { id: 'divine_crown', description: '神威：所有属性提升10%，受到致命伤害时有30%概率保留1点生命值' },
            '占星秘法帽': { id: 'astrology', description: '占星：暴击率提升5%，暴击时有10%概率触发额外暴击' },
            '皎月银冠': { id: 'bright_moon', description: '皎月：在低血量时，闪避率提升15%' },
            '莹彻晶盔': { id: 'crystal_helmet', description: '晶化：受到伤害时，有20%概率将30%伤害转化为生命值恢复' },
            '炽焰重盔': { id: 'blazing_helmet', description: '炽焰：攻击时有10%概率对目标造成持续火焰伤害' },
            '绝尘霜盔': { id: 'frost_helmet', description: '霜寒：受到攻击时，有25%概率降低攻击者移动速度' },
            '轰鸣雷冠': { id: 'thunder_crown', description: '雷鸣：攻击时有15%概率触发雷电，对周围敌人造成伤害' },
            '瀚海星冕': { id: 'star_sea', description: '星海：所有技能冷却时间减少15%' },
            
            // 打造装备词条（头盔）
            '神威头盔': { id: 'divine_helmet', description: '神威：所有属性提升12%，受到伤害时有25%概率免疫，击杀敌人后恢复15%最大生命值' },
            
            // 防具词条（胸甲）
            '苦行者长衫': { id: 'ascetic', description: '苦行：受到伤害时，有5%概率恢复10%最大生命值' },
            '斑驳青铜铠': { id: 'mottled', description: '斑驳：防御力提升5%，受到攻击时有10%概率反弹伤害' },
            '荆棘皮甲': { id: 'thorn', description: '荆棘：受到近战攻击时，反弹20%伤害给攻击者' },
            '细密锁子甲': { id: 'chain', description: '锁链：受到攻击时，有15%概率降低攻击者攻击速度' },
            '雄狮板甲': { id: 'lion', description: '雄狮：生命值高于70%时，攻击力提升15%' },
            '咏咒师长袍': { id: 'chant', description: '咏咒：使用技能后，下次攻击伤害提升30%' },
            '逆鳞龙铠': { id: 'reverse_scale_armor', description: '逆鳞：受到致命伤害时，有40%概率免疫此次伤害，冷却60秒' },
            '永恒神威': { id: 'eternal_divine', description: '永恒：每秒恢复1%最大生命值，受到伤害时提升20%防御力' },
            '晶化内衬甲': { id: 'crystal_chest', description: '晶化：受到伤害时，有25%概率将伤害降低50%' },
            '熔岩重铠': { id: 'lava', description: '熔岩：受到攻击时，对周围敌人造成持续火焰伤害' },
            '凛风冰衣': { id: 'cold_wind', description: '凛风：受到攻击时，有30%概率冰冻攻击者1秒' },
            '电光战袍': { id: 'lightning_robe', description: '电光：移动时，有10%概率触发闪电，对路径上的敌人造成伤害' },
            '极星护佑': { id: 'star_guard', description: '极星：所有抗性提升15%，受到元素伤害时恢复生命值' },
            
            // 打造装备词条（胸甲）
            '龙鳞护甲': { id: 'dragon_scale', description: '龙鳞：防御力提升15%，受到攻击时有30%概率反弹50%伤害，并恢复反弹伤害50%的生命值' },
            '秘银战甲': { id: 'mithril_armor', description: '秘银：防御力提升20%，受到伤害时有35%概率将伤害降低60%，并提升10%攻击力，持续5秒' },
            '永恒战甲': { id: 'eternal_armor', description: '永恒：每秒恢复2%最大生命值，受到伤害时提升30%防御力，生命值低于50%时所有属性提升20%' },
            
            // 防具词条（腿甲）
            '游侠布裤': { id: 'ranger', description: '游侠：移动速度提升5%，闪避率提升3%' },
            '沉重青铜卫': { id: 'heavy', description: '沉重：防御力提升8%，但移动速度降低5%' },
            '兽纹皮裤': { id: 'beast_pattern', description: '兽纹：攻击时有10%概率提升15%移动速度，持续3秒' },
            '铁卫护腿': { id: 'iron_guard', description: '铁卫：受到攻击时，有15%概率提升20%防御力，持续5秒' },
            '陷阵重护腿': { id: 'charge', description: '陷阵：生命值低于40%时，攻击力和防御力各提升20%' },
            '龙筋护腿': { id: 'dragon_tendon', description: '龙筋：移动速度提升10%，攻击时有10%概率触发冲刺' },
            '律法圣带': { id: 'law', description: '律法：所有属性提升8%，受到伤害时，有20%概率免疫' },
            '流银护胫': { id: 'flowing_silver', description: '流银：攻击速度提升5%，攻击时有15%概率触发连击' },
            '琉璃晶胫': { id: 'glazed', description: '琉璃：受到伤害时，有20%概率将伤害转化为护盾' },
            '灰烬护足': { id: 'ash', description: '灰烬：击杀敌人后，移动速度提升10%，持续5秒' },
            '疾雷腿甲': { id: 'swift_thunder', description: '疾雷：移动时，有15%概率触发雷电，对周围敌人造成伤害' },
            '银河轨迹': { id: 'galaxy_trail', description: '银河：移动时留下轨迹，对经过的敌人造成持续伤害' },
            
            // 防具词条（足具）
            '旅人草鞋': { id: 'traveler', description: '旅人：移动速度提升8%，脱离战斗后恢复生命值' },
            '坚固青铜靴': { id: 'sturdy', description: '坚固：防御力提升5%，移动速度提升3%' },
            '硬革皮靴': { id: 'hard_leather', description: '硬革：受到攻击时，有10%概率提升15%移动速度' },
            '猎豹疾靴': { id: 'cheetah', description: '猎豹：移动速度提升10%，攻击时有10%概率触发额外攻击' },
            '征战铁靴': { id: 'war', description: '征战：攻击时有15%概率提升20%移动速度，持续3秒' },
            '龙踏云靴': { id: 'cloud_step', description: '云踏：移动时，有10%概率触发瞬移，对路径上的敌人造成伤害' },
            '逐神之迹': { id: 'god_chase', description: '逐神：移动速度提升15%，攻击时有20%概率触发范围伤害' },
            '烁光银靴': { id: 'shimmer', description: '烁光：移动时，有15%概率触发闪光，对周围敌人造成伤害' },
            '踏火余烬': { id: 'fire_trail', description: '余烬：移动时留下火焰轨迹，对经过的敌人造成持续伤害' },
            '凝霜远行': { id: 'frost_walk', description: '凝霜：移动时，有20%概率冰冻路径上的敌人' },
            '迅雷闪步': { id: 'thunder_step', description: '闪步：移动时，有25%概率触发闪电，对周围敌人造成伤害' },
            '星轨漫步': { id: 'star_trail', description: '星轨：移动时，有15%概率触发星辰，对周围敌人造成伤害' },
            
            // 挂饰词条（项链）
            '黄铜勋章': { id: 'medal', description: '勋章：所有属性提升2%' },
            '古遗青铜环': { id: 'ancient_relic', description: '古遗：攻击时有10%概率触发额外伤害' },
            '纯银吊坠': { id: 'silver', description: '纯银：受到伤害时，有10%概率恢复5%最大生命值' },
            '蛮力之源': { id: 'brute_force', description: '蛮力：攻击力提升5%，但防御力降低3%' },
            '黄金契约': { id: 'golden_contract', description: '契约：击杀敌人后，获得额外金币和经验' },
            '龙心垂饰': { id: 'dragon_heart', description: '龙心：生命值低于30%时，每秒恢复5%最大生命值' },
            '诸神眷顾': { id: 'divine_favor', description: '眷顾：所有属性提升12%，受到致命伤害时有25%概率免疫' },
            '月影流光': { id: 'moon_shadow', description: '月影：在低血量时，闪避率和攻击速度各提升15%' },
            '秘法晶髓': { id: 'arcane_core', description: '秘法：技能冷却时间减少10%' },
            '烬灭红莲': { id: 'crimson_lotus', description: '红莲：攻击时有15%概率触发火焰爆炸' },
            '极地永冻': { id: 'eternal_freeze', description: '永冻：攻击时有20%概率冰冻目标，持续2秒' },
            '裂空雷纹': { id: 'thunder_pattern', description: '雷纹：攻击时有20%概率触发连锁闪电' },
            '璀璨星图': { id: 'star_map', description: '星图：所有技能效果提升20%' },
            
            // 挂饰词条（指环）
            '铜制扳指': { id: 'thumb_ring', description: '扳指：攻击速度提升3%' },
            '岁月青铜': { id: 'years', description: '岁月：击杀敌人后，有10%概率获得额外经验' },
            '秘银私语': { id: 'whisper', description: '私语：攻击时有10%概率触发额外攻击' },
            '金权戒律': { id: 'discipline', description: '戒律：暴击率提升5%，暴击伤害提升10%' },
            '迅影之触': { id: 'swift_shadow', description: '迅影：攻击速度提升8%，移动速度提升5%' },
            '龙息之握': { id: 'dragon_breath_ring', description: '龙息：攻击时有15%概率触发火焰伤害' },
            '创世法则': { id: 'creation_law', description: '法则：所有属性提升15%，技能冷却时间减少20%' },
            '孤星寒芒': { id: 'cold_star', description: '寒芒：攻击时有20%概率冰冻目标' },
            '灵能谐振': { id: 'resonance', description: '谐振：技能伤害提升15%' },
            '炎魔之瞳': { id: 'demon_eye', description: '炎魔：攻击时有15%概率触发火焰爆炸' },
            '霜魂凝视': { id: 'frost_soul', description: '霜魂：攻击时有25%概率冰冻目标' },
            '狂雷怒吼': { id: 'thunder_roar', description: '狂雷：攻击时有20%概率触发雷电，对周围敌人造成伤害' },
            '永恒星辰': { id: 'eternal_star', description: '星辰：所有技能效果提升25%' },
            
            // 挂饰词条（腰带）
            '编织腰带': { id: 'woven', description: '编织：所有属性提升1%' },
            '青铜甲带': { id: 'armor_belt', description: '甲带：防御力提升3%' },
            '钢扣皮带': { id: 'steel_buckle', description: '钢扣：攻击力和防御力各提升3%' },
            '铁质束腰': { id: 'iron_belt', description: '束腰：所有属性提升5%' },
            '壁垒腰带': { id: 'fortress', description: '壁垒：防御力提升10%，但攻击力降低5%' },
            '龙革腰带': { id: 'dragon_leather', description: '龙革：生命值提升15%，防御力提升8%' },
            '天庭之束': { id: 'celestial', description: '天庭：所有属性提升12%，受到伤害时，有15%概率免疫' },
            '银翼束带': { id: 'silver_wing', description: '银翼：移动速度和攻击速度各提升5%' },
            '晶纹饰带': { id: 'crystal_pattern', description: '晶纹：受到伤害时，有20%概率将伤害降低30%' },
            '炽炎之环': { id: 'blazing_ring', description: '炽炎：攻击时有10%概率触发火焰伤害' },
            '霜冻之触': { id: 'frost_touch', description: '霜冻：攻击时有15%概率冰冻目标' },
            '奔雷束缚': { id: 'thunder_bind', description: '奔雷：攻击时有15%概率触发雷电' },
            '星界纽带': { id: 'star_bond', description: '星界：所有技能冷却时间减少15%' }
        };
        
        // 如果装备有特定词条，使用特定词条
        if (nameTraits[this.name]) {
            traits.id = nameTraits[this.name].id;
            traits.description = nameTraits[this.name].description;
        } else {
            // 否则根据品质和部位生成通用词条
            const qualityTraits = {
                common: {
                    weapon: '基础：攻击时有5%概率造成额外伤害',
                    armor: '基础：防御力提升3%',
                    accessory: '基础：所有属性提升2%'
                },
                rare: {
                    weapon: '强化：攻击时有10%概率造成额外伤害',
                    armor: '强化：防御力提升5%',
                    accessory: '强化：所有属性提升4%'
                },
                fine: {
                    weapon: '精良：攻击时有15%概率造成额外伤害，并提升暴击率',
                    armor: '精良：防御力提升8%，受到伤害时有10%概率免疫',
                    accessory: '精良：所有属性提升6%，技能冷却时间减少5%'
                },
                epic: {
                    weapon: '史诗：攻击时有20%概率造成额外伤害，并触发范围效果',
                    armor: '史诗：防御力提升12%，受到伤害时有15%概率免疫',
                    accessory: '史诗：所有属性提升10%，技能冷却时间减少10%'
                },
                legendary: {
                    weapon: '传说：攻击时有25%概率造成额外伤害，并触发强力效果',
                    armor: '传说：防御力提升15%，受到伤害时有20%概率免疫',
                    accessory: '传说：所有属性提升15%，技能冷却时间减少15%'
                }
            };
            
            const slotType = this.slot === 'weapon' ? 'weapon' : 
                           ['helmet', 'chest', 'legs', 'boots'].includes(this.slot) ? 'armor' : 'accessory';
            
            traits.description = qualityTraits[this.quality]?.[slotType] || '无特殊效果';
        }
        
        return traits;
    }

    // 计算强化后的属性（基于精炼后的基础值）
    calculateEnhancedStats() {
        const enhancedStats = {};
        const enhanceMultiplier = 1 + this.enhanceLevel * 0.1; // 每级+10%
        
        // 先计算精炼后的基础值（每级提升50%，即1级1.5倍，2级2倍，3级2.5倍，4级3倍，5级3.5倍）
        let refinedBaseStats = {};
        if (this.refineLevel > 0) {
            const refineMultiplier = 1 + this.refineLevel * 0.5;
            Object.keys(this.baseStats).forEach(key => {
                if (this.baseStats[key] !== 0) {
                    refinedBaseStats[key] = Math.floor(this.baseStats[key] * refineMultiplier);
                }
            });
        } else {
            refinedBaseStats = { ...this.baseStats };
        }
        
        // 再应用强化
        for (const [key, value] of Object.entries(refinedBaseStats)) {
            if (value !== 0) {
                enhancedStats[key] = Math.floor(value * enhanceMultiplier);
            }
        }
        
        return enhancedStats;
    }

    // 应用强化属性
    applyEnhancement() {
        // 使用calculateEnhancedStats来计算最终属性（它会先应用精炼，再应用强化）
        const enhancedStats = this.calculateEnhancedStats();
        // 重置stats
        this.stats = {};
        // 应用计算后的属性
        for (const [key, value] of Object.entries(enhancedStats)) {
            this.stats[key] = value;
        }
        // 确保所有基础属性都有对应的stats值
        Object.keys(this.baseStats).forEach(key => {
            if (!this.stats[key] && this.baseStats[key] === 0) {
                this.stats[key] = 0;
            }
        });
    }

    getTooltipHTML(currentEquipment = null) {
        let html = `<h4 style="color: ${QUALITY_COLORS[this.quality]}">${this.name}</h4>`;
        html += `<p>部位: ${SLOT_NAMES[this.slot]}</p>`;
        html += `<p>品质: ${QUALITY_NAMES[this.quality]}</p>`;
        html += `<p style="color: #ffaa00;">需要等级: ${this.level}</p>`;
        if (this.enhanceLevel > 0) {
            html += `<p style="color: #ffd700;">强化等级: +${this.enhanceLevel}</p>`;
        }
        if (this.refineLevel > 0) {
            html += `<p style="color: #ffd700;">精炼等级: ${'★'.repeat(this.refineLevel)}</p>`;
        }
        html += `<p>---</p>`;
        
        for (const [key, value] of Object.entries(this.stats)) {
            if (value !== 0) {
                const statNames = {
                    attack: '攻击力',
                    critRate: '暴击率',
                    critDamage: '暴击伤害',
                    health: '生命值',
                    defense: '防御力',
                    dodge: '闪避率',
                    attackSpeed: '攻击速度',
                    moveSpeed: '移动速度'
                };
                html += `<p>${statNames[key] || key}: ${value}${key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : ''}</p>`;
            }
        }
        
        // 显示武器技能
        if (this.skill) {
            html += `<p>---</p>`;
            html += `<p style="color: #ffaa00;"><strong>武器技能: ${this.skill.name}</strong></p>`;
            html += `<p style="color: #aaa; font-size: 11px;">${this.skill.description}</p>`;
            html += `<p style="color: #aaa; font-size: 11px;">冷却时间: ${this.skill.cooldown / 1000}秒</p>`;
            
            // 显示精炼效果（仅武器）
            if (this.slot === 'weapon' && this.refineEffects) {
                html += `<p>---</p>`;
                html += `<p style="color: #ffd700;"><strong>精炼效果:</strong></p>`;
                html += `<p style="color: #aaa; font-size: 10px; margin-bottom: 5px;">精炼需要1把同名且同等精炼等级的武器</p>`;
                
                for (let i = 0; i < this.refineEffects.length; i++) {
                    const refineEffect = this.refineEffects[i];
                    const refineLevel = i + 1;
                    const isCurrentLevel = this.refineLevel === refineLevel;
                    const isUnlocked = this.refineLevel >= refineLevel;
                    const color = isCurrentLevel ? '#ffd700' : (isUnlocked ? '#88ff88' : '#888888');
                    const starText = '★'.repeat(refineLevel);
                    
                    html += `<p style="color: ${color}; font-size: 10px; margin-left: 10px; margin-top: 3px;">${starText} 精炼${refineLevel}级: ${refineEffect.description}</p>`;
                }
            }
        }
        
        // 显示装备词条
        if (this.equipmentTraits && this.equipmentTraits.description) {
            html += `<p>---</p>`;
            html += `<p style="color: #88ff88;"><strong>装备词条:</strong></p>`;
            html += `<p style="color: #88ff88; font-size: 11px;">${this.equipmentTraits.description}</p>`;
        }
        
        // 显示套装信息（合铸装备可显示多个套装）
        const setIdsToShow = (this.fusionSetIds && this.fusionSetIds.length) ? this.fusionSetIds : (getSetForEquipment(this.name) ? [getSetForEquipment(this.name)] : []);
        let activeSet = new Set();
        if (currentEquipment && typeof getActiveSetEffects === 'function') {
            getActiveSetEffects(currentEquipment).forEach(e => activeSet.add(e.setId + '-' + e.pieceCount));
        }
        setIdsToShow.forEach(setId => {
            if (!setId || typeof SET_DEFINITIONS === 'undefined' || !SET_DEFINITIONS[setId]) return;
            const setData = SET_DEFINITIONS[setId];
            html += `<p>---</p>`;
            html += `<p style="color: #ffaa00;"><strong>套装: ${setData.name}</strong></p>`;
            html += `<p style="color: #aaa; font-size: 11px;">套装效果:</p>`;
            for (const [pieceCount, effect] of Object.entries(setData.effects)) {
                const active = activeSet.has(setId + '-' + pieceCount);
                const color = active ? '#33ff33' : '#888888';
                html += `<p style="color: ${color}; font-size: 10px;">${pieceCount}件: ${effect.description}</p>`;
            }
        });
        
        return html;
    }
}

/**
 * 生成装备数据
 * @returns {Equipment[]} 所有装备的数组
 * 总共98种装备，包含不同等级和品质的组合
 * 装备定义数据从 config/equipment-config.json 中读取
 */
function generateEquipments() {
    const equipments = [];
    
    // 从全局配置中读取装备定义
    const equipmentDefinitions = EQUIPMENT_DEFINITIONS;

    let id = 0;
    equipmentDefinitions.forEach(def => {
        const stats = {};
        
        // 根据部位设置主属性（只保留需要的属性）
        if (def.slot === 'weapon') {
            // 武器：只保留攻击力、暴击率、暴击伤害
            stats.attack = def.attack || 0;
            stats.critRate = def.critRate || 0;
            stats.critDamage = def.critDamage || 0;
        } else if (['helmet', 'chest', 'legs', 'boots'].includes(def.slot)) {
            // 防具：只保留生命值、防御力
            stats.health = def.health || 0;
            stats.defense = def.defense || 0;
        } else if (['necklace', 'ring', 'belt'].includes(def.slot)) {
            // 挂饰：只保留攻击速度、移动速度、闪避率
            stats.dodge = def.dodge || 0;
            stats.attackSpeed = def.attackSpeed || 0;
            stats.moveSpeed = def.moveSpeed || 0;
        }
        
        equipments.push(new Equipment({
            id: id++,
            name: def.name,
            slot: def.slot,
            weaponType: def.weaponType,
            quality: def.quality,
            level: def.level,
            stats: stats
        }));
    });
    
    return equipments;
}

