/**
 * 自走棋 Roguelike 流程控制：开局、节点、战斗、奖励、结算
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function isEnabled() {
        const c = cfg();
        if (c.enabled === false) return false;
        return true;
    }

    class AutoBattlerController {
        constructor(game) {
            this.game = game;
            this.run = null;
            this.battle = null;
            this.ui = null;
            this._rewardCallback = null;
            this.roomTransition = null;
            this.deployEnter = null;
            this._deployDrag = null;
        }

        _easeOutCubic(t) {
            const p = Math.max(0, Math.min(1, t));
            return 1 - Math.pow(1 - p, 3);
        }

        _estimateBoardCell(w, h) {
            const ABS = window.AutoBattleSimulator;
            if (ABS && ABS.estimateBoardCellSize) {
                return ABS.estimateBoardCellSize(w, h);
            }
            return 72;
        }

        /** 己方/敌人/行进/入阵统一精灵半径（与格子同比例） */
        _unitSpriteRadius(cell) {
            const ABS = window.AutoBattleSimulator;
            if (ABS && ABS.unitSpriteRadius) {
                return ABS.unitSpriteRadius(cell);
            }
            const c = cell || 72;
            const ratio = (cfg().board && cfg().board.spriteCellRatio) || 0.34;
            return Math.max(20, Math.floor(c * ratio));
        }

        _marchHeroRadius(w, h) {
            return this._unitSpriteRadius(this._estimateBoardCell(w, h));
        }

        _deployEnterLocalProgress(slot) {
            const p = this._deployEnterProgress();
            const start = (slot && slot.stagger) || 0;
            const span = Math.max(0.05, 1 - start);
            return Math.max(0, Math.min(1, (p - start) / span));
        }
        _drawTravelCurtain(ctx, w, h, progress, mode) {
            progress = Math.max(0, Math.min(1, progress));
            if (progress <= 0.001) return;
            const color = '#060608';
            if (mode === 'cover') {
                const curtainW = progress * w;
                const edgeX = w - curtainW;
                ctx.fillStyle = color;
                ctx.fillRect(edgeX, 0, curtainW + 1, h);
                const fadeW = Math.min(56, Math.max(12, curtainW * 0.12));
                if (fadeW > 2) {
                    const g = ctx.createLinearGradient(edgeX - fadeW, 0, edgeX + fadeW * 0.5, 0);
                    g.addColorStop(0, 'rgba(6, 6, 8, 0)');
                    g.addColorStop(1, 'rgba(6, 6, 8, 1)');
                    ctx.fillStyle = g;
                    ctx.fillRect(edgeX - fadeW, 0, fadeW + fadeW * 0.5, h);
                }
            } else {
                const blackW = (1 - progress) * w;
                if (blackW <= 0.001) return;
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, blackW + 1, h);
                const fadeW = Math.min(56, Math.max(12, blackW * 0.12));
                if (fadeW > 2) {
                    const edgeX = blackW;
                    const g = ctx.createLinearGradient(edgeX - fadeW * 0.5, 0, edgeX + fadeW, 0);
                    g.addColorStop(0, 'rgba(6, 6, 8, 1)');
                    g.addColorStop(1, 'rgba(6, 6, 8, 0)');
                    ctx.fillStyle = g;
                    ctx.fillRect(edgeX - fadeW * 0.5, 0, fadeW * 1.5, h);
                }
            }
        }

        ensurePartyMeta() {
            if (!this.game.partyMeta) {
                this.game.partyMeta = window.PartyMetaSystem.createDefaultPartyMeta();
            } else {
                this.game.partyMeta = window.PartyMetaSystem.normalizePartyMeta(this.game.partyMeta);
            }
            return this.game.partyMeta;
        }

        startRun(seed) {
            const meta = this.ensurePartyMeta();
            window.__partyMetaRef = meta;
            const s = seed != null ? seed : (Date.now() & 0x7fffffff);
            this.run = window.RunStateSystem.createRunState(meta, s);
            if (window.AscensionHub) window.AscensionHub.onStartRun(this.run, meta);
            const rng = window.RunStateSystem.rngFromRun(this.run);
            const TRM = window.TowerRunMap;
            this.run.map = TRM.createEmptyMap
                ? TRM.createEmptyMap(s)
                : { seed: s, layers: 1, nodes: [], startId: null, nextChoices: [] };
            if (TRM.generateOpeningChoices) {
                TRM.generateOpeningChoices(this.run.map, rng);
            } else {
                this.run.map = TRM.generateRunMap(s, rng);
            }
            this.run.map._runRef = this.run;
            if (window.AutoBattlerAssets && window.AutoBattlerAssets.ensureLoaded) {
                window.AutoBattlerAssets.ensureLoaded();
            }
            if (window.AutoBattlerSceneBg && window.AutoBattlerSceneBg.ensureLoaded) {
                window.AutoBattlerSceneBg.ensureLoaded();
            }
            this.run.currentNodeId = null;
            this.run.phase = 'map';
            this.battle = null;
            this._pendingPactSelect = window.DemonPact && window.DemonPact.isUnlocked(meta) &&
                window.AscensionHub && window.AscensionHub.isEnabled('demonPact');

            // 初始化生命
            this.run.heroes.forEach((h) => {
                const st = window.PartyMetaSystem.heroCombatStats({
                    baseClass: h.baseClass,
                    level: h.level,
                    classData: h.classData
                });
                h.maxHp = st.hp;
                h.hp = st.hp;
            });

            if (typeof this.game.setAutoBattlerPresentation === 'function') {
                this.game.setAutoBattlerPresentation(true);
            }
            if (typeof SCENE_TYPES !== 'undefined') {
                this.game.transitionScene(SCENE_TYPES.AUTO_BATTLER || 'auto_battler');
            } else {
                this.game.currentScene = 'auto_battler';
            }
            this.game.paused = false;
            if (this.ui) this.ui.show();
            this.ui && this.ui.refresh();
            if (this._pendingPactSelect && this.ui && this.ui.showPactSelect) {
                this._pendingPactSelect = false;
                this.ui.showPactSelect(meta);
            }
            return this.run;
        }

        applyPactChoice(pactId, stars) {
            if (!this.run || !window.DemonPact) return false;
            window.DemonPact.applyPact(this.run, pactId, stars);
            window.DemonPact.applyToRun(this.run);
            this.ui && this.ui.refresh();
            return true;
        }

        skipPactChoice() {
            this._pendingPactSelect = false;
            this.ui && this.ui.refresh();
        }

        _canvasSize() {
            return {
                w: (this.game.canvas && this.game.canvas.width) || 1280,
                h: (this.game.canvas && this.game.canvas.height) || 720
            };
        }

        endRun(victory) {
            if (!this.run) return;
            this.run.finished = true;
            this.run.victory = !!victory;
            const earned = this.run.runExpEarned || 0;
            const meta = this.ensurePartyMeta();
            if (victory && window.AscensionHub) window.AscensionHub.onRunVictory(meta);
            if (!victory && window.DemonPact && window.DemonPact.shouldWipeMetaOnFailure(this.run)) {
                window.DemonPact.wipeMetaOnFailure(meta);
            }
            // 不再写入经验银行：等级只在塔内休息处分配，局外等级恒为 1
            if (victory) meta.runsCompleted += 1;
            const layer = this.run.path.length;
            if (layer > meta.highestRunLayer) meta.highestRunLayer = layer;

            window.RunStateSystem.clearRunLoadoutOnEnd(this.run);
            const summary = {
                victory: !!victory,
                expEarned: earned,
                pendingLevelPoints: this.run.pendingLevelPoints || 0,
                layersCleared: this.run.path.length,
                deathNarrative: !victory && this.run.ascension ? this.run.ascension.deathStats : null
            };
            this.battle = null;
            if (this.ui) this.ui.showRunSummary(summary);
            this.run = null;
            return summary;
        }

        returnToTown() {
            this.battle = null;
            this.run = null;
            if (this.ui) this.ui.hide();
            if (typeof this.game.setAutoBattlerPresentation === 'function') {
                this.game.setAutoBattlerPresentation(false);
            }
            if (typeof SCENE_TYPES !== 'undefined') {
                this.game.transitionScene(SCENE_TYPES.TOWN);
            } else {
                this.game.currentScene = 'town';
            }
        }

        selectNode(nodeId) {
            if (!this.run || this.run.phase !== 'map') return false;
            const map = this.run.map;
            const node = window.TowerRunMap.getNode(map, nodeId);
            if (!node || node.cleared) return false;

            if (!this.run.currentNodeId) {
                if (nodeId !== map.startId) return false;
            } else {
                const cur = window.TowerRunMap.getNode(map, this.run.currentNodeId);
                if (!cur || cur.edges.indexOf(nodeId) < 0) return false;
            }

            let fromSceneKey = 'battle';
            if (this.run.currentNodeId) {
                const prev = window.TowerRunMap.getNode(map, this.run.currentNodeId);
                const SBG = window.AutoBattlerSceneBg;
                if (prev && SBG) {
                    fromSceneKey = SBG.getSceneKeyForNodeType(prev.type);
                }
            }

            this.run.currentNodeId = nodeId;
            this.beginRoomTransition(node, fromSceneKey);
            return true;
        }

        beginRoomTransition(node, fromSceneKey) {
            const SBG = window.AutoBattlerSceneBg;
            const toKey = SBG ? SBG.getSceneKeyForNodeType(node.type) : 'battle';
            const fromKey = fromSceneKey || 'battle';
            if (SBG && SBG.ensureScene) {
                SBG.ensureScene(fromKey);
                SBG.ensureScene(toKey);
            }
            this.battle = null;
            this.run.phase = 'transition';
            this.roomTransition = {
                node,
                fromSceneKey: fromKey,
                nextSceneKey: toKey,
                t: 0,
                marchMs: 2000,
                curtainMs: 900,
                revealMs: 900
            };
            this.ui && this.ui.refresh();
        }

        _updateRoomTransition(dtMs) {
            const tr = this.roomTransition;
            if (!tr) return;
            tr.t += dtMs;
            const total = tr.marchMs + tr.curtainMs + tr.revealMs;
            if (tr.t >= total) {
                const node = tr.node;
                this.roomTransition = null;
                this.enterNode(node);
            }
        }

        enterNode(node) {
            switch (node.type) {
                case 'battle':
                case 'elite':
                case 'boss':
                case 'boss_final':
                    if (this._trySkirmish(node)) break;
                    this.run.phase = 'deploy';
                    this.refreshDeployPreview();
                    this.beginDeployEnter();
                    break;
                case 'shop':
                    this.run.phase = 'shop';
                    break;
                case 'rest':
                    this.run.phase = 'rest';
                    this.run.restResolved = false;
                    break;
                case 'event':
                    this.run.phase = 'event';
                    if (window.EventChainSystem) {
                        const zoneId = this.run.ascension && this.run.ascension.zoneId;
                        window.EventChainSystem.maybeStartChainOnEvent(this.run, zoneId);
                        const chainEv = window.EventChainSystem.getActiveChainEvent(this.run);
                        if (chainEv) {
                            this.run.currentEvent = chainEv;
                            break;
                        }
                    }
                    if (this.run.ascension && this.run.ascension.pendingCorruptionBoss) {
                        this.run.ascension.pendingCorruptionBoss = false;
                        this.run.currentEvent = {
                            id: 'corruption_boss',
                            title: '腐化具现',
                            desc: '腐化值过高，腐化 Boss 降临！',
                            choices: [{ id: 'fight', label: '迎战', desc: '进入战斗' }]
                        };
                        break;
                    }
                    if (window.EventChainSystem && window.AscensionHub &&
                        window.AscensionHub.isEnabled('eventChains')) {
                        const rng = window.RunStateSystem ? window.RunStateSystem.rngFromRun(this.run) : Math.random;
                        const roll = typeof rng === 'function' ? rng() : Math.random();
                        if (roll < 0.2) {
                            const standalone = window.EventChainSystem.pickRandomStandalone(rng);
                            const ev = window.EventChainSystem.standaloneToCurrentEvent(standalone);
                            if (ev) {
                                this.run.currentEvent = ev;
                                break;
                            }
                        }
                    }
                    this.run.currentEvent = window.AutoBattlerEvents
                        ? window.AutoBattlerEvents.pickEvent(this.run)
                        : null;
                    break;
                default:
                    this.run.phase = 'map';
            }
            this.ui && this.ui.refresh();
        }

        applyRest() {
            if (window.DemonPact && !window.DemonPact.canRestHeal(this.run)) return;
            const pct = ((cfg().rewards || {}).restHealPct != null)
                ? cfg().rewards.restHealPct
                : 0.4;
            const corrFx = window.CurseSystem ? window.CurseSystem.getCorruptionEffects(this.run) : null;
            const healMult = corrFx && corrFx.restHealMult ? corrFx.restHealMult : 1;
            this.run.heroes.forEach((h) => {
                const cur = Math.max(0, h.hp || 0);
                h.hp = Math.min(h.maxHp, cur + Math.floor(h.maxHp * pct * healMult));
            });
        }

        /**
         * 休整：分配等级点（可多次）/ 回血 / 升星 / 离开
         * 等级点由战斗经验累积，仅在此处加到角色上。
         */
        resolveRestChoice(choiceId, heroId) {
            if (!this.run || this.run.phase !== 'rest' || this.run.restResolved) {
                return { ok: false, message: '无效状态' };
            }
            const rng = window.RunStateSystem.rngFromRun(this.run);
            let result = { ok: true, choice: choiceId, leave: false };
            if (choiceId === 'heal') {
                this.applyRest();
                result.message = '全队回复生命';
                result.leave = true;
            } else if (choiceId === 'level') {
                const targetId = heroId || (this.run.heroes[0] && this.run.heroes[0].heroId);
                const res = window.RunStateSystem.addRunLevelToHero(this.run, targetId);
                if (!res.ok) return res;
                result.message = (res.hero.displayName || targetId) + ' 局内等级 +1（现 +' +
                    res.runLevel + '）· 剩余点数 ' + (res.pending || 0);
                result.hero = res.hero;
                result.pending = res.pending;
                result.leave = false;
            } else if (choiceId === 'purify') {
                if (window.CurseSystem && window.CurseSystem.purify(this.run)) {
                    result.message = '净化仪式：腐化 -20';
                    result.leave = false;
                } else {
                    return { ok: false, message: '金币不足或无法净化' };
                }
            } else if (choiceId === 'star') {
                const res = window.RunStateSystem.starUpRandomEquippedSkill(this.run, rng);
                if (!res.ok) return res;
                result.message = '「' + res.name + '」升至 ' + res.stars + ' 星';
                result.starUp = res;
                result.leave = true;
            } else if (choiceId === 'leave') {
                result.message = '离开营地';
                result.leave = true;
            } else {
                return { ok: false, message: '未知选项' };
            }
            if (result.leave) this.run.restResolved = true;
            return result;
        }

        setHeroCell(heroId, col, row) {
            if (!this.run || this.run.phase !== 'deploy') return false;
            const board = cfg().board || { cols: 4, rows: 3 };
            if (col < 0 || row < 0 || col >= board.cols || row >= board.rows) return false;
            const hero = window.RunStateSystem.findHero(this.run, heroId);
            if (!hero) return false;
            this.run.heroes.forEach((h) => {
                if (h !== hero && h.boardCol === col && h.boardRow === row) {
                    h.boardCol = -1;
                    h.boardRow = -1;
                }
            });
            hero.boardCol = col;
            hero.boardRow = row;
            this.refreshDeployPreview();
            if (this.ui) {
                this.ui.refreshBench();
                this.ui._syncDeployLayer();
            }
            return true;
        }

        beginDeployEnter() {
            this.deployEnter = null;
            if (!this.run || this.run.phase !== 'deploy' || !this.battle) return;
            if (this.ui && this.ui._reduceMotion) return;
            const size = this._canvasSize();
            window.AutoBattleSimulator.reanchorBattle(this.battle, size.w, size.h);
            const allies = (this.battle.allies || []).filter((u) => u.heroId);
            if (!allies.length) return;

            const units = allies.map((u, i) => ({
                heroId: u.heroId,
                baseClass: u.baseClass,
                endX: u.x,
                endY: u.y,
                startX: -140 - i * 36,
                startY: u.y,
                stagger: i * 0.07
            }));
            this.deployEnter = {
                t: 0,
                durationMs: 2200,
                units
            };
            this.ui && this.ui.refresh();
        }

        _deployEnterProgress() {
            if (!this.deployEnter) return 1;
            return Math.min(1, this.deployEnter.t / this.deployEnter.durationMs);
        }

        _deployEnterPos(slot) {
            const ease = this._easeOutCubic(this._deployEnterLocalProgress(slot));
            const bob = Math.sin(ease * Math.PI * 3) * 3 * (1 - ease);
            return {
                x: slot.startX + (slot.endX - slot.startX) * ease,
                y: slot.startY + (slot.endY - slot.startY) * ease + bob
            };
        }

        _updateDeployEnter(dtMs) {
            const de = this.deployEnter;
            if (!de) return;
            de.t += dtMs;
            if (de.t >= de.durationMs) {
                this.deployEnter = null;
                this.ui && this.ui.refresh();
            }
        }

        refreshDeployPreview() {
            if (!this.run || this.run.phase !== 'deploy') return;
            const node = window.TowerRunMap.getNode(this.run.map, this.run.currentNodeId);
            if (!node) return;
            this.battle = window.AutoBattleSimulator.createDeployPreview(this.run, node, this._canvasSize());
        }

        _trySkirmish(node) {
            if (!window.CombatPacing || !window.AscensionHub ||
                !window.AscensionHub.isEnabled('skirmishMode')) return false;
            const preview = window.AutoBattleSimulator.createDeployPreview
                ? window.AutoBattleSimulator.createDeployPreview(this.run, node, this._canvasSize())
                : null;
            const encounter = preview ? { enemies: preview.enemies } : { enemies: [] };
            if (!window.CombatPacing.canSkirmish(this.run, encounter, node)) return false;
            if (this.ui && this.ui.showSkirmishChoice) {
                this.run.phase = 'skirmish_choice';
                this.ui.showSkirmishChoice(node, encounter);
                return true;
            }
            return false;
        }

        resolveSkirmish(node, useSkirmish) {
            if (!useSkirmish) {
                this.run.phase = 'deploy';
                this.refreshDeployPreview();
                this.beginDeployEnter();
                this.ui && this.ui.refresh();
                return;
            }
            const preview = window.AutoBattleSimulator.createDeployPreview(this.run, node, this._canvasSize());
            const rng = window.RunStateSystem.rngFromRun(this.run);
            const result = window.CombatPacing.resolveSkirmish(this.run, { enemies: preview.enemies }, rng);
            this.run.phase = 'map';
            if (result.victory) {
                node.cleared = true;
                this.run.path.push(node.id);
                this._applyEarlyBattleHeal(node);
                if (result.goldMult > 0) this.grantCombatRewards(node);
                this._advanceMapAfterClear(node);
                this.run.phase = 'reward';
                this.ui && this.ui.showReward(() => {
                    this.run.phase = 'map';
                    this.ui && this.ui.refresh();
                });
            } else {
                this.endRun(false);
            }
        }

        startCombat() {
            if (!this.run || this.run.phase !== 'deploy') return false;
            if (this.deployEnter) return false;
            const placed = this.run.heroes.filter((h) => h.boardCol >= 0 && h.boardRow >= 0);
            if (!placed.length) return false;
            const node = window.TowerRunMap.getNode(this.run.map, this.run.currentNodeId);
            this.battle = window.AutoBattleSimulator.createBattle(this.run, node, this._canvasSize());
            this.battle.runRef = this.run;
            const meta = this.ensurePartyMeta();
            const speedUnlock = meta.ascension && meta.ascension.speedUnlock;
            let scale = (this.run.ascension && this.run.ascension.battleSpeedScale) || 1;
            if (scale > 1 && speedUnlock && !speedUnlock['x' + scale]) scale = 1;
            this.battle.timeScale = scale;
            if (window.AscensionHub) window.AscensionHub.onBattleStart(this.run, this.battle, node);
            if (window.BossPhaseSystem) window.BossPhaseSystem.attachBattleRef(this.battle);
            this.run.phase = 'combat';
            this.ui && this.ui.showCombat();
            return true;
        }

        /** 画布坐标点击：布阵落子 / 选中格子上的角色 */
        _canDeployInteract() {
            return !!(this.run && this.run.phase === 'deploy' && !this.deployEnter);
        }

        _ensureDeployBattle() {
            if (!this.run || this.run.phase !== 'deploy') return null;
            if (!this.battle || !this.battle.origin) this.refreshDeployPreview();
            if (this.battle) {
                window.AutoBattleSimulator.reanchorBattle(
                    this.battle, this.game.canvas.width, this.game.canvas.height
                );
            }
            return this.battle;
        }

        handleCanvasClick(canvasX, canvasY) {
            if (!this._canDeployInteract()) return false;
            const b = this._ensureDeployBattle();
            if (!b) return false;
            const ABS = window.AutoBattleSimulator;
            const selected = this.ui && this.ui._selectedHero;
            const unit = ABS.hitTestAllyUnit(b.board, b.origin, canvasX, canvasY, b.allies);
            const hit = ABS.hitTestAllyCell(b.board, b.origin, canvasX, canvasY);
            if (!selected) {
                if (unit && unit.heroId && this.ui) {
                    this.ui._selectedHero = unit.heroId;
                    this.ui.refreshBench();
                    return true;
                }
                if (!hit) return false;
                const occ = this.run.heroes.find((h) => h.boardCol === hit.col && h.boardRow === hit.row);
                if (occ && this.ui) {
                    this.ui._selectedHero = occ.heroId;
                    this.ui.refreshBench();
                }
                return !!occ;
            }
            if (hit) return this.setHeroCell(selected, hit.col, hit.row);
            return false;
        }

        handleReverseCombatClick(canvasX, canvasY) {
            const b = this.battle;
            if (!b || !b.mutationReverse || !this.run || this.run.phase !== 'combat') return false;
            const ABS = window.AutoBattleSimulator;
            if (!ABS || !ABS.hitTestEnemyUnit) return false;
            const enemy = ABS.hitTestEnemyUnit(b.board, b.origin, canvasX, canvasY, b.enemies);
            const ally = ABS.hitTestAllyUnit(b.board, b.origin, canvasX, canvasY, b.allies);
            if (enemy && enemy.alive) {
                (b.enemies || []).forEach((u) => { u.playerControlled = u.id === enemy.id; });
                b.reverseSelectedId = enemy.id;
                if (this.ui && this.ui.toast) this.ui.toast('已选择：' + (enemy.name || '敌人'));
                return true;
            }
            if (ally && ally.alive && b.reverseSelectedId) {
                const sel = (b.enemies || []).find((u) => u.id === b.reverseSelectedId);
                if (sel) {
                    sel.targetId = ally.id;
                    if (this.ui && this.ui.toast) this.ui.toast('目标：' + (ally.name || '我方'));
                }
                return true;
            }
            return false;
        }

        handleDeployPointerDown(canvasX, canvasY) {
            if (!this._canDeployInteract()) return false;
            const b = this._ensureDeployBattle();
            if (!b) return false;
            const ABS = window.AutoBattleSimulator;
            const unit = ABS.hitTestAllyUnit(b.board, b.origin, canvasX, canvasY, b.allies);
            if (unit && unit.heroId) {
                this._deployDrag = {
                    heroId: unit.heroId,
                    startX: canvasX,
                    startY: canvasY,
                    x: canvasX,
                    y: canvasY,
                    moved: false,
                    hover: null
                };
                if (this.ui) {
                    this.ui._selectedHero = unit.heroId;
                    this.ui.refreshBench();
                    if (this.ui._deployLayer) this.ui._deployLayer.classList.add('ab-dragging');
                }
                return true;
            }
            return this.handleCanvasClick(canvasX, canvasY);
        }

        handleDeployPointerMove(canvasX, canvasY) {
            const drag = this._deployDrag;
            if (!drag) return;
            if (!drag.moved) {
                const dx = canvasX - drag.startX;
                const dy = canvasY - drag.startY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
            }
            drag.x = canvasX;
            drag.y = canvasY;
            const b = this.battle;
            if (b && b.origin) {
                drag.hover = window.AutoBattleSimulator.hitTestAllyCell(
                    b.board, b.origin, canvasX, canvasY
                );
            }
        }

        handleDeployPointerUp(canvasX, canvasY) {
            const drag = this._deployDrag;
            if (!drag) return false;
            this._deployDrag = null;
            if (this.ui && this.ui._deployLayer) this.ui._deployLayer.classList.remove('ab-dragging');
            if (!drag.moved) return true;
            const b = this._ensureDeployBattle();
            if (!b) return false;
            const hit = window.AutoBattleSimulator.hitTestAllyCell(
                b.board, b.origin, canvasX, canvasY
            );
            if (hit) this.setHeroCell(drag.heroId, hit.col, hit.row);
            return true;
        }

        cancelDeployDrag() {
            this._deployDrag = null;
            if (this.ui && this.ui._deployLayer) this.ui._deployLayer.classList.remove('ab-dragging');
        }

        update(dtMs) {
            if (this.run && this.run.phase === 'transition' && this.roomTransition) {
                this._updateRoomTransition(dtMs);
                return;
            }
            if (this.run && this.run.phase === 'deploy' && this.deployEnter) {
                this._updateDeployEnter(dtMs);
                return;
            }
            if (!this.run || this.run.phase !== 'combat' || !this.battle) return;
            window.AutoBattleSimulator.tickBattle(this.battle, dtMs);
            if (this.ui) this.ui.refreshCombatBar(this.battle);
            if (this.battle.finished) {
                window.AutoBattleSimulator.syncHeroHpFromBattle(this.run, this.battle);
                this.onCombatEnd(this.battle.victory);
            }
        }

        _advanceMapAfterClear(node) {
            if (!this.run || !node || !window.TowerRunMap.generateNextChoices) return;
            const rng = window.RunStateSystem.rngFromRun(this.run);
            window.TowerRunMap.generateNextChoices(this.run.map, node, rng);
        }

        _applyEarlyBattleHeal(node) {
            if (!node || node.type !== 'battle') return;
            const runCfg = cfg().run || {};
            const pct = runCfg.earlyBattleHealPct != null ? runCfg.earlyBattleHealPct : 0;
            if (pct <= 0) return;
            const act = window.TowerRunMap.getActLayoutForLayer
                ? window.TowerRunMap.getActLayoutForLayer(node.layer)
                : null;
            if (!act || act.index !== 0) return;
            // 小胜回血不复活阵亡者，避免 0 血「假活」进下一场
            this.run.heroes.forEach((h) => {
                if ((h.hp || 0) <= 0) return;
                h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * pct));
            });
        }

        onCombatEnd(victory) {
            const node = window.TowerRunMap.getNode(this.run.map, this.run.currentNodeId);
            if (window.AscensionHub) {
                window.AscensionHub.onCombatEnd(this.run, this.battle, victory);
            }
            if (this.battle && this.battle.tacticalWithdraw) {
                this.battle = null;
                this.run.phase = 'map';
                this.ui && this.ui.refresh();
                return;
            }
            if (!victory) {
                this.endRun(false);
                return;
            }
            node.cleared = true;
            this.run.path.push(node.id);
            this._applyEarlyBattleHeal(node);
            this.grantCombatRewards(node);
            if (node.type === 'boss_final') {
                this.run.phase = 'reward';
                this.ui && this.ui.showReward(() => this.endRun(true));
                return;
            }
            this._advanceMapAfterClear(node);
            this.run.phase = 'reward';
            this.ui && this.ui.showReward(() => {
                this.run.phase = 'map';
                this.battle = null;
                this.ui && this.ui.refresh();
            });
        }

        grantCombatRewards(node) {
            const rng = window.RunStateSystem.rngFromRun(this.run);
            const rewards = cfg().rewards || {};
            const relicFx = window.RelicSystem
                ? window.RelicSystem.aggregateRelicEffects(this.run.relics)
                : { goldMult: 1, expMult: 1 };

            let goldMin = (rewards.battleGold || [12, 28])[0];
            let goldMax = (rewards.battleGold || [12, 28])[1];
            let expMin = (rewards.expPerBattle || [40, 80])[0];
            let expMax = (rewards.expPerBattle || [40, 80])[1];
            if (node.type === 'elite') {
                expMin = (rewards.expPerElite || [90, 140])[0];
                expMax = (rewards.expPerElite || [90, 140])[1];
                goldMin *= 1.5; goldMax *= 1.5;
            }
            if (node.type === 'boss' || node.type === 'boss_final') {
                expMin = (rewards.expPerBoss || [160, 240])[0];
                expMax = (rewards.expPerBoss || [160, 240])[1];
                goldMin *= 2; goldMax *= 2;
            }

            const gold = Math.floor((goldMin + rng() * (goldMax - goldMin)) * (relicFx.goldMult || 1));
            let exp = Math.floor((expMin + rng() * (expMax - expMin)) * (relicFx.expMult || 1));
            if (window.DemonPact) {
                const mod = window.DemonPact.modifyRewards(gold, exp, this.run);
                this.run.gold += mod.gold;
                exp = mod.exp;
            } else {
                this.run.gold += gold;
            }
            this.run.runExpEarned += exp;
            // 局内成长：战斗经验转化为「可分配等级点」，仅在休息处手动加到角色
            const inRunShare = Math.floor(exp * 0.55);
            const levelsGained = window.RunStateSystem.grantInRunExp
                ? window.RunStateSystem.grantInRunExp(this.run, inRunShare)
                : 0;

            const choices = [];
            if (node.type === 'elite') {
                const relics = window.RelicSystem.pickRelicChoices(rng, 3, this.run.relics, 'elite', this.run);
                if (relics.length) choices.push({ kind: 'relic_pick', options: relics });
            } else if (node.type === 'boss' || node.type === 'boss_final') {
                const skills = [];
                for (let i = 0; i < 3; i++) {
                    const sk = i === 0 && window.RunStateSystem.pickSynergySkill
                        ? window.RunStateSystem.pickSynergySkill(this.run, rng)
                        : window.RunStateSystem.pickSkillFromPool(rng, this.run.heroes[i % 4]);
                    skills.push(window.RunStateSystem.makeSkillLoot(sk.id));
                }
                choices.push({ kind: 'skill_pick', options: skills });
                if (rng() > 0.4) {
                    const relics = window.RelicSystem.pickRelicChoices(rng, 3, this.run.relics, 'boss', this.run);
                    if (relics.length) choices.push({ kind: 'relic_pick', options: relics });
                }
            } else {
                const SMS = window.SkillMutationSystem;
                const draft = SMS && SMS.buildBattleOffers
                    ? SMS.buildBattleOffers(this.run, rng)
                    : window.RunStateSystem.buildBattleDraftOptions(this.run, rng);
                choices.push({ kind: 'battle_pick', options: draft });
            }

            this.run.pendingLoot = {
                gold: gold,
                exp: exp,
                inRunLevels: levelsGained,
                choices: choices
            };
        }

        /** 领取战利品：技能/装备仅入背包，由 UI 打开装配面板 */
        takeRewardOption(choiceIndex, optionIndex) {
            const loot = this.run && this.run.pendingLoot;
            if (!loot || !loot.choices) return { kind: 'none' };
            const choice = loot.choices[choiceIndex];
            if (!choice) return { kind: 'none' };

            let result = { kind: 'none' };
            if (choice.kind === 'relic_pick') {
                const opt = choice.options[optionIndex];
                if (opt) window.RunStateSystem.addRelic(this.run, opt.id);
                result = { kind: 'relic' };
            } else if (choice.kind === 'skill_pick') {
                const opt = choice.options[optionIndex];
                if (opt) {
                    const res = window.RunStateSystem.addSkillToInventory(this.run, opt.id, opt.stars || 1);
                    this.run.skillsGainedThisRun = (this.run.skillsGainedThisRun || 0) + 1;
                    result = {
                        kind: 'skill', skillId: opt.id,
                        merged: res.merged, stars: res.stars, starUp: res.starUp,
                        prevStars: res.prevStars, heroId: res.heroId,
                        slotIndex: res.slotIndex, inventoryIndex: res.inventoryIndex
                    };
                }
            } else if (choice.kind === 'battle_pick') {
                const opt = choice.options[optionIndex];
                if (opt) {
                    const SMS = window.SkillMutationSystem;
                    if (opt.type === 'skill_upgrade' && SMS) {
                        const res = SMS.applySkillUpgrade(this.run, opt);
                        result = res.ok
                            ? {
                                kind: 'skill_upgrade',
                                title: opt.title || res.title,
                                skillId: opt.skillId,
                                lineageName: opt.lineageName,
                                branchTag: opt.branchTag || opt.branchName,
                                upgradeName: opt.upgradeName
                            }
                            : { kind: 'none' };
                    } else if (opt.type === 'skill_evolve' && SMS) {
                        const res = SMS.applySkillEvolve(this.run, opt);
                        result = res.ok
                            ? {
                                kind: 'skill_evolve',
                                title: opt.title || res.title,
                                skillId: opt.skillId,
                                intoId: opt.intoId,
                                lineageName: opt.lineageName,
                                branchTag: opt.branchTag || opt.branchName
                            }
                            : { kind: 'none' };
                    } else if (opt.type === 'skill' && opt.skill) {
                        const res = window.RunStateSystem.addSkillToInventory(
                            this.run, opt.skill.id, opt.skill.stars || 1
                        );
                        this.run.skillsGainedThisRun = (this.run.skillsGainedThisRun || 0) + 1;
                        result = {
                            kind: 'skill', skillId: opt.skill.id,
                            merged: res.merged, stars: res.stars, starUp: res.starUp,
                            prevStars: res.prevStars, heroId: res.heroId,
                            slotIndex: res.slotIndex, inventoryIndex: res.inventoryIndex
                        };
                    } else if (opt.type === 'gear' && opt.gear) {
                        this.run.inventoryGear.push(opt.gear);
                        this.run.gearGainedThisRun = (this.run.gearGainedThisRun || 0) + 1;
                        result = { kind: 'gear', gear: opt.gear };
                    } else if (opt.type === 'gold') {
                        const amt = opt.amount || 20;
                        this.run.gold += amt;
                        result = { kind: 'gold', amount: amt };
                    } else if (opt.type === 'heal') {
                        const pct = opt.pct != null ? opt.pct : 0.2;
                        this.run.heroes.forEach((h) => {
                            h.hp = Math.min(h.maxHp, h.hp + Math.floor(h.maxHp * pct));
                        });
                        result = { kind: 'heal', pct: pct };
                    }
                }
            } else if (choice.kind === 'skill_loot' && choice.skill) {
                const res = window.RunStateSystem.addSkillToInventory(this.run, choice.skill.id, choice.skill.stars || 1);
                this.run.skillsGainedThisRun = (this.run.skillsGainedThisRun || 0) + 1;
                result = {
                    kind: 'skill', skillId: choice.skill.id,
                    merged: res.merged, stars: res.stars, starUp: res.starUp,
                    prevStars: res.prevStars, heroId: res.heroId,
                    slotIndex: res.slotIndex, inventoryIndex: res.inventoryIndex
                };
            } else if (choice.kind === 'gear' && choice.gear) {
                this.run.inventoryGear.push(choice.gear);
                this.run.gearGainedThisRun = (this.run.gearGainedThisRun || 0) + 1;
                result = { kind: 'gear', gear: choice.gear };
            }
            loot.choices.splice(choiceIndex, 1);
            return result;
        }

        buyShopItem(item) {
            if (!this.run || this.run.phase !== 'shop' || !item) return false;
            if (this.run.gold < item.price) return false;
            this.run.gold -= item.price;
            if (item.type === 'skill') {
                const res = window.RunStateSystem.addSkillToInventory(this.run, item.id, 1);
                this.run.skillsGainedThisRun = (this.run.skillsGainedThisRun || 0) + 1;
                item._justBought = true;
                item._mergeResult = res;
            }
            if (item.type === 'gear') {
                this.run.inventoryGear.push(item.gear);
                this.run.gearGainedThisRun = (this.run.gearGainedThisRun || 0) + 1;
                item._justBought = true;
            }
            if (item.type === 'relic') window.RunStateSystem.addRelic(this.run, item.id);
            return true;
        }

        generateShopStock() {
            const rng = window.RunStateSystem.rngFromRun(this.run);
            const rewards = cfg().rewards || {};
            const gearPriceByR = rewards.shopGearPriceByRarity || {};
            const relicPriceByR = rewards.shopRelicPriceByRarity || {};
            const priceIn = (table, rarity, fallbackMin, fallbackMax) => {
                const range = table[rarity] || [fallbackMin, fallbackMax];
                const a = range[0] != null ? range[0] : fallbackMin;
                const b = range[1] != null ? range[1] : fallbackMax;
                return a + Math.floor(rng() * Math.max(1, b - a + 1));
            };
            const stock = [];
            for (let i = 0; i < 3; i++) {
                const hero = this.run.heroes[i % 4];
                const sk = window.RunStateSystem.pickSkillFromPool(rng, hero);
                stock.push({ type: 'skill', id: sk.id, name: sk.name, price: 25 + Math.floor(rng() * 20) });
            }
            for (let i = 0; i < 2; i++) {
                const hero = this.run.heroes[i % 4];
                const gear = window.RunStateSystem.makeGearLoot(rng, null, hero.baseClass);
                stock.push({
                    type: 'gear',
                    gear: gear,
                    name: gear.name,
                    price: priceIn(gearPriceByR, gear.rarity || 'common', 30, 55)
                });
            }
            if (rng() > 0.7) {
                const relics = window.RelicSystem.pickRelicChoices(rng, 1, this.run.relics, 'shop', this.run);
                if (relics[0]) {
                    stock.push({
                        type: 'relic',
                        id: relics[0].id,
                        name: relics[0].name,
                        price: priceIn(relicPriceByR, relics[0].rarity || 'common', 55, 90)
                    });
                }
            }
            return stock;
        }

        resolveEvent(choiceId) {
            if (!this.run || this.run.phase !== 'event') {
                return { ok: false, message: '无效状态' };
            }
            if (window.EventChainSystem && this.run.currentEvent && this.run.currentEvent.chainId) {
                const result = window.EventChainSystem.resolveChainChoice(this.run, choiceId);
                if (result.ok && this.run.ascension && this.run.ascension.pendingForcedCombat) {
                    result.forcedCombat = this.run.ascension.pendingForcedCombat;
                }
                return result;
            }
            if (this.run.currentEvent && this.run.currentEvent.id === 'corruption_boss' && choiceId === 'fight') {
                this.run.ascension.pendingForcedCombat = 'boss';
                return { ok: true, messages: ['腐化 Boss 现身'] };
            }
            if (window.EventChainSystem && this.run.currentEvent && this.run.currentEvent.eventId) {
                const standalone = window.EventChainSystem.resolveStandalone(
                    this.run, this.run.currentEvent.eventId || this.run.currentEvent.id, choiceId
                );
                if (standalone) {
                    if (standalone.openShop) {
                        this.run.phase = 'shop';
                    } else if (standalone.ok) {
                        this.run.currentEvent = null;
                    }
                    return standalone;
                }
            }
            if (!window.AutoBattlerEvents) {
                return { ok: false, message: '事件系统未加载' };
            }
            const result = window.AutoBattlerEvents.resolveChoice(this.run, choiceId);
            if (result.ok) this.run.currentEvent = null;
            return result;
        }

        finishNonCombatNode() {
            if (this.run && this.run.ascension && this.run.ascension.pendingForcedCombat) {
                const fc = this.run.ascension.pendingForcedCombat;
                this.run.ascension.pendingForcedCombat = null;
                const node = window.TowerRunMap.getNode(this.run.map, this.run.currentNodeId);
                if (node) {
                    node.type = fc === 'elite' ? 'elite' : (fc === 'boss' ? 'boss' : 'battle');
                    this.enterNode(node);
                    return;
                }
            }
            const node = window.TowerRunMap.getNode(this.run.map, this.run.currentNodeId);
            if (node) {
                node.cleared = true;
                this.run.path.push(node.id);
                this._advanceMapAfterClear(node);
            }
            this.run.phase = 'map';
            this.ui && this.ui.refresh();
        }

        render(ctx) {
            if (!this.run) return;
            this.renderArena(ctx);
        }

        _currentSceneKey() {
            const node = this.run && this.run.map && this.run.currentNodeId
                ? window.TowerRunMap.getNode(this.run.map, this.run.currentNodeId)
                : null;
            const SBG = window.AutoBattlerSceneBg;
            if (!SBG) return 'battle';
            return SBG.getSceneKeyForNodeType(node ? node.type : 'battle');
        }

        _drawSceneBg(ctx, sceneKey, w, h, opts) {
            const SBG = window.AutoBattlerSceneBg;
            if (SBG) {
                SBG.drawSceneBackground(ctx, sceneKey, w, h, opts);
                return;
            }
            ctx.fillStyle = '#121820';
            ctx.fillRect(0, 0, w, h);
        }

        renderArena(ctx) {
            const canvas = this.game.canvas;
            const w = canvas.width;
            const h = canvas.height;
            const phase = this.run.phase;

            if (phase === 'transition') {
                this.renderRoomTransition(ctx);
                return;
            }

            // 非战斗节点：独立场景背景（不是浮在棋盘上的小窗）
            if (phase === 'map' || phase === 'shop' || phase === 'event' || phase === 'rest' ||
                phase === 'summary' || phase === 'reward') {
                this.renderNodeSceneBackground(ctx, phase);
                return;
            }

            this._drawSceneBg(ctx, this._currentSceneKey(), w, h, { dim: 0.14 });

            if (phase === 'deploy' && (!this.battle || !this.battle.preview)) {
                this.refreshDeployPreview();
            }

            const showBoard = this.battle && (phase === 'combat' || phase === 'deploy');
            if (!showBoard) {
                this.renderEmptyBoard(ctx);
                return;
            }

            const b = this.battle;
            const visionHalf = this.run.ascension && this.run.ascension.visionHalf;
            let visionClip = null;
            if (visionHalf && phase === 'combat') {
                ctx.save();
                ctx.beginPath();
                if (visionHalf === 'right') {
                    ctx.rect(w / 2, 0, w / 2, h);
                    visionClip = 'right';
                } else {
                    ctx.rect(0, 0, w / 2, h);
                    visionClip = 'left';
                }
                ctx.clip();
            }

            window.AutoBattleSimulator.reanchorBattle(b, w, h);
            const shake = b.shake || 0;
            if (shake > 0.15) {
                const sx = (Math.random() - 0.5) * shake * 2;
                const sy = (Math.random() - 0.5) * shake * 2;
                ctx.save();
                ctx.translate(sx, sy);
            }
            this.drawBoardCells(ctx, b);
            if (this.run.phase === 'deploy') this._drawDeployDragOverlay(ctx, b);
            this.drawUnits(ctx, b);
            if (shake > 0.15) ctx.restore();
            if (typeof window.AutoBattleSimulator.drawUnitAuras === 'function') {
                window.AutoBattleSimulator.drawUnitAuras(ctx, b);
            }
            if (typeof window.AutoBattleSimulator.drawFx === 'function') {
                window.AutoBattleSimulator.drawFx(ctx, b);
            }
            if (b.juiceSystem && window.JuiceCore && window.JuiceCore.draw && !b.trueModeNoNumbers) {
                window.JuiceCore.draw(ctx, b.juiceSystem, w, h);
            }
            if (visionClip) {
                ctx.restore();
                ctx.fillStyle = 'rgba(0,0,0,0.82)';
                if (visionClip === 'left') ctx.fillRect(w / 2, 0, w / 2, h);
                else ctx.fillRect(0, 0, w / 2, h);
            }
            this.drawCombatLog(ctx, b);
            if (b.mutationReverse && this.run.phase === 'combat' && !b.finished) {
                ctx.save();
                ctx.fillStyle = 'rgba(40, 12, 8, 0.78)';
                ctx.fillRect(w * 0.12, h - 42, w * 0.76, 28);
                ctx.strokeStyle = '#ff6644';
                ctx.strokeRect(w * 0.12, h - 42, w * 0.76, 28);
                ctx.fillStyle = '#ffb088';
                ctx.font = '13px "Courier New", "Microsoft YaHei", monospace';
                ctx.textAlign = 'center';
                ctx.fillText('反转战斗：点击敌人选择 · 点击我方单位设目标', w * 0.5, h - 24);
                ctx.restore();
            }

            if (b.bossPhaseBanner && b.bossPhaseBanner.life > 0) {
                const banner = b.bossPhaseBanner;
                const alpha = Math.min(1, banner.life / Math.max(1, banner.maxLife || 2500));
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = 'rgba(8, 6, 18, 0.75)';
                ctx.fillRect(w * 0.25, 18, w * 0.5, 52);
                ctx.strokeStyle = '#c45a5a';
                ctx.strokeRect(w * 0.25, 18, w * 0.5, 52);
                ctx.fillStyle = '#f0d78c';
                ctx.font = 'bold 18px "Courier New", "Microsoft YaHei", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(banner.text || 'Boss 阶段', w * 0.5, 40);
                ctx.fillStyle = '#ccc';
                ctx.font = '13px "Courier New", "Microsoft YaHei", monospace';
                ctx.fillText(banner.hint || '', w * 0.5, 58);
                ctx.restore();
            }

            if (b.finale && b.finale.phase === 'slowmo' && this.run.phase === 'combat') {
                this._renderSlowmoFinale(ctx, b, w, h);
            } else if (b.finale && b.finale.phase === 'celebrate' && this.run.phase === 'combat') {
                this._renderVictoryFinale(ctx, b, w, h);
            } else if (b.finished && this.run.phase === 'combat' && !b.victory) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#e8a0a0';
                ctx.font = 'bold 48px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.fillText('DEFEAT', w / 2, h * 0.42);
                ctx.textAlign = 'left';
            }
        }

        _renderSlowmoFinale(ctx, b, w, h) {
            const f = b.finale;
            if (!f) return;
            const p = Math.min(1, f.t / Math.max(1, f.slowmoMs));
            ctx.fillStyle = `rgba(4, 6, 12, ${p * 0.35})`;
            ctx.fillRect(0, 0, w, h);
            if (b.finaleHit) {
                const flash = Math.max(0, 1 - p * 1.1);
                const hx = b.finaleHit.x;
                const hy = b.finaleHit.y;
                const grd = ctx.createRadialGradient(hx, hy, 8, hx, hy, 90 + flash * 50);
                grd.addColorStop(0, `rgba(255, 248, 210, ${flash * 0.55})`);
                grd.addColorStop(0.35, `rgba(255, 200, 90, ${flash * 0.28})`);
                grd.addColorStop(1, 'rgba(255, 200, 90, 0)');
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(hx, hy, 90 + flash * 50, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        _renderVictoryFinale(ctx, b, w, h) {
            const f = b.finale;
            if (!f) return;
            const p = Math.min(1, f.t / Math.max(1, f.celebrateMs));
            const pulse = 0.5 + 0.5 * Math.sin((f.pulse || 0) * 0.008);
            const cx = b.finaleHit ? b.finaleHit.x : w * 0.38;
            const cy = b.finaleHit ? b.finaleHit.y : h * 0.42;

            ctx.save();
            ctx.fillStyle = `rgba(0, 0, 0, ${0.12 + p * 0.28})`;
            ctx.fillRect(0, 0, w, h);

            const rayN = 10;
            for (let i = 0; i < rayN; i++) {
                const ang = (Math.PI * 2 * i) / rayN + (f.pulse || 0) * 0.0004;
                const len = w * (0.22 + p * 0.18) * pulse;
                ctx.strokeStyle = `rgba(255, 215, 120, ${0.04 + p * 0.1 * pulse})`;
                ctx.lineWidth = 18 + pulse * 10;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.55);
                ctx.stroke();
            }

            const ringR = 40 + p * 90 + pulse * 12;
            const ring = ctx.createRadialGradient(cx, cy, ringR * 0.2, cx, cy, ringR);
            ring.addColorStop(0, `rgba(255, 240, 180, ${0.35 * pulse})`);
            ring.addColorStop(0.45, `rgba(255, 200, 90, ${0.18 * pulse})`);
            ring.addColorStop(1, 'rgba(255, 200, 90, 0)');
            ctx.fillStyle = ring;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.fill();

            const scaleIn = this._easeOutCubic(Math.min(1, p * 2.2));
            const titleY = h * (0.34 + (1 - scaleIn) * 0.06);
            ctx.textAlign = 'center';
            ctx.font = `bold ${Math.floor(52 + pulse * 8)}px "Courier New", "Microsoft YaHei", monospace`;
            ctx.strokeStyle = `rgba(0, 0, 0, ${0.55 * scaleIn})`;
            ctx.lineWidth = 5;
            ctx.strokeText('胜利', w / 2, titleY);
            ctx.fillStyle = `rgba(240, 215, 140, ${0.55 + scaleIn * 0.45})`;
            ctx.fillText('胜利', w / 2, titleY);

            ctx.font = '16px "Courier New", "Microsoft YaHei", monospace';
            ctx.fillStyle = `rgba(200, 230, 200, ${Math.max(0, (p - 0.25) * 1.4)})`;
            ctx.fillText('战利品即将揭晓…', w / 2, titleY + 42);
            ctx.textAlign = 'left';
            ctx.restore();
        }

        renderNodeSceneBackground(ctx, phase) {
            const w = this.game.canvas.width;
            const h = this.game.canvas.height;

            if (phase === 'shop' || phase === 'event') {
                this._drawSceneBg(ctx, phase, w, h, { dim: 0.4 });
            } else {
                const themes = {
                    map: ['#0e1420', '#1a2438', '#0a1018'],
                    rest: ['#0e1814', '#1a2820', '#0a120e'],
                    reward: ['#16120e', '#241c14', '#0e0a08'],
                    summary: ['#121018', '#1c1824', '#0a0a10']
                };
                const c = themes[phase] || themes.map;
                const g = ctx.createLinearGradient(0, 0, w, h);
                g.addColorStop(0, c[0]);
                g.addColorStop(0.55, c[1]);
                g.addColorStop(1, c[2]);
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
            }

            ctx.strokeStyle = 'rgba(212, 180, 90, 0.12)';
            ctx.lineWidth = 2;
            ctx.strokeRect(28, 56, w - 56, h - 100);
            ctx.fillStyle = 'rgba(212, 180, 90, 0.35)';
            ctx.font = '13px "Courier New", monospace';
            const titles = {
                map: 'ROUTE SELECT',
                shop: 'GAP SHOP',
                event: 'STRANGE EVENT',
                rest: 'REST CAMP',
                reward: 'SPOILS',
                summary: 'RUN RESULT'
            };
            ctx.fillText(titles[phase] || 'SCENE', 40, 48);
        }

        renderRoomTransition(ctx) {
            const tr = this.roomTransition;
            if (!tr) return;
            const w = this.game.canvas.width;
            const h = this.game.canvas.height;
            const t = tr.t;
            const marchEnd = tr.marchMs;
            const curtainEnd = marchEnd + tr.curtainMs;
            const fromKey = tr.fromSceneKey || 'battle';
            const toKey = tr.nextSceneKey || 'battle';

            if (t < marchEnd) {
                const marchP = t / marchEnd;
                this._drawSceneBg(ctx, fromKey, w, h, { dim: 0.18 + marchP * 0.12 });
                this._drawMarchingParty(ctx, marchP, 0, w, h);
            } else if (t < curtainEnd) {
                const coverP = (t - marchEnd) / tr.curtainMs;
                const marchP = 1;
                this._drawSceneBg(ctx, fromKey, w, h, { dim: 0.3 + coverP * 0.35 });
                this._drawMarchingParty(ctx, marchP, coverP, w, h);
                this._drawTravelCurtain(ctx, w, h, coverP, 'cover');
            } else {
                const revealP = (t - curtainEnd) / tr.revealMs;
                this._drawSceneBg(ctx, toKey, w, h, { dim: 0.22 + (1 - revealP) * 0.1 });
                this._drawTravelCurtain(ctx, w, h, revealP, 'reveal');
            }
        }

        _drawMarchingParty(ctx, marchP, exitP, w, h) {
            if (!this.run || !this.run.heroes.length) return;
            exitP = exitP || 0;
            const heroes = this.run.heroes;
            const radius = this._marchHeroRadius(w, h);
            const spacing = radius * 2.15;
            const baseY = h * 0.58;
            const bob = Math.sin(marchP * Math.PI * 8) * 5;
            const startX = w * 0.18 + marchP * w * 0.42 + exitP * w * 0.22;
            const ABA = window.AutoBattlerAssets;
            const underCurtain = exitP > 0.55;

            heroes.forEach((hero, i) => {
                const x = startX + i * spacing;
                const y = baseY + bob * (i % 2 ? 1 : -1);
                if (underCurtain) {
                    ctx.globalAlpha = Math.max(0, 1 - (exitP - 0.55) / 0.45);
                }
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.beginPath();
                ctx.ellipse(x, y + radius * 0.9, radius * 0.72, radius * 0.26, 0, 0, Math.PI * 2);
                ctx.fill();
                let drawn = false;
                if (ABA && hero.baseClass) {
                    drawn = ABA.drawHero(ctx, hero.baseClass, x, y, radius, 1);
                }
                if (!drawn) {
                    ctx.fillStyle = '#6688aa';
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1;

            if (!underCurtain) {
                ctx.fillStyle = 'rgba(232, 228, 216, 0.55)';
                ctx.font = '14px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.fillText('前进…', w / 2, h - 120);
                ctx.textAlign = 'left';
            }
        }

        renderEmptyBoard(ctx) {
            const board = Object.assign({ cols: 4, rows: 3, cellSize: 70, gap: 8 }, cfg().board || {});
            const size = this._canvasSize();
            window.AutoBattleSimulator.fitBoardToCanvas(board, size.w, size.h);
            const fake = {
                board: board,
                origin: window.AutoBattleSimulator.battleOrigin(size.w, size.h, board),
                allies: [],
                enemies: [],
                fx: []
            };
            this.drawBoardCells(ctx, fake);
        }

        _drawQuad(ctx, q) {
            ctx.beginPath();
            ctx.moveTo(q.tl.x, q.tl.y);
            ctx.lineTo(q.tr.x, q.tr.y);
            ctx.lineTo(q.br.x, q.br.y);
            ctx.lineTo(q.bl.x, q.bl.y);
            ctx.closePath();
        }

        _drawCellDeployHintQuad(ctx, q) {
            const f = 0.14;
            ctx.strokeStyle = 'rgba(212, 180, 90, 0.38)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const tlT = { x: q.tl.x + (q.tr.x - q.tl.x) * f, y: q.tl.y + (q.tr.y - q.tl.y) * f };
            const tlL = { x: q.tl.x + (q.bl.x - q.tl.x) * f, y: q.tl.y + (q.bl.y - q.tl.y) * f };
            ctx.moveTo(tlL.x, tlL.y);
            ctx.lineTo(q.tl.x, q.tl.y);
            ctx.lineTo(tlT.x, tlT.y);
            const trT = { x: q.tr.x + (q.tl.x - q.tr.x) * f, y: q.tr.y + (q.tl.y - q.tr.y) * f };
            const trR = { x: q.tr.x + (q.br.x - q.tr.x) * f, y: q.tr.y + (q.br.y - q.tr.y) * f };
            ctx.moveTo(trT.x, trT.y);
            ctx.lineTo(q.tr.x, q.tr.y);
            ctx.lineTo(trR.x, trR.y);
            const brR = { x: q.br.x + (q.bl.x - q.br.x) * f, y: q.br.y + (q.bl.y - q.br.y) * f };
            const brB = { x: q.br.x + (q.tr.x - q.br.x) * f, y: q.br.y + (q.tr.y - q.br.y) * f };
            ctx.moveTo(brR.x, brR.y);
            ctx.lineTo(q.br.x, q.br.y);
            ctx.lineTo(brB.x, brB.y);
            const blB = { x: q.bl.x + (q.br.x - q.bl.x) * f, y: q.bl.y + (q.br.y - q.bl.y) * f };
            const blL = { x: q.bl.x + (q.tl.x - q.bl.x) * f, y: q.bl.y + (q.tl.y - q.bl.y) * f };
            ctx.moveTo(blB.x, blB.y);
            ctx.lineTo(q.bl.x, q.bl.y);
            ctx.lineTo(blL.x, blL.y);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.fillStyle = 'rgba(212, 180, 90, 0.06)';
            this._drawQuad(ctx, q);
            ctx.fill();
        }

        drawBoardCells(ctx, b) {
            const board = b.board;
            const ox = b.origin.x;
            const oy = b.origin.y;
            const size = window.AutoBattleSimulator.fieldSize(board);
            const depth = board.rows || 3;
            const lanes = board.cols || 4;
            const gap = board.gap || 8;
            const cell = board.cellSize || 72;
            const stride = cell + gap;
            const midGap = board.midGap != null ? board.midGap : 56;
            const ABS = window.AutoBattleSimulator;
            const midX = ox + depth * stride - gap + midGap / 2;
            const midTop = ABS.mapBoardPoint(midX, oy - 4, ox, oy, board);
            const midBot = ABS.mapBoardPoint(midX, oy + size.height + 4, ox, oy, board);

            ctx.strokeStyle = 'rgba(212, 180, 90, 0.09)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 9]);
            ctx.beginPath();
            ctx.moveTo(midTop.x, midTop.y);
            ctx.lineTo(midBot.x, midBot.y);
            ctx.stroke();
            ctx.setLineDash([]);

            for (let side of ['ally', 'enemy']) {
                const isAlly = side === 'ally';
                for (let r = 0; r < depth; r++) {
                    for (let c = 0; c < lanes; c++) {
                        const q = ABS.cellQuad(c, r, side, board, ox, oy);
                        const checker = (c + r) % 2;
                        this._drawQuad(ctx, q);
                        ctx.fillStyle = checker
                            ? 'rgba(0, 0, 0, 0.07)'
                            : 'rgba(255, 248, 235, 0.025)';
                        ctx.fill();
                        ctx.strokeStyle = isAlly
                            ? 'rgba(212, 180, 90, 0.1)'
                            : 'rgba(200, 190, 175, 0.08)';
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
                        ctx.beginPath();
                        ctx.moveTo(
                            q.tl.x + (q.tr.x - q.tl.x) * 0.08,
                            q.tl.y + (q.tr.y - q.tl.y) * 0.08
                        );
                        ctx.lineTo(
                            q.tr.x + (q.tl.x - q.tr.x) * 0.08,
                            q.tr.y + (q.tl.y - q.tr.y) * 0.08
                        );
                        ctx.stroke();
                        if (this.run && this.run.phase === 'deploy' && isAlly) {
                            this._drawCellDeployHintQuad(ctx, q);
                        }
                    }
                }
            }

            const labelY = oy - 12;
            const allyLabel = ABS.mapBoardPoint(ox, labelY, ox, oy, board);
            const enemyLabel = ABS.mapBoardPoint(ox + size.width, labelY, ox, oy, board);
            ctx.font = '10px "Courier New", monospace';
            ctx.fillStyle = 'rgba(212, 188, 120, 0.42)';
            ctx.fillText('己阵', allyLabel.x, allyLabel.y);
            ctx.fillStyle = 'rgba(190, 184, 172, 0.36)';
            ctx.textAlign = 'right';
            ctx.fillText('敌阵', enemyLabel.x, enemyLabel.y);
            ctx.textAlign = 'left';
        }

        _drawDeployDragOverlay(ctx, b) {
            const drag = this._deployDrag;
            if (!drag || !drag.hover) return;
            const ABS = window.AutoBattleSimulator;
            const q = ABS.cellQuad(drag.hover.col, drag.hover.row, 'ally', b.board, b.origin.x, b.origin.y);
            this._drawQuad(ctx, q);
            ctx.fillStyle = 'rgba(212, 180, 90, 0.22)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(240, 215, 140, 0.75)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.lineWidth = 1;
        }

        drawUnits(ctx, b) {
            const selected = this.ui && this.ui._selectedHero;
            const cell = (b.board && b.board.cellSize) || 70;
            const unitRadius = this._unitSpriteRadius(cell);
            const hideHud = !!(b.trueModeNoHud && this.run && this.run.phase === 'combat');
            const enterMap = new Map();
            if (this.deployEnter && this.run && this.run.phase === 'deploy') {
                this.deployEnter.units.forEach((slot) => {
                    enterMap.set(slot.heroId, this._deployEnterPos(slot));
                });
            }
            const drawUnit = (u, opts) => {
                opts = opts || {};
                if (!u.alive && !u.preview && !opts.forceDraw) return;
                const enterPos = u.heroId ? enterMap.get(u.heroId) : null;
                const rp = (!enterPos && window.AutoBattleSimulator && window.AutoBattleSimulator.getUnitRenderPos)
                    ? window.AutoBattleSimulator.getUnitRenderPos(u)
                    : null;
                const ux = enterPos ? enterPos.x : (rp ? rp.x : u.x);
                const uy = enterPos ? enterPos.y : (rp ? rp.y : u.y);
                const radius = unitRadius;
                let alpha = enterPos ? 1 : (u.preview ? 0.5 : 1);
                if (u.deadPreview) alpha = 0.32;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.beginPath();
                ctx.ellipse(ux, uy + radius * 0.85, radius * 0.75, radius * 0.28, 0, 0, Math.PI * 2);
                ctx.fill();

                if (u.hitFlash > 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.55)';
                    ctx.beginPath();
                    ctx.arc(ux, uy, radius + 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                let spriteDrawn = false;
                const ABA = window.AutoBattlerAssets;
                if (ABA) {
                    if (u.side === 'ally' && u.baseClass) {
                        spriteDrawn = ABA.drawHero(ctx, u.baseClass, ux, uy, radius, alpha);
                    } else if (u.templateId) {
                        spriteDrawn = ABA.drawEnemy(ctx, u.templateId, ux, uy, radius, alpha);
                    }
                }

                if (!spriteDrawn) {
                const grd = ctx.createRadialGradient(ux - radius * 0.25, uy - radius * 0.35, 2, ux, uy, radius);
                grd.addColorStop(0, '#ffffff55');
                grd.addColorStop(0.25, u.color || '#888');
                grd.addColorStop(1, '#00000077');
                ctx.fillStyle = grd;
                ctx.beginPath();
                ctx.arc(ux, uy, radius, 0, Math.PI * 2);
                ctx.fill();
                }
                if (u.heroId && u.heroId === selected) {
                    ctx.strokeStyle = '#f0d78c';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                    ctx.lineWidth = 1;
                } else {
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.stroke();
                }
                if (b.mutationReverse && u.side === 'enemy' && u.id === b.reverseSelectedId && u.playerControlled) {
                    ctx.beginPath();
                    ctx.strokeStyle = '#ff6644';
                    ctx.lineWidth = 3;
                    ctx.arc(ux, uy, radius + 6, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.lineWidth = 1;
                }
                if (!u.preview && !enterPos && !hideHud) {
                    const bw = radius * 2.1;
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.fillRect(ux - bw / 2, uy - radius - 12, bw, 6);
                    ctx.fillStyle = u.side === 'ally' ? '#6aaa7a' : '#c45a5a';
                    ctx.fillRect(ux - bw / 2, uy - radius - 12, bw * Math.max(0, u.hp / u.maxHp), 6);

                    // 技能 CD 点：亮=就绪，暗=冷却中
                    const skills = u.skills || [];
                    if (skills.length && u.side === 'ally') {
                        const pip = 5;
                        const gap = 3;
                        const totalW = skills.length * pip + (skills.length - 1) * gap;
                        let px = ux - totalW / 2;
                        const py = uy - radius - 18;
                        skills.forEach((sk) => {
                            const ready = !sk.cd || sk.cd <= 0;
                            const pct = ready ? 1 : 1 - Math.min(1, sk.cd / Math.max(1, sk.cooldownMs));
                            ctx.fillStyle = 'rgba(0,0,0,0.55)';
                            ctx.fillRect(px, py, pip, pip);
                            ctx.fillStyle = ready ? '#7ecbff' : '#3a5a72';
                            ctx.fillRect(px, py + pip * (1 - pct), pip, pip * pct);
                            if (ready) {
                                ctx.strokeStyle = 'rgba(200,240,255,0.8)';
                                ctx.strokeRect(px + 0.5, py + 0.5, pip - 1, pip - 1);
                            }
                            px += pip + gap;
                        });
                    }
                }
                if (u.castFlash > 0 && u.lastSkillName && !hideHud) {
                    ctx.fillStyle = 'rgba(126, 203, 255, 0.95)';
                    ctx.font = 'bold ' + Math.max(12, Math.floor(cell * 0.15)) + 'px "Courier New", "Microsoft YaHei", monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(u.lastSkillName, ux, uy - radius - 24);
                }
                if (!hideHud) {
                    ctx.fillStyle = '#e8e4d8';
                    ctx.font = Math.max(11, Math.floor(cell * 0.14)) + 'px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(u.name, ux, uy + radius + 16);
                    ctx.textAlign = 'left';
                }
                ctx.globalAlpha = 1;
            };
            (b.enemies || []).forEach(drawUnit);
            (b.allies || []).forEach((u) => {
                if (this._deployDrag && this._deployDrag.moved && u.heroId === this._deployDrag.heroId) {
                    ctx.globalAlpha = 0.35;
                    drawUnit(u);
                    ctx.globalAlpha = 1;
                    return;
                }
                drawUnit(u);
            });
            const drag = this._deployDrag;
            if (drag && drag.moved && this.run && this.run.phase === 'deploy') {
                const hero = window.RunStateSystem.findHero(this.run, drag.heroId);
                const ally = (b.allies || []).find((u) => u.heroId === drag.heroId);
                if (hero && ally) {
                    const ghost = Object.assign({}, ally, { x: drag.x, y: drag.y, preview: false });
                    ctx.globalAlpha = 0.92;
                    drawUnit(ghost);
                    ctx.globalAlpha = 1;
                }
            }
        }

        drawCombatLog(ctx, b) {
            if (!b || b.preview || !b.log || !b.log.length) return;
            if (this.run && this.run.phase !== 'combat') return;
            if (b.trueModeNoHud) return;
            const lines = b.log.slice(-5);
            const x = 16;
            let y = 78;
            ctx.font = '12px "Courier New", "Microsoft YaHei", monospace';
            lines.forEach((row, i) => {
                const alpha = 0.35 + (i / Math.max(1, lines.length - 1)) * 0.55;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = row.side === 'ally' ? '#9ad0ff' : '#ffb0b0';
                ctx.fillText(`${row.actor} → ${row.skill}`, x, y);
                y += 16;
            });
            ctx.globalAlpha = 1;
        }

        isActive() {
            return !!(this.run && this.game.currentScene === (typeof SCENE_TYPES !== 'undefined' ? SCENE_TYPES.AUTO_BATTLER : 'auto_battler'));
        }
    }

    window.AutoBattlerController = AutoBattlerController;
    window.AutoBattlerController.isEnabled = isEnabled;
})();
