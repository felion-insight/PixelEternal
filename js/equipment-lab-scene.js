/**
 * 装备实验场景 — 复用训练假人与返回传送门，突出装备机制展示。
 */
class EquipmentLabScene extends SkillLabScene {
    draw(ctx) {
        const assetManager = this.gameInstance?.assetManager;
        const tileSize = CONFIG.TILE_SIZE || 50;
        const floorName = assetManager ? assetManager.getFloorImageName('training') : null;
        const floorImg = floorName && assetManager ? assetManager.entityImageCache.get(floorName) : null;

        if (floorImg) {
            for (let x = 0; x < this.width; x += tileSize) {
                for (let y = 0; y < this.height; y += tileSize) {
                    ctx.drawImage(floorImg, x, y, tileSize, tileSize);
                }
            }
        } else {
            ctx.fillStyle = '#160d08';
            ctx.fillRect(0, 0, this.width, this.height);
        }

        ctx.fillStyle = 'rgba(255, 154, 60, 0.2)';
        ctx.fillRect(0, 0, this.width, 56);
        ctx.fillStyle = '#ffe0a8';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('装备试验场', this.width / 2, 24);
        ctx.fillStyle = '#ccaa77';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText('全装备机制 · 套装效果 · 自动换装战斗展示', this.width / 2, 44);

        ctx.fillStyle = '#9a4b12';
        ctx.fillRect(
            this.exitPortal.x - this.exitPortal.size / 2,
            this.exitPortal.y - this.exitPortal.size / 2,
            this.exitPortal.size,
            this.exitPortal.size
        );
        ctx.strokeStyle = '#ff9a3c';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            this.exitPortal.x - this.exitPortal.size / 2,
            this.exitPortal.y - this.exitPortal.size / 2,
            this.exitPortal.size,
            this.exitPortal.size
        );
        ctx.fillStyle = '#fff';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText('返回', this.exitPortal.x, this.exitPortal.y + 5);

        const player = this.gameInstance?.player;
        this.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            if (player && typeof window.drawCombatantBackstabZone === 'function') {
                window.drawCombatantBackstabZone(ctx, dummy, player);
            }
            dummy.draw(ctx);
        });
    }
}
