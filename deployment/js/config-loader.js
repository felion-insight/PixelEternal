/**
 * Pixel Eternal - 配置加载器模块
 * 负责从 JSON 文件加载所有配置数据
 */

class ConfigLoader {
    constructor() {
        this.configs = {};
        this.loaded = false;
    }

    /**
     * 加载所有配置文件
     * @returns {Promise<void>}
     */
    async loadAll() {
        if (this.loaded) return;

        try {
            // 加载基础配置
            const gameConfig = await this.loadJSON('config/game-config.json');
            // game-config.json 包含多个配置项，直接合并
            if (gameConfig && typeof gameConfig === 'object') {
                Object.assign(this.configs, gameConfig);
            }

            // 加载其他配置文件
            const configFiles = [
                { key: 'MONSTER_TYPES', file: 'config/monster-config.json' },
                { key: 'BOSS_DEFINITIONS', file: 'config/boss-config.json' },
                { key: 'BUFF_ICON_MAP', file: 'config/buff-icon-config.json' },
                { key: 'SKILL_ICON_MAP', file: 'config/skill-icon-config.json' },
                { key: 'MAPPINGS', file: 'config/mappings.json' },
                { key: 'CLASS_CONFIG', file: 'config/class-config.json' },
                { key: 'WEAPON_AFFINITY_CONFIG', file: 'config/weapon-affinity-config.json' },
                { key: 'SKILL_CONFIG', file: 'config/skill-config.json' },
                { key: 'STATUS_SYNERGY_CONFIG', file: 'config/status-synergy-config.json' },
                { key: 'SKILL_COMBO_CONFIG', file: 'config/skill-combo-config.json' },
                { key: 'CLASS_BUILD_EQUIPMENT', file: 'config/class-build-equipment.json' },
                { key: 'CLASS_BUILD_PASSIVES', file: 'config/class-build-passives.json' },
                { key: 'SKILL_ENTITY_CONFIG', file: 'config/skill-entity-config.json' },
                { key: 'BASE_TYPES', file: 'config/base-types.json' },
                { key: 'AFFIX_POOL', file: 'config/affix-pool.json' },
                { key: 'LEGENDARY_POWERS', file: 'config/legendary-powers.json' },
                { key: 'SET_DEFINITIONS_V2', file: 'config/set-config-v2.json' },
                { key: 'CHRONICLE_CONFIG', file: 'config/chronicle-config.json' },
                { key: 'TRIAL_CONFIG', file: 'config/trial-config.json' },
                { key: 'TALENT_CONFIG', file: 'config/talent-config.json' },
                { key: 'TUTORIAL_CONFIG', file: 'config/tutorial-config.json' },
                { key: 'MATERIAL_DEFINITIONS', file: 'config/material-config.json' }
            ];

            for (const { key, file } of configFiles) {
                try {
                    const data = await this.loadJSON(file);
                    // 如果 JSON 对象中有一个与 key 同名的属性，提取该属性的值
                    // 例如：{EQUIPMENT_DEFINITIONS: [...]} -> 提取数组
                    if (data && typeof data === 'object' && key in data) {
                        this.configs[key] = data[key];
                    } else {
                        // 否则使用整个对象（向后兼容）
                        this.configs[key] = data;
                    }
                } catch (error) {
                    console.warn(`Failed to load ${file}:`, error);
                }
            }

            // 深塔追加怪物模板（与 demon 等 baseMonster 组合），合并进 MONSTER_TYPES（训练场列表、塔内生成等均依赖）
            try {
                const deepMonAdd = await this.loadJSON('config/deep-monsters-add.json');
                if (deepMonAdd && typeof deepMonAdd === 'object' && this.configs.MONSTER_TYPES && typeof this.configs.MONSTER_TYPES === 'object') {
                    Object.assign(this.configs.MONSTER_TYPES, deepMonAdd);
                }
            } catch (e) {
                console.warn('deep-monsters-add.json 未加载或合并失败（深阶追加怪将缺失）:', e);
            }

            try {
                const projSprites = await this.loadJSON('config/projectile-sprites.json');
                if (projSprites && typeof projSprites === 'object') {
                    this.configs.PROJECTILE_SPRITE_MAP = projSprites;
                }
            } catch (e) {
                console.warn('projectile-sprites.json 未加载（飞射体将回退为几何绘制）:', e);
            }

            try {
                const dungeonCfg = await this.loadJSON('config/dungeon-config.json');
                if (dungeonCfg && typeof dungeonCfg === 'object') {
                    if (dungeonCfg.DUNGEON_DEFINITIONS) this.configs.DUNGEON_DEFINITIONS = dungeonCfg.DUNGEON_DEFINITIONS;
                    if (dungeonCfg.RIFT_AFFIXES) this.configs.RIFT_AFFIXES = dungeonCfg.RIFT_AFFIXES;
                    if (dungeonCfg.TEAM_RAIDS) this.configs.TEAM_RAIDS = dungeonCfg.TEAM_RAIDS;
                }
            } catch (e) {
                console.warn('dungeon-config.json 未加载:', e);
            }

            // 将配置赋值给全局变量
            this.assignToGlobals();
            this.loaded = true;
            if (typeof window.validatePhase3EquipmentConfig === 'function') {
                const equipmentErrors = window.validatePhase3EquipmentConfig();
                if (equipmentErrors.length) {
                    throw new Error(`Phase 3 装备配置存在 ${equipmentErrors.length} 个错误`);
                }
            }
        } catch (error) {
            console.error('Failed to load configurations:', error);
            throw error;
        }
    }

