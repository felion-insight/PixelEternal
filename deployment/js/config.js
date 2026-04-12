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
        // 合铸功能（对应 docs/fusion.md 第5-7行）：API 根地址、API Key、模型名
        // 密钥请放在项目根或 tools/.env，并运行 node scripts/build-pe-env-js.js 生成 js/pe-env.generated.js
        HEZHU_API_BASE: 'http://35.220.164.252:3888',
        HEZHU_API_KEY: '',
        HEZHU_MODEL: 'gemini-3.1-flash-lite-preview',
        // 设为 true 时合铸始终使用本地规则（不请求外网），无需 VPN
        HEZHU_USE_LOCAL: false,
        // 合铸成功后是否调用与 art_generator 相同的接口生成装备贴图（需可访问 HEZHU_API_BASE 的 /v1/chat 与 /v1/images）
        HEZHU_FUSION_ICON_ENABLE: true,
        HEZHU_FUSION_ICON_API_KEY: '',
        HEZHU_ART_API_KEY: '',
        HEZHU_FUSION_ICON_CHAT_MODEL: 'gpt-4o-mini',
        HEZHU_FUSION_ICON_IMAGE_MODEL: 'imagen-4.0-ultra-generate-001',
        // 恶魔塔：层数上限、Boss 间隔（每 N 层 Boss，其前一层为隙间商店）
        TOWER_MAX_FLOOR: 240,
        TOWER_BOSS_INTERVAL: 20,
        MONSTER_MAX_LEVEL: 60,
        /** @deprecated 升级经验已改为 20×当前等级²；此项保留仅为旧存档/配置兼容，不参与计算 */
        PLAYER_EXP_LEVEL_MULT: 1.18
    };
}

/**
 * 当前等级 L 升到 L+1 所需经验：Exp(L) = 20 × L²
 * @param {number} level 当前玩家等级（≥1）
 * @returns {number}
 */
window.computePlayerExpToNextLevel = function (level) {
    const L = Math.max(1, Math.floor(Number(level)) || 1);
    return 20 * L * L;
};

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
        TRAINING: 'training'
    };
}

// 为了向后兼容，创建局部常量引用
const CONFIG = window.CONFIG;

/** localStorage 键前缀（可选：与本机 `pixel_eternal.api.*` 键配合覆盖 CONFIG） */
window.PE_API_SECRET_LS_PREFIX = 'pixel_eternal.api.';

/**
 * 将 window.__PE_SECRETS__（pe-env.generated.js）与本机 localStorage 中的密钥合并进 CONFIG。
 * 顺序：生成文件 → localStorage 覆盖。
 * 在 config-loader 合并 JSON 之后会再次调用。
 */
window.applyPeSecretsToConfig = function applyPeSecretsToConfig() {
    const cfg = window.CONFIG;
    if (!cfg) return;

    const applySource = (src) => {
        if (!src || typeof src !== 'object') return;
        const keys = ['HEZHU_API_KEY', 'HEZHU_ART_API_KEY', 'HEZHU_FUSION_ICON_API_KEY', 'HEZHU_API_BASE'];
        for (const k of keys) {
            const v = src[k];
            if (v == null) continue;
            const t = String(v).trim();
            if (t !== '') cfg[k] = t;
        }
    };

    const S = typeof window.__PE_SECRETS__ === 'object' && window.__PE_SECRETS__ ? window.__PE_SECRETS__ : null;
    applySource(S);

    let lsGet;
    try {
        const pfx = window.PE_API_SECRET_LS_PREFIX || 'pixel_eternal.api.';
        lsGet = function (k) {
            const raw = localStorage.getItem(pfx + k);
            if (raw == null) return null;
            const t = String(raw).trim();
            return t !== '' ? t : null;
        };
    } catch {
        lsGet = function () { return null; };
    }
    applySource({
        HEZHU_API_KEY: lsGet('HEZHU_API_KEY'),
        HEZHU_ART_API_KEY: lsGet('HEZHU_ART_API_KEY'),
        HEZHU_FUSION_ICON_API_KEY: lsGet('HEZHU_FUSION_ICON_API_KEY'),
        HEZHU_API_BASE: lsGet('HEZHU_API_BASE')
    });

    const art = String(cfg.HEZHU_ART_API_KEY || '').trim();
    const fus = String(cfg.HEZHU_FUSION_ICON_API_KEY || '').trim();
    if (art && !fus) {
        cfg.HEZHU_FUSION_ICON_API_KEY = art;
    }
    const hz = String(cfg.HEZHU_API_KEY || '').trim();
    if (!hz && art) {
        cfg.HEZHU_API_KEY = art;
    }
};
window.applyPeSecretsToConfig();

const QUALITY_COLORS = window.QUALITY_COLORS;
const QUALITY_NAMES = window.QUALITY_NAMES;
const SLOT_NAMES = window.SLOT_NAMES;
const ROOM_TYPES = window.ROOM_TYPES;
const SCENE_TYPES = window.SCENE_TYPES;

