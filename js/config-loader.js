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
                { key: 'EQUIPMENT_DEFINITIONS', file: 'config/equipment-config.json' },
                { key: 'SET_DEFINITIONS', file: 'config/set-config.json' },
                { key: 'BOSS_DEFINITIONS', file: 'config/boss-config.json' },
                { key: 'BUFF_ICON_MAP', file: 'config/buff-icon-config.json' },
                { key: 'SKILL_ICON_MAP', file: 'config/skill-icon-config.json' },
                { key: 'MAPPINGS', file: 'config/mappings.json' }
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

            // 高阶装备（独立命名与机制属性），合并进 EQUIPMENT_DEFINITIONS
            try {
                const deepData = await this.loadJSON('config/equipment-deep-config.json');
                const extra = (deepData && deepData.EQUIPMENT_DEEP_DEFINITIONS) || [];
                if (Array.isArray(extra) && extra.length && Array.isArray(this.configs.EQUIPMENT_DEFINITIONS)) {
                    this.configs.EQUIPMENT_DEFINITIONS = this.configs.EQUIPMENT_DEFINITIONS.concat(extra);
                }
            } catch (e) {
                console.warn('equipment-deep-config.json 未加载或合并失败（可忽略）:', e);
            }

            try {
                const deepSetData = await this.loadJSON('config/set-deep-config.json');
                const extraSets = (deepSetData && deepSetData.SET_DEEP_DEFINITIONS) || {};
                if (this.configs.SET_DEFINITIONS && typeof this.configs.SET_DEFINITIONS === 'object' && Object.keys(extraSets).length) {
                    this.configs.SET_DEFINITIONS = Object.assign({}, this.configs.SET_DEFINITIONS, extraSets);
                }
            } catch (e) {
                console.warn('set-deep-config.json 未加载或合并失败（可忽略）:', e);
            }

            try {
                const deepSuffix = await this.loadJSON('config/deep-suffix-table.json');
                if (deepSuffix && typeof deepSuffix === 'object') {
                    this.configs.DEEP_SUFFIX_TABLE = deepSuffix;
                }
            } catch (e) {
                console.warn('deep-suffix-table.json 未加载（深阶装备词条名将无法解析）:', e);
            }

            try {
                const projSprites = await this.loadJSON('config/projectile-sprites.json');
                if (projSprites && typeof projSprites === 'object') {
                    this.configs.PROJECTILE_SPRITE_MAP = projSprites;
                }
            } catch (e) {
                console.warn('projectile-sprites.json 未加载（飞射体将回退为几何绘制）:', e);
            }

            // 将配置赋值给全局变量
            this.assignToGlobals();
            this.loaded = true;
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
        if (this.configs.EQUIPMENT_DEFINITIONS) {
            window.EQUIPMENT_DEFINITIONS = this.configs.EQUIPMENT_DEFINITIONS;
        }
        if (this.configs.SET_DEFINITIONS) {
            window.SET_DEFINITIONS = this.configs.SET_DEFINITIONS;
        }
        if (this.configs.BOSS_DEFINITIONS) {
            window.BOSS_DEFINITIONS = this.configs.BOSS_DEFINITIONS;
        }
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
        if (this.configs.DEEP_SUFFIX_TABLE) {
            window.DEEP_SUFFIX_TABLE = this.configs.DEEP_SUFFIX_TABLE;
        }
        if (this.configs.PROJECTILE_SPRITE_MAP) {
            window.PROJECTILE_SPRITE_MAP = this.configs.PROJECTILE_SPRITE_MAP;
        }

        if (typeof window.applyPeSecretsToConfig === 'function') {
            window.applyPeSecretsToConfig();
        }
    }
}

// 创建全局配置加载器实例
window.configLoader = new ConfigLoader();

