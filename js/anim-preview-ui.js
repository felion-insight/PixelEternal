/**
 * 角色 / 怪物精灵动画预览 UI
 */
(function () {
    'use strict';

    function byId(id) {
        return document.getElementById(id);
    }

    function listSpriteAnimIds() {
        if (typeof SPRITE_ANIMATIONS === 'undefined' || !SPRITE_ANIMATIONS) return [];
        const entities = SPRITE_ANIMATIONS.entities || SPRITE_ANIMATIONS;
        return Object.keys(entities).sort();
    }

    class AnimPreviewUI {
        constructor(game) {
            this.game = game;
            this._bound = false;
            this.mode = 'sprite';
            this.animId = '';
            this.animName = 'walk';
            this.playing = true;
            this.facingLeft = false;
            this.showGrid = true;
            this.simulateMoving = true;
            this.simOffsetX = 0;
            this.simOffsetY = 0;
            this.simDirection = 1;
            this.simWalkSpeed = 1.6;
            this.simWalkRange = 100;
            this.scale = 2.5;
            this.runtime = typeof SpriteAnimationRuntime !== 'undefined' ? new SpriteAnimationRuntime() : null;
            this._playerFrameIndex = 0;
            this._playerFrameElapsed = 0;
            this._playerFrames = [];
            this._playerDelays = [];
            this._statusText = '';
        }

        bindOnce() {
            if (this._bound) return;
            this._bound = true;

            byId('close-anim-preview')?.addEventListener('click', () => this.close());
            byId('anim-preview-mode')?.addEventListener('change', (e) => {
                this.mode = e.target.value;
                this._syncModeControls();
                this.resetPlayback();
                this.refreshAnimNameOptions();
                this.loadCurrentAnim();
                this.updateStatus();
            });
            byId('anim-preview-entity')?.addEventListener('change', (e) => {
                this.animId = e.target.value;
                this.loadCurrentAnim();
                this.refreshAnimNameOptions();
                this.resetPlayback();
            });
            byId('anim-preview-anim')?.addEventListener('change', (e) => {
                this.animName = e.target.value;
                this.resetPlayback();
            });
            byId('anim-preview-play')?.addEventListener('change', (e) => {
                this.playing = !!e.target.checked;
            });
            byId('anim-preview-flip')?.addEventListener('change', (e) => {
                this.facingLeft = !!e.target.checked;
                if (this.runtime) this.runtime.facingLeft = this.facingLeft;
            });
            byId('anim-preview-grid')?.addEventListener('change', (e) => {
                this.showGrid = !!e.target.checked;
            });
            byId('anim-preview-sim-move')?.addEventListener('change', (e) => {
                this.simulateMoving = !!e.target.checked;
                if (!this.simulateMoving) this._resetSimPosition();
            });
            byId('anim-preview-scale')?.addEventListener('input', (e) => {
                this.scale = parseFloat(e.target.value) || 2.5;
                const label = byId('anim-preview-scale-val');
                if (label) label.textContent = this.scale.toFixed(1);
            });
            byId('anim-preview-step-prev')?.addEventListener('click', () => this.stepFrame(-1));
            byId('anim-preview-step-next')?.addEventListener('click', () => this.stepFrame(1));
            byId('anim-preview-reset')?.addEventListener('click', () => this.resetPlayback());
        }

        _syncModeControls() {
            const entityLabel = byId('anim-preview-entity')?.closest('label');
            if (entityLabel) {
                entityLabel.style.display = this.mode === 'player' ? 'none' : '';
            }
        }

        populateEntitySelect() {
            const sel = byId('anim-preview-entity');
            if (!sel) return;
            const ids = listSpriteAnimIds();
            sel.innerHTML = '';
            if (!ids.length) {
                sel.innerHTML = '<option value="">（无 sprite 动画配置）</option>';
                this.animId = '';
                return;
            }
            ids.forEach((id) => {
                const opt = document.createElement('option');
                opt.value = id;
                let label = id;
                if (typeof MONSTER_TYPES !== 'undefined' && MONSTER_TYPES[id]?.name) {
                    label = `${MONSTER_TYPES[id].name} (${id})`;
                }
                opt.textContent = label;
                sel.appendChild(opt);
            });
            if (!this.animId || !ids.includes(this.animId)) {
                this.animId = ids[0];
            }
            sel.value = this.animId;
        }

        refreshAnimNameOptions() {
            const sel = byId('anim-preview-anim');
            if (!sel) return;
            sel.innerHTML = '';
            if (this.mode === 'player') {
                ['gif'].forEach((name) => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = '玩家 GIF 循环';
                    sel.appendChild(opt);
                });
                this.animName = 'gif';
                return;
            }
            const am = this.game?.assetManager;
            const data = am?.getSpriteAnimationSync(this.animId);
            const names = data?.meta?.animations
                ? Object.keys(data.meta.animations)
                : ['idle', 'walk'];
            names.forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            });
            if (!names.includes(this.animName)) {
                this.animName = names.includes('walk') ? 'walk' : names[0];
            }
            sel.value = this.animName;
        }

        async loadCurrentAnim() {
            if (this.mode === 'player') {
                await this._loadPlayerGif();
                return;
            }
            const am = this.game?.assetManager;
            if (!am || !this.animId) return;
            await am.loadSpriteAnimation(this.animId);
            const mc = am.getMonsterImageConfig(this.animId);
            if (mc?.scale) {
                this.scale = mc.scale;
                const slider = byId('anim-preview-scale');
                const label = byId('anim-preview-scale-val');
                if (slider) slider.value = String(this.scale);
                if (label) label.textContent = this.scale.toFixed(1);
            }
            this.updateStatus();
        }

        async _loadPlayerGif() {
            const am = this.game?.assetManager;
            if (!am) return;
            const { frames, delays } = await am.loadPlayerGifFrames();
            this._playerFrames = frames || [];
            this._playerDelays = delays || [];
            const pc = am.getPlayerGifConfig();
            if (pc?.scale) {
                this.scale = pc.scale;
                const slider = byId('anim-preview-scale');
                const label = byId('anim-preview-scale-val');
                if (slider) slider.value = String(this.scale);
                if (label) label.textContent = this.scale.toFixed(1);
            }
            this.updateStatus();
        }

        resetPlayback() {
            if (this.runtime) {
                this.runtime.animName = this.animName;
                this.runtime.frameIndex = 0;
                this.runtime.elapsedMs = 0;
                this.runtime.facingLeft = this.facingLeft;
                this.runtime._lastTick = 0;
            }
            this._playerFrameIndex = 0;
            this._playerFrameElapsed = 0;
            this._resetSimPosition();
            this.updateStatus();
        }

        _resetSimPosition() {
            this.simOffsetX = 0;
            this.simOffsetY = 0;
            this.simDirection = 1;
        }

        isSimulatingMove() {
            return this.simulateMoving !== false && this.playing
                && (this.animName === 'walk' || this.mode === 'player');
        }

        _updateSimMovement(dtMs) {
            if (!this.isSimulatingMove()) {
                if (this.simOffsetX !== 0 || this.simOffsetY !== 0) {
                    const decay = Math.pow(0.82, dtMs / 16.67);
                    this.simOffsetX *= decay;
                    this.simOffsetY *= decay;
                    if (Math.abs(this.simOffsetX) < 0.35) this.simOffsetX = 0;
                    if (Math.abs(this.simOffsetY) < 0.35) this.simOffsetY = 0;
                }
                return;
            }

            const step = (this.simWalkSpeed || 1.35) * (dtMs / 16.67);
            this.simOffsetX += step * this.simDirection;
            const limit = this.simWalkRange || 100;

            if (this.simOffsetX >= limit) {
                this.simOffsetX = limit;
                this.simDirection = -1;
            } else if (this.simOffsetX <= -limit) {
                this.simOffsetX = -limit;
                this.simDirection = 1;
            }

            const faceLeft = this.simDirection < 0;
            if (this.facingLeft !== faceLeft) {
                this.facingLeft = faceLeft;
                const flipCb = byId('anim-preview-flip');
                if (flipCb) flipCb.checked = faceLeft;
            }
            if (this.runtime) this.runtime.facingLeft = this.facingLeft;
            this.updateStatus();
        }

        getDrawPosition(baseX, baseY) {
            return {
                x: baseX + (this.simOffsetX || 0),
                y: baseY + (this.simOffsetY || 0)
            };
        }

        stepFrame(delta) {
            this.playing = false;
            const playCb = byId('anim-preview-play');
            if (playCb) playCb.checked = false;

            if (this.mode === 'player' && this._playerFrames.length) {
                const n = this._playerFrames.length;
                this._playerFrameIndex = (this._playerFrameIndex + delta + n) % n;
                this.updateStatus();
                return;
            }

            const am = this.game?.assetManager;
            const data = am?.getSpriteAnimationSync(this.animId);
            if (!this.runtime || !data?.meta?.animations) return;
            const anim = data.meta.animations[this.animName] || data.meta.animations.idle;
            if (!anim?.frames?.length) return;
            const n = anim.frames.length;
            this.runtime.animName = this.animName;
            this.runtime.frameIndex = (this.runtime.frameIndex + delta + n) % n;
            this.runtime.elapsedMs = 0;
            this.updateStatus();
        }

        update(dtMs) {
            this._updateSimMovement(dtMs);
            if (!this.playing) return;
            const now = Date.now();

            if (this.mode === 'player') {
                if (!this._playerFrames.length) return;
                const delay = this._playerDelays[this._playerFrameIndex] || 100;
                this._playerFrameElapsed += dtMs;
                if (this._playerFrameElapsed >= delay) {
                    this._playerFrameElapsed -= delay;
                    this._playerFrameIndex = (this._playerFrameIndex + 1) % this._playerFrames.length;
                    this.updateStatus();
                }
                return;
            }

            const am = this.game?.assetManager;
            const data = am?.getSpriteAnimationSync(this.animId);
            if (!this.runtime || !data?.meta) return;
            this.runtime.facingLeft = this.facingLeft;
            this.runtime.tick(now, data.meta, this.animName, this._getMotionOpts());
            this.updateStatus();
        }

        _getMotionOpts() {
            const sim = this.simulateMoving !== false
                && (this.animName === 'walk' || (this.mode === 'player' && this.playing));
            return sim
                ? { moveSpeed: 2.2, maxSpeed: 2.8 }
                : { moveSpeed: 0, maxSpeed: 1 };
        }

        updateStatus() {
            const el = byId('anim-preview-status');
            if (!el) return;

            if (this.mode === 'player') {
                const n = this._playerFrames.length;
                const moveTag = this.isSimulatingMove()
                    ? ` · 位移 ${Math.round(this.simOffsetX)}`
                    : '';
                el.textContent = n
                    ? `玩家 GIF · 帧 ${this._playerFrameIndex + 1}/${n} · 缩放 ${this.scale.toFixed(1)}${moveTag}`
                    : '玩家 GIF 未加载';
                return;
            }

            const am = this.game?.assetManager;
            const data = am?.getSpriteAnimationSync(this.animId);
            if (!data?.meta) {
                el.textContent = this.animId ? '加载中…' : '未选择动画';
                return;
            }
            const anim = data.meta.animations[this.animName];
            const sheetIdx = this.runtime ? this.runtime.getSheetFrameIndex(data.meta) : 0;
            const fps = anim?.fps || 8;
            const fi = this.runtime?.frameIndex ?? 0;
            const fn = anim?.frames?.length || 0;
            const moveTag = this.isSimulatingMove()
                ? ` · 位移 ${Math.round(this.simOffsetX)}`
                : '';
            el.textContent = `${this.animId} · ${this.animName} · 序列 ${fi + 1}/${fn} · sheet #${sheetIdx} · ${fps} fps · 缩放 ${this.scale.toFixed(1)}${moveTag}`;
        }

        drawPreview(ctx, x, y) {
            const am = this.game?.assetManager;
            if (!am) {
                this._drawPlaceholder(ctx, x, y, '资源管理器未就绪');
                return;
            }
            const baseSize = CONFIG.MONSTER_SIZE || 32;
            const drawSize = baseSize * this.scale;
            const motionOpts = this._getMotionOpts();
            let drew = false;

            if (this.mode === 'player') {
                if (this._playerFrames.length) {
                    this._drawPlayerGif(ctx, x, y, drawSize);
                    drew = true;
                } else {
                    am.loadPlayerGifFrames().then(() => {
                        this._loadPlayerGif();
                    }).catch(() => {});
                }
            } else if (this.animId) {
                const data = am.getSpriteAnimationSync(this.animId);
                if (data && this.runtime) {
                    drew = am.drawSpriteAnimationFrame(
                        ctx, data, this.runtime, x, y, drawSize, drawSize, motionOpts
                    );
                } else if (!am.spriteAnimationCache.get(this.animId)?.loadFailed) {
                    am.loadSpriteAnimation(this.animId);
                }
                if (!drew) {
                    const mc = am.getMonsterImageConfig(this.animId);
                    if (mc?.image) {
                        const img = am.monsterImageCache.get(mc.image);
                        if (img) {
                            am.drawEntityImage(ctx, img, x, y, drawSize, drawSize);
                            drew = true;
                        } else {
                            am.loadMonsterImage(mc.image).then((loaded) => {
                                if (loaded) this.updateStatus();
                            });
                        }
                    }
                }
            }

            if (!drew) {
                this._drawPlaceholder(ctx, x, y, this.mode === 'player' ? '加载玩家 GIF…' : `加载 ${this.animId || '动画'}…`);
            }
        }

        _drawPlaceholder(ctx, x, y, msg) {
            ctx.save();
            ctx.strokeStyle = 'rgba(120, 200, 255, 0.45)';
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(x - 48, y - 64, 96, 96);
            ctx.setLineDash([]);
            ctx.fillStyle = '#cce8ff';
            ctx.font = '12px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(msg, x, y + 56);
            ctx.restore();
        }

        _drawPlayerGif(ctx, x, y, drawSize) {
            if (!this._playerFrames.length) return;
            const frame = this._playerFrames[this._playerFrameIndex];
            if (!frame) return;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.translate(x, y);
            if (this.facingLeft) ctx.scale(-1, 1);
            ctx.drawImage(frame, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
            ctx.restore();
        }

        applyDefaults() {
            this.populateEntitySelect();
            const modeSel = byId('anim-preview-mode');
            if (modeSel) modeSel.value = this.mode;
            this._syncModeControls();
            const playCb = byId('anim-preview-play');
            if (playCb) playCb.checked = this.playing;
            const flipCb = byId('anim-preview-flip');
            if (flipCb) flipCb.checked = this.facingLeft;
            const gridCb = byId('anim-preview-grid');
            if (gridCb) gridCb.checked = this.showGrid;
            const simCb = byId('anim-preview-sim-move');
            if (simCb) simCb.checked = this.simulateMoving !== false;
            this.refreshAnimNameOptions();
            this.loadCurrentAnim();
            this.resetPlayback();
        }

        open() {
            this.bindOnce();
            byId('anim-preview-modal')?.classList.add('show');
            this.applyDefaults();
            this.game?.syncGamePausedState();
        }

        close() {
            byId('anim-preview-modal')?.classList.remove('show');
            this.game?.syncGamePausedState();
        }

        isOpen() {
            return byId('anim-preview-modal')?.classList.contains('show');
        }
    }

    window.AnimPreviewUI = AnimPreviewUI;
})();