    /**
     * 加载 JSON 文件
     * @param {string} path - JSON 文件路径
     * @returns {Promise<Object>}
     */
    async loadJSON(path) {
        // 检查是否是 file:// 协议
        if (window.location.protocol === 'file:') {
            const errorMsg = `
╔═══════════════════════════════════════════════════════════════╗
║  CORS 错误：无法在 file:// 协议下加载配置文件                ║
║                                                               ║
║  请使用本地服务器运行游戏：                                   ║
║                                                               ║
║  方法 1: 运行 start-server.py                                 ║
║    python3 start-server.py                                    ║
║                                                               ║
║  方法 2: 运行 start-server.sh                                 ║
║    ./start-server.sh                                          ║
║                                                               ║
║  方法 3: 使用 Python 内置服务器                               ║
║    python3 -m http.server 8000                                ║
║    然后访问: http://localhost:8000/index.html               ║
╚═══════════════════════════════════════════════════════════════╝
            `;
            console.error(errorMsg);
            throw new Error(`CORS 错误：无法在 file:// 协议下加载 ${path}。请使用本地服务器运行游戏。`);
        }
        
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to load ${path}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            if (error.message.includes('CORS')) {
                throw error; // 重新抛出 CORS 错误
            }
            // 其他错误也抛出
            throw new Error(`加载 ${path} 失败: ${error.message}`);
        }
    }

    /**
     * 将配置赋值给全局变量
     */
    assignToGlobals() {
        // 基础配置
        if (this.configs.CONFIG) {
            // 如果 window.CONFIG 已存在，更新其属性而不是替换整个对象
            // 这样可以保持其他模块中对 CONFIG 的引用有效
            if (window.CONFIG && typeof window.CONFIG === 'object') {
                Object.assign(window.CONFIG, this.configs.CONFIG);
            } else {
                window.CONFIG = this.configs.CONFIG;
            }
        }
        if (this.configs.QUALITY_COLORS) {
            window.QUALITY_COLORS = this.configs.QUALITY_COLORS;
        }
        if (this.configs.QUALITY_NAMES) {
            window.QUALITY_NAMES = this.configs.QUALITY_NAMES;
        }
        if (this.configs.SLOT_NAMES) {
            window.SLOT_NAMES = this.configs.SLOT_NAMES;
        }
        if (this.configs.ROOM_TYPES) {
            window.ROOM_TYPES = this.configs.ROOM_TYPES;
        }
        if (this.configs.SCENE_TYPES) {
            window.SCENE_TYPES = this.configs.SCENE_TYPES;
        }

        // 其他配置
        if (this.configs.MONSTER_TYPES) {
            const mt = this.configs.MONSTER_TYPES;
            for (const key of Object.keys(mt)) {
                const m = mt[key];
                if (m && typeof m === 'object' && m.level != null) {
                    const lv = Number(m.level);
                    m.level = !Number.isFinite(lv) || lv <= 1 ? 1 : Math.ceil(lv / 5) * 5;
                }
            }
            window.MONSTER_TYPES = mt;
        }
        if (this.configs.BOSS_DEFINITIONS) {
            window.BOSS_DEFINITIONS = this.configs.BOSS_DEFINITIONS;
        }
        window.EQUIPMENT_DEFINITIONS = [];
        window.CRAFTING_MATERIAL_DEFINITIONS = [];
        window.CRAFTING_RECIPE_DEFINITIONS = [];
        if (this.configs.BUFF_ICON_MAP) {
            window.BUFF_ICON_MAP = this.configs.BUFF_ICON_MAP;
        }
        if (this.configs.SKILL_ICON_MAP) {
            window.SKILL_ICON_MAP = this.configs.SKILL_ICON_MAP;
        }

        // 图片映射配置
        if (this.configs.MAPPINGS) {
            window.MAPPINGS = this.configs.MAPPINGS;
        }
        if (this.configs.PROJECTILE_SPRITE_MAP) {
            window.PROJECTILE_SPRITE_MAP = this.configs.PROJECTILE_SPRITE_MAP;
        }
        if (this.configs.CLASS_CONFIG) {
            window.CLASS_CONFIG = this.configs.CLASS_CONFIG;
        }
        if (this.configs.WEAPON_AFFINITY_CONFIG) {
            window.WEAPON_AFFINITY_CONFIG = this.configs.WEAPON_AFFINITY_CONFIG;
        }
        if (this.configs.SKILL_CONFIG) {
            window.SKILL_CONFIG = this.configs.SKILL_CONFIG;
        }
        if (this.configs.STATUS_SYNERGY_CONFIG) {
            window.STATUS_SYNERGY_CONFIG = this.configs.STATUS_SYNERGY_CONFIG;
        }
        if (this.configs.SKILL_COMBO_CONFIG) {
            window.SKILL_COMBO_CONFIG = this.configs.SKILL_COMBO_CONFIG;
        }
        if (this.configs.CLASS_BUILD_EQUIPMENT) {
            window.CLASS_BUILD_EQUIPMENT = this.configs.CLASS_BUILD_EQUIPMENT;
        }
        if (this.configs.CLASS_BUILD_PASSIVES) {
            window.CLASS_BUILD_PASSIVES = this.configs.CLASS_BUILD_PASSIVES;
        }
        if (this.configs.SKILL_ENTITY_CONFIG) {
            window.SKILL_ENTITY_CONFIG = this.configs.SKILL_ENTITY_CONFIG;
        }
        if (this.configs.BASE_TYPES) {
            window.BASE_TYPES = this.configs.BASE_TYPES;
        }
        if (this.configs.AFFIX_POOL) {
            window.AFFIX_POOL = this.configs.AFFIX_POOL;
        }
        if (this.configs.LEGENDARY_POWERS) {
            window.LEGENDARY_POWERS = this.configs.LEGENDARY_POWERS;
        }
        if (this.configs.SET_DEFINITIONS_V2) {
            window.SET_DEFINITIONS_V2 = this.configs.SET_DEFINITIONS_V2;
        }
        if (this.configs.CHRONICLE_CONFIG) {
            window.CHRONICLE_CONFIG = this.configs.CHRONICLE_CONFIG;
        }
        if (this.configs.TRIAL_CONFIG) {
            window.TRIAL_CONFIG = this.configs.TRIAL_CONFIG;
        }
        if (this.configs.TALENT_CONFIG) {
            window.TALENT_CONFIG = this.configs.TALENT_CONFIG;
        }
        if (this.configs.TUTORIAL_CONFIG) {
            window.TUTORIAL_CONFIG = this.configs.TUTORIAL_CONFIG;
        }
        if (this.configs.MATERIAL_DEFINITIONS) {
            window.MATERIAL_DEFINITIONS = this.configs.MATERIAL_DEFINITIONS;
        }
        if (this.configs.DUNGEON_DEFINITIONS) {
            window.DUNGEON_DEFINITIONS = this.configs.DUNGEON_DEFINITIONS;
        }
        if (this.configs.RIFT_AFFIXES) {
            window.RIFT_AFFIXES = this.configs.RIFT_AFFIXES;
        }
        if (this.configs.TEAM_RAIDS) {
            window.TEAM_RAIDS = this.configs.TEAM_RAIDS;
        }
        if (this.configs.DROP_BIAS_CONFIG) {
            window.DROP_BIAS_CONFIG = this.configs.DROP_BIAS_CONFIG;
        }
        if (this.configs.DROP_RARITY_TABLES) {
            window.DROP_RARITY_TABLES = this.configs.DROP_RARITY_TABLES;
        }

        if (typeof window.applyPeSecretsToConfig === 'function') {
            window.applyPeSecretsToConfig();
        }
    }
}

// 创建全局配置加载器实例
window.configLoader = new ConfigLoader();

