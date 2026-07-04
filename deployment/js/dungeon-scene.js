/**
 * Phase 6 — 副本战斗场景
 */
(function () {
    'use strict';

    function pickRiftAffixes(count) {
        const pool = window.RIFT_AFFIXES || [];
        if (!pool.length) return [];
        const shuffled = pool.slice().sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(count || 2, shuffled.length));
    }

    window.DungeonScene = class DungeonScene {
        constructor(gameInstance) {
            this.gameInstance = gameInstance;
            this.width = CONFIG.CANVAS_WIDTH;
            this.height = CONFIG.CANVAS_HEIGHT;
            this.reset();
        }

        reset() {
            this.def = null;
            this.tier = null;
            this.mode = null;
            this.floorType = 'dungeon';
            this.monsters = [];
            this.boss = null;
            this.stageIndex = 0;
            this.waveIndex = 0;
            this.towerFloor = 0;
            this.bossRushIndex = 0;
            this.status = 'idle';
            this.statusText = '';
            this.hint = '';
            this.startTime = 0;
            this.eliteCleared = false;
            this.eliteSpawned = false;
            this.abyssEnergy = 0;
            this.abyssGateSpawned = false;
            this.abyssGateCleared = false;
            this.riftAffixes = [];
            this.rewardMult = 1;
            this.wavesReached = 0;
            this.fullClear = false;
            this.trialTowerFloor = 0;
            this.noHeal = false;
            this.exitPortal = { x: 50, y: 50, size: 40, name: '放弃副本' };
        }

        initRun(def, tier, runMeta) {
            this.reset();
            this.def = def;
            this.tier = tier;
            this.mode = def.mode;
            this.floorType = def.floorType || 'dungeon';
            this.noHeal = !!def.noHeal;
            this.startTime = Date.now();
            this.status = 'active';
            this.statusText = def.name + ' · ' + (tier.name || '');
            this.hint = def.description || '';
            this.rewardMult = 1;

            if (this.mode === 'rift') {
                this.riftAffixes = pickRiftAffixes(2 + Math.floor(Math.random() * 2));
                this.riftAffixes.forEach(a => {
                    if (a.rewardMult) this.rewardMult *= a.rewardMult;
                });
                this.hint = (this.riftAffixes.map(a => a.name).join('、') || '') + ' · ' + (this.hint || '');
            }

            if (runMeta) Object.assign(this, runMeta);

            this._advanceContent(true);
        }

        getMonsterLevel() {
            return (this.tier && this.tier.monsterLevel) || (this.def && this.def.unlockLevel) || 1;
        }

        _spawnPosition(index, total) {
            const cx = this.width / 2;
            const cy = this.height / 2 - 40;
            const angle = (Math.PI * 2 * index) / Math.max(1, total) + Math.random() * 0.4;
            const r = 70 + Math.random() * 110;
            return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
        }

        _spawnMonster(type, level) {
            if (typeof Monster === 'undefined' || !type) return null;
            const idx = this.monsters.length;
            const pos = this._spawnPosition(idx, idx + 1);
            const m = new Monster(pos.x, pos.y, type, this.gameInstance);
            if (typeof boostMonsterTowardLevel === 'function') boostMonsterTowardLevel(m, level);
            this._applyAffixesToMonster(m);
            m._isDungeonMob = true;
            return m;
        }

        _spawnBoss(bossId) {
            if (typeof Boss === 'undefined' || !bossId) return null;
            const pos = this._spawnPosition(0, 1);
            const b = new Boss(pos.x, pos.y, bossId, this.gameInstance);
            b._isDungeonBoss = true;
            if (typeof boostMonsterTowardLevel === 'function') {
                boostMonsterTowardLevel(b, this.getMonsterLevel());
            }
            this._applyAffixesToMonster(b);
            this.boss = b;
            return b;
        }

        _applyAffixesToMonster(m) {
            if (!m || !this.riftAffixes.length) return;
            this.riftAffixes.forEach(a => {
                if (a.monsterDamageMult) m.damage = Math.floor(m.damage * a.monsterDamageMult);
                if (a.monsterHpMult) {
                    m.maxHp = Math.floor(m.maxHp * a.monsterHpMult);
                    m.hp = m.maxHp;
                }
                if (a.monsterSpeedMult) {
                    m.speed *= a.monsterSpeedMult;
                    m.maxSpeed = m.speed;
                }
            });
        }

        _spawnFromPacks(packs, level) {
            const spawned = [];
            (packs || []).forEach(pack => {
                const count = pack.count || 1;
                for (let i = 0; i < count; i++) {
                    const m = this._spawnMonster(pack.type, level);
                    if (m) {
                        this.monsters.push(m);
                        spawned.push(m);
                    }
                }
            });
            return spawned;
        }

        _getStagesOrWaves() {
            if (this.mode === 'waves') return this.tier.waves || [];
            if (this.mode === 'boss_rush') return null;
            if (this.mode === 'tower' || this.mode === 'trial_tower') return null;
            if (this.mode === 'rift') return this.tier.stages || [];
            return this.tier.stages || [];
        }

        _advanceContent(initial) {
            const level = this.getMonsterLevel();

            if (this.mode === 'boss_rush') {
                const seq = this.tier.bossSequence || [];
                if (this.bossRushIndex >= seq.length) {
                    this._onRunComplete(true);
                    return;
                }
                this.monsters = [];
                this.boss = null;
                this.statusText = `${this.def.name} · ${this.bossRushIndex + 1}/${seq.length}`;
                this._spawnBoss(seq[this.bossRushIndex]);
                return;
            }

            if (this.mode === 'tower' || this.mode === 'trial_tower') {
                const maxFloors = this.tier.towerFloors || 10;
                if (this.towerFloor >= maxFloors) {
                    this._onRunComplete(true);
                    return;
                }
                this.towerFloor++;
                this.monsters = [];
                this.boss = null;
                this.statusText = `${this.def.name} · 第 ${this.towerFloor} 层`;
                const basePacks = this.tier.packsPerFloor || [{ type: 'goblin', count: 4 }];
                const countMult = 1 + Math.floor(this.towerFloor / 5);
                const packs = basePacks.map(p => ({
                    type: p.type,
                    count: Math.min(12, (p.count || 1) + countMult - 1)
                }));
                this._spawnFromPacks(packs, level + this.towerFloor - 1);

                const midBoss = this.tier.midBossFloor && this.towerFloor === this.tier.midBossFloor;
                const finalBoss = this.towerFloor === maxFloors;
                const bossEvery = this.tier.bossEvery;
                const isBossFloor = midBoss || finalBoss || (bossEvery && this.towerFloor % bossEvery === 0);

                if (isBossFloor) {
                    this.monsters = [];
                    const bossId = finalBoss
                        ? (this.tier.finalBossId || this.tier.bossId)
                        : (midBoss ? this.tier.midBossId : this.tier.bossId);
                    this._spawnBoss(bossId);
                }

                if (this.def.healFloors && this.def.healFloors.includes(this.towerFloor) && this.gameInstance && this.gameInstance.player) {
                    const p = this.gameInstance.player;
                    const heal = Math.floor(p.maxHp * (this.def.healPercent || 0.3));
                    p.hp = Math.min(p.maxHp, p.hp + heal);
                    if (typeof this.gameInstance.addFloatingText === 'function') {
                        this.gameInstance.addFloatingText(p.x, p.y, `层间恢复 +${heal}`, '#88ff88');
                    }
                }
                return;
            }

            const list = this._getStagesOrWaves();
            if (!list || this.stageIndex >= list.length) {
                if (this.mode === 'waves') {
                    this.wavesReached = list ? list.length : this.waveIndex;
                }
                this._onRunComplete(true);
                return;
            }

            const stage = list[this.stageIndex];
            this.monsters = [];
            this.boss = null;
            const label = stage.label || ('阶段' + (this.stageIndex + 1));
            this.statusText = `${this.def.name} · ${label}`;

            if (stage.bossId) {
                this._spawnBoss(stage.bossId);
            } else {
                this._spawnFromPacks(stage.packs, level);
                if (stage.elite && !this.eliteSpawned) {
                    this.eliteSpawned = true;
                    for (let i = 0; i < (stage.elite.count || 1); i++) {
                        const e = this._spawnMonster(stage.elite.type, level + 2);
                        if (e) {
                            e._isDungeonElite = true;
                            this.monsters.push(e);
                        }
                    }
                }
            }

            if (this.mode === 'waves') this.waveIndex = this.stageIndex + 1;
            this.stageIndex++;
        }

        _onRunComplete(victory) {
            this.status = victory ? 'complete' : 'failed';
            this.fullClear = victory;
            if (this.mode === 'trial_tower') this.trialTowerFloor = this.towerFloor;
        }

        notifyKilled(entity) {
            if (!entity || this.status !== 'active') return;

            if (entity._isDungeonElite) this.eliteCleared = true;

            if (this.def && this.def.abyssEnergy && entity._isDungeonMob) {
                this.abyssEnergy = Math.min(100, this.abyssEnergy + 8);
                if (this.abyssEnergy >= 100 && !this.abyssGateSpawned && this.tier.abyssGateBossId) {
                    this.abyssGateSpawned = true;
                    this.statusText = this.def.name + ' · 深渊之门';
                    this._spawnBoss(this.tier.abyssGateBossId);
                    this.boss._isAbyssGateBoss = true;
                }
            }

            const living = this.monsters.filter(m => m.hp > 0);
            this.monsters = living;

            if (this.boss && this.boss.hp <= 0) {
                if (this.boss._isAbyssGateBoss) {
                    this.abyssGateCleared = true;
                    this.boss = null;
                    return;
                }
                if (this.mode === 'boss_rush') {
                    this.bossRushIndex++;
                    this.boss = null;
                    if (this.bossRushIndex >= (this.tier.bossSequence || []).length) {
                        this._onRunComplete(true);
                    } else {
                        setTimeout(() => this._advanceContent(false), 800);
                    }
                    return;
                }
                if (this.mode === 'tower' || this.mode === 'trial_tower') {
                    this.boss = null;
                    if (this.mode === 'trial_tower' && this.towerFloor >= 30) {
                        this._onRunComplete(true);
                        return;
                    }
                    setTimeout(() => this._advanceContent(false), 600);
                    return;
                }
                this.boss = null;
                this._onRunComplete(true);
                return;
            }

            if (!this.boss && this.monsters.length === 0) {
                if (this.mode === 'waves') {
                    this.wavesReached = Math.max(this.wavesReached, this.waveIndex);
                }
                setTimeout(() => this._advanceContent(false), 500);
            }
        }

        getMonsters() {
            const list = this.monsters.filter(m => m && m.hp > 0);
            if (this.boss && this.boss.hp > 0) list.push(this.boss);
            return list;
        }

        isComplete() {
            return this.status === 'complete';
        }

        isFailed() {
            return this.status === 'failed';
        }

        getRunStats() {
            return {
                elapsedMs: Date.now() - (this.startTime || Date.now()),
                wavesReached: this.wavesReached || this.waveIndex,
                eliteCleared: this.eliteCleared,
                abyssGateCleared: this.abyssGateCleared,
                fullClear: this.fullClear,
                trialTowerFloor: this.trialTowerFloor || this.towerFloor,
                rewardMult: this.rewardMult
            };
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

        update(player) {
            this.getMonsters().forEach(m => {
                if (m.hp > 0 && typeof m.update === 'function') m.update(player);
            });
        }

        draw(ctx) {
            const assetManager = this.gameInstance?.assetManager;
            const floorKey = this.floorType || 'dungeon';
            if (assetManager) {
                const floorImageName = assetManager.getFloorImageName(floorKey);
                const floorImg = floorImageName ? assetManager.entityImageCache.get(floorImageName) : null;
                if (floorImg) {
                    const tileSize = CONFIG.TILE_SIZE || 50;
                    for (let x = 0; x < this.width; x += tileSize) {
                        for (let y = 0; y < this.height; y += tileSize) {
                            ctx.drawImage(floorImg, x, y, tileSize, tileSize);
                        }
                    }
                } else {
                    ctx.fillStyle = '#1a1520';
                    ctx.fillRect(0, 0, this.width, this.height);
                }
            } else {
                ctx.fillStyle = '#1a1520';
                ctx.fillRect(0, 0, this.width, this.height);
            }

            ctx.fillStyle = 'rgba(22, 18, 32, 0.82)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(12, 4, this.width - 24, 48, 10);
            } else {
                ctx.fillRect(12, 4, this.width - 24, 48);
            }
            ctx.fill();
            ctx.strokeStyle = 'rgba(136, 102, 170, 0.55)';
            ctx.lineWidth = 1.5;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(12, 4, this.width - 24, 48, 10);
                ctx.stroke();
            }

            ctx.fillStyle = '#e8e0ff';
            ctx.font = 'bold 15px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.statusText || '副本', this.width / 2, 24);
            ctx.fillStyle = '#bbaacc';
            ctx.font = '11px "Courier New", monospace';
            const hint = this.hint || '';
            ctx.fillText(hint.length > 48 ? hint.slice(0, 46) + '…' : hint, this.width / 2, 42);

            if (this.def && this.def.abyssEnergy) {
                const barX = 24;
                const barY = this.height - 30;
                const barW = this.width - 48;
                const barH = 14;
                const fillW = barW * (this.abyssEnergy / 100);
                ctx.fillStyle = 'rgba(40, 20, 60, 0.9)';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(barX, barY, barW, barH, 6);
                else ctx.fillRect(barX, barY, barW, barH);
                ctx.fill();
                const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
                grad.addColorStop(0, '#6622aa');
                grad.addColorStop(1, '#dd66ff');
                ctx.fillStyle = grad;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(barX, barY, fillW, barH, 6);
                else ctx.fillRect(barX, barY, fillW, barH);
                ctx.fill();
                ctx.fillStyle = '#eee';
                ctx.font = '10px "Courier New", monospace';
                ctx.textAlign = 'left';
                ctx.fillText('深渊能量', barX + 4, barY - 4);
            }

            ctx.fillStyle = '#4a3060';
            ctx.fillRect(this.exitPortal.x - this.exitPortal.size / 2, this.exitPortal.y - this.exitPortal.size / 2, this.exitPortal.size, this.exitPortal.size);
            ctx.strokeStyle = '#8866aa';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.exitPortal.x - this.exitPortal.size / 2, this.exitPortal.y - this.exitPortal.size / 2, this.exitPortal.size, this.exitPortal.size);
            ctx.fillStyle = '#fff';
            ctx.font = '11px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('放弃', this.exitPortal.x, this.exitPortal.y + 4);

            this.getMonsters().forEach(m => { if (m.draw) m.draw(ctx); });
        }
    };
})();
