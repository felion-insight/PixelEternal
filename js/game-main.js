/**
 * Pixel Eternal - 游戏主类模块
 * 包含Game类及其所有方法
 * 
 * 注意：部分功能已拆分到独立模块：
 * - game-utils.js: 工具函数
 * - game-assets.js: 资源管理（AssetManager）
 * - game-tooltips.js: 工具提示系统（TooltipManager）
 */

// ====================================================================
// 模块4: 游戏主类
// ====================================================================

/**
 * 游戏主类
 * 管理整个游戏的状态、循环、UI交互等
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true }); // 确保支持透明度
        // 物理 canvas 尺寸是逻辑尺寸的 2 倍（分辨率翻倍）
        this.canvas.width = CONFIG.CANVAS_WIDTH * 2;
        this.canvas.height = CONFIG.CANVAS_HEIGHT * 2;
        
        // 初始化小地图
        this.minimapCanvas = document.getElementById('minimap-canvas');
        if (this.minimapCanvas) {
            this.minimapCtx = this.minimapCanvas.getContext('2d', { alpha: true }); // 确保支持透明度
            // 小地图尺寸（逻辑尺寸，不缩放）
            this.minimapCanvas.width = 200;
            this.minimapCanvas.height = 200;
        }
        
        // 设置canvas占满整个屏幕
        this.resizeCanvas();
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
        
        this.player = new Player(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2, this);
        
        // 资源管理器（需要在场景创建之前初始化）
        this.assetManager = new AssetManager();
        
        // 音效管理器
        this.soundManager = new SoundManager();
        
        // 相机系统：玩家永远居中，地图和实体随玩家移动
        this.cameraX = 0; // 相机X偏移量
        this.cameraY = 0; // 相机Y偏移量
        
        this.currentScene = SCENE_TYPES.TOWN; // 当前场景：主城、恶魔塔、训练场
        this.townScene = new TownScene(this); // 主城场景
        this.trainingGroundScene = new TrainingGroundScene(this); // 训练场场景
        this.currentRoom = null; // 恶魔塔房间
        this.floor = 1; // 当前层数
        this.lastDeathFloor = 1; // 上次死亡的层数
        this.towerStartFloor = 1; // 本次进入恶魔塔时的起始层数
        this.hasClearedFloor = false; // 本次进入恶魔塔是否通关了至少一层
        this.needFloorRollback = false; // 是否需要回退层数
        this.roomTransitionTimer = null; // 用于存储房间切换的定时器
        this.isTransitioning = false; // 标志：是否正在切换房间
        this.lastSceneTransitionTime = 0; // 上次场景切换的时间戳（用于E键交互冷却）
        this.floatingTexts = []; // 飘浮文字提示列表
        this.devMode = false; // 开发者模式标志
        this.paused = false; // 游戏暂停标志
        this.lastFrameTime = performance.now(); // 上一帧时间
        this.frameCount = 0; // 帧计数器
        this.fps = 0; // 当前渲染FPS（保留用于显示）
        this.fpsUpdateInterval = 0; // FPS更新间隔
        
        // 固定时间步长系统（TPS逻辑更新）
        const ticksPerSecond = CONFIG.TICKS_PER_SECOND || 60;
        this.fixedTimeStep = 1000 / ticksPerSecond; // ms per update
        this.accumulator = 0; // 累积时间
        this.lastUpdateTime = performance.now(); // 上次逻辑更新时间
        this.lastRenderTime = performance.now(); // 上次渲染时间
        
        // TPS和mspt统计
        this.tps = 0; // 当前TPS
        this.tpsCount = 0; // TPS计数器
        this.tpsUpdateInterval = 0; // TPS更新间隔
        this.mspt = 0; // 当前mspt（milliseconds per tick）
        this.tickTimes = []; // 存储最近几次tick的时间
        this.currentInteraction = null; // 当前可交互对象
        this.showFirstTimeGuide = false; // 是否显示首次游戏提示
        this.shopRefreshCost = 150; // 商店刷新费用（固定值150）
        this.shopRefreshCount = 0; // 商店刷新次数（不再用于递增费用）
        this.shopEquipments = null; // 商店当前装备列表（保存状态，避免重新打开时免费刷新）
        this.shopPotions = null; // 商店当前药水列表（保存状态，避免重新打开时免费刷新）
        this.shopRecipes = null; // 商店当前图纸列表（保存状态，避免重新打开时免费刷新）
        this.shopLockedItems = new Set(); // 锁定的商品ID集合
        this.shopCapacityExpansionCount = 0; // 背包扩容购买次数（用于递增价格）
        this.shopHasCapacityExpansion = false; // 当前商店是否显示背包扩容
        this.shopTargetSlots = {
            legendary: { available: 1, target: null }, // 传说定向位
            epic: { available: 1, target: null }, // 史诗定向位
            fine: { available: 1, target: null } // 精良定向位
        }; // 定向位系统
        this.droppedItems = []; // 地面掉落物列表
        this.portals = []; // 传送门列表
        this.equipmentEffects = []; // 打造装备特效列表
        this.monsterProjectiles = []; // 远程怪物发射的子弹
        this.groundHazards = []; // 地面持续伤害（毒雾、酸沼等）
        this.pendingMonsterAoE = []; // 延迟落地的怪物 AOE（星渊法师等）
        this.soulCircles = []; // 法阵祭司：地面法阵（友方回血 / 玩家减速）

        // 物品追踪系统：追踪本次恶魔塔中获得的物品
        this.towerItems = new Set(); // 存储物品的唯一标识符
        this.towerGoldGained = 0; // 追踪本次恶魔塔中获得的金币数量
        this.isPlayerDead = false; // 标记玩家是否死亡
        
        // 恶魔的干扰
        this.demonInterferenceTriggerChance = 0.2; // 每层结束20%概率触发
        this.demonInterferenceActive = false; // 是否正在显示恶魔干扰
        this.demonInterferenceEffect = null; // 当前触发的效果 { type, text, ... }
        this.demonInterferenceOverlay = null; // 遮罩层引用
        this.demonInterferenceTypingInterval = null;
        this.demonInterferenceSpaceHandler = null;
        this.demonInterferenceFlags = {}; // 效果b用：{ forceRoomTypes, sealExit }
        this.demonEffectStatusText = ''; // 状态栏红字
        
        // 战力变化提示定时器
        this.combatPowerNotificationTimer = null;
        
        this.keys = {};
        this.lastEKeyState = false; // 上次E键状态，用于检测按键按下事件
        this.mouse = { x: 0, y: 0, left: false };
        /** 落点技/锁定技：长按 Q、技能键或右键蓄力，松手释放；null 表示未在蓄力 */
        this.weaponSkillAim = null;
        this._weaponSkillGlobalMouseUp = (e) => {
            if (e.button === 0) this._onWeaponSkillInputUp('btn');
            else if (e.button === 2) this._onWeaponSkillInputUp('rmb');
        };
        
        // 工具提示管理器
        this.tooltipManager = new TooltipManager(this);
        
        // 粒子系统管理器
        this.particleManager = new ParticleManager();
        
        /** 合铸：30 秒锻炉 + 领取动画（见 doFusion / claim） */
        this.fusionState = null;
        this.fusionCompletionBannerShown = false;
        this.lastFusionWeaponParticleTime = 0;
        this._fusionRevealClickHandler = null;
        
        // 背包图片更新请求ID（用于取消之前的更新）
        this.inventoryImageUpdateRequestId = null;
        
        // 缓存生成的装备列表，避免重复生成
        this.cachedAllEquipments = null;
        this.cachedAllPotions = null;
        this.cachedAllMaterials = null;
        
        // 将game实例暴露到全局，方便开发者模式调用
        window.game = this;
        
        // 不立即初始化，等待资源加载完成
        // this.init();
    }
    
    /**
     * 预加载所有资源
     * @returns {Promise<void>}
     */
    async preloadResources() {
        console.log('preloadResources 函数被调用');
        
        // 等待一小段时间，确保DOM完全加载
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const loadingScreen = document.getElementById('loading-screen');
        const progressFill = document.getElementById('loading-progress-fill');
        const progressText = document.getElementById('loading-progress-text');
        const statusText = document.getElementById('loading-status-text');
        
        console.log('加载界面元素:', {
            loadingScreen: !!loadingScreen,
            progressFill: !!progressFill,
            progressText: !!progressText,
            statusText: !!statusText
        });
        
        // 确保加载界面可见
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
            loadingScreen.style.visibility = 'visible';
            loadingScreen.style.opacity = '1';
            loadingScreen.classList.remove('hidden');
            console.log('加载界面已设置为可见');
        } else {
            console.error('加载界面元素未找到！');
            return;
        }
        
        // 确保所有UI元素存在
        if (!progressFill || !progressText || !statusText) {
            console.error('加载界面UI元素未找到:', {
                progressFill: !!progressFill,
                progressText: !!progressText,
                statusText: !!statusText
            });
            // 即使元素不存在，也继续执行，但跳过UI更新
            console.warn('继续执行，但不会更新UI');
        }
        
        console.log('开始预加载流程...');
        
        try {
            // 更新状态：获取资源列表
            console.log('更新状态：获取资源列表...');
            if (statusText) {
                statusText.textContent = '正在获取资源列表...';
            }
            await new Promise(resolve => setTimeout(resolve, 200)); // 短暂延迟，让UI更新
            
            // 收集所有需要加载的资源
            const resourcesToLoad = [];
            
            // 1. 装备图片
            console.log('获取所有装备名称...');
            const allEquipments = generateEquipments();
            const equipmentNames = [...new Set(allEquipments.map(eq => eq.name))];
            equipmentNames.forEach(name => {
                const imageName = this.assetManager.getEquipmentImageName(name);
                if (imageName && !this.assetManager.equipmentImageCache.has(imageName)) {
                    resourcesToLoad.push({ 
                        type: 'equipment', 
                        name, 
                        imageName,
                        loadFn: () => this.assetManager.loadAndProcessEquipmentImage(imageName)
                    });
                }
            });
            
            // 2. 炼金材料图片
            console.log('获取所有炼金材料名称...');
            if (typeof ALCHEMY_MATERIAL_DEFINITIONS !== 'undefined') {
                ALCHEMY_MATERIAL_DEFINITIONS.forEach(material => {
                    const imageName = this.assetManager.getAlchemyMaterialImageName(material.name);
                    if (imageName && !this.assetManager.alchemyMaterialImageCache.has(imageName)) {
                        resourcesToLoad.push({ 
                            type: 'alchemy', 
                            name: material.name, 
                            imageName,
                            loadFn: () => this.assetManager.loadAndProcessAlchemyMaterialImage(imageName)
                        });
                    }
                });
            }
            
            // 3. 怪物贴图
            console.log('获取所有怪物贴图...');
            if (typeof MONSTER_TYPES !== 'undefined') {
                Object.keys(MONSTER_TYPES).forEach(monsterType => {
                    const monsterConfig = this.assetManager.getMonsterImageConfig(monsterType);
                    if (monsterConfig && monsterConfig.image && !this.assetManager.monsterImageCache.has(monsterConfig.image)) {
                        resourcesToLoad.push({ 
                            type: 'monster', 
                            name: MONSTER_TYPES[monsterType].name, 
                            imageName: monsterConfig.image,
                            loadFn: () => this.assetManager.loadMonsterImage(monsterConfig.image)
                        });
                    }
                });
            }
            
            // 4. 玩家 GIF
            console.log('获取玩家 GIF...');
            const playerConfig = this.assetManager.getPlayerGifConfig();
            if (playerConfig && playerConfig.image) {
                resourcesToLoad.push({ 
                    type: 'player', 
                    name: '玩家', 
                    imageName: playerConfig.image,
                    loadFn: () => this.assetManager.loadPlayerGifFrames()
                });
            }
            
            const totalImages = resourcesToLoad.length;
            console.log('需要加载的资源数量:', totalImages, {
                equipment: resourcesToLoad.filter(r => r.type === 'equipment').length,
                alchemy: resourcesToLoad.filter(r => r.type === 'alchemy').length,
                monster: resourcesToLoad.filter(r => r.type === 'monster').length,
                player: resourcesToLoad.filter(r => r.type === 'player').length
            });
            let loadedImages = 0;
            
            // 更新进度条的函数
            const updateProgress = () => {
                const progress = totalImages > 0 ? Math.floor((loadedImages / totalImages) * 100) : 0;
                console.log(`更新进度: ${loadedImages}/${totalImages} = ${progress}%`);
                
                // 使用 requestAnimationFrame 确保UI更新
                requestAnimationFrame(() => {
                    if (progressFill) {
                        progressFill.style.width = `${progress}%`;
                        console.log('进度条宽度已更新:', progressFill.style.width);
                    }
                    if (progressText) {
                        progressText.textContent = `${progress}%`;
                        console.log('进度文本已更新:', progressText.textContent);
                    }
                });
            };
            
            // 更新状态：开始加载资源
            if (statusText) {
                const typeCounts = {
                    equipment: resourcesToLoad.filter(r => r.type === 'equipment').length,
                    alchemy: resourcesToLoad.filter(r => r.type === 'alchemy').length,
                    monster: resourcesToLoad.filter(r => r.type === 'monster').length,
                    player: resourcesToLoad.filter(r => r.type === 'player').length
                };
                statusText.textContent = `准备加载 ${totalImages} 个资源 (装备:${typeCounts.equipment} 材料:${typeCounts.alchemy} 怪物:${typeCounts.monster} 玩家:${typeCounts.player})...`;
                console.log('状态文本已更新:', statusText.textContent);
            }
            updateProgress();
            await new Promise(resolve => setTimeout(resolve, 300)); // 让UI更新，增加延迟时间
            
            // 批量加载资源（每次加载3个，避免阻塞，同时让进度更平滑）
            const batchSize = 3;
            for (let i = 0; i < resourcesToLoad.length; i += batchSize) {
                const batch = resourcesToLoad.slice(i, i + batchSize);
                
                // 更新当前批次的状态
                if (statusText && batch.length > 0) {
                    const typeName = batch[0].type === 'equipment' ? '装备' : 
                                   batch[0].type === 'alchemy' ? '炼金材料' : 
                                   batch[0].type === 'monster' ? '怪物' : '玩家';
                    statusText.textContent = `正在加载: ${batch[0].imageName}... (${i + 1}/${totalImages})`;
                }
                
                const batchPromises = batch.map((resource, index) => {
                    const typeName = resource.type === 'equipment' ? '装备' : 
                                   resource.type === 'alchemy' ? '炼金材料' : 
                                   resource.type === 'monster' ? '怪物' : '玩家';
                    console.log(`开始加载资源: ${typeName} ${resource.name} (${resource.imageName})`);
                    return resource.loadFn().catch(error => {
                        // 静默处理错误，继续加载其他资源
                        console.warn(`加载资源失败: ${resource.imageName}`, error);
                        return null;
                    }).then(() => {
                        // 每加载完一个资源就更新进度
                        loadedImages++;
                        console.log(`资源加载完成: ${typeName} ${resource.name}, 进度: ${loadedImages}/${totalImages}`);
                        updateProgress();
                        
                        // 更新状态文本
                        if (statusText && index < batch.length - 1) {
                            const nextTypeName = batch[index + 1].type === 'equipment' ? '装备' : 
                                               batch[index + 1].type === 'alchemy' ? '炼金材料' : 
                                               batch[index + 1].type === 'monster' ? '怪物' : '玩家';
                            statusText.textContent = `正在加载: ${batch[index + 1].imageName}... (${i + index + 2}/${totalImages})`;
                        }
                        
                        // 强制UI更新
                        return new Promise(resolve => {
                            requestAnimationFrame(() => {
                                setTimeout(resolve, 10);
                            });
                        });
                    });
                });
                
                console.log(`等待批次 ${Math.floor(i / batchSize) + 1} 加载完成...`);
                await Promise.all(batchPromises);
                console.log(`批次 ${Math.floor(i / batchSize) + 1} 加载完成`);
                
                // 短暂延迟，让UI更新
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            console.log('所有图片加载完成');
            
            // 确保进度是100%
            loadedImages = totalImages;
            updateProgress();
            
            // 更新状态：加载完成
            if (statusText) {
                statusText.textContent = '资源加载完成！';
            }
            
            // 等待一小段时间，让用户看到100%
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error('资源预加载出错:', error);
            statusText.textContent = '加载出错，但游戏将继续运行...';
        }
    }
    
    /**
     * 启动游戏（资源加载完成后调用）
     */
    startGame() {
        console.log('startGame 方法被调用');
        
        try {
            // 隐藏加载界面
            const loadingScreen = document.getElementById('loading-screen');
            const gameContainer = document.getElementById('game-container');
            
            console.log('加载界面元素:', loadingScreen);
            console.log('游戏容器元素:', gameContainer);
            
            // 立即显示游戏容器（但保持隐藏，直到用户点击启动界面）
            if (gameContainer) {
                gameContainer.style.display = 'block';
                gameContainer.style.visibility = 'hidden'; // 先隐藏，等用户点击后再显示
                console.log('游戏容器已准备（隐藏状态）');
            }
            
            // 隐藏加载界面（立即隐藏，不使用延迟）
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
                loadingScreen.style.visibility = 'hidden';
                loadingScreen.style.opacity = '0';
                loadingScreen.classList.add('hidden');
                console.log('加载界面已隐藏');
            }
            
            // 初始化游戏
            console.log('开始调用 init() 方法...');
            this.init();
            console.log('init() 方法调用完成');
        } catch (error) {
            console.error('startGame 方法出错:', error, error.stack);
            // 即使出错也尝试显示游戏容器和隐藏加载界面
            const gameContainer = document.getElementById('game-container');
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
                loadingScreen.style.visibility = 'hidden';
                loadingScreen.style.opacity = '0';
            }
            if (gameContainer) {
                gameContainer.style.display = 'block';
            }
            // 尝试初始化游戏
            try {
                this.init();
            } catch (initError) {
                console.error('init() 方法也出错:', initError, initError.stack);
            }
        }
    }
    
    /**
     * 显示启动界面，等待用户点击以解锁音频播放权限
     */
    showStartScreen() {
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            startScreen.style.display = 'flex';
            console.log('显示启动界面，等待用户点击...');
            
            // 添加点击事件监听器（只添加一次）
            const handleStartClick = async () => {
                console.log('用户点击启动界面，开始游戏...');
                
                // 禁用点击，防止重复触发
                startScreen.style.pointerEvents = 'none';
                
                // 解锁音频播放权限：尝试播放背景音乐
                try {
                    if (this.soundManager) {
                        // 初始化并播放背景音乐（这会解锁音频播放权限）
                        this.initBgm();
                        console.log('音频播放权限已解锁，背景音乐已开始播放');
                    }
                } catch (error) {
                    console.warn('解锁音频播放权限时出错:', error);
                }
                
                // 添加淡出动画类
                startScreen.classList.add('fade-out');
                const startContent = document.getElementById('start-content');
                if (startContent) {
                    startContent.classList.add('fade-out');
                }
                
                // 等待淡出动画完成后再隐藏界面和显示游戏
                setTimeout(() => {
                    // 隐藏启动界面
                    startScreen.style.display = 'none';
                    
                    // 显示游戏容器
                    const gameContainer = document.getElementById('game-container');
                    if (gameContainer) {
                        gameContainer.style.visibility = 'visible';
                    }
                    
                    // 开始游戏循环
                    console.log('开始游戏循环...');
                    const ticksPerSecond = CONFIG.TICKS_PER_SECOND || 60;
                    requestAnimationFrame(() => {
                        this.startGameLoop();
                        console.log(`游戏循环已启动（逻辑${ticksPerSecond}tps，渲染无上限）`);
                    });
                }, 500); // 等待0.5秒（与CSS过渡时间一致）
                
                // 移除事件监听器
                startScreen.removeEventListener('click', handleStartClick);
            };
            
            startScreen.addEventListener('click', handleStartClick);
        } else {
            console.warn('未找到启动界面元素，直接开始游戏循环');
            // 如果找不到启动界面，直接开始游戏循环
            const ticksPerSecond = CONFIG.TICKS_PER_SECOND || 60;
            requestAnimationFrame(() => {
                this.startGameLoop();
                console.log(`游戏循环已启动（逻辑${ticksPerSecond}tps，渲染无上限）`);
            });
        }
    }

    // ====================================================================
    // 初始化方法组
    // ====================================================================

    /**
     * 初始化游戏
     * 设置事件监听器、初始化UI等
     */
    init() {
        console.log('init() 方法开始执行');
        
        try {
            // 初始化背包UI
            console.log('初始化背包UI...');
            this.initInventory();
            console.log('背包UI初始化完成');
        
        // 设置按钮点击事件
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showEscMenu();
            });
        }
        
        // 事件监听
        document.addEventListener('keydown', (e) => {
            // F1键处理：开发者模式（在任何情况下都可以切换）
            if (e.key === 'F1') {
                e.preventDefault();
                this.toggleDevMode();
                return;
            }
            
            // Q键：非落点技立即释放；落点技按下开始蓄力瞄准（松开后短按仍瞬发）
            if (e.key.toLowerCase() === 'q' && !e.repeat && !this.player.isDashing) {
                this._onWeaponSkillInputDown('q');
            }
            
            // ESC键处理：关闭打开的界面或显示菜单
            if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                
                if (this.weaponSkillAim) {
                    this.cancelWeaponSkillAim();
                    return;
                }
                
                const escMenuModal = document.getElementById('esc-menu-modal');
                const towerExitConfirmModal = document.getElementById('tower-exit-confirm-modal');
                const shopModal = document.getElementById('shop-modal');
                const blacksmithModal = document.getElementById('blacksmith-modal');
                const inventoryModal = document.getElementById('inventory-modal');
                const codexModal = document.getElementById('codex-modal');
                const guideModal = document.getElementById('guide-modal');
                const trainingGroundModal = document.getElementById('training-ground-modal');
                const dummySpawnModal = document.getElementById('dummy-spawn-modal');
                const saveCodeModal = document.getElementById('save-code-modal');
                const importSaveModal = document.getElementById('import-save-modal');
                // 优先关闭确认对话框
                if (towerExitConfirmModal && towerExitConfirmModal.classList.contains('show')) {
                    this.cancelExitTower();
                    return;
                }
                // 如果ESC菜单打开，关闭它
                if (escMenuModal && escMenuModal.classList.contains('show')) {
                    this.closeEscMenu();
                    return;
                }
                
                // 关闭其他模态框（先关闭其他界面，再按ESC才打开菜单）
                if (dummySpawnModal && dummySpawnModal.classList.contains('show')) {
                    this.closeDummySpawnPanel();
                    return;
                }
                if (saveCodeModal && saveCodeModal.classList.contains('show')) {
                    this.closeSaveCodeModal();
                    return;
                }
                if (importSaveModal && importSaveModal.classList.contains('show')) {
                    this.closeImportSaveModal();
                    return;
                }
                const gapShopModal = document.getElementById('gap-shop-modal');
                if (gapShopModal && gapShopModal.classList.contains('show')) {
                    this.closeGapShopModal();
                    return;
                }
                if (shopModal && shopModal.classList.contains('show')) {
                    this.closeShop();
                    return;
                }
                if (blacksmithModal && blacksmithModal.classList.contains('show')) {
                    this.closeBlacksmith();
                    return;
                }
                if (inventoryModal && inventoryModal.classList.contains('show')) {
                    this.toggleInventory();
                    return;
                }
                if (codexModal && codexModal.classList.contains('show')) {
                    this.toggleCodex();
                    return;
                }
                if (guideModal && guideModal.classList.contains('show')) {
                    this.toggleGuide();
                    return;
                }
                if (trainingGroundModal && trainingGroundModal.classList.contains('show')) {
                    this.closeTrainingGround();
                    return;
                }
                
                // 如果在训练场场景且没有其他模态框打开，直接返回主城
                if (this.currentScene === SCENE_TYPES.TRAINING) {
                    this.returnToTown();
                    return;
                }
                
                // 如果没有其他模态框打开，显示ESC菜单
                this.showEscMenu();
            }
            
            // 如果ESC菜单打开，禁用其他按键（除了F1开发者模式）
            const escMenuModal = document.getElementById('esc-menu-modal');
            if (escMenuModal && escMenuModal.classList.contains('show')) {
                // 只允许F1键和ESC键
                if (e.key !== 'F1' && e.key !== 'Escape' && e.key !== 'Esc') {
                    e.preventDefault();
                    return;
                }
            }
            
            // 如果游戏暂停，只允许关闭界面
            if (this.paused) {
                if (e.key.toLowerCase() === 'b') {
                    const modal = document.getElementById('inventory-modal');
                    if (modal.classList.contains('show')) {
                        this.toggleInventory();
                    }
                }
                if (e.key.toLowerCase() === 'h') {
                    const codexModal = document.getElementById('codex-modal');
                    if (codexModal.classList.contains('show')) {
                        this.toggleCodex();
                    }
                }
                if (e.key.toLowerCase() === 'g') {
                    const guideModal = document.getElementById('guide-modal');
                    if (guideModal.classList.contains('show')) {
                        this.toggleGuide();
                    }
                }
                return; // 暂停时不处理其他按键
            }
            
            // 处理k键（冲刺键）
            if (e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.keys['k'] = true;
            } else {
                this.keys[e.key.toLowerCase()] = true;
            }
            
            if (e.key.toLowerCase() === 'b') {
                this.toggleInventory();
            }
            
            // 图鉴快捷键：H
            if (e.key.toLowerCase() === 'h') {
                this.toggleCodex();
            }
            
            // 游戏指导快捷键：G
            if (e.key.toLowerCase() === 'g') {
                this.toggleGuide();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === 'q') {
                this._onWeaponSkillInputUp('q');
            }
            // 处理k键（冲刺键）
            if (e.key.toLowerCase() === 'k') {
                this.keys['k'] = false;
            } else {
                this.keys[e.key.toLowerCase()] = false;
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            this.updateMouseFromEvent(e);
        });
        
        this.canvas.addEventListener('contextmenu', (e) => {
            if (this.currentScene === SCENE_TYPES.TOWER || this.currentScene === SCENE_TYPES.TRAINING) {
                e.preventDefault();
            }
        });
        
        // 鼠标左键攻击；右键与 Q 相同：落点技/锁定技均为长按瞄准、松手释放
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.updateMouseFromEvent(e);
                this.mouse.left = true;
            } else if (e.button === 2) {
                e.preventDefault();
                this.updateMouseFromEvent(e);
                this._onWeaponSkillInputDown('rmb');
            }
        });
        
        // 鼠标左键释放
        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) { // 左键
                this.mouse.left = false;
            }
        });
        
        // 鼠标离开canvas时释放左键
        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.left = false;
        });
        
        document.getElementById('close-inventory').addEventListener('click', () => {
            this.toggleInventory();
        });
        
        document.getElementById('close-codex').addEventListener('click', () => {
            this.toggleCodex();
        });
        
        // 游戏指导关闭按钮事件（游戏指导按钮已移至ESC菜单）
        const closeGuideBtn = document.getElementById('close-guide');
        if (closeGuideBtn) {
            closeGuideBtn.addEventListener('click', () => {
                this.toggleGuide();
            });
        }
        
        // 图鉴标签切换
        document.querySelectorAll('.codex-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                
                // 立即切换标签样式和内容显示，提供即时反馈
                document.querySelectorAll('.codex-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.codex-section').forEach(s => s.classList.remove('active'));
                const targetSection = document.getElementById(`codex-${targetTab}`);
                if (targetSection) {
                    targetSection.classList.add('active');
                }
                
                // 使用 requestAnimationFrame 异步更新内容，避免阻塞UI
                requestAnimationFrame(() => {
                    if (targetTab === 'monsters') {
                        this.updateCodexMonsters();
                    } else if (targetTab === 'equipments') {
                        this.updateCodexEquipments();
                    } else if (targetTab === 'set_mechanics') {
                        this.updateCodexSetMechanics();
                    } else if (targetTab === 'potions') {
                        this.updateCodexPotions();
                    }
                });
            });
        });
        
        // 装备图鉴筛选器事件监听（添加防抖，避免频繁更新导致卡顿）
        const filterLevel = document.getElementById('filter-level');
        const filterSlot = document.getElementById('filter-slot');
        const filterQuality = document.getElementById('filter-quality');
        const filterSet = document.getElementById('filter-set');
        const resetFilters = document.getElementById('reset-filters');
        
        // 防抖函数
        let codexUpdateTimeout = null;
        const debouncedUpdateCodex = () => {
            if (codexUpdateTimeout) {
                clearTimeout(codexUpdateTimeout);
            }
            codexUpdateTimeout = setTimeout(() => {
                this.updateCodexEquipments();
            }, 150); // 150ms防抖延迟
        };
        
        if (filterLevel) {
            filterLevel.addEventListener('change', debouncedUpdateCodex);
        }
        if (filterSlot) {
            filterSlot.addEventListener('change', debouncedUpdateCodex);
        }
        if (filterQuality) {
            filterQuality.addEventListener('change', debouncedUpdateCodex);
        }
        if (filterSet) {
            filterSet.addEventListener('change', debouncedUpdateCodex);
        }
        if (resetFilters) {
            resetFilters.addEventListener('click', () => {
                filterLevel.value = 'all';
                filterSlot.value = 'all';
                filterQuality.value = 'all';
                filterSet.value = 'all';
                this.updateCodexEquipments();
            });
        }
        
        const filterMonsterLevel = document.getElementById('filter-monster-level');
        const resetMonsterFilters = document.getElementById('reset-monster-filters');
        let codexMonsterUpdateTimeout = null;
        const debouncedUpdateCodexMonsters = () => {
            if (codexMonsterUpdateTimeout) {
                clearTimeout(codexMonsterUpdateTimeout);
            }
            codexMonsterUpdateTimeout = setTimeout(() => {
                this.updateCodexMonsters();
            }, 150);
        };
        if (filterMonsterLevel) {
            filterMonsterLevel.addEventListener('change', debouncedUpdateCodexMonsters);
        }
        if (resetMonsterFilters) {
            resetMonsterFilters.addEventListener('click', () => {
                if (filterMonsterLevel) filterMonsterLevel.value = 'all';
                this.updateCodexMonsters();
            });
        }
        
        // 初始化铁匠铺和商店界面
        this.initBlacksmith();
        this.initShop();
        this.initGapShop();
        this.initTrainingAndCapacity();
        this.initLevelUpCapacity();
        this.initDungeonSelection();
        
        // 初始化武器技能按钮
        this.initWeaponSkillButton();
        
        // 初始化存档功能
        this.initSaveSystem();
        
        // 游戏从主城开始，不生成房间
        // this.generateNewRoom();
        
        // 确保玩家属性基于最新配置更新（包括速度）
        this.player.updateStats();
        
        // 更新HUD显示主城信息
        this.updateHUD();
        document.getElementById('room-type').textContent = '主城';
        document.getElementById('floor-number').textContent = '准备中';
        
        // 检查是否首次游戏
        this.checkFirstTimeGuide();
        
        // 初始化背景音乐系统（但不播放，等待用户点击）
        // 注意：这里只初始化，不播放，因为需要用户交互才能播放音频
        if (this.soundManager) {
            // 预加载背景音乐，但不播放
            console.log('预加载背景音乐...');
            this.soundManager.loadBgm('town').catch(err => {
                console.warn('预加载town背景音乐失败:', err);
            });
            this.soundManager.loadBgm('battle').catch(err => {
                console.warn('预加载battle背景音乐失败:', err);
            });
        }
        
        // 显示启动界面，等待用户点击以解锁音频播放权限
        this.showStartScreen();
        } catch (error) {
            console.error('init() 方法执行出错:', error, error.stack);
            // 即使出错也尝试启动游戏循环
            try {
                this.startGameLoop();
            } catch (loopError) {
                console.error('启动游戏循环也失败:', loopError);
            }
            throw error; // 重新抛出错误，让调用者处理
        }
    }

    /**
     * 检查并显示首次游戏提示
     */
    checkFirstTimeGuide() {
        const hasPlayed = localStorage.getItem('pixelEternal_hasPlayed');
        if (!hasPlayed) {
            // 首次游戏，显示提示
            setTimeout(() => {
                this.showFirstTimeGuide = true;
                const guideModal = document.getElementById('first-time-guide-modal');
                if (guideModal) {
                    guideModal.classList.add('show');
                    this.paused = true;
                }
            }, 500); // 延迟500ms显示，让游戏先加载完成
        }
    }

    /**
     * 关闭首次游戏提示
     */
    closeFirstTimeGuide() {
        this.showFirstTimeGuide = false;
        const guideModal = document.getElementById('first-time-guide-modal');
        if (guideModal) {
            guideModal.classList.remove('show');
        }
        localStorage.setItem('pixelEternal_hasPlayed', 'true');
        this.paused = false;
    }

    /**
     * 显示死亡惩罚窗口
     * @param {Array} itemsToRemove - 要删除的物品列表
     * @param {number} goldLost - 失去的金币数量
     */
    showDeathPenaltyWindow(itemsToRemove, goldLost = 0) {
        const modal = document.getElementById('death-penalty-modal');
        const itemsList = document.getElementById('death-penalty-items-list');
        const countElement = document.getElementById('death-penalty-count');
        const goldElement = document.getElementById('death-penalty-gold');
        
        if (!modal || !itemsList || !countElement) return;
        
        // 清空列表
        itemsList.innerHTML = '';
        
        // 更新数量
        countElement.textContent = itemsToRemove.length;
        
        // 更新金币显示
        if (goldElement) {
            goldElement.textContent = goldLost;
            // 如果有金币损失，显示金币信息
            const goldInfo = document.getElementById('death-penalty-gold-info');
            if (goldInfo) {
                goldInfo.style.display = goldLost > 0 ? 'block' : 'none';
            }
        }
        
        // 生成物品列表
        itemsToRemove.forEach(({ item, location, slot }) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'death-penalty-item';
            
            // 如果是装备中的物品，添加特殊样式
            if (location === 'equipped') {
                itemDiv.classList.add('equipped');
            }
            
            // 物品图标（使用通用函数，边框由函数统一处理）
            const iconDiv = this.createItemIcon(item, {
                className: 'death-penalty-item-icon'
            });
            
            // 物品信息
            const infoDiv = document.createElement('div');
            infoDiv.className = 'death-penalty-item-info';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'death-penalty-item-name';
            const qualityColor = QUALITY_COLORS[item.quality] || '#ffffff';
            nameDiv.style.color = qualityColor;
            nameDiv.textContent = item.name;
            
            // 如果是装备中的物品，添加"已装备"标签
            if (location === 'equipped') {
                const badge = document.createElement('span');
                badge.className = 'death-penalty-item-badge';
                badge.textContent = '已装备';
                nameDiv.appendChild(badge);
            }
            
            const typeDiv = document.createElement('div');
            typeDiv.className = 'death-penalty-item-type';
            
            // 根据物品类型显示信息
            if (item.type === 'equipment') {
                const slotNames = {
                    weapon: '武器',
                    helmet: '头盔',
                    chest: '胸甲',
                    legs: '腿甲',
                    boots: '足具',
                    necklace: '项链',
                    ring: '指环',
                    belt: '腰带'
                };
                typeDiv.textContent = `${slotNames[item.slot] || item.slot} | ${QUALITY_NAMES[item.quality] || item.quality}`;
            } else if (item.type === 'consumable' || item.type === 'potion') {
                typeDiv.textContent = `药水 | ${QUALITY_NAMES[item.quality] || item.quality}`;
            } else if (item.type === 'material' || item.type === 'alchemy') {
                typeDiv.textContent = `炼金材料 | ${QUALITY_NAMES[item.quality] || item.quality}`;
            } else {
                typeDiv.textContent = `${item.type || '物品'} | ${QUALITY_NAMES[item.quality] || item.quality}`;
            }
            
            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(typeDiv);
            
            itemDiv.appendChild(iconDiv);
            itemDiv.appendChild(infoDiv);
            
            itemsList.appendChild(itemDiv);
        });
        
        // 显示窗口并暂停游戏
        modal.classList.add('show');
        this.paused = true;
        
        // 绑定关闭按钮事件（如果还没有绑定）
        const closeBtn = document.getElementById('close-death-penalty');
        if (closeBtn && !closeBtn.dataset.bound) {
            closeBtn.dataset.bound = 'true';
            closeBtn.addEventListener('click', () => {
                this.closeDeathPenaltyWindow();
            });
        }
    }

    /**
     * 关闭死亡惩罚窗口
     */
    closeDeathPenaltyWindow() {
        const modal = document.getElementById('death-penalty-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        // 重置死亡标志（确保在所有情况下都重置）
        this.isPlayerDead = false;
        
        // 如果当前在恶魔塔场景，需要切换到主城
        if (this.currentScene === SCENE_TYPES.TOWER) {
            // 清理游戏状态
            this.isTransitioning = false;
            if (this.roomTransitionTimer) {
                clearTimeout(this.roomTransitionTimer);
                this.roomTransitionTimer = null;
            }
            this.paused = false;
            
            // 关闭所有打开的界面
            const shopModal = document.getElementById('shop-modal');
            const blacksmithModal = document.getElementById('blacksmith-modal');
            const inventoryModal = document.getElementById('inventory-modal');
            const codexModal = document.getElementById('codex-modal');
            const trainingGroundModal = document.getElementById('training-ground-modal');
            
            if (shopModal) shopModal.classList.remove('show');
            if (blacksmithModal) blacksmithModal.classList.remove('show');
            if (inventoryModal) inventoryModal.classList.remove('show');
            if (codexModal) codexModal.classList.remove('show');
            if (trainingGroundModal) trainingGroundModal.classList.remove('show');
            
            // 调用统一的场景切换函数（会清空精英加护与恶魔干扰，并重算属性）
            this.transitionScene(SCENE_TYPES.TOWN);
            this.player.hp = this.player.maxHp;
            this.currentRoom = null;
            
            // 清空掉落物和传送门（返回主城时清理）
            this.droppedItems = [];
            this.portals = [];
            
            // 确保主城场景已初始化
            if (!this.townScene) {
                this.townScene = new TownScene(this);
            }
            
            // 重置玩家位置到主城中心
            this.player.x = CONFIG.CANVAS_WIDTH / 2;
            this.player.y = CONFIG.CANVAS_HEIGHT / 2;
            // 更新相机位置
            this.cameraX = this.player.x - CONFIG.CANVAS_WIDTH / 2;
            this.cameraY = this.player.y - CONFIG.CANVAS_HEIGHT / 2;
            
            // 显示提示
            this.addFloatingText(this.player.x, this.player.y, '返回主城', '#ff0000');
            
            // 更新HUD和房间信息显示
            this.updateHUD();
            document.getElementById('room-type').textContent = '主城';
            document.getElementById('floor-number').textContent = `上次到达: ${this.lastDeathFloor}层`;
        } else {
            // 如果不在恶魔塔场景，也需要恢复生命值
            this.player.hp = this.player.maxHp;
            this.updateHUD();
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
    }

    /**
     * 初始化背包界面
     */
    initInventory() {
        // 初始化当前选中的页签
        this.currentInventoryTab = 'equipment';
        
        // 创建统一的物品格子容器（48个格子）
        const inventoryItems = document.getElementById('inventory-items');
        inventoryItems.innerHTML = '';
        
        for (let i = 0; i < CONFIG.INVENTORY_SIZE; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
            slot.dataset.index = i;
            slot.addEventListener('mouseenter', (e) => {
                this.showItemTooltip(e.currentTarget, e.clientX, e.clientY);
            });
            slot.addEventListener('mouseleave', () => {
                this.tooltipManager.hideItemTooltip();
            });
            slot.addEventListener('click', (e) => {
                const index = parseInt((e.currentTarget && e.currentTarget.dataset.index) || e.target.dataset.index);
                if (!isNaN(index)) {
                    this.handleInventorySlotClick(index);
                }
            });
            inventoryItems.appendChild(slot);
        }
        
        // 页签切换事件
        document.querySelectorAll('.inventory-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabType = tab.dataset.tab;
                this.switchInventoryTab(tabType);
            });
        });
        
        // 装备栏事件
        document.querySelectorAll('.equipment-item').forEach(slot => {
            slot.addEventListener('mouseenter', (e) => {
                this.showItemTooltip(e.currentTarget, e.clientX, e.clientY);
            });
            slot.addEventListener('mouseleave', () => {
                this.tooltipManager.hideItemTooltip();
            });
            slot.addEventListener('click', () => {
                this.handleEquipmentSlotClick(slot.dataset.slot);
            });
        });
        
        // 初始化装备栏品质边框
        this.updateEquipmentSlotBorders();
    }

    switchInventoryTab(tabType) {
        this.currentInventoryTab = tabType;
        
        // 更新页签样式
        document.querySelectorAll('.inventory-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabType}"]`).classList.add('active');
        
        // 清除所有格子的背景图片，防止贴图停留
        const allSlots = document.querySelectorAll('#inventory-items .inventory-slot');
        allSlots.forEach(slot => {
            slot.style.backgroundImage = '';
        });
        
        // 更新显示
        this.updateInventoryUI();
        this.updateInventoryCapacity();
    }
    
    /**
     * 更新背包容量显示
     */
    updateInventoryCapacity() {
        // 计算各栏的容量
        // 装备：0-17区域中类型为equipment或没有type属性的物品（兼容旧数据）
        const equipmentCount = this.player.inventory.slice(0, this.player.maxEquipmentCapacity || 18).filter(item => 
            item !== null && item !== undefined && (item.type === 'equipment' || (!item.type && item.slot))
        ).length;
        // 材料：18-47区域中的材料（包括alchemy和material类型，兼容旧数据）
        const materialCount = this.player.inventory.slice(18, 18 + (this.player.maxAlchemyCapacity || 30)).filter(item => 
            item !== null && item !== undefined && (item.type === 'material' || item.type === 'alchemy')
        ).length;
        // 消耗品：48-65区域中的消耗品（包括potion和consumable类型）
        const consumableStartIndex = 48;
        const consumableCount = this.player.inventory.slice(consumableStartIndex, consumableStartIndex + (this.player.maxPotionCapacity || 18)).filter(item => 
            item !== null && item !== undefined && (item.type === 'consumable' || item.type === 'potion')
        ).length;
        
        // 获取各栏的最大容量（需要从玩家属性中获取，如果没有则使用默认值）
        const maxEquipment = this.player.maxEquipmentCapacity || 18;
        const maxMaterial = this.player.maxAlchemyCapacity || 30;
        const maxConsumable = this.player.maxPotionCapacity || 18;
        
        // 更新显示
        const equipmentCap = document.getElementById('equipment-capacity');
        const materialCap = document.getElementById('material-capacity');
        const consumableCap = document.getElementById('consumable-capacity');
        
        if (equipmentCap) equipmentCap.textContent = `装备: ${equipmentCount}/${maxEquipment}`;
        if (materialCap) materialCap.textContent = `材料: ${materialCount}/${maxMaterial}`;
        if (consumableCap) consumableCap.textContent = `消耗品: ${consumableCount}/${maxConsumable}`;
    }

    // ====================================================================
    // UI界面管理方法组
    // ====================================================================

    /**
     * 切换背包界面显示/隐藏
     */
    toggleInventory() {
        const modal = document.getElementById('inventory-modal');
        modal.classList.toggle('show');
        if (modal.classList.contains('show')) {
            this.paused = true; // 暂停游戏
            this.updateInventoryUI();
        } else {
            // 如果开发者模式和图鉴也没有打开，才恢复游戏
            const codexModal = document.getElementById('codex-modal');
            if (!this.devMode && !codexModal.classList.contains('show')) {
                this.paused = false; // 恢复游戏
            }
        }
    }

    /**
     * 切换图鉴界面显示/隐藏
     */
    toggleCodex() {
        const modal = document.getElementById('codex-modal');
        const codexDevPanel = document.getElementById('dev-codex-panel');
        
        if (modal.classList.contains('show')) {
            modal.classList.remove('show');
            // 如果开发者模式在图鉴中打开，也要关闭
            if (codexDevPanel && codexDevPanel.classList.contains('show')) {
                codexDevPanel.classList.remove('show');
                this.devMode = false;
            }
            // 如果开发者模式和背包也没有打开，才恢复游戏
            const inventoryModal = document.getElementById('inventory-modal');
            const guideModal = document.getElementById('guide-modal');
            const normalDevPanel = document.getElementById('dev-panel');
            if (!normalDevPanel.classList.contains('show') && !inventoryModal.classList.contains('show') && !guideModal.classList.contains('show')) {
                this.paused = false; // 恢复游戏
            }
        } else {
            modal.classList.add('show');
            this.paused = true; // 暂停游戏
            
            // 先显示界面，然后异步加载内容，避免卡顿
            // 默认显示怪物标签（立即更新，因为内容简单）
            this.updateCodexMonsters();
            
            // 其他标签页的内容延迟加载，只在切换到对应标签时才加载
            // 这样可以避免打开图鉴时的卡顿
            // 装备、药水、炼金材料列表会在用户点击对应标签时再加载
            
            // 如果开发者模式已经打开，切换到图鉴开发者面板
            if (this.devMode) {
                const normalPanel = document.getElementById('dev-panel');
                normalPanel.classList.remove('show');
                codexDevPanel.classList.add('show');
                this.updateDevCodexPanel();
            }
        }
    }

    /**
     * 切换游戏指导界面显示/隐藏
     */
    toggleGuide() {
        const modal = document.getElementById('guide-modal');
        modal.classList.toggle('show');
        if (modal.classList.contains('show')) {
            this.paused = true; // 暂停游戏
        } else {
            // 如果其他界面也没有打开，才恢复游戏
            const inventoryModal = document.getElementById('inventory-modal');
            const codexModal = document.getElementById('codex-modal');
            const shopModal = document.getElementById('shop-modal');
            const blacksmithModal = document.getElementById('blacksmith-modal');
            if (!this.devMode && !inventoryModal.classList.contains('show') && 
                !codexModal.classList.contains('show') && !shopModal.classList.contains('show') && 
                !blacksmithModal.classList.contains('show')) {
                this.paused = false; // 恢复游戏
            }
        }
    }

    /**
     * 更新图鉴中的怪物列表
     */
    updateCodexMonsters() {
        const container = document.getElementById('monsters-list');
        container.innerHTML = '';
        
        const filterLevel = document.getElementById('filter-monster-level')?.value || 'all';
        let monsterTypes = Object.keys(MONSTER_TYPES);
        if (filterLevel !== 'all') {
            const lv = parseInt(filterLevel, 10);
            monsterTypes = monsterTypes.filter(t => (MONSTER_TYPES[t].level || 1) === lv);
        }
        monsterTypes.sort((a, b) => {
            const la = MONSTER_TYPES[a].level || 1;
            const lb = MONSTER_TYPES[b].level || 1;
            if (la !== lb) return la - lb;
            const na = MONSTER_TYPES[a].name || a;
            const nb = MONSTER_TYPES[b].name || b;
            return String(na).localeCompare(String(nb), 'zh');
        });
        
        if (monsterTypes.length === 0) {
            const noResult = document.createElement('div');
            noResult.style.textAlign = 'center';
            noResult.style.padding = '40px';
            noResult.style.color = '#aaa';
            noResult.innerHTML = '<p>没有找到符合条件的怪物</p><p style="font-size: 12px; margin-top: 10px;">请尝试调整筛选条件</p>';
            container.appendChild(noResult);
            return;
        }
        
        monsterTypes.forEach(monsterType => {
            const monster = MONSTER_TYPES[monsterType];
            const entry = document.createElement('div');
            entry.className = 'monster-entry';
            entry.style.background = 'rgba(50, 50, 60, 0.8)';
            entry.style.border = `2px solid ${monster.color}`;
            entry.style.borderRadius = '5px';
            entry.style.padding = '15px';
            entry.style.marginBottom = '15px';
            
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.marginBottom = '10px';
            
            const visual = document.createElement('div');
            visual.className = 'monster-visual';
            visual.style.width = '60px';
            visual.style.height = '60px';
            visual.style.borderRadius = '5px';
            visual.style.marginRight = '15px';
            visual.style.flexShrink = '0';
            visual.style.display = 'flex';
            visual.style.alignItems = 'center';
            visual.style.justifyContent = 'center';
            visual.style.overflow = 'hidden';
            visual.style.backgroundColor = monster.color; // 回退背景色
            
            // 尝试加载怪物贴图
            const assetManager = this.assetManager;
            const img = document.createElement('img');
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            img.style.display = 'block';
            img.alt = monster.name;
            
            if (assetManager) {
                const monsterConfig = assetManager.getMonsterImageConfig(monsterType);
                
                if (monsterConfig && monsterConfig.image) {
                    // 检查缓存（优先使用预加载的缓存）
                    const cachedImg = assetManager.monsterImageCache.get(monsterConfig.image);
                    if (cachedImg) {
                        // 如果缓存的是Image对象，使用src；如果是字符串，直接使用
                        if (cachedImg instanceof Image) {
                            img.src = cachedImg.src;
                        } else if (cachedImg) {
                            img.src = cachedImg;
                        } else {
                            // 缓存为null（加载失败），隐藏img，使用回退背景色
                            img.style.display = 'none';
                            visual.style.backgroundColor = monster.color;
                        }
                    } else {
                        // 缓存不存在，使用loadMonsterImage异步加载（会检查缓存并缓存结果）
                        assetManager.loadMonsterImage(monsterConfig.image).then(loadedImg => {
                            if (loadedImg && loadedImg instanceof Image) {
                                img.src = loadedImg.src;
                            } else {
                                // 加载失败，隐藏img，使用回退背景色
                                img.style.display = 'none';
                                visual.style.backgroundColor = monster.color;
                            }
                        }).catch(() => {
                            // 加载失败，隐藏img，使用回退背景色
                            img.style.display = 'none';
                            visual.style.backgroundColor = monster.color;
                        });
                    }
                } else {
                    // 没有配置贴图，隐藏img，使用纯色背景
                    img.style.display = 'none';
                    visual.style.backgroundColor = monster.color;
                }
            } else {
                // 没有 assetManager，隐藏img，使用纯色背景
                img.style.display = 'none';
                visual.style.backgroundColor = monster.color;
            }
            
            // 总是添加img元素到visual中
            visual.appendChild(img);
            
            const name = document.createElement('h3');
            name.style.color = monster.color;
            name.style.fontSize = '20px';
            name.style.margin = '0';
            name.textContent = monster.name + (monster.isElite ? ' [精英]' : '');
            
            header.appendChild(visual);
            header.appendChild(name);
            
            const stats = document.createElement('div');
            stats.className = 'monster-stats';
            let statsHTML = '';
            
            if (monster.isElite) {
                statsHTML += `<p style="color: #ffd700; margin-bottom: 8px;"><strong>出现于恶魔塔精英房间</strong></p>`;
            }
            if (monster.description) {
                statsHTML += `<p style="color: #aaa; font-style: italic; margin-bottom: 10px;">${monster.description}</p>`;
            }
            if (typeof buildMonsterCodexMechanicsHtml === 'function') {
                statsHTML += buildMonsterCodexMechanicsHtml(monsterType);
            }
            
            statsHTML += `<p><strong>等级:</strong> ${monster.level}</p>`;
            statsHTML += `<p><strong>生命值:</strong> ${monster.hp}</p>`;
            statsHTML += `<p><strong>攻击力:</strong> ${monster.damage}</p>`;
            statsHTML += `<p>---</p>`;
            statsHTML += `<p><strong>经验奖励:</strong> ${monster.expReward}</p>`;
            statsHTML += `<p><strong>金币奖励:</strong> ${monster.goldReward}</p>`;
            
            if (monster.dropInfo) {
                statsHTML += `<p style="color: #ffd700; margin-top: 10px;"><strong>掉落:</strong> ${monster.dropInfo}</p>`;
            }
            
            statsHTML += `<p style="color: #aaa; font-size: 12px; margin-top: 10px;">击杀怪物有30%概率掉落装备</p>`;
            
            stats.innerHTML = statsHTML;
            
            entry.appendChild(header);
            entry.appendChild(stats);
            container.appendChild(entry);
        });
    }

    async updateCodexEquipments() {
        const container = document.getElementById('equipments-list');
        if (!container) return;
        
        // 先显示加载提示，使用 requestAnimationFrame 确保UI响应
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #aaa;">加载中...</div>';
        
        // 使用 requestAnimationFrame 异步处理，避免阻塞UI
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve); // 双重RAF确保DOM更新完成
            });
        });
        
        // 获取筛选条件
        const filterLevel = document.getElementById('filter-level')?.value || 'all';
        const filterSlot = document.getElementById('filter-slot')?.value || 'all';
        const filterQuality = document.getElementById('filter-quality')?.value || 'all';
        const filterSet = document.getElementById('filter-set')?.value || 'all';
        // 使用缓存的装备列表，避免重复生成
        if (!this.cachedAllEquipments) {
            this.cachedAllEquipments = generateEquipments();
        }
        let allEquipments = this.cachedAllEquipments;
        
        // 缓存套装效果计算结果，避免在循环中重复计算
        const cachedActiveSetEffects = typeof getActiveSetEffects === 'function' 
            ? getActiveSetEffects(this.player.equipment) 
            : [];
        const cachedActiveSet = new Set(cachedActiveSetEffects.map(e => e.setId + '-' + e.pieceCount));
        
        // 应用筛选条件
        let filteredEquipments = allEquipments.filter(eq => {
            // 等级筛选
            if (filterLevel !== 'all' && eq.level !== parseInt(filterLevel)) {
                return false;
            }
            // 部位筛选
            if (filterSlot !== 'all' && eq.slot !== filterSlot) {
                return false;
            }
            // 品质筛选
            if (filterQuality !== 'all' && eq.quality !== filterQuality) {
                return false;
            }
            // 套装筛选
            if (filterSet !== 'all') {
                if (filterSet === 'none') {
                    // 筛选无套装的装备
                    const setId = getSetForEquipment(eq.name);
                    if (setId !== null) {
                        return false;
                    }
                } else if (filterSet === 'deep') {
                    const setId = getSetForEquipment(eq.name);
                    if (!setId || !String(setId).startsWith('deep_')) {
                        return false;
                    }
                } else {
                    // 筛选特定套装的装备
                    const setId = getSetForEquipment(eq.name);
                    if (setId !== filterSet) {
                        return false;
                    }
                }
            }
            return true;
        });
        
        // 如果没有符合条件的装备，显示提示
        if (filteredEquipments.length === 0) {
            const noResult = document.createElement('div');
            noResult.style.textAlign = 'center';
            noResult.style.padding = '40px';
            noResult.style.color = '#aaa';
            noResult.innerHTML = '<p>没有找到符合条件的装备</p><p style="font-size: 12px; margin-top: 10px;">请尝试调整筛选条件</p>';
            container.appendChild(noResult);
            return;
        }
        
        // 对所有装备进行排序：先按部位，再按等级，最后按品质
        filteredEquipments.sort((a, b) => {
            // 先按部位排序
            const slotOrder = { weapon: 1, helmet: 2, chest: 3, legs: 4, boots: 5, necklace: 6, ring: 7, belt: 8 };
            if (slotOrder[a.slot] !== slotOrder[b.slot]) {
                return slotOrder[a.slot] - slotOrder[b.slot];
            }
            // 部位相同则按等级排序
            if (a.level !== b.level) {
                return a.level - b.level;
            }
            // 等级相同则按品质排序
            const qualityOrder = { common: 1, rare: 2, fine: 3, epic: 4, legendary: 5 };
            return qualityOrder[a.quality] - qualityOrder[b.quality];
        });
        
        // 清除加载提示
        container.innerHTML = '';
        
        // 使用文档片段批量添加DOM元素，提高性能
        const fragment = document.createDocumentFragment();
        
        // 批量收集需要加载的图片
        const uncachedImages = [];
        const imageNameMap = new Map(); // 装备 id -> 图片名
        
        // 直接显示所有装备，不按部位分组
        filteredEquipments.forEach(eq => {
                const entry = document.createElement('div');
                entry.className = 'equipment-entry';
                entry.style.background = 'rgba(50, 50, 60, 0.8)';
                entry.style.border = `2px solid ${QUALITY_COLORS[eq.quality] || '#555'}`;
                entry.style.borderRadius = '5px';
                entry.style.padding = '15px';
                entry.style.marginBottom = '10px';
                
                const headerDiv = document.createElement('div');
                headerDiv.style.display = 'flex';
                headerDiv.style.alignItems = 'center';
                headerDiv.style.marginBottom = '10px';
                
                // 使用通用函数创建装备图标（边框由函数统一处理）
                const visual = this.createItemIcon(eq, {
                    size: 40,
                    className: 'equipment-visual',
                    style: { marginRight: '15px' }
                });
                visual.dataset.equipmentId = String(eq.id);
                
                // 收集图片信息，稍后批量处理（传递品质信息）
                const imageName = this.assetManager.getEquipmentImageName(eq.name, eq);
                imageNameMap.set(String(eq.id), imageName);
                if (imageName && !this.assetManager.equipmentImageCache.has(imageName)) {
                    uncachedImages.push(imageName);
                }
                
                const name = document.createElement('h3');
                name.style.color = QUALITY_COLORS[eq.quality] || '#fff';
                name.style.fontSize = '18px';
                name.style.margin = '0';
                name.textContent = eq.name;
                headerDiv.appendChild(visual);
                headerDiv.appendChild(name);
                
                const stats = document.createElement('div');
                stats.className = 'equipment-stats';
                let statsHTML = `<p><strong>品质:</strong> <span style="color: ${QUALITY_COLORS[eq.quality]}">${QUALITY_NAMES[eq.quality]}</span></p>`;
                statsHTML += `<p style="color: #ffaa00;"><strong>需要等级:</strong> ${eq.level}</p>`;
                statsHTML += `<p>---</p>`;
                statsHTML += `<p><strong>属性:</strong></p>`;
                
                let hasStats = false;
                for (const [key, value] of Object.entries(eq.stats)) {
                    if (value !== 0) {
                        hasStats = true;
                        const statNames = {
                            attack: '攻击力',
                            critRate: '暴击率',
                            critDamage: '暴击伤害',
                            health: '生命值',
                            defense: '防御力',
                            dodge: '闪避率',
                            attackSpeed: '攻击速度',
                            moveSpeed: '移动速度'
                        };
                        const suffix = key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : '';
                        statsHTML += `<p>${statNames[key] || key}: +${value}${suffix}</p>`;
                    }
                }
                
                if (!hasStats) {
                    statsHTML += `<p style="color: #aaa;">无属性加成</p>`;
                }
                
                statsHTML += `<p style="color: #aaa; font-size: 12px; margin-top: 10px;">提示：只有达到装备要求的等级才能穿戴</p>`;
                
                // 显示武器技能（含图标）
                if (eq.slot === 'weapon' && eq.skill) {
                    const skillIconUrl = this.getSkillIconUrl(eq.skill.name);
                    const skillIconHtml = skillIconUrl ? `<img src="${skillIconUrl}" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:6px;border-radius:4px;">` : '';
                    statsHTML += `<p>---</p>`;
                    statsHTML += `<p style="color: #ffaa00;"><strong>${skillIconHtml}武器技能: ${eq.skill.name}</strong></p>`;
                    statsHTML += `<p style="color: #aaa; font-size: 11px;">${eq.skill.description}</p>`;
                    statsHTML += `<p style="color: #aaa; font-size: 11px;">冷却时间: ${eq.skill.cooldown / 1000}秒</p>`;
                    
                    // 显示精炼效果（仅武器）
                    if (eq.refineEffects) {
                        statsHTML += `<p>---</p>`;
                        statsHTML += `<p style="color: #ffd700;"><strong>精炼效果:</strong></p>`;
                        statsHTML += `<p style="color: #aaa; font-size: 10px; margin-bottom: 5px;">精炼需要1把同名且同等精炼等级的武器</p>`;
                        
                        for (let i = 0; i < eq.refineEffects.length; i++) {
                            const refineEffect = eq.refineEffects[i];
                            const refineLevel = i + 1;
                            const starText = '★'.repeat(refineLevel);
                            
                            statsHTML += `<p style="color: #ffd700; font-size: 10px; margin-left: 10px; margin-top: 3px;">${starText} 精炼${refineLevel}级: ${refineEffect.description}</p>`;
                        }
                    }
                }
                
                // 显示装备词条
                if (eq.equipmentTraits && eq.equipmentTraits.description) {
                    statsHTML += `<p>---</p>`;
                    statsHTML += `<p style="color: #88ff88;"><strong>装备词条:</strong></p>`;
                    statsHTML += `<p style="color: #88ff88; font-size: 11px;">${eq.equipmentTraits.description}</p>`;
                }
                
                // 显示套装信息（已激活为绿色，未激活为黑色）
                const setId = getSetForEquipment(eq.name);
                if (setId) {
                    const setData = SET_DEFINITIONS[setId];
                    // 使用缓存的套装效果结果
                    statsHTML += `<p>---</p>`;
                    statsHTML += `<p style="color: #ffaa00;"><strong>套装: ${setData.name}</strong></p>`;
                    statsHTML += `<p style="color: #aaa; font-size: 11px;">套装效果:</p>`;
                    for (const [pieceCount, effect] of Object.entries(setData.effects)) {
                        const active = cachedActiveSet.has(setId + '-' + pieceCount);
                        const color = active ? '#33ff33' : '#888888';
                        statsHTML += `<p style="color: ${color}; font-size: 10px;">${pieceCount}件: ${typeof stripSetDescriptionMarkdown === 'function' ? stripSetDescriptionMarkdown(effect.description) : effect.description}</p>`;
                    }
                }
                
                stats.innerHTML = statsHTML;
                
                entry.appendChild(headerDiv);
                entry.appendChild(stats);
                fragment.appendChild(entry);
        });
        
        // 立即添加所有元素到DOM
        container.appendChild(fragment);
        
        // 批量设置图片（已缓存的立即设置，未缓存的异步加载）
        requestAnimationFrame(() => {
            filteredEquipments.forEach(eq => {
                const visual = container.querySelector(`[data-equipment-id="${eq.id}"]`);
                if (visual) {
                    const imageName = imageNameMap.get(String(eq.id));
                    if (imageName && this.assetManager.equipmentImageCache.has(imageName)) {
                        // 图片已缓存，立即设置
                        const imageUrl = this.assetManager.equipmentImageCache.get(imageName);
                        visual.style.backgroundImage = `url(${imageUrl})`;
                        visual.style.backgroundSize = 'cover';
                        visual.style.backgroundPosition = 'center';
                        visual.style.backgroundRepeat = 'no-repeat';
                    } else if (imageName) {
                        // 图片未缓存，异步加载（传递品质信息）
                        this.assetManager.setEquipmentBackgroundImage(visual, eq.name, eq.quality, eq).catch(() => {
                            // 静默处理错误
                        });
                    }
                }
            });
            
            // 如果有未缓存的图片，在后台批量加载（但优先使用预加载的缓存）
            if (uncachedImages.length > 0) {
                // 再次检查缓存（可能在预加载过程中已经加载完成）
                const stillUncached = uncachedImages.filter(imageName => 
                    !this.assetManager.equipmentImageCache.has(imageName)
                );
                
                if (stillUncached.length > 0) {
                    Promise.all(stillUncached.map(imageName => 
                        this.assetManager.loadAndProcessEquipmentImage(imageName).catch(() => {
                            // 静默处理错误
                        })
                    )).then(() => {
                        // 图片加载完成后，更新已显示的装备图片
                        filteredEquipments.forEach(eq => {
                            const visual = container.querySelector(`[data-equipment-id="${eq.id}"]`);
                            if (visual) {
                                const imageName = imageNameMap.get(String(eq.id));
                                if (imageName && this.assetManager.equipmentImageCache.has(imageName)) {
                                    const imageUrl = this.assetManager.equipmentImageCache.get(imageName);
                                    visual.style.backgroundImage = `url(${imageUrl})`;
                                    visual.style.backgroundSize = 'cover';
                                    visual.style.backgroundPosition = 'center';
                                    visual.style.backgroundRepeat = 'no-repeat';
                                }
                            }
                        });
                    });
                }
            }
        });
    }

    /** 图鉴「套装机制」：列出所有深阶套装（deep_*）各档位描述与 special 标记 */
    updateCodexSetMechanics() {
        const container = document.getElementById('set-mechanics-list');
        if (!container) return;
        if (typeof SET_DEFINITIONS === 'undefined') {
            container.innerHTML = '<p style="color:#888;text-align:center;padding:24px;">套装数据未加载</p>';
            return;
        }
        const ids = Object.keys(SET_DEFINITIONS).filter(id => String(id).startsWith('deep_')).sort();
        if (ids.length === 0) {
            container.innerHTML = '<p style="color:#888;text-align:center;padding:24px;">暂无深阶套装条目</p>';
            return;
        }
        const frag = document.createDocumentFragment();
        const tiers = ['2', '4', '6', '8'];
        ids.forEach(setId => {
            const def = SET_DEFINITIONS[setId];
            if (!def) return;
            const entry = document.createElement('div');
            entry.style.cssText = 'background:rgba(50,50,60,0.85);border:1px solid #666;border-radius:6px;padding:14px;margin-bottom:12px;';
            const title = document.createElement('h3');
            title.style.cssText = 'margin:0 0 8px 0;color:#e0c080;font-size:17px;';
            title.textContent = def.name || setId;
            entry.appendChild(title);
            const sub = document.createElement('p');
            sub.style.cssText = 'color:#888;font-size:11px;margin:0 0 10px 0;';
            sub.textContent = '套装 ID: ' + setId;
            entry.appendChild(sub);
            tiers.forEach(t => {
                const eff = def.effects && def.effects[t];
                if (!eff) return;
                const p = document.createElement('p');
                p.style.cssText = 'margin:6px 0;color:#ccc;font-size:12px;line-height:1.45;';
                const strip = typeof stripSetDescriptionMarkdown === 'function'
                    ? stripSetDescriptionMarkdown(eff.description || '')
                    : (eff.description || '');
                const spec = eff.special
                    ? ' [' + eff.special + ']'
                    : '';
                p.innerHTML = '<strong style="color:#9ad;">' + t + ' 件</strong><span style="color:#9cf;">' + spec + '</span>'
                    + (strip ? ' — ' + strip : '');
                entry.appendChild(p);
            });
            frag.appendChild(entry);
        });
        container.innerHTML = '';
        container.appendChild(frag);
    }

    updateCodexPotions() {
        const container = document.getElementById('potions-list');
        container.innerHTML = '';
        
        // 使用缓存的药水列表
        if (!this.cachedAllPotions) {
            this.cachedAllPotions = generatePotions();
        }
        const allPotions = this.cachedAllPotions;
        
        // 按品质分组
        const qualityGroups = {};
        allPotions.forEach(potion => {
            if (!qualityGroups[potion.quality]) {
                qualityGroups[potion.quality] = [];
            }
            qualityGroups[potion.quality].push(potion);
        });
        
        // 按品质顺序显示
        const qualityOrder = ['common', 'rare', 'fine', 'epic', 'legendary'];
        qualityOrder.forEach(quality => {
            if (qualityGroups[quality] && qualityGroups[quality].length > 0) {
                const header = document.createElement('h3');
                header.textContent = QUALITY_NAMES[quality];
                header.style.color = QUALITY_COLORS[quality] || '#fff';
                header.style.marginTop = '20px';
                header.style.marginBottom = '10px';
                header.style.borderBottom = `2px solid ${QUALITY_COLORS[quality] || '#666'}`;
                header.style.paddingBottom = '5px';
                container.appendChild(header);
                
                qualityGroups[quality].forEach(potion => {
                    const entry = document.createElement('div');
                    entry.className = 'potion-entry';
                    entry.style.background = 'rgba(50, 50, 60, 0.8)';
                    entry.style.border = `2px solid ${QUALITY_COLORS[potion.quality] || '#555'}`;
                    entry.style.borderRadius = '5px';
                    entry.style.padding = '15px';
                    entry.style.marginBottom = '10px';
                    
                    const name = document.createElement('h3');
                    name.style.color = QUALITY_COLORS[potion.quality] || '#fff';
                    name.style.fontSize = '18px';
                    name.style.marginBottom = '10px';
                    name.textContent = potion.name;
                    
                    const info = document.createElement('div');
                    info.className = 'potion-info';
                    let infoHTML = `<p><strong>品质:</strong> <span style="color: ${QUALITY_COLORS[potion.quality]}">${QUALITY_NAMES[potion.quality]}</span></p>`;
                    
                    if (potion.price) {
                        infoHTML += `<p><strong>商店价格:</strong> <span style="color: #ffd700;">${potion.price} 金币</span></p>`;
                    }
                    
                    if (potion.description) {
                        infoHTML += `<p style="color: #aaa; font-style: italic; margin-top: 5px;">${potion.description}</p>`;
                    }
                    
                    infoHTML += `<p>---</p>`;
                    infoHTML += `<p><strong>效果:</strong></p>`;
                    
                    const effectNames = {
                        attack: '攻击力',
                        defense: '防御力',
                        critRate: '暴击率',
                        critDamage: '暴击伤害',
                        dodge: '闪避率',
                        attackSpeed: '攻击速度',
                        moveSpeed: '移动速度',
                        health: '生命值恢复'
                    };
                    
                    let hasEffects = false;
                    for (const [key, value] of Object.entries(potion.effects)) {
                        if (key !== 'duration' && value !== 0) {
                            hasEffects = true;
                            const suffix = key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : '';
                            infoHTML += `<p>${effectNames[key] || key}: +${value}${suffix}</p>`;
                        }
                    }
                    
                    if (!hasEffects) {
                        infoHTML += `<p style="color: #aaa;">无效果</p>`;
                    }
                    
                    infoHTML += `<p>---</p>`;
                    
                    if (potion.duration > 0) {
                        infoHTML += `<p><strong>持续时间:</strong> ${potion.duration / 1000}秒</p>`;
                    } else {
                        infoHTML += `<p><strong>类型:</strong> 立即生效</p>`;
                    }
                    
                    infoHTML += `<p style="color: #aaa; font-size: 12px; margin-top: 10px;">提示：在背包中双击药水即可使用</p>`;
                    
                    info.innerHTML = infoHTML;
                    
                    entry.appendChild(name);
                    entry.appendChild(info);
                    container.appendChild(entry);
                });
            }
        });
    }

    /**
     * 更新背包UI显示
     */
    updateInventoryUI() {
        // 更新装备栏
        const imageUpdates = [];
        Object.keys(this.player.equipment).forEach(slot => {
            const slotElement = document.querySelector(`[data-slot="${slot}"]`);
            const eq = this.player.equipment[slot];
            if (eq) {
                slotElement.className = `equipment-item equipped item-quality-${eq.quality}`;
                const currentItemId = slotElement.dataset.itemId;
                slotElement.dataset.itemId = eq.id;
                // 如果装备ID不同，需要更新图片
                if (!currentItemId || currentItemId != eq.id) {
                    imageUpdates.push({ element: slotElement, name: eq.name, item: eq });
                }
                // 更新品质背景色
                const qualityColor = QUALITY_COLORS[eq.quality] || '#ffffff';
                const qualityBgOpacity = {
                    'common': '40',
                    'rare': '50',
                    'fine': '60',
                    'epic': '70',
                    'legendary': '80'
                };
                slotElement.style.backgroundColor = qualityColor + (qualityBgOpacity[eq.quality] || '40');
            } else {
                slotElement.className = 'equipment-item';
                if (!slotElement.dataset.itemId) {
                    slotElement.style.backgroundImage = '';
                }
                slotElement.style.backgroundColor = '#333'; // 默认背景色
                delete slotElement.dataset.itemId;
            }
        });
        
        // 批量更新图片（使用requestAnimationFrame批量处理）
        if (imageUpdates.length > 0) {
            requestAnimationFrame(() => {
                imageUpdates.forEach(({ element, name, item }) => {
                    this.assetManager.setEquipmentBackgroundImage(element, name, null, item || null);
                });
            });
        }
        
        // 根据当前页签显示相应的物品
        const allSlots = document.querySelectorAll('#inventory-items .inventory-slot');
        const tabType = this.currentInventoryTab || 'equipment';
        
        // 收集要显示的物品索引
        let itemsToShow = [];
        if (tabType === 'equipment') {
            // 显示装备（0-17区域）
            const equipmentEndIndex = this.player.maxEquipmentCapacity || 18;
            for (let i = 0; i < equipmentEndIndex; i++) {
                const item = this.player.inventory[i];
                if (item && (item.type === 'equipment' || (!item.type && item.slot))) {
                    itemsToShow.push({ index: i, item: item });
                }
            }
        } else if (tabType === 'material') {
            // 显示材料（18-47区域）
            const materialStartIndex = 18;
            const materialEndIndex = materialStartIndex + (this.player.maxAlchemyCapacity || 30);
            for (let i = materialStartIndex; i < materialEndIndex; i++) {
                const item = this.player.inventory[i];
                if (item && (item.type === 'material' || item.type === 'alchemy')) {
                    itemsToShow.push({ index: i, item: item });
                }
            }
        } else if (tabType === 'consumable') {
            // 显示消耗品（48-65区域，独立区域）
            const consumableStartIndex = 48;
            const consumableEndIndex = consumableStartIndex + (this.player.maxPotionCapacity || 18);
            for (let i = consumableStartIndex; i < consumableEndIndex; i++) {
                const item = this.player.inventory[i];
                if (item && (item.type === 'consumable' || item.type === 'potion')) {
                    itemsToShow.push({ index: i, item: item });
                }
            }
        }
        
        // 更新所有格子
        const inventoryImageUpdates = [];
        allSlots.forEach((slot, localIndex) => {
            // 清除之前的锁图标
            const existingLock = slot.querySelector('.level-lock-icon');
            if (existingLock) {
                existingLock.remove();
            }
            
            if (localIndex < itemsToShow.length) {
                const { index, item } = itemsToShow[localIndex];
                
                // 检查装备等级要求
                let isLevelLocked = false;
                if (item.type === 'equipment' && item.level) {
                    const requiredLevel = Number(item.level);
                    const playerLevel = Number(this.player.level);
                    if (!isNaN(requiredLevel) && !isNaN(playerLevel) && playerLevel < requiredLevel) {
                        isLevelLocked = true;
                    }
                }
                
                slot.className = `inventory-slot item-quality-${item.quality}${isLevelLocked ? ' level-locked' : ''}`;
                slot.dataset.index = index; // 保持原始索引用于点击事件
                
                // 先保存旧的itemId用于比较
                const oldItemId = slot.dataset.itemId;
                slot.dataset.itemId = item.id;
                
                const qualityColor = QUALITY_COLORS[item.quality] || '#ffffff';
                slot.style.color = qualityColor;
                // 边框统一设置为3px solid，由通用函数处理（背包格子作为容器，直接设置边框）
                slot.style.border = `3px solid ${qualityColor}`;
                // 添加品质背景色
                const qualityBgOpacity = {
                    'common': '40',
                    'rare': '50',
                    'fine': '60',
                    'epic': '70',
                    'legendary': '80'
                };
                slot.style.backgroundColor = qualityColor + (qualityBgOpacity[item.quality] || '40');
                slot.title = item.name;
                
                // 如果是装备，检查是否需要更新图片
                if (item.type === 'equipment') {
                    inventoryImageUpdates.push({ element: slot, name: item.name, quality: item.quality, item });
                } else if (item.type === 'material' || item.type === 'alchemy') {
                    inventoryImageUpdates.push({ element: slot, name: item.name, type: 'alchemy_material' });
                } else if (item.type === 'consumable' || item.type === 'potion') {
                    // 消耗品（图纸等）显示贴图和背景色
                    slot.textContent = ''; // 清除文字，使用贴图
                    slot.style.fontSize = '';
                    slot.style.textAlign = '';
                    slot.style.display = '';
                    slot.style.alignItems = '';
                    slot.style.justifyContent = '';
                    
                    // 根据品质设置背景色
                    const qualityColors = {
                        'common': 'rgba(200, 200, 200, 0.4)',
                        'uncommon': 'rgba(100, 200, 100, 0.4)',
                        'rare': 'rgba(100, 150, 255, 0.4)',
                        'fine': 'rgba(100, 150, 255, 0.4)',
                        'epic': 'rgba(200, 100, 255, 0.4)',
                        'legendary': 'rgba(255, 200, 100, 0.4)'
                    };
                    slot.style.backgroundColor = qualityColors[item.quality] || qualityColors['common'];
                    
                    if (item.consumableType === 'recipe') {
                        // 图纸从 mappings 中读取图片
                        const imageName = (typeof MAPPINGS !== 'undefined' && MAPPINGS.consumable && MAPPINGS.consumable.blueprint) 
                            ? MAPPINGS.consumable.blueprint 
                            : 'blueprint.png';
                        const base = window.location.protocol === 'file:' ? 'asset/' : (window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'asset/');
                        slot.style.backgroundImage = `url(${base}${imageName})`;
                        slot.style.backgroundSize = 'cover';
                        slot.style.backgroundPosition = 'center';
                        slot.style.backgroundRepeat = 'no-repeat';
                    } else {
                        // 其他消耗品（如药水）显示文字
                        slot.textContent = item.name;
                        slot.style.fontSize = '10px';
                        slot.style.textAlign = 'center';
                        slot.style.display = 'flex';
                        slot.style.alignItems = 'center';
                        slot.style.justifyContent = 'center';
                        slot.style.backgroundImage = '';
                    }
                } else {
                    slot.style.backgroundImage = '';
                    slot.style.backgroundColor = '#333'; // 空格子默认背景色
                    slot.style.border = '2px solid #555'; // 空格子默认边框
                }
                
                // 如果等级不足，添加锁图标
                if (isLevelLocked) {
                    const lockIcon = document.createElement('div');
                    lockIcon.className = 'level-lock-icon';
                    lockIcon.textContent = '🔒';
                    lockIcon.style.position = 'absolute';
                    lockIcon.style.top = '2px';
                    lockIcon.style.right = '2px';
                    lockIcon.style.fontSize = '14px';
                    lockIcon.style.color = '#ff6666';
                    lockIcon.style.pointerEvents = 'none';
                    lockIcon.style.zIndex = '10';
                    lockIcon.style.textShadow = '0 0 3px rgba(0, 0, 0, 0.8)';
                    slot.appendChild(lockIcon);
                }
            } else {
                // 空格子 - 清除所有样式和内容，但保留默认背景色
                slot.className = 'inventory-slot';
                slot.style.color = '';
                slot.style.border = '2px solid #555'; // 空格子默认边框
                slot.title = '';
                slot.style.backgroundImage = '';
                slot.style.backgroundColor = '#333'; // 空格子默认背景色
                slot.textContent = ''; // 清除文字内容
                slot.style.fontSize = '';
                slot.style.textAlign = '';
                slot.style.display = '';
                slot.style.alignItems = '';
                slot.style.justifyContent = '';
                delete slot.dataset.itemId;
                delete slot.dataset.index; // 空格子不需要索引
            }
        });
        
        // 取消之前的图片更新请求（如果存在）
        if (this.inventoryImageUpdateRequestId !== null) {
            cancelAnimationFrame(this.inventoryImageUpdateRequestId);
            this.inventoryImageUpdateRequestId = null;
        }
        
        // 批量更新图片（使用requestAnimationFrame批量处理）
        if (inventoryImageUpdates.length > 0) {
            // 保存当前更新批次的信息，用于验证元素是否仍然有效
            const updateBatch = inventoryImageUpdates.map(({ element, name, quality, type, item }) => ({
                element,
                name,
                quality,
                type,
                item,
                expectedItemId: element.dataset.itemId // 保存期望的itemId
            }));
            
            this.inventoryImageUpdateRequestId = requestAnimationFrame(() => {
                updateBatch.forEach(({ element, name, quality, type, item, expectedItemId }) => {
                    // 验证元素是否仍然有效（检查itemId是否匹配，防止快速切换导致元素已被替换）
                    if (element && element.dataset.itemId === expectedItemId) {
                        if (type === 'alchemy_material') {
                            // 炼金材料图片
                            this.assetManager.setAlchemyMaterialBackgroundImage(element, name, 'cover');
                        } else {
                            // 装备图片
                            this.assetManager.setEquipmentBackgroundImage(element, name, quality, item || null);
                        }
                    }
                });
                this.inventoryImageUpdateRequestId = null;
            });
        }
        
        // 更新详细属性显示
        this.updateInventoryStats();
    }

    /**
     * 调整工具提示位置
     * @param {HTMLElement} tooltip - 工具提示元素
     * @param {number} x - 鼠标X坐标
     * @param {number} y - 鼠标Y坐标
     * @param {number} offsetX - X偏移量
     * @param {number} offsetY - Y偏移量
     */
    // 工具提示方法已移至 TooltipManager，保留作为代理
    adjustTooltipPosition(tooltip, x, y, offsetX = 10, offsetY = 10) {
        return this.tooltipManager.adjustTooltipPosition(tooltip, x, y, offsetX, offsetY);
    }
    
    showItemTooltip(element, x, y) {
        return this.tooltipManager.showItemTooltip(element, x, y);
    }
    
    hideItemTooltip() {
        return this.tooltipManager.hideItemTooltip();
    }
    
    showSetEffectTooltip(setId, currentPieceCount, x, y) {
        return this.tooltipManager.showSetEffectTooltip(setId, currentPieceCount, x, y);
    }
    
    // 以下为旧代码，保留用于参考（将被删除）
    /*
    adjustTooltipPosition_OLD(tooltip, x, y, offsetX = 10, offsetY = 10) {
        // 先设置初始位置（在屏幕外），以便获取实际尺寸而不显示
        tooltip.style.left = '-9999px';
        tooltip.style.top = '-9999px';
        tooltip.classList.add('show');
        
        // 强制浏览器计算布局以获取实际尺寸
        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        
        // 获取视口尺寸
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 计算初始位置
        let finalX = x + offsetX;
        let finalY = y + offsetY;
        
        // 检查右边界：如果工具提示超出屏幕右边界，向左调整
        if (finalX + tooltipWidth > viewportWidth) {
            finalX = viewportWidth - tooltipWidth - 10; // 留10px边距
            // 如果调整后超出左边界，则放在鼠标左侧
            if (finalX < 10) {
                finalX = x - tooltipWidth - offsetX;
                // 如果还是超出左边界，则紧贴左边界
                if (finalX < 10) {
                    finalX = 10;
                }
            }
        }
        
        // 检查左边界：如果工具提示超出屏幕左边界，向右调整
        if (finalX < 10) {
            finalX = 10;
        }
        
        // 检查下边界：如果工具提示超出屏幕下边界，向上调整
        if (finalY + tooltipHeight > viewportHeight) {
            finalY = viewportHeight - tooltipHeight - 10; // 留10px边距
            // 如果调整后超出上边界，则放在鼠标上方
            if (finalY < 10) {
                finalY = y - tooltipHeight - offsetY;
                // 如果还是超出上边界，则紧贴上边界
                if (finalY < 10) {
                    finalY = 10;
                }
            }
        }
        
        // 检查上边界：如果工具提示超出屏幕上边界，向下调整
        if (finalY < 10) {
            finalY = 10;
        }
        
        // 应用最终位置
        tooltip.style.left = finalX + 'px';
        tooltip.style.top = finalY + 'px';
    }

    showItemTooltip(element, x, y) {
        const tooltip = document.getElementById('item-tooltip');
        const root = element.closest && (element.closest('.inventory-slot') || element.closest('.equipment-item')) || element;
        const itemId = (root.dataset && root.dataset.itemId) || element.dataset.itemId;
        
        if (!itemId) {
            tooltip.classList.remove('show');
            return;
        }
        
        // 查找物品
        let item = null;
        Object.values(this.player.equipment).forEach(eq => {
            if (eq && eq.id.toString() === itemId) {
                item = eq;
            }
        });
        if (!item) {
            this.player.inventory.forEach(inv => {
                if (inv && inv.id.toString() === itemId) {
                    item = inv;
                }
            });
        }
        
        if (item) {
            // 支持装备和药水，装备传入当前已穿戴以区分套装激活/未激活
            if (item.getTooltipHTML) {
                const isEquipment = (item.type === 'equipment') || (item.slot != null && item.stats != null);
                tooltip.innerHTML = isEquipment ? item.getTooltipHTML(this.player.equipment) : item.getTooltipHTML();
            } else {
                // 兼容旧代码
                tooltip.innerHTML = `<h4>${item.name || '未知物品'}</h4>`;
            }
            // 使用位置调整函数
            this.tooltipManager.adjustTooltipPosition(tooltip, x, y);
        }
    }

    /**
     * 隐藏物品工具提示
     */
    hideItemTooltip() {
        const tooltip = document.getElementById('item-tooltip');
        if (tooltip) {
            tooltip.classList.remove('show');
            tooltip.style.display = 'none'; // 强制隐藏
            tooltip.innerHTML = ''; // 清空内容，确保完全隐藏
            // 延迟后移除 display 样式，让 CSS 控制
            setTimeout(() => {
                if (tooltip && !tooltip.classList.contains('show')) {
                    tooltip.style.display = '';
                }
            }, 50);
        }
    }

    /**
     * 显示套装效果工具提示
     * @param {string} setId - 套装ID
     * @param {number} currentPieceCount - 当前激活的件数
     * @param {number} x - 鼠标X坐标
     * @param {number} y - 鼠标Y坐标
     */
    showSetEffectTooltip(setId, currentPieceCount, x, y) {
        const tooltip = document.getElementById('item-tooltip');
        if (!tooltip) return;
        
        if (!setId || typeof SET_DEFINITIONS === 'undefined' || !SET_DEFINITIONS[setId]) {
            tooltip.classList.remove('show');
            return;
        }

        const setData = SET_DEFINITIONS[setId];
        let html = `<h4 style="color: #ffaa00;">${setData.name}</h4>`;
        html += `<p style="color: #aaa; font-size: 11px;">套装效果:</p>`;
        
        // 获取当前激活的所有套装效果
        const activeSet = new Set();
        if (typeof getActiveSetEffects === 'function') {
            getActiveSetEffects(this.player.equipment).forEach(e => {
                if (e.setId === setId) {
                    activeSet.add(e.pieceCount);
                }
            });
        }

        // 显示所有套装效果（2件、4件、6件、8件）
        for (const pieceCount of [2, 4, 6, 8]) {
            if (setData.effects[pieceCount]) {
                const effect = setData.effects[pieceCount];
                const isActive = activeSet.has(pieceCount);
                const color = isActive ? '#33ff33' : '#888888';
                const activeText = isActive ? ' (已激活)' : '';
                html += `<p style="color: ${color}; font-size: 10px;">${pieceCount}件: ${typeof stripSetDescriptionMarkdown === 'function' ? stripSetDescriptionMarkdown(effect.description) : effect.description}${activeText}</p>`;
            }
        }

        tooltip.innerHTML = html;
        tooltip.classList.add('show');
        // 移除可能存在的 display: none 样式，让 CSS 的 .show 类控制显示
        tooltip.style.display = '';
        this.tooltipManager.adjustTooltipPosition(tooltip, x, y);
    }

    /**
     * 处理装备栏点击
     * @param {string} slot - 装备部位
     */
    handleEquipmentSlotClick(slot) {
        const item = this.player.equipment[slot];
        if (item) {
            // 卸下装备
            this.player.equipment[slot] = null;
            this.addItemToInventory(item);
            this.player.updateStats();
            if (typeof this.player.onEquipmentSlotChanged === 'function') {
                this.player.onEquipmentSlotChanged(slot);
            }
            this.updateInventoryUI();
            this.updateHUD();
        }
    }

    /**
     * 处理背包格子点击
     * @param {number} index - 背包索引
     */
    handleInventorySlotClick(index) {
        const item = this.player.inventory[index];
        if (item) {
            // 如果是消耗品（药水），使用它（神圣十字架不能通过双击使用）
            if ((item.type === 'consumable' || item.type === 'potion') && 
                item.consumableType !== 'resurrection' && 
                item.name !== '神圣十字架') {
                // 只有药水类型的消耗品才能使用
                if (item.consumableType === 'potion' || item.type === 'potion') {
                    this.player.usePotion(item);
                    this.player.inventory[index] = null; // 移除消耗品
                    this.updateInventoryUI();
                    this.updateHUD();
                    return;
                }
            }
            
            // 如果是装备，尝试装备
            if (item.type === 'equipment' && item.slot) {
                // 检查玩家等级是否达到装备要求
                const requiredLevel = Number(item.level);
                const playerLevel = Number(this.player.level);
                
                // 确保等级值是有效的数字
                if (isNaN(requiredLevel) || isNaN(playerLevel)) {
                    console.error('装备等级检查失败：等级值无效', { itemLevel: item.level, playerLevel: this.player.level });
                    this.addFloatingText(this.player.x, this.player.y, '装备数据错误，无法装备', '#ff0000');
                    return;
                }
                
                // 严格检查：玩家等级必须大于等于装备要求等级
                if (playerLevel < requiredLevel) {
                    this.addFloatingText(this.player.x, this.player.y, `需要等级 ${requiredLevel} 才能装备（当前等级：${playerLevel}）`, '#ff0000');
                    return;
                }
                
                const currentEquipped = this.player.equipment[item.slot];
                this.player.equipment[item.slot] = item;
                this.player.inventory[index] = null;
                
                // 播放穿装备音效
                if (this.soundManager) {
                    this.soundManager.playSound('equip');
                }
                
                if (currentEquipped) {
                    this.player.inventory[index] = currentEquipped;
                }
                
                this.player.updateStats();
                if (typeof this.player.onEquipmentSlotChanged === 'function') {
                    this.player.onEquipmentSlotChanged(item.slot);
                }
                this.updateInventoryUI();
                this.updateHUD(); // 更新HUD以刷新套装效果显示
            }
        }
    }

    // ====================================================================
    // 物品管理方法组
    // ====================================================================

    /**
     * 添加物品到背包
     * @param {Object} item - 要添加的物品
     * @returns {boolean} 是否成功添加
     */
    addItemToInventory(item) {
        // 根据物品类型确定应该放在哪个区域
        let startIndex, endIndex;
        if (item.type === 'material' || item.type === 'alchemy') {
            // 材料放在18-47
            startIndex = 18;
            endIndex = 18 + (this.player.maxAlchemyCapacity || 30);
        } else if (item.type === 'consumable' || item.type === 'potion') {
            // 消耗品放在48-65（独立区域）
            startIndex = 48;
            endIndex = 48 + (this.player.maxPotionCapacity || 18);
        } else {
            // 装备放在0-17
            startIndex = 0;
            endIndex = this.player.maxEquipmentCapacity || 18;
        }
        
        // 在指定区域内查找空槽位
        let emptySlot = -1;
        for (let i = startIndex; i < endIndex; i++) {
            if (this.player.inventory[i] === null || this.player.inventory[i] === undefined) {
                emptySlot = i;
                break;
            }
        }
        
        console.log(`查找空槽位: ${emptySlot}, 物品类型: ${item.type || 'equipment'}, 背包大小: ${this.player.inventory.length}, 已用: ${this.player.inventory.filter(i => i !== null && i !== undefined).length}`);
        
        if (emptySlot !== -1) {
            // 如果物品还没有唯一标识符，为其生成一个
            if (!item.uniqueId) {
                item.uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            }
            
            // 如果当前在恶魔塔中，标记这个物品
            if (this.currentScene === SCENE_TYPES.TOWER) {
                this.towerItems.add(item.uniqueId);
                console.log(`标记恶魔塔物品: ${item.name} (uniqueId: ${item.uniqueId})`);
            }
            
            this.player.inventory[emptySlot] = item;
            console.log(`添加物品到背包: ${item.name} (类型: ${item.type || 'equipment'}, 品质: ${item.quality}, ID: ${item.id}), 位置: ${emptySlot}`);
            console.log(`当前背包物品数: ${this.player.inventory.filter(i => i !== null && i !== undefined).length}`);
            
            // 显示获得物品的提示
            const qualityColor = QUALITY_COLORS[item.quality] || '#ffffff';
            // 确保玩家位置有效，避免文字瞬间消失
            const playerX = (this.player && this.player.x !== undefined && !isNaN(this.player.x)) ? this.player.x : CONFIG.CANVAS_WIDTH / 2;
            const playerY = (this.player && this.player.y !== undefined && !isNaN(this.player.y)) ? this.player.y : CONFIG.CANVAS_HEIGHT / 2;
            this.addFloatingText(
                playerX, 
                playerY, 
                `获得: ${item.name}`, 
                qualityColor
            );
            
            // 如果背包界面是打开的，立即更新UI
            const modal = document.getElementById('inventory-modal');
            if (modal && modal.classList.contains('show')) {
                console.log('背包界面已打开，更新UI');
                this.updateInventoryUI();
                this.updateInventoryCapacity();
            } else {
                console.log('背包界面未打开');
            }
            return true; // 返回成功
        } else {
            // 对应区域满了，显示红色提示
            let areaName = '装备区域';
            if (item.type === 'material' || item.type === 'alchemy') {
                areaName = '材料区域';
            } else if (item.type === 'consumable' || item.type === 'potion') {
                areaName = '消耗品区域';
            }
            console.log(`${areaName}已满！`);
            this.addFloatingText(
                this.player.x, 
                this.player.y, 
                `${areaName}已满！`, 
                '#ff0000'
            );
            return false; // 返回失败
        }
    }

    /**
     * 统一的场景切换函数
     * 处理所有场景切换的通用逻辑：重置E键状态、记录切换时间等
     * @param {string} targetScene - 目标场景类型 (SCENE_TYPES.TOWN, SCENE_TYPES.TOWER, SCENE_TYPES.TRAINING)
     */
    transitionScene(targetScene) {
        // 播放传送音效
        if (this.soundManager) {
            this.soundManager.playSound('teleport');
        }
        
        // 记录场景切换时间（用于E键交互冷却）
        this.lastSceneTransitionTime = Date.now();
        // 重置E键状态，防止场景切换时E键仍按下导致立即触发交互
        this.keys['e'] = false;
        this.lastEKeyState = false;
        
        // 重置攻击状态（防止场景切换时保持攻击状态）
        if (this.player) {
            this.player.slashStartTime = 0;
            this.player.slashAngle = 0;
        }
        
        // 重置攻击键状态（防止场景切换时攻击键仍按下导致持续攻击）
        this.keys['j'] = false;
        if (this.mouse) {
            this.mouse.left = false;
        }
        
        // 离开恶魔塔时清空仅塔内生效的状态（精英加护、恶魔干扰）
        const previousScene = this.currentScene;
        this.currentScene = targetScene;
        if (previousScene === SCENE_TYPES.TOWER && targetScene !== SCENE_TYPES.TOWER && this.player) {
            this.resetDemonTowerTransientPlayerState();
        }
        
        // 切换背景音乐
        if (this.soundManager) {
            this.soundManager.playBgmForScene(targetScene);
        }
    }
    
    /**
     * 清空恶魔塔临时效果：精英加护、恶魔干扰 debuff 与 UI 文案（离开塔时由 transitionScene 自动调用）
     */
    resetDemonTowerTransientPlayerState() {
        if (!this.player) return;
        this.player.eliteBoons = [];
        this.player.towerReviveCharges = 0;
        this.player.towerMaxHpBonusPercent = 0;
        this.player.demonDebuffs = {};
        this.demonEffectStatusText = '';
        this.demonInterferenceFlags = {};
        this.player.updateStats();
    }
    
    /**
     * 初始化背景音乐（在游戏开始时播放初始场景的背景音乐）
     */
    initBgm() {
        if (this.soundManager && this.currentScene) {
            console.log('初始化背景音乐，当前场景:', this.currentScene);
            this.soundManager.playBgmForScene(this.currentScene);
        }
    }

    /**
     * 生成新房间
     * @param {string} forcedType - 强制指定的房间类型（可选）
     */
    generateNewRoom(forcedType = null) {
        if (forcedType === 'alchemy') forcedType = null;
        const maxF = typeof window.getTowerMaxFloor === 'function' ? window.getTowerMaxFloor() : 240;
        this.floor = Math.min(this.floor, maxF);
        // 清空掉落物、传送门和怪物子弹
        this.droppedItems = [];
        this.portals = [];
        this.monsterProjectiles = [];
        this.groundHazards = [];
        this.pendingMonsterAoE = [];
        this.soulCircles = [];

        let selectedType = forcedType;
        
        if (!selectedType && this.currentScene === SCENE_TYPES.TOWER) {
            if (typeof window.isTowerBossFloor === 'function' && window.isTowerBossFloor(this.floor)) {
                selectedType = ROOM_TYPES.BOSS;
            } else if (typeof window.isTowerGapShopFloor === 'function' && window.isTowerGapShopFloor(this.floor)) {
                selectedType = ROOM_TYPES.GAP_SHOP;
            }
        }
        
        if (!selectedType) {
            const types = [ROOM_TYPES.BATTLE, ROOM_TYPES.TREASURE, ROOM_TYPES.REST];
            
            // 根据楼层调整权重：前期更多战斗房间，减少其他房间
            let weights;
            if (this.floor <= 5) {
                weights = [0.8, 0.1, 0.1];
            } else if (this.floor <= 10) {
                weights = [0.7, 0.15, 0.15];
            } else if (this.floor <= 15) {
                weights = [0.6, 0.2, 0.2];
            } else {
                weights = [0.5, 0.25, 0.25];
            }
            
            let rand = Math.random();
            let cumulative = 0;
            selectedType = types[0];
            
            for (let i = 0; i < types.length; i++) {
                cumulative += weights[i];
                if (rand < cumulative) {
                    selectedType = types[i];
                    break;
                }
            }
        }
        
        this.currentRoom = new Room(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT, selectedType, this.floor, this);
        this.currentRoom.generateRoom(this.player.level);
        
        // 调用统一的场景切换函数（虽然是在同一场景内切换房间，但也需要冷却）
        this.transitionScene(SCENE_TYPES.TOWER);
        
        // 更新UI
        const typeNames = {
            battle: '战斗',
            treasure: '宝箱',
            rest: '休整',
            elite: '精英',
            alchemy: '炼金',
            gap_shop: '隙间商店',
            boss: 'Boss'
        };
        document.getElementById('room-type').textContent = typeNames[selectedType] || selectedType;
        document.getElementById('floor-number').textContent = this.floor;
        
        if (selectedType === ROOM_TYPES.GAP_SHOP) {
            setTimeout(() => this.openGapShopModal(), 100);
        }
    }

    gainExp(amount) {
        this.player.gainExp(amount);
        this.updateHUD();
    }

    /**
     * 玩家获得金币
     * @param {number} amount - 金币数量
     */
    gainGold(amount) {
        let gained = amount;
        if (amount > 0 && this.player && typeof this.player.getEquipmentTraitIds === 'function') {
            const gt = this.player.getEquipmentTraitIds();
            if (typeof traitIdsIncludeBase === 'function' && typeof voidTraitTierFromList === 'function') {
                if (this.currentScene === SCENE_TYPES.TOWER && traitIdsIncludeBase(gt, 'void_g_hoard')) {
                    const th = voidTraitTierFromList(gt, 'void_g_hoard');
                    const hb = typeof deepTraitBand === 'function' ? deepTraitBand(th) : 0;
                    gained = Math.floor(gained * (1 + (4 + 0.75 * th) / 100 + 0.012 * hb));
                    if (hb >= 2) gained += Math.max(1, Math.floor(amount * (0.008 + 0.004 * hb)));
                    if (hb >= 3 && Math.random() < 0.14) {
                        const burst = Math.max(1, Math.floor(gained * 0.22));
                        gained += burst;
                        if (this.player) this.addFloatingText(this.player.x, this.player.y, `囤金 +${burst}`, '#ffe066', 1600, 15, true);
                    }
                }
                if (traitIdsIncludeBase(gt, 'void_g_covet')) {
                    const tc = voidTraitTierFromList(gt, 'void_g_covet');
                    const cb = typeof deepTraitBand === 'function' ? deepTraitBand(tc) : 0;
                    let covetP = (4.5 + 0.75 * tc) / 100;
                    if (cb >= 1) covetP *= 1 + 0.045 * cb;
                    if (Math.random() < covetP) {
                        const pre = gained;
                        gained = Math.floor(gained * 2);
                        if (cb >= 2) gained += Math.max(0, Math.floor(pre * (0.04 + 0.03 * cb)));
                        if (cb >= 3 && Math.random() < 0.1) {
                            gained = Math.floor(gained * 1.18);
                            if (this.player) this.addFloatingText(this.player.x, this.player.y, '贪潮!', '#ffcc44', 1700, 16, true);
                        }
                    }
                }
            } else {
                if (this.currentScene === SCENE_TYPES.TOWER && gt.includes('void_g_hoard')) {
                    gained = Math.floor(gained * 1.055);
                }
                if (gt.includes('void_g_covet') && Math.random() < 0.06) {
                    gained = Math.floor(gained * 2);
                }
            }
        }
        if (amount > 0 && this.currentScene === SCENE_TYPES.TOWER && this.player) {
            const b = this.player.towerGoldBonusPercent || 0;
            if (b > 0) gained = Math.floor(gained * (1 + b / 100));
        }
        this.player.gold += gained;
        
        if (this.currentScene === SCENE_TYPES.TOWER) {
            this.towerGoldGained += gained;
        }
        
        this.updateHUD();
    }

    /**
     * 初始化武器技能按钮
     */
    initWeaponSkillButton() {
        const skillBtn = document.getElementById('weapon-skill-btn');
        if (!skillBtn) return;
        skillBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this._onWeaponSkillInputDown('btn');
        });
        window.addEventListener('mouseup', this._weaponSkillGlobalMouseUp, true);
    }

    /**
     * 战力变化回调
     * @param {number} newPower - 新战力
     * @param {number} oldPower - 旧战力
     */
    onCombatPowerChanged(newPower, oldPower) {
        // 只在战力真正变化时显示提示（避免初始化时显示）
        if (oldPower > 0 && newPower !== oldPower) {
            const change = newPower - oldPower;
            this.showCombatPowerChangeNotification(newPower, change);
        }
    }
    
    /**
     * 显示战力变化提示
     * @param {number} currentPower - 当前战力
     * @param {number} change - 战力变化值（正数为提升，负数为下降）
     */
    showCombatPowerChangeNotification(currentPower, change) {
        const notification = document.getElementById('combat-power-change-notification');
        const currentSpan = document.getElementById('combat-power-current');
        const changeSpan = document.getElementById('combat-power-change');
        
        if (!notification || !currentSpan || !changeSpan) return;
        
        // 如果已经有显示中的通知，先清除之前的定时器和淡出效果
        if (this.combatPowerNotificationTimer) {
            clearTimeout(this.combatPowerNotificationTimer);
            this.combatPowerNotificationTimer = null;
        }
        
        // 移除淡出类（如果有）
        notification.classList.remove('fade-out');
        
        // 更新当前战力（金色）
        currentSpan.textContent = currentPower;
        
        // 更新变化值
        if (change > 0) {
            // 战力提升：绿色 + 向上箭头
            changeSpan.textContent = `+${change}`;
            changeSpan.className = 'combat-power-change combat-power-increase';
            changeSpan.innerHTML = `<span style="color: #00ff00;">+${change}</span> <span style="color: #00ff00;">↑</span>`;
        } else if (change < 0) {
            // 战力下降：红色 + 向下箭头
            changeSpan.textContent = `${change}`;
            changeSpan.className = 'combat-power-change combat-power-decrease';
            changeSpan.innerHTML = `<span style="color: #ff0000;">${change}</span> <span style="color: #ff0000;">↓</span>`;
        } else {
            // 无变化，不显示
            return;
        }
        
        // 强制重新计算样式，确保淡入动画生效
        void notification.offsetWidth;
        
        // 显示通知（淡入效果）
        notification.classList.add('show');
        
        // 2.5秒后开始淡出，0.6秒后完全隐藏
        this.combatPowerNotificationTimer = setTimeout(() => {
            // 添加淡出类
            notification.classList.add('fade-out');
            
            // 淡出动画完成后移除show类
            setTimeout(() => {
                notification.classList.remove('show');
                notification.classList.remove('fade-out');
            }, 600); // 与CSS中的transition时间一致
        }, 2500);
    }
    
    /**
     * 更新HUD显示
     */
    updateHUD() {
        this._tryCompleteFusionJob();
        // 更新左下角血条和等级条
        document.getElementById('player-hp').textContent = Math.floor(this.player.hp);
        document.getElementById('player-max-hp').textContent = this.player.maxHp;
        document.getElementById('player-level').textContent = this.player.level;
        document.getElementById('player-exp').textContent = this.player.exp;
        document.getElementById('player-exp-needed').textContent = this.player.expNeeded;
        const goldDisplay = document.getElementById('player-gold-display');
        if (goldDisplay) {
            goldDisplay.textContent = this.player.gold;
        }
        
        const hpFill = document.getElementById('hp-bar-fill');
        if (hpFill) {
            const hpPct = this.player.maxHp > 0 ? Math.min(100, 100 * this.player.hp / this.player.maxHp) : 0;
            hpFill.style.width = hpPct + '%';
        }
        const expFill = document.getElementById('exp-bar-fill');
        if (expFill) {
            const expPct = this.player.expNeeded > 0 ? Math.min(100, 100 * this.player.exp / this.player.expNeeded) : 0;
            expFill.style.width = expPct + '%';
        }
        
        // 更新武器技能按钮
        this.updateWeaponSkillButton();
        
        // 更新装备栏品质边框
        this.updateEquipmentSlotBorders();
        
        // 更新背包界面的详细属性（如果背包界面打开）
        this.updateInventoryStats();
        
        // 恶魔干扰状态栏（仅塔内显示）
        const demonEl = document.getElementById('demon-effect-display');
        if (demonEl) {
            if (this.currentScene === SCENE_TYPES.TOWER && this.demonEffectStatusText) {
                demonEl.textContent = this.demonEffectStatusText;
                demonEl.style.display = 'block';
                demonEl.style.color = '#ff3333';
            } else {
                demonEl.style.display = 'none';
            }
        }
        
        const eliteBoonEl = document.getElementById('elite-boon-display');
        if (eliteBoonEl) {
            if (this.currentScene === SCENE_TYPES.TOWER && this.player.eliteBoons && this.player.eliteBoons.length && typeof getEliteBoonMeta === 'function') {
                const parts = this.player.eliteBoons.map(b => {
                    const m = getEliteBoonMeta(b.id);
                    const st = b.stacks > 1 ? '×' + b.stacks : '';
                    return m.name + st;
                });
                eliteBoonEl.textContent = '精英加护：' + parts.join(' · ');
                eliteBoonEl.style.display = 'block';
            } else {
                eliteBoonEl.style.display = 'none';
            }
        }
        
        const fusionTowerEl = document.getElementById('fusion-tower-status');
        if (fusionTowerEl) {
            if (this.currentScene === SCENE_TYPES.TOWER && this.fusionState) {
                fusionTowerEl.style.display = 'block';
                if (this.fusionState.phase === 'processing') {
                    fusionTowerEl.textContent = '合铸中 ' + this._formatFusionRemainMs(this.fusionState.readyAt - Date.now());
                    fusionTowerEl.style.color = '#cccccc';
                } else if (this.fusionState.phase === 'ready') {
                    fusionTowerEl.textContent = '合铸完成';
                    fusionTowerEl.style.color = '#ffdd44';
                } else {
                    fusionTowerEl.style.display = 'none';
                }
            } else {
                fusionTowerEl.style.display = 'none';
            }
        }
    }
    
    /**
     * 更新背包界面的详细属性显示
     */
    updateInventoryStats() {
        const statsPanel = document.getElementById('player-stats-panel');
        if (!statsPanel) return;
        
        // 更新基础属性
        const combatPowerEl = document.getElementById('stats-combat-power');
        if (combatPowerEl) {
            combatPowerEl.textContent = this.player.combatPower;
        }
        
        const maxHpEl = document.getElementById('stats-max-hp');
        if (maxHpEl) {
            maxHpEl.textContent = this.player.maxHp;
        }
        
        const attackEl = document.getElementById('stats-attack');
        if (attackEl) {
            attackEl.textContent = this.player.baseAttack;
        }
        
        const defenseEl = document.getElementById('stats-defense');
        if (defenseEl) {
            defenseEl.textContent = this.player.baseDefense;
        }
        
        const critRateEl = document.getElementById('stats-crit-rate');
        if (critRateEl) {
            critRateEl.textContent = this.player.baseCritRate + '%';
        }
        
        const critDamageEl = document.getElementById('stats-crit-damage');
        if (critDamageEl) {
            critDamageEl.textContent = this.player.baseCritDamage + '%';
        }
        
        const dodgeEl = document.getElementById('stats-dodge');
        if (dodgeEl) {
            dodgeEl.textContent = this.player.baseDodge + '%';
        }
        
        const attackSpeedEl = document.getElementById('stats-attack-speed');
        if (attackSpeedEl) {
            attackSpeedEl.textContent = this.player.baseAttackSpeed + '%';
        }
        
        const moveSpeedEl = document.getElementById('stats-move-speed');
        if (moveSpeedEl) {
            // 计算移动速度百分比（相对于基础速度）
            const moveSpeedPercent = Math.round((this.player.baseMoveSpeed / CONFIG.PLAYER_SPEED) * 100);
            moveSpeedEl.textContent = moveSpeedPercent + '%';
        }
        
        const visionEl = document.getElementById('stats-vision');
        if (visionEl) {
            visionEl.textContent = this.player.vision;
        }
        
        // 更新套装效果
        const setEffectsList = document.getElementById('stats-set-effects-list');
        if (setEffectsList && typeof getActiveSetEffects === 'function') {
            const active = getActiveSetEffects(this.player.equipment);
            if (active.length > 0) {
                // 只显示每个套装激活的最高件数效果
                const highestEffects = new Map();
                active.forEach(e => {
                    const current = highestEffects.get(e.setId);
                    if (!current || e.pieceCount > current.pieceCount) {
                        highestEffects.set(e.setId, e);
                    }
                });
                
                // 清空容器
                setEffectsList.innerHTML = '';
                
                // 为每个套装效果创建可悬停的元素
                Array.from(highestEffects.values()).forEach(e => {
                    const effectDiv = document.createElement('div');
                    effectDiv.className = 'set-effect-line';
                    effectDiv.textContent = `${e.setName} ${e.pieceCount}件`;
                    effectDiv.style.cursor = 'pointer';
                    effectDiv.style.marginBottom = '5px';
                    effectDiv.style.color = '#33ff33';
                    effectDiv.dataset.setId = e.setId;
                    effectDiv.dataset.pieceCount = e.pieceCount;
                    
                    // 添加鼠标事件
                    let hideTooltipTimeout = null;
                    effectDiv.addEventListener('mouseenter', (event) => {
                        if (hideTooltipTimeout) {
                            clearTimeout(hideTooltipTimeout);
                            hideTooltipTimeout = null;
                        }
                        this.showSetEffectTooltip(e.setId, e.pieceCount, event.clientX, event.clientY);
                    });
                    effectDiv.addEventListener('mouseleave', () => {
                        hideTooltipTimeout = setTimeout(() => {
                            this.tooltipManager.hideItemTooltip();
                            hideTooltipTimeout = null;
                        }, 100);
                    });
                    effectDiv.addEventListener('mousemove', (event) => {
                        if (hideTooltipTimeout) {
                            clearTimeout(hideTooltipTimeout);
                            hideTooltipTimeout = null;
                        }
                        this.showSetEffectTooltip(e.setId, e.pieceCount, event.clientX, event.clientY);
                    });
                    
                    setEffectsList.appendChild(effectDiv);
                });
            } else {
                setEffectsList.innerHTML = '<span style="color: #666;">无</span>';
            }
        }
    }

    /**
     * 根据技能名返回技能图标 URL（若已配置且存在则返回，否则返回 null）
     * @param {string} skillName - 技能名称
     * @returns {string|null}
     */
    getSkillIconUrl(skillName) {
        if (typeof SKILL_ICON_MAP === 'undefined' || !skillName || !SKILL_ICON_MAP[skillName]) return null;
        
        // 优先 mappings（部署后多为 asset 根目录下的混淆文件名）；否则用 SKILL_ICON_MAP
        let imageName = SKILL_ICON_MAP[skillName];
        const fromMappings = typeof MAPPINGS !== 'undefined' && MAPPINGS.skill_icons && MAPPINGS.skill_icons[skillName];
        if (fromMappings) {
            imageName = MAPPINGS.skill_icons[skillName];
        } else if (imageName && !imageName.includes('/')) {
            // 仅文件名时默认在 skill_icons/（远程技能等只存在于此目录；近战部分在根目录也有副本）
            imageName = 'skill_icons/' + imageName;
        }
        
        // imageName 为相对 asset 的路径，如 skill_icons/xxx.png 或 xxx.png
        const base = window.location.protocol === 'file:' ? 'asset/' : (window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'asset/');
        return base + imageName;
    }

    /**
     * 根据增幅键（如 attack, defense）返回增幅图标 URL（若已配置则返回，否则返回 null）
     * @param {string} effectKey - 增幅键，与 BUFF_ICON_MAP 的 key 一致
     * @returns {string|null}
     */
    getBuffIconUrl(effectKey) {
        if (typeof BUFF_ICON_MAP === 'undefined' || !effectKey || !BUFF_ICON_MAP[effectKey]) return null;
        const base = window.location.protocol === 'file:' ? 'asset/' : (window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'asset/');
        return base + BUFF_ICON_MAP[effectKey];
    }

    /**
     * 创建通用的物品图标元素（统一处理边框和背景图片）
     * @param {Object} item - 物品对象（装备、材料、消耗品等）
     * @param {Object} options - 配置选项
     * @param {number} options.size - 图标尺寸（默认50px）
     * @param {string} options.className - 额外的CSS类名
     * @param {Object} options.style - 额外的样式对象（注意：不要设置border相关属性，函数内部会统一处理）
     * @param {number} options.borderWidth - 边框宽度（默认2px）
     * @param {string} options.borderRadius - 边框圆角（默认5px）
     * @returns {HTMLElement} 图标元素
     */
    createItemIcon(item, options = {}) {
        const {
            size = 50,
            className = '',
            style = {},
            borderWidth = 2,
            borderRadius = '5px'
        } = options;
        
        const iconDiv = document.createElement('div');
        const qualityColor = QUALITY_COLORS[item.quality] || '#ffffff';
        
        // 基础样式（边框由函数统一处理）
        iconDiv.style.width = `${size}px`;
        iconDiv.style.height = `${size}px`;
        iconDiv.style.border = `${borderWidth}px solid ${qualityColor}`;
        iconDiv.style.borderRadius = borderRadius;
        iconDiv.style.flexShrink = '0';
        // 根据品质设置背景色，使用更高的不透明度让背景更明显
        const qualityBgOpacity = {
            'common': '40',
            'rare': '50',
            'fine': '60',
            'epic': '70',
            'legendary': '80'
        };
        iconDiv.style.backgroundColor = qualityColor + (qualityBgOpacity[item.quality] || '40'); // 品质背景色
        
        // 应用额外样式（但排除border相关属性，避免覆盖）
        // 注意：如果style中明确设置了border，则使用该值（用于特殊情况，如未拥有装备时的灰色边框）
        if (style.border) {
            iconDiv.style.border = style.border;
        }
        const { border, borderColor, borderWidth: _, borderStyle, ...otherStyles } = style;
        Object.assign(iconDiv.style, otherStyles);
        
        // 应用额外类名
        if (className) {
            iconDiv.className = className;
        }
        
        // 根据物品类型设置背景图片
        // 优先使用缓存，避免不必要的异步请求
        if (item.type === 'equipment' && item.name) {
            const imageName = this.assetManager.getEquipmentImageName(item.name, item);
            if (imageName && this.assetManager.equipmentImageCache.has(imageName)) {
                // 缓存存在，直接同步设置
                const imageUrl = this.assetManager.equipmentImageCache.get(imageName);
                iconDiv.style.backgroundImage = `url(${imageUrl})`;
                iconDiv.style.backgroundPosition = 'center';
                iconDiv.style.backgroundRepeat = 'no-repeat';
                if (imageUrl.startsWith('data:')) {
                    iconDiv.style.backgroundSize = 'contain';
                } else {
                    iconDiv.style.backgroundSize = '90%';
                }
            } else {
                // 缓存不存在，异步加载
                this.assetManager.setEquipmentBackgroundImage(iconDiv, item.name, item.quality, item);
            }
        } else if ((item.type === 'material' || item.type === 'alchemy') && item.name) {
            const imageName = this.assetManager.getAlchemyMaterialImageName(item.name);
            if (imageName && this.assetManager.alchemyMaterialImageCache.has(imageName)) {
                // 缓存存在，直接同步设置
                const imageUrl = this.assetManager.alchemyMaterialImageCache.get(imageName);
                iconDiv.style.backgroundImage = `url(${imageUrl})`;
                iconDiv.style.backgroundPosition = 'center';
                iconDiv.style.backgroundRepeat = 'no-repeat';
                if (imageUrl.startsWith('data:')) {
                    iconDiv.style.backgroundSize = 'contain';
                } else {
                    iconDiv.style.backgroundSize = 'cover';
                }
            } else {
                // 缓存不存在，异步加载
                this.assetManager.setAlchemyMaterialBackgroundImage(iconDiv, item.name, 'cover');
            }
        } else if (item.type === 'consumable' && item.consumableType === 'recipe' && item.name) {
            // 图纸从 mappings 中读取图片
            const imageName = (typeof MAPPINGS !== 'undefined' && MAPPINGS.consumable && MAPPINGS.consumable.blueprint) 
                ? MAPPINGS.consumable.blueprint 
                : 'blueprint.png';
            const base = window.location.protocol === 'file:' ? 'asset/' : (window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'asset/');
            iconDiv.style.backgroundImage = `url(${base}${imageName})`;
            iconDiv.style.backgroundSize = 'cover';
            iconDiv.style.backgroundPosition = 'center';
            iconDiv.style.backgroundRepeat = 'no-repeat';
            // 根据品质设置背景色
            const qualityColors = {
                'common': 'rgba(200, 200, 200, 0.4)',
                'uncommon': 'rgba(100, 200, 100, 0.4)',
                'rare': 'rgba(100, 150, 255, 0.4)',
                'fine': 'rgba(100, 150, 255, 0.4)',
                'epic': 'rgba(200, 100, 255, 0.4)',
                'legendary': 'rgba(255, 200, 100, 0.4)'
            };
            iconDiv.style.backgroundColor = qualityColors[item.quality] || qualityColors['common'];
        }
        
        return iconDiv;
    }
    
    /**
     * 更新装备栏品质边框和背景色（只应用到装备图标，不覆盖文字标签）
     */
    updateEquipmentSlotBorders() {
        const slots = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'necklace', 'ring', 'belt'];
        slots.forEach(slotName => {
            const slotElement = document.querySelector(`.equipment-item[data-slot="${slotName}"]`);
            if (slotElement) {
                const equipment = this.player.equipment[slotName];
                if (equipment && equipment.quality) {
                    const qualityColor = QUALITY_COLORS[equipment.quality] || '#666';
                    // 边框只应用到装备图标本身，不覆盖文字标签
                    slotElement.style.border = `3px solid ${qualityColor}`;
                    slotElement.style.borderRadius = '5px';
                    // 添加品质背景色
                    const qualityBgOpacity = {
                        'common': '40',
                        'rare': '50',
                        'fine': '60',
                        'epic': '70',
                        'legendary': '80'
                    };
                    slotElement.style.backgroundColor = qualityColor + (qualityBgOpacity[equipment.quality] || '40');
                } else {
                    slotElement.style.border = '2px solid #666';
                    slotElement.style.borderRadius = '5px';
                    slotElement.style.backgroundColor = '#333'; // 默认背景色
                }
            }
        });
    }
    
    /**
     * 更新武器技能按钮显示
     */
    updateWeaponSkillButton() {
        const wrapper = document.getElementById('weapon-skill-wrapper');
        const skillBtn = document.getElementById('weapon-skill-btn');
        const skillName = document.getElementById('weapon-skill-name');
        const skillCooldown = document.getElementById('weapon-skill-cooldown');
        
        const weapon = this.player.equipment.weapon;
        
        if (weapon && weapon.skill) {
            if (wrapper) wrapper.style.display = 'flex';
            skillName.textContent = weapon.skill.name;
            // 若有技能图标配置则显示图标（正方形按钮内 cover 显示）
            const iconUrl = this.getSkillIconUrl(weapon.skill.name);
            if (iconUrl) {
                skillBtn.style.backgroundImage = `url(${iconUrl})`;
                skillBtn.style.backgroundSize = 'cover';
                skillBtn.style.backgroundPosition = 'center';
            } else {
                skillBtn.style.backgroundImage = '';
            }
            
            const now = Date.now();
            const remainingCooldown = Math.max(0, this.player.weaponSkillCooldown - now);
            
            if (remainingCooldown > 0) {
                const seconds = Math.ceil(remainingCooldown / 1000);
                skillCooldown.textContent = `冷却: ${seconds}秒`;
                skillBtn.disabled = true;
                skillBtn.style.opacity = '0.5';
                skillBtn.style.cursor = 'not-allowed';
            } else {
                const ground = typeof this.player.resolveGroundAoeSkillRanges === 'function' && this.player.resolveGroundAoeSkillRanges();
                const lock = typeof this.player.resolveTargetLockSkillRange === 'function' && this.player.resolveTargetLockSkillRange();
                let hint = '按Q释放';
                if (ground) hint = '长按瞄准落点，松手释放';
                else if (lock) hint = '长按选择锁定，松手释放';
                skillCooldown.textContent = hint;
                skillBtn.disabled = false;
                skillBtn.style.opacity = '1';
                skillBtn.style.cursor = 'pointer';
            }
        } else {
            if (wrapper) wrapper.style.display = 'none';
        }
    }

    handleInput() {
        try {
            // 如果游戏暂停，不处理输入
            if (this.paused) {
                return;
            }
            
            // 如果正在释放技能，禁用所有输入
            if (this.player.isCastingSkill) {
                return;
            }
            
            let dx = 0;
            let dy = 0;
            
            // WASD移动
            if (this.keys['w']) dy -= 1;
            if (this.keys['s']) dy += 1;
            if (this.keys['a']) dx -= 1;
            if (this.keys['d']) dx += 1;
            
            // 方向键移动
            if (this.keys['ArrowUp']) dy -= 1;
            if (this.keys['ArrowDown']) dy += 1;
            if (this.keys['ArrowLeft']) dx -= 1;
            if (this.keys['ArrowRight']) dx += 1;
            
            // 归一化对角线移动
            if (dx !== 0 && dy !== 0) {
                dx *= 0.707;
                dy *= 0.707;
            }
            
            // 检查k键（冲刺键）
            const kPressed = this.keys['k'];
            
            // 如果按下k键且不在冲刺状态，触发冲刺
            if (kPressed && !this.player.isDashing && this.player.dashCooldown <= 0) {
                this.player.dash(dx, dy);
            }
            
            // 无论是否冲刺，都要调用move来执行移动
            // move函数内部会根据isDashing状态决定使用冲刺速度还是正常速度
            this.player.move(dx, dy);
            
            // 攻击：J键或鼠标左键
            const attackPressed = this.keys['j'] || this.mouse.left;
            if (attackPressed && !this.player.isDashing) {
                if (this.currentScene === SCENE_TYPES.TOWER && this.currentRoom && (this.currentRoom.type === ROOM_TYPES.BATTLE || this.currentRoom.type === ROOM_TYPES.ELITE || this.currentRoom.type === ROOM_TYPES.BOSS)) {
                    this.player.attack(this.currentRoom.monsters);
                } else if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) {
                    this.player.attack(this.trainingGroundScene.dummies);
                }
            }
        } catch (error) {
            console.error('输入处理出错:', error, error.stack);
            // 确保即使出错也能继续处理输入
            // 不要阻止其他按键的处理
        }
    }

    /**
     * 添加飘浮文字提示
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {string} text - 文字内容
     * @param {string} color - 文字颜色
     * @param {number} duration - 持续时间（毫秒）
     */
    addFloatingText(x, y, text, color = '#ffffff', duration = 2000, fontSize = 18, fixedPosition = false, direction = null) {
        // 计算初始偏移量
        if (fixedPosition) {
            // 对于固定位置的文字（如伤害数字），不计算偏移量，让它们可以重合
            const initialOffsetY = 0; // 伤害数字从同一位置开始，可以重合
            this.floatingTexts.push(new FloatingText(x, y, text, color, duration, initialOffsetY, fontSize, fixedPosition, direction));
        } else {
            // 对于跟随玩家的文字（如掉落物提示），计算偏移量让它们错开显示
            const existingCount = this.floatingTexts.filter(t => !t.fixedPosition).length;
            // 增加掉落物文字提示的间距，从15像素增加到30像素
            const initialOffsetY = -existingCount * 30; // 每个文字间隔30像素
            this.floatingTexts.push(new FloatingText(x, y, text, color, duration, initialOffsetY, fontSize, fixedPosition, direction));
        }
    }

    // ====================================================================
    // 游戏循环方法组
    // ====================================================================

    /**
     * 游戏主循环更新方法
     * 处理输入、更新游戏状态、检查交互等
     */
    update() {
        try {
            // 如果游戏暂停，只更新飘浮文字和UI，不更新游戏逻辑
            if (this.paused) {
                this.cancelWeaponSkillAim();
                // 更新飘浮文字（让它们继续显示）
                this.floatingTexts = this.floatingTexts.filter(text => {
                    if (text.fixedPosition) {
                        // 固定位置的文字，传入null作为玩家位置（不会被使用）
                        return !text.update(null, null);
                    } else {
                        // 跟随玩家的文字，传入玩家位置
                        // 确保玩家位置有效，避免NaN导致文字消失
                        const playerX = (this.player && this.player.x !== undefined && !isNaN(this.player.x)) ? this.player.x : text.baseX || CONFIG.CANVAS_WIDTH / 2;
                        const playerY = (this.player && this.player.y !== undefined && !isNaN(this.player.y)) ? this.player.y - this.player.size / 2 - 20 : text.baseY || CONFIG.CANVAS_HEIGHT / 2;
                        return !text.update(playerX, playerY);
                    }
                });
                // 更新HUD
                this.updateHUD();
                return;
            }
            
            // 更新玩家
            this.handleInput();
            this.updateWeaponSkillAimState();
            
            // 保存当前E键状态（用于检测按键按下事件，而不是持续按住）
            const currentEKeyState = this.keys['e'] || false;
            // 检查是否在场景切换后的3秒冷却期内
            const now = Date.now();
            const timeSinceTransition = now - this.lastSceneTransitionTime;
            const canInteract = timeSinceTransition >= 3000; // 3秒冷却
            const eKeyPressed = currentEKeyState && !this.lastEKeyState && canInteract; // 检测按键按下事件，且不在冷却期内
            
            // 更新相机位置，使玩家永远居中
            // 相机偏移量 = 玩家位置 - 屏幕中心
            this.cameraX = this.player.x - CONFIG.CANVAS_WIDTH / 2;
            this.cameraY = this.player.y - CONFIG.CANVAS_HEIGHT / 2;
            
            // 更新飘浮文字
            // 对于固定位置的文字（如伤害数字），不需要传入玩家位置
            this.floatingTexts = this.floatingTexts.filter(text => {
                if (text.fixedPosition) {
                    // 固定位置的文字，传入null作为玩家位置（不会被使用）
                    return !text.update(null, null);
                } else {
                    // 跟随玩家的文字，传入玩家位置
                    // 确保玩家位置有效，避免NaN导致文字消失
                    const playerX = (this.player && this.player.x !== undefined && !isNaN(this.player.x)) ? this.player.x : text.baseX || CONFIG.CANVAS_WIDTH / 2;
                    const playerY = (this.player && this.player.y !== undefined && !isNaN(this.player.y)) ? this.player.y - this.player.size / 2 - 20 : text.baseY || CONFIG.CANVAS_HEIGHT / 2;
                    return !text.update(playerX, playerY);
                }
            });
            
            // 更新粒子系统
            const deltaTime = performance.now() - this.lastFrameTime;
            this.particleManager.update(deltaTime);
            this._updateFusionWeaponParticles(Date.now());
            this.lastFrameTime = performance.now();
            
            // 更新玩家buff（移除过期的buff并更新属性）
            const oldBuffCount = this.player.buffs.length;
            this.player.updateStats(); // 这会自动清理过期的buff
            
            // 更新持续伤害效果
            if (this.player.weaponSkillDots && this.player.weaponSkillDots.length > 0) {
                const now = Date.now();
                this.player.weaponSkillDots = this.player.weaponSkillDots.filter(dot => {
                // 检查目标是怪物还是训练桩
                const isDummy = dot.monster instanceof TrainingDummy || dot.monster instanceof MonsterTrainingDummy;
                if (!isDummy && dot.monster.hp <= 0) return false; // 怪物已死，移除dot
                
                const elapsed = now - dot.lastTick;
                if (elapsed >= 1000) { // 每秒造成一次伤害
                    const damage = dot.damagePerSecond;
                    if (this.player && typeof this.player.damageMonsterFromEnvironment === 'function') {
                        this.player.damageMonsterFromEnvironment(dot.monster, damage);
                    } else {
                        dot.monster.takeDamage(damage);
                    }
                    dot.lastTick = now;
                    
                    this.addFloatingText(
                        dot.monster.x,
                        dot.monster.y,
                        `持续伤害: ${Math.floor(damage)}`,
                        '#ff6600',
                        2000,
                        18,
                        true
                    );
                }
                
                return (now - dot.startTime) < dot.duration; // 持续时间未到
                });
            }
            
            // 更新怪物持续伤害效果（词条造成的）
            if (this.currentRoom && this.currentRoom.monsters) {
                const now = Date.now();
                this.currentRoom.monsters.forEach(monster => {
                if (monster.hp > 0 && monster.burningDots && monster.burningDots.length > 0) {
                    monster.burningDots = monster.burningDots.filter(dot => {
                        const elapsed = now - dot.lastTick;
                        if (elapsed >= 1000) {
                            const damage = dot.damagePerSecond;
                            if (this.player && typeof this.player.damageMonsterFromEnvironment === 'function') {
                                this.player.damageMonsterFromEnvironment(monster, damage);
                            } else {
                                monster.takeDamage(damage);
                            }
                            dot.lastTick = now;
                            this.addFloatingText(
                                monster.x,
                                monster.y,
                                `燃烧! ${Math.floor(damage)}`,
                                '#ff4400',
                                2000,
                                18,
                                true
                            );
                        }
                        return (now - dot.startTime) < dot.duration;
                    });
                }
                });
            }
            
            // 更新打造装备特效（在draw中自动清理过期特效）
            
            // 更新移动轨迹效果
            if (this.player.traitTrails && this.player.traitTrails.length > 0) {
                const now = Date.now();
                this.player.traitTrails = this.player.traitTrails.filter(trail => {
                return (now - trail.startTime) < trail.duration;
            });
            
            // 检查轨迹对怪物的伤害（每0.15秒检查一次，加快判定）
            if (!this.lastTrailDamageCheck) this.lastTrailDamageCheck = 0;
            if (now - this.lastTrailDamageCheck >= 150) { // 每150ms检查一次
                this.lastTrailDamageCheck = now;
                
                // 获取当前场景的所有目标（怪物或训练假人）
                let targets = [];
                if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) {
                    targets = this.trainingGroundScene.dummies;
                } else if (this.currentRoom && this.currentRoom.monsters) {
                    targets = this.currentRoom.monsters;
                }
                
                // 清理超过10秒的足迹（使用上面已经定义的now变量）
                if (this.player.traitTrails) {
                    this.player.traitTrails = this.player.traitTrails.filter(trail => now - trail.startTime < 10000);
                }
                
                // 足迹判定半径（更宽，与绘制线宽一致）
                const TRAIL_HIT_RADIUS = 40;
                // 同一怪物在足迹上只受一次伤害的冷却时间，避免倒走重叠时重复判定
                const TRAIL_DAMAGE_COOLDOWN_MS = 1200;
                
                targets.forEach(monster => {
                    const isDummy = monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy;
                    if (!isDummy && monster.hp <= 0) return;
                    // 检查怪物是否站在任意一段足迹上（最近距离小于判定半径）
                    let inTrail = false;
                    let closestDamage = 0;
                    let trailColor = '#9900ff';
                    for (let i = 0; i < this.player.traitTrails.length; i++) {
                        const trail = this.player.traitTrails[i];
                        const dx = monster.x - trail.x;
                        const dy = monster.y - trail.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance <= TRAIL_HIT_RADIUS) {
                            inTrail = true;
                            if (trail.damage > closestDamage) closestDamage = trail.damage;
                            trailColor = trail.type === 'fire' ? '#ff4400' : '#9900ff';
                        }
                    }
                    if (!inTrail || closestDamage <= 0) return;
                    // 每只怪物在足迹伤害上有冷却，避免重叠/倒走时重复判定
                    if (!monster.lastTrailDamageTime) monster.lastTrailDamageTime = 0;
                    if (now - monster.lastTrailDamageTime < TRAIL_DAMAGE_COOLDOWN_MS) return;
                    monster.lastTrailDamageTime = now;
                    if (this.player && typeof this.player.damageMonsterFromEnvironment === 'function') {
                        this.player.damageMonsterFromEnvironment(monster, closestDamage);
                    } else {
                        monster.takeDamage(closestDamage);
                    }
                    this.addFloatingText(monster.x, monster.y, `轨迹! ${closestDamage}`, trailColor, 2000, 18, true);
                });
            }
            }
            
            // 处理龙心垂饰词条：低血量时每秒恢复生命值
            const traitIds = this.player.getEquipmentTraitIds();
            if (traitIdsIncludeBase(traitIds, 'dragon_heart') && this.player.hp < this.player.maxHp * 0.3) {
                const now = Date.now();
                if (!this.player.lastDragonHeartHeal) this.player.lastDragonHeartHeal = 0;
                if (now - this.player.lastDragonHeartHeal >= 1000) {
                const healAmount = Math.floor(this.player.maxHp * 0.05);
                this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                this.player.lastDragonHeartHeal = now;
                this.addFloatingText(this.player.x, this.player.y, `龙心! +${healAmount}`, '#00ff00');
                }
            }
            
            // 处理永恒神威词条（胸甲）：每秒恢复1%最大生命值
            if (traitIdsIncludeBase(traitIds, 'eternal_divine') || traitIdsIncludeBase(traitIds, 'eternal')) {
                const now = Date.now();
                if (!this.player.lastEternalHeal) this.player.lastEternalHeal = 0;
                if (now - this.player.lastEternalHeal >= 1000) {
                    const healAmount = Math.floor(this.player.maxHp * 0.01);
                    this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                    this.player.lastEternalHeal = now;
                }
            }
            // 处理永恒战甲词条（胸甲）：每秒恢复2%最大生命值
            if (traitIdsIncludeBase(traitIds, 'eternal_armor')) {
                const now = Date.now();
                if (!this.player.lastEternalArmorHeal) this.player.lastEternalArmorHeal = 0;
                if (now - this.player.lastEternalArmorHeal >= 1000) {
                    const healAmount = Math.floor(this.player.maxHp * 0.02);
                    this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                    this.player.lastEternalArmorHeal = now;
                }
            }
            
            // 星辰套装8件：战斗中每秒恢复1%最大生命值（已移除致命免疫）
            if (this.player.setSpecialEffects) {
                for (const [setId, setEffect] of Object.entries(this.player.setSpecialEffects)) {
                const setData = SET_DEFINITIONS[setId];
                if (!setData) continue;
                
                const effect = setData.effects[setEffect.pieceCount];
                if (
                    effect &&
                    (effect.special === 'starRegen' || effect.special === 'killHealAndRegen') &&
                    (setEffect.pieceCount === 8 || setEffect.pieceCount === 4)
                ) {
                    const now = Date.now();
                    if (!this.player.lastStarUltimateHeal) this.player.lastStarUltimateHeal = 0;
                    if (now - this.player.lastStarUltimateHeal >= 1000) {
                        let pct = 0.01;
                        if (typeof effect.starRegenPercent === 'number' && effect.starRegenPercent > 0) {
                            pct = effect.starRegenPercent;
                        } else if (effect.special === 'killHealAndRegen') {
                            pct = 0.005;
                        }
                        const healAmount = Math.floor(this.player.maxHp * pct);
                        this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                        this.player.lastStarUltimateHeal = now;
                    }
                    break; // 只处理一次
                }
                }
            }

            if (this.player.setSpecialEffects && typeof this.player.tickDeepSetPeriodicEffects === 'function') {
                this.player.tickDeepSetPeriodicEffects(this);
            }
            
            // 处理游侠词条：脱离战斗后恢复生命值
            if (traitIdsIncludeBase(traitIds, 'ranger')) {
                const now = Date.now();
                if (!this.player.lastCombatTime) this.player.lastCombatTime = 0;
                if (now - this.player.lastCombatTime > 5000 && this.player.hp < this.player.maxHp) {
                    if (!this.player.lastRangerHeal) this.player.lastRangerHeal = 0;
                    if (now - this.player.lastRangerHeal >= 2000) {
                        const healAmount = Math.floor(this.player.maxHp * 0.02);
                        this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                        this.player.lastRangerHeal = now;
                    }
                }
            }
            
            // 处理旅人词条：脱离战斗后恢复生命值（每3秒恢复3%最大生命值）
            if (traitIdsIncludeBase(traitIds, 'traveler')) {
                const now = Date.now();
                if (!this.player.lastCombatTime) this.player.lastCombatTime = 0;
                if (now - this.player.lastCombatTime > 5000 && this.player.hp < this.player.maxHp) {
                    if (!this.player.lastTravelerHeal) this.player.lastTravelerHeal = 0;
                    if (now - this.player.lastTravelerHeal >= 3000) {
                        const healAmount = Math.floor(this.player.maxHp * 0.03);
                        this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                        this.player.lastTravelerHeal = now;
                    }
                }
            }

            if (typeof traitIdsIncludeBase === 'function' && traitIdsIncludeBase(traitIds, 'void_n_well')) {
                const now = Date.now();
                const tw = voidTraitTierFromList(traitIds, 'void_n_well');
                const wb = typeof deepTraitBand === 'function' ? deepTraitBand(tw) : 0;
                let wellTick = 3000 - 80 * tw;
                if (wb >= 1) wellTick = Math.max(1600, wellTick - 60 - 25 * wb);
                let wellPct = (0.85 + 0.12 * tw) / 100;
                if (wb >= 2) wellPct *= 1 + 0.06 + 0.04 * wb;
                if (!this.player.lastCombatTime) this.player.lastCombatTime = 0;
                if (now - this.player.lastCombatTime < 8000 && this.player.hp < this.player.maxHp) {
                    if (!this.player.lastVoidWellHeal) this.player.lastVoidWellHeal = 0;
                    if (now - this.player.lastVoidWellHeal >= wellTick) {
                        const healAmount = Math.floor(this.player.maxHp * wellPct);
                        this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                        this.player.lastVoidWellHeal = now;
                        if (wb >= 1) {
                            this.player.buffs = this.player.buffs || [];
                            this.player.buffs.push({
                                effects: { attackSpeed: Math.floor((this.player.baseAttackSpeed || 100) * (0.04 + 0.015 * wb)) },
                                expireTime: now + 3200
                            });
                            if (typeof this.player.updateStats === 'function') this.player.updateStats();
                        }
                        if (wb >= 3 && typeof this.player.damageMonsterFromEnvironment === 'function') {
                            this.player.voidWellStrike = (this.player.voidWellStrike || 0) + 1;
                            if (this.player.voidWellStrike % 4 === 0) {
                                const targets = this.getCurrentSceneTargets();
                                let pick = null;
                                let best = 1e9;
                                targets.forEach(m => {
                                    if (!m || m.hp <= 0) return;
                                    const dx = m.x - this.player.x;
                                    const dy = m.y - this.player.y;
                                    const d2 = dx * dx + dy * dy;
                                    if (d2 < best && d2 < 140 * 140) {
                                        best = d2;
                                        pick = m;
                                    }
                                });
                                if (pick) {
                                    const wd = Math.floor((this.player.baseAttack || 0) * (0.16 + 0.02 * tw));
                                    if (wd > 0) {
                                        this.player.damageMonsterFromEnvironment(pick, wd);
                                        this.addFloatingText(pick.x, pick.y, `井涌 ${wd}`, '#99ddff', 1400, 14, true);
                                    }
                                }
                            }
                        }
                    }
                }
            } else if (traitIdsIncludeBase(traitIds, 'void_n_well')) {
                const now = Date.now();
                if (!this.player.lastCombatTime) this.player.lastCombatTime = 0;
                if (now - this.player.lastCombatTime < 8000 && this.player.hp < this.player.maxHp) {
                    if (!this.player.lastVoidWellHeal) this.player.lastVoidWellHeal = 0;
                    if (now - this.player.lastVoidWellHeal >= 3000) {
                        const healAmount = Math.floor(this.player.maxHp * 0.01);
                        this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
                        this.player.lastVoidWellHeal = now;
                    }
                }
            }
            
            if (oldBuffCount !== this.player.buffs.length) {
                // buff数量变化，更新HUD
                this.updateHUD();
            }
            
            // 更新技能按钮（每帧更新以显示冷却时间）
            this.updateWeaponSkillButton();
            
            // 根据当前场景更新
            if (this.currentScene === SCENE_TYPES.TOWN) {
                // 主城场景
                this.updateTown();
                // 检查主城交互提示
                const interactions = this.townScene.checkInteraction(this.player);
                this.currentInteraction = interactions.length > 0 ? {
                    type: 'building',
                    object: interactions[0],
                    x: interactions[0].x,
                    y: interactions[0].y - interactions[0].size / 2 - 30
                } : null;
            } else if (this.currentScene === SCENE_TYPES.TRAINING) {
                // 训练场场景
                this.updateTrainingGround();
                // 检查训练场交互提示
                const interactions = this.trainingGroundScene.checkInteraction(this.player);
                this.currentInteraction = interactions.length > 0 ? {
                    type: 'portal',
                    object: interactions[0],
                    x: interactions[0].x,
                    y: interactions[0].y - interactions[0].size / 2 - 30
                } : null;
            } else if (this.currentScene === SCENE_TYPES.TOWER) {
                // 恶魔塔场景
                if (this.currentRoom) {
                    this.currentRoom.update(this.player);
                    this.player._towerSilenceAttackCdMult = 1;
                    if (this.currentRoom.monsters) {
                        for (let mi = 0; mi < this.currentRoom.monsters.length; mi++) {
                            const m = this.currentRoom.monsters[mi];
                            if (!m || m.hp <= 0 || !m._silenceAura) continue;
                            const sdx = m.x - this.player.x;
                            const sdy = m.y - this.player.y;
                            const sr = m._silenceAura.range;
                            if (sdx * sdx + sdy * sdy <= sr * sr) {
                                const mult = m._silenceAura.playerAttackCdMult;
                                if (mult > this.player._towerSilenceAttackCdMult) this.player._towerSilenceAttackCdMult = mult;
                            }
                        }
                    }
                    this.updateGroundHazards();
                    this.updatePendingMonsterAoE();
                    this.updateSoulCircles();
                // 检查房间交互提示
                if (this.portals.length > 0) {
                    // 检查传送门交互
                    let nearestPortal = null;
                    let minDistance = Infinity;
                    this.portals.forEach(portal => {
                        const dx = portal.x - this.player.x;
                        const dy = portal.y - this.player.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance < 50 && distance < minDistance) {
                            minDistance = distance;
                            nearestPortal = portal;
                        }
                    });
                    if (nearestPortal) {
                        this.currentInteraction = {
                            type: 'portal',
                            object: nearestPortal,
                            x: nearestPortal.x,
                            y: nearestPortal.y - nearestPortal.size / 2 - 40
                        };
                    } else {
                        this.currentInteraction = this.currentRoom.checkInteraction(this.player, this.portals);
                    }
                } else {
                    this.currentInteraction = this.currentRoom.checkInteraction(this.player, this.portals);
                }
                
                // 更新掉落物（检查拾取）
                this.droppedItems = this.droppedItems.filter(item => {
                    return !item.update(this); // update返回true表示已拾取，需要移除
                });
            
                // 检查房间交互
                if (this.currentRoom.type === ROOM_TYPES.BATTLE || this.currentRoom.type === ROOM_TYPES.ELITE || this.currentRoom.type === ROOM_TYPES.BOSS) {
                    // 怪物攻击玩家
                    let playerDied = false;
                    this.currentRoom.monsters.forEach(monster => {
                        if (monster.hp > 0 && monster.attack(this.player)) {
                            const md = (monster._pendingMeleeDamageMult != null && monster._pendingMeleeDamageMult > 0) ? monster._pendingMeleeDamageMult : 1;
                            const mdmg = Math.max(1, Math.floor(monster.damage * md));
                            monster._pendingMeleeDamageMult = 1;
                            const killed = this.player.takeDamage(mdmg, monster, false);
                            if (typeof applyMonsterOnHitPlayerEffects === 'function') {
                                applyMonsterOnHitPlayerEffects(this.player, monster);
                            }
                            if (killed) playerDied = true;
                        }
                        if (typeof Boss !== 'undefined' && monster instanceof Boss && monster.hp > 0) {
                            const hits = monster.checkSkillHit(this.player);
                            hits.forEach(h => {
                                const killed = this.player.takeDamage(h.damage, monster, false);
                                if (killed) playerDied = true;
                            });
                        }
                    });
                    this.updateMonsterProjectiles();
                    if (this.isPlayerDead) playerDied = true;
                    
                    // 如果玩家死亡，检查是否有神圣十字架
                    if (playerDied) {
                        // 播放死亡音效
                        if (this.soundManager) {
                            this.soundManager.playSound('death');
                        }
                        this.isPlayerDead = true; // 标记玩家死亡
                        let resurrectionItem = this.findResurrectionItem();
                        if (!resurrectionItem && this.player.towerReviveCharges > 0) {
                            resurrectionItem = { towerCharge: true };
                        }
                        if (resurrectionItem) {
                            // 有神圣十字架，询问是否使用
                            this.showResurrectionDialog(resurrectionItem);
                        } else {
                            // 没有神圣十字架，直接返回主城
                            this.returnToTown();
                            this.updateHUD();
                        }
                        return; // 立即返回，避免继续执行后续代码
                    }
                
                // 检查房间是否清空，如果清空则生成传送门
                if (this.currentRoom.cleared && this.portals.length === 0 && !this.isTransitioning) {
                    if (this.currentRoom.type === ROOM_TYPES.ELITE) {
                        const eliteBonusGold = 15 * this.floor;
                        this.gainGold(eliteBonusGold);
                        this.addFloatingText(this.player.x, this.player.y, `精英房奖励 +${eliteBonusGold} 金币`, '#ffd700');
                        this.grantRandomEliteBoon();
                    }
                    if (!this.demonInterferenceActive) {
                        if (this.currentScene === SCENE_TYPES.TOWER && Math.random() < this.demonInterferenceTriggerChance) {
                            this.startDemonInterference();
                        } else {
                            this.generatePortals();
                        }
                    }
                }
                
                // 检查传送门交互（需要按E键）- 适用于所有房间类型
                if (this.portals.length > 0 && !this.isTransitioning && eKeyPressed) {
                    this.portals.forEach(portal => {
                        const dx = portal.x - this.player.x;
                        const dy = portal.y - this.player.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        // 如果玩家在传送门范围内且按了E键，触发传送
                        if (distance < portal.size / 2 + 30) {
                            if (portal.type === 'next' && portal.roomType) {
                                // 设置过渡标志，防止重复触发
                                this.isTransitioning = true;
                                // 进入下一层，使用选择的房间类型
                                this.floor++;
                                this.hasClearedFloor = true; // 标记已通关至少一层
                                this.generateNewRoom(portal.roomType);
                                this.portals = []; // 清空传送门
                                this.isTransitioning = false;
                            } else if (portal.type === 'exit') {
                                // 返回主城
                                this.returnToTown();
                            }
                        }
                    });
                }
            } else if (this.currentRoom.type === ROOM_TYPES.TREASURE && this.currentRoom.treasureChest) {
                // 检查宝箱交互
                const dx = this.currentRoom.treasureChest.x - this.player.x;
                const dy = this.currentRoom.treasureChest.y - this.player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 50 && !this.currentRoom.treasureChest.opened && eKeyPressed) {
                    this.currentRoom.treasureChest.opened = true;
                    // 播放开宝箱音效
                    if (this.soundManager) {
                        this.soundManager.playSound('treasure');
                    }
                    // 给予奖励
                    const allEquipments = generateEquipments();
                    // 过滤掉打造的装备（isCrafted=true），宝箱不能掉落打造的装备
                    const qualityEquipments = allEquipments.filter(eq => 
                        eq.quality === this.currentRoom.treasureChest.quality && !eq.isCrafted
                    );
                    let rewardText = '';
                    let rewardCount = 0;
                    
                    if (qualityEquipments.length > 0) {
                        const randomEq = qualityEquipments[Math.floor(Math.random() * qualityEquipments.length)];
                        // addItemToInventory会显示获得物品的提示
                        this.addItemToInventory(randomEq);
                    }
                    
                    const goldAmount = 10 + this.floor * 5;
                    const expAmount = 20 + this.floor * 5;
                    this.gainGold(goldAmount);
                    this.gainExp(expAmount);
                    
                    // 显示金币和经验提示（会自动错开显示）
                    this.addFloatingText(this.player.x, this.player.y, `+${goldAmount} 金币`, '#ffd700');
                    this.addFloatingText(this.player.x, this.player.y, `+${expAmount} 经验`, '#00ff00');
                }
                
                // 检查宝箱是否已打开，如果已打开则生成传送门
                if (this.currentRoom.treasureChest.opened && this.portals.length === 0 && !this.isTransitioning) {
                    if (!this.demonInterferenceActive) {
                        if (this.currentScene === SCENE_TYPES.TOWER && Math.random() < this.demonInterferenceTriggerChance) {
                            this.startDemonInterference();
                        } else {
                            this.generatePortals();
                        }
                    }
                }
                
                // 检查传送门交互（宝箱房间，需要按E键）
                if (this.portals.length > 0 && !this.isTransitioning && eKeyPressed) {
                    this.portals.forEach(portal => {
                        const dx = portal.x - this.player.x;
                        const dy = portal.y - this.player.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        // 如果玩家在传送门范围内且按了E键，触发传送
                        if (distance < portal.size / 2 + 30) {
                            if (portal.type === 'next' && portal.roomType) {
                                this.isTransitioning = true;
                                this.floor++;
                                this.hasClearedFloor = true;
                                this.generateNewRoom(portal.roomType);
                                this.portals = [];
                                this.isTransitioning = false;
                            } else if (portal.type === 'exit') {
                                this.returnToTown();
                            }
                        }
                    });
                }
            } else if (this.currentRoom.type === ROOM_TYPES.REST && this.currentRoom.restItem) {
                // 检查休整道具交互
                const dx = this.currentRoom.restItem.x - this.player.x;
                const dy = this.currentRoom.restItem.y - this.player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 50 && !this.currentRoom.restItem.used && eKeyPressed) {
                    this.currentRoom.restItem.used = true;
                    const healAmounts = {
                        campfire: 0.15,
                        medkit: 0.5,
                        fountain: 1.0,
                        altar: 0.75
                    };
                    const healPercent = healAmounts[this.currentRoom.restItem.type] || 0.15;
                    const healAmount = Math.floor(this.player.maxHp * healPercent);
                    const oldHp = this.player.hp;
                    this.player.heal(healAmount);
                    const actualHeal = this.player.hp - oldHp;
                    this.updateHUD();
                    
                    // 显示恢复提示
                    const restNames = {
                        campfire: '篝火',
                        medkit: '医疗箱',
                        fountain: '疗愈之泉',
                        altar: '神圣祭坛'
                    };
                    const restName = restNames[this.currentRoom.restItem.type] || '恢复道具';
                    this.addFloatingText(this.player.x, this.player.y, `使用 ${restName}`, '#00aaff');
                    this.addFloatingText(this.player.x, this.player.y, `+${actualHeal} 生命值`, '#00ff00');
                }
                
                // 检查休整道具是否已使用，如果已使用则生成传送门
                if (this.currentRoom.restItem.used && this.portals.length === 0 && !this.isTransitioning) {
                    if (!this.demonInterferenceActive) {
                        if (this.currentScene === SCENE_TYPES.TOWER && Math.random() < this.demonInterferenceTriggerChance) {
                            this.startDemonInterference();
                        } else {
                            this.generatePortals();
                        }
                    }
                }
                
                // 检查传送门交互（休整房间，需要按E键）
                if (this.portals.length > 0 && !this.isTransitioning && eKeyPressed) {
                    this.portals.forEach(portal => {
                        const dx = portal.x - this.player.x;
                        const dy = portal.y - this.player.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        // 如果玩家在传送门范围内且按了E键，触发传送
                        if (distance < portal.size / 2 + 30) {
                            if (portal.type === 'next' && portal.roomType) {
                                this.isTransitioning = true;
                                this.floor++;
                                this.hasClearedFloor = true;
                                this.generateNewRoom(portal.roomType);
                                this.portals = [];
                                this.isTransitioning = false;
                            } else if (portal.type === 'exit') {
                                this.returnToTown();
                            }
                        }
                    });
                }
            } else if (this.currentRoom.type === ROOM_TYPES.GAP_SHOP) {
                const cx = this.currentRoom.width / 2;
                const cy = this.currentRoom.height / 2;
                const dx = cx - this.player.x;
                const dy = cy - this.player.y;
                if (eKeyPressed && Math.sqrt(dx * dx + dy * dy) < 95 && !this.currentRoom.cleared) {
                    this.openGapShopModal();
                }
                if (this.portals.length > 0 && !this.isTransitioning && eKeyPressed) {
                    this.portals.forEach(portal => {
                        const pdx = portal.x - this.player.x;
                        const pdy = portal.y - this.player.y;
                        const distance = Math.sqrt(pdx * pdx + pdy * pdy);
                        if (distance < portal.size / 2 + 30) {
                            if (portal.type === 'next' && portal.roomType) {
                                this.isTransitioning = true;
                                this.floor++;
                                this.hasClearedFloor = true;
                                this.generateNewRoom(portal.roomType);
                                this.portals = [];
                                this.isTransitioning = false;
                            } else if (portal.type === 'exit') {
                                this.returnToTown();
                            }
                        }
                    });
                }
            }
                }
            }
            
            // 更新冷却时间
            if (this.player.dashCooldown > 0) {
                this.player.dashCooldown -= 16;
            }
            
            // 更新E键状态（在本次update结束时保存，用于下次检测按键按下事件）
            this.lastEKeyState = currentEKeyState;
            
            this.updateHUD();
        } catch (error) {
            console.error('游戏更新循环出错:', error);
            // 确保游戏不会因为异常而完全停止
            this.updateHUD();
        }
    }

    /**
     * 更新主城场景
     */
    updateTown() {
        // 检查主城建筑交互
        const interactions = this.townScene.checkInteraction(this.player);
        // 检查是否在场景切换后的3秒冷却期内
        const now = Date.now();
        const timeSinceTransition = now - this.lastSceneTransitionTime;
        const canInteract = timeSinceTransition >= 3000; // 3秒冷却
        const currentEKeyState = this.keys['e'] || false;
        const eKeyPressed = currentEKeyState && !this.lastEKeyState && canInteract; // 检测按键按下事件，且不在冷却期内
        
        if (interactions.length > 0 && eKeyPressed) {
            const building = interactions[0];
            if (building.name === '恶魔塔入口') {
                this.enterTower();
            } else if (building.name === '铁匠铺') {
                this.openBlacksmith();
            } else if (building.name === '商店') {
                this.openShop();
            } else if (building.name === '训练场') {
                this.enterTrainingGround();
            }
        }
    }
    
    /**
     * 获取当前场景的可攻击目标列表（用于范围型词条/技能在所有场景生效）
     * @returns {Array} 当前场景的怪物/训练假人/Boss 数组
     */
    getCurrentSceneTargets() {
        if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) {
            return this.trainingGroundScene.dummies || [];
        }
        if (this.currentRoom && this.currentRoom.monsters) {
            return this.currentRoom.monsters;
        }
        return [];
    }
    
    /**
     * 初始化 ESC 菜单与恶魔塔退出确认等 UI
     */
    initDungeonSelection() {
        // ESC菜单按钮
        document.getElementById('esc-menu-guide-btn').addEventListener('click', () => {
            this.closeEscMenu();
            this.toggleGuide();
        });
        
        document.getElementById('esc-menu-export-btn').addEventListener('click', () => {
            this.closeEscMenu();
            this.exportSave();
        });
        
        document.getElementById('esc-menu-import-btn').addEventListener('click', () => {
            this.closeEscMenu();
            this.showImportSaveModal();
        });
        
        document.getElementById('esc-menu-exit-tower-btn').addEventListener('click', () => {
            this.closeEscMenu();
            this.showTowerExitConfirm();
        });
        
        document.getElementById('esc-menu-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeEscMenu();
        });
        
        // 点击ESC菜单背景关闭菜单
        const escMenuModal = document.getElementById('esc-menu-modal');
        if (escMenuModal) {
            escMenuModal.addEventListener('click', (e) => {
                // 如果点击的是背景（不是modal-content），关闭菜单
                if (e.target === escMenuModal) {
                    e.stopPropagation();
                    this.closeEscMenu();
                }
            });
        }
        
        // 恶魔塔退出确认按钮
        document.getElementById('tower-exit-confirm-btn').addEventListener('click', () => {
            this.confirmExitTower();
        });
        
        document.getElementById('tower-exit-cancel-btn').addEventListener('click', () => {
            this.cancelExitTower();
        });
    }
    
    /**
     * 显示ESC菜单
     */
    showEscMenu() {
        const modal = document.getElementById('esc-menu-modal');
        if (modal) {
            modal.classList.add('show');
            // 确保菜单显示
            modal.style.display = 'flex';
            this.paused = true;
            
            // 如果在恶魔塔中，显示退出按钮
            const exitBtn = document.getElementById('esc-menu-exit-tower-btn');
            if (exitBtn) {
                if (this.currentScene === SCENE_TYPES.TOWER) {
                    exitBtn.style.display = 'block';
                } else {
                    exitBtn.style.display = 'none';
                }
            }
        }
    }
    
    /**
     * 关闭ESC菜单
     */
    closeEscMenu() {
        const modal = document.getElementById('esc-menu-modal');
        if (modal) {
            modal.classList.remove('show');
            // 强制移除show类，确保菜单关闭
            modal.style.display = 'none';
        }
        // 检查其他界面是否打开
        const inventoryModal = document.getElementById('inventory-modal');
        const codexModal = document.getElementById('codex-modal');
        const shopModal = document.getElementById('shop-modal');
        const blacksmithModal = document.getElementById('blacksmith-modal');
        const guideModal = document.getElementById('guide-modal');
        const trainingGroundModal = document.getElementById('training-ground-modal');
        const saveCodeModal = document.getElementById('save-code-modal');
        const importSaveModal = document.getElementById('import-save-modal');
        const towerExitConfirmModal = document.getElementById('tower-exit-confirm-modal');
        
        // 如果其他界面也没有打开，才恢复游戏
        const hasOtherModalOpen = 
            (inventoryModal && inventoryModal.classList.contains('show')) ||
            (codexModal && codexModal.classList.contains('show')) ||
            (shopModal && shopModal.classList.contains('show')) ||
            (blacksmithModal && blacksmithModal.classList.contains('show')) ||
            (guideModal && guideModal.classList.contains('show')) ||
            (trainingGroundModal && trainingGroundModal.classList.contains('show')) ||
            (saveCodeModal && saveCodeModal.classList.contains('show')) ||
            (importSaveModal && importSaveModal.classList.contains('show')) ||
            (towerExitConfirmModal && towerExitConfirmModal.classList.contains('show'));
        
        if (!this.devMode && !hasOtherModalOpen) {
            this.paused = false;
        }
    }
    
    /**
     * 显示退出恶魔塔确认对话框
     */
    showTowerExitConfirm() {
        const modal = document.getElementById('tower-exit-confirm-modal');
        if (modal) {
            modal.classList.add('show');
            this.paused = true;
        }
    }
    
    /**
     * 确认退出恶魔塔
     */
    confirmExitTower() {
        // 关闭确认对话框
        const modal = document.getElementById('tower-exit-confirm-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        // 确保不是死亡状态
        this.isPlayerDead = false;
        
        // 移除本次在恶魔塔中获得的物品
        let removedCount = 0;
        
        // 从装备栏中移除（如果装备是在恶魔塔中获得的）
        Object.keys(this.player.equipment).forEach(slot => {
            const eq = this.player.equipment[slot];
            if (eq && eq.uniqueId && this.towerItems.has(eq.uniqueId)) {
                this.player.equipment[slot] = null;
                removedCount++;
            }
        });
        
        // 从背包中移除
        for (let i = this.player.inventory.length - 1; i >= 0; i--) {
            const item = this.player.inventory[i];
            if (item && item.uniqueId && this.towerItems.has(item.uniqueId)) {
                this.player.inventory[i] = null;
                removedCount++;
            }
        }
        
        // 重新计算属性（因为可能删除了装备）
        if (removedCount > 0) {
            this.player.updateStats();
            if (typeof this.player.onEquipmentSlotChanged === 'function') {
                this.player.onEquipmentSlotChanged(null);
            }
        }
        
        // 扣除本次在恶魔塔中获得的金币
        const goldLost = Math.min(this.towerGoldGained, this.player.gold);
        if (goldLost > 0) {
            this.player.gold -= goldLost;
        }
        
        // 清空追踪数据
        this.towerItems.clear();
        const towerGoldLost = this.towerGoldGained;
        this.towerGoldGained = 0;
        
        // ESC退出时，标记需要回退层数
        this.needFloorRollback = true;
        this.lastDeathFloor = this.floor;
        
        // 显示提示（延迟显示，确保玩家能看到）
        setTimeout(() => {
            this.addFloatingText(this.player.x, this.player.y, '退出后下次进入将回退5层', '#ffaa00');
        }, 300);
        
        // 更新UI
        this.updateInventoryUI();
        this.updateHUD();
        
        // 返回主城
        this.returnToTown();
        
        // 恢复游戏状态（确保可以移动）；元素可能不存在，需防空
        const inventoryModal = document.getElementById('inventory-modal');
        const codexModal = document.getElementById('codex-modal');
        const shopModal = document.getElementById('shop-modal');
        const blacksmithModal = document.getElementById('blacksmith-modal');
        const guideModal = document.getElementById('guide-modal');
        const escStillOpen = document.getElementById('esc-menu-modal');
        const noBlockingModal =
            (!escStillOpen || !escStillOpen.classList.contains('show')) &&
            (!inventoryModal || !inventoryModal.classList.contains('show')) &&
            (!codexModal || !codexModal.classList.contains('show')) &&
            (!shopModal || !shopModal.classList.contains('show')) &&
            (!blacksmithModal || !blacksmithModal.classList.contains('show')) &&
            (!guideModal || !guideModal.classList.contains('show'));
        if (!this.devMode && noBlockingModal) {
            this.paused = false;
        }
        
        // 显示丢失物品提示
        if (removedCount > 0 || towerGoldLost > 0) {
            console.log(`退出恶魔塔：删除了 ${removedCount} 个在恶魔塔中获得的物品，扣除了 ${towerGoldLost} 金币`);
            setTimeout(() => {
                this.addFloatingText(this.player.x, this.player.y, `丢失了 ${removedCount} 个物品和 ${towerGoldLost} 金币`, '#ff0000');
            }, 300);
        }
    }
    
    /**
     * 取消退出恶魔塔
     */
    cancelExitTower() {
        const modal = document.getElementById('tower-exit-confirm-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        this.paused = false;
    }
    
    /**
     * 进入训练场
     */
    enterTrainingGround() {
        // 调用统一的场景切换函数
        this.transitionScene(SCENE_TYPES.TRAINING);
        
        // 重置玩家位置
        this.player.x = CONFIG.CANVAS_WIDTH / 2;
        this.player.y = CONFIG.CANVAS_HEIGHT / 2;
        // 打开训练场UI（可选，玩家也可以直接按T键生成训练假人）
        this.openTrainingGround();
    }
    
    /**
     * 打开训练场界面
     */
    openTrainingGround() {
        const modal = document.getElementById('training-ground-modal');
        if (modal) {
            modal.classList.add('show');
            this.paused = true;
            this.updateTrainingGroundUI();
        }
    }
    
    /**
     * 关闭训练场界面
     */
    closeTrainingGround() {
        const modal = document.getElementById('training-ground-modal');
        if (modal) {
            modal.classList.remove('show');
            const codexModal = document.getElementById('codex-modal');
            const blacksmithModal = document.getElementById('blacksmith-modal');
            const inventoryModal = document.getElementById('inventory-modal');
            const guideModal = document.getElementById('guide-modal');
            const anyOtherModal = codexModal.classList.contains('show') ||
                blacksmithModal.classList.contains('show') ||
                inventoryModal.classList.contains('show') ||
                guideModal.classList.contains('show');
            if (!anyOtherModal) {
                this.paused = false;
            }
        }
    }
    
    /**
     * 更新训练场UI
     */
    updateTrainingGroundUI() {
        const countElement = document.getElementById('dummies-count-value');
        if (countElement && this.trainingGroundScene) {
            countElement.textContent = this.trainingGroundScene.dummies.length;
        }
    }
    
    /**
     * 打开训练假人生成面板
     */
    openDummySpawnPanel() {
        if (this.currentScene !== SCENE_TYPES.TRAINING) {
            // 如果不在训练场，提示玩家
            this.addFloatingText(this.player.x, this.player.y, '请在训练场中使用', '#ff4444');
            return;
        }
        
        const modal = document.getElementById('dummy-spawn-modal');
        if (modal) {
            modal.classList.add('show');
            this.paused = true;
            this.initDummySpawnPanel();
        }
    }
    
    /**
     * 初始化训练假人生成面板
     */
    initDummySpawnPanel() {
        // 填充怪物类型选择器（含普通怪与精英怪）
        const monsterSelect = document.getElementById('monster-type-select');
        if (monsterSelect) {
            monsterSelect.innerHTML = '';
            Object.keys(MONSTER_TYPES).forEach(type => {
                const monsterData = MONSTER_TYPES[type];
                const option = document.createElement('option');
                option.value = type;
                const eliteLabel = monsterData.isElite ? ' [精英]' : '';
                option.textContent = `${monsterData.name}${eliteLabel} (${monsterData.level}级)`;
                monsterSelect.appendChild(option);
            });
        }
        
        // 监听假人类型切换
        const typeRadios = document.querySelectorAll('input[name="dummy-type"]');
        const monsterSelector = document.getElementById('monster-type-selector');
        typeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'monster') {
                    monsterSelector.style.display = 'block';
                } else {
                    monsterSelector.style.display = 'none';
                }
            });
        });
    }
    
    /**
     * 关闭训练假人生成面板
     */
    closeDummySpawnPanel() {
        const modal = document.getElementById('dummy-spawn-modal');
        if (modal) {
            modal.classList.remove('show');
            const codexModal = document.getElementById('codex-modal');
            const blacksmithModal = document.getElementById('blacksmith-modal');
            const inventoryModal = document.getElementById('inventory-modal');
            const guideModal = document.getElementById('guide-modal');
            const trainingGroundModal = document.getElementById('training-ground-modal');
            const anyOtherModal = codexModal.classList.contains('show') ||
                blacksmithModal.classList.contains('show') ||
                inventoryModal.classList.contains('show') ||
                guideModal.classList.contains('show') ||
                trainingGroundModal.classList.contains('show');
            if (!anyOtherModal) {
                this.paused = false;
            }
        }
    }
    
    /**
     * 生成训练假人（根据面板设置）
     */
    spawnDummy() {
        if (this.currentScene !== SCENE_TYPES.TRAINING) return;
        
        // 获取选择的假人类型
        const selectedType = document.querySelector('input[name="dummy-type"]:checked').value;
        const chasePlayer = document.getElementById('dummy-chase').checked;
        const invincible = document.getElementById('dummy-invincible').checked;
        
        const options = {
            chasePlayer: chasePlayer,
            invincible: invincible
        };
        
        let dummy;
        if (selectedType === 'training') {
            // 生成训练假人
            dummy = this.trainingGroundScene.addDummy(this.player.x, this.player.y, options);
            this.addFloatingText(this.player.x, this.player.y, '训练假人已生成', '#4a9eff');
        } else {
            // 生成怪物类型训练假人（含精英怪）
            const monsterType = document.getElementById('monster-type-select').value;
            const monsterData = MONSTER_TYPES[monsterType];
            if (!monsterData) {
                this.addFloatingText(this.player.x, this.player.y, `未知怪物类型: ${monsterType}`, '#ff4444');
                this.closeDummySpawnPanel();
                return;
            }
            const opts = { ...options, gameInstance: this };
            dummy = this.trainingGroundScene.addMonsterDummy(this.player.x, this.player.y, monsterType, opts);
            this.addFloatingText(this.player.x, this.player.y, `${monsterData.name}已生成`, '#4a9eff');
        }
        
        this.updateTrainingGroundUI();
        this.closeDummySpawnPanel();
    }
    
    /**
     * 清空所有训练桩
     */
    clearAllTrainingDummies() {
        if (this.currentScene !== SCENE_TYPES.TRAINING) return;
        
        this.trainingGroundScene.clearAllDummies();
        this.updateTrainingGroundUI();
        this.addFloatingText(this.player.x, this.player.y, '已清空所有训练桩', '#ff4444');
    }
    
    /**
     * 更新训练场场景
     */
    updateTrainingGround() {
        // 检查退出传送门交互
        const interactions = this.trainingGroundScene.checkInteraction(this.player);
        // 检查是否在场景切换后的3秒冷却期内
        const now = Date.now();
        const timeSinceTransition = now - this.lastSceneTransitionTime;
        const canInteract = timeSinceTransition >= 3000; // 3秒冷却
        const currentEKeyState = this.keys['e'] || false;
        const eKeyPressed = currentEKeyState && !this.lastEKeyState && canInteract; // 检测按键按下事件，且不在冷却期内
        
        if (interactions.length > 0 && eKeyPressed) {
            const interaction = interactions[0];
            if (interaction.name === '返回主城') {
                this.returnToTown();
            }
        }
        
        // T键：打开训练假人生成面板
        if (this.keys['t']) {
            this.openDummySpawnPanel();
            this.keys['t'] = false; // 防止连续触发
        }
        
        // 更新训练假人（如果允许追击）
        this.trainingGroundScene.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            if (dummy instanceof TrainingDummy || dummy instanceof MonsterTrainingDummy) {
                dummy.update(this.player);
            }
        });
        
        // 玩家攻击训练桩（如果正在冲刺，不能攻击）
        if (this.keys['j'] && !this.player.isDashing) {
            this.player.attack(this.trainingGroundScene.dummies);
        }
        
        // 怪物类型训练假人攻击玩家（已死亡的不参与）
        this.trainingGroundScene.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            if (dummy instanceof MonsterTrainingDummy && dummy.attack) {
                if (dummy.attack(this.player)) {
                    const killed = this.player.takeDamage(dummy.damage, dummy, false);
                    if (typeof applyMonsterOnHitPlayerEffects === 'function') {
                        applyMonsterOnHitPlayerEffects(this.player, dummy);
                    }
                    if (killed) {
                        this.returnToTown();
                    }
                }
            }
        });
        
        // 移除已死亡的非无敌怪物型假人
        if (this.trainingGroundScene.dummies) {
            const before = this.trainingGroundScene.dummies.length;
            this.trainingGroundScene.dummies = this.trainingGroundScene.dummies.filter(d => {
                if (d instanceof MonsterTrainingDummy && !d.invincible && d.hp <= 0) return false;
                return true;
            });
            if (this.trainingGroundScene.dummies.length !== before) this.updateTrainingGroundUI();
        }
        
        // 更新训练桩的异常状态（处理持续伤害等，已死亡的非无敌假人跳过）
        this.trainingGroundScene.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            // 处理燃烧持续伤害（训练假人）
            if (dummy instanceof TrainingDummy && dummy.statusEffects.burning && dummy.statusEffects.burning.length > 0) {
                dummy.statusEffects.burning.forEach(burn => {
                    const elapsed = now - burn.startTime;
                    if (elapsed >= 1000 && elapsed < burn.duration) {
                        // 每秒造成一次伤害
                        const lastTick = burn.lastTick || burn.startTime;
                        if (now - lastTick >= 1000) {
                            dummy.takeDamage(burn.damage);
                            burn.lastTick = now;
                        }
                    }
                });
            }
            
            // 处理怪物类型训练假人的持续伤害
            if (dummy instanceof MonsterTrainingDummy && dummy.burningDots && dummy.burningDots.length > 0) {
                dummy.burningDots = dummy.burningDots.filter(dot => {
                    const elapsed = now - dot.lastTick;
                    if (elapsed >= 1000) {
                        const damage = dot.damagePerSecond;
                        dummy.takeDamage(damage);
                        dot.lastTick = now;
                        this.addFloatingText(
                            dummy.x,
                            dummy.y,
                            `持续伤害: ${Math.floor(damage)}`,
                            '#ff6600'
                        );
                    }
                    return (now - dot.startTime) < dot.duration;
                });
            }
        });
    }

    /**
     * 查找神圣十字架
     * @returns {Object|null} 返回找到的神圣十字架物品和索引，如果没有则返回null
     */
    findResurrectionItem() {
        for (let i = 0; i < this.player.inventory.length; i++) {
            const item = this.player.inventory[i];
            if (item && (
                (item.type === 'consumable' && item.consumableType === 'resurrection') ||
                (item.name === '神圣十字架')
            )) {
                return { item: item, index: i };
            }
        }
        return null;
    }
    
    /**
     * 显示复活对话框
     * @param {Object} resurrectionData - 包含item和index的对象
     */
    showResurrectionDialog(resurrectionData) {
        this._pendingResurrection = resurrectionData;
        this.paused = true;
        
        let modal = document.getElementById('resurrection-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'resurrection-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px; text-align: center;">
                    <h2 style="color: #ffd700; margin-bottom: 20px;">死亡</h2>
                    <p style="color: #fff; font-size: 16px; margin-bottom: 30px;">你已死亡！</p>
                    <p id="resurrection-detail-text" style="color: #aaa; font-size: 14px; margin-bottom: 30px;"></p>
                    <p style="color: #88ff88; font-size: 12px; margin-bottom: 30px;">复活后将恢复满血并获得3秒无敌</p>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button id="resurrection-confirm-btn" style="padding: 12px 30px; background: #4a9eff; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold;">确认复活</button>
                        <button id="resurrection-cancel-btn" style="padding: 12px 30px; background: #666; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-family: 'Courier New', monospace; font-size: 14px;">返回主城</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            document.getElementById('resurrection-confirm-btn').addEventListener('click', () => {
                this.useResurrection(this._pendingResurrection);
            });
            
            document.getElementById('resurrection-cancel-btn').addEventListener('click', () => {
                this.cancelResurrection();
            });
        }
        
        const detail = document.getElementById('resurrection-detail-text');
        const confirmBtn = document.getElementById('resurrection-confirm-btn');
        if (detail) {
            detail.textContent = resurrectionData && resurrectionData.towerCharge
                ? '检测到你拥有隙间商店购买的额外复活次数，是否使用？'
                : '检测到你拥有神圣十字架，是否使用它复活？';
        }
        if (confirmBtn) {
            confirmBtn.textContent = resurrectionData && resurrectionData.towerCharge
                ? '使用额外复活'
                : '使用神圣十字架复活';
        }
        
        modal.classList.add('show');
    }
    
    /**
     * 使用神圣十字架复活
     * @param {Object} resurrectionData - 包含item和index的对象
     */
    useResurrection(resurrectionData) {
        if (resurrectionData && resurrectionData.towerCharge) {
            this.player.towerReviveCharges = Math.max(0, (this.player.towerReviveCharges || 0) - 1);
        } else if (resurrectionData && resurrectionData.index != null) {
            this.player.inventory[resurrectionData.index] = null;
        }
        
        // 恢复玩家生命值
        this.player.hp = this.player.maxHp;
        
        // 设置3秒无敌
        this.player.invincibleUntil = Date.now() + 3000;
        
        // 关闭对话框
        const modal = document.getElementById('resurrection-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        // 恢复游戏
        this.paused = false;
        this.isPlayerDead = false;
        
        // 更新UI
        this.updateHUD();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        
        // 显示提示
        this.addFloatingText(this.player.x, this.player.y, '已复活！3秒无敌', '#00ff00');
    }
    
    /**
     * 取消复活，返回主城
     */
    cancelResurrection() {
        // 关闭对话框
        const modal = document.getElementById('resurrection-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        // 返回主城
        this.returnToTown();
        this.updateHUD();
    }
    
    /**
     * 返回主城
     * 当玩家在恶魔塔中死亡时调用，或从训练场返回时调用
     */
    returnToTown() {
        this.monsterProjectiles = [];
        this.groundHazards = [];
        this.pendingMonsterAoE = [];
        this.soulCircles = [];
        // 如果是从训练场返回，清空训练桩
        if (this.currentScene === SCENE_TYPES.TRAINING) {
            this.trainingGroundScene.clearAllDummies();
        }
        
        // 保存死亡时的层数（如果是从恶魔塔返回）
        if (this.currentScene === SCENE_TYPES.TOWER) {
            // 只有死亡时才标记需要回退层数（ESC退出在confirmExitTower中处理）
            if (this.isPlayerDead) {
                // 玩家死亡，标记需要回退
                this.needFloorRollback = true;
                // 显示提示（延迟显示，确保玩家能看到）
                setTimeout(() => {
                    this.addFloatingText(this.player.x, this.player.y, '死亡后下次进入将回退5层', '#ffaa00');
                }, 300);
            }
            this.lastDeathFloor = this.floor;
            
            // 如果玩家死亡，删除本次恶魔塔中获得的所有物品
            if (this.isPlayerDead) {
                // 先收集要删除的物品信息（在删除之前）
                const itemsToRemove = [];
                
                // 收集装备栏中的物品
                for (const slot in this.player.equipment) {
                    const item = this.player.equipment[slot];
                    if (item && item.uniqueId && this.towerItems.has(item.uniqueId)) {
                        itemsToRemove.push({
                            item: item,
                            location: 'equipped',
                            slot: slot
                        });
                    }
                }
                
                // 收集背包中的物品
                for (let i = 0; i < this.player.inventory.length; i++) {
                    const item = this.player.inventory[i];
                    if (item && item.uniqueId && this.towerItems.has(item.uniqueId)) {
                        itemsToRemove.push({
                            item: item,
                            location: 'inventory',
                            slot: i
                        });
                    }
                }
                
                // 实际删除物品（在显示窗口之前删除，这样窗口显示的是已删除的物品）
                let removedCount = 0;
                
                // 首先遍历装备栏，删除所有标记的物品（包括已装备的）
                for (const slot in this.player.equipment) {
                    const item = this.player.equipment[slot];
                    if (item && item.uniqueId && this.towerItems.has(item.uniqueId)) {
                        // 从装备栏中移除
                        this.player.equipment[slot] = null;
                        removedCount++;
                        console.log(`删除已装备的恶魔塔物品: ${item.name} (uniqueId: ${item.uniqueId}, 部位: ${slot})`);
                    }
                }
                
                // 然后遍历背包，删除标记的物品
                for (let i = 0; i < this.player.inventory.length; i++) {
                    const item = this.player.inventory[i];
                    if (item && item.uniqueId && this.towerItems.has(item.uniqueId)) {
                        // 从背包中移除
                        this.player.inventory[i] = null;
                        removedCount++;
                        console.log(`删除恶魔塔物品: ${item.name} (uniqueId: ${item.uniqueId})`);
                    }
                }
                
                // 重新计算属性（因为可能删除了装备）
                if (removedCount > 0) {
                    this.player.updateStats();
                }
                    if (typeof this.player.onEquipmentSlotChanged === 'function') {
                        this.player.onEquipmentSlotChanged(null);
                    }
                
                // 扣除本次恶魔塔中获得的金币
                const goldLost = Math.min(this.towerGoldGained, this.player.gold);
                if (goldLost > 0) {
                    this.player.gold -= goldLost;
                    console.log(`死亡惩罚：扣除了 ${goldLost} 金币（本次恶魔塔中获得的金币）`);
                }
                
                // 清空物品追踪Set和金币追踪
                this.towerItems.clear();
                const towerGoldLost = this.towerGoldGained; // 保存要显示的金币数量
                this.towerGoldGained = 0;
                
                if (removedCount > 0 || towerGoldLost > 0) {
                    console.log(`死亡惩罚：删除了 ${removedCount} 个在恶魔塔中获得的物品，扣除了 ${towerGoldLost} 金币`);
                }
                
                // 更新UI
                this.updateInventoryUI();
                this.updateHUD();
                
                // 显示死亡惩罚窗口（在删除物品之后，这样窗口关闭后才会切换场景）
                if (itemsToRemove.length > 0 || towerGoldLost > 0) {
                    this.showDeathPenaltyWindow(itemsToRemove, towerGoldLost);
                    // 不立即切换场景，等待窗口关闭后再切换
                    // 注意：死亡标志在窗口关闭时重置，确保流程完整
                    return; // 提前返回，场景切换在关闭窗口时进行
                } else {
                    // 如果没有物品或金币损失，直接重置死亡标志并恢复生命值
                    this.isPlayerDead = false;
                    this.player.hp = this.player.maxHp;
                }
            }
            
            // 只有在非死亡情况下才恢复生命值（死亡时生命值在窗口关闭后恢复）
            if (!this.isPlayerDead) {
                this.player.hp = this.player.maxHp;
            }
        }
        
        // 清理游戏状态
        this.isTransitioning = false;
        if (this.roomTransitionTimer) {
            clearTimeout(this.roomTransitionTimer);
            this.roomTransitionTimer = null;
        }
        // 注意：如果显示了死亡惩罚窗口，暂停状态由窗口管理，场景切换也在窗口关闭时进行
        // 这里不设置paused，让窗口关闭时处理
        
        // 关闭所有打开的界面
        const alchemyModal = document.getElementById('alchemy-modal');
        const escMenuModalRt = document.getElementById('esc-menu-modal');
        const towerExitModalRt = document.getElementById('tower-exit-confirm-modal');
        const shopModal = document.getElementById('shop-modal');
        const blacksmithModal = document.getElementById('blacksmith-modal');
        const inventoryModal = document.getElementById('inventory-modal');
        const codexModal = document.getElementById('codex-modal');
        const trainingGroundModal = document.getElementById('training-ground-modal');
        
        if (escMenuModalRt) {
            escMenuModalRt.classList.remove('show');
            escMenuModalRt.style.display = 'none';
        }
        if (towerExitModalRt) towerExitModalRt.classList.remove('show');
        if (alchemyModal) alchemyModal.classList.remove('show');
        if (shopModal) shopModal.classList.remove('show');
        if (blacksmithModal) blacksmithModal.classList.remove('show');
        if (inventoryModal) inventoryModal.classList.remove('show');
        if (codexModal) codexModal.classList.remove('show');
        if (trainingGroundModal) trainingGroundModal.classList.remove('show');
        
        // 离开恶魔塔时清空加护/恶魔干扰：由 transitionScene 在切到主城时统一处理
        
        // 调用统一的场景切换函数
        this.transitionScene(SCENE_TYPES.TOWN);
        
        this.currentRoom = null;
        
        // 清空掉落物和传送门（返回主城时清理）
        this.droppedItems = [];
        this.portals = [];
        
        // 确保主城场景已初始化
        if (!this.townScene) {
            this.townScene = new TownScene(this);
        }
        
        // 重置玩家位置到主城中心
        this.player.x = CONFIG.CANVAS_WIDTH / 2;
        this.player.y = CONFIG.CANVAS_HEIGHT / 2;
        
        // 从训练场/秘境等返回时解除暂停，避免主城无法移动、商店无法操作（开发者模式曾阻止 unpause）
        this.paused = false;
        
        // 显示提示
        this.addFloatingText(this.player.x, this.player.y, '返回主城', '#ff0000');
        
        // 更新HUD和房间信息显示
        this.updateHUD();
        document.getElementById('room-type').textContent = '主城';
        document.getElementById('floor-number').textContent = `上次到达: ${this.lastDeathFloor}层`;
    }

    enterTower() {
        // 检查是否需要回退层数
        if (this.needFloorRollback) {
            // 回退5层，但至少为1层
            this.lastDeathFloor = Math.max(1, this.lastDeathFloor - 5);
            this.needFloorRollback = false;
            // 显示回退提示
            setTimeout(() => {
                this.addFloatingText(this.player.x, this.player.y, `层数回退5层，当前层数: ${this.lastDeathFloor}`, '#ffaa00');
            }, 500);
        }
        
        // 从上次死亡的层数开始
        this.floor = this.lastDeathFloor;
        this.towerStartFloor = this.floor; // 记录本次进入的起始层数
        this.hasClearedFloor = false; // 重置通关标志
        
        // 调用统一的场景切换函数
        this.transitionScene(SCENE_TYPES.TOWER);
        
        // 清空物品追踪Set和金币追踪（开始新的恶魔塔之旅）
        this.towerItems.clear();
        this.towerGoldGained = 0;
        this.isPlayerDead = false;
        this.player.demonDebuffs = {};
        this.player.eliteBoons = [];
        this.player.towerReviveCharges = 0;
        this.player.towerMaxHpBonusPercent = 0;
        this.player.updateStats();
        this.demonEffectStatusText = '';
        this.demonInterferenceFlags = {};
        
        // 刷新技能冷却
        this.player.dashCooldown = 0;
        this.player.weaponSkillCooldown = 0;
        
        // 进入恶魔塔时的那关一定是战斗
        this.generateNewRoom(ROOM_TYPES.BATTLE);
        // 显示提示
        this.addFloatingText(this.player.x, this.player.y, `进入恶魔塔第${this.floor}层`, '#aa00ff');
    }

    // ====================================================================
    // 铁匠铺相关方法组
    // ====================================================================

    /**
     * 初始化铁匠铺界面
     */
    initBlacksmith() {
        document.getElementById('close-blacksmith').addEventListener('click', () => {
            this.closeBlacksmith();
        });
        
        const fusionModeBtn = document.getElementById('blacksmith-fusion-mode-btn');
        if (fusionModeBtn) {
            fusionModeBtn.addEventListener('click', () => { this.switchToFusionMode(); });
        }
        const fusionModeBack = document.getElementById('blacksmith-fusion-mode-back');
        if (fusionModeBack) {
            fusionModeBack.addEventListener('click', () => { this.switchToNormalMode(); });
        }
        
        document.getElementById('blacksmith-upgrade-btn').addEventListener('click', () => {
            this.upgradeEquipment();
        });
        
        document.getElementById('blacksmith-refine-btn').addEventListener('click', () => {
            this.refineEquipment();
        });
        
        // 合铸：状态与 UI
        this.fusionSelection = { slotA: null, slotB: null };
        const fusionSlotA = document.getElementById('blacksmith-fusion-slot-a');
        const fusionSlotB = document.getElementById('blacksmith-fusion-slot-b');
        const fusionBtn = document.getElementById('blacksmith-fusion-btn');
        if (fusionSlotA) {
            fusionSlotA.addEventListener('click', () => { this.openFusionPicker('A'); });
        }
        if (fusionSlotB) {
            fusionSlotB.addEventListener('click', () => { this.openFusionPicker('B'); });
        }
        if (fusionBtn) {
            fusionBtn.addEventListener('click', () => { this.onBlacksmithFusionButtonClick(); });
        }
        const fusionClearBtn = document.getElementById('blacksmith-fusion-clear-btn');
        if (fusionClearBtn) {
            fusionClearBtn.addEventListener('click', () => { this.clearFusionSlots(); });
        }
        const fusionTownClaim = document.getElementById('fusion-town-complete-claim');
        if (fusionTownClaim) {
            fusionTownClaim.addEventListener('click', () => {
                this.hideFusionTownCompleteModal();
                this.startFusionClaimReveal();
            });
        }
        const fusionTownClose = document.getElementById('fusion-town-complete-close');
        if (fusionTownClose) {
            fusionTownClose.addEventListener('click', () => { this.hideFusionTownCompleteModal(); });
        }
        
        // 页签切换功能
        const tabs = document.querySelectorAll('.blacksmith-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchBlacksmithTab(tabName);
            });
        });
    }
    
    /**
     * 切换到合铸全屏视图（原打造入口）
     */
    switchToFusionMode() {
        const normalMode = document.getElementById('blacksmith-normal-mode');
        const fusionMode = document.getElementById('blacksmith-fusion-mode');
        if (!normalMode || !fusionMode) {
            console.error('switchToFusionMode: missing blacksmith DOM');
            return;
        }
        normalMode.style.display = 'none';
        fusionMode.style.display = 'block';
        this.updateFusionUI();
    }
    
    /**
     * 切换回铁匠铺普通视图（强化/精炼）
     */
    switchToNormalMode() {
        this.closeFusionPickerModalIfOpen();
        const normalMode = document.getElementById('blacksmith-normal-mode');
        const fusionMode = document.getElementById('blacksmith-fusion-mode');
        if (normalMode) normalMode.style.display = 'flex';
        if (fusionMode) fusionMode.style.display = 'none';
    }
    
    /**
     * 切换铁匠铺页签
     * @param {string} tabName - 'upgrade' | 'refine'
     */
    switchBlacksmithTab(tabName) {
        const tabs = document.querySelectorAll('.blacksmith-tab');
        tabs.forEach(tab => {
            if (tab.dataset.tab === tabName) tab.classList.add('active');
            else tab.classList.remove('active');
        });
        
        const upgradeSection = document.getElementById('blacksmith-upgrade-section');
        const refineSection = document.getElementById('blacksmith-refine-section');
        
        if (upgradeSection) upgradeSection.classList.remove('active');
        if (refineSection) refineSection.classList.remove('active');
        
        if (tabName === 'upgrade') {
            if (upgradeSection) upgradeSection.classList.add('active');
            const equipment = this.getSelectedBlacksmithEquipment();
            if (equipment) this.showBlacksmithDetails(equipment);
        } else if (tabName === 'refine') {
            if (refineSection) refineSection.classList.add('active');
            const equipment = this.getSelectedBlacksmithEquipment();
            if (equipment) {
                this.showBlacksmithDetails(equipment);
            } else {
                const refineInfo = document.getElementById('blacksmith-refine-info');
                const refineList = document.getElementById('blacksmith-refine-list');
                const refineBtn = document.getElementById('blacksmith-refine-btn');
                if (refineInfo) refineInfo.innerHTML = '<p style="color: #aaa;">请先选择一件武器</p>';
                if (refineList) refineList.innerHTML = '';
                if (refineBtn) refineBtn.style.display = 'none';
            }
        }
    }

    // ====================================================================
    // 商店相关方法组
    // ====================================================================

    /**
     * 初始化商店界面
     */
    initShop() {
        document.getElementById('close-shop').addEventListener('click', () => {
            this.closeShop();
        });
        
        // 商店刷新按钮（添加防抖处理）
        const refreshBtn = document.getElementById('shop-refresh-btn');
        let refreshTimeout = null;
        refreshBtn.addEventListener('click', () => {
            if (refreshTimeout) return; // 如果正在处理，忽略点击
            refreshTimeout = setTimeout(() => {
                this.refreshShop();
                refreshTimeout = null;
            }, 100); // 100ms防抖
        });
        
        // 商店标签切换
        document.querySelectorAll('.shop-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.shop-section').forEach(s => s.classList.remove('active'));
                document.getElementById(`shop-${targetTab}`).classList.add('active');
                if (targetTab === 'equipments') {
                    this.updateShopEquipments();
                } else if (targetTab === 'consumables') {
                    this.updateShopConsumables();
                } else if (targetTab === 'sell') {
                    this.updateShopSell();
                }
            });
        });
        
        // 定向位购买按钮（使用事件委托，避免重复绑定）
        const targetSlotsContainer = document.getElementById('shop-target-slots');
        if (targetSlotsContainer && !targetSlotsContainer.dataset.listenerAdded) {
            targetSlotsContainer.dataset.listenerAdded = 'true';
            targetSlotsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('buy-target-slot-btn')) {
                    e.stopPropagation();
                    const quality = e.target.dataset.quality;
                    if (this.buyTargetSlotTimeout) return; // 防抖
                    this.buyTargetSlotTimeout = setTimeout(() => {
                        this.buyTargetSlot(quality);
                        this.buyTargetSlotTimeout = null;
                    }, 100);
                }
            });
        }
    }

    // ====================================================================
    // 训练场与背包容量初始化
    // ====================================================================

    /**
     * 初始化训练场与背包容量相关界面事件
     */
    initTrainingAndCapacity() {
        // 训练场UI事件
        const addDummyBtn = document.getElementById('add-dummy-btn');
        const clearDummiesBtn = document.getElementById('clear-dummies-btn');
        const closeTrainingGroundBtn = document.getElementById('close-training-ground');
        
        if (addDummyBtn) {
            addDummyBtn.addEventListener('click', () => {
                this.openDummySpawnPanel();
            });
        }
        
        if (clearDummiesBtn) {
            clearDummiesBtn.addEventListener('click', () => {
                this.clearAllTrainingDummies();
            });
        }
        
        if (closeTrainingGroundBtn) {
            closeTrainingGroundBtn.addEventListener('click', () => {
                this.closeTrainingGround();
            });
        }
        
        // 训练假人生成面板事件
        const spawnDummyBtn = document.getElementById('spawn-dummy-btn');
        const cancelDummySpawnBtn = document.getElementById('cancel-dummy-spawn-btn');
        const closeDummySpawnBtn = document.getElementById('close-dummy-spawn');
        
        if (spawnDummyBtn) {
            spawnDummyBtn.addEventListener('click', () => {
                this.spawnDummy();
            });
        }
        
        if (cancelDummySpawnBtn) {
            cancelDummySpawnBtn.addEventListener('click', () => {
                this.closeDummySpawnPanel();
            });
        }
        
        if (closeDummySpawnBtn) {
            closeDummySpawnBtn.addEventListener('click', () => {
                this.closeDummySpawnPanel();
            });
        }
    }

    /**
     * 初始化升级背包容量选择界面
     */
    initLevelUpCapacity() {
        const expandEquipmentBtn = document.getElementById('expand-equipment-btn');
        const expandPotionBtn = document.getElementById('expand-potion-btn');
        if (expandEquipmentBtn) {
            expandEquipmentBtn.addEventListener('click', () => {
                this.expandCapacity('equipment');
            });
        }
        if (expandPotionBtn) {
            expandPotionBtn.addEventListener('click', () => {
                this.expandCapacity('potion');
            });
        }
    }
    
    /**
     * 玩家升级时的处理
     * @param {number} newLevel - 新等级
     */
    onPlayerLevelUp(newLevel) {
        // 升级时不再增加背包容量（已取消此功能）
        // 背包扩容改为在商店刷新时随机出现
    }
    
    /**
     * 扩大背包容量
     * @param {string} type - 容量类型 ('equipment', 'alchemy', 'potion')
     */
    expandCapacity(type) {
        if (type === 'equipment') {
            this.player.maxEquipmentCapacity += 3;
        } else if (type === 'potion') {
            this.player.maxPotionCapacity += 3;
        }
        
        // 关闭选择框
        const modal = document.getElementById('level-up-capacity-modal');
        modal.classList.remove('show');
        
        // 恢复游戏
        this.paused = false;
        
        // 更新UI
        this.updateInventoryCapacity();
        this.updateHUD();
        
        // 显示提示
        const typeNames = {
            equipment: '装备栏',
            material: '材料栏',
            potion: '消耗品栏',
            consumable: '消耗品栏'
        };
        this.addFloatingText(this.player.x, this.player.y, `${typeNames[type] || '背包'}容量+6`, '#4a9eff');
    }
    
    /**
     * 购买背包扩容
     * @param {number} cost - 扩容费用
     */
    buyCapacityExpansion(cost) {
        if (this.player.gold < cost) {
            this.addFloatingText(this.player.x, this.player.y, '金币不足', '#ff0000');
            return;
        }
        
        this.player.gold -= cost;
        // 播放购买音效
        if (this.soundManager) {
            this.soundManager.playSound('purchase');
        }
        this.shopCapacityExpansionCount++;
        this.shopHasCapacityExpansion = false; // 购买后移除
        
        // 暂停游戏，显示选择框
        this.paused = true;
        
        // 更新容量显示
        const currentEquipmentCap = document.getElementById('current-equipment-cap');
        const currentPotionCap = document.getElementById('current-potion-cap');
        if (currentEquipmentCap) currentEquipmentCap.textContent = this.player.maxEquipmentCapacity;
        if (currentPotionCap) currentPotionCap.textContent = this.player.maxPotionCapacity;
        
        // 显示选择框
        const modal = document.getElementById('level-up-capacity-modal');
        modal.classList.add('show');
        
        // 更新UI
        this.updateHUD();
        this.updateShopEquipments(false); // 刷新商店，移除扩容选项
    }
    
        
        // 延迟后进入下一层
    /**
     * 打开铁匠铺界面
     */
    openBlacksmith() {
        const modal = document.getElementById('blacksmith-modal');
        if (!modal) {
            console.error('openBlacksmith: blacksmith-modal not found');
            return;
        }
        
        // 默认显示普通模式
        this.switchToNormalMode();
        
        modal.classList.add('show');
        this.paused = true;
        this.updateBlacksmithEquipmentList();
        this.updateFusionUI();
        // 清空之前选中的装备，确保界面正确显示
        const infoDiv = document.getElementById('blacksmith-item-info');
        const upgradeDiv = document.getElementById('blacksmith-upgrade-info');
        const refineSection = document.getElementById('blacksmith-refine-section');
        const btn = document.getElementById('blacksmith-upgrade-btn');
        if (infoDiv) {
            infoDiv.innerHTML = '<p style="color: #aaa; text-align: center;">请选择一个装备</p>';
        } else {
            console.error('openBlacksmith: blacksmith-item-info not found');
        }
        if (upgradeDiv) {
            upgradeDiv.innerHTML = '';
        } else {
            console.error('openBlacksmith: blacksmith-upgrade-info not found');
        }
        // 默认显示强化页签
        this.switchBlacksmithTab('upgrade');
        if (btn) {
            btn.style.display = 'none';
        } else {
            console.error('openBlacksmith: blacksmith-upgrade-btn not found');
        }
    }

    /**
     * 关闭铁匠铺界面
     */
    closeBlacksmith() {
        const modal = document.getElementById('blacksmith-modal');
        modal.classList.remove('show');
        // 切换回普通模式
        this.switchToNormalMode();
        const codexModal = document.getElementById('codex-modal');
        const shopModal = document.getElementById('shop-modal');
        const inventoryModal = document.getElementById('inventory-modal');
        const guideModal = document.getElementById('guide-modal');
        if (!this.devMode && !codexModal.classList.contains('show') && 
            !shopModal.classList.contains('show') && !inventoryModal.classList.contains('show') && 
            !guideModal.classList.contains('show')) {
            this.paused = false;
        }
    }

    /**
     * 根据选中的铁匠铺列表项获取对应的装备引用（用于区分同名不同精炼等级的装备）
     * @returns {Equipment|null}
     */
    getSelectedBlacksmithEquipment() {
        const selectedItem = document.querySelector('.blacksmith-item.selected');
        if (!selectedItem || !selectedItem.dataset.source) return null;
        if (selectedItem.dataset.source === 'equipment' && selectedItem.dataset.slot) {
            return this.player.equipment[selectedItem.dataset.slot] || null;
        }
        if (selectedItem.dataset.source === 'inventory' && selectedItem.dataset.index !== undefined) {
            const index = parseInt(selectedItem.dataset.index, 10);
            if (!isNaN(index) && this.player.inventory[index]) return this.player.inventory[index];
        }
        return null;
    }

    /**
     * 根据合铸槽位引用获取装备对象
     * @param {{ source: string, index?: number, slot?: string }} ref
     * @returns {Equipment|null}
     */
    getFusionEquipment(ref) {
        if (!ref) return null;
        if (ref.source === 'equipment' && ref.slot) return this.player.equipment[ref.slot] || null;
        if (ref.source === 'inventory' && ref.index !== undefined) {
            const eq = this.player.inventory[ref.index];
            return (eq && eq.type === 'equipment') ? eq : null;
        }
        return null;
    }

    /**
     * 移除合铸装备选择浮层（若存在）
     */
    closeFusionPickerModalIfOpen() {
        const m = document.getElementById('fusion-picker-modal');
        if (m && m.parentNode) m.remove();
    }

    /**
     * 判断两个合铸槽引用是否指向同一装备实例
     */
    _fusionRefsEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;
        if (a.source !== b.source) return false;
        if (a.source === 'equipment') return a.slot === b.slot;
        return a.index === b.index;
    }

    /**
     * 清空合铸两槽已选装备
     */
    clearFusionSlots() {
        this.fusionSelection.slotA = null;
        this.fusionSelection.slotB = null;
        this.updateFusionUI();
    }

    getFusionGoldCost(quality) {
        const map = { common: 100, rare: 200, fine: 300, epic: 500, legendary: 1000 };
        return map[quality] != null ? map[quality] : 100;
    }

    _expectedFusionQualityForPair(eqA, eqB) {
        const qualityOrder = { common: 0, rare: 1, fine: 2, epic: 3, legendary: 4 };
        const names = ['common', 'rare', 'fine', 'epic', 'legendary'];
        const qA = qualityOrder[eqA.quality] != null ? qualityOrder[eqA.quality] : 0;
        const qB = qualityOrder[eqB.quality] != null ? qualityOrder[eqB.quality] : 0;
        return names[Math.max(qA, qB)] || 'common';
    }

    _formatFusionRemainMs(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    getFusionTownStatusText() {
        this._tryCompleteFusionJob();
        const s = this.fusionState;
        if (!s) return '合铸空闲';
        if (s.phase === 'processing') {
            return '合铸中 ' + this._formatFusionRemainMs(s.readyAt - Date.now());
        }
        if (s.phase === 'ready') return '合铸完成（可领取）';
        return '合铸空闲';
    }

    _restoreFusionStash(stash) {
        if (!stash || !stash.length) return;
        const inv = stash.filter(x => x.ref && x.ref.source === 'inventory').sort((a, b) => (b.ref.index || 0) - (a.ref.index || 0));
        const eqSlots = stash.filter(x => x.ref && x.ref.source === 'equipment');
        inv.forEach(({ ref, serialized }) => {
            const item = this.deserializeEquipment(serialized);
            this.player.inventory.splice(ref.index, 0, item);
        });
        eqSlots.forEach(({ ref, serialized }) => {
            this.player.equipment[ref.slot] = this.deserializeEquipment(serialized);
            if (typeof this.player.onEquipmentSlotChanged === 'function') this.player.onEquipmentSlotChanged(ref.slot);
        });
    }

    _buildFusionReadyPayloadFromResult(result, eqA, eqB, stash, fusionPairKeyEarly) {
        let fusionDisplayName = result.name;
        if (fusionPairKeyEarly && this.assetManager && typeof this.assetManager.getFusionDisplayNameForPair === 'function') {
            const cachedName = this.assetManager.getFusionDisplayNameForPair(fusionPairKeyEarly);
            if (cachedName) fusionDisplayName = cachedName;
            else if (typeof this.assetManager.registerFusionDisplayNameForPair === 'function') {
                this.assetManager.registerFusionDisplayNameForPair(fusionPairKeyEarly, result.name);
            }
        }
        const slot = eqA.slot;
        const quality = this._expectedFusionQualityForPair(eqA, eqB);
        const fusedLevel = Math.max(Number(eqA.level) || 1, Number(eqB.level) || 1);
        const setIdA = (eqA.fusionSetIds && eqA.fusionSetIds[0]) || (typeof getSetForEquipment === 'function' ? getSetForEquipment(eqA.name) : null);
        const setIdB = (eqB.fusionSetIds && eqB.fusionSetIds[0]) || (typeof getSetForEquipment === 'function' ? getSetForEquipment(eqB.name) : null);
        const fusionSetIds = [...new Set([setIdA, setIdB].filter(Boolean))];
        const rangedWeapon = slot === 'weapon' ? this._fusionWeaponIsRanged(eqA) : null;
        const newEq = new Equipment({
            id: 'fusion_' + Date.now(),
            name: fusionDisplayName,
            slot,
            ...(slot === 'weapon' ? { weaponType: rangedWeapon ? 'ranged' : 'melee' } : {}),
            quality,
            level: fusedLevel,
            stats: { ...result.baseStats },
            equipmentTraits: { id: result.traitId, description: result.traitDescription },
            fusionSetIds: fusionSetIds.length ? fusionSetIds : null,
            fusionPairKey: fusionPairKeyEarly
        });
        const ser0 = stash[0].serialized;
        const ser1 = stash[1].serialized;
        return {
            newEqSerialized: this.serializeEquipment(newEq),
            eqASerialized: this.serializeEquipment(eqA),
            eqBSerialized: this.serializeEquipment(eqB),
            fusionDisplayName,
            fusionPairKeyEarly,
            fusionMeta: { slot, quality, traitDescription: result.traitDescription || '' },
            anim: {
                nameA: ser0.name || '装备A',
                nameB: ser1.name || '装备B',
                qA: ser0.quality || 'common',
                qB: ser1.quality || 'common',
                resultName: fusionDisplayName,
                resultQ: quality,
                slot
            }
        };
    }

    _tryCompleteFusionJob() {
        const s = this.fusionState;
        if (!s || s.phase !== 'processing') return;
        if (!s.pendingFuseResult) return;
        if (Date.now() < s.readyAt) return;
        const eqA = this.deserializeEquipment(s.stash[0].serialized);
        const eqB = this.deserializeEquipment(s.stash[1].serialized);
        const payload = this._buildFusionReadyPayloadFromResult(s.pendingFuseResult, eqA, eqB, s.stash, s.pairKeyEarly);
        s.phase = 'ready';
        s.readyPayload = payload;
        delete s.pendingFuseResult;
        delete s.stash;
        this.fusionCompletionBannerShown = false;
        this._onFusionReadyForUI();
    }

    _onFusionReadyForUI() {
        this.updateFusionUI();
        this.updateBlacksmithEquipmentList();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        this.updateHUD();
        if (this.currentScene === SCENE_TYPES.TOWN && !this.fusionCompletionBannerShown) {
            const modal = document.getElementById('fusion-town-complete-modal');
            if (modal) {
                modal.classList.add('show');
                this.fusionCompletionBannerShown = true;
            }
        }
    }

    hideFusionTownCompleteModal() {
        const modal = document.getElementById('fusion-town-complete-modal');
        if (modal) modal.classList.remove('show');
    }

    onBlacksmithFusionButtonClick() {
        if (this.fusionState && this.fusionState.phase === 'ready') {
            this.hideFusionTownCompleteModal();
            this.startFusionClaimReveal();
            return;
        }
        this.doFusion();
    }

    _abortFusionJob(err) {
        const s = this.fusionState;
        if (!s || s.phase !== 'processing') return;
        const stash = s.stash;
        const gold = s.goldSpent || 0;
        this.fusionState = null;
        if (gold) this.player.gold += gold;
        if (stash) this._restoreFusionStash(stash);
        this.updateFusionUI();
        this.updateBlacksmithEquipmentList();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        this.updateHUD();
        const previewEl = document.getElementById('blacksmith-fusion-preview');
        const msg = err && err.message ? err.message : String(err || '未知错误');
        if (previewEl) previewEl.textContent = '合铸失败（已退回材料与金币）：' + msg;
        console.error('合铸失败', err);
    }

    _startFusionAsyncJob(stash, eqA, eqB, goldSpent) {
        const gameContext = this.getFusionGameContext();
        const readyAt = Date.now() + 30000;
        const pairKeyEarly = (typeof FusionIconAPI !== 'undefined' && FusionIconAPI.computeFusionPairKey)
            ? FusionIconAPI.computeFusionPairKey(eqA, eqB)
            : null;
        const jobReadyAt = readyAt;
        this.fusionState = {
            phase: 'processing',
            readyAt: jobReadyAt,
            goldSpent: goldSpent || 0,
            stash,
            pairKeyEarly,
            pendingFuseResult: null
        };
        const fusePromise = window.HezhuAPI.fuse(gameContext, eqA, eqB).then(r => {
            if (this.fusionState && this.fusionState.phase === 'processing' && this.fusionState.readyAt === jobReadyAt) {
                this.fusionState.pendingFuseResult = r;
                this.fusionState.pendingFuseResultJson = r;
            }
            return r;
        });
        const minDelay = new Promise(resolve => setTimeout(resolve, 30000));
        Promise.all([fusePromise, minDelay]).then(() => {
            if (this.fusionState && this.fusionState.phase === 'processing' && this.fusionState.readyAt === jobReadyAt) {
                this._tryCompleteFusionJob();
            }
        }).catch(err => {
            if (this.fusionState && this.fusionState.phase === 'processing' && this.fusionState.readyAt === jobReadyAt) {
                this._abortFusionJob(err);
            }
        });
    }

    resumeFusionJobAfterImport() {
        const s = this.fusionState;
        if (!s || s.phase !== 'processing' || !s.stash || s.stash.length !== 2) return;
        if (s.pendingFuseResultJson && !s.pendingFuseResult) s.pendingFuseResult = s.pendingFuseResultJson;
        const eqA = this.deserializeEquipment(s.stash[0].serialized);
        const eqB = this.deserializeEquipment(s.stash[1].serialized);
        const gameContext = this.getFusionGameContext();
        const waitMs = Math.max(0, s.readyAt - Date.now());
        const minDelay = new Promise(resolve => setTimeout(resolve, waitMs));
        const jobReadyAt = s.readyAt;
        let fusePromise;
        if (s.pendingFuseResultJson) {
            fusePromise = Promise.resolve(s.pendingFuseResultJson);
        } else {
            fusePromise = window.HezhuAPI.fuse(gameContext, eqA, eqB).then(r => {
                if (this.fusionState && this.fusionState.readyAt === jobReadyAt && this.fusionState.phase === 'processing') {
                    this.fusionState.pendingFuseResultJson = r;
                    this.fusionState.pendingFuseResult = r;
                }
                return r;
            });
        }
        Promise.all([fusePromise, minDelay]).then(() => {
            if (this.fusionState && this.fusionState.readyAt === jobReadyAt && this.fusionState.phase === 'processing') {
                this._tryCompleteFusionJob();
            }
        }).catch(err => {
            if (this.fusionState && this.fusionState.readyAt === jobReadyAt && this.fusionState.phase === 'processing') {
                this._abortFusionJob(err);
            }
        });
    }

    /**
     * 合铸领取：两件装备贴图沿曲线平移至中央 → 白光扩散 → 中央显示新装备贴图（仅平移，无旋转）
     */
    startFusionClaimReveal() {
        const s = this.fusionState;
        if (!s || s.phase !== 'ready' || !s.readyPayload) return;
        const overlay = document.getElementById('fusion-reveal-overlay');
        if (!overlay) {
            this._grantFusionRewardWithoutReveal();
            return;
        }
        const p = s.readyPayload;
        const anim = p.anim;
        const flyA = document.getElementById('fusion-reveal-fly-a');
        const flyB = document.getElementById('fusion-reveal-fly-b');
        const center = document.getElementById('fusion-reveal-center');
        const hint = document.getElementById('fusion-reveal-hint');
        let flash = document.getElementById('fusion-reveal-flash');
        if (!flyA || !flyB || !center) {
            this._grantFusionRewardWithoutReveal();
            return;
        }
        if (!flash) {
            flash = document.createElement('div');
            flash.id = 'fusion-reveal-flash';
            overlay.insertBefore(flash, overlay.firstChild);
        }
        const eqA = this.deserializeEquipment(p.eqASerialized);
        const eqB = this.deserializeEquipment(p.eqBSerialized);
        const newEq = this.deserializeEquipment(p.newEqSerialized);
        const qc = (q) => (QUALITY_COLORS && QUALITY_COLORS[q]) ? QUALITY_COLORS[q] : '#aaa';
        flyA.innerHTML = '';
        flyB.innerHTML = '';
        center.innerHTML = '';
        const iconA = document.createElement('div');
        iconA.className = 'fusion-reveal-icon';
        iconA.style.borderColor = qc(anim.qA);
        const iconB = document.createElement('div');
        iconB.className = 'fusion-reveal-icon';
        iconB.style.borderColor = qc(anim.qB);
        const iconR = document.createElement('div');
        iconR.className = 'fusion-reveal-icon fusion-reveal-icon-result';
        iconR.style.borderColor = qc(anim.resultQ);
        flyA.appendChild(iconA);
        flyB.appendChild(iconB);
        center.appendChild(iconR);
        overlay.style.display = 'flex';
        overlay.setAttribute('data-awaiting-grant', '1');
        if (hint) {
            hint.textContent = '';
            hint.style.opacity = '0';
        }
        center.style.opacity = '0';
        flash.classList.remove('fusion-reveal-flash-active');
        flash.style.opacity = '';
        flyA.style.opacity = '1';
        flyB.style.opacity = '1';
        flyA.style.transition = 'none';
        flyB.style.transition = 'none';
        overlay.setAttribute('data-phase', 'anim');
        if (this._fusionRevealClickHandler) {
            overlay.removeEventListener('click', this._fusionRevealClickHandler);
        }
        this._fusionRevealClickHandler = (ev) => {
            if (overlay.getAttribute('data-phase') !== 'awaitClose') return;
            ev.preventDefault();
            ev.stopPropagation();
            this._finishFusionRevealAndGrant();
        };
        overlay.addEventListener('click', this._fusionRevealClickHandler);
        const loadPromises = [];
        if (this.assetManager && typeof this.assetManager.setEquipmentBackgroundImage === 'function') {
            loadPromises.push(this.assetManager.setEquipmentBackgroundImage(iconA, eqA.name, eqA.quality, eqA));
            loadPromises.push(this.assetManager.setEquipmentBackgroundImage(iconB, eqB.name, eqB.quality, eqB));
            loadPromises.push(this.assetManager.setEquipmentBackgroundImage(iconR, newEq.name, newEq.quality, newEq));
        }
        Promise.all(loadPromises).then(() => {
            this._runFusionRevealMotionAndFlash(overlay, flyA, flyB, center, flash, hint);
        }).catch(() => {
            this._runFusionRevealMotionAndFlash(overlay, flyA, flyB, center, flash, hint);
        });
    }

    /**
     * 二次贝塞尔曲线上的点（用于合铸领取动画轨迹）
     */
    _fusionBezierQuadratic(p0, p1, p2, t) {
        const u = 1 - t;
        return {
            x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
            y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
        };
    }

    _runFusionRevealMotionAndFlash(overlay, flyA, flyB, center, flash, hint) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cx = vw / 2;
        const cy = vh / 2;
        const margin = 52;
        const p0a = { x: margin, y: margin };
        const p0b = { x: vw - margin, y: vh - margin };
        const p2 = { x: cx, y: cy };
        const dxA = p2.x - p0a.x;
        const dyA = p2.y - p0a.y;
        const lenA = Math.hypot(dxA, dyA) || 1;
        const p1a = {
            x: (p0a.x + p2.x) / 2 + (-dyA / lenA) * lenA * 0.32,
            y: (p0a.y + p2.y) / 2 + (dxA / lenA) * lenA * 0.32
        };
        const dxB = p2.x - p0b.x;
        const dyB = p2.y - p0b.y;
        const lenB = Math.hypot(dxB, dyB) || 1;
        const p1b = {
            x: (p0b.x + p2.x) / 2 + (dyB / lenB) * lenB * 0.32,
            y: (p0b.y + p2.y) / 2 + (-dxB / lenB) * lenB * 0.32
        };
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);
        const dur = 1600;
        const t0 = performance.now();
        let flashEnded = false;
        const finishFlash = () => {
            if (flashEnded) return;
            flashEnded = true;
            flash.classList.remove('fusion-reveal-flash-active');
            flash.style.opacity = '0';
            center.style.opacity = '1';
            if (hint) {
                hint.textContent = '再次点击屏幕关闭';
                hint.style.opacity = '1';
            }
            overlay.setAttribute('data-phase', 'awaitClose');
        };
        const tick = (now) => {
            const raw = Math.min(1, (now - t0) / dur);
            const e = easeOut(raw);
            const pa = this._fusionBezierQuadratic(p0a, p1a, p2, e);
            const pb = this._fusionBezierQuadratic(p0b, p1b, p2, e);
            flyA.style.left = pa.x + 'px';
            flyA.style.top = pa.y + 'px';
            flyA.style.transform = 'translate(-50%, -50%)';
            flyB.style.left = pb.x + 'px';
            flyB.style.top = pb.y + 'px';
            flyB.style.transform = 'translate(-50%, -50%)';
            if (raw < 1) {
                requestAnimationFrame(tick);
            } else {
                flyA.style.opacity = '0';
                flyB.style.opacity = '0';
                flash.classList.add('fusion-reveal-flash-active');
                flash.addEventListener('animationend', finishFlash, { once: true });
                setTimeout(finishFlash, 780);
            }
        };
        requestAnimationFrame(tick);
    }

    _finishFusionRevealAndGrant() {
        const overlay = document.getElementById('fusion-reveal-overlay');
        if (overlay && this._fusionRevealClickHandler) {
            overlay.removeEventListener('click', this._fusionRevealClickHandler);
            this._fusionRevealClickHandler = null;
        }
        if (overlay) {
            overlay.style.display = 'none';
            overlay.setAttribute('data-phase', '');
        }
        this._grantFusionRewardWithoutReveal();
    }

    _grantFusionRewardWithoutReveal() {
        const s = this.fusionState;
        if (!s || s.phase !== 'ready' || !s.readyPayload) return;
        const p = s.readyPayload;
        const newEq = this.deserializeEquipment(p.newEqSerialized);
        const fusionDisplayName = p.fusionDisplayName;
        const fusionMeta = p.fusionMeta;
        const eqAIcon = p.eqASerialized ? this.deserializeEquipment(p.eqASerialized) : newEq;
        const eqBIcon = p.eqBSerialized ? this.deserializeEquipment(p.eqBSerialized) : newEq;
        this.fusionState = null;
        this.fusionSelection.slotA = null;
        this.fusionSelection.slotB = null;
        const added = this.addItemToInventory(newEq);
        if (!added) this.player.inventory.push(newEq);
        this.updateFusionUI();
        this.updateBlacksmithEquipmentList();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        this.hideFusionTownCompleteModal();
        const previewEl = document.getElementById('blacksmith-fusion-preview');
        if (previewEl) previewEl.textContent = '合铸成功：' + fusionDisplayName + '（正在生成专属贴图…）';
        if (typeof showFloatingText === 'function') showFloatingText(this, '合铸成功', this.player.x, this.player.y - 40, '#88ff88');
        this.updateHUD();
        if (typeof FusionIconAPI !== 'undefined' && FusionIconAPI.requestAndApply) {
            FusionIconAPI.requestAndApply(this, fusionDisplayName, eqAIcon, eqBIcon, fusionMeta).then(() => {
                this.updateInventoryUI();
                this.updateBlacksmithEquipmentList();
                if (previewEl) previewEl.textContent = '合铸成功：' + fusionDisplayName + '（贴图已生成）';
            }).catch(function (iconErr) {
                console.warn('合铸装备贴图生成失败', iconErr);
                if (previewEl) previewEl.textContent = '合铸成功：' + fusionDisplayName + '（贴图生成失败，可稍后在有 Key 时重进游戏再试）';
            });
        }
    }

    _updateFusionWeaponParticles(now) {
        const w = this.player.equipment.weapon;
        if (!w || w.type !== 'equipment' || !w.fusionPairKey) return;
        if (!this.particleManager) return;
        if (now - (this.lastFusionWeaponParticleTime || 0) < 90) return;
        this.lastFusionWeaponParticleTime = now;
        const col = (typeof QUALITY_COLORS !== 'undefined' && QUALITY_COLORS[w.quality]) ? QUALITY_COLORS[w.quality] : '#ffffff';
        const ang = typeof this.player.angle === 'number' ? this.player.angle : 0;
        const reach = (this.player.size || 20) * 0.55;
        const ox = this.player.x + Math.cos(ang) * reach;
        const oy = this.player.y + Math.sin(ang) * reach;
        this.particleManager.createSystem(ox, oy, {
            color: col,
            size: 2,
            count: 8,
            lifetime: 450,
            fadeoutTime: 280,
            speed: 0.55,
            angleSpread: Math.PI * 2,
            pixelStyle: true
        });
    }

    /**
     * 合铸用：武器是否为远程（与战斗判定一致，含 weaponType 与名称兜底）
     * @param {Equipment} eq
     * @returns {boolean|null} 非武器返回 null
     */
    _fusionWeaponIsRanged(eq) {
        if (!eq || eq.slot !== 'weapon') return null;
        if (typeof isPlayerWeaponRanged === 'function') return isPlayerWeaponRanged(eq);
        return eq.weaponType === 'ranged';
    }

    /**
     * 合铸用游戏上下文（词条、套装、部位）
     */
    getFusionGameContext() {
        const traits = [];
        if (typeof Equipment !== 'undefined' && Equipment.nameTraits) {
            const seen = new Set();
            Object.values(Equipment.nameTraits).forEach(t => {
                if (t && t.id && t.description && !seen.has(t.id)) { seen.add(t.id); traits.push({ id: t.id, description: t.description }); }
            });
        }
        const sets = [];
        if (typeof SET_DEFINITIONS !== 'undefined') {
            Object.entries(SET_DEFINITIONS).forEach(([id, data]) => {
                sets.push({ id, name: data.name, effects: data.effects || {} });
            });
        }
        const slots = typeof SLOT_NAMES !== 'undefined' ? Object.keys(SLOT_NAMES) : ['weapon', 'helmet', 'chest', 'legs', 'boots', 'necklace', 'ring', 'belt'];
        return { traits, sets, slots };
    }

    /**
     * 更新合铸槽位显示与预览、按钮状态
     */
    updateFusionUI() {
        this._tryCompleteFusionJob();
        const slotADiv = document.getElementById('blacksmith-fusion-slot-a');
        const slotBDiv = document.getElementById('blacksmith-fusion-slot-b');
        const previewEl = document.getElementById('blacksmith-fusion-preview');
        const btn = document.getElementById('blacksmith-fusion-btn');
        if (!slotADiv || !slotBDiv) return;

        if (this.fusionState && this.fusionState.phase === 'processing') {
            const ms = this.fusionState.readyAt - Date.now();
            slotADiv.textContent = '锻炉中…';
            slotBDiv.textContent = '锻炉中…';
            if (previewEl) previewEl.textContent = '合铸进行中，锻炉剩余 ' + this._formatFusionRemainMs(ms) + '（材料与金币已投入）。';
            if (btn) {
                btn.disabled = true;
                btn.textContent = '合铸中…';
            }
            return;
        }
        if (this.fusionState && this.fusionState.phase === 'ready') {
            const name = this.fusionState.readyPayload && this.fusionState.readyPayload.fusionDisplayName ? this.fusionState.readyPayload.fusionDisplayName : '新装备';
            slotADiv.textContent = '已完成';
            slotBDiv.textContent = '已完成';
            if (previewEl) previewEl.textContent = '合铸完成：「' + name + '」。点击「领取合铸结果」查看合成动画并入背包。';
            if (btn) {
                btn.disabled = false;
                btn.textContent = '领取合铸结果';
            }
            return;
        }

        const eqA = this.getFusionEquipment(this.fusionSelection.slotA);
        const eqB = this.getFusionEquipment(this.fusionSelection.slotB);
        slotADiv.textContent = eqA ? `${eqA.name}${eqA.enhanceLevel > 0 ? '+' + eqA.enhanceLevel : ''}` : '点击选择';
        slotBDiv.textContent = eqB ? `${eqB.name}${eqB.enhanceLevel > 0 ? '+' + eqB.enhanceLevel : ''}` : '点击选择';
        let canFuse = false;
        let previewText = '请选择两件相同部位且拥有不同词条的装备；武器须同为近战或同为远程。';
        if (eqA && eqB) {
            if (eqA.slot !== eqB.slot) {
                previewText = '合铸仅允许两件相同部位（如均为武器）的装备，请更换其中一件。';
            } else if (eqA.slot === 'weapon' && this._fusionWeaponIsRanged(eqA) !== this._fusionWeaponIsRanged(eqB)) {
                previewText = '近战武器与远程武器不能合铸，请更换其中一件。';
            } else {
                const idA = eqA.equipmentTraits && eqA.equipmentTraits.id ? eqA.equipmentTraits.id : '';
                const idB = eqB.equipmentTraits && eqB.equipmentTraits.id ? eqB.equipmentTraits.id : '';
                if (idA && idB && idA !== idB) {
                    canFuse = true;
                    const q = this._expectedFusionQualityForPair(eqA, eqB);
                    const cost = this.getFusionGoldCost(q);
                    const qn = (typeof QUALITY_NAMES !== 'undefined' && QUALITY_NAMES[q]) ? QUALITY_NAMES[q] : q;
                    previewText = '已选两件同部位、不同词条装备。成装品质按较高者计为「' + qn + '」，合铸消耗 ' + cost + ' 金币（锻炉时间 30 秒）。新装备将同时计入两件原材料所属套装。';
                    if (this.player.gold < cost) {
                        canFuse = false;
                        previewText += ' 当前金币不足。';
                    }
                } else {
                    previewText = '两件装备词条相同或缺少词条，请更换其中一件。';
                }
            }
        }
        if (previewEl) previewEl.textContent = previewText;
        if (btn) {
            btn.textContent = '合铸';
            btn.disabled = !canFuse;
        }
    }

    /**
     * 打开合铸装备选择器（选一件放入指定槽位）
     * @param {'A'|'B'} which - 'A' 或 'B'
     */
    openFusionPicker(which) {
        this.closeFusionPickerModalIfOpen();
        const list = [];
        Object.entries(this.player.equipment).forEach(([slot, eq]) => {
            if (eq && eq.type === 'equipment') list.push({ source: 'equipment', slot, eq });
        });
        this.player.inventory.forEach((eq, index) => {
            if (eq && eq.type === 'equipment') list.push({ source: 'inventory', index, eq });
        });
        const otherRef = which === 'A' ? this.fusionSelection.slotB : this.fusionSelection.slotA;
        const otherEq = this.getFusionEquipment(otherRef);
        const filterSlot = otherEq ? otherEq.slot : null;
        let pickList = filterSlot ? list.filter(({ eq }) => eq.slot === filterSlot) : list;
        if (otherEq && otherEq.slot === 'weapon') {
            const wantRanged = this._fusionWeaponIsRanged(otherEq);
            pickList = pickList.filter(({ eq }) => eq.slot !== 'weapon' || this._fusionWeaponIsRanged(eq) === wantRanged);
        }
        if (list.length === 0) {
            if (typeof showFloatingText === 'function') showFloatingText(this, '没有可选的装备', this.player.x, this.player.y - 40, '#ffaa00');
            return;
        }
        if (pickList.length === 0 && filterSlot) {
            const slotLabel = (typeof SLOT_NAMES !== 'undefined' && SLOT_NAMES[filterSlot]) ? SLOT_NAMES[filterSlot] : filterSlot;
            let msg = '没有可合铸的「' + slotLabel + '」部位装备';
            if (otherEq && otherEq.slot === 'weapon') {
                msg = '没有可合铸的' + (this._fusionWeaponIsRanged(otherEq) ? '远程' : '近战') + '武器';
            }
            if (typeof showFloatingText === 'function') showFloatingText(this, msg, this.player.x, this.player.y - 40, '#ffaa00');
            return;
        }
        const modal = document.createElement('div');
        modal.id = 'fusion-picker-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#2a2a35;border:2px solid #555;border-radius:12px;padding:16px;max-width:400px;max-height:70vh;overflow-y:auto;';
        let pickerTitleSuffix = '';
        if (filterSlot === 'weapon' && otherEq) {
            pickerTitleSuffix = '，且须同为<strong>' + (this._fusionWeaponIsRanged(otherEq) ? '远程' : '近战') + '武器</strong>';
        }
        const pickerTitle = filterSlot
            ? '<p style="color:#fff;margin-bottom:12px;">选择一件装备（需与另一槽<strong>同部位</strong>：' + ((typeof SLOT_NAMES !== 'undefined' && SLOT_NAMES[filterSlot]) ? SLOT_NAMES[filterSlot] : filterSlot) + pickerTitleSuffix + '）</p>'
            : '<p style="color:#fff;margin-bottom:12px;">选择一件装备（第二件须与第一件<strong>同部位</strong>；武器须同为近战或远程）</p>';
        box.innerHTML = pickerTitle;
        pickList.forEach(({ source, slot, index, eq }) => {
            const ref = source === 'equipment' ? { source: 'equipment', slot } : { source: 'inventory', index };
            const isSameAsOther = (which === 'A' && this.fusionSelection.slotB && this.fusionSelection.slotB.source === ref.source && (ref.slot ? this.fusionSelection.slotB.slot === ref.slot : this.fusionSelection.slotB.index === ref.index))
                || (which === 'B' && this.fusionSelection.slotA && this.fusionSelection.slotA.source === ref.source && (ref.slot ? this.fusionSelection.slotA.slot === ref.slot : this.fusionSelection.slotA.index === ref.index));
            const row = document.createElement('div');
            row.style.cssText = 'padding:10px;margin:4px 0;background:rgba(60,60,70,0.8);border-radius:8px;cursor:pointer;color:' + (QUALITY_COLORS[eq.quality] || '#fff') + ';';
            row.textContent = eq.name + (eq.enhanceLevel > 0 ? '+' + eq.enhanceLevel : '') + ' · ' + (SLOT_NAMES[eq.slot] || eq.slot) + (eq.equipmentTraits && eq.equipmentTraits.description ? ' · ' + eq.equipmentTraits.description.slice(0, 20) + '…' : '');
            if (isSameAsOther) row.style.opacity = '0.5';
            row.addEventListener('click', () => {
                if (isSameAsOther) return;
                const key = which === 'A' ? 'slotA' : 'slotB';
                const currentRef = this.fusionSelection[key];
                if (this._fusionRefsEqual(ref, currentRef)) {
                    this.fusionSelection[key] = null;
                } else {
                    this.fusionSelection[key] = ref;
                }
                modal.remove();
                this.updateFusionUI();
            });
            box.appendChild(row);
        });
        modal.appendChild(box);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    /**
     * 执行合铸：调用 API，创建新装备，移除两件原材料，刷新界面
     */
    doFusion() {
        this._tryCompleteFusionJob();
        if (this.fusionState) return;
        const eqA = this.getFusionEquipment(this.fusionSelection.slotA);
        const eqB = this.getFusionEquipment(this.fusionSelection.slotB);
        if (!eqA || !eqB) return;
        if (eqA.slot !== eqB.slot) return;
        if (eqA.slot === 'weapon' && this._fusionWeaponIsRanged(eqA) !== this._fusionWeaponIsRanged(eqB)) return;
        const idA = eqA.equipmentTraits && eqA.equipmentTraits.id ? eqA.equipmentTraits.id : '';
        const idB = eqB.equipmentTraits && eqB.equipmentTraits.id ? eqB.equipmentTraits.id : '';
        if (!idA || !idB || idA === idB) return;
        const quality = this._expectedFusionQualityForPair(eqA, eqB);
        const cost = this.getFusionGoldCost(quality);
        const previewEl = document.getElementById('blacksmith-fusion-preview');
        if (this.player.gold < cost) {
            if (previewEl) previewEl.textContent = '金币不足：合铸需要 ' + cost + ' 金币。';
            return;
        }
        const refA = this.fusionSelection.slotA;
        const refB = this.fusionSelection.slotB;
        const stash = [
            { ref: { source: refA.source, slot: refA.slot, index: refA.index }, serialized: this.serializeEquipment(eqA) },
            { ref: { source: refB.source, slot: refB.slot, index: refB.index }, serialized: this.serializeEquipment(eqB) }
        ];
        this.player.gold -= cost;
        const refs = [refA, refB].sort((a, b) => {
            if (a.source !== 'inventory' || b.source !== 'inventory') return 0;
            return (b.index || 0) - (a.index || 0);
        });
        refs.forEach(ref => {
            if (ref.source === 'equipment') delete this.player.equipment[ref.slot];
            else this.player.inventory.splice(ref.index, 1);
        });
        refs.forEach(ref => {
            if (ref.source === 'equipment' && ref.slot && typeof this.player.onEquipmentSlotChanged === 'function') {
                this.player.onEquipmentSlotChanged(ref.slot);
            }
        });
        this.fusionSelection.slotA = null;
        this.fusionSelection.slotB = null;
        this._startFusionAsyncJob(stash, eqA, eqB, cost);
        this.updateFusionUI();
        this.updateBlacksmithEquipmentList();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        this.updateHUD();
    }

    /**
     * 更新铁匠铺装备列表
     */
    updateBlacksmithEquipmentList() {
        const container = document.getElementById('blacksmith-items');
        container.innerHTML = '';
        
        // 显示所有已装备的装备（用 slot 区分，避免同名同 id 时选错）
        Object.entries(this.player.equipment).forEach(([slot, eq]) => {
            if (eq && eq.type === 'equipment') {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'blacksmith-item';
                itemDiv.dataset.itemId = eq.id;
                itemDiv.dataset.source = 'equipment';
                itemDiv.dataset.slot = slot;
                
                // 创建装备图标
                // 使用通用函数创建装备图标（边框由函数统一处理）
                const equipmentIcon = this.createItemIcon(eq, {
                    size: 40,
                    style: { marginRight: '10px' }
                });
                
                const contentDiv = document.createElement('div');
                contentDiv.style.display = 'flex';
                contentDiv.style.alignItems = 'center';
                contentDiv.innerHTML = `
                    <div style="flex: 1;">
                        <div style="color: ${QUALITY_COLORS[eq.quality]}">
                            <strong>${eq.name}</strong> ${eq.enhanceLevel > 0 ? `+${eq.enhanceLevel}` : ''} ${eq.refineLevel > 0 ? '★'.repeat(eq.refineLevel) : ''}
                        </div>
                        <div style="font-size: 12px; color: #aaa;">${SLOT_NAMES[eq.slot]}</div>
                    </div>
                `;
                contentDiv.insertBefore(equipmentIcon, contentDiv.firstChild);
                itemDiv.appendChild(contentDiv);
                
                itemDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.blacksmith-item').forEach(i => i.classList.remove('selected'));
                    itemDiv.classList.add('selected');
                    try {
                        this.showBlacksmithDetails(eq);
                        // 切换到强化页签
                        this.switchBlacksmithTab('upgrade');
                    } catch (error) {
                        console.error('显示装备详情出错:', error, eq);
                    }
                });
                container.appendChild(itemDiv);
            }
        });
        
        // 显示背包中的装备（用 index 区分，避免同名同 id 时选错）
        this.player.inventory.forEach((eq, index) => {
            if (eq && eq.type === 'equipment') {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'blacksmith-item';
                itemDiv.dataset.itemId = eq.id;
                itemDiv.dataset.source = 'inventory';
                itemDiv.dataset.index = String(index);
                
                // 创建装备图标
                // 使用通用函数创建装备图标（边框由函数统一处理）
                const equipmentIcon = this.createItemIcon(eq, {
                    size: 40,
                    style: { marginRight: '10px' }
                });
                
                const contentDiv = document.createElement('div');
                contentDiv.style.display = 'flex';
                contentDiv.style.alignItems = 'center';
                contentDiv.innerHTML = `
                    <div style="flex: 1;">
                        <div style="color: ${QUALITY_COLORS[eq.quality]}">
                            <strong>${eq.name}</strong> ${eq.enhanceLevel > 0 ? `+${eq.enhanceLevel}` : ''} ${eq.refineLevel > 0 ? '★'.repeat(eq.refineLevel) : ''}
                        </div>
                        <div style="font-size: 12px; color: #aaa;">${SLOT_NAMES[eq.slot]}</div>
                    </div>
                `;
                contentDiv.insertBefore(equipmentIcon, contentDiv.firstChild);
                itemDiv.appendChild(contentDiv);
                
                itemDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    document.querySelectorAll('.blacksmith-item').forEach(i => i.classList.remove('selected'));
                    itemDiv.classList.add('selected');
                    try {
                        this.showBlacksmithDetails(eq);
                        // 切换到强化页签
                        this.switchBlacksmithTab('upgrade');
                    } catch (error) {
                        console.error('显示装备详情出错:', error, eq);
                    }
                });
                container.appendChild(itemDiv);
            }
        });
    }

    /**
     * 显示铁匠铺装备详情
     * @param {Equipment} equipment - 要显示的装备
     */
    showBlacksmithDetails(equipment) {
        try {
            if (!equipment) {
                console.error('showBlacksmithDetails: equipment is null or undefined');
                return;
            }
            
            console.log('showBlacksmithDetails called with equipment:', equipment);
            
            const infoDiv = document.getElementById('blacksmith-item-info');
            const upgradeDiv = document.getElementById('blacksmith-upgrade-info');
            const btn = document.getElementById('blacksmith-upgrade-btn');
            
            console.log('showBlacksmithDetails: elements found', { 
                infoDiv: !!infoDiv, 
                upgradeDiv: !!upgradeDiv, 
                btn: !!btn 
            });
            
            if (!infoDiv || !upgradeDiv || !btn) {
                console.error('showBlacksmithDetails: Required elements not found', { infoDiv, upgradeDiv, btn });
                return;
            }
            
            // 显示装备信息
            let html = `<h4 style="color: ${QUALITY_COLORS[equipment.quality] || '#fff'}">${equipment.name || '未知装备'}</h4>`;
            html += `<p>部位: ${SLOT_NAMES[equipment.slot] || equipment.slot || '未知'}</p>`;
            html += `<p>品质: ${QUALITY_NAMES[equipment.quality] || equipment.quality || '未知'}</p>`;
            html += `<p>等级: ${equipment.level || 1}</p>`;
            html += `<p>强化等级: +${equipment.enhanceLevel || 0}</p>`;
            html += `<p>精炼等级: ${equipment.refineLevel > 0 ? '★'.repeat(equipment.refineLevel) : '无'}</p>`;
            html += `<p>---</p>`;
            
            if (equipment.stats && typeof equipment.stats === 'object') {
                for (const [key, value] of Object.entries(equipment.stats)) {
                    if (value !== 0 && value !== null && value !== undefined) {
                        const statNames = {
                            attack: '攻击力',
                            critRate: '暴击率',
                            critDamage: '暴击伤害',
                            health: '生命值',
                            defense: '防御力',
                            dodge: '闪避率',
                            attackSpeed: '攻击速度',
                            moveSpeed: '移动速度'
                        };
                        // 格式化数值，最多保留2位小数
                        const formattedValue = typeof formatNumber === 'function' ? formatNumber(value) : value;
                        html += `<p>${statNames[key] || key}: ${formattedValue}${key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : ''}</p>`;
                    }
                }
            }
            
            // 显示武器技能（仅武器，含图标）
            if (equipment.slot === 'weapon' && equipment.skill) {
                const skillIconUrl = this.getSkillIconUrl(equipment.skill.name);
                const skillIconHtml = skillIconUrl ? `<img src="${skillIconUrl}" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:6px;border-radius:4px;">` : '';
                html += `<p>---</p>`;
                html += `<p style="color: #ffaa00;"><strong>${skillIconHtml}武器技能: ${equipment.skill.name}</strong></p>`;
                html += `<p style="color: #aaa; font-size: 11px;">${equipment.skill.description}</p>`;
                html += `<p style="color: #aaa; font-size: 11px;">冷却时间: ${equipment.skill.cooldown / 1000}秒</p>`;
                
                // 只在精炼页签显示精炼效果
                const refineTab = document.querySelector('.blacksmith-tab[data-tab="refine"]');
                if (refineTab && refineTab.classList.contains('active') && equipment.refineEffects) {
                    html += `<p>---</p>`;
                    html += `<p style="color: #ffd700;"><strong>精炼效果:</strong></p>`;
                    
                    for (let i = 0; i < equipment.refineEffects.length; i++) {
                        const refineEffect = equipment.refineEffects[i];
                        const refineLevel = i + 1;
                        const isCurrentLevel = equipment.refineLevel === refineLevel;
                        const isUnlocked = equipment.refineLevel >= refineLevel;
                        const color = isCurrentLevel ? '#ffd700' : (isUnlocked ? '#88ff88' : '#888888');
                        const starText = '★'.repeat(refineLevel);
                        
                        html += `<p style="color: ${color}; font-size: 10px; margin-left: 10px; margin-top: 3px;">${starText} 精炼${refineLevel}级: ${refineEffect.description}</p>`;
                    }
                }
            }
            
            infoDiv.innerHTML = html;
            console.log('showBlacksmithDetails: infoDiv updated');
            
            // 计算强化费用和成功率
            const baseCost = 50;
            const cost = baseCost * ((equipment.enhanceLevel || 0) + 1);
            const successRate = Math.max(10, 100 - (equipment.enhanceLevel || 0) * 10); // 每级降低10%成功率，最低10%
            
            upgradeDiv.innerHTML = `
                <div style="margin-top: 20px;">
                    <p><strong>强化费用:</strong> <span style="color: #ffd700;">${cost} 金币</span></p>
                    <p><strong>成功率:</strong> <span style="color: ${successRate >= 70 ? '#00ff00' : successRate >= 40 ? '#ffaa00' : '#ff0000'}">${successRate}%</span></p>
                    <p style="font-size: 12px; color: #aaa;">强化成功: 所有属性+10%</p>
                    <p style="font-size: 12px; color: #aaa;">强化失败: 消耗金币但无效果</p>
                </div>
            `;
            console.log('showBlacksmithDetails: upgradeDiv updated');
            
            btn.style.display = 'block';
            btn.dataset.itemId = equipment.id;
            // 保存精确定位信息，供强化时区分同名不同精炼等级的装备
            const eqSlot = equipment.slot ? Object.keys(this.player.equipment).find(s => this.player.equipment[s] === equipment) : null;
            const eqInvIndex = eqSlot == null ? this.player.inventory.indexOf(equipment) : -1;
            btn.dataset.source = eqSlot != null ? 'equipment' : 'inventory';
            btn.dataset.slot = eqSlot != null ? eqSlot : '';
            btn.dataset.equipmentIndex = String(eqInvIndex);
            btn.disabled = this.player.gold < cost;
            console.log('showBlacksmithDetails: btn updated');
            
            // 如果当前在精炼页签，更新精炼信息或显示提示
            const refineTab = document.querySelector('.blacksmith-tab[data-tab="refine"]');
            if (refineTab && refineTab.classList.contains('active')) {
                if (equipment.slot === 'weapon') {
                    // 武器：显示精炼信息
                    this.updateRefineInfo(equipment);
                } else {
                    // 非武器：显示醒目的提示
                    const refineInfo = document.getElementById('blacksmith-refine-info');
                    const refineList = document.getElementById('blacksmith-refine-list');
                    const refineBtn = document.getElementById('blacksmith-refine-btn');
                    if (refineInfo) {
                        refineInfo.innerHTML = `
                            <div class="blacksmith-refine-warning">
                                <div class="warning-icon">⚠</div>
                                <div class="warning-text">非武器无法精炼</div>
                                <div class="warning-detail">精炼功能仅适用于武器装备</div>
                            </div>
                        `;
                    }
                    if (refineList) refineList.innerHTML = '';
                    if (refineBtn) refineBtn.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('showBlacksmithDetails: Error occurred', error);
            console.error('showBlacksmithDetails: equipment', equipment);
        }
    }
    
    /**
     * 更新精炼信息
     */
    updateRefineInfo(equipment) {
        const refineInfo = document.getElementById('blacksmith-refine-info');
        const refineList = document.getElementById('blacksmith-refine-list');
        const refineBtn = document.getElementById('blacksmith-refine-btn');
        
        if (equipment.refineLevel >= 5) {
            refineInfo.innerHTML = '<p style="color: #ff0000;">精炼已达最高等级（5级）</p>';
            refineList.innerHTML = '';
            refineBtn.style.display = 'none';
            return;
        }
        
        // 精炼消耗：需要1件同名武器装备
        // 精炼规则：每一次精炼需要消耗一把同名同星武器
        // 例如：0星武器A + 0星武器A → 1星武器A；1星武器A + 1星武器A → 2星武器A
        const currentRefineLevel = equipment.refineLevel || 0; // 确保精炼等级有默认值
        const requiredRefineLevel = currentRefineLevel; // 需要的精炼等级：与当前装备相同的精炼等级
        const weaponsNeeded = 1; // 固定需要1件
        const goldNeeded = 0; // 不需要金币
        
        const nextRefineLevel = currentRefineLevel + 1;
        const nextRefineEffect = equipment.refineEffects && equipment.refineEffects[nextRefineLevel - 1];
        const nextEffectText = nextRefineEffect ? nextRefineEffect.description : '基础数值显著提高';
        
        const requiredRefineText = requiredRefineLevel === 0 ? '零星' : '★'.repeat(requiredRefineLevel);
        refineInfo.innerHTML = `
            <p>当前精炼等级: ${equipment.refineLevel > 0 ? '★'.repeat(equipment.refineLevel) : '无'}</p>
            <p>下一级需要: 1把${requiredRefineText}${equipment.name}</p>
            <p style="font-size: 12px; color: #aaa; margin-top: 5px;">下一级效果: ${nextEffectText}</p>
        `;
        
        // 查找当前装备在背包中的索引（如果不在背包中则为-1）
        // 使用对象引用比较来找到正确的索引，避免同名装备ID相同的问题
        let equipmentIndex = -1;
        let isEquipped = false;
        
        // 先检查是否是已装备的武器
        if (this.player.equipment.weapon === equipment) {
            isEquipped = true;
            equipmentIndex = -1;
        } else {
            // 从背包中查找，使用对象引用比较
            this.player.inventory.forEach((item, index) => {
                if (item === equipment) {
                    equipmentIndex = index;
                }
            });
        }
        
        // 查找相同武器（同名且符合要求的精炼等级）
        const sameWeapons = [];
        this.player.inventory.forEach((item, index) => {
            if (index !== equipmentIndex && // 排除当前装备的索引
                item && item.type === 'equipment' && item.slot === 'weapon' && 
                item.name === equipment.name && 
                (item.refineLevel || 0) === requiredRefineLevel) {
                sameWeapons.push({ item, index });
            }
        });
        
        // 检查已装备的武器（如果当前装备不是已装备的武器）
        if (!isEquipped && this.player.equipment.weapon && 
            this.player.equipment.weapon.name === equipment.name && 
            (this.player.equipment.weapon.refineLevel || 0) === requiredRefineLevel &&
            this.player.equipment.weapon !== equipment) { // 使用对象引用比较确保不是同一把武器
            sameWeapons.push({ item: this.player.equipment.weapon, index: -1, equipped: true });
        }
        
        refineList.innerHTML = '';
        if (sameWeapons.length >= weaponsNeeded) {
            sameWeapons.slice(0, weaponsNeeded).forEach(({ item, index, equipped }) => {
                const itemDiv = document.createElement('div');
                itemDiv.style.padding = '5px';
                itemDiv.style.margin = '5px 0';
                itemDiv.style.background = 'rgba(60, 60, 70, 0.8)';
                itemDiv.style.border = `1px solid ${QUALITY_COLORS[item.quality]}`;
                itemDiv.style.borderRadius = '3px';
                itemDiv.textContent = `${item.name}${equipped ? ' (已装备)' : ''}`;
                refineList.appendChild(itemDiv);
            });
            
            refineBtn.style.display = 'block';
            refineBtn.disabled = this.player.gold < goldNeeded;
            refineBtn.dataset.itemId = equipment.id;
            refineBtn.dataset.equipmentIndex = equipmentIndex; // 保存装备索引
            refineBtn.dataset.isEquipped = isEquipped ? 'true' : 'false'; // 保存是否已装备
            refineBtn.dataset.weaponsNeeded = weaponsNeeded;
            refineBtn.dataset.goldNeeded = goldNeeded;
        } else {
            refineList.innerHTML = `<p style="color: #ff6666; font-size: 12px;">需要${weaponsNeeded}把相同武器，当前有${sameWeapons.length}把</p>`;
            refineBtn.style.display = 'none';
        }
    }
    
    /**
     * 精炼装备
     */
    refineEquipment() {
        const btn = document.getElementById('blacksmith-refine-btn');
        if (!btn || !btn.dataset.itemId) {
            console.log('refineEquipment: 按钮或itemId不存在');
            return;
        }
        
        // 使用保存的索引来查找装备，避免同名装备ID相同的问题
        const equipmentIndex = parseInt(btn.dataset.equipmentIndex);
        const isEquipped = btn.dataset.isEquipped === 'true';
        
        let equipment = null;
        let actualEquipmentIndex = -1;
        
        if (isEquipped) {
            // 如果已装备，直接从已装备的武器中获取
            equipment = this.player.equipment.weapon;
            actualEquipmentIndex = -1;
        } else if (!isNaN(equipmentIndex) && equipmentIndex >= 0) {
            // 如果索引有效，直接从背包中获取
            equipment = this.player.inventory[equipmentIndex];
            actualEquipmentIndex = equipmentIndex;
        } else {
            // 如果索引无效，尝试通过ID查找（兼容旧代码）
            const itemId = parseInt(btn.dataset.itemId);
            if (!isNaN(itemId)) {
                // 先检查已装备的武器
                if (this.player.equipment.weapon && this.player.equipment.weapon.id === itemId) {
                    equipment = this.player.equipment.weapon;
                    actualEquipmentIndex = -1;
                } else {
                    // 从背包中查找第一个匹配的
                    this.player.inventory.forEach((inv, index) => {
                        if (inv && inv.id === itemId && inv.slot === 'weapon' && !equipment) {
                            equipment = inv;
                            actualEquipmentIndex = index;
                        }
                    });
                }
            }
        }
        
        if (!equipment || equipment.slot !== 'weapon') {
            console.log('refineEquipment: 找不到装备或不是武器', { equipment, equipmentIndex, isEquipped });
            return;
        }
        
        console.log('refineEquipment: 找到装备', { name: equipment.name, refineLevel: equipment.refineLevel, index: actualEquipmentIndex });
        
        const currentRefineLevel = equipment.refineLevel || 0;
        
        // 查找并移除用于精炼的同名武器（只需要1把）
        // 精炼规则：每一次精炼需要消耗一把同名同星武器
        // 例如：0星武器A + 0星武器A → 1星武器A；1星武器A + 1星武器A → 2星武器A
        const requiredRefineLevel = currentRefineLevel; // 需要的精炼等级：与当前装备相同的精炼等级
        const weaponsToRemove = [];
        
        // 从背包中查找（排除当前装备的索引）
        this.player.inventory.forEach((item, index) => {
            if (index !== actualEquipmentIndex && // 排除当前装备的索引
                item && item.type === 'equipment' && item.slot === 'weapon' && 
                item.name === equipment.name && 
                (item.refineLevel || 0) === requiredRefineLevel) {
                if (weaponsToRemove.length < 1) {
                    weaponsToRemove.push({ index, item });
                }
            }
        });
        
        // 检查已装备的武器（如果背包中没有）
        if (weaponsToRemove.length < 1 && this.player.equipment.weapon && 
            this.player.equipment.weapon.name === equipment.name && 
            (this.player.equipment.weapon.refineLevel || 0) === requiredRefineLevel &&
            this.player.equipment.weapon !== equipment) { // 使用对象引用比较排除当前装备
            // 需要卸下装备
            const emptySlot = this.player.inventory.findIndex(slot => slot === null || slot === undefined);
            if (emptySlot !== -1) {
                this.player.inventory[emptySlot] = this.player.equipment.weapon;
                this.player.equipment.weapon = null;
                this.player.updateStats();
                if (typeof this.player.onEquipmentSlotChanged === 'function') {
                    this.player.onEquipmentSlotChanged('weapon');
                }
                weaponsToRemove.push({ index: emptySlot, item: this.player.inventory[emptySlot] });
            }
        }
        
        if (weaponsToRemove.length < 1) {
            console.log('refineEquipment: 找不到要消耗的武器', {
                equipmentName: equipment.name,
                currentRefineLevel: currentRefineLevel,
                requiredRefineLevel: requiredRefineLevel,
                equipmentIndex: equipmentIndex,
                inventory: this.player.inventory.map((item, idx) => 
                    item && item.slot === 'weapon' ? {
                        index: idx,
                        name: item.name,
                        refineLevel: item.refineLevel || 0,
                        id: item.id
                    } : null
                ).filter(x => x)
            });
            const refineLevelText = requiredRefineLevel === 0 ? '零星' : `${requiredRefineLevel}星`;
            this.addFloatingText(this.player.x, this.player.y, `${refineLevelText}同名武器不足！`, '#ff0000');
            return;
        }
        
        console.log('refineEquipment: 找到要消耗的武器', weaponsToRemove);
        
        // 移除武器（只移除1把）
        weaponsToRemove.forEach(({ index }) => {
            this.player.inventory[index] = null;
        });
        
        // 精炼成功
        equipment.refineLevel = (equipment.refineLevel || 0) + 1;
        // 重新应用强化和精炼效果
        equipment.applyEnhancement();
        
        // 更新玩家属性
        this.player.updateStats();
        this.updateHUD();
        
        // 更新界面
        this.updateBlacksmithEquipmentList();
        // 重新选中精炼后的装备（用引用匹配，避免同名同 id 选错）
        const container = document.getElementById('blacksmith-items');
        if (container) {
            const items = container.querySelectorAll('.blacksmith-item');
            for (const div of items) {
                let isMatch = false;
                if (div.dataset.source === 'equipment' && div.dataset.slot && this.player.equipment[div.dataset.slot] === equipment) {
                    isMatch = true;
                } else if (div.dataset.source === 'inventory' && div.dataset.index !== undefined) {
                    const idx = parseInt(div.dataset.index, 10);
                    if (!isNaN(idx) && this.player.inventory[idx] === equipment) isMatch = true;
                }
                if (isMatch) {
                    items.forEach(i => i.classList.remove('selected'));
                    div.classList.add('selected');
                    break;
                }
            }
        }
        this.showBlacksmithDetails(equipment);
        this.addFloatingText(this.player.x, this.player.y, `精炼成功！${'★'.repeat(equipment.refineLevel)}`, '#ffd700');
    }

    /**
     * 强化装备
     */
    upgradeEquipment() {
        const btn = document.getElementById('blacksmith-upgrade-btn');
        // 用 source+slot/index 精确定位，避免同名不同精炼等级装备选错
        let equipment = null;
        if (btn.dataset.source === 'equipment' && btn.dataset.slot) {
            equipment = this.player.equipment[btn.dataset.slot] || null;
        } else if (btn.dataset.source === 'inventory' && btn.dataset.equipmentIndex !== undefined) {
            const index = parseInt(btn.dataset.equipmentIndex, 10);
            if (!isNaN(index) && index >= 0) equipment = this.player.inventory[index] || null;
        }
        if (!equipment && btn.dataset.itemId) {
            // 兼容：若无 source 则按 id 查找
            const itemId = parseInt(btn.dataset.itemId, 10);
            Object.values(this.player.equipment).forEach(eq => {
                if (eq && eq.id === itemId) equipment = eq;
            });
            if (!equipment) {
                this.player.inventory.forEach(inv => {
                    if (inv && inv.id === itemId) equipment = inv;
                });
            }
        }
        if (!equipment) return;
        
        const baseCost = 50;
        const cost = baseCost * (equipment.enhanceLevel + 1);
        const successRate = Math.max(10, 100 - equipment.enhanceLevel * 10);
        
        if (this.player.gold < cost) {
            // 金币不足提示从按钮上冒出
            const upgradeBtn = document.getElementById('blacksmith-upgrade-btn');
            if (upgradeBtn) {
                const rect = upgradeBtn.getBoundingClientRect();
                this.addFloatingText(rect.left + rect.width / 2, rect.top, '金币不足！', '#ff0000', 2000, 14, false);
            } else {
                this.addFloatingText(this.player.x, this.player.y, '金币不足！', '#ff0000');
            }
            return;
        }
        
        // 扣除金币
        this.player.gold -= cost;
        this.updateHUD();
        
        // 尝试强化
        if (Math.random() * 100 < successRate) {
            // 强化成功
            equipment.enhanceLevel++;
            equipment.applyEnhancement();
            this.addFloatingText(this.player.x, this.player.y, `强化成功！+${equipment.enhanceLevel}`, '#00ff00');
            // 更新玩家属性
            this.player.updateStats();
            this.updateHUD();
        } else {
            // 强化失败
            this.addFloatingText(this.player.x, this.player.y, '强化失败！', '#ff0000');
        }
        
        // 更新界面
        this.updateBlacksmithEquipmentList();
        this.showBlacksmithDetails(equipment);
        // 如果当前在精炼页签且是武器，更新精炼信息
        const refineTab = document.querySelector('.blacksmith-tab[data-tab="refine"]');
        if (refineTab && refineTab.classList.contains('active') && equipment.slot === 'weapon') {
            this.updateRefineInfo(equipment);
        }
    }

    /**
     * 打开商店界面
     */
    openShop() {
        const modal = document.getElementById('shop-modal');
        modal.classList.add('show');
        this.paused = true;
        this.updateShopEquipments();
        this.updateShopRefreshButton();
    }

    /**
     * 刷新商店
     */
    refreshShop() {
        const currentCost = this.shopRefreshCost; // 固定费用150
        if (this.player.gold < currentCost) {
            // 金币不足提示从按钮上冒出
            const refreshBtn = document.getElementById('shop-refresh-btn');
            if (refreshBtn) {
                const rect = refreshBtn.getBoundingClientRect();
                this.addFloatingText(rect.left + rect.width / 2, rect.top, '金币不足', '#ff0000', 2000, 14, false);
            }
            return;
        }
        
        this.player.gold -= currentCost;
        this.shopRefreshCount++;
        
        // 随机决定是否出现背包扩容（30%概率）
        this.shopHasCapacityExpansion = Math.random() < 0.3;
        
        this.updateHUD();
        // 强制刷新，生成新物品（但保留锁定的商品和定向位）
        // 注意：先使用定向位生成装备，然后再清空定向位
        this.updateShopEquipments(true);
        this.updateShopConsumables(true);
        
        // 刷新后清空定向位（但保留可用次数）
        Object.keys(this.shopTargetSlots).forEach(quality => {
            this.shopTargetSlots[quality].target = null;
        });
        
        this.updateShopRefreshButton();
        this.updateTargetSlotsDisplay();
        this.addFloatingText(this.player.x, this.player.y, `刷新商店 -${currentCost}金币`, '#ffd700');
    }

    /**
     * 更新商店刷新按钮
     */
    updateShopRefreshButton() {
        const refreshBtn = document.getElementById('shop-refresh-btn');
        const currentCost = this.shopRefreshCost; // 固定费用150
        refreshBtn.textContent = `刷新商店 (${currentCost} 金币)`;
        refreshBtn.disabled = this.player.gold < currentCost;
    }

    /**
     * 关闭商店界面
     */
    closeShop() {
        const modal = document.getElementById('shop-modal');
        modal.classList.remove('show');
        const codexModal = document.getElementById('codex-modal');
        const blacksmithModal = document.getElementById('blacksmith-modal');
        const inventoryModal = document.getElementById('inventory-modal');
        const guideModal = document.getElementById('guide-modal');
        if (!this.devMode && !codexModal.classList.contains('show') && 
            !blacksmithModal.classList.contains('show') && !inventoryModal.classList.contains('show') && 
            !guideModal.classList.contains('show')) {
            this.paused = false;
        }
    }

    /**
     * 更新商店装备列表
     * @param {boolean} forceRefresh - 是否强制刷新（生成新物品）
     */
    updateShopEquipments(forceRefresh = false) {
        const container = document.getElementById('shop-equipment-list');
        container.innerHTML = '';
        
        // 如果已有保存的装备列表且不强制刷新，使用保存的列表
        if (!forceRefresh && this.shopEquipments && this.shopEquipments.length > 0) {
            // 使用保存的列表，但保留锁定的商品
        } else {
            // 使用缓存的装备列表
            if (!this.cachedAllEquipments) {
                this.cachedAllEquipments = generateEquipments();
            }
            const allEquipments = this.cachedAllEquipments;
            const newEquipments = [];
            const lockedEquipments = [];
            
            // 保留锁定的商品
            if (this.shopEquipments) {
                this.shopEquipments.forEach(eq => {
                    if (this.shopLockedItems.has(eq.id)) {
                        lockedEquipments.push(eq);
                    }
                });
            }
            
            // 处理定向位（如果已设置目标，必定刷新出该装备）
            const targetEquipments = [];
            Object.keys(this.shopTargetSlots).forEach(quality => {
                const slot = this.shopTargetSlots[quality];
                // 移除 available > 0 的限制，只要有target就刷新
                if (slot.target) {
                    // 查找同品质的装备（排除打造的装备）
                    const qualityEquipments = allEquipments.filter(e => e.quality === quality && !e.isCrafted);
                    if (qualityEquipments.length > 0) {
                        const targetEq = qualityEquipments.find(e => e.id === slot.target);
                        if (targetEq) {
                            targetEquipments.push(targetEq);
                        } else {
                            // 如果找不到指定的装备，随机选择一个同品质的
                            const randomEq = qualityEquipments[Math.floor(Math.random() * qualityEquipments.length)];
                            targetEquipments.push(randomEq);
                        }
                    }
                }
            });
            
            // 生成其他商品（排除定向和锁定的，以及打造的装备）
            const usedIds = new Set([...lockedEquipments.map(e => e.id), ...targetEquipments.map(e => e.id)]);
            const availableEquipments = allEquipments.filter(e => !usedIds.has(e.id) && !e.isCrafted);
            const remainingCount = Math.max(0, 12 - lockedEquipments.length - targetEquipments.length);
            
            for (let i = 0; i < remainingCount && i < availableEquipments.length; i++) {
                const randomEq = availableEquipments[Math.floor(Math.random() * availableEquipments.length)];
                newEquipments.push(randomEq);
                usedIds.add(randomEq.id);
            }
            
            // 合并：锁定的 + 定向的 + 新的
            this.shopEquipments = [...lockedEquipments, ...targetEquipments, ...newEquipments];
        }
        
        // 更新定向位显示
        this.updateTargetSlotsDisplay();
        
        const shopEquipments = this.shopEquipments;
        
        // 使用文档片段批量添加DOM元素
        const fragment = document.createDocumentFragment();
        
        shopEquipments.forEach(eq => {
            const itemDiv = document.createElement('div');
            
            // 检查装备等级要求
            const requiredLevel = Number(eq.level);
            const playerLevel = Number(this.player.level);
            const isLevelLocked = !isNaN(requiredLevel) && !isNaN(playerLevel) && playerLevel < requiredLevel;
            
            const isLocked = this.shopLockedItems.has(eq.id);
            const isTargeted = Object.values(this.shopTargetSlots).some(slot => slot.target === eq.id);
            
            itemDiv.className = `shop-item${isLevelLocked ? ' level-locked' : ''}${isLocked ? ' locked' : ''}${isTargeted ? ' targeted' : ''}`;
            if (isTargeted) {
                itemDiv.style.border = `3px solid ${QUALITY_COLORS[eq.quality]}`;
                itemDiv.style.boxShadow = `0 0 10px ${QUALITY_COLORS[eq.quality]}`;
            }
            
            const price = (eq.level * 20 + Object.values(eq.stats).reduce((a, b) => a + b, 0) * 2) * (['common', 'rare', 'fine', 'epic', 'legendary'].indexOf(eq.quality) + 1);
            
            // 创建装备图标（使用通用函数）
            const equipmentIcon = this.createItemIcon(eq, {
                size: 50,
                style: { marginRight: '15px' }
            });
            
            const equipmentNameDiv = document.createElement('div');
            equipmentNameDiv.style.color = QUALITY_COLORS[eq.quality];
            equipmentNameDiv.style.fontWeight = 'bold';
            equipmentNameDiv.style.cursor = 'pointer';
            equipmentNameDiv.textContent = eq.name;
            equipmentNameDiv.dataset.itemId = eq.id;
            
            // 为装备名称添加鼠标悬停事件
            equipmentNameDiv.addEventListener('mouseenter', (e) => {
                this.showShopEquipmentTooltip(eq, e.clientX, e.clientY);
            });
            equipmentNameDiv.addEventListener('mouseleave', () => {
                this.tooltipManager.hideItemTooltip();
            });
            
            itemDiv.innerHTML = `
                <div class="shop-item-info">
                    <div style="font-size: 12px; color: #aaa;">${SLOT_NAMES[eq.slot]} | ${QUALITY_NAMES[eq.quality]}${isLevelLocked ? ` | <span style="color: #ff6666;">需要等级 ${requiredLevel}</span>` : ''}${isTargeted ? ` | <span style="color: ${QUALITY_COLORS[eq.quality]};">定向</span>` : ''}</div>
                </div>
                <div class="shop-item-price">${price} 金币</div>
                <div style="display: flex; gap: 5px;">
                    <button class="shop-buy-btn" data-item-id="${eq.id}" data-price="${price}">购买</button>
                    <button class="shop-lock-btn" data-item-id="${eq.id}" style="padding: 5px 10px; background: ${isLocked ? '#ff6666' : '#666'}; color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">${isLocked ? '解锁' : '锁定'}</button>
                </div>
            `;
            
            // 将装备图标和名称插入到shop-item-info的开头
            const shopItemInfo = itemDiv.querySelector('.shop-item-info');
            const iconAndNameContainer = document.createElement('div');
            iconAndNameContainer.style.display = 'flex';
            iconAndNameContainer.style.alignItems = 'center';
            iconAndNameContainer.style.marginBottom = '5px';
            iconAndNameContainer.appendChild(equipmentIcon);
            iconAndNameContainer.appendChild(equipmentNameDiv);
            shopItemInfo.insertBefore(iconAndNameContainer, shopItemInfo.firstChild);
            
            const buyBtn = itemDiv.querySelector('.shop-buy-btn');
            buyBtn.addEventListener('click', () => {
                this.buyEquipment(eq, price);
            });
            
            const lockBtn = itemDiv.querySelector('.shop-lock-btn');
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleShopItemLock(eq.id);
            });
            
            // 添加定向位选择功能：如果该品质有可用的定向位，允许点击选择
            const quality = eq.quality;
            if (!isTargeted && this.shopTargetSlots[quality] && 
                (this.shopTargetSlots[quality].available > 0 || this.shopTargetSlots[quality].target)) {
                itemDiv.style.cursor = 'pointer';
                itemDiv.title = '点击选择为定向装备';
                itemDiv.addEventListener('click', (e) => {
                    if (e.target.classList.contains('shop-buy-btn') || e.target.classList.contains('shop-lock-btn')) return;
                    this.selectTargetSlot(eq);
                });
            }
            
            fragment.appendChild(itemDiv);
        });
        
        // 一次性添加所有元素到DOM
        container.appendChild(fragment);
        
        // 如果商店有背包扩容，显示扩容选项
        if (this.shopHasCapacityExpansion) {
            const expansionDiv = document.createElement('div');
            expansionDiv.className = 'shop-item';
            expansionDiv.style.padding = '15px';
            expansionDiv.style.margin = '10px 0';
            expansionDiv.style.background = 'rgba(100, 200, 100, 0.3)';
            expansionDiv.style.border = '2px solid #4a9eff';
            expansionDiv.style.borderRadius = '5px';
            
            const expansionCost = 500 + this.shopCapacityExpansionCount * 200; // 基础500，每次购买+200
            
            expansionDiv.innerHTML = `
                <div class="shop-item-info">
                    <div style="font-size: 14px; font-weight: bold; color: #4a9eff; margin-bottom: 5px;">背包扩容</div>
                    <div style="font-size: 12px; color: #aaa;">购买后可以选择为任意一个背包页签增加一排格子（6格）</div>
                </div>
                <div class="shop-item-price">${expansionCost} 金币</div>
                <button class="shop-buy-capacity-expansion-btn" data-cost="${expansionCost}" style="padding: 8px 15px; background: #4a9eff; color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">购买扩容</button>
            `;
            
            const buyBtn = expansionDiv.querySelector('.shop-buy-capacity-expansion-btn');
            buyBtn.addEventListener('click', () => {
                this.buyCapacityExpansion(expansionCost);
            });
            
            container.appendChild(expansionDiv);
        }
    }
    
    /**
     * 更新定向位显示
     */
    updateTargetSlotsDisplay() {
        Object.keys(this.shopTargetSlots).forEach(quality => {
            const slot = this.shopTargetSlots[quality];
            const slotElement = document.getElementById(`target-slot-${quality}`);
            const textElement = document.getElementById(`target-slot-${quality}-text`);
            
            if (slot.target && slot.available > 0) {
                const eq = this.shopEquipments.find(e => e.id === slot.target);
                if (eq) {
                    textElement.textContent = eq.name;
                    textElement.style.color = QUALITY_COLORS[eq.quality];
                }
            } else {
                textElement.textContent = slot.available > 0 ? '点击选择' : '已用完';
                textElement.style.color = '#aaa';
            }
        });
    }
    
    /**
     * 选择定向位
     */
    selectTargetSlot(equipment) {
        const quality = equipment.quality;
        if (this.shopTargetSlots[quality]) {
            // 设置定向位目标（不需要检查available，因为购买时会增加available）
            this.shopTargetSlots[quality].target = equipment.id;
            // 如果之前没有目标，消耗一个可用次数
            if (this.shopTargetSlots[quality].available > 0) {
                this.shopTargetSlots[quality].available--;
            }
            // 只更新显示，不刷新商店
            this.updateShopEquipments(false);
            this.updateTargetSlotsDisplay();
            this.addFloatingText(this.player.x, this.player.y, `已定向: ${equipment.name}`, QUALITY_COLORS[quality]);
        }
    }
    
    /**
     * 购买定向位
     */
    buyTargetSlot(quality) {
        const costs = { legendary: 1500, epic: 800, fine: 400 };
        const cost = costs[quality];
        
        if (this.player.gold < cost) {
            // 金币不足提示从按钮上冒出
            const btn = document.querySelector(`.buy-target-slot-btn[data-quality="${quality}"]`);
            if (btn) {
                const rect = btn.getBoundingClientRect();
                this.addFloatingText(rect.left + rect.width / 2, rect.top, '金币不足', '#ff0000', 2000, 14, false);
            }
            return;
        }
        
        this.player.gold -= cost;
        this.shopTargetSlots[quality].available++;
        this.updateHUD();
        this.updateTargetSlotsDisplay();
        this.addFloatingText(this.player.x, this.player.y, `购买${QUALITY_NAMES[quality]}定向位`, QUALITY_COLORS[quality]);
        
        // 弹出窗口让玩家选择该品质的任意一件装备
        this.showTargetSlotEquipmentSelection(quality);
    }
    
    /**
     * 显示定向位装备选择窗口
     * @param {string} quality - 品质（legendary/epic/fine）
     */
    showTargetSlotEquipmentSelection(quality) {
        // 创建或获取选择窗口
        let modal = document.getElementById('target-slot-select-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'target-slot-select-modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 800px; max-height: 600px; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 id="target-slot-select-title" style="color: #fff;">选择装备</h2>
                        <button id="close-target-slot-select" style="padding: 8px 15px; background: #666; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-family: 'Courier New', monospace;">关闭</button>
                    </div>
                    <div id="target-slot-equipment-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;"></div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // 添加关闭按钮事件
            document.getElementById('close-target-slot-select').addEventListener('click', () => {
                modal.classList.remove('show');
                this.paused = false;
            });
        }
        
        // 更新标题
        const titleElement = document.getElementById('target-slot-select-title');
        if (titleElement) {
            titleElement.textContent = `选择${QUALITY_NAMES[quality]}装备`;
            titleElement.style.color = QUALITY_COLORS[quality];
        }
        
        // 显示窗口并暂停游戏
        modal.classList.add('show');
        this.paused = true;
        
        // 获取该品质的所有装备
        if (!this.cachedAllEquipments) {
            this.cachedAllEquipments = generateEquipments();
        }
        const qualityEquipments = this.cachedAllEquipments.filter(eq => eq.quality === quality);
        
        // 显示装备列表
        const container = document.getElementById('target-slot-equipment-list');
        container.innerHTML = '';
        
        if (qualityEquipments.length === 0) {
            container.innerHTML = '<p style="color: #aaa; text-align: center; grid-column: 1 / -1;">没有找到该品质的装备</p>';
            return;
        }
        
        // 使用文档片段批量添加
        const fragment = document.createDocumentFragment();
        
        qualityEquipments.forEach(eq => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'target-slot-equipment-item';
            itemDiv.style.padding = '10px';
            itemDiv.style.background = 'rgba(50, 50, 60, 0.8)';
            itemDiv.style.border = `2px solid ${QUALITY_COLORS[quality]}`;
            itemDiv.style.borderRadius = '5px';
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.textAlign = 'center';
            itemDiv.style.transition = 'all 0.2s';
            
            // 鼠标悬停效果
            itemDiv.addEventListener('mouseenter', () => {
                itemDiv.style.background = 'rgba(70, 70, 80, 0.9)';
                itemDiv.style.transform = 'scale(1.05)';
            });
            itemDiv.addEventListener('mouseleave', () => {
                itemDiv.style.background = 'rgba(50, 50, 60, 0.8)';
                itemDiv.style.transform = 'scale(1)';
            });
            
            // 创建装备图标（使用通用函数）
            const equipmentIcon = this.createItemIcon(eq, {
                size: 60,
                style: { margin: '0 auto 10px' }
            });
            
            const nameDiv = document.createElement('div');
            nameDiv.style.color = QUALITY_COLORS[quality];
            nameDiv.style.fontSize = '12px';
            nameDiv.style.fontWeight = 'bold';
            nameDiv.style.marginBottom = '5px';
            nameDiv.textContent = eq.name;
            
            const slotDiv = document.createElement('div');
            slotDiv.style.color = '#aaa';
            slotDiv.style.fontSize = '10px';
            slotDiv.textContent = SLOT_NAMES[eq.slot];
            
            itemDiv.appendChild(equipmentIcon);
            itemDiv.appendChild(nameDiv);
            itemDiv.appendChild(slotDiv);
            
            // 点击选择装备
            itemDiv.addEventListener('click', () => {
                // 设置定向位目标
                this.shopTargetSlots[quality].target = eq.id;
                // 关闭窗口
                modal.classList.remove('show');
                this.paused = false;
                // 只更新显示，不刷新商店
                this.updateShopEquipments(false);
                this.updateTargetSlotsDisplay();
                this.addFloatingText(this.player.x, this.player.y, `已定向: ${eq.name}`, QUALITY_COLORS[quality]);
            });
            
            fragment.appendChild(itemDiv);
        });
        
        container.appendChild(fragment);
    }
    
    /**
     * 切换商品锁定状态
     */
    toggleShopItemLock(itemId) {
        if (this.shopLockedItems.has(itemId)) {
            this.shopLockedItems.delete(itemId);
        } else {
            this.shopLockedItems.add(itemId);
        }
        this.updateShopEquipments(false);
    }

    showShopEquipmentTooltip(equipment, x, y) {
        const tooltip = document.getElementById('item-tooltip');
        if (equipment && equipment.getTooltipHTML) {
            tooltip.innerHTML = equipment.getTooltipHTML(this.player.equipment);
            // 使用位置调整函数
            this.tooltipManager.adjustTooltipPosition(tooltip, x, y);
        }
    }

    /**
     * 更新商店药水列表
     * @param {boolean} forceRefresh - 是否强制刷新（生成新物品）
     */
    /**
     * 更新商店消耗品界面（随机礼箱和图纸）
     */
    updateShopConsumables(forceRefresh = false) {
        const container = document.getElementById('shop-consumable-list');
        container.innerHTML = '';
        
        // 随机礼箱价格
        const randomBoxPrice = 200;
        
        // 创建随机礼箱
        const randomBoxDiv = document.createElement('div');
        randomBoxDiv.className = 'shop-item';
        randomBoxDiv.style.padding = '20px';
        randomBoxDiv.style.textAlign = 'center';
        randomBoxDiv.style.background = 'rgba(100, 50, 150, 0.3)';
        randomBoxDiv.style.border = '3px solid #aa00ff';
        randomBoxDiv.style.borderRadius = '10px';
        randomBoxDiv.style.marginBottom = '20px';
        
        randomBoxDiv.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 10px;">🎁</div>
            <div style="font-size: 18px; font-weight: bold; color: #aa00ff; margin-bottom: 10px;">随机礼箱</div>
            <div style="font-size: 12px; color: #aaa; margin-bottom: 15px;">打开后随机获得一种消耗品<br/>（药水、神圣十字架、打造配方、背包扩容等）</div>
            <div class="shop-item-price" style="margin-bottom: 15px;">${randomBoxPrice} 金币</div>
            <button class="shop-buy-random-box-btn" data-price="${randomBoxPrice}" style="padding: 10px 20px; background: #aa00ff; color: #fff; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold;">购买并打开</button>
        `;
        
        const buyRandomBoxBtn = randomBoxDiv.querySelector('.shop-buy-random-box-btn');
        buyRandomBoxBtn.addEventListener('click', () => {
            this.showRandomBoxQuantityDialog(randomBoxPrice);
        });
        
        container.appendChild(randomBoxDiv);
    }
    
    /**
     * 显示随机礼箱数量选择对话框
     * @param {number} price - 单个礼箱价格
     */
    showRandomBoxQuantityDialog(price) {
        // 暂停游戏
        this.paused = true;
        
        // 创建或获取对话框
        let modal = document.getElementById('random-box-quantity-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'random-box-quantity-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px; text-align: center;">
                    <h2 style="color: #aa00ff; margin-bottom: 20px;">购买随机礼箱</h2>
                    <p style="color: #fff; font-size: 16px; margin-bottom: 10px;">单个价格: <span style="color: #ffd700;">${price} 金币</span></p>
                    <p style="color: #aaa; font-size: 14px; margin-bottom: 20px;">当前金币: <span style="color: #ffd700;" id="random-box-current-gold">0</span></p>
                    <div style="display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 20px;">
                        <button id="random-box-quantity-decrease" style="width: 40px; height: 40px; background: #666; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-size: 20px; font-weight: bold;">-</button>
                        <input type="number" id="random-box-quantity-input" value="1" min="1" max="99" style="width: 80px; height: 40px; text-align: center; font-size: 18px; font-weight: bold; background: rgba(50, 50, 60, 0.8); color: #fff; border: 2px solid #666; border-radius: 5px; font-family: 'Courier New', monospace;">
                        <button id="random-box-quantity-increase" style="width: 40px; height: 40px; background: #666; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-size: 20px; font-weight: bold;">+</button>
                    </div>
                    <p style="color: #fff; font-size: 18px; margin-bottom: 20px;">总价: <span style="color: #ffd700;" id="random-box-total-price">${price}</span> 金币</p>
                    <div style="display: flex; gap: 15px; justify-content: center;">
                        <button id="random-box-confirm-btn" style="padding: 12px 30px; background: #aa00ff; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold;">确认购买</button>
                        <button id="random-box-cancel-btn" style="padding: 12px 30px; background: #666; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-family: 'Courier New', monospace; font-size: 14px;">取消</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // 添加事件监听
            const quantityInput = modal.querySelector('#random-box-quantity-input');
            const decreaseBtn = modal.querySelector('#random-box-quantity-decrease');
            const increaseBtn = modal.querySelector('#random-box-quantity-increase');
            const confirmBtn = modal.querySelector('#random-box-confirm-btn');
            const cancelBtn = modal.querySelector('#random-box-cancel-btn');
            
            // 减少数量
            decreaseBtn.addEventListener('click', () => {
                let value = parseInt(quantityInput.value) || 1;
                if (value > 1) {
                    value--;
                    quantityInput.value = value;
                    this.updateRandomBoxQuantityPrice(price);
                }
            });
            
            // 增加数量
            increaseBtn.addEventListener('click', () => {
                let value = parseInt(quantityInput.value) || 1;
                const maxQuantity = Math.floor(this.player.gold / price);
                if (value < maxQuantity && value < 99) {
                    value++;
                    quantityInput.value = value;
                    this.updateRandomBoxQuantityPrice(price);
                }
            });
            
            // 输入框变化
            quantityInput.addEventListener('input', () => {
                this.updateRandomBoxQuantityPrice(price);
            });
            
            // 确认购买
            confirmBtn.addEventListener('click', () => {
                const quantity = parseInt(quantityInput.value) || 1;
                if (quantity > 0) {
                    modal.classList.remove('show');
                    this.paused = false;
                    this.buyRandomBox(price, quantity);
                }
            });
            
            // 取消
            cancelBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                this.paused = false;
            });
        }
        
        // 更新当前金币显示
        const currentGoldSpan = modal.querySelector('#random-box-current-gold');
        if (currentGoldSpan) {
            currentGoldSpan.textContent = this.player.gold;
        }
        
        // 计算最大可购买数量
        const maxQuantity = Math.min(Math.floor(this.player.gold / price), 99);
        const quantityInput = modal.querySelector('#random-box-quantity-input');
        if (quantityInput) {
            quantityInput.max = maxQuantity;
            if (parseInt(quantityInput.value) > maxQuantity) {
                quantityInput.value = maxQuantity || 1;
            }
        }
        
        // 更新总价显示
        this.updateRandomBoxQuantityPrice(price);
        
        // 显示对话框
        modal.classList.add('show');
    }
    
    /**
     * 更新随机礼箱数量选择对话框的价格显示
     * @param {number} price - 单个礼箱价格
     */
    updateRandomBoxQuantityPrice(price) {
        const modal = document.getElementById('random-box-quantity-modal');
        if (!modal) return;
        
        const quantityInput = modal.querySelector('#random-box-quantity-input');
        const totalPriceSpan = modal.querySelector('#random-box-total-price');
        const confirmBtn = modal.querySelector('#random-box-confirm-btn');
        
        if (quantityInput && totalPriceSpan && confirmBtn) {
            const quantity = parseInt(quantityInput.value) || 1;
            const maxQuantity = Math.min(Math.floor(this.player.gold / price), 99);
            const totalPrice = quantity * price;
            
            totalPriceSpan.textContent = totalPrice;
            
            // 检查是否可以购买
            if (quantity <= 0 || quantity > maxQuantity || totalPrice > this.player.gold) {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
            } else {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            }
        }
    }
    
    /**
     * 购买并打开随机礼箱
     * @param {number} price - 单个礼箱价格
     * @param {number} quantity - 购买数量
     */
    buyRandomBox(price, quantity = 1) {
        const totalPrice = price * quantity;
        
        if (this.player.gold < totalPrice) {
            this.addFloatingText(this.player.x, this.player.y, '金币不足！', '#ff0000');
            return;
        }
        
        // 记录获得的消耗品
        const obtainedItems = [];
        let failedCount = 0;
        
        // 扣除金币
        this.player.gold -= totalPrice;
        // 播放购买音效
        if (this.soundManager) {
            this.soundManager.playSound('purchase');
        }
        this.updateHUD();
        
        // 批量购买
        for (let i = 0; i < quantity; i++) {
            // 生成随机消耗品
            const randomConsumable = generateRandomConsumable();
            
            // 添加到背包
            if (this.addItemToInventory(randomConsumable)) {
                obtainedItems.push(randomConsumable);
            } else {
                // 如果背包满了，退还这个礼箱的金币
                failedCount++;
                this.player.gold += price;
            }
        }
        
        // 更新HUD
        this.updateHUD();
        
        // 如果有失败的，显示提示
        if (failedCount > 0) {
            this.addFloatingText(this.player.x, this.player.y, `背包空间不足，退还了 ${failedCount} 个礼箱的金币`, '#ffaa00');
        }
        
        // 显示获得的消耗品面板
        if (obtainedItems.length > 0) {
            this.showRandomBoxRewardsPanel(obtainedItems, totalPrice - (failedCount * price));
        }
    }
    
    /**
     * 显示随机礼箱奖励面板
     * @param {Array} items - 获得的消耗品数组
     * @param {number} totalPrice - 实际花费的金币
     */
    showRandomBoxRewardsPanel(items, totalPrice) {
        // 暂停游戏
        this.paused = true;
        
        // 创建或获取面板
        let modal = document.getElementById('random-box-rewards-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'random-box-rewards-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 700px; max-height: 600px; overflow-y: auto;">
                    <h2 style="color: #aa00ff; margin-bottom: 20px; text-align: center;">🎁 随机礼箱奖励</h2>
                    <p style="color: #aaa; font-size: 14px; margin-bottom: 20px; text-align: center;">花费: <span style="color: #ffd700;">${totalPrice}</span> 金币 | 获得: <span style="color: #88ff88;">${items.length}</span> 个消耗品</p>
                    <div id="random-box-rewards-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;"></div>
                    <div style="text-align: center;">
                        <button id="random-box-rewards-close-btn" style="padding: 12px 30px; background: #aa00ff; color: #fff; border: 2px solid #fff; border-radius: 5px; cursor: pointer; font-family: 'Courier New', monospace; font-size: 14px; font-weight: bold;">关闭</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // 添加关闭按钮事件
            const closeBtn = modal.querySelector('#random-box-rewards-close-btn');
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                this.paused = false;
            });
        }
        
        // 更新花费和数量显示
        const modalContent = modal.querySelector('.modal-content');
        const priceText = modalContent.querySelector('p');
        if (priceText) {
            priceText.innerHTML = `花费: <span style="color: #ffd700;">${totalPrice}</span> 金币 | 获得: <span style="color: #88ff88;">${items.length}</span> 个消耗品`;
        }
        
        // 显示获得的物品
        const rewardsList = modal.querySelector('#random-box-rewards-list');
        rewardsList.innerHTML = '';
        
        // 统计相同物品的数量
        const itemCounts = {};
        items.forEach(item => {
            const key = item.name + '_' + item.quality;
            if (!itemCounts[key]) {
                itemCounts[key] = {
                    item: item,
                    count: 0
                };
            }
            itemCounts[key].count++;
        });
        
        // 显示物品
        Object.values(itemCounts).forEach(({ item, count }) => {
            const itemDiv = document.createElement('div');
            itemDiv.style.padding = '15px';
            itemDiv.style.background = 'rgba(50, 50, 60, 0.8)';
            itemDiv.style.border = `2px solid ${QUALITY_COLORS[item.quality] || '#666'}`;
            itemDiv.style.borderRadius = '5px';
            itemDiv.style.textAlign = 'center';
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.transition = 'all 0.2s';
            
            // 显示物品信息
            const qualityColor = QUALITY_COLORS[item.quality] || '#fff';
            itemDiv.innerHTML = `
                <div style="font-size: 16px; font-weight: bold; color: ${qualityColor}; margin-bottom: 5px;">${item.name}</div>
                <div style="font-size: 12px; color: #aaa; margin-bottom: 5px;">${QUALITY_NAMES[item.quality] || '普通'}</div>
                ${count > 1 ? `<div style="font-size: 14px; color: #88ff88; font-weight: bold;">x${count}</div>` : ''}
            `;
            
            // 鼠标悬停效果和工具提示
            itemDiv.addEventListener('mouseenter', (e) => {
                itemDiv.style.background = 'rgba(70, 70, 80, 0.9)';
                itemDiv.style.transform = 'scale(1.05)';
                
                // 显示工具提示
                if (item.getTooltipHTML) {
                    const tooltip = document.getElementById('item-tooltip');
                    const isEquipment = (item.type === 'equipment') || (item.slot != null && item.stats != null);
                    tooltip.innerHTML = isEquipment ? item.getTooltipHTML(this.player.equipment) : item.getTooltipHTML();
                    this.adjustTooltipPosition(tooltip, e.clientX, e.clientY);
                }
            });
            itemDiv.addEventListener('mouseleave', () => {
                itemDiv.style.background = 'rgba(50, 50, 60, 0.8)';
                itemDiv.style.transform = 'scale(1)';
                this.tooltipManager.hideItemTooltip();
            });
            
            rewardsList.appendChild(itemDiv);
        });
        
        // 显示面板
        modal.classList.add('show');
    }

    showShopPotionTooltip(potion, x, y) {
        const tooltip = document.getElementById('item-tooltip');
        if (potion && potion.getTooltipHTML) {
            tooltip.innerHTML = potion.getTooltipHTML();
            // 使用位置调整函数
            this.tooltipManager.adjustTooltipPosition(tooltip, x, y);
        }
    }


    /**
     * 购买装备
     * @param {Equipment} equipment - 要购买的装备
     * @param {number} price - 价格
     */
    buyEquipment(equipment, price, event = null) {
        if (this.player.gold < price) {
            // 金币不足提示从按钮上冒出
            const buyBtn = event?.target || document.querySelector(`.shop-buy-btn[data-item-id="${equipment.id}"]`);
            if (buyBtn) {
                const rect = buyBtn.getBoundingClientRect();
                this.addFloatingText(rect.left + rect.width / 2, rect.top, '金币不足！', '#ff0000', 2000, 14, false);
            } else {
                this.addFloatingText(this.player.x, this.player.y, '金币不足！', '#ff0000');
            }
            return;
        }
        
        // 创建新装备实例（避免引用问题）
        // 注意：新购买的装备应该是未精炼的，所以不传递refineLevel（默认为0）
        const newEq = new Equipment({
            id: equipment.id,
            name: equipment.name,
            slot: equipment.slot,
            weaponType: equipment.weaponType,
            quality: equipment.quality,
            level: equipment.level,
            stats: JSON.parse(JSON.stringify(equipment.stats)),
            refineLevel: 0
        });
        
        if (this.addItemToInventory(newEq)) {
            this.player.gold -= price;
            // 播放购买音效
            if (this.soundManager) {
                this.soundManager.playSound('purchase');
            }
            this.updateHUD();
            // 如果购买的是锁定的商品，移除锁定
            if (this.shopLockedItems.has(equipment.id)) {
                this.shopLockedItems.delete(equipment.id);
            }
            // 如果购买的是定向的商品，清除定向
            Object.keys(this.shopTargetSlots).forEach(quality => {
                if (this.shopTargetSlots[quality].target === equipment.id) {
                    this.shopTargetSlots[quality].target = null;
                }
            });
            this.updateShopEquipments(false);
            this.addFloatingText(this.player.x, this.player.y, `购买 ${newEq.name}`, QUALITY_COLORS[newEq.quality] || '#ffffff');
        }
    }

    /**
     * 更新商店出售列表
     */
    updateShopSell() {
        const container = document.getElementById('shop-sell-list');
        container.innerHTML = '';
        
        // 收集玩家背包中可出售的物品（装备、材料和消耗品）
        const sellableItems = [];
        
        this.player.inventory.forEach((item, index) => {
            if (item && (
                item.type === 'equipment' || 
                item.type === 'material' || item.type === 'alchemy' || 
                item.type === 'consumable' || item.type === 'potion'
            )) {
                sellableItems.push({ item: item, index: index });
            }
        });
        
        if (sellableItems.length === 0) {
            container.innerHTML = '<p style="color: #aaa; text-align: center; margin-top: 50px;">背包中没有可出售的物品</p>';
            return;
        }
        
        sellableItems.forEach(({ item, index }) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'shop-item';
            
            // 计算出售价格
            let sellPrice = 0;
            if (item.type === 'equipment') {
                // 新的装备回收价格计算公式：(等级 * 15 + 词条值总和 * 1.5) * 品质系数 * 0.4
                const qualityMultiplier = ['common', 'rare', 'fine', 'epic', 'legendary'].indexOf(item.quality) + 1;
                const statSum = Object.values(item.stats).reduce((a, b) => a + Math.abs(b), 0);
                const baseValue = item.level * 15 + statSum * 1.5;
                sellPrice = Math.floor(baseValue * qualityMultiplier * 0.4);
            } else if (item.type === 'material' || item.type === 'alchemy') {
                // 炼金材料的基础价格计算
                const qualityMultiplier = ['common', 'rare', 'fine', 'epic', 'legendary'].indexOf(item.quality) + 1;
                const traitValue = Object.values(item.alchemyTraits).reduce((a, b) => a + Math.abs(b), 0);
                const buyPrice = (traitValue * 3 + 20) * qualityMultiplier;
                sellPrice = Math.floor(buyPrice * 0.5);
            } else if (item.type === 'consumable' || item.type === 'potion') {
                // 药水的出售价格计算
                if (item.isCrafted) {
                    // 炼金得到的药水：回收价格 = (所有效果值总和 * 2 + 30) * 品质系数 * 0.5
                    const effectValueSum = Object.values(item.effects || {}).reduce((a, b) => a + Math.abs(b), 0);
                    const qualityMultiplier = ['common', 'rare', 'fine', 'epic', 'legendary'].indexOf(item.quality) + 1;
                    const baseValue = effectValueSum * 2 + 30;
                    sellPrice = Math.floor(baseValue * qualityMultiplier * 0.5);
                } else {
                    // 商店购买的药水：购买价格的50%
                    const buyPrice = item.price || 50;
                sellPrice = Math.floor(buyPrice * 0.5);
                }
            }
            
            // 如果是装备，创建装备图标
            let itemIcon = null;
            if (item.type === 'equipment') {
                // 使用通用函数创建物品图标（边框由函数统一处理）
                itemIcon = this.createItemIcon(item, {
                    size: 50,
                    style: { marginRight: '15px' }
                });
            }
            
            const itemNameDiv = document.createElement('div');
            itemNameDiv.style.color = QUALITY_COLORS[item.quality] || '#fff';
            itemNameDiv.style.fontWeight = 'bold';
            itemNameDiv.style.cursor = 'pointer';
            itemNameDiv.textContent = item.name;
            itemNameDiv.dataset.itemId = item.id;
            
            // 为物品名称添加鼠标悬停事件
            itemNameDiv.addEventListener('mouseenter', (e) => {
                if (item.getTooltipHTML) {
                    const tooltip = document.getElementById('item-tooltip');
                    tooltip.innerHTML = item.type === 'equipment' ? item.getTooltipHTML(this.player.equipment) : item.getTooltipHTML();
                    this.adjustTooltipPosition(tooltip, e.clientX, e.clientY);
                }
            });
            itemNameDiv.addEventListener('mouseleave', () => {
                this.tooltipManager.hideItemTooltip();
            });
            
            let typeInfo = '';
            if (item.type === 'equipment') {
                typeInfo = `${SLOT_NAMES[item.slot]} | ${QUALITY_NAMES[item.quality]}`;
            } else if (item.type === 'material' || item.type === 'alchemy') {
                typeInfo = `炼金材料 | ${QUALITY_NAMES[item.quality]}`;
            } else if (item.type === 'consumable' || item.type === 'potion') {
                typeInfo = `药水 | ${QUALITY_NAMES[item.quality]}`;
            }
            
            itemDiv.innerHTML = `
                <div class="shop-item-info">
                    <div style="font-size: 12px; color: #aaa;">${typeInfo}</div>
                </div>
                <div class="shop-item-price">${sellPrice} 金币</div>
                <button class="shop-sell-btn" data-index="${index}" data-price="${sellPrice}">出售</button>
            `;
            
            // 将物品图标和名称插入到shop-item-info的开头
            const shopItemInfo = itemDiv.querySelector('.shop-item-info');
            if (itemIcon) {
                const iconAndNameContainer = document.createElement('div');
                iconAndNameContainer.style.display = 'flex';
                iconAndNameContainer.style.alignItems = 'center';
                iconAndNameContainer.style.marginBottom = '5px';
                iconAndNameContainer.appendChild(itemIcon);
                iconAndNameContainer.appendChild(itemNameDiv);
                shopItemInfo.insertBefore(iconAndNameContainer, shopItemInfo.firstChild);
            } else {
                shopItemInfo.insertBefore(itemNameDiv, shopItemInfo.firstChild);
            }
            
            const sellBtn = itemDiv.querySelector('.shop-sell-btn');
            sellBtn.addEventListener('click', () => {
                this.sellItem(index, sellPrice);
            });
            
            container.appendChild(itemDiv);
        });
    }

    /**
     * 出售物品
     * @param {number} inventoryIndex - 背包索引
     * @param {number} price - 出售价格
     */
    sellItem(inventoryIndex, price) {
        const item = this.player.inventory[inventoryIndex];
        if (!item) {
            return;
        }
        
        // 检查是否正在装备中（通过比较实例引用，而不是id）
        if (item.type === 'equipment') {
            const equippedItem = this.player.equipment[item.slot];
            if (equippedItem === item) {
                this.addFloatingText(this.player.x, this.player.y, '无法出售已装备的物品！', '#ff0000');
                return;
            }
        }
        
        // 出售物品
        this.player.inventory[inventoryIndex] = null;
        this.player.gold += price;
        
        // 更新UI
        this.updateHUD();
        this.updateShopSell();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        
        // 显示提示
        this.addFloatingText(this.player.x, this.player.y, `出售 ${item.name} +${price}金币`, QUALITY_COLORS[item.quality] || '#ffffff');
    }

    /**
     * 调整canvas尺寸以占满屏幕
     */
    resizeCanvas() {
        const container = document.getElementById('game-container');
        if (!container) return;
        
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;
        
        // 计算缩放比例，保持宽高比
        const scaleX = containerWidth / CONFIG.CANVAS_WIDTH;
        const scaleY = containerHeight / CONFIG.CANVAS_HEIGHT;
        const scale = Math.min(scaleX, scaleY);
        
        // 设置canvas的CSS尺寸
        this.canvas.style.width = (CONFIG.CANVAS_WIDTH * scale) + 'px';
        this.canvas.style.height = (CONFIG.CANVAS_HEIGHT * scale) + 'px';
        
        // 居中显示
        this.canvas.style.margin = '0 auto';
        this.canvas.style.display = 'block';
    }
    
    /**
     * 调整canvas尺寸以占满屏幕
     */
    resizeCanvas() {
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;
        
        // 计算缩放比例，保持宽高比，使用较大的缩放比例以覆盖整个屏幕
        const scaleX = containerWidth / CONFIG.CANVAS_WIDTH;
        const scaleY = containerHeight / CONFIG.CANVAS_HEIGHT;
        const scale = Math.max(scaleX, scaleY); // 使用max以覆盖整个屏幕
        
        // 设置canvas的CSS尺寸
        this.canvas.style.width = (CONFIG.CANVAS_WIDTH * scale) + 'px';
        this.canvas.style.height = (CONFIG.CANVAS_HEIGHT * scale) + 'px';
        
        // 居中显示
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '50%';
        this.canvas.style.left = '50%';
        this.canvas.style.transform = 'translate(-50%, -50%)';
        this.canvas.style.display = 'block';
    }
    
    /**
     * 绘制游戏画面
     */
    draw() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 保存当前状态并设置缩放为2倍
        this.ctx.save();
        this.ctx.scale(2, 2);
        
        // 计算视野缩放比例
        // 获取配置中的基础视野值（这是用户设置的基准视野）
        const configVision = window.CONFIG ? window.CONFIG.PLAYER_VISION : (CONFIG.PLAYER_VISION || 200);
        
        // 使用一个固定的基准视野值（比如200）作为参考
        // 当配置中的视野值改变时，相对于这个基准值进行缩放
        const baseVision = 200; // 基准视野值
        
        // 视野缩放比例：配置视野越小，缩放越大（放大，只能看到更小范围）
        // 缩放比例 = 基准视野 / 配置视野
        // 例如：配置视野=200，缩放=200/200=1（正常）
        //      配置视野=100，缩放=200/100=2（放大2倍，只能看到更小范围）
        //      配置视野=400，缩放=200/400=0.5（缩小，能看到更大范围）
        const visionScale = baseVision / Math.max(1, configVision); // 防止除以0
        
        // 应用视野缩放（以玩家屏幕中心为原点）
        // 注意：这里需要在应用相机偏移之前进行缩放，并且缩放中心应该是屏幕中心
        const playerScreenX = CONFIG.CANVAS_WIDTH / 2;
        const playerScreenY = CONFIG.CANVAS_HEIGHT / 2;
        this.ctx.translate(playerScreenX, playerScreenY);
        this.ctx.scale(visionScale, visionScale);
        this.ctx.translate(-playerScreenX, -playerScreenY);
        
        // 应用相机偏移量，使地图和实体随玩家移动
        // 相机偏移量 = 玩家位置 - 屏幕中心，所以需要反向平移
        this.ctx.translate(-this.cameraX, -this.cameraY);
        
        // 根据当前场景绘制
        if (this.currentScene === SCENE_TYPES.TOWN) {
            // 绘制主城
            this.townScene.draw(this.ctx);
        } else if (this.currentScene === SCENE_TYPES.TOWER) {
            // 绘制恶魔塔房间
            if (this.currentRoom) {
                this.currentRoom.draw(this.ctx, this.player.level);
            }
        } else if (this.currentScene === SCENE_TYPES.TRAINING) {
            // 绘制训练场
            this.trainingGroundScene.draw(this.ctx);
        }
        
        // 绘制掉落物
        this.droppedItems.forEach(item => {
            item.draw(this.ctx);
        });
        
        // 绘制传送门
        this.portals.forEach(portal => {
            portal.draw(this.ctx, this);
        });
        
        // 绘制足迹（用线表示）- 轨迹是游戏世界中的实体，需要在恢复相机偏移之前绘制
        // 轨迹坐标是游戏世界坐标，已经应用了视野缩放和相机偏移
        if (this.player.traitTrails && this.player.traitTrails.length > 1) {
            this.drawTrails(this.ctx);
        }
        
        // 恢复相机偏移量，准备绘制玩家（玩家永远在屏幕中央）
        this.ctx.translate(this.cameraX, this.cameraY);
        
        // 绘制玩家（始终在屏幕中央）
        // 使用临时变换将玩家绘制在屏幕中心
        this.ctx.save();
        // 计算将玩家从实际位置移动到屏幕中心的偏移量
        const playerOffsetX = CONFIG.CANVAS_WIDTH / 2 - this.player.x;
        const playerOffsetY = CONFIG.CANVAS_HEIGHT / 2 - this.player.y;
        this.ctx.translate(playerOffsetX, playerOffsetY);
        this.player.draw(this.ctx);
        this.ctx.restore();
        
        // 绘制粒子系统（在世界坐标系中）- 需要应用相机偏移
        this.ctx.translate(-this.cameraX, -this.cameraY);
        this.particleManager.draw(this.ctx);
        this.ctx.translate(this.cameraX, this.cameraY);
        
        // 绘制飘浮文字（在玩家上方）- 需要应用相机偏移
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.translate(-this.cameraX, -this.cameraY);
        this.floatingTexts.forEach(text => {
            text.draw(this.ctx);
        });
        this.ctx.translate(this.cameraX, this.cameraY);
        
        // 绘制交互提示 - 需要应用相机偏移
        if (this.currentInteraction && !this.paused) {
            this.ctx.translate(-this.cameraX, -this.cameraY);
            this.drawInteractionHint(this.ctx, this.currentInteraction);
            this.ctx.translate(this.cameraX, this.cameraY);
        }
        
        // 绘制打造装备特效 - 需要应用相机偏移
        this.ctx.translate(-this.cameraX, -this.cameraY);
        this.drawWeaponSkillAimPreview(this.ctx);
        this.drawEquipmentEffects(this.ctx);
        this.drawMonsterProjectiles(this.ctx);
        this.drawGroundHazardsAndPendingAoE(this.ctx);
        this.ctx.translate(this.cameraX, this.cameraY);
        
        // 恢复缩放状态
        this.ctx.restore();
        
        // 绘制小地图
        this.drawMinimap();
    }
    
    /**
     * 绘制小地图
     */
    drawMinimap() {
        if (!this.minimapCanvas || !this.minimapCtx) {
            return;
        }
        
        const ctx = this.minimapCtx;
        const minimapWidth = this.minimapCanvas.width;
        const minimapHeight = this.minimapCanvas.height;
        
        // 清空小地图
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, minimapWidth, minimapHeight);
        
        // 获取当前场景的尺寸
        let sceneWidth = CONFIG.CANVAS_WIDTH;
        let sceneHeight = CONFIG.CANVAS_HEIGHT;
        
        if (this.currentScene === SCENE_TYPES.TOWER && this.currentRoom) {
            sceneWidth = this.currentRoom.width;
            sceneHeight = this.currentRoom.height;
        }
        
        // 计算缩放比例，使整个场景能显示在小地图中
        const scaleX = minimapWidth / sceneWidth;
        const scaleY = minimapHeight / sceneHeight;
        const scale = Math.min(scaleX, scaleY);
        
        // 计算偏移量，使场景居中
        const offsetX = (minimapWidth - sceneWidth * scale) / 2;
        const offsetY = (minimapHeight - sceneHeight * scale) / 2;
        
        // 绘制场景边界
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(offsetX, offsetY, sceneWidth * scale, sceneHeight * scale);
        
        // 绘制玩家（白色）
        const playerX = offsetX + this.player.x * scale;
        const playerY = offsetY + this.player.y * scale;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(playerX, playerY, Math.max(2, this.player.size * scale / 2), 0, Math.PI * 2);
        ctx.fill();
        
        // 根据场景类型绘制不同的实体
        if (this.currentScene === SCENE_TYPES.TOWER && this.currentRoom) {
            // 绘制怪物（红色）
            if (this.currentRoom.monsters) {
                this.currentRoom.monsters.forEach(monster => {
                    if (monster.hp > 0) {
                        const monsterX = offsetX + monster.x * scale;
                        const monsterY = offsetY + monster.y * scale;
                        ctx.fillStyle = '#ff0000';
                        ctx.beginPath();
                        ctx.arc(monsterX, monsterY, Math.max(1, monster.size * scale / 2), 0, Math.PI * 2);
                        ctx.fill();
                    }
                });
            }
            
            // 绘制宝箱（原本颜色）
            if (this.currentRoom.treasureChest && !this.currentRoom.treasureChest.opened) {
                const chestX = offsetX + this.currentRoom.treasureChest.x * scale;
                const chestY = offsetY + this.currentRoom.treasureChest.y * scale;
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(chestX - 3, chestY - 2, 6, 4);
            }
            
            // 绘制休整物品（原本颜色）
            if (this.currentRoom.restItem && !this.currentRoom.restItem.used) {
                const itemX = offsetX + this.currentRoom.restItem.x * scale;
                const itemY = offsetY + this.currentRoom.restItem.y * scale;
                const colors = {
                    campfire: '#ff6600',
                    medkit: '#ff0000',
                    fountain: '#0088ff',
                    altar: '#ff00ff'
                };
                ctx.fillStyle = colors[this.currentRoom.restItem.type] || '#ffffff';
                ctx.beginPath();
                ctx.arc(itemX, itemY, Math.max(1, 2), 0, Math.PI * 2);
                ctx.fill();
            }
            
        } else if (this.currentScene === SCENE_TYPES.TOWN && this.townScene) {
            // 绘制主城建筑物（原本颜色）
            Object.values(this.townScene.buildings).forEach(building => {
                const buildingX = offsetX + building.x * scale;
                const buildingY = offsetY + building.y * scale;
                if (building.name === '恶魔塔入口') {
                    ctx.fillStyle = '#6a0dad';
                } else if (building.name === '铁匠铺') {
                    ctx.fillStyle = '#8b4513';
                } else if (building.name === '商店') {
                    ctx.fillStyle = '#daa520';
                } else if (building.name === '训练场') {
                    ctx.fillStyle = '#4a9eff';
                } else {
                    ctx.fillStyle = '#ffffff';
                }
                ctx.fillRect(buildingX - building.size * scale / 2, buildingY - building.size * scale / 2, 
                            building.size * scale, building.size * scale);
            });
        } else if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) {
            // 绘制训练桩（原本颜色）
            if (this.trainingGroundScene.dummies) {
                this.trainingGroundScene.dummies.forEach(dummy => {
                    const dummyX = offsetX + dummy.x * scale;
                    const dummyY = offsetY + dummy.y * scale;
                    ctx.fillStyle = dummy.color || '#666666';
                    ctx.beginPath();
                    ctx.arc(dummyX, dummyY, Math.max(1, dummy.size * scale / 2), 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        }
        
        // 绘制传送门（原本颜色）
        this.portals.forEach(portal => {
            const portalX = offsetX + portal.x * scale;
            const portalY = offsetY + portal.y * scale;
            if (portal.type === 'exit') {
                ctx.fillStyle = '#6a0dad';
            } else {
                ctx.fillStyle = '#4a9eff';
            }
            ctx.beginPath();
            ctx.arc(portalX, portalY, Math.max(1, portal.size * scale / 2), 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    /**
     * 添加打造装备特效
     * @param {string} type - 特效类型
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {Object} options - 额外选项（radius, angle等）
     */
    addEquipmentEffect(type, x, y, options = {}) {
        // 确保坐标有效
        if (isNaN(x) || isNaN(y)) {
            console.warn('无效的特效坐标:', x, y);
            return;
        }
        const effect = {
            type: type,
            x: x,
            y: y,
            startTime: Date.now(),
            duration: options.duration || 500,
            radius: options.radius || 50,
            angle: options.angle || 0,
            color: options.color || '#ffffff',
            targetX: options.targetX,
            targetY: options.targetY,
            followTarget: options.followTarget || null
        };
        this.equipmentEffects.push(effect);
    }
    
    /**
     * 武器技能「落点施法」：以鼠标相对屏幕中心的方向，在玩家周围 maxDist 内取世界坐标（无有效方向时用面朝角）
     */
    /**
     * 将指针事件映射到逻辑画布坐标（与 draw 中 scale(2) 后的坐标系一致，0…CANVAS_*），修正 CSS 缩放导致的偏差
     */
    updateMouseFromEvent(e) {
        if (!this.canvas || !e) return;
        const rect = this.canvas.getBoundingClientRect();
        const rw = rect.width > 0.5 ? rect.width : 1;
        const rh = rect.height > 0.5 ? rect.height : 1;
        this.mouse.x = (e.clientX - rect.left) * (CONFIG.CANVAS_WIDTH / rw);
        this.mouse.y = (e.clientY - rect.top) * (CONFIG.CANVAS_HEIGHT / rh);
    }

    getSkillGroundAimPoint(player, maxDist) {
        if (!player || maxDist <= 0) return { x: player.x, y: player.y };
        const cx = CONFIG.CANVAS_WIDTH / 2;
        const cy = CONFIG.CANVAS_HEIGHT / 2;
        let mx = cx;
        let my = cy;
        if (this.mouse && this.mouse.x != null && this.mouse.y != null) {
            mx = this.mouse.x;
            my = this.mouse.y;
        }
        let dx = mx - cx;
        let dy = my - cy;
        let len = Math.sqrt(dx * dx + dy * dy);
        if (len < 12) {
            dx = Math.cos(player.angle);
            dy = Math.sin(player.angle);
            len = 1;
        } else {
            dx /= len;
            dy /= len;
        }
        const d = Math.min(maxDist, Math.max(48, maxDist * 0.92));
        return {
            x: player.x + dx * d,
            y: player.y + dy * d
        };
    }

    _getVisionScaleForAim() {
        const configVision = window.CONFIG ? window.CONFIG.PLAYER_VISION : (CONFIG.PLAYER_VISION || 200);
        const baseVision = 200;
        return baseVision / Math.max(1, configVision);
    }

    /**
     * 逻辑画布坐标（与 mouse 一致）→ 世界坐标，与 draw() 中视野缩放一致
     */
    screenToWorldForAim(logicalMx, logicalMy) {
        const cx = CONFIG.CANVAS_WIDTH / 2;
        const cy = CONFIG.CANVAS_HEIGHT / 2;
        const S = this._getVisionScaleForAim();
        return {
            x: this.player.x + (logicalMx - cx) / S,
            y: this.player.y + (logicalMy - cy) / S
        };
    }

    /**
     * 将落点限制在以玩家为圆心、maxDist 为半径的圆内；圆内时与鼠标世界坐标重合，圆外时压在圆周上
     */
    clampGroundSkillAimWorldPoint(wx, wy, player, maxDist) {
        if (!player || maxDist <= 0) return { x: player.x, y: player.y };
        const dx = wx - player.x;
        const dy = wy - player.y;
        const d = Math.hypot(dx, dy);
        if (d <= 1e-4) {
            const r = Math.min(maxDist, 1);
            return {
                x: player.x + Math.cos(player.angle) * r,
                y: player.y + Math.sin(player.angle) * r
            };
        }
        if (d > maxDist) {
            const k = maxDist / d;
            return { x: player.x + dx * k, y: player.y + dy * k };
        }
        return { x: wx, y: wy };
    }

    _canUseWeaponSkillForBattle() {
        if (this.currentScene === SCENE_TYPES.TOWER && this.currentRoom &&
            (this.currentRoom.type === ROOM_TYPES.BATTLE || this.currentRoom.type === ROOM_TYPES.ELITE || this.currentRoom.type === ROOM_TYPES.BOSS)) {
            return true;
        }
        if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) return true;
        return false;
    }

    _getSkillMonsters() {
        if (this.currentScene === SCENE_TYPES.TOWER && this.currentRoom &&
            (this.currentRoom.type === ROOM_TYPES.BATTLE || this.currentRoom.type === ROOM_TYPES.ELITE || this.currentRoom.type === ROOM_TYPES.BOSS)) {
            return this.currentRoom.monsters;
        }
        if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) {
            return this.trainingGroundScene.dummies;
        }
        return null;
    }

    cancelWeaponSkillAim() {
        this.weaponSkillAim = null;
    }

    _onWeaponSkillInputDown(source) {
        if (this.paused) return;
        if (!this._canUseWeaponSkillForBattle()) return;
        if (this.player.isDashing || this.player.isCastingSkill) return;
        const now = Date.now();
        if (this.player.dashEndTime && now - this.player.dashEndTime < 500) return;
        if (this.player.weaponSkillCooldown > now) return;

        const gr = typeof this.player.resolveGroundAoeSkillRanges === 'function' ? this.player.resolveGroundAoeSkillRanges() : null;
        const lr = typeof this.player.resolveTargetLockSkillRange === 'function' ? this.player.resolveTargetLockSkillRange() : null;
        if (!gr && !lr) {
            if (source === 'rmb') return;
            const mon = this._getSkillMonsters();
            if (mon) this.player.useWeaponSkill(mon);
            return;
        }
        if (!this.weaponSkillAim) {
            if (gr) {
                this.weaponSkillAim = {
                    mode: 'ground_aoe',
                    hold: new Set(),
                    startTime: Date.now(),
                    active: false,
                    castRange: gr.castRange,
                    aoeRadius: gr.aoeRadius,
                    aimX: this.player.x,
                    aimY: this.player.y
                };
            } else {
                this.weaponSkillAim = {
                    mode: 'target_lock',
                    hold: new Set(),
                    startTime: Date.now(),
                    active: false,
                    lockRange: lr.range,
                    lockTarget: null
                };
            }
        }
        this.weaponSkillAim.hold.add(source);
    }

    _onWeaponSkillInputUp(source) {
        if (!this.weaponSkillAim) return;
        const g = this.weaponSkillAim;
        if (!g.hold.has(source)) return;
        g.hold.delete(source);
        if (g.hold.size > 0) return;
        const wasActive = g.active;
        const mode = g.mode;
        const aimX = g.aimX;
        const aimY = g.aimY;
        const lockTarget = g.lockTarget;
        this.weaponSkillAim = null;
        if (!wasActive) return;
        const mon = this._getSkillMonsters();
        if (!mon) return;
        if (mode === 'ground_aoe') {
            this.player.useWeaponSkill(mon, { groundPoint: { x: aimX, y: aimY } });
        } else if (mode === 'target_lock' && lockTarget) {
            this.player.useWeaponSkill(mon, { lockTarget });
        }
    }

    updateWeaponSkillAimState() {
        const g = this.weaponSkillAim;
        if (!g) return;
        if (this.player.isDashing || !this._canUseWeaponSkillForBattle()) {
            this.cancelWeaponSkillAim();
            return;
        }
        const now = Date.now();
        if (this.player.weaponSkillCooldown > now) {
            this.cancelWeaponSkillAim();
            return;
        }
        if (g.mode === 'ground_aoe') {
            const pr = typeof this.player.resolveGroundAoeSkillRanges === 'function' ? this.player.resolveGroundAoeSkillRanges() : null;
            if (!pr) {
                this.cancelWeaponSkillAim();
                return;
            }
            g.castRange = pr.castRange;
            g.aoeRadius = pr.aoeRadius;
        } else {
            const lr = typeof this.player.resolveTargetLockSkillRange === 'function' ? this.player.resolveTargetLockSkillRange() : null;
            if (!lr) {
                this.cancelWeaponSkillAim();
                return;
            }
            g.lockRange = lr.range;
        }
        const holdMs = 160;
        if (!g.active && now - g.startTime >= holdMs) {
            g.active = true;
        }
        if (!g.active) return;
        if (g.mode === 'ground_aoe') {
            const w = this.screenToWorldForAim(this.mouse.x, this.mouse.y);
            const c = this.clampGroundSkillAimWorldPoint(w.x, w.y, this.player, g.castRange);
            g.aimX = c.x;
            g.aimY = c.y;
        } else {
            const mon = this._getSkillMonsters();
            g.lockTarget = mon && typeof pickWeaponSkillLockTargetNearestToMouse === 'function'
                ? pickWeaponSkillLockTargetNearestToMouse(mon, this.player, g.lockRange, this)
                : null;
        }
    }

    /** 锁定技瞄准时：目标身上青绿虚线菱形 + 黄圈（与命中后的 skill_lock_marker 区分） */
    drawSkillLockPreviewMarker(ctx, x, y, now) {
        const pulse = 0.88 + 0.12 * Math.sin(now * 0.02);
        const lr = 21 * pulse;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(now * 0.0016);
        ctx.strokeStyle = 'rgba(120, 255, 200, 0.92)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(0, -lr);
        ctx.lineTo(lr, 0);
        ctx.lineTo(0, lr);
        ctx.lineTo(-lr, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 245, 160, 0.88)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, lr * 1.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawWeaponSkillAimPreview(ctx) {
        const g = this.weaponSkillAim;
        if (!g || !g.active || this.paused) return;
        const px = this.player.x;
        const py = this.player.y;
        const now = Date.now();
        ctx.save();
        if (g.mode === 'ground_aoe') {
            ctx.strokeStyle = 'rgba(120, 200, 255, 0.65)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.arc(px, py, g.castRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(255, 200, 90, 0.9)';
            ctx.fillStyle = 'rgba(255, 200, 90, 0.14)';
            ctx.beginPath();
            ctx.arc(g.aimX, g.aimY, g.aoeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(200, 120, 255, 0.65)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.arc(px, py, g.lockRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            if (g.lockTarget && g.lockTarget.x != null && g.lockTarget.y != null) {
                this.drawSkillLockPreviewMarker(ctx, g.lockTarget.x, g.lockTarget.y, now);
            }
        }
        ctx.restore();
    }
    
    /**
     * 添加怪物远程子弹（由远程怪 attack 内调用）
     */
    addMonsterProjectile(startX, startY, targetX, targetY, damage, monsterRef, duration = 400) {
        this.monsterProjectiles.push({
            x: startX,
            y: startY,
            startX,
            startY,
            targetX,
            targetY,
            startTime: Date.now(),
            duration,
            damage,
            monsterRef
        });
    }
    
    /**
     * 更新怪物子弹：位移、命中判定、对玩家造成伤害
     */
    onMonsterSlain(monster) {
        if (!monster || monster instanceof Boss) return;
        if (monster._deathHazard && typeof this.addGroundHazard === 'function') {
            const h = monster._deathHazard;
            this.addGroundHazard(monster.x, monster.y, h.radius, h.durationMs, h.dps, 'poison');
        }
        if (monster.goldBonusOnDeath > 0) {
            this.gainGold(monster.goldBonusOnDeath);
            this.addFloatingText(this.player.x, this.player.y, `额外 +${monster.goldBonusOnDeath} 金币`, '#ffee88', 1800, 16, true);
        }
    }

    addGroundHazard(x, y, radius, durationMs, dps, kind = 'poison') {
        if (!this.groundHazards) this.groundHazards = [];
        this.groundHazards.push({
            x, y, radius,
            expireTime: Date.now() + durationMs,
            dps: Math.max(1, Math.floor(dps)),
            lastTick: 0,
            kind
        });
    }

    addSoulCircle(data) {
        if (!this.soulCircles) this.soulCircles = [];
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return;
        this.soulCircles.push({
            x: data.x,
            y: data.y,
            radius: data.radius,
            expireTime: data.expireTime,
            healPerTick: Math.max(0, Math.floor(data.healPerTick || 0)),
            healIntervalMs: Math.max(200, data.healIntervalMs || 800),
            slowMult: typeof data.slowMult === 'number' ? data.slowMult : 0.75,
            slowDurationMs: Math.max(200, data.slowDurationMs || 800),
            lastHealTick: 0,
            _lastPlayerSlowApply: 0,
            casterRef: data.casterRef || null
        });
    }

    updateSoulCircles() {
        if (!this.soulCircles || !this.soulCircles.length || !this.player || !this.currentRoom || !this.currentRoom.monsters) return;
        const now = Date.now();
        this.soulCircles = this.soulCircles.filter(c => now < c.expireTime);
        for (let i = 0; i < this.soulCircles.length; i++) {
            const c = this.soulCircles[i];
            if (now - (c.lastHealTick || 0) >= c.healIntervalMs) {
                c.lastHealTick = now;
                const mons = this.currentRoom.monsters;
                for (let j = 0; j < mons.length; j++) {
                    const m = mons[j];
                    if (!m || m.hp <= 0) continue;
                    const dx = m.x - c.x;
                    const dy = m.y - c.y;
                    if (dx * dx + dy * dy <= c.radius * c.radius && c.healPerTick > 0) {
                        m.hp = Math.min(m.maxHp, m.hp + c.healPerTick);
                    }
                }
            }
            const pdx = this.player.x - c.x;
            const pdy = this.player.y - c.y;
            if (pdx * pdx + pdy * pdy <= c.radius * c.radius) {
                if (now - (c._lastPlayerSlowApply || 0) >= 280) {
                    c._lastPlayerSlowApply = now;
                    if (!this.player.slowEffects) this.player.slowEffects = [];
                    this.player.slowEffects.push({ multiplier: c.slowMult, expireTime: now + c.slowDurationMs });
                }
            }
        }
    }

    updateGroundHazards() {
        if (!this.groundHazards || !this.groundHazards.length || !this.player) return;
        const now = Date.now();
        this.groundHazards = this.groundHazards.filter(h => h.expireTime > now);
        for (let i = 0; i < this.groundHazards.length; i++) {
            const h = this.groundHazards[i];
            const dx = this.player.x - h.x;
            const dy = this.player.y - h.y;
            if (dx * dx + dy * dy > h.radius * h.radius) continue;
            if (now - h.lastTick < 500) continue;
            h.lastTick = now;
            const killed = this.player.takeDamage(h.dps, null, false);
            if (killed) this.isPlayerDead = true;
            const col = h.kind === 'acid' ? '#88ff44' : '#44ff88';
            this.addFloatingText(this.player.x, this.player.y - 20, `-${h.dps}`, col, 600, 14, true);
        }
    }

    queueMonsterAoETelegraph(tx, ty, damage, radius, telegraphMs, monsterRef) {
        if (!this.pendingMonsterAoE) this.pendingMonsterAoE = [];
        this.pendingMonsterAoE.push({
            tx, ty, damage, radius,
            telegraphMs,
            startTime: Date.now(),
            hitDone: false,
            monsterRef
        });
    }

    updatePendingMonsterAoE() {
        if (!this.pendingMonsterAoE || !this.pendingMonsterAoE.length || !this.player) return;
        const now = Date.now();
        this.pendingMonsterAoE = this.pendingMonsterAoE.filter(entry => {
            if (entry.hitDone) return false;
            const elapsed = now - entry.startTime;
            if (elapsed < entry.telegraphMs) return true;
            const dx = this.player.x - entry.tx;
            const dy = this.player.y - entry.ty;
            if (dx * dx + dy * dy <= entry.radius * entry.radius) {
                const killed = this.player.takeDamage(entry.damage, entry.monsterRef || null, false);
                if (killed) this.isPlayerDead = true;
            }
            entry.hitDone = true;
            return false;
        });
    }

    damagePlayerInRadius(x, y, radius, damage, attackerRef) {
        if (!this.player) return;
        const dx = this.player.x - x;
        const dy = this.player.y - y;
        if (dx * dx + dy * dy > radius * radius) return;
        const killed = this.player.takeDamage(damage, attackerRef, false);
        if (killed) this.isPlayerDead = true;
        this.addFloatingText(this.player.x, this.player.y, `爆裂 ${damage}`, '#ff66aa', 1200, 18, true);
    }

    applyPlayerKnockback(player, fromX, fromY, force) {
        if (!player) return;
        const dx = player.x - fromX;
        const dy = player.y - fromY;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / d;
        const ny = dy / d;
        player.x += nx * force;
        player.y += ny * force;
        const w = CONFIG.CANVAS_WIDTH;
        const h = CONFIG.CANVAS_HEIGHT;
        player.x = Math.max(player.size / 2, Math.min(w - player.size / 2, player.x));
        player.y = Math.max(player.size / 2, Math.min(h - player.size / 2, player.y));
    }

    updateMonsterProjectiles() {
        if (!this.monsterProjectiles || !this.player) return;
        const now = Date.now();
        const hitRadius = 20;
        this.monsterProjectiles = this.monsterProjectiles.filter(proj => {
            const elapsed = now - proj.startTime;
            const progress = Math.min(1, elapsed / proj.duration);
            proj.x = proj.startX + (proj.targetX - proj.startX) * progress;
            proj.y = proj.startY + (proj.targetY - proj.startY) * progress;
            if (progress >= 1) return false;
            const dx = this.player.x - proj.x;
            const dy = this.player.y - proj.y;
            if (dx * dx + dy * dy <= hitRadius * hitRadius) {
                const killed = this.player.takeDamage(proj.damage, proj.monsterRef || null, false);
                if (proj.monsterRef && typeof applyMonsterOnHitPlayerEffects === 'function') {
                    applyMonsterOnHitPlayerEffects(this.player, proj.monsterRef);
                }
                if (killed) this.isPlayerDead = true;
                return false;
            }
            return true;
        });
    }
    
    /**
     * 绘制怪物远程子弹（红色小圆）
     */
    drawGroundHazardsAndPendingAoE(ctx) {
        const now = Date.now();
        if (this.groundHazards && this.groundHazards.length) {
            this.groundHazards.forEach(h => {
                ctx.save();
                const alpha = 0.22 + 0.12 * Math.sin(now / 280);
                ctx.fillStyle = h.kind === 'acid' ? `rgba(140, 255, 80, ${alpha})` : `rgba(80, 220, 120, ${alpha})`;
                ctx.beginPath();
                ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = h.kind === 'acid' ? 'rgba(180,255,100,0.5)' : 'rgba(120,255,160,0.5)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            });
        }
        if (this.pendingMonsterAoE && this.pendingMonsterAoE.length) {
            this.pendingMonsterAoE.forEach(p => {
                if (p.hitDone) return;
                const elapsed = now - p.startTime;
                const ratio = Math.min(1, elapsed / p.telegraphMs);
                ctx.save();
                ctx.fillStyle = `rgba(255, 80, 180, ${0.15 + ratio * 0.2})`;
                ctx.beginPath();
                ctx.arc(p.tx, p.ty, p.radius * ratio, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,120,200,0.7)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            });
        }
        if (this.soulCircles && this.soulCircles.length) {
            this.soulCircles.forEach(c => {
                if (now >= c.expireTime) return;
                ctx.save();
                const pulse = 0.18 + 0.08 * Math.sin(now / 320);
                ctx.fillStyle = `rgba(140, 80, 220, ${pulse})`;
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(100, 255, 160, 0.45)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            });
        }
    }

    drawMonsterProjectiles(ctx) {
        if (!this.monsterProjectiles || !this.monsterProjectiles.length) return;
        const now = Date.now();
        this.monsterProjectiles.forEach(proj => {
            const elapsed = now - proj.startTime;
            const progress = Math.min(1, elapsed / proj.duration);
            const x = proj.startX + (proj.targetX - proj.startX) * progress;
            const y = proj.startY + (proj.targetY - proj.startY) * progress;
            ctx.save();
            ctx.fillStyle = '#ff3333';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        });
    }
    
    /**
     * 绘制打造装备特效
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     */
    drawEquipmentEffects(ctx) {
        if (!this.equipmentEffects || this.equipmentEffects.length === 0) {
            return; // 没有特效时直接返回
        }
        const now = Date.now();
        this.equipmentEffects = this.equipmentEffects.filter(effect => {
            const elapsed = now - effect.startTime;
            if (elapsed >= effect.duration) {
                return false; // 移除过期特效
            }
            
            if (effect.followTarget && typeof effect.followTarget.x === 'number' && typeof effect.followTarget.y === 'number') {
                effect.x = effect.followTarget.x;
                effect.y = effect.followTarget.y;
            }
            
            const progress = elapsed / effect.duration; // 0-1
            const alpha = 1 - progress * 0.5; // 逐渐消失，但保持一定可见度
            
            ctx.save();
            ctx.globalAlpha = Math.max(0.3, alpha); // 确保最小可见度
            
            switch (effect.type) {
                case 'skill_hit': // 通用技能命中 - 斩击/冲击光圈
                    const hitRadius = Math.max(15, (effect.radius || 48) * Math.min(1, progress * 1.3));
                    ctx.strokeStyle = 'rgba(255, 220, 100, ' + Math.max(0.4, alpha) + ')';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, hitRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(255, 200, 80, ' + Math.max(0.15, alpha * 0.4) + ')';
                    ctx.fill();
                    break;
                    
                case 'ground_sigil': // 落点范围技能：地面符文圈 + 内环脉冲
                    const gRad = Math.max(24, (effect.radius || 90) * (0.35 + progress * 0.92));
                    ctx.strokeStyle = 'rgba(120, 200, 255, ' + Math.max(0.45, alpha) + ')';
                    ctx.lineWidth = 5;
                    ctx.setLineDash([10, 8]);
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, gRad, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.max(0.35, alpha * 0.85) + ')';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, gRad * (0.55 + 0.08 * Math.sin(elapsed * 0.02)), 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(80, 160, 255, ' + Math.max(0.12, alpha * 0.28) + ')';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, gRad * 0.35, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                    
                case 'skill_lock_marker': // 锁定技：目标身上菱形准星 + 旋转角标
                    const pulse = 0.85 + 0.15 * Math.sin(elapsed * 0.018);
                    const lr = 22 * pulse;
                    ctx.strokeStyle = 'rgba(255, 80, 120, ' + Math.max(0.65, alpha) + ')';
                    ctx.lineWidth = 3;
                    ctx.save();
                    ctx.translate(effect.x, effect.y);
                    ctx.rotate(elapsed * 0.0022);
                    ctx.beginPath();
                    ctx.moveTo(0, -lr);
                    ctx.lineTo(lr, 0);
                    ctx.lineTo(0, lr);
                    ctx.lineTo(-lr, 0);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.rotate(Math.PI / 4);
                    ctx.strokeStyle = 'rgba(255, 220, 100, ' + Math.max(0.5, alpha * 0.9) + ')';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, lr * 1.35, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                    break;
                    
                case 'magic_explosion': // 魔法水晶剑 - 紫色圆形爆炸
                    // 从中心向外扩散，确保初始大小可见
                    const magicRadius = Math.max(10, effect.radius * Math.min(1, progress * 1.2));
                    ctx.fillStyle = '#ff00ff';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, magicRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ff88ff';
                    ctx.lineWidth = 4;
                    ctx.stroke();
                    break;
                    
                case 'dragon_breath': // 远古龙刃 - 红色扇形龙息
                    // 扇形从玩家位置向前扩散，确保初始大小可见
                    const breathRadius = Math.max(20, effect.radius * Math.min(1, progress * 1.2));
                    ctx.fillStyle = '#ff4400';
                    ctx.beginPath();
                    // 扇形的起点在玩家位置方向
                    const startX = effect.x - Math.cos(effect.angle) * breathRadius * 0.2;
                    const startY = effect.y - Math.sin(effect.angle) * breathRadius * 0.2;
                    ctx.moveTo(startX, startY);
                    const startAngle = effect.angle - Math.PI / 3; // 60度扇形
                    const endAngle = effect.angle + Math.PI / 3;
                    ctx.arc(effect.x, effect.y, breathRadius, startAngle, endAngle);
                    ctx.closePath();
                    ctx.fill();
                    break;
                    
                case 'chaos_blast': // 混沌之刃 - 紫色/黑色圆形爆炸
                    const chaosRadius = Math.max(10, effect.radius * Math.min(1, progress * 1.2));
                    ctx.fillStyle = '#8b00ff';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, chaosRadius, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#000000';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, chaosRadius * 0.6, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                    
                case 'ranged_bullet': // 玩家远程子弹：红点从起点飞向目标
                    const tx = effect.targetX != null ? effect.targetX : effect.x;
                    const ty = effect.targetY != null ? effect.targetY : effect.y;
                    const bx = effect.x + (tx - effect.x) * progress;
                    const by = effect.y + (ty - effect.y) * progress;
                    ctx.fillStyle = '#ff3333';
                    ctx.beginPath();
                    ctx.arc(bx, by, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    break;
                    
                case 'reflect_shield': // 龙鳞护甲 - 金色圆形反弹（从外向内收缩）
                    const reflectRadius = effect.radius * (1 - progress * 0.5); // 从外向内
                    ctx.strokeStyle = '#ffd700';
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, reflectRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
                    ctx.fill();
                    break;
                    
                case 'mithril_shield': // 秘银战甲 - 银色护盾（从外向内收缩）
                    const mithrilRadius = effect.radius * (1 - progress * 0.5);
                    ctx.strokeStyle = '#c0c0c0';
                    ctx.lineWidth = 6;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, mithrilRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(192, 192, 192, 0.3)';
                    ctx.fill();
                    break;
                    
                case 'divine_shield': // 神威头盔 - 金色护盾（从外向内收缩）
                    const divineRadius = effect.radius * (1 - progress * 0.5);
                    ctx.strokeStyle = '#ffd700';
                    ctx.lineWidth = 7;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, divineRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
                    ctx.fill();
                    break;
                    
                case 'heal_aura': // 永恒战甲 - 绿色恢复光环（从内向外扩散）
                    const healRadius = Math.max(15, effect.radius * Math.min(1, progress * 1.5));
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, healRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
                    ctx.fill();
                    break;
                    
                case 'fire_spark': // 淬火/火焰词条 - 橙红火星
                    const fireR = (effect.radius || 35) * (1 - progress * 0.6);
                    ctx.fillStyle = 'rgba(255, 120, 0, ' + alpha + ')';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, fireR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 80, 0, ' + alpha + ')';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    break;
                    
                case 'freeze_ring': // 霜寒/冰晶词条 - 冰蓝光圈
                    const freezeR = (effect.radius || 40) * (0.6 + progress * 0.5);
                    ctx.strokeStyle = 'rgba(100, 200, 255, ' + alpha + ')';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, freezeR, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(150, 220, 255, ' + Math.max(0.1, alpha * 0.25) + ')';
                    ctx.fill();
                    break;
                    
                case 'lightning_chain': // 雷神/雷鸣词条 - 闪电链
                    const lightningR = (effect.radius || 50) * Math.min(1, progress * 1.2);
                    ctx.strokeStyle = 'rgba(200, 230, 255, ' + alpha + ')';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, lightningR, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(180, 220, 255, ' + Math.max(0.1, alpha * 0.2) + ')';
                    ctx.fill();
                    break;
                    
                case 'holy_blast': // 圣耀范围词条 - 金色范围伤害
                    const holyR = (effect.radius || 60) * Math.min(1, progress * 1.2);
                    ctx.fillStyle = 'rgba(255, 215, 0, ' + Math.max(0.2, alpha * 0.5) + ')';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, holyR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 235, 100, ' + alpha + ')';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                    break;
                    
                case 'relic_spark': // 古遗词条 - 古铜色闪光
                    const relicR = (effect.radius || 30) * (1 - progress * 0.5);
                    ctx.fillStyle = 'rgba(205, 160, 80, ' + alpha + ')';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, relicR, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                    
                case 'speed_aura': // 辉光词条 - 攻速提升淡黄光环
                    const speedR = (effect.radius || 35) * (0.8 + progress * 0.4);
                    ctx.strokeStyle = 'rgba(255, 255, 150, ' + Math.max(0.3, alpha) + ')';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, speedR, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                    
                case 'crit_spark': // 暴击/占星词条 - 紫金闪光
                    const critR = (effect.radius || 28) * (1 - progress * 0.6);
                    ctx.fillStyle = 'rgba(255, 180, 255, ' + alpha + ')';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, critR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 200, 100, ' + alpha + ')';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    break;
                    
                case 'small_fire_breath': // 龙息之握等小范围火焰
                    const sBreathR = (effect.radius || 45) * Math.min(1, progress * 1.1);
                    ctx.fillStyle = 'rgba(255, 100, 0, ' + Math.max(0.25, alpha * 0.6) + ')';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, sBreathR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 60, 0, ' + alpha + ')';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    break;

                case 'deep_volt_spike': // 深阶殛刃：放射状电刺
                    {
                        const spikes = 7;
                        const baseR = effect.radius || 52;
                        const len = baseR * (0.38 + progress * 0.62) * (1 - progress * 0.35);
                        ctx.strokeStyle = 'rgba(120, 240, 255, ' + alpha + ')';
                        ctx.lineWidth = 2;
                        for (let si = 0; si < spikes; si++) {
                            const ang = (si / spikes) * Math.PI * 2 + elapsed * 0.003;
                            ctx.beginPath();
                            ctx.moveTo(effect.x, effect.y);
                            ctx.lineTo(effect.x + Math.cos(ang) * len, effect.y + Math.sin(ang) * len);
                            ctx.stroke();
                        }
                        ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.max(0.2, alpha * 0.55) + ')';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, 6 + progress * 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;

                case 'deep_plague_burst': // 深阶溃解：毒绿溃散环
                    {
                        const pr = (effect.radius || 44) * (0.42 + progress * 0.78);
                        ctx.fillStyle = 'rgba(80, 200, 60, ' + Math.max(0.12, alpha * 0.38) + ')';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, pr, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(180, 255, 100, ' + alpha + ')';
                        ctx.lineWidth = 3;
                        ctx.setLineDash([4, 6]);
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, pr, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                    break;

                case 'deep_tint_burst': // 深阶 DoT：可配置色调的脉冲环
                    {
                        const col = typeof effect.color === 'string' && effect.color.length >= 4 ? effect.color : '#ff8866';
                        const tr = (effect.radius || 40) * (0.32 + progress * 1.02);
                        ctx.strokeStyle = col;
                        ctx.globalAlpha = Math.max(0.35, alpha * 0.92);
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, tr, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.fillStyle = col;
                        ctx.globalAlpha = Math.max(0.12, alpha * 0.22);
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, tr * 0.48, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;

                case 'deep_expose_ring': // 深阶印蚀：虚线紫环（可跟随目标）
                    {
                        const er = (effect.radius || 40) * (0.48 + progress * 0.62);
                        ctx.strokeStyle = 'rgba(221, 170, 255, ' + Math.max(0.45, alpha) + ')';
                        ctx.lineWidth = 3;
                        ctx.setLineDash([6, 5]);
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, er, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }
                    break;

                case 'deep_void_ping': // 深阶虚回：短促紫环扩散
                    {
                        const t = progress < 0.32 ? progress / 0.32 : 1 - (progress - 0.32) / 0.68;
                        const vr = (effect.radius || 46) * Math.max(0.12, t);
                        ctx.strokeStyle = 'rgba(170, 136, 255, ' + Math.max(0.35, alpha) + ')';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, Math.max(10, vr), 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    break;

                case 'deep_shockwave_ring': // 深阶殒震：橙白冲击环
                    {
                        const sr = (effect.radius || 76) * (0.12 + progress * 0.96);
                        ctx.strokeStyle = 'rgba(255, 200, 120, ' + Math.max(0.4, alpha * 0.95) + ')';
                        ctx.lineWidth = 5;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, sr, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.max(0.2, alpha * 0.55) + ')';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, sr * 0.9, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    break;

                case 'deep_retaliate_burst': // 深阶反噬：敌身爆闪
                    {
                        const br = (effect.radius || 36) * (1 - progress * 0.78);
                        ctx.fillStyle = 'rgba(255, 100, 60, ' + Math.max(0.15, alpha * 0.55) + ')';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, br, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255, 180, 100, ' + alpha + ')';
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    }
                    break;

                case 'deep_volt_ring': // 深阶电场：青色脉动环
                    {
                        const vr2 = (effect.radius || 110) * (0.22 + progress * 0.88);
                        ctx.strokeStyle = 'rgba(100, 220, 255, ' + Math.max(0.4, alpha) + ')';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, vr2, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(220, 255, 255, ' + Math.max(0.25, alpha * 0.75) + ')';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, vr2 * (0.92 + 0.04 * Math.sin(elapsed * 0.025)), 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    break;

                case 'deep_sky_bolt': // 深阶天雷：竖向落雷 + 亮核
                    {
                        const br2 = (effect.radius || 72) * (0.22 + progress * 0.95);
                        ctx.strokeStyle = 'rgba(0, 255, 255, ' + alpha + ')';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, br2, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.max(0.35, alpha * 0.92) + ')';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, br2 * 0.22, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(200, 255, 255, ' + Math.max(0.2, alpha * 0.65) + ')';
                        ctx.lineWidth = 2;
                        const topY = effect.y - Math.min(220, (effect.radius || 72) * 2.2);
                        ctx.beginPath();
                        ctx.moveTo(effect.x, topY);
                        ctx.lineTo(effect.x, effect.y);
                        ctx.stroke();
                    }
                    break;
                    
                case 'combo_slash': // 连击/额外攻击词条 - 白色斩光
                    const comboR = (effect.radius || 32) * (1 - progress * 0.7);
                    ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha + ')';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, comboR, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                    
                case 'void_vein_burst': // 深阶魔印·裂脉：紫粉脉裂环（独立伤害段）
                    const vvR = (effect.radius || 48) * (0.32 + progress * 1.05);
                    ctx.strokeStyle = 'rgba(224, 64, 251, ' + Math.max(0.55, alpha) + ')';
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, vvR, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.strokeStyle = 'rgba(255, 210, 255, ' + Math.max(0.4, alpha * 0.9) + ')';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, vvR * 0.52, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(186, 104, 200, ' + Math.max(0.2, alpha * 0.45) + ')';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, vvR * 0.42, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }
            
            ctx.restore();
            return true; // 保留未过期的特效
        });
    }
    
    /**
     * 绘制足迹（用线表示）
     */
    drawTrails(ctx) {
        const trails = this.player.traitTrails;
        if (trails.length < 2) return;
        
        // 根据词条和套装决定颜色
        const traitIds = this.player.getEquipmentTraitIds();
        let trailColor = '#ffffff'; // 默认白色
        
        if (traitIdsIncludeBase(traitIds, 'galaxy_trail')) {
            trailColor = '#9900ff'; // 银河轨迹 - 紫色
        } else if (traitIdsIncludeBase(traitIds, 'fire_trail')) {
            trailColor = '#ff4400'; // 踏火余烬 - 红色
        }
        
        // 检查套装效果
        if (typeof getActiveSetEffects === 'function') {
            const activeSets = getActiveSetEffects(this.player.equipment);
            activeSets.forEach(set => {
                if (set.setName === '烈焰套装') trailColor = '#ff4400';
                else if (set.setName === '霜寒套装') trailColor = '#00ffff';
                else if (set.setName === '雷霆套装') trailColor = '#ffff00';
            });
        }
        
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = 8; // 足迹更宽，视觉更明显
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(trails[0].x, trails[0].y);
        for (let i = 1; i < trails.length; i++) {
            ctx.lineTo(trails[i].x, trails[i].y);
        }
        ctx.stroke();
    }
    
    /**
     * 恶魔的干扰：层结束时触发
     */
    startDemonInterference() {
        if (this.demonInterferenceActive) return;
        this.demonInterferenceActive = true;
        this.paused = true;
        if (this.soundManager) this.soundManager.pauseBgm();
        
        const overlay = document.getElementById('demon-overlay');
        const modal = document.getElementById('demon-interference-modal');
        if (overlay) overlay.classList.add('show');
        if (modal) modal.classList.add('show');
        
        const effect = this.pickRandomDemonEffect();
        this.demonInterferenceEffect = effect;
        this.demonEffectStatusText = effect.statusText || effect.text;
        
        this.showDemonInterferenceDialog(effect.text, () => {
            if (effect.type === 'c') {
                this.closeDemonInterference();
                this.applyDemonEffect(effect);
                return;
            }
            this.applyDemonEffect(effect);
            this.demonInterferenceFlags = {};
            if (effect.type === 'b') {
                if (effect.sealExit) this.demonInterferenceFlags.sealExit = true;
                if (effect.forceRoomTypes) this.demonInterferenceFlags.forceRoomTypes = effect.forceRoomTypes;
            }
            this.generatePortals();
            this.demonInterferenceFlags = {}; // 仅本次生成有效，下次清空
            this.closeDemonInterference();
        });
    }
    
    pickRandomDemonEffect() {
        const roll = Math.random();
        const attrNames = ['maxHp','defense','attack','critRate','critDamage','moveSpeed','attackSpeed'];
        const attrLabels = { maxHp:'血量上限', defense:'防御力', attack:'攻击力', critRate:'暴击率', critDamage:'暴击伤害', moveSpeed:'移动速度', attackSpeed:'攻击速度' };
        const reductions = [0.05,0.1,0.15,0.2,0.25,0.3,0.35,0.4,0.45,0.5];
        
        if (roll < 0.4) {
            const attr = attrNames[Math.floor(Math.random() * attrNames.length)];
            const reduction = reductions[Math.floor(Math.random() * reductions.length)];
            return {
                type: 'a',
                attr, reduction,
                text: `恶魔撕咬了你的力量，本次恶魔塔内【${attrLabels[attr]}】永久降低${Math.round(reduction*100)}%。`,
                statusText: `恶魔干扰：${attrLabels[attr]} -${Math.round(reduction*100)}%`
            };
        }
        if (roll < 0.6) {
            const subRoll = Math.random();
            if (subRoll < 0.5) {
                return {
                    type: 'b',
                    forceRoomTypes: [ROOM_TYPES.BATTLE],
                    text: '恶魔篡改了你的命运，下一层只能选择战斗房间。',
                    statusText: '恶魔干扰：下一层仅战斗'
                };
            } else {
                return {
                    type: 'b',
                    sealExit: true,
                    text: '恶魔封印了你的退路，本层无法离开恶魔塔。',
                    statusText: '恶魔干扰：出口已封印'
                };
            }
        }
        if (roll < 0.7) {
            return {
                type: 'c',
                text: '恶魔夺走了你的生命，你在本次恶魔塔中倒下了。',
                statusText: '恶魔干扰：生命被清空'
            };
        }
        if (roll < 0.85) {
            const tabs = ['equipment','material','consumable'];
            const tabLabels = { equipment:'装备', material:'材料', consumable:'消耗品' };
            const tab = tabs[Math.floor(Math.random() * tabs.length)];
            return {
                type: 'd',
                tab,
                text: `恶魔掠夺了你的财物，本次恶魔塔中获得的【${tabLabels[tab]}】已被全部夺走。`,
                statusText: `恶魔干扰：${tabLabels[tab]}被清空`
            };
        }
        return {
            type: 'e',
            text: '恶魔嘲笑你的贪婪，本次恶魔塔中获得的金币全部化为乌有。',
            statusText: '恶魔干扰：塔内金币清空'
        };
    }
    
    applyDemonEffect(effect) {
        if (effect.type === 'a') {
            this.player.demonDebuffs = this.player.demonDebuffs || {};
            this.player.demonDebuffs[effect.attr] = effect.reduction;
            this.player.updateStats();
        } else if (effect.type === 'c') {
            this.player.hp = 0;
            this.isPlayerDead = true;
            const resurrectionItem = this.findResurrectionItem();
            if (resurrectionItem) {
                this.showResurrectionDialog(resurrectionItem);
            } else {
                this.returnToTown();
            }
        } else if (effect.type === 'd') {
            const [start, end] = effect.tab === 'equipment' ? [0, this.player.maxEquipmentCapacity] :
                effect.tab === 'material' ? [18, 18 + this.player.maxAlchemyCapacity] :
                [48, 48 + this.player.maxPotionCapacity];
            for (let i = start; i < end; i++) {
                const item = this.player.inventory[i];
                if (item && item.uniqueId && this.towerItems.has(item.uniqueId)) {
                    this.player.inventory[i] = null;
                    this.towerItems.delete(item.uniqueId);
                }
            }
            this.updateInventoryUI();
        } else if (effect.type === 'e') {
            const lost = Math.min(this.towerGoldGained, this.player.gold);
            this.player.gold -= lost;
            this.towerGoldGained = 0;
        }
        this.updateHUD();
        this.updateDemonEffectDisplay();
    }
    
    updateDemonEffectDisplay() {
        const el = document.getElementById('demon-effect-display');
        if (!el) return;
        if (this.demonEffectStatusText) {
            el.textContent = this.demonEffectStatusText;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }
    
    showDemonInterferenceDialog(fullText, onClose) {
        const textEl = document.getElementById('demon-interference-text');
        const hintEl = document.getElementById('demon-interference-hint');
        if (!textEl || !hintEl) return;
        
        textEl.textContent = '';
        hintEl.style.display = 'none';
        
        let idx = 0;
        const charDelay = 80;
        this.demonInterferenceTypingInterval = setInterval(() => {
            if (idx < fullText.length) {
                textEl.textContent += fullText[idx];
                idx++;
            } else {
                clearInterval(this.demonInterferenceTypingInterval);
                this.demonInterferenceTypingInterval = null;
                hintEl.style.display = 'block';
                
                const handler = (e) => {
                    if (e.code === 'Space') {
                        e.preventDefault();
                        document.removeEventListener('keydown', handler);
                        this.demonInterferenceSpaceHandler = null;
                        if (onClose) onClose();
                    }
                };
                this.demonInterferenceSpaceHandler = handler;
                document.addEventListener('keydown', handler);
            }
        }, charDelay);
    }
    
    closeDemonInterference() {
        if (this.demonInterferenceTypingInterval) {
            clearInterval(this.demonInterferenceTypingInterval);
            this.demonInterferenceTypingInterval = null;
        }
        if (this.demonInterferenceSpaceHandler) {
            document.removeEventListener('keydown', this.demonInterferenceSpaceHandler);
            this.demonInterferenceSpaceHandler = null;
        }
        
        const overlay = document.getElementById('demon-overlay');
        const modal = document.getElementById('demon-interference-modal');
        const textEl = document.getElementById('demon-interference-text');
        const hintEl = document.getElementById('demon-interference-hint');
        if (overlay) overlay.classList.remove('show');
        if (modal) modal.classList.remove('show');
        if (textEl) textEl.textContent = '';
        if (hintEl) hintEl.style.display = 'none';
        
        this.demonInterferenceActive = false;
        this.demonInterferenceEffect = null;
        this.paused = false;
        if (this.soundManager) this.soundManager.resumeBgm();
    }
    
    devTriggerDemonInterference() {
        if (this.currentScene !== SCENE_TYPES.TOWER) {
            alert('恶魔的干扰仅在恶魔塔内可用');
            return;
        }
        if (this.demonInterferenceActive) return;
        this.demonInterferenceActive = true;
        this.paused = true;
        if (this.soundManager) this.soundManager.pauseBgm();
        
        const overlay = document.getElementById('demon-overlay');
        const modal = document.getElementById('demon-interference-modal');
        if (overlay) overlay.classList.add('show');
        if (modal) modal.classList.add('show');
        
        const effect = this.pickRandomDemonEffect();
        this.demonInterferenceEffect = effect;
        this.demonEffectStatusText = effect.statusText || effect.text;
        
        this.showDemonInterferenceDialog(effect.text, () => {
            if (effect.type === 'c') {
                this.closeDemonInterference();
                this.applyDemonEffect(effect);
                return;
            }
            this.applyDemonEffect(effect);
            this.demonInterferenceFlags = {};
            if (effect.type === 'b') {
                if (effect.sealExit) this.demonInterferenceFlags.sealExit = true;
                if (effect.forceRoomTypes) this.demonInterferenceFlags.forceRoomTypes = effect.forceRoomTypes;
            }
            this.generatePortals();
            this.closeDemonInterference();
        });
    }
    
    devClearBuffs() {
        this.player.buffs = [];
        this.player.demonDebuffs = {};
        this.demonEffectStatusText = '';
        this.demonInterferenceFlags = {};
        this.player.updateStats();
        this.updateHUD();
        this.updateDemonEffectDisplay();
        const el = document.getElementById('demon-effect-display');
        if (el) el.style.display = 'none';
    }
    
    /**
     * 精英房通关：随机获得一条加护（可叠层）
     */
    grantRandomEliteBoon() {
        if (!this.player) return;
        if (!Array.isArray(this.player.eliteBoons)) this.player.eliteBoons = [];
        const ids = typeof ELITE_BOON_IDS !== 'undefined' ? ELITE_BOON_IDS : [];
        if (!ids.length) return;
        const id = ids[Math.floor(Math.random() * ids.length)];
        let entry = this.player.eliteBoons.find(b => b.id === id);
        let stacked = false;
        if (entry) {
            entry.stacks = (entry.stacks || 1) + 1;
            stacked = true;
        } else {
            this.player.eliteBoons.push({ id, stacks: 1 });
        }
        this.player.updateStats();
        if (typeof getEliteBoonMeta === 'function') {
            const meta = getEliteBoonMeta(id);
            const msg = stacked ? `加护强化：${meta.name}（层数+1）` : `获得精英加护：${meta.name}`;
            this.addFloatingText(this.player.x, this.player.y, msg, '#88ccff');
        }
        this.updateHUD();
    }
    
    /**
     * Boss 被击败：发放经验、金币与掉落（普通击杀流程不会处理 Boss）
     */
    onBossDefeated(monster) {
        if (!monster) return;
        if (monster._bossRewardGranted) return;
        monster._bossRewardGranted = true;
        this.gainExp(monster.expReward);
        this.gainGold(monster.goldReward);
        this.addFloatingText(this.player.x, this.player.y, `+${monster.expReward} 经验`, '#00ff00');
        this.addFloatingText(this.player.x, this.player.y, `+${monster.goldReward} 金币`, '#ffd700');
        const maxF = typeof window.getTowerMaxFloor === 'function' ? window.getTowerMaxFloor() : 240;
        if (this.floor >= maxF) {
            this.addFloatingText(this.player.x, this.player.y, '恭喜通关恶魔塔！', '#ffdd00');
        }
        const allEquipments = generateEquipments();
        const tierLevels = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
        const M = monster.level || 20;
        let availableLevels = tierLevels.filter(L => L <= M && L >= M - 18);
        if (!availableLevels.length) availableLevels = tierLevels.filter(L => L <= M);
        if (!availableLevels.length) availableLevels = [60];
        const levelEquipments = allEquipments.filter(eq => availableLevels.includes(eq.level) && !eq.isCrafted && (eq.quality === 'epic' || eq.quality === 'legendary'));
        const pool = levelEquipments.length ? levelEquipments : allEquipments.filter(eq => availableLevels.includes(eq.level) && !eq.isCrafted);
        if (pool.length > 0) {
            const randomEq = pool[Math.floor(Math.random() * pool.length)];
            const newEq = new Equipment({
                id: randomEq.id,
                name: randomEq.name,
                slot: randomEq.slot,
                weaponType: randomEq.weaponType,
                quality: randomEq.quality,
                level: randomEq.level,
                stats: JSON.parse(JSON.stringify(randomEq.stats)),
                refineLevel: 0
            });
            const dropAngle = Math.random() * Math.PI * 2;
            const dropDistance = 30 + Math.random() * 50;
            this.droppedItems.push(new DroppedItem(
                monster.x + Math.cos(dropAngle) * dropDistance,
                monster.y + Math.sin(dropAngle) * dropDistance,
                newEq,
                this
            ));
        }
        this.updateHUD();
    }
    
    initGapShop() {
        const contBtn = document.getElementById('gap-shop-continue-btn');
        const closeBtn = document.getElementById('gap-shop-close-btn');
        if (contBtn) contBtn.addEventListener('click', () => this.finishGapShopLeave());
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeGapShopModal());
        ['gap-buy-heal-half', 'gap-buy-heal-full', 'gap-buy-maxhp', 'gap-buy-boon', 'gap-buy-revive'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const kind = btn.getAttribute('data-kind');
            if (kind) btn.addEventListener('click', () => this.tryGapShopBuy(kind));
        });
    }
    
    openGapShopModal() {
        if (!this.currentRoom || this.currentRoom.type !== ROOM_TYPES.GAP_SHOP || this.currentRoom.cleared) return;
        const modal = document.getElementById('gap-shop-modal');
        if (!modal) return;
        this.paused = true;
        modal.classList.add('show');
        this.renderGapShopPanel();
    }
    
    closeGapShopModal() {
        const modal = document.getElementById('gap-shop-modal');
        if (modal) modal.classList.remove('show');
        if (this.currentRoom && this.currentRoom.type === ROOM_TYPES.GAP_SHOP && !this.currentRoom.cleared) {
            this.paused = false;
        }
    }
    
    finishGapShopLeave() {
        if (!this.currentRoom || this.currentRoom.type !== ROOM_TYPES.GAP_SHOP) return;
        this.currentRoom.cleared = true;
        const modal = document.getElementById('gap-shop-modal');
        if (modal) modal.classList.remove('show');
        this.paused = false;
        if (!this.demonInterferenceActive) {
            if (this.currentScene === SCENE_TYPES.TOWER && Math.random() < this.demonInterferenceTriggerChance) {
                this.startDemonInterference();
            } else {
                this.generatePortals();
            }
        }
        this.addFloatingText(this.player.x, this.player.y, '已离开隙间商店', '#ffd700');
    }
    
    gapShopPriceMult() {
        return Math.max(1, this.floor | 0);
    }
    
    tryGapShopBuy(kind) {
        if (!this.player || this.currentScene !== SCENE_TYPES.TOWER) return;
        const m = this.gapShopPriceMult();
        const costs = {
            healHalf: 8 * m,
            healFull: 22 * m,
            maxHp: 28 * m,
            boon: 40 * m,
            revive: 95 * m
        };
        const price = costs[kind];
        if (price == null) return;
        if (this.player.gold < price) {
            this.addFloatingText(this.player.x, this.player.y, '金币不足', '#ff6666');
            return;
        }
        this.player.gold -= price;
        if (kind === 'healHalf') {
            this.player.heal(Math.floor(this.player.maxHp * 0.5));
        } else if (kind === 'healFull') {
            this.player.hp = this.player.maxHp;
        } else if (kind === 'maxHp') {
            this.player.towerMaxHpBonusPercent = (this.player.towerMaxHpBonusPercent || 0) + 5;
            this.player.updateStats();
        } else if (kind === 'boon') {
            this.grantRandomEliteBoon();
        } else if (kind === 'revive') {
            this.player.towerReviveCharges = (this.player.towerReviveCharges || 0) + 1;
        }
        this.updateHUD();
        this.addFloatingText(this.player.x, this.player.y, '已购买', '#88ff88');
        this.renderGapShopPanel();
    }
    
    renderGapShopPanel() {
        const m = this.gapShopPriceMult();
        const setPrice = (id, n) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(n);
        };
        setPrice('gap-price-heal-half', 8 * m);
        setPrice('gap-price-heal-full', 22 * m);
        setPrice('gap-price-maxhp', 28 * m);
        setPrice('gap-price-boon', 40 * m);
        setPrice('gap-price-revive', 95 * m);
        const goldEl = document.getElementById('gap-shop-gold');
        if (goldEl && this.player) goldEl.textContent = this.player.gold;
        const list = document.getElementById('gap-shop-sell-list');
        if (!list || !this.player) return;
        const sellable = [];
        this.player.inventory.forEach((item, index) => {
            if (!item) return;
            if (this.player.equipment && Object.values(this.player.equipment).includes(item)) return;
            sellable.push({ item, index });
        });
        if (!sellable.length) {
            list.innerHTML = '<p style="color:#888;font-size:12px;">暂无可出售物品</p>';
            return;
        }
        list.innerHTML = '';
        sellable.forEach(({ item, index }) => {
            let sellPrice = 0;
            if (item.slot) {
                const statSum = item.stats ? Object.values(item.stats).reduce((a, b) => a + b, 0) : 0;
                const baseValue = (item.level || 1) * 20 + statSum * 2;
                const qm = (['common', 'rare', 'fine', 'epic', 'legendary'].indexOf(item.quality) + 1) || 1;
                sellPrice = Math.floor(baseValue * qm * 0.4);
            } else if (item.type === 'potion') {
                const buyPrice = item.buyPrice || item.price || 50;
                sellPrice = Math.floor(buyPrice * 0.5);
            } else {
                const buyPrice = item.buyPrice || item.price || 30;
                sellPrice = Math.floor(buyPrice * 0.5);
            }
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #444;font-size:12px;color:#ddd;';
            row.innerHTML = `<span>${item.name}</span><span>${sellPrice} 金 <button type="button" class="gap-sell-one" data-i="${index}" data-p="${sellPrice}">出售</button></span>`;
            list.appendChild(row);
        });
        list.querySelectorAll('.gap-sell-one').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.getAttribute('data-i'), 10);
                const p = parseInt(btn.getAttribute('data-p'), 10);
                this.sellItem(i, p);
                this.renderGapShopPanel();
            });
        });
    }
    
    /**
     * 生成传送门
     */
    generatePortals() {
        this.portals = [];
        const centerX = CONFIG.CANVAS_WIDTH / 2;
        const centerY = CONFIG.CANVAS_HEIGHT / 2;
        const distance = 250; // 传送门距离中心的距离
        
        const maxF = typeof window.getTowerMaxFloor === 'function' ? window.getTowerMaxFloor() : 240;
        const nextFloor = this.floor + 1;
        
        const isCombatRoom = this.currentRoom && (
            this.currentRoom.type === ROOM_TYPES.BATTLE ||
            this.currentRoom.type === ROOM_TYPES.ELITE ||
            this.currentRoom.type === ROOM_TYPES.BOSS
        );
        
        let nextPortals = [];
        
        if (isCombatRoom && this.currentRoom.type === ROOM_TYPES.BOSS && this.currentRoom.cleared && nextFloor > maxF) {
            // 通关最高层 Boss：不再生成向上传送门
        } else if (isCombatRoom && typeof window.isTowerGapShopFloor === 'function' && window.isTowerGapShopFloor(nextFloor)) {
            nextPortals.push(new Portal(centerX, centerY - distance, nextFloor, 'next', ROOM_TYPES.GAP_SHOP));
        } else if (isCombatRoom) {
            const portalCount = 2 + Math.floor(Math.random() * 2);
            const availableTypes = [ROOM_TYPES.BATTLE, ROOM_TYPES.TREASURE, ROOM_TYPES.REST, ROOM_TYPES.ALCHEMY, ROOM_TYPES.ELITE];
            const selectedTypes = [];
            const shuffledTypes = [...availableTypes].sort(() => Math.random() - 0.5);
            for (let i = 0; i < portalCount && i < shuffledTypes.length; i++) {
                selectedTypes.push(shuffledTypes[i]);
            }
            if (portalCount === 1) {
                nextPortals.push(new Portal(centerX, centerY - distance, nextFloor, 'next', selectedTypes[0]));
            } else if (portalCount === 2) {
                const offsetX = distance * 0.7;
                nextPortals.push(new Portal(centerX - offsetX, centerY - distance, nextFloor, 'next', selectedTypes[0]));
                nextPortals.push(new Portal(centerX + offsetX, centerY - distance, nextFloor, 'next', selectedTypes[1]));
            } else if (portalCount === 3) {
                const offsetX = distance * 0.7;
                nextPortals.push(new Portal(centerX - offsetX, centerY - distance, nextFloor, 'next', selectedTypes[0]));
                nextPortals.push(new Portal(centerX, centerY - distance, nextFloor, 'next', selectedTypes[1]));
                nextPortals.push(new Portal(centerX + offsetX, centerY - distance, nextFloor, 'next', selectedTypes[2]));
            }
        } else if (this.currentRoom && this.currentRoom.type === ROOM_TYPES.GAP_SHOP && this.currentRoom.cleared) {
            nextPortals.push(new Portal(centerX, centerY - distance, nextFloor, 'next', ROOM_TYPES.BOSS));
        } else {
            const roomType = (typeof window.isTowerGapShopFloor === 'function' && window.isTowerGapShopFloor(nextFloor))
                ? ROOM_TYPES.GAP_SHOP
                : ROOM_TYPES.BATTLE;
            nextPortals.push(new Portal(centerX, centerY - distance, nextFloor, 'next', roomType));
        }
        
        const skipDemonOverride = (typeof window.isTowerGapShopFloor === 'function' && window.isTowerGapShopFloor(nextFloor)) ||
            (this.currentRoom && this.currentRoom.type === ROOM_TYPES.GAP_SHOP && this.currentRoom.cleared);
        if (!skipDemonOverride && this.demonInterferenceFlags && this.demonInterferenceFlags.forceRoomTypes) {
            nextPortals = [];
            const types = this.demonInterferenceFlags.forceRoomTypes;
            if (types.length === 1) {
                nextPortals.push(new Portal(centerX, centerY - distance, nextFloor, 'next', types[0]));
            } else if (types.length === 2) {
                const offsetX = distance * 0.7;
                nextPortals.push(new Portal(centerX - offsetX, centerY - distance, nextFloor, 'next', types[0]));
                nextPortals.push(new Portal(centerX + offsetX, centerY - distance, nextFloor, 'next', types[1]));
            } else {
                const offsetX = distance * 0.7;
                nextPortals.push(new Portal(centerX - offsetX, centerY - distance, nextFloor, 'next', types[0]));
                nextPortals.push(new Portal(centerX, centerY - distance, nextFloor, 'next', types[1]));
                nextPortals.push(new Portal(centerX + offsetX, centerY - distance, nextFloor, 'next', types[2]));
            }
        }
        
        // 先添加下一层传送门
        nextPortals.forEach(portal => {
            this.portals.push(portal);
        });
        
        // 添加结束传送门（返回主城）- 效果b封印出口时不添加
        if (!(this.demonInterferenceFlags && this.demonInterferenceFlags.sealExit)) {
            this.portals.push(new Portal(centerX, centerY + distance, 0, 'exit'));
        }
        
        // 预加载所有portal贴图
        if (this.assetManager) {
            const portalTypes = ['next', 'fight', 'exit', 'return_town', 'exit_dungeon'];
            portalTypes.forEach(portalType => {
                const imageName = this.assetManager.getPortalImageName(portalType);
                if (imageName) {
                    this.assetManager.loadEntityImage(imageName).catch(err => {
                        console.warn('generatePortals: 加载传送门贴图失败:', err);
                    });
                }
            });
        }
    }

    /**
     * 绘制交互提示
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {Object} interaction - 交互对象信息
     */
    drawInteractionHint(ctx, interaction) {
        const x = interaction.x;
        const y = interaction.y;
        
        // 绘制提示背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x - 60, y - 15, 120, 30);
        
        // 绘制边框
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 60, y - 15, 120, 30);
        
        // 绘制文字
        ctx.fillStyle = '#fff';
        ctx.font = '16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('按E交互', x, y);
    }

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
    }
    
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
    }
    
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
    }
    
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
                    let jsonStr;
                    
                    // 尝试使用LZString解压，如果失败则使用base64解码
                    if (typeof LZString !== 'undefined') {
                        try {
                            jsonStr = LZString.decompressFromBase64(saveCode);
                            if (!jsonStr) {
                                // 如果解压失败，可能是旧格式的base64编码
                                throw new Error('LZString解压失败，尝试base64解码');
                            }
                        } catch (e) {
                            // 降级方案：使用base64解码
                            jsonStr = decodeURIComponent(atob(saveCode));
                        }
                    } else {
                        // 降级方案：使用base64解码
                        jsonStr = decodeURIComponent(atob(saveCode));
                    }
                    
                    const saveData = JSON.parse(jsonStr);
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
    }
    
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
    }
    
    /**
     * 导出存档
     */
    exportSave() {
        const saveData = {
            version: '1.0',
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
                equipment: {},
                inventory: [],
                maxEquipmentCapacity: this.player.maxEquipmentCapacity,
                maxAlchemyCapacity: this.player.maxAlchemyCapacity,
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
                fusionState: this.fusionState ? JSON.parse(JSON.stringify(this.fusionState)) : null,
                fusionCompletionBannerShown: !!this.fusionCompletionBannerShown
            }
        };
        
        // 保存装备（需要序列化）
        Object.keys(this.player.equipment).forEach(slot => {
            const eq = this.player.equipment[slot];
            if (eq) {
                saveData.player.equipment[slot] = this.serializeEquipment(eq);
            } else {
                saveData.player.equipment[slot] = null;
            }
        });
        
        // 保存背包（需要序列化）
        saveData.player.inventory = new Array(CONFIG.INVENTORY_SIZE).fill(null);
        this.player.inventory.forEach((item, index) => {
            if (item && index < CONFIG.INVENTORY_SIZE) {
                if (item.type === 'equipment') {
                    saveData.player.inventory[index] = this.serializeEquipment(item);
                } else if (item.type === 'consumable' || item.type === 'potion') {
                    saveData.player.inventory[index] = this.serializePotion(item);
                } else if (item.type === 'material' || item.type === 'alchemy') {
                    saveData.player.inventory[index] = this.serializeAlchemyMaterial(item);
                }
            }
        });
        
        // 将存档数据压缩并编码为字符串
        const jsonStr = JSON.stringify(saveData);
        let saveCode;
        
        // 如果LZString可用，使用压缩；否则使用base64编码
        if (typeof LZString !== 'undefined') {
            // 使用LZString压缩，然后转换为base64
            const compressed = LZString.compressToBase64(jsonStr);
            saveCode = compressed;
        } else {
            // 降级方案：使用base64编码
            saveCode = btoa(encodeURIComponent(jsonStr));
        }
        
        // 显示存档代码模态框
        this.showSaveCodeModal(saveCode);
        
        this.addFloatingText(this.player.x, this.player.y, '存档已导出', '#00ff00');
    }
    
    /**
     * 导入存档
     * @param {Object} saveData - 存档数据
     */
    importSave(saveData) {
        try {
            // 验证存档版本
            if (!saveData.version || !saveData.player || !saveData.game) {
                throw new Error('存档格式不正确');
            }
            
            // 恢复玩家基本属性
            this.player.x = saveData.player.x || CONFIG.CANVAS_WIDTH / 2;
            this.player.y = saveData.player.y || CONFIG.CANVAS_HEIGHT / 2;
            this.player.hp = saveData.player.hp || 100;
            this.player.maxHp = saveData.player.maxHp || 100;
            this.player.level = saveData.player.level || 1;
            this.player.exp = saveData.player.exp || 0;
            this.player.expNeeded = saveData.player.expNeeded || 50;
            this.player.gold = saveData.player.gold || 0;
            
            // 恢复背包容量
            this.player.maxEquipmentCapacity = saveData.player.maxEquipmentCapacity || 18;
            this.player.maxAlchemyCapacity = saveData.player.maxAlchemyCapacity || 30;
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
                                if (itemData.consumableType === 'dungeon_license') {
                                    this.player.inventory[index] = null;
                                } else {
                                    this.player.inventory[index] = this.deserializePotion(itemData);
                                }
                            } else if (itemData.type === 'alchemy' || itemData.type === 'material') {
                                if (itemData.materialType === 'crafting') {
                                    this.player.inventory[index] = null;
                                } else {
                                    this.player.inventory[index] = this.deserializeAlchemyMaterial(itemData);
                                }
                            }
                        } catch (error) {
                            console.error(`恢复背包物品失败 (索引 ${index}):`, error, itemData);
                        }
                    }
                });
            }
            
            // 恢复游戏状态
            this.currentScene = saveData.game.currentScene || SCENE_TYPES.TOWN;
            if (this.currentScene === 'dungeon') {
                this.currentScene = SCENE_TYPES.TOWN;
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
            
            this.fusionState = saveData.game.fusionState || null;
            this.fusionCompletionBannerShown = !!saveData.game.fusionCompletionBannerShown;
            
            // 清空掉落物和传送门
            this.droppedItems = [];
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
            this.updateInventoryUI();
            this.updateInventoryCapacity();
            this.updateFusionUI();
            
            if (this.fusionState && this.fusionState.phase === 'processing') {
                this.resumeFusionJobAfterImport();
            } else if (this.fusionState && this.fusionState.phase === 'ready') {
                this._onFusionReadyForUI();
            }
            
            // 更新房间信息显示
            if (this.currentScene === SCENE_TYPES.TOWN) {
                document.getElementById('room-type').textContent = '主城';
                document.getElementById('floor-number').textContent = `上次到达: ${this.lastDeathFloor}层`;
            }
            
            this.addFloatingText(this.player.x, this.player.y, '存档已导入', '#00ff00');
        } catch (error) {
            alert('导入存档失败：' + error.message);
            console.error('导入存档失败:', error);
        }
    }
    
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
            equipmentTraits: equipment.equipmentTraits,
            isCrafted: equipment.isCrafted || false,
            fusionSetIds: equipment.fusionSetIds || null,
            fusionPairKey: equipment.fusionPairKey || null
        };
    }
    
    /**
     * 反序列化装备
     * @param {Object} data - 装备数据
     * @returns {Equipment} 装备对象
     */
    deserializeEquipment(data) {
        const eq = new Equipment({
            id: data.id,
            name: data.name,
            slot: data.slot,
            weaponType: data.weaponType,
            quality: data.quality,
            level: data.level,
            enhanceLevel: data.enhanceLevel || 0,
            refineLevel: data.refineLevel || 0,
            stats: data.baseStats || data.stats || {},
            isCrafted: data.isCrafted || false,
            fusionSetIds: data.fusionSetIds || null,
            fusionPairKey: data.fusionPairKey || null
        });
        
        // 如果存档中有装备词条，恢复它；若缺少 id（旧存档），则按名称重新生成 id，确保恢复生命值等词条能生效
        if (data.equipmentTraits) {
            eq.equipmentTraits = data.equipmentTraits;
            if (!eq.equipmentTraits.id && typeof eq.generateEquipmentTraits === 'function') {
                const generated = eq.generateEquipmentTraits();
                if (generated && generated.id) eq.equipmentTraits.id = generated.id;
            }
        }
        
        // 恢复isCrafted属性
        if (data.isCrafted) {
            eq.isCrafted = true;
        }
        
        return eq;
    }
    
    /**
     * 序列化药水
     * @param {Potion} potion - 药水对象
     * @returns {Object} 序列化后的药水数据
     */
    serializePotion(potion) {
        const result = {
            id: potion.id,
            name: potion.name,
            type: potion.type || 'potion', // 保持原始类型
            quality: potion.quality,
            description: potion.description,
            price: potion.price
        };
        
        // 如果是药水类型，添加药水特有属性
        if (potion.type === 'potion' || potion.effects) {
            result.effects = potion.effects;
            result.duration = potion.duration;
            result.isCrafted = potion.isCrafted || false;
        }
        
        // 如果是消耗品类型，添加消耗品特有属性
        if (potion.type === 'consumable') {
            result.consumableType = potion.consumableType;
            // 添加配方ID（如果是配方类型）
            if (potion.recipeId !== undefined) {
                result.recipeId = potion.recipeId;
            }
        }
        
        return result;
    }
    
    /**
     * 反序列化药水/消耗品
     * @param {Object} data - 药水/消耗品数据
     * @returns {Potion|Consumable} 药水或消耗品对象
     */
    deserializePotion(data) {
        // 如果是consumable类型，创建Consumable实例
        if (data.type === 'consumable') {
            const consumableData = {
                id: data.id,
                name: data.name,
                consumableType: data.consumableType || 'potion',
                quality: data.quality || 'common',
                description: data.description || '',
                price: data.price || 50
            };
            
            // 如果是配方，添加配方相关属性
            if (data.recipeId !== undefined) {
                consumableData.recipeId = data.recipeId;
            }
            
            return new Consumable(consumableData);
        }
        
        // 否则创建Potion实例
        return new Potion({
            id: data.id,
            name: data.name,
            quality: data.quality || 'common',
            description: data.description || '',
            effects: data.effects || {},
            duration: data.duration || 30000,
            price: data.price || 50,
            isCrafted: data.isCrafted || false
        });
    }
    
    /**
     * 序列化炼金材料
     * @param {AlchemyMaterial} material - 炼金材料对象
     * @returns {Object} 序列化后的材料数据
     */
    serializeAlchemyMaterial(material) {
        return {
            id: material.id,
            name: material.name,
            type: 'alchemy',
            quality: material.quality,
            description: material.description,
            alchemyTraits: material.alchemyTraits,
            traitRetentionRate: material.traitRetentionRate
        };
    }
    
    /**
     * 反序列化炼金材料
     * @param {Object} data - 材料数据
     * @returns {AlchemyMaterial} 炼金材料对象
     */
    deserializeAlchemyMaterial(data) {
        return new AlchemyMaterial({
            id: data.id,
            name: data.name,
            quality: data.quality || 'common',
            description: data.description || '',
            alchemyTraits: data.alchemyTraits || {},
            traitRetentionRate: data.traitRetentionRate || 0.5
        });
    }

    /**
     * 固定时间步长的逻辑更新（TPS）
     */
    fixedUpdate() {
        try {
            const tickStartTime = performance.now();
            
            if (!this.paused) {
                this.update();
            }
            
            // 计算本次tick耗时
            const tickDuration = performance.now() - tickStartTime;
            this.tickTimes.push(tickDuration);
            
            // 只保留最近60次tick的时间（约1秒的数据）
            if (this.tickTimes.length > 60) {
                this.tickTimes.shift();
            }
            
            // 计算平均mspt
            if (this.tickTimes.length > 0) {
                const sum = this.tickTimes.reduce((a, b) => a + b, 0);
                this.mspt = sum / this.tickTimes.length;
            }
        } catch (error) {
            console.error('fixedUpdate 出错:', error, error.stack);
        }
    }
    
    /**
     * 渲染循环（无上限fps）
     */
    renderLoop() {
        try {
            const now = performance.now();
            const deltaTime = now - this.lastRenderTime;
            this.lastRenderTime = now;
            this.frameCount++;
            this.fpsUpdateInterval += deltaTime;
            
            // 更新渲染FPS显示
            if (this.fpsUpdateInterval >= 1000) {
                this.fps = Math.round((this.frameCount * 1000) / this.fpsUpdateInterval);
                this.frameCount = 0;
                this.fpsUpdateInterval = 0;
            }
            
            // 渲染
            this.draw();
            this.updateDevInfo();
            
            // 继续下一帧渲染
            requestAnimationFrame(() => this.renderLoop());
        } catch (error) {
            console.error('renderLoop 出错:', error, error.stack);
            // 即使出错也继续渲染循环
            requestAnimationFrame(() => this.renderLoop());
        }
    }
    
    /**
     * 固定时间步长的逻辑更新循环（TPS）
     */
    logicLoop() {
        try {
            const now = performance.now();
            let deltaTime = now - this.lastUpdateTime;
            this.lastUpdateTime = now;
            
            // 防止时间跳跃过大（例如标签页切换回来）
            if (deltaTime > 1000) {
                deltaTime = this.fixedTimeStep;
            }
            
            // 累积时间
            this.accumulator += deltaTime;
            
            // 执行固定时间步长的更新（最多执行5次，防止卡顿时的追赶）
            let updateCount = 0;
            const maxUpdates = 5;
            while (this.accumulator >= this.fixedTimeStep && updateCount < maxUpdates) {
                this.fixedUpdate();
                this.tpsCount++;
                this.accumulator -= this.fixedTimeStep;
                updateCount++;
            }
            
            // 更新TPS统计
            this.tpsUpdateInterval += deltaTime;
            if (this.tpsUpdateInterval >= 1000) {
                this.tps = this.tpsCount;
                this.tpsCount = 0;
                this.tpsUpdateInterval = 0;
            }
            
            // 如果累积时间过多，直接清空（防止卡顿时的追赶）
            if (this.accumulator > this.fixedTimeStep * maxUpdates) {
                this.accumulator = 0;
            }
            
            // 使用setTimeout确保固定TPS的逻辑更新
            setTimeout(() => this.logicLoop(), this.fixedTimeStep);
        } catch (error) {
            console.error('logicLoop 出错:', error, error.stack);
            // 即使出错也继续逻辑循环
            setTimeout(() => this.logicLoop(), this.fixedTimeStep);
        }
    }
    
    /**
     * 启动游戏循环（分离逻辑和渲染）
     */
    startGameLoop() {
        this.lastUpdateTime = performance.now();
        this.lastRenderTime = performance.now();
        this.accumulator = 0;
        
        // 启动固定时间步长的逻辑更新循环（60fps）
        this.logicLoop();
        
        // 启动渲染循环（无上限fps）
        this.renderLoop();
    }
    
    /**
     * 旧的游戏循环（已废弃，保留用于兼容）
     */
    gameLoop() {
        // 使用新的分离系统
        this.startGameLoop();
    }

    // 开发者模式方法
    // ====================================================================
    // 开发者模式方法组
    // ====================================================================

    /**
     * 切换开发者模式
     */
    toggleDevMode() {
        this.devMode = !this.devMode;
        const codexModal = document.getElementById('codex-modal');
        const isCodexOpen = codexModal && codexModal.classList.contains('show');
        
        const normalPanel = document.getElementById('dev-panel');
        const codexPanel = document.getElementById('dev-codex-panel');
        
        if (this.devMode) {
            this.paused = true; // 暂停游戏
            
            if (isCodexOpen) {
                // 图鉴打开时，显示图鉴开发者面板
                normalPanel.classList.remove('show');
                codexPanel.classList.add('show');
                this.updateDevCodexPanel();
            } else {
                // 图鉴未打开时，显示普通开发者面板
                normalPanel.classList.add('show');
                codexPanel.classList.remove('show');
            }
        } else {
            normalPanel.classList.remove('show');
            codexPanel.classList.remove('show');
            // 如果背包界面和图鉴也没有打开，才恢复游戏
            const inventoryModal = document.getElementById('inventory-modal');
            if (!inventoryModal.classList.contains('show') && !codexModal.classList.contains('show')) {
                this.paused = false; // 恢复游戏
            }
        }
    }
    
    /**
     * 显示图鉴开发者面板的指定标签页
     * @param {string} tab - 标签页名称 ('equipments', 'materials', 'potions')
     */
    showDevCodexTab(tab) {
        // 更新标签按钮状态
        document.querySelectorAll('.dev-codex-tab').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
            }
        });
        
        // 更新内容
        this.updateDevCodexPanel(tab);
    }
    
    /**
     * 更新图鉴开发者面板内容
     * @param {string} activeTab - 当前激活的标签页
     */
    updateDevCodexPanel(activeTab = 'equipments') {
        const content = document.getElementById('dev-codex-content');
        content.innerHTML = '';
        
        if (activeTab === 'equipments') {
            this.updateDevCodexEquipments(content);
        } else if (activeTab === 'materials') {
            this.updateDevCodexMaterials(content);
        } else if (activeTab === 'potions') {
            this.updateDevCodexPotions(content);
        } else if (activeTab === 'recipes') {
            this.updateDevCodexRecipes(content);
        }
    }
    
    /**
     * 更新图鉴开发者面板的装备列表
     * @param {HTMLElement} container - 容器元素
     */
    updateDevCodexEquipments(container) {
        const allEquipments = generateEquipments();
        
        // 按品质分组
        const qualityGroups = {
            common: [],
            rare: [],
            fine: [],
            epic: [],
            legendary: []
        };
        
        allEquipments.forEach(eq => {
            qualityGroups[eq.quality].push(eq);
        });
        
        const qualityNames = {
            common: '普通',
            rare: '稀有',
            fine: '精良',
            epic: '史诗',
            legendary: '传说'
        };
        
        const qualityColors = {
            common: '#ffffff',
            rare: '#1eff00',
            fine: '#0070dd',
            epic: '#a335ee',
            legendary: '#ff8000'
        };
        
        Object.keys(qualityGroups).forEach(quality => {
            if (qualityGroups[quality].length === 0) return;
            
            const qualitySection = document.createElement('div');
            qualitySection.style.marginBottom = '20px';
            qualitySection.innerHTML = `<h4 style="color: ${qualityColors[quality]}; margin-bottom: 10px; font-size: 14px;">${qualityNames[quality]} (${qualityGroups[quality].length}件)</h4>`;
            
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            grid.style.gap = '10px';
            
            qualityGroups[quality].forEach(eq => {
                const itemDiv = document.createElement('div');
                itemDiv.style.padding = '8px';
                itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
                itemDiv.style.border = `1px solid ${qualityColors[quality]}`;
                itemDiv.style.borderRadius = '5px';
                itemDiv.style.cursor = 'pointer';
                itemDiv.style.transition = 'background 0.2s';
                
                itemDiv.onmouseover = () => {
                    itemDiv.style.background = 'rgba(60, 60, 70, 0.9)';
                };
                itemDiv.onmouseout = () => {
                    itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
                };
                
                itemDiv.onclick = () => {
                    this.devAddSpecificEquipment(eq);
                };
                
                const nameDiv = document.createElement('div');
                nameDiv.style.color = qualityColors[quality];
                nameDiv.style.fontWeight = 'bold';
                nameDiv.style.marginBottom = '5px';
                nameDiv.textContent = eq.name;
                
                const infoDiv = document.createElement('div');
                infoDiv.style.color = '#aaa';
                infoDiv.style.fontSize = '11px';
                infoDiv.innerHTML = `
                    <div>部位: ${SLOT_NAMES[eq.slot]}</div>
                    <div>等级: ${eq.level}</div>
                `;
                
                itemDiv.appendChild(nameDiv);
                itemDiv.appendChild(infoDiv);
                grid.appendChild(itemDiv);
            });
            
            qualitySection.appendChild(grid);
            container.appendChild(qualitySection);
        });
    }
    
    /**
     * 更新图鉴开发者面板的炼金材料列表
     * @param {HTMLElement} container - 容器元素
     */
    updateDevCodexMaterials(container) {
        container.innerHTML = '<p style="color: #aaa; padding: 20px;">炼金系统已移除</p>';
        return;
        const allMaterials = generateAlchemyMaterials();
        
        // 按品质分组
        const qualityGroups = {
            common: [],
            rare: [],
            fine: [],
            epic: [],
            legendary: []
        };
        
        allMaterials.forEach(m => {
            qualityGroups[m.quality].push(m);
        });
        
        const qualityNames = {
            common: '普通',
            rare: '稀有',
            fine: '精良',
            epic: '史诗',
            legendary: '传说'
        };
        
        const qualityColors = {
            common: '#ffffff',
            rare: '#1eff00',
            fine: '#0070dd',
            epic: '#a335ee',
            legendary: '#ff8000'
        };
        
        Object.keys(qualityGroups).forEach(quality => {
            if (qualityGroups[quality].length === 0) return;
            
            const qualitySection = document.createElement('div');
            qualitySection.style.marginBottom = '20px';
            qualitySection.innerHTML = `<h4 style="color: ${qualityColors[quality]}; margin-bottom: 10px; font-size: 14px;">${qualityNames[quality]} (${qualityGroups[quality].length}种)</h4>`;
            
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            grid.style.gap = '10px';
            
            qualityGroups[quality].forEach(m => {
                const itemDiv = document.createElement('div');
                itemDiv.style.padding = '8px';
                itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
                itemDiv.style.border = `1px solid ${qualityColors[quality]}`;
                itemDiv.style.borderRadius = '5px';
                itemDiv.style.cursor = 'pointer';
                itemDiv.style.transition = 'background 0.2s';
                
                itemDiv.onmouseover = () => {
                    itemDiv.style.background = 'rgba(60, 60, 70, 0.9)';
                };
                itemDiv.onmouseout = () => {
                    itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
                };
                
                itemDiv.onclick = () => {
                    this.devAddSpecificMaterial(m);
                };
                
                const nameDiv = document.createElement('div');
                nameDiv.style.color = qualityColors[quality];
                nameDiv.style.fontWeight = 'bold';
                nameDiv.style.marginBottom = '5px';
                nameDiv.textContent = m.name;
                
                const infoDiv = document.createElement('div');
                infoDiv.style.color = '#aaa';
                infoDiv.style.fontSize = '11px';
                const traitText = Object.keys(m.alchemyTraits).map(key => {
                    const value = m.alchemyTraits[key];
                    const traitNames = {
                        attack: '攻击',
                        defense: '防御',
                        health: '生命',
                        critRate: '暴击率',
                        critDamage: '暴击伤害',
                        dodge: '闪避',
                        attackSpeed: '攻击速度',
                        moveSpeed: '移动速度'
                    };
                    return `${traitNames[key] || key}+${value}`;
                }).join(', ');
                infoDiv.innerHTML = `<div>词条: ${traitText || '无'}</div>`;
                
                itemDiv.appendChild(nameDiv);
                itemDiv.appendChild(infoDiv);
                grid.appendChild(itemDiv);
            });
            
            qualitySection.appendChild(grid);
            container.appendChild(qualitySection);
        });
    }
    
    /**
     * 更新图鉴开发者面板的药水列表
     * @param {HTMLElement} container - 容器元素
     */
    updateDevCodexPotions(container) {
        const allPotions = generatePotions();
        
        // 按品质分组
        const qualityGroups = {
            common: [],
            rare: [],
            fine: [],
            epic: [],
            legendary: []
        };
        
        allPotions.forEach(p => {
            qualityGroups[p.quality].push(p);
        });
        
        const qualityNames = {
            common: '普通',
            rare: '稀有',
            fine: '精良',
            epic: '史诗',
            legendary: '传说'
        };
        
        const qualityColors = {
            common: '#ffffff',
            rare: '#1eff00',
            fine: '#0070dd',
            epic: '#a335ee',
            legendary: '#ff8000'
        };
        
        Object.keys(qualityGroups).forEach(quality => {
            if (qualityGroups[quality].length === 0) return;
            
            const qualitySection = document.createElement('div');
            qualitySection.style.marginBottom = '20px';
            qualitySection.innerHTML = `<h4 style="color: ${qualityColors[quality]}; margin-bottom: 10px; font-size: 14px;">${qualityNames[quality]} (${qualityGroups[quality].length}种)</h4>`;
            
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
            grid.style.gap = '10px';
            
            qualityGroups[quality].forEach(p => {
                const itemDiv = document.createElement('div');
                itemDiv.style.padding = '8px';
                itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
                itemDiv.style.border = `1px solid ${qualityColors[quality]}`;
                itemDiv.style.borderRadius = '5px';
                itemDiv.style.cursor = 'pointer';
                itemDiv.style.transition = 'background 0.2s';
                
                itemDiv.onmouseover = () => {
                    itemDiv.style.background = 'rgba(60, 60, 70, 0.9)';
                };
                itemDiv.onmouseout = () => {
                    itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
                };
                
                itemDiv.onclick = () => {
                    this.devAddSpecificPotion(p);
                };
                
                const nameDiv = document.createElement('div');
                nameDiv.style.color = qualityColors[quality];
                nameDiv.style.fontWeight = 'bold';
                nameDiv.style.marginBottom = '5px';
                nameDiv.textContent = p.name;
                
                const infoDiv = document.createElement('div');
                infoDiv.style.color = '#aaa';
                infoDiv.style.fontSize = '11px';
                const effectText = Object.keys(p.effects).map(key => {
                    const value = p.effects[key];
                    const effectNames = {
                        attack: '攻击',
                        defense: '防御',
                        health: '生命',
                        critRate: '暴击率',
                        critDamage: '暴击伤害',
                        dodge: '闪避',
                        attackSpeed: '攻击速度',
                        moveSpeed: '移动速度'
                    };
                    return `${effectNames[key] || key}+${value}`;
                }).join(', ');
                const durationText = p.duration > 0 ? `持续${p.duration / 1000}秒` : '立即生效';
                infoDiv.innerHTML = `<div>效果: ${effectText || '无'}</div><div>${durationText}</div>`;
                
                itemDiv.appendChild(nameDiv);
                itemDiv.appendChild(infoDiv);
                grid.appendChild(itemDiv);
            });
            
            qualitySection.appendChild(grid);
            container.appendChild(qualitySection);
        });
    }
    
    /**
     * 开发者功能：添加指定装备
     * @param {Equipment} equipment - 装备对象
     */
    devAddSpecificEquipment(equipment) {
        const newEq = new Equipment({
            id: equipment.id,
            name: equipment.name,
            slot: equipment.slot,
            weaponType: equipment.weaponType,
            quality: equipment.quality,
            level: equipment.level,
            stats: JSON.parse(JSON.stringify(equipment.stats)),
            refineLevel: 0
        });
        this.addItemToInventory(newEq);
        this.addFloatingText(this.player.x, this.player.y, `获得: ${equipment.name} (DEV)`, QUALITY_COLORS[equipment.quality] || '#ffffff');
    }
    
    /**
     * 开发者功能：添加指定打造装备
     * @param {Object} recipe - 图纸数据
     */
    devAddSpecificCraftedEquipment(recipe) {
        // 根据部位设置属性
        const stats = {};
        if (recipe.resultEquipment.slot === 'weapon') {
            stats.attack = recipe.resultEquipment.attack || 0;
            stats.critRate = recipe.resultEquipment.critRate || 0;
            stats.critDamage = recipe.resultEquipment.critDamage || 0;
        } else if (['helmet', 'chest', 'legs', 'boots'].includes(recipe.resultEquipment.slot)) {
            stats.health = recipe.resultEquipment.health || 0;
            stats.defense = recipe.resultEquipment.defense || 0;
        } else if (['necklace', 'ring', 'belt'].includes(recipe.resultEquipment.slot)) {
            stats.dodge = recipe.resultEquipment.dodge || 0;
            stats.attackSpeed = recipe.resultEquipment.attackSpeed || 0;
            stats.moveSpeed = recipe.resultEquipment.moveSpeed || 0;
        }
        
        const weaponType = recipe.resultEquipment.weaponType || ((window.EQUIPMENT_DEFINITIONS || []).find(d => d.name === recipe.resultEquipment.name) || {}).weaponType;
        const newEquipment = new Equipment({
            id: Date.now(),
            slot: recipe.resultEquipment.slot,
            name: recipe.resultEquipment.name,
            weaponType: weaponType,
            level: recipe.resultEquipment.level,
            quality: recipe.resultEquipment.quality,
            stats: stats,
            isCrafted: true
        });
        this.addItemToInventory(newEquipment);
        this.addFloatingText(this.player.x, this.player.y, `获得: ${recipe.resultEquipment.name} (DEV)`, QUALITY_COLORS[recipe.resultEquipment.quality] || '#ffffff');
    }
    
    /**
     * 开发者功能：添加指定炼金材料
     * @param {AlchemyMaterial} material - 炼金材料对象
     */
    devAddSpecificMaterial() {
        // 炼金系统已移除
    }
    
    /**
     * 开发者功能：添加指定药水
     * @param {Potion} potion - 药水对象
     */
    devAddSpecificPotion(potion) {
        // 创建新的药水实例
        const newPotion = new Potion({
            id: potion.id,
            name: potion.name,
            quality: potion.quality,
            description: potion.description,
            effects: JSON.parse(JSON.stringify(potion.effects)),
            duration: potion.duration
        });
        this.addItemToInventory(newPotion);
        this.addFloatingText(this.player.x, this.player.y, `获得: ${potion.name} (DEV)`, QUALITY_COLORS[potion.quality] || '#ffffff');
    }
    
    /**
     * 更新图鉴开发者面板的图纸列表
     * @param {HTMLElement} container - 容器元素
     */
    updateDevCodexRecipes(container) {
        if (typeof CRAFTING_RECIPE_DEFINITIONS === 'undefined' || !CRAFTING_RECIPE_DEFINITIONS.length) {
            container.innerHTML = '<p style="color: #aaa; text-align: center; padding: 20px;">暂无图纸数据</p>';
            return;
        }
        
        const qualityColors = {
            common: '#ffffff',
            rare: '#1eff00',
            fine: '#0070dd',
            epic: '#a335ee',
            legendary: '#ff8000'
        };
        
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
        grid.style.gap = '10px';
        
        CRAFTING_RECIPE_DEFINITIONS.forEach(recipe => {
            const quality = recipe.resultEquipment.quality;
            const itemDiv = document.createElement('div');
            itemDiv.style.padding = '8px';
            itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
            itemDiv.style.border = `1px solid ${qualityColors[quality]}`;
            itemDiv.style.borderRadius = '5px';
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.transition = 'background 0.2s';
            
            itemDiv.onmouseover = () => {
                itemDiv.style.background = 'rgba(60, 60, 70, 0.9)';
            };
            itemDiv.onmouseout = () => {
                itemDiv.style.background = 'rgba(40, 40, 50, 0.8)';
            };
            
            itemDiv.onclick = () => {
                this.devAddSpecificRecipe(recipe);
            };
            
            // 双击添加打造装备
            let clickTimer = null;
            itemDiv.ondblclick = (e) => {
                e.preventDefault();
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                }
                this.devAddSpecificCraftedEquipment(recipe);
            };
            
            const nameDiv = document.createElement('div');
            nameDiv.style.color = qualityColors[quality];
            nameDiv.style.fontWeight = 'bold';
            nameDiv.style.marginBottom = '5px';
            nameDiv.textContent = recipe.name;
            
            const infoDiv = document.createElement('div');
            infoDiv.style.color = '#aaa';
            infoDiv.style.fontSize = '11px';
            infoDiv.innerHTML = `<div>结果: ${recipe.resultEquipment.name}</div><div>价格: ${recipe.price} 金币</div><div style="color: #ffaa00; margin-top: 3px; font-size: 10px;">单击: 添加图纸 | 双击: 添加装备</div>`;
            
            itemDiv.appendChild(nameDiv);
            itemDiv.appendChild(infoDiv);
            grid.appendChild(itemDiv);
        });
        
        container.appendChild(grid);
    }
    
    /**
     * 开发者功能：添加指定图纸
     * @param {Object} recipe - 图纸数据
     */
    devAddSpecificRecipe(recipe) {
        const recipeConsumable = new Consumable({
            id: Date.now(),
            name: recipe.name,
            consumableType: 'recipe',
            recipeId: recipe.id,
            quality: recipe.resultEquipment.quality,
            description: recipe.description,
            price: recipe.price
        });
        this.addItemToInventory(recipeConsumable);
        this.addFloatingText(this.player.x, this.player.y, `获得: ${recipe.name} (DEV)`, QUALITY_COLORS[recipe.resultEquipment.quality] || '#ffffff');
    }
    
    /**
     * 开发者功能：添加所有打造装备
     */
    devAddAllCraftedEquipments() {
        if (typeof CRAFTING_RECIPE_DEFINITIONS === 'undefined' || !CRAFTING_RECIPE_DEFINITIONS.length) {
            this.addFloatingText(this.player.x, this.player.y, '没有找到打造装备数据 (DEV)', '#ff0000');
            return;
        }
        
        CRAFTING_RECIPE_DEFINITIONS.forEach(recipe => {
            this.devAddSpecificCraftedEquipment(recipe);
        });
        
        this.addFloatingText(this.player.x, this.player.y, `已添加所有打造装备 (${CRAFTING_RECIPE_DEFINITIONS.length}件)`, '#ffaa00');
    }
    


    updateDevInfo() {
        // 更新右下角统计信息
        const fpsValueEl = document.getElementById('fps-value');
        if (fpsValueEl) {
            fpsValueEl.textContent = this.fps;
        }
        const tpsValueEl = document.getElementById('tps-value');
        if (tpsValueEl) {
            tpsValueEl.textContent = this.tps;
        }
        const msptValueEl = document.getElementById('mspt-value');
        if (msptValueEl) {
            msptValueEl.textContent = this.mspt.toFixed(2);
        }
        
        if (this.devMode) {
            const equipmentCount = this.player.inventory.slice(0, 18).filter(item => item !== null).length;
            const materialCount = this.player.inventory.slice(18, 48).filter(item => item !== null).length;
            const consumableCount = this.player.inventory.slice(48).filter(item => item !== null).length;
            document.getElementById('dev-inventory-count').textContent = 
                `${equipmentCount}/${materialCount}/${consumableCount} (装备/材料/消耗品)`;
            document.getElementById('dev-floor').textContent = this.floor;
            const roomTypeNames = {
                battle: '战斗',
                treasure: '宝箱',
                rest: '休整',
                alchemy: '炼金',
                elite: '精英',
                gap_shop: '隙间商店',
                boss: 'Boss'
            };
            const roomTypeEl = document.getElementById('dev-room-type');
            if (roomTypeEl) {
                roomTypeEl.textContent = this.currentRoom ? roomTypeNames[this.currentRoom.type] || '-' : '-';
            }
            const combatPowerEl = document.getElementById('dev-combat-power');
            if (combatPowerEl) {
                combatPowerEl.textContent = this.player.calculateCombatPower();
            }
            const devFpsEl = document.getElementById('dev-fps');
            if (devFpsEl) {
                devFpsEl.textContent = this.fps;
            }
            const devTpsEl = document.getElementById('dev-tps');
            if (devTpsEl) {
                devTpsEl.textContent = this.tps;
            }
            const devMsptEl = document.getElementById('dev-mspt');
            if (devMsptEl) {
                devMsptEl.textContent = this.mspt.toFixed(2);
            }
        }
    }

    // 开发者功能：添加经验
    devAddExp(amount) {
        this.gainExp(amount);
        this.addFloatingText(this.player.x, this.player.y, `+${amount} 经验 (DEV)`, '#00ff00');
    }

    // 开发者功能：添加金币
    devAddGold(amount) {
        this.gainGold(amount);
        this.addFloatingText(this.player.x, this.player.y, `+${amount} 金币 (DEV)`, '#ffd700');
    }

    // 开发者功能：恢复满血
    devHealPlayer() {
        const healAmount = this.player.maxHp - this.player.hp;
        this.player.heal(healAmount);
        this.updateHUD();
        this.addFloatingText(this.player.x, this.player.y, `恢复满血 (DEV)`, '#00ff00');
    }

    /**
     * 与正常升级链一致：升到 level 时所需「下一级」经验条上限
     */
    computePlayerExpNeededForLevel(level) {
        let e = 50;
        const Lv = Math.max(1, Math.floor(Number(level)) || 1);
        for (let L = 2; L <= Lv; L++) {
            e = Math.floor(e * 1.3);
        }
        return e;
    }

    /**
     * 开发者：将玩家设为指定等级（1～999），并重算经验条、属性与满血
     */
    devSetPlayerLevel(targetLevel) {
        const t = Math.min(999, Math.max(1, Math.floor(Number(targetLevel)) || 1));
        const was = this.player.level;
        if (t === was) {
            this.addFloatingText(this.player.x, this.player.y, `当前已是 ${t} 级`, '#888888');
            this.updateHUD();
            return;
        }
        this.player.level = t;
        this.player.expNeeded = this.computePlayerExpNeededForLevel(t);
        this.player.exp = 0;
        this.player.updateStats();
        this.player.hp = this.player.maxHp;
        this.updateHUD();
        this.addFloatingText(this.player.x, this.player.y, `等级 ${was} → ${t} (DEV)`, '#00aaff');
    }

    /** 从开发者面板输入框读取目标等级 */
    devSetPlayerLevelFromInput() {
        const inp = document.getElementById('dev-target-level');
        const raw = inp && inp.value;
        const n = parseInt(String(raw).trim(), 10);
        if (!Number.isFinite(n) || n < 1) {
            this.addFloatingText(this.player.x, this.player.y, '请输入有效等级（≥1）', '#ff6666');
            return;
        }
        this.devSetPlayerLevel(n);
    }

    // 开发者功能：添加随机装备
    devAddRandomEquipment(quality) {
        const allEquipments = generateEquipments();
        const qualityEquipments = allEquipments.filter(eq => eq.quality === quality);
        if (qualityEquipments.length > 0) {
            const randomEq = qualityEquipments[Math.floor(Math.random() * qualityEquipments.length)];
            // 创建新装备实例（避免引用问题），确保等级属性正确传递
            const newEq = new Equipment({
                id: randomEq.id,
                name: randomEq.name,
                slot: randomEq.slot,
                weaponType: randomEq.weaponType,
                quality: randomEq.quality,
                level: randomEq.level,
                stats: JSON.parse(JSON.stringify(randomEq.stats)),
                refineLevel: 0
            });
            this.addItemToInventory(newEq);
        }
    }

    // 开发者功能：清空当前房间
    devClearRoom() {
        if (this.currentRoom && (this.currentRoom.type === ROOM_TYPES.BATTLE || this.currentRoom.type === ROOM_TYPES.ELITE || this.currentRoom.type === ROOM_TYPES.BOSS)) {
            this.currentRoom.monsters.forEach(monster => {
                monster.hp = 0;
            });
            this.currentRoom.cleared = true;
            this.addFloatingText(this.player.x, this.player.y, '房间已清空 (DEV)', '#ff0000');
        }
    }

    // 开发者功能：下一层
    devNextFloor() {
        const maxF = typeof window.getTowerMaxFloor === 'function' ? window.getTowerMaxFloor() : 240;
        this.floor = Math.min(this.floor + 1, maxF);
        this.hasClearedFloor = true; // 标记已通关至少一层
        this.generateNewRoom();
        this.isTransitioning = false;
        if (this.roomTransitionTimer) {
            clearTimeout(this.roomTransitionTimer);
            this.roomTransitionTimer = null;
        }
        this.addFloatingText(this.player.x, this.player.y, `跳到第 ${this.floor} 层 (DEV)`, '#ff00ff');
    }

    // 开发者功能：生成指定类型房间
    devGenerateRoom(type) {
        type = type && String(type).toLowerCase();
        this.currentRoom = new Room(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT, type, this.floor, this);
        this.currentRoom.generateRoom(this.player.level);
        const typeNames = {
            battle: '战斗',
            treasure: '宝箱',
            rest: '休整',
            alchemy: '炼金',
            elite: '精英',
            gap_shop: '隙间商店',
            boss: 'Boss'
        };
        const typeLabel = (typeNames[type] != null ? typeNames[type] : type) || '未知';
        const roomTypeEl = document.getElementById('room-type');
        if (roomTypeEl) roomTypeEl.textContent = typeLabel;
        const floorEl = document.getElementById('floor-number');
        if (floorEl) floorEl.textContent = this.floor;
        this.addFloatingText(this.player.x, this.player.y, '生成' + typeLabel + '房间 (DEV)', '#ff00ff');
    }

    // 开发者功能：添加随机炼金材料
    devAddRandomAlchemyMaterial() {
        // 炼金系统已移除
    }

    // 开发者功能：添加随机药水
    devAddRandomPotion(quality) {
        const allPotions = generatePotions();
        const qualityPotions = allPotions.filter(p => p.quality === quality);
        if (qualityPotions.length > 0) {
            const randomPotion = qualityPotions[Math.floor(Math.random() * qualityPotions.length)];
            this.addItemToInventory(randomPotion);
        }
    }
    
    // 开发者功能：添加随机图纸
    devAddRandomRecipe() {
        if (typeof CRAFTING_RECIPE_DEFINITIONS === 'undefined' || !CRAFTING_RECIPE_DEFINITIONS.length) {
            return;
        }
        const randomRecipe = CRAFTING_RECIPE_DEFINITIONS[Math.floor(Math.random() * CRAFTING_RECIPE_DEFINITIONS.length)];
        this.devAddSpecificRecipe(randomRecipe);
    }
    
    // 开发者功能：清空背包
    devClearInventory() {
        this.player.inventory.fill(null);
        this.updateInventoryUI();
        this.addFloatingText(this.player.x, this.player.y, '背包已清空 (DEV)', '#ff0000');
    }
    
    // 开发者功能：设置战力（通过添加装备）
    devSetCombatPower(targetPower) {
        // 简单实现：添加一些高级装备来提升战力
        const currentPower = this.player.calculateCombatPower();
        if (currentPower >= targetPower) {
            this.addFloatingText(this.player.x, this.player.y, `当前战力已超过目标 (DEV)`, '#ffaa00');
            return;
        }
        
        // 添加一些传说装备来快速提升战力
        const legendaryEquipments = generateEquipments().filter(eq => eq.quality === 'legendary');
        if (legendaryEquipments.length > 0) {
            // 添加8个不同部位的传说装备
            const slots = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'necklace', 'ring', 'belt'];
            slots.forEach(slot => {
                const slotEquipments = legendaryEquipments.filter(eq => eq.slot === slot);
                if (slotEquipments.length > 0) {
                    const randomEq = slotEquipments[Math.floor(Math.random() * slotEquipments.length)];
                    this.devAddRandomEquipment('legendary');
                }
            });
            this.addFloatingText(this.player.x, this.player.y, `已添加传说装备提升战力 (DEV)`, '#ff8000');
        }
    }
    
    // ====================================================================
    // 图片处理方法组（已移至 AssetManager，保留作为代理方法以保持向后兼容）
    // ====================================================================
    
    getEquipmentImageName(equipmentName, eqInstance = null) {
        return this.assetManager.getEquipmentImageName(equipmentName, eqInstance);
    }
    
    async loadAndProcessEquipmentImage(imageName) {
        return this.assetManager.loadAndProcessEquipmentImage(imageName);
    }
    
    async setEquipmentBackgroundImage(element, equipmentName, quality = null, eqInstance = null) {
        return this.assetManager.setEquipmentBackgroundImage(element, equipmentName, quality, eqInstance);
    }
    
    getAlchemyMaterialImageName(materialName) {
        return this.assetManager.getAlchemyMaterialImageName(materialName);
    }
    
    async loadAndProcessAlchemyMaterialImage(imageName) {
        return this.assetManager.loadAndProcessAlchemyMaterialImage(imageName);
    }
    
    async setAlchemyMaterialBackgroundImage(element, materialName, size = 'cover') {
        return this.assetManager.setAlchemyMaterialBackgroundImage(element, materialName, size);
    }
}

