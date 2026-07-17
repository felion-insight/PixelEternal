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
        TOWER_MAX_FLOOR: 240,
        TOWER_BOSS_INTERVAL: 20,
        MONSTER_MAX_LEVEL: 60
    };
}

/**
 * 当前等级 L 升到 L+1 所需经验：Exp(L) = 80 + 12 × L²
 * @param {number} level 当前玩家等级（≥1）
 * @returns {number}
 */
window.computePlayerExpToNextLevel = function (level) {
    const L = Math.max(1, Math.floor(Number(level)) || 1);
    return 80 + 12 * L * L;
};

if (typeof window.QUALITY_COLORS === 'undefined') {
    window.QUALITY_COLORS = {
        normal: '#aaaaaa',
        magic: '#00ff00',
        rare: '#0088ff',
        epic: '#aa00ff',
        legendary: '#ff8800',
        mythic: '#ff2244'
    };
}

if (typeof window.QUALITY_NAMES === 'undefined') {
    window.QUALITY_NAMES = {
        normal: '普通',
        magic: '魔法',
        rare: '稀有',
        epic: '史诗',
        legendary: '传说',
        mythic: '神话'
    };
}

if (typeof window.SLOT_NAMES === 'undefined') {
    window.SLOT_NAMES = {
        weapon: '武器',
        offHand: '副手',
        helmet: '头盔',
        body: '胸甲',
        hands: '手套',
        legs: '腿甲',
        feet: '足具',
        amulet: '护符',
        ring: '指环',
        belt: '腰带'
    };
}

if (typeof window.ROOM_TYPES === 'undefined') {
    window.ROOM_TYPES = {
        BATTLE: 'battle',
        TREASURE: 'treasure',
        REST: 'rest',
        ELITE: 'elite',
        GAP_SHOP: 'gap_shop',
        BOSS: 'boss'
    };
}

/** 恶魔塔层数规则（供 game-main / game-entities 共用） */
window.getTowerMaxFloor = function () {
    const c = window.CONFIG || {};
    return c.TOWER_MAX_FLOOR != null ? c.TOWER_MAX_FLOOR : 240;
};
window.getTowerBossInterval = function () {
    const c = window.CONFIG || {};
    return c.TOWER_BOSS_INTERVAL != null ? c.TOWER_BOSS_INTERVAL : 20;
};
window.isTowerGapShopFloor = function (floor) {
    const I = window.getTowerBossInterval();
    const M = window.getTowerMaxFloor();
    return floor > 0 && floor < M && floor % I === (I - 1);
};
window.isTowerBossFloor = function (floor) {
    const I = window.getTowerBossInterval();
    const M = window.getTowerMaxFloor();
    return floor > 0 && floor <= M && floor % I === 0;
};
window.getTowerBossIdForFloor = function (floor) {
    return 'boss_' + floor;
};

if (typeof window.SCENE_TYPES === 'undefined') {
    window.SCENE_TYPES = {
        TOWN: 'town',
        TOWER: 'tower',
        TRAINING: 'training',
        TRIAL: 'trial',
        DUNGEON: 'dungeon',
        SKILL_LAB: 'skill_lab',
        EQUIPMENT_LAB: 'equipment_lab'
    };
}

// 为了向后兼容，创建局部常量引用
const CONFIG = window.CONFIG;

/** localStorage 键前缀（可选：与本机 `pixel_eternal.api.*` 键配合覆盖 CONFIG） */
window.PE_API_SECRET_LS_PREFIX = 'pixel_eternal.api.';

/**
 * 将 window.__PE_SECRETS__（pe-env.generated.js）与本机 localStorage 中的密钥合并进 CONFIG。
 * 在 config-loader 合并 JSON 之后会再次调用。
 */
window.applyPeSecretsToConfig = function applyPeSecretsToConfig() {
    const cfg = window.CONFIG;
    if (!cfg) return;
    const S = typeof window.__PE_SECRETS__ === 'object' && window.__PE_SECRETS__ ? window.__PE_SECRETS__ : null;
    if (!S || typeof S !== 'object') return;
    for (const [k, v] of Object.entries(S)) {
        if (v == null) continue;
        const t = String(v).trim();
        if (t !== '') cfg[k] = t;
    }
};
window.applyPeSecretsToConfig();

const QUALITY_COLORS = window.QUALITY_COLORS;
const QUALITY_NAMES = window.QUALITY_NAMES;
const SLOT_NAMES = window.SLOT_NAMES;
const ROOM_TYPES = window.ROOM_TYPES;
const SCENE_TYPES = window.SCENE_TYPES;

