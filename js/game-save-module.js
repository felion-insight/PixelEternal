/**
 * Pixel Eternal - 存档系统（从 game-main.js 拆分）
 */
(function () {
    'use strict';
    Object.assign(Game.prototype, {
        /**
         * 构建可序列化的存档对象（与导出/浏览器缓存共用）
         * @returns {Object}
         */
        buildSaveDataObject() {
            const saveData = {
                version: '3.0',
                timestamp: Date.now(),
                player: {
                    x: this.player.x,
                    y: this.player.y,
                    hp: this.player.hp,
                    maxHp: this.player.maxHp,
                    level: this.player.level,
                    exp: this.player.exp,
                    expNeeded: this.player.expNeeded,
                    gold: this.player.gold,
                    classData: this.player.classData,
                    classResource: this.player.classResource,
                    skillEnhanceLevels: this.player.skillEnhanceLevels || {},
                    skillHotbar: this.player.skillHotbar,
                    skillCooldowns: this.player.skillCooldowns || {},
                    chronicleUnlocked: this.player.chronicleUnlocked || [],
                    chronicleRelics: this.player.chronicleRelics || [],
                    storedPowers: this.player.storedPowers || [],
                    talentAllocations: this.player.talentAllocations || {},
                    displayName: this.player.displayName || '冒险者',
                    tutorialFlags: this.player.tutorialFlags || {},
                    materials: this.player.materials || {},
                    dungeonProgress: this.player.dungeonProgress || {},
                    equipment: {},
                    inventory: [],
                    maxEquipmentCapacity: this.player.maxEquipmentCapacity,
                    maxPotionCapacity: this.player.maxPotionCapacity
                },
                game: {
                    currentScene: this.currentScene,
                    floor: this.floor,
                    lastDeathFloor: this.lastDeathFloor,
                    needFloorRollback: this.needFloorRollback || false,
                    shopLockedItems: Array.from(this.shopLockedItems),
                    shopTargetSlots: JSON.parse(JSON.stringify(this.shopTargetSlots)),
                    shopCapacityExpansionCount: this.shopCapacityExpansionCount,
                },
                partyMeta: this.partyMeta
                    ? JSON.parse(JSON.stringify(this.partyMeta))
                    : null
            };
            Object.keys(this.player.equipment).forEach(slot => {
                const eq = this.player.equipment[slot];
                if (eq) {
                    saveData.player.equipment[slot] = this.serializeEquipment(eq);
                } else {
                    saveData.player.equipment[slot] = null;
                }
            });
            saveData.player.inventory = new Array(CONFIG.INVENTORY_SIZE).fill(null);
            this.player.inventory.forEach((item, index) => {
                if (item && index < CONFIG.INVENTORY_SIZE) {
                    if (item.type === 'equipment') {
                        saveData.player.inventory[index] = this.serializeEquipment(item);
                    } else if (item.type === 'consumable' || item.type === 'potion') {
                        saveData.player.inventory[index] = this.serializePotion(item);
                    }
                }
            });
            return saveData;
        },

        /**
         * 存档内容指纹（排除顶层 timestamp），用于判断是否与上次写入 localStorage 的存档码对应的数据一致。
         * @returns {string}
         */
        _computeSaveFingerprintSansTimestamp() {
            const data = this.buildSaveDataObject();
            const clone = JSON.parse(JSON.stringify(data));
            delete clone.timestamp;
            return JSON.stringify(clone);
        },

        _rememberSyncedSaveFingerprint() {
            try {
                this._lastSyncedSaveFingerprint = this._computeSaveFingerprintSansTimestamp();
                this._lastSaveCodeSyncTimeMs = Date.now();
            } catch (e) {
                this._lastSyncedSaveFingerprint = null;
            }
        },

        /**
         * 当存档数据相对上次同步有变化时，将最新存档码写入 localStorage（与「保存到浏览器」同一键）。
         * @param {boolean} [immediate=false] 为 true 时忽略节流（导入、手动保存、导出后等）
         */
        maybeAutoSyncSaveCodeToLocalStorage(immediate) {
            const now = Date.now();
            const intervalMs = 900;
            if (!immediate && now - this._lastSaveCodeSyncTimeMs < intervalMs) return;
            let fp;
            try {
                fp = this._computeSaveFingerprintSansTimestamp();
            } catch (e) {
                return;
            }
            if (!immediate && fp === this._lastSyncedSaveFingerprint) return;
            try {
                const saveCode = this.encodeSaveDataToSaveCode(this.buildSaveDataObject());
                localStorage.setItem(Game.BROWSER_SAVE_CODE_KEY, saveCode);
                this._lastSyncedSaveFingerprint = fp;
                this._lastSaveCodeSyncTimeMs = now;
            } catch (e) {
                if (e && e.name === 'QuotaExceededError') {
                    console.warn('自动同步存档码：浏览器存储空间不足');
                } else {
                    console.warn('自动同步存档码失败', e);
                }
            }
        },

        /**
         * 将存档对象编码为存档码字符串（与剪贴板导出一致）
         * @param {Object} saveData
         * @returns {string}
         */
        encodeSaveDataToSaveCode(saveData) {
            const payload = typeof window.peAttachSaveIntegrity === 'function'
                ? window.peAttachSaveIntegrity(saveData)
                : saveData;
            const jsonStr = JSON.stringify(payload);
            if (typeof LZString !== 'undefined') {
                return LZString.compressToBase64(jsonStr);
            }
            return btoa(encodeURIComponent(jsonStr));
        },

        /**
         * 解析存档码为存档对象（与导入弹窗逻辑一致）
         * @param {string} saveCode
         * @returns {Object}
         */
        parseSaveCodeToSaveData(saveCode) {
            const trimmed = (saveCode || '').trim();
            if (!trimmed) {
                throw new Error('空存档代码');
            }
            let jsonStr;
            if (typeof LZString !== 'undefined') {
                try {
                    jsonStr = LZString.decompressFromBase64(trimmed);
                    if (!jsonStr) {
                        throw new Error('LZString解压失败，尝试base64解码');
                    }
                } catch (e) {
                    jsonStr = decodeURIComponent(atob(trimmed));
                }
            } else {
                jsonStr = decodeURIComponent(atob(trimmed));
            }
            const parsed = JSON.parse(jsonStr);
            if (typeof window.peVerifySaveIntegrity === 'function') {
                const result = window.peVerifySaveIntegrity(parsed);
                if (!result.ok) {
                    throw new Error('存档校验失败，数据可能已损坏或被篡改');
                }
                return result.data;
            }
            return parsed;
        },

        /**
         * 将当前进度对应的存档码写入 localStorage（下次打开页面自动读取）
         */
        saveGameToBrowserStorage() {
            const key = Game.BROWSER_SAVE_CODE_KEY;
            try {
                const saveCode = this.encodeSaveDataToSaveCode(this.buildSaveDataObject());
                localStorage.setItem(key, saveCode);
                this._rememberSyncedSaveFingerprint();
                this.addFloatingText(this.player.x, this.player.y, '已保存到本浏览器', '#88ffcc');
            } catch (e) {
                if (e && e.name === 'QuotaExceededError') {
                    alert('浏览器存储空间不足，无法保存。请改用「导出存档」复制到剪贴板。');
                } else {
                    alert('保存到浏览器失败：' + (e && e.message ? e.message : String(e)));
                }
                console.error('saveGameToBrowserStorage', e);
            }
        },

        /**
         * 删除本浏览器 localStorage 中的存档码
         */
        clearBrowserSaveData() {
            try {
                localStorage.removeItem(Game.BROWSER_SAVE_CODE_KEY);
            } catch (e) {
                console.warn('清除浏览器存档失败', e);
            }
            this._lastSyncedSaveFingerprint = null;
            this._lastSaveCodeSyncTimeMs = 0;
        },

        /**
         * 重置为全新游戏状态（不写入 localStorage）
         */
        applyNewGameState() {
            this.monsterProjectiles = [];
            this.groundHazards = [];
            this.pendingMonsterAoE = [];
            this.soulCircles = [];
            this.droppedItems = [];
            this.rewardPickups = [];
            this.portals = [];
            this.floatingTexts = [];
            this.towerItems.clear();
            this.towerGoldGained = 0;
            this.isPlayerDead = false;
            this.activeTrial = null;
            this.activeDungeon = null;
            this.tutorialHighlightBuilding = null;
            if (this.trialScene) this.trialScene.reset();
            if (this.dungeonScene) this.dungeonScene.reset();
            if (this.trainingGroundScene) this.trainingGroundScene.clearAllDummies();
            this.currentRoom = null;
            this.floor = 1;
            this.lastDeathFloor = 1;
            this.towerStartFloor = 1;
            this.hasClearedFloor = false;
            this.needFloorRollback = false;
            this.shopRefreshCount = 0;
            this.shopEquipments = null;
            this.shopLockedItems = new Set();
            this.shopCapacityExpansionCount = 0;
            this.shopHasCapacityExpansion = false;
            this.shopTargetSlots = {
                legendary: { available: 1, target: null },
                epic: { available: 1, target: null },
                fine: { available: 1, target: null }
            };
            this.demonInterferenceActive = false;
            this.demonEffectStatusText = '';
            this.demonInterferenceFlags = {};
            this.transitionScene(SCENE_TYPES.TOWN);
            this.player = new Player(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2, this);
            if (typeof window.ensurePlayerMaterials === 'function') window.ensurePlayerMaterials(this.player);
            if (typeof window.ensurePlayerDungeonProgress === 'function') window.ensurePlayerDungeonProgress(this.player);
            this.player.updateStats();
            const roomTypeEl = document.getElementById('room-type');
            const floorEl = document.getElementById('floor-number');
            if (roomTypeEl) roomTypeEl.textContent = '主城';
            if (floorEl) floorEl.textContent = '准备中';
            this.ensureInventorySlotElements(Math.max(
                this.player.maxEquipmentCapacity,
                this.player.maxPotionCapacity
            ));
            this.updateHUD();
            this.updateInventoryUI();
            this.updateInventoryCapacity();
            this.updateWeaponSkillButton();
            this.syncGamePausedState();
        },

        /**
         * 清除存档：删除浏览器缓存并重置为全新角色
         */
        clearSave() {
            if (!confirm('确定清除本浏览器存档？\n\n当前角色的等级、装备、金币与进度将全部丢失，且无法恢复。')) {
                return;
            }
            this.clearBrowserSaveData();
            if (this.npcUI) this.npcUI.closeAll();
            if (this.classUI) {
                this.classUI.hideCharacterPanel();
                this.classUI.hideSkillPanel();
                this.classUI.hideClassSelect();
                this.classUI.hidePlayerNameModal();
            }
            if (this.tutorialUI) this.tutorialUI.hide();
            this.applyNewGameState();
            this.addFloatingText(this.player.x, this.player.y, '存档已清除', '#ff8866', 2500, 16, true);
            if (this.tutorialUI) {
                this.tutorialUI.beginOnboarding();
            } else if (this.classUI) {
                this.classUI.showClassSelectForced();
            }
        },

        /**
         * 启动时尝试从 localStorage 恢复存档码（静默；失败则清除坏数据）
         */
        tryAutoLoadBrowserSave() {
            const key = Game.BROWSER_SAVE_CODE_KEY;
            try {
                const code = localStorage.getItem(key);
                if (!code || !String(code).trim()) return;
                const saveData = this.parseSaveCodeToSaveData(String(code).trim());
                this.importSave(saveData, { quiet: true });
            } catch (e) {
                console.warn('浏览器缓存存档无效，已忽略', e);
                try {
                    localStorage.removeItem(key);
                } catch (_) { /* ignore */ }
            }
        },

        /**
         * 初始化存档系统
         */
        initSaveSystem() {
            // 导出存档按钮
            const exportBtn = document.getElementById('export-save-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    this.exportSave();
                });
            }
            
            // 导入存档按钮
            const importBtn = document.getElementById('import-save-btn');
            if (importBtn) {
                importBtn.addEventListener('click', () => {
                    this.showImportSaveModal();
                });
            }
        },

        /**
         * 显示存档代码模态框
         * @param {string} saveCode - 存档代码字符串
         */
        showSaveCodeModal(saveCode) {
            const modal = document.getElementById('save-code-modal');
            const codeTextarea = document.getElementById('save-code-text');
            const copyBtn = document.getElementById('copy-save-code-btn');
            const closeBtn = document.getElementById('close-save-code-modal');
            
            if (!modal || !codeTextarea) return;
            
            // 设置存档代码
            codeTextarea.value = saveCode;
            
            // 显示模态框
            modal.classList.add('show');
            this.paused = true;
            
            // 绑定复制按钮
            if (copyBtn && !copyBtn.dataset.bound) {
                copyBtn.dataset.bound = 'true';
                copyBtn.addEventListener('click', () => {
                    codeTextarea.select();
                    document.execCommand('copy');
                    this.addFloatingText(this.player.x, this.player.y, '存档代码已复制到剪贴板', '#00ff00');
                });
            }
            
            // 绑定关闭按钮
            if (closeBtn && !closeBtn.dataset.bound) {
                closeBtn.dataset.bound = 'true';
                closeBtn.addEventListener('click', () => {
                    this.closeSaveCodeModal();
                });
            }
        },

        /**
         * 关闭存档代码模态框
         */
        closeSaveCodeModal() {
            const modal = document.getElementById('save-code-modal');
            if (modal) {
                modal.classList.remove('show');
            }
            // 检查是否有其他界面打开，如果没有则恢复游戏
            const inventoryModal = document.getElementById('inventory-modal');
            const codexModal = document.getElementById('codex-modal');
            const shopModal = document.getElementById('shop-modal');
            const blacksmithModal = document.getElementById('blacksmith-modal');
            if (!this.devMode && !inventoryModal.classList.contains('show') && 
                !codexModal.classList.contains('show') && !shopModal.classList.contains('show') && 
                !blacksmithModal.classList.contains('show')) {
                this.paused = false;
            }
        },

        /**
         * 显示导入存档模态框
         */
        showImportSaveModal() {
            const modal = document.getElementById('import-save-modal');
            const codeTextarea = document.getElementById('import-save-code-text');
            const importBtn = document.getElementById('confirm-import-save-btn');
            const closeBtn = document.getElementById('close-import-save-modal');
            
            if (!modal || !codeTextarea) return;
            
            // 清空输入框
            codeTextarea.value = '';
            
            // 显示模态框
            modal.classList.add('show');
            this.paused = true;
            
            // 绑定导入按钮
            if (importBtn && !importBtn.dataset.bound) {
                importBtn.dataset.bound = 'true';
                importBtn.addEventListener('click', () => {
                    const saveCode = codeTextarea.value.trim();
                    if (!saveCode) {
                        alert('请输入存档代码！');
                        return;
                    }
                    
                    try {
                        const saveData = this.parseSaveCodeToSaveData(saveCode);
                        this.importSave(saveData);
                        this.closeImportSaveModal();
                        this.addFloatingText(this.player.x, this.player.y, '存档已导入', '#00ff00');
                    } catch (error) {
                        alert('存档代码格式错误！请检查代码是否正确。');
                        console.error('导入存档失败:', error);
                    }
                });
            }
            
            // 绑定关闭按钮
            if (closeBtn && !closeBtn.dataset.bound) {
                closeBtn.dataset.bound = 'true';
                closeBtn.addEventListener('click', () => {
                    this.closeImportSaveModal();
                });
            }
        },

        /**
         * 关闭导入存档模态框
         */
        closeImportSaveModal() {
            const modal = document.getElementById('import-save-modal');
            if (modal) {
                modal.classList.remove('show');
            }
            // 检查是否有其他界面打开，如果没有则恢复游戏
            const inventoryModal = document.getElementById('inventory-modal');
            const codexModal = document.getElementById('codex-modal');
            const shopModal = document.getElementById('shop-modal');
            const blacksmithModal = document.getElementById('blacksmith-modal');
            if (!this.devMode && !inventoryModal.classList.contains('show') && 
                !codexModal.classList.contains('show') && !shopModal.classList.contains('show') && 
                !blacksmithModal.classList.contains('show')) {
                this.paused = false;
            }
        },

        /**
         * 导出存档
         */
        exportSave() {
            const saveCode = this.encodeSaveDataToSaveCode(this.buildSaveDataObject());
            this.showSaveCodeModal(saveCode);
            try {
                localStorage.setItem(Game.BROWSER_SAVE_CODE_KEY, saveCode);
                this._rememberSyncedSaveFingerprint();
            } catch (e) {
                console.warn('导出后同步存档码到 localStorage 失败', e);
            }
            this.addFloatingText(this.player.x, this.player.y, '存档已导出', '#00ff00');
        },

        /**
         * 导入存档
         * @param {Object} saveData - 存档数据
         * @param {{ quiet?: boolean }} [options] - quiet 为 true 时不弹窗、不飘字（用于浏览器自动读档）
         */
        importSave(saveData, options) {
            const quiet = options && options.quiet === true;
            try {
                // 验证存档版本
                if (saveData.version !== '3.0' || !saveData.player || !saveData.game) {
                    if (saveData.version && saveData.version !== '3.0') {
                        throw new Error(`不支持旧存档版本 ${saveData.version}，当前仅支持 Phase 3 存档`);
                    }
                    throw new Error('存档格式不正确');
                }
                
                // 恢复玩家基本属性
                this.player.x = saveData.player.x || CONFIG.CANVAS_WIDTH / 2;
                this.player.y = saveData.player.y || CONFIG.CANVAS_HEIGHT / 2;
                this.player.hp = saveData.player.hp || 100;
                this.player.maxHp = saveData.player.maxHp || 100;
                this.player.level = saveData.player.level || 1;
                this.player.exp = saveData.player.exp || 0;
                this.player.expNeeded = (typeof window.computePlayerExpToNextLevel === 'function')
                    ? window.computePlayerExpToNextLevel(this.player.level)
                    : (saveData.player.expNeeded || 20);
                this.player.gold = saveData.player.gold || 0;
                this.player.classData = window.normalizeClassData(saveData.player.classData || null);
                if (saveData.player.classResource && window.hasPlayerClass(this.player.classData)) {
                    this.player.classResource = saveData.player.classResource;
                } else if (typeof window.initPlayerClassResource === 'function') {
                    window.initPlayerClassResource(this.player);
                }
                this.player.skillEnhanceLevels = saveData.player.skillEnhanceLevels || {};
                this.player.skillHotbar = saveData.player.skillHotbar || null;
                if (typeof window.initPlayerSkillHotbar === 'function') {
                    window.initPlayerSkillHotbar(this.player);
                }
                this.player.skillCooldowns = saveData.player.skillCooldowns || {};
                this.player.chronicleUnlocked = saveData.player.chronicleUnlocked || [];
                this.player.chronicleRelics = saveData.player.chronicleRelics || [];
                this.player.storedPowers = saveData.player.storedPowers || [];
                this.player.talentAllocations = saveData.player.talentAllocations || {};
                this.player.displayName = saveData.player.displayName || '冒险者';
                this.player.tutorialFlags = saveData.player.tutorialFlags || {};
                if (typeof window.ensurePlayerMaterials === 'function') window.ensurePlayerMaterials(this.player);
                if (saveData.player.materials) this.player.materials = saveData.player.materials;
                if (typeof window.ensurePlayerDungeonProgress === 'function') window.ensurePlayerDungeonProgress(this.player);
                if (saveData.player.dungeonProgress) {
                    if (!this.player.dungeonProgress) this.player.dungeonProgress = {};
                    Object.assign(this.player.dungeonProgress, saveData.player.dungeonProgress);
                }
                
                // 恢复背包容量
                this.player.maxEquipmentCapacity = saveData.player.maxEquipmentCapacity || 18;
                this.player.maxAlchemyCapacity = 0;
                this.player.maxPotionCapacity = saveData.player.maxPotionCapacity || 18;
                
                // 恢复装备
                Object.keys(this.player.equipment).forEach(slot => {
                    this.player.equipment[slot] = null;
                });
                if (saveData.player.equipment) {
                    Object.keys(saveData.player.equipment).forEach(slot => {
                        const eqData = saveData.player.equipment[slot];
                        if (eqData) {
                            try {
                                this.player.equipment[slot] = this.deserializeEquipment(eqData);
                            } catch (error) {
                                console.error(`恢复装备失败 (部位 ${slot}):`, error, eqData);
                            }
                        }
                    });
                }
                if (typeof this.player.onEquipmentSlotChanged === 'function') {
                    this.player.onEquipmentSlotChanged(null);
                }
                
                // 恢复背包
                this.player.inventory = new Array(CONFIG.INVENTORY_SIZE).fill(null);
                if (saveData.player.inventory && Array.isArray(saveData.player.inventory)) {
                    saveData.player.inventory.forEach((itemData, index) => {
                        if (itemData && index < CONFIG.INVENTORY_SIZE) {
                            try {
                                if (itemData.type === 'equipment') {
                                    this.player.inventory[index] = this.deserializeEquipment(itemData);
                                } else if (itemData.type === 'potion' || itemData.type === 'consumable') {
                                    if (itemData.consumableType === 'dungeon_license' || itemData.type === 'potion') {
                                        this.player.inventory[index] = null;
                                    } else {
                                        const restored = this.deserializePotion(itemData);
                                        this.player.inventory[index] = restored;
                                    }
                                } else if (itemData.type === 'alchemy' || itemData.type === 'material') {
                                    this.player.inventory[index] = null;
                                }
                            } catch (error) {
                                console.error(`恢复背包物品失败 (索引 ${index}):`, error, itemData);
                            }
                        }
                    });
                }
                
                // 恢复游戏状态
                this.currentScene = saveData.game.currentScene || SCENE_TYPES.TOWN;
                if (this.currentScene === 'dungeon' || this.currentScene === SCENE_TYPES.DUNGEON) {
                    this.currentScene = SCENE_TYPES.TOWN;
                    this.activeDungeon = null;
                    if (this.dungeonScene) this.dungeonScene.reset();
                }
                if (this.currentScene === SCENE_TYPES.AUTO_BATTLER || this.currentScene === 'auto_battler') {
                    this.currentScene = SCENE_TYPES.TOWN;
                }
                if (saveData.partyMeta && typeof window.PartyMetaSystem !== 'undefined') {
                    this.partyMeta = window.PartyMetaSystem.normalizePartyMeta(saveData.partyMeta);
                } else if (typeof window.PartyMetaSystem !== 'undefined') {
                    this.partyMeta = window.PartyMetaSystem.createDefaultPartyMeta();
                }
                const maxF = typeof window.getTowerMaxFloor === 'function' ? window.getTowerMaxFloor() : 240;
                this.floor = Math.min(saveData.game.floor || 1, maxF);
                this.lastDeathFloor = Math.min(saveData.game.lastDeathFloor || 1, maxF);
                this.needFloorRollback = saveData.game.needFloorRollback || false;
                
                // 恢复商店状态
                if (saveData.game.shopLockedItems) {
                    this.shopLockedItems = new Set(saveData.game.shopLockedItems);
                }
                if (saveData.game.shopTargetSlots) {
                    this.shopTargetSlots = JSON.parse(JSON.stringify(saveData.game.shopTargetSlots));
                }
                this.shopCapacityExpansionCount = saveData.game.shopCapacityExpansionCount || 0;
                
                // 清空掉落物和传送门
                this.droppedItems = [];
                this.rewardPickups = [];
                this.portals = [];
                
                // 更新玩家属性
                this.player.updateStats();
                
                // 如果不在主城，返回主城
                if (this.currentScene !== SCENE_TYPES.TOWN) {
                    this.returnToTown();
                } else {
                    // 如果在主城，确保主城场景已初始化
                    if (!this.townScene) {
                        this.townScene = new TownScene(this);
                    }
                    // 重置玩家位置到主城中心
                    this.player.x = CONFIG.CANVAS_WIDTH / 2;
                    this.player.y = CONFIG.CANVAS_HEIGHT / 2;
                }
                
                // 更新UI
                this.updateHUD();
                if (typeof window.syncChronicleFromProgress === 'function') {
                    window.syncChronicleFromProgress(this.player, this);
                }
                this.updateInventoryUI();
                this.updateInventoryCapacity();
                
                // 更新房间信息显示
                if (this.currentScene === SCENE_TYPES.TOWN) {
                    document.getElementById('room-type').textContent = '主城';
                    document.getElementById('floor-number').textContent = `上次到达: ${this.lastDeathFloor}层`;
                }
                
                if (!quiet) {
                    this.addFloatingText(this.player.x, this.player.y, '存档已导入', '#00ff00');
                }
                if (typeof window.migrateLegacyTutorialFlags === 'function') {
                    window.migrateLegacyTutorialFlags(this.player);
                }
                if (this.tutorialUI && !window.isTutorialComplete(this.player)) {
                    setTimeout(() => this.tutorialUI.beginOnboarding(), 600);
                }
                this.maybeAutoSyncSaveCodeToLocalStorage(true);
            } catch (error) {
                if (!quiet) {
                    alert('导入存档失败：' + error.message);
                }
                console.error('导入存档失败:', error);
                if (quiet) throw error;
            }
        },

        /**
         * 序列化装备
         * @param {Equipment} equipment - 装备对象
         * @returns {Object} 序列化后的装备数据
         */
        serializeEquipment(equipment) {
            return {
                id: equipment.id,
                name: equipment.name,
                type: 'equipment',
                slot: equipment.slot,
                weaponType: equipment.weaponType,
                quality: equipment.quality,
                level: equipment.level,
                enhanceLevel: equipment.enhanceLevel,
                refineLevel: equipment.refineLevel,
                baseStats: equipment.baseStats,
                stats: equipment.stats,
                isCrafted: equipment.isCrafted || false,
                baseTypeId: equipment.baseTypeId || null,
                implicit: equipment.implicit || null,
                prefixes: equipment.prefixes || [],
                suffixes: equipment.suffixes || [],
                legendaryPowers: equipment.legendaryPowers || [],
                setId: equipment.setId || null,
                buildEquipmentId: equipment.buildEquipmentId || null,
                classAffinity: equipment.classAffinity || null,
                procedural: equipment.procedural || false,
                gearScore: equipment.gearScore || 0
            };
        },

        /**
         * 反序列化装备
         * @param {Object} data - 装备数据
         * @returns {Equipment} 装备对象
         */
        deserializeEquipment(data) {
            const slot = (typeof window.normalizeEquipmentSlot === 'function')
                ? window.normalizeEquipmentSlot(data.slot)
                : data.slot;
            const eq = new Equipment({
                id: data.id,
                name: data.name,
                slot: slot,
                weaponType: data.weaponType,
                quality: data.quality,
                level: data.level,
                enhanceLevel: data.enhanceLevel || 0,
                refineLevel: data.refineLevel || 0,
                stats: data.baseStats || data.stats || {},
                isCrafted: data.isCrafted || false,
                baseTypeId: data.baseTypeId || null,
                implicit: data.implicit || null,
                prefixes: data.prefixes || [],
                suffixes: data.suffixes || [],
                legendaryPowers: data.legendaryPowers || [],
                setId: data.setId || null,
                buildEquipmentId: data.buildEquipmentId || null,
                classAffinity: data.classAffinity || null,
                procedural: data.procedural || false
            });
            
            // 恢复isCrafted属性
            if (data.isCrafted) {
                eq.isCrafted = true;
            }
            eq.buildEquipmentId = data.buildEquipmentId || null;
            
            return eq;
        },

        /**
         * 序列化背包中的消耗品（药水已移除，旧药水存档返回 null）
         * @param {Consumable} item
         * @returns {Object|null}
         */
        serializePotion(item) {
            if (!item) return null;
            if (item.type === 'potion' || item.consumableType === 'potion') {
                return null;
            }
            if (item.type !== 'consumable') {
                return null;
            }
            const result = {
                id: item.id,
                name: item.name,
                type: 'consumable',
                quality: item.quality,
                description: item.description,
                price: item.price,
                consumableType: item.consumableType || 'misc'
            };
            if (item.recipeId !== undefined) {
                result.recipeId = item.recipeId;
            }
            return result;
        },

        /**
         * 反序列化消耗品存档
         * @param {Object} data
         * @returns {Consumable|null}
         */
        deserializePotion(data) {
            if (!data) return null;
            if (data.type === 'potion' || data.consumableType === 'potion') {
                return null;
            }
            if (data.type !== 'consumable') {
                return null;
            }
            const consumableData = {
                id: data.id,
                name: data.name,
                consumableType: data.consumableType || 'misc',
                quality: data.quality || 'normal',
                description: data.description || '',
                price: data.price || 50
            };
            if (data.recipeId !== undefined) {
                consumableData.recipeId = data.recipeId;
            }
            return new Consumable(consumableData);
        }

    });
})();
