/**
 * Pixel Eternal - 配置和常量模块
 * 包含游戏配置、品质映射、房间类型等常量定义
 * 
 * 注意：配置现在从 JSON 文件加载，这些是默认值（作为后备）
 * 如果配置加载器已加载配置，将使用 JSON 中的配置
 */

// 如果配置加载器已加载配置，使用加载的配置；否则使用默认值
if (typeof window.CONFIG === 'undefined') {
    window.CONFIG = {
        CANVAS_WIDTH: 1200,
        CANVAS_HEIGHT: 800,
        TILE_SIZE: 40,
        PLAYER_SIZE: 30,
        PLAYER_SPEED: 2,
        PLAYER_DASH_SPEED: 8,
        PLAYER_DASH_DURATION: 200,
        PLAYER_ATTACK_RANGE: 50,
        PLAYER_RANGED_ATTACK_RANGE: 220, // 远程武器锁定与攻击距离
        PLAYER_ATTACK_COOLDOWN: 800,
        MONSTER_SIZE: 30,
        MONSTER_SPEED: 1.5,
        MONSTER_DETECTION_RANGE: 150,
        MONSTER_CHASE_RANGE: 250,
        MONSTER_ATTACK_RANGE: 40,
        MONSTER_ATTACK_COOLDOWN: 2000,
        INVENTORY_SIZE: 66,
        TICKS_PER_SECOND: 60,
        // 合铸功能（对应 docs/合铸.md 第5-7行）：API 根地址、API Key、模型名
        HEZHU_API_BASE: 'http://35.220.164.252:3888',
        HEZHU_API_KEY: 'sk-KIok6ajQEs9IMRfrCoMXwFYEs2kL3EDgJwCYdN7vgaTnWbV2',
        HEZHU_MODEL: 'gemini-3.1-flash-lite-preview',
        // 设为 true 时合铸始终使用本地规则（不请求外网），无需 VPN
        HEZHU_USE_LOCAL: false,
        // 合铸成功后是否调用与 art_generator 相同的接口生成装备贴图（需可访问 HEZHU_API_BASE 的 /v1/chat 与 /v1/images）
        HEZHU_FUSION_ICON_ENABLE: true,
        // 生图与规划用的 Key（与 tools/art_generator.py 的 PE_ART_API_KEY 一致）；可单独覆盖 HEZHU_FUSION_ICON_API_KEY
        HEZHU_FUSION_ICON_API_KEY: '',
        // 与 PE_ART_API_KEY 默认一致，供合铸成功后 Chat+Imagen；可用环境或此处覆盖
        HEZHU_ART_API_KEY: 'sk-OVNKpYrzUnloOR1F8qhA3KZKMwOQxjX8icaGpO2dUmP5FZj4',
        HEZHU_FUSION_ICON_CHAT_MODEL: 'gpt-4o-mini',
        HEZHU_FUSION_ICON_IMAGE_MODEL: 'imagen-4.0-ultra-generate-001'
    };
}

if (typeof window.QUALITY_COLORS === 'undefined') {
    window.QUALITY_COLORS = {
        common: '#ffffff',
        rare: '#00ff00',
        fine: '#0088ff',
        epic: '#aa00ff',
        legendary: '#ff8800'
    };
}

if (typeof window.QUALITY_NAMES === 'undefined') {
    window.QUALITY_NAMES = {
        common: '普通',
        rare: '稀有',
        fine: '精良',
        epic: '史诗',
        legendary: '传说'
    };
}

if (typeof window.SLOT_NAMES === 'undefined') {
    window.SLOT_NAMES = {
        weapon: '武器',
        helmet: '头盔',
        chest: '胸甲',
        legs: '腿甲',
        boots: '足具',
        necklace: '项链',
        ring: '指环',
        belt: '腰带'
    };
}

if (typeof window.ROOM_TYPES === 'undefined') {
    window.ROOM_TYPES = {
        BATTLE: 'battle',
        TREASURE: 'treasure',
        REST: 'rest',
        ELITE: 'elite'
    };
}

if (typeof window.SCENE_TYPES === 'undefined') {
    window.SCENE_TYPES = {
        TOWN: 'town',
        TOWER: 'tower',
        TRAINING: 'training'
    };
}

// 为了向后兼容，创建局部常量引用
const CONFIG = window.CONFIG;
const QUALITY_COLORS = window.QUALITY_COLORS;
const QUALITY_NAMES = window.QUALITY_NAMES;
const SLOT_NAMES = window.SLOT_NAMES;
const ROOM_TYPES = window.ROOM_TYPES;
const SCENE_TYPES = window.SCENE_TYPES;

