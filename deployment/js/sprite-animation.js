/**
 * Pixel Eternal - Sprite Sheet 帧动画运行时
 * 配合 asset/animations/*_sheet.png + *.json 与 config/sprite-animations.json 使用
 */

/**
 * 单个实体的动画播放状态（每实例一份）
 */
class SpriteAnimationRuntime {
    constructor() {
        this.animName = 'idle';
        this.frameIndex = 0;
        this.elapsedMs = 0;
        this.facingLeft = false;
        this._lastTick = 0;
    }

    /**
     * @param {number} nowMs
     * @param {object} meta - 动画 meta JSON
     * @param {string} animName
     * @param {{ moveSpeed?: number, maxSpeed?: number }} [opts]
     */
    tick(nowMs, meta, animName, opts) {
        opts = opts || {};
        if (!meta || !meta.animations) return;
        const target = animName || 'idle';
        if (target !== this.animName) {
            this.animName = target;
            this.frameIndex = 0;
            this.elapsedMs = 0;
            this._walkDist = 0;
        }
        const anim = meta.animations[this.animName] || meta.animations.idle;
        if (!anim || !anim.frames || !anim.frames.length) return;

        if (!this._lastTick) {
            this._lastTick = nowMs;
            return;
        }
        const deltaMs = Math.min(100, nowMs - this._lastTick);
        this._lastTick = nowMs;

        const moveSpeed = opts.moveSpeed || 0;
        const maxSpeed = opts.maxSpeed || moveSpeed || 1;
        const strideWorld = opts.strideWorld != null ? opts.strideWorld : (meta.strideWorld || 0);

        // 行走：按移动距离换帧（moveSpeed ≈ 每逻辑 tick 移动的像素）
        if (this.animName === 'walk' && moveSpeed > 0.12 && strideWorld > 0) {
            const stepMs = opts.stepMs || (1000 / 60);
            this._walkDist = (this._walkDist || 0) + moveSpeed * (deltaMs / stepMs);
            const n = anim.frames.length;
            const loop = anim.loop !== false;
            while (this._walkDist >= strideWorld && n > 0) {
                this._walkDist -= strideWorld;
                this.frameIndex++;
                if (this.frameIndex >= n) {
                    this.frameIndex = loop ? 0 : n - 1;
                }
            }
            return;
        }

        if (this.animName !== 'walk') {
            this._walkDist = 0;
        }

        let fps = anim.fps || 8;
        // 仅做轻微 fps 跟随，避免速度变化时帧率跳变过大
        if (this.animName === 'walk' && moveSpeed > 0.12) {
            const ratio = moveSpeed / Math.max(0.01, maxSpeed);
            fps *= Math.max(0.9, Math.min(1.1, 0.95 + ratio * 0.08));
        }

        const frameDuration = 1000 / fps;
        this.elapsedMs += deltaMs;
        while (this.elapsedMs >= frameDuration) {
            this.elapsedMs -= frameDuration;
            this.frameIndex++;
            const loop = anim.loop !== false;
            if (this.frameIndex >= anim.frames.length) {
                this.frameIndex = loop ? 0 : anim.frames.length - 1;
            }
        }
    }

    /**
     * 行走附加视觉偏移（已禁用横向/挤压抖动，位移交给实体坐标与帧图本身）
     */
    getWalkVisualOffset(meta, moveSpeed, maxSpeed) {
        void meta;
        void moveSpeed;
        void maxSpeed;
        return { offsetX: 0, offsetY: 0, scaleY: 1 };
    }

    /** @returns {number} sheet 上的帧索引 */
    getSheetFrameIndex(meta) {
        if (!meta || !meta.animations) return 0;
        const anim = meta.animations[this.animName] || meta.animations.idle;
        if (!anim || !anim.frames || !anim.frames.length) return 0;
        const idx = Math.max(0, Math.min(this.frameIndex, anim.frames.length - 1));
        return anim.frames[idx];
    }
}

/**
 * 解析实体 key 对应的 sprite 动画配置（支持 baseMonster 回退）
 * @param {string} entityKey
 * @returns {object|null}
 */
function resolveSpriteAnimationEntry(entityKey) {
    if (typeof SPRITE_ANIMATIONS === 'undefined' || !SPRITE_ANIMATIONS) return null;
    const entities = SPRITE_ANIMATIONS.entities || SPRITE_ANIMATIONS;
    if (entities[entityKey]) return entities[entityKey];
    if (entityKey.endsWith('_elite')) {
        const base = entityKey.replace(/_elite$/, '');
        if (entities[base]) return entities[base];
    }
    if (typeof MONSTER_TYPES !== 'undefined' && MONSTER_TYPES[entityKey]) {
        const base = MONSTER_TYPES[entityKey].baseMonster;
        if (base && entities[base]) return entities[base];
    }
    return null;
}

/**
 * 解析用于加载/缓存的动画 ID（配置表中的 key）
 * @param {string} entityKey
 * @returns {string|null}
 */
function resolveSpriteAnimationId(entityKey) {
    if (typeof SPRITE_ANIMATIONS === 'undefined' || !SPRITE_ANIMATIONS) return null;
    const entities = SPRITE_ANIMATIONS.entities || SPRITE_ANIMATIONS;
    if (entities[entityKey]) return entityKey;
    if (entityKey.endsWith('_elite')) {
        const base = entityKey.replace(/_elite$/, '');
        if (entities[base]) return base;
    }
    if (typeof MONSTER_TYPES !== 'undefined' && MONSTER_TYPES[entityKey]) {
        const base = MONSTER_TYPES[entityKey].baseMonster;
        if (base && entities[base]) return base;
    }
    return null;
}
