/**
 * Pixel Eternal - 粒子系统模块
 * 提供通用的粒子效果系统，支持颜色、大小、个数、消失时间等配置
 * 
 * 使用示例：
 * 
 * // 1. 创建简单的粒子效果（爆炸效果）
 * game.particleManager.createSystem(x, y, {
 *     color: '#ff6600',
 *     size: 3,
 *     count: 20,
 *     lifetime: 1000,
 *     fadeoutTime: 500,
 *     speed: 2,
 *     angleSpread: Math.PI * 2 // 全方向发射
 * });
 * 
 * // 2. 创建向上发射的粒子（如拾取物品效果）
 * game.particleManager.createSystem(x, y, {
 *     color: '#ffd700',
 *     size: 2,
 *     count: 10,
 *     lifetime: 1500,
 *     fadeoutTime: 800,
 *     speed: 1.5,
 *     angle: -Math.PI / 2, // 向上
 *     angleSpread: Math.PI / 4, // 45度扩散
 *     gravity: -0.5 // 向上飘
 * });
 * 
 * // 3. 创建带重力下落的粒子（如血滴效果）
 * game.particleManager.createSystem(x, y, {
 *     color: '#ff0000',
 *     size: 2,
 *     count: 15,
 *     lifetime: 2000,
 *     fadeoutTime: 1000,
 *     speed: 1,
 *     angle: Math.PI / 2, // 向下
 *     angleSpread: Math.PI / 3,
 *     gravity: 0.3 // 重力下落
 * });
 * 
 * // 4. 创建颜色渐变的粒子
 * game.particleManager.createSystem(x, y, {
 *     color: '#ff0000',
 *     size: 3,
 *     count: 30,
 *     lifetime: 2000,
 *     fadeoutTime: 1000,
 *     speed: 2,
 *     colorOverLifetime: (progress, currentColor) => {
 *         // 从红色渐变到黄色
 *         const r = 255;
 *         const g = Math.floor(255 * progress);
 *         const b = 0;
 *         return `rgb(${r}, ${g}, ${b})`;
 *     }
 * });
 */

/**
 * 单个粒子类
 */
class Particle {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        
        // 基础属性
        this.color = options.color || '#ffffff';
        this.size = options.size || 2;
        this.lifetime = options.lifetime || 1000; // 粒子生命周期（毫秒）
        this.fadeoutTime = options.fadeoutTime || 500; // 淡出时间（毫秒）
        
        // 速度属性
        this.vx = options.vx || (Math.random() - 0.5) * 2;
        this.vy = options.vy || (Math.random() - 0.5) * 2;
        this.speed = options.speed || 1;
        
        // 加速度属性（可选）
        this.ax = options.ax || 0;
        this.ay = options.ay || 0;
        
        // 重力（可选）
        this.gravity = options.gravity || 0;
        
        // 生命周期
        this.startTime = Date.now();
        this.age = 0;
        this.isDead = false;
        
