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
                { key: 'POTION_ICON_MAP', file: 'config/potion-icon-config.json' },
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
                { key: 'MATERIAL_DEFINITIONS', file: 'config/material-config.json' },
                { key: 'AUTO_BATTLER_CONFIG', file: 'config/auto-battler-config.json' },
                { key: 'AUTO_BATTLER_ENCOUNTERS', file: 'config/auto-battler-encounters.json' },
                { key: 'ASCENSION_CONFIG', file: 'config/ascension-config.json' },
                { key: 'JUICE_CONFIG', file: 'config/juice-config.json' },
                { key: 'COMMANDER_CONFIG', file: 'config/commander-config.json' },
                { key: 'SYNERGY_MATRIX_CONFIG', file: 'config/synergy-matrix-config.json' },
                { key: 'ZONE_ECOLOGY_CONFIG', file: 'config/zone-ecology-config.json' },
                { key: 'CURSE_CONFIG', file: 'config/curse-config.json' },
                { key: 'DEMON_PACT_CONFIG', file: 'config/demon-pact-config.json' },
                { key: 'EVENT_CHAINS_CONFIG', file: 'config/event-chains-config.json' },
                { key: 'SPRITE_ANIMATIONS', file: 'config/sprite-animations.json' }
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

            try {
                const buildSimple = await this.loadJSON('config/build-simplification.json');
                if (buildSimple && buildSimple.BUILD_SIMPLIFICATION && this.configs.AUTO_BATTLER_CONFIG) {
                    Object.assign(this.configs.AUTO_BATTLER_CONFIG, buildSimple.BUILD_SIMPLIFICATION);
                }
            } catch (e) {
                console.warn('build-simplification.json 未加载:', e);
            }

            try {
                const contentExp = await this.loadJSON('config/content-expansion.json');
                if (contentExp && contentExp.CONTENT_EXPANSION) {
                    this.mergeContentExpansion(contentExp.CONTENT_EXPANSION);
                }
            } catch (e) {
                console.warn('content-expansion.json 未加载:', e);
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
     * 合并 Ascension 内容扩展包到各子系统配置
     */
    mergeContentExpansion(exp) {
        if (!exp || typeof exp !== 'object') return;
        const ab = this.configs.AUTO_BATTLER_CONFIG;
        if (ab) {
            if (Array.isArray(exp.relics)) {
                ab.relics = (ab.relics || []).concat(exp.relics);
                const curse = this.configs.CURSE_CONFIG;
                if (curse) {
                    const root = curse.CURSE_CONFIG || curse;
                    root.cursedRelics = root.cursedRelics || {};
                    exp.relics.forEach((r) => {
                        if (!r || r.rarity !== 'curse') return;
                        const fx = r.effects || {};
                        root.cursedRelics[r.id] = {
                            id: r.id,
                            name: r.name,
                            description: r.description,
                            positive: fx.positive || {},
                            negative: fx.negative || {},
                            riskLevel: fx.riskLevel || 3,
                            corruptionPerBattle: fx.corruptionPerBattle || 5
                        };
                    });
                }
            }
        }
        const cmd = this.configs.COMMANDER_CONFIG;
        if (cmd && exp.commanderAbilities) {
            const root = cmd.COMMANDER_CONFIG || cmd;
            root.abilities = Object.assign(root.abilities || {}, exp.commanderAbilities);
        }
        const syn = this.configs.SYNERGY_MATRIX_CONFIG;
        if (syn) {
            const root = syn.SYNERGY_MATRIX_CONFIG || syn;
            if (exp.synergyBinary) Object.assign(root.binary || (root.binary = {}), exp.synergyBinary);
            if (exp.synergyTernary) Object.assign(root.ternary || (root.ternary = {}), exp.synergyTernary);
            if (exp.synergyQuaternary) root.quaternary = Object.assign(root.quaternary || {}, exp.synergyQuaternary);
        }
        const zone = this.configs.ZONE_ECOLOGY_CONFIG;
        if (zone && exp.zones) {
            const root = zone.ZONE_ECOLOGY_CONFIG || zone;
            root.zones = Object.assign(root.zones || {}, exp.zones);
            root.branchZones = Object.keys(exp.zones);
        }
        if (exp.bossPhases) {
            this.configs.BOSS_PHASES_EXPANSION = exp.bossPhases;
        }
        const evt = this.configs.EVENT_CHAINS_CONFIG;
        if (evt && exp.eventChains) {
            const root = evt.EVENT_CHAINS_CONFIG || evt;
            root.chains = Object.assign(root.chains || {}, exp.eventChains);
        }
        const pact = this.configs.DEMON_PACT_CONFIG;
        if (pact && exp.demonPacts) {
            const root = pact.DEMON_PACT_CONFIG || pact;
            root.pacts = Object.assign(root.pacts || {}, exp.demonPacts);
        }
        if (exp.weatherConfig) this.configs.WEATHER_CONFIG = exp.weatherConfig;
        if (exp.bondConfig) this.configs.BOND_CONFIG = exp.bondConfig;
        if (exp.mutatedNodeConfig) this.configs.MUTATED_NODE_CONFIG = exp.mutatedNodeConfig;
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
            if (!window.SCENE_TYPES.AUTO_BATTLER) {
                window.SCENE_TYPES.AUTO_BATTLER = 'auto_battler';
            }
            if (!window.SCENE_TYPES.ANIM_PREVIEW) {
                window.SCENE_TYPES.ANIM_PREVIEW = 'anim_preview';
            }
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
        if (this.configs.POTION_ICON_MAP) {
            window.POTION_ICON_MAP = this.configs.POTION_ICON_MAP;
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
        if (this.configs.AUTO_BATTLER_CONFIG) {
            window.AUTO_BATTLER_CONFIG = this.configs.AUTO_BATTLER_CONFIG;
            if (this.configs.AUTO_BATTLER_ENCOUNTERS && typeof this.configs.AUTO_BATTLER_ENCOUNTERS === 'object') {
                Object.assign(window.AUTO_BATTLER_CONFIG, this.configs.AUTO_BATTLER_ENCOUNTERS);
            }
            if (window.CONFIG && typeof window.CONFIG === 'object') {
                window.CONFIG.AUTO_BATTLER_CONFIG = window.AUTO_BATTLER_CONFIG;
            }
        }
        if (this.configs.ASCENSION_CONFIG && this.configs.ASCENSION_CONFIG.ascension) {
            window.ASCENSION_CONFIG = this.configs.ASCENSION_CONFIG;
            if (window.CONFIG) window.CONFIG.ASCENSION = this.configs.ASCENSION_CONFIG.ascension;
        }
        if (this.configs.JUICE_CONFIG) {
            window.JUICE_CONFIG = this.configs.JUICE_CONFIG.JUICE_CONFIG || this.configs.JUICE_CONFIG;
            if (window.CONFIG) window.CONFIG.JUICE_CONFIG = window.JUICE_CONFIG;
        }
        if (this.configs.COMMANDER_CONFIG) {
            window.COMMANDER_CONFIG = this.configs.COMMANDER_CONFIG.COMMANDER_CONFIG || this.configs.COMMANDER_CONFIG;
            if (window.CONFIG) window.CONFIG.COMMANDER_CONFIG = window.COMMANDER_CONFIG;
        }
        if (this.configs.SYNERGY_MATRIX_CONFIG) {
            window.SYNERGY_MATRIX_CONFIG = this.configs.SYNERGY_MATRIX_CONFIG.SYNERGY_MATRIX_CONFIG || this.configs.SYNERGY_MATRIX_CONFIG;
            if (window.CONFIG) window.CONFIG.SYNERGY_MATRIX_CONFIG = window.SYNERGY_MATRIX_CONFIG;
        }
        if (this.configs.ZONE_ECOLOGY_CONFIG) {
            window.ZONE_ECOLOGY_CONFIG = this.configs.ZONE_ECOLOGY_CONFIG.ZONE_ECOLOGY_CONFIG || this.configs.ZONE_ECOLOGY_CONFIG;
            if (window.CONFIG) window.CONFIG.ZONE_ECOLOGY_CONFIG = window.ZONE_ECOLOGY_CONFIG;
        }
        if (this.configs.CURSE_CONFIG) {
            window.CURSE_CONFIG = this.configs.CURSE_CONFIG.CURSE_CONFIG || this.configs.CURSE_CONFIG;
            if (window.CONFIG) window.CONFIG.CURSE_CONFIG = window.CURSE_CONFIG;
        }
        if (this.configs.DEMON_PACT_CONFIG) {
            window.DEMON_PACT_CONFIG = this.configs.DEMON_PACT_CONFIG.DEMON_PACT_CONFIG || this.configs.DEMON_PACT_CONFIG;
            if (window.CONFIG) window.CONFIG.DEMON_PACT_CONFIG = window.DEMON_PACT_CONFIG;
        }
        if (this.configs.EVENT_CHAINS_CONFIG) {
            window.EVENT_CHAINS_CONFIG = this.configs.EVENT_CHAINS_CONFIG.EVENT_CHAINS_CONFIG || this.configs.EVENT_CHAINS_CONFIG;
            if (window.CONFIG) window.CONFIG.EVENT_CHAINS_CONFIG = window.EVENT_CHAINS_CONFIG;
        }
        if (this.configs.WEATHER_CONFIG) {
            window.WEATHER_CONFIG = this.configs.WEATHER_CONFIG;
            if (window.CONFIG) window.CONFIG.WEATHER_CONFIG = window.WEATHER_CONFIG;
        }
        if (this.configs.BOND_CONFIG) {
            window.BOND_CONFIG = this.configs.BOND_CONFIG;
            if (window.CONFIG) window.CONFIG.BOND_CONFIG = window.BOND_CONFIG;
        }
        if (this.configs.MUTATED_NODE_CONFIG) {
            window.MUTATED_NODE_CONFIG = this.configs.MUTATED_NODE_CONFIG;
            if (window.CONFIG) window.CONFIG.MUTATED_NODE_CONFIG = window.MUTATED_NODE_CONFIG;
        }
        if (this.configs.BOSS_PHASES_EXPANSION) {
            window.BOSS_PHASES_EXPANSION = this.configs.BOSS_PHASES_EXPANSION;
        }
        if (this.configs.SPRITE_ANIMATIONS) {
            window.SPRITE_ANIMATIONS = this.configs.SPRITE_ANIMATIONS;
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

