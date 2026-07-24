/**
 * 角色 / 怪物精灵动画预览场景
 */
class AnimPreviewScene {
    constructor(gameInstance = null) {
        this.gameInstance = gameInstance;
        this.width = CONFIG.CANVAS_WIDTH;
        this.height = CONFIG.CANVAS_HEIGHT;
        this.previewX = this.width / 2;
        this.previewY = this.height / 2 + 24;
        this.exitPortal = {
            x: 50,
            y: 50,
            size: 40,
            name: '返回主城'
        };
    }

    checkInteraction(player) {
        const interactions = [];
        const dx = this.exitPortal.x - player.x;
        const dy = this.exitPortal.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < this.exitPortal.size / 2 + 30) {
            interactions.push(this.exitPortal);
        }
        return interactions;
    }

    _drawFloor(ctx, assetManager) {
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
                return;
            }
        }
        ctx.fillStyle = '#1a1228';
        ctx.fillRect(0, 0, this.width, this.height);
    }

    _drawPreviewStage(ctx) {
        const ui = this.gameInstance?.animPreviewUI;
        if (!ui) return;
        const px = this.previewX;
        const py = this.previewY;
        const pos = typeof ui.getDrawPosition === 'function'
            ? ui.getDrawPosition(px, py)
            : { x: px, y: py };
        const walkRange = ui.simWalkRange || 100;

        if (ui.showGrid) {
            ctx.save();
            ctx.strokeStyle = 'rgba(120, 200, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(px - 80, py);
            ctx.lineTo(px + 80, py);
            ctx.moveTo(px, py - 80);
            ctx.lineTo(px, py + 20);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255, 220, 100, 0.85)';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();

            if (ui.isSimulatingMove?.() || ui.simOffsetX) {
                ctx.strokeStyle = 'rgba(100, 220, 140, 0.35)';
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(px - walkRange, py + 2);
                ctx.lineTo(px + walkRange, py + 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(100, 220, 140, 0.55)';
                ctx.beginPath();
                ctx.arc(px - walkRange, py + 2, 3, 0, Math.PI * 2);
                ctx.arc(px + walkRange, py + 2, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        ui.drawPreview(ctx, pos.x, pos.y);
    }

    _drawPortal(ctx, assetManager) {
        const p = this.exitPortal;
        ctx.save();
        if (assetManager) {
            const portalName = assetManager.getPortalImageName('return_town');
            const img = portalName ? assetManager.entityImageCache.get(portalName) : null;
            if (img) {
                assetManager.drawEntityImage(ctx, img, p.x, p.y, p.size, p.size);
                ctx.restore();
                return;
            }
        }
        ctx.fillStyle = '#4488ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    draw(ctx) {
        const assetManager = this.gameInstance?.assetManager;
        this._drawFloor(ctx, assetManager);

        ctx.fillStyle = 'rgba(60, 120, 200, 0.22)';
        ctx.fillRect(0, 0, this.width, 52);
        ctx.fillStyle = '#cce8ff';
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('角色动画预览 · ESC 返回主城 · P 开关面板', this.width / 2, 32);

        this._drawPreviewStage(ctx);
        this._drawPortal(ctx, assetManager);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#aaccee';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText('← 返回主城 (E)', 12, this.height - 14);
    }
}

if (typeof window !== 'undefined') {
    window.AnimPreviewScene = AnimPreviewScene;
}