        // 透明度（用于淡出效果）
        this.alpha = 1.0;
    }
    
    /**
     * 更新粒子状态
     * @param {number} deltaTime - 时间差（毫秒）
     */
    update(deltaTime) {
        if (this.isDead) return;
        
        this.age += deltaTime;
        
        // 检查是否超过生命周期
        if (this.age >= this.lifetime) {
            this.isDead = true;
            return;
        }
        
        // 计算透明度（淡出效果）
        const fadeStartTime = this.lifetime - this.fadeoutTime;
        if (this.age >= fadeStartTime) {
            const fadeProgress = (this.age - fadeStartTime) / this.fadeoutTime;
            this.alpha = Math.max(0, 1 - fadeProgress);
        }
        
        // 更新速度（应用加速度）
        this.vx += this.ax * (deltaTime / 1000);
        this.vy += this.ay * (deltaTime / 1000);
        
        // 应用重力
        if (this.gravity !== 0) {
            this.vy += this.gravity * (deltaTime / 1000);
        }
        
        // 更新位置
        this.x += this.vx * this.speed * (deltaTime / 1000) * 60; // 假设60fps
        this.y += this.vy * this.speed * (deltaTime / 1000) * 60;
    }
    
    /**
     * 绘制粒子
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {boolean} pixelStyle - 是否使用像素风格（方形），默认true
     */
    draw(ctx, pixelStyle = true) {
        if (this.isDead || this.alpha <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        
        if (pixelStyle) {
            // 像素风格：绘制方形
            const halfSize = Math.floor(this.size / 2);
            ctx.fillRect(
                Math.floor(this.x) - halfSize,
                Math.floor(this.y) - halfSize,
                this.size,
                this.size
            );
        } else {
            // 圆形风格
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

/**
 * 粒子系统类
 * 管理一组粒子，提供统一的创建、更新和绘制接口
 */
class ParticleSystem {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;
        
        // 粒子配置
        this.color = options.color || '#ffffff';
        this.size = options.size || 2;
        this.count = options.count || 10;
        this.lifetime = options.lifetime || 1000; // 粒子生命周期（毫秒）
        this.fadeoutTime = options.fadeoutTime || 500; // 淡出时间（毫秒）
        
        // 速度配置
        this.speed = options.speed || 1;
        this.speedVariation = options.speedVariation || 0.5; // 速度变化范围
        this.angle = options.angle || null; // 发射角度（弧度），null表示随机方向
        this.angleSpread = options.angleSpread || Math.PI * 2; // 角度扩散范围（弧度）
        
        // 加速度配置
        this.acceleration = options.acceleration || { x: 0, y: 0 };
        
        // 重力配置
        this.gravity = options.gravity || 0;
        
        // 大小变化
        this.sizeVariation = options.sizeVariation || 0; // 大小变化范围
        this.sizeOverLifetime = options.sizeOverLifetime || null; // 大小随时间变化的函数
        
        // 颜色变化
        this.colorOverLifetime = options.colorOverLifetime || null; // 颜色随时间变化的函数
        
        // 随机散布配置
        this.spreadRadius = options.spreadRadius || 0; // 初始位置随机散布半径
        
        // 像素风格配置
        this.pixelStyle = options.pixelStyle !== false; // 默认使用像素风格（方形）
        
        // 粒子列表
        this.particles = [];
        
        // 系统状态
        this.startTime = Date.now();
        this.isActive = true;
        this.isDead = false;
        
        // 创建粒子
        this.createParticles();
    }
    
    /**
     * 创建所有粒子
     */
    createParticles() {
        for (let i = 0; i < this.count; i++) {
            // 计算速度
            let angle = this.angle;
            if (angle === null) {
                // 随机角度
                angle = Math.random() * Math.PI * 2;
            } else {
                // 在指定角度周围扩散
                const spread = (Math.random() - 0.5) * this.angleSpread;
                angle = angle + spread;
            }
            
            // 计算速度大小（带变化）
            const speedVariation = (Math.random() - 0.5) * this.speedVariation;
            const particleSpeed = this.speed + speedVariation;
            
            // 计算速度分量
            const vx = Math.cos(angle) * particleSpeed;
            const vy = Math.sin(angle) * particleSpeed;
            
            // 计算大小（带变化）
            const sizeVariation = (Math.random() - 0.5) * this.sizeVariation;
            const particleSize = Math.max(0.5, this.size + sizeVariation);
            
            // 计算初始位置（应用随机散布）
            let startX = this.x;
            let startY = this.y;
            if (this.spreadRadius > 0) {
                const spreadAngle = Math.random() * Math.PI * 2;
                const spreadDistance = Math.random() * this.spreadRadius;
                startX += Math.cos(spreadAngle) * spreadDistance;
                startY += Math.sin(spreadAngle) * spreadDistance;
            }
            
            // 创建粒子
            const particle = new Particle(startX, startY, {
                color: this.color,
                size: particleSize,
                lifetime: this.lifetime,
                fadeoutTime: this.fadeoutTime,
                vx: vx,
                vy: vy,
                speed: 1, // 速度已经在vx/vy中计算
                ax: this.acceleration.x,
                ay: this.acceleration.y,
                gravity: this.gravity
            });
            
            this.particles.push(particle);
        }
    }
    
    /**
     * 更新粒子系统
     * @param {number} deltaTime - 时间差（毫秒）
     */
    update(deltaTime) {
        if (this.isDead) return;
        
        // 更新所有粒子
        let aliveCount = 0;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            particle.update(deltaTime);
            
            // 应用大小随时间变化
            if (this.sizeOverLifetime && typeof this.sizeOverLifetime === 'function') {
                const progress = particle.age / particle.lifetime;
                const newSize = this.sizeOverLifetime(progress, particle.size);
                if (newSize !== null && newSize !== undefined) {
                    particle.size = Math.max(0.1, newSize);
                }
            }
            
            // 应用颜色随时间变化
            if (this.colorOverLifetime && typeof this.colorOverLifetime === 'function') {
                const progress = particle.age / particle.lifetime;
                const newColor = this.colorOverLifetime(progress, particle.color);
                if (newColor) {
                    particle.color = newColor;
                }
            }
            
            if (particle.isDead) {
                this.particles.splice(i, 1);
            } else {
                aliveCount++;
            }
        }
        
        // 如果所有粒子都死亡，标记系统为死亡
        if (aliveCount === 0) {
            this.isDead = true;
        }
    }
    
    /**
     * 绘制粒子系统
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     */
    draw(ctx) {
        if (this.isDead) return;
        
        for (const particle of this.particles) {
            particle.draw(ctx, this.pixelStyle);
        }
    }
    
    /**
     * 检查系统是否已死亡（所有粒子都已消失）
     * @returns {boolean}
     */
    isFinished() {
        return this.isDead || this.particles.length === 0;
    }
    
    /**
     * 销毁粒子系统（清理资源）
     */
    destroy() {
        this.particles = [];
        this.isDead = true;
    }
}

/**
 * 粒子系统管理器
 * 管理多个粒子系统，提供统一的更新和绘制接口
 */
class ParticleManager {
    constructor() {
        this.systems = [];
    }
    
    /**
     * 创建并添加一个粒子系统
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {Object} options - 粒子系统配置
     * @returns {ParticleSystem} 创建的粒子系统
     */
    createSystem(x, y, options = {}) {
        const system = new ParticleSystem(x, y, options);
        this.systems.push(system);
        return system;
    }
    
    /**
     * 更新所有粒子系统
     * @param {number} deltaTime - 时间差（毫秒）
     */
    update(deltaTime) {
        for (let i = this.systems.length - 1; i >= 0; i--) {
            const system = this.systems[i];
            system.update(deltaTime);
            
            // 移除已完成的系统
            if (system.isFinished()) {
                this.systems.splice(i, 1);
            }
        }
    }
    
    /**
     * 绘制所有粒子系统
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     */
    draw(ctx) {
        for (const system of this.systems) {
            system.draw(ctx);
        }
    }
    
    /**
     * 清除所有粒子系统
     */
    clear() {
        for (const system of this.systems) {
            system.destroy();
        }
        this.systems = [];
    }
    
    /**
     * 获取活跃粒子系统数量
     * @returns {number}
     */
    getActiveSystemCount() {
        return this.systems.length;
    }
}

/**
 * 击杀怪物 / 宝箱等掉落的金币或经验光点：快速飞向玩家，同色拖尾，碰撞后才调用 game.gainGold / gainExp
 */
class RewardHomingPickup {
    constructor(game, x, y, kind, amount, color, options = {}) {
        this.game = game;
        this.kind = kind === 'exp' ? 'exp' : 'gold';
        this.amount = Math.max(0, Math.floor(amount || 0));
        this.color = color || (this.kind === 'gold' ? '#ffd700' : '#00ff66');
        this.x = x;
        this.y = y;
        this._originX = x;
        this._originY = y;
        this._outwardX = typeof options.outwardX === 'number' ? options.outwardX : x;
        this._outwardY = typeof options.outwardY === 'number' ? options.outwardY : y;
        this.radius = 5;
        this.trailMax = 20;
        this.trail = [];
        this.age = 0;
        /** 超时自动结算，避免奖励丢失 */
        this.maxAgeMs = 85000;
        /** 三段状态：外扩 -> 停顿 -> 追踪 */
        this._phase = 'burst';
        this._pauseMs = typeof options.pauseMs === 'number' ? options.pauseMs : 120;
        this._burstSpeed = typeof options.burstSpeed === 'number' ? options.burstSpeed : 560;
        this._homeSpeed = typeof options.homeSpeed === 'number' ? options.homeSpeed : 520;
    }

    _hexToRgba(hex, alpha) {
        let h = (hex || '#ffffff').replace('#', '');
        if (h.length === 3) {
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        }
        const n = parseInt(h, 16);
        if (Number.isNaN(n)) return `rgba(255,255,255,${alpha})`;
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    /**
     * @param {number} dtMs
     * @param {Player} player
     * @returns {boolean} true 表示已拾取或销毁，应从列表移除
     */
    update(dtMs, player) {
        if (this.amount <= 0 || !player) return true;
        this.age += dtMs;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.trailMax) this.trail.shift();

        const ps = typeof CONFIG !== 'undefined' && CONFIG.PLAYER_SIZE ? CONFIG.PLAYER_SIZE : 20;
        const pickupR = ps * 0.5 + this.radius + 8;
        if (this._phase === 'burst') {
            const dx = this._outwardX - this.x;
            const dy = this._outwardY - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            const step = this._burstSpeed * (dtMs / 1000);
            this.x += (dx / dist) * Math.min(step, dist);
            this.y += (dy / dist) * Math.min(step, dist);
            if (dist < 8) {
                this._phase = 'pause';
            }
        } else if (this._phase === 'pause') {
            this._pauseMs -= dtMs;
            if (this._pauseMs <= 0) {
                this._phase = 'home';
            }
        } else {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            const step = this._homeSpeed * (dtMs / 1000);
            this.x += (dx / dist) * Math.min(step, dist);
            this.y += (dy / dist) * Math.min(step, dist);
            const distAfter = Math.hypot(player.x - this.x, player.y - this.y);
            if (distAfter < pickupR) {
                if (this.kind === 'gold') this.game.gainGold(this.amount);
                else this.game.gainExp(this.amount);
                return true;
            }
        }
        if (this.age >= this.maxAgeMs) {
            if (this.kind === 'gold') this.game.gainGold(this.amount);
            else this.game.gainExp(this.amount);
            return true;
        }
        return false;
    }

    draw(ctx) {
        if (this.trail.length >= 2) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let i = 1; i < this.trail.length; i++) {
                const t = i / (this.trail.length - 1);
                ctx.strokeStyle = this._hexToRgba(this.color, 0.06 + t * 0.28);
                ctx.lineWidth = 1.2 + t * 2.8;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = 0.68;
        ctx.fillStyle = this.color;
        const s = 5;
        const half = Math.floor(s / 2);
        ctx.fillRect(Math.floor(this.x) - half, Math.floor(this.y) - half, s, s);
        ctx.restore();
    }
}

