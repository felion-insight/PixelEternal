/**
 * 开发者技能实验场景 — 训练桩 + 返回传送门
 */
class SkillLabScene {
    constructor(gameInstance = null) {
        this.gameInstance = gameInstance;
        this.width = CONFIG.CANVAS_WIDTH;
        this.height = CONFIG.CANVAS_HEIGHT;
        this.dummies = [];
        this.exitPortal = {
            x: 50,
            y: 50,
            size: 40,
            name: '返回主城'
        };
    }

    addDummy(x, y, options = {}) {
        const dummy = new TrainingDummy(x, y, options);
        if (this.gameInstance && dummy.gameInstance == null) {
            dummy.gameInstance = this.gameInstance;
        }
        this.dummies.push(dummy);
        return dummy;
    }

    addMonsterDummy(x, y, monsterType, options = {}) {
        const opts = { ...options };
        if (this.gameInstance && opts.gameInstance === undefined) opts.gameInstance = this.gameInstance;
        const dummy = new MonsterTrainingDummy(x, y, monsterType, opts);
        this.dummies.push(dummy);
        return dummy;
    }

    removeDummy(dummy) {
        const index = this.dummies.indexOf(dummy);
        if (index > -1) this.dummies.splice(index, 1);
    }

    clearAllDummies() {
        this.dummies = [];
    }

    checkInteraction(player) {
        const interactions = [];
        const dx = this.exitPortal.x - player.x;
        const dy = this.exitPortal.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.exitPortal.size / 2 + 30) {
            interactions.push(this.exitPortal);
        }
        return interactions;
    }

    draw(ctx) {
        const assetManager = this.gameInstance?.assetManager;
        const tileSize = CONFIG.TILE_SIZE || 50;

        if (assetManager) {
            const floorImageName = assetManager.getFloorImageName('training');
            const floorImg = floorImageName ? assetManager.entityImageCache.get(floorImageName) : null;
            if (floorImg) {
                for (let x = 0; x < this.width; x += tileSize) {
                    for (let y = 0; y < this.height; y += tileSize) {
                        ctx.drawImage(floorImg, x, y, tileSize, tileSize);
                    }
                }
            } else {
                ctx.fillStyle = '#120a1e';
                ctx.fillRect(0, 0, this.width, this.height);
            }
        } else {
            ctx.fillStyle = '#120a1e';
            ctx.fillRect(0, 0, this.width, this.height);
        }

        ctx.fillStyle = 'rgba(80, 140, 255, 0.2)';
        ctx.fillRect(0, 0, this.width, 56);
        ctx.fillStyle = '#cce8ff';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('技能实验场', this.width / 2, 24);
        ctx.fillStyle = '#99bbdd';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText('切换职业与等级 · 测试全部技能表现', this.width / 2, 44);

        ctx.fillStyle = '#6a0dad';
        ctx.fillRect(
            this.exitPortal.x - this.exitPortal.size / 2,
            this.exitPortal.y - this.exitPortal.size / 2,
            this.exitPortal.size,
            this.exitPortal.size
        );
        ctx.strokeStyle = '#8b00ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            this.exitPortal.x - this.exitPortal.size / 2,
            this.exitPortal.y - this.exitPortal.size / 2,
            this.exitPortal.size,
            this.exitPortal.size
        );
        ctx.fillStyle = '#fff';
        ctx.font = '12px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('返回', this.exitPortal.x, this.exitPortal.y + 5);

        const player = this.gameInstance?.player;
        this.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            // 绘制背刺有效区指示（刺客职业可见）
            if (player && typeof window.drawCombatantBackstabZone === 'function') {
                window.drawCombatantBackstabZone(ctx, dummy, player);
            }
            dummy.draw(ctx);
        });
    }
}
