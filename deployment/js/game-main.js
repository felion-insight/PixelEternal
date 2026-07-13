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
    /** localStorage 中存档码的键（与导出到剪贴板为同一 LZ/Base64 串） */
    static BROWSER_SAVE_CODE_KEY = 'pixelEternal_saveCode_v1';

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
        this.skillLabScene = new SkillLabScene(this); // 技能实验场
        this.trialScene = new TrialScene(this); // 转职试炼场景
        this.dungeonScene = typeof window.DungeonScene !== 'undefined' ? new window.DungeonScene(this) : null;
        this.activeTrial = null; // { kind, targetId, bossId, title }
        this.activeDungeon = null; // { def, tier, dungeonId, tierId }
        this.dungeonUI = null;
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
        this.devMode = false; // 开发者模式标志（仅本地 start-server.py 下可开启）
        /** 是否由仓库根 start-server.py 注入的本地开发环境（静态网页托管为 false） */
        this._localPeDevServer = window.__PE_LOCAL_DEV_SERVER__ === true;
        /** 自动同步存档码到 localStorage：上次已写入的「内容指纹」（不含 timestamp） */
        this._lastSyncedSaveFingerprint = null;
        /** 自动同步节流时间戳 */
        this._lastSaveCodeSyncTimeMs = 0;
        this.paused = false; // 游戏暂停标志
        this.classUI = null;
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
        this.shopLockedItems = new Set(); // 锁定的商品ID集合
        this.shopCapacityExpansionCount = 0; // 背包扩容购买次数（用于递增价格）
        this.shopHasCapacityExpansion = false; // 当前商店是否显示背包扩容
        this.shopTargetSlots = {
            legendary: { available: 1, target: null }, // 传说定向位
            epic: { available: 1, target: null }, // 史诗定向位
            fine: { available: 1, target: null } // 精良定向位
        }; // 定向位系统
        this.droppedItems = []; // 地面掉落物列表
        /** 击杀/宝箱等产生的追踪型金币、经验光点（碰撞后才结算） */
        this.rewardPickups = [];
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
        this.lastInteractKeyState = false; // 上次交互键状态，用于检测按键按下边沿
        this.actionKeyState = {};
        this.mouse = { x: 0, y: 0, left: false };
        /** 落点技/锁定技：长按 Q、技能键或右键蓄力，松手释放；null 表示未在蓄力 */
        this.weaponSkillAim = null;
        /** 职业技能长按瞄准预览 */
        this.classSkillAim = null;
        this._weaponSkillGlobalMouseUp = (e) => {
            if (e.button === 0) this._onWeaponSkillInputUp('btn');
            else if (e.button === 2) this._onWeaponSkillInputUp('rmb');
        };
        
        // 工具提示管理器
        this.tooltipManager = new TooltipManager(this);
        
        // 粒子系统管理器
        this.particleManager = new ParticleManager();
        
        // 命中反馈（卡肉 + 视觉特效）
        this.hitFxConfig = {
            // 卡肉与震动参数对齐 change.md（约 70ms、振幅 3～5px、远程减半）
            meleeHitStopMs: 70,
            critHitStopMs: 95,
            recoverySlowTicks: 1,
            meleeShake: { ampMin: 3, ampMax: 5, durationMs: 100, bigFrames: 2 },
            rangedShake: { ampMin: 1.5, ampMax: 2.5, durationMs: 70, bigFrames: 1 },
            flash: { startR: 8, endR: 24, durationMs: 100, warmDelayMs: 20, warmEndR: 22, warmDurationMs: 80 },
            ring: { startR: 8, endR: 36, durationMs: 120 },
            impactLines: { count: 6, speedPerFrame: 4, maxLength: 28, decay: 0.85 },
            particles: { melee: 48, ranged: 34 },
            /** 非暴击：相对当前满额特效的粒子与震动比例（暴击仍用满额） */
            nonCritParticleScale: 0.38,
            nonCritShakeScale: 0.52,
            edgeFlash: { durationMs: 80, alpha: 0.45 },
            enemyKnock: { melee: 8, ranged: 6, flashMs: 100, stunMs: 90, rangedStunMs: 70 }
        };
        this.hitStopTimer = 0; // ms
        this._hitStopRecoveryTicks = 0;
        this._hitStopRecoveryAccumulator = 0;
        this.screenShake = { amplitude: 0, timer: 0, duration: 0, bigFrames: 0 };
        this.hitImpactEffects = [];
        this._lastHitImpactVfxTime = 0;
        this.edgeDamageFlash = { timer: 0, duration: 100, alpha: 0 };
        this.hitStretchFrames = 0;
        
        // 背包图片更新请求ID（用于取消之前的更新）
        this.inventoryImageUpdateRequestId = null;
        
        // 缓存生成的装备列表，避免重复生成
        this.cachedAllEquipments = null;
        this.cachedAllMaterials = null;
        
        // 将game实例暴露到全局，方便开发者模式调用
        window.game = this;

        if (typeof document !== 'undefined' && document.body && !this._localPeDevServer) {
            document.body.classList.add('pe-hide-dev-panels');
        }
        
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
            
            // 1. 装备图片（基型 + 槽位占位）
            console.log('收集程序化装备图片路径...');
            const imageNames = new Set();
            if (typeof BASE_TYPES !== 'undefined' && BASE_TYPES) {
                const addMap = (map) => {
                    Object.keys(map || {}).forEach(id => imageNames.add('equipment/base/' + id + '.png'));
                };
                addMap(BASE_TYPES.weapons);
                addMap(BASE_TYPES.offHand);
                addMap(BASE_TYPES.armor);
                addMap(BASE_TYPES.accessories);
            }
            ['weapon', 'offHand', 'helmet', 'body', 'hands', 'legs', 'feet', 'amulet', 'ring', 'belt'].forEach(slot => {
                imageNames.add('equipment/slots/' + slot + '.png');
            });
            imageNames.forEach(imageName => {
                if (!this.assetManager.equipmentImageCache.has(imageName)) {
                    resourcesToLoad.push({
                        type: 'equipment',
                        name: imageName,
                        imageName,
                        loadFn: () => this.assetManager.loadAndProcessEquipmentImage(imageName)
                    });
                }
            });
            
            // 2. 怪物贴图
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
            
            // 3. 玩家 GIF
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

            // 4. 飞射体 / 子弹贴图（asset/projectiles）
            if (typeof window.PROJECTILE_SPRITE_MAP !== 'undefined' && window.PROJECTILE_SPRITE_MAP) {
                const pm = window.PROJECTILE_SPRITE_MAP;
                const projIds = new Set();
                ['weaponByName', 'monsterByName', 'bossSkillByName'].forEach((k) => {
                    const o = pm[k];
                    if (o && typeof o === 'object') {
                        Object.values(o).forEach((v) => { if (v && typeof v === 'string') projIds.add(v); });
                    }
                });
                if (pm.monsterDefault && typeof pm.monsterDefault === 'string') projIds.add(pm.monsterDefault);
                if (Array.isArray(pm.allSpriteIds)) {
                    pm.allSpriteIds.forEach((id) => { if (id && typeof id === 'string') projIds.add(id); });
                }
                projIds.forEach((id) => {
                    resourcesToLoad.push({
                        type: 'projectile',
                        name: id,
                        imageName: 'projectiles/' + id + '.png',
                        loadFn: () => this.assetManager.loadProjectileSprite(id)
                    });
                });
            }
            
            const totalImages = resourcesToLoad.length;
            console.log('需要加载的资源数量:', totalImages, {
                equipment: resourcesToLoad.filter(r => r.type === 'equipment').length,
                monster: resourcesToLoad.filter(r => r.type === 'monster').length,
                player: resourcesToLoad.filter(r => r.type === 'player').length,
                projectile: resourcesToLoad.filter(r => r.type === 'projectile').length
            });
            let loadedImages = 0;
            
            // 更新进度条的函数（后台标签页会节流 requestAnimationFrame，此处直接写 DOM）
            const updateProgress = () => {
                const progress = totalImages > 0 ? Math.floor((loadedImages / totalImages) * 100) : 0;
                console.log(`更新进度: ${loadedImages}/${totalImages} = ${progress}%`);
                if (progressFill) {
                    progressFill.style.width = `${progress}%`;
                    console.log('进度条宽度已更新:', progressFill.style.width);
                }
                if (progressText) {
                    progressText.textContent = `${progress}%`;
                    console.log('进度文本已更新:', progressText.textContent);
                }
            };

            const yieldAfterResourceTick = () => new Promise((r) => {
                const ms = (typeof document !== 'undefined' && document.hidden) ? 48 : 12;
                setTimeout(r, ms);
            });
            
            // 更新状态：开始加载资源
            if (statusText) {
                const typeCounts = {
                    equipment: resourcesToLoad.filter(r => r.type === 'equipment').length,
                    monster: resourcesToLoad.filter(r => r.type === 'monster').length,
                    player: resourcesToLoad.filter(r => r.type === 'player').length,
                    projectile: resourcesToLoad.filter(r => r.type === 'projectile').length
                };
                statusText.textContent = `准备加载 ${totalImages} 个资源 (装备:${typeCounts.equipment} 怪物:${typeCounts.monster} 玩家:${typeCounts.player} 飞射体:${typeCounts.projectile})...`;
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
                    statusText.textContent = `正在加载: ${batch[0].imageName}... (${i + 1}/${totalImages})`;
                }
                
                const batchPromises = batch.map((resource, index) => {
                    const typeName = resource.type === 'equipment' ? '装备' :
                                   resource.type === 'monster' ? '怪物' :
                                   resource.type === 'player' ? '玩家' :
                                   resource.type === 'projectile' ? '飞射体' : '资源';
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
                            statusText.textContent = `正在加载: ${batch[index + 1].imageName}... (${i + index + 2}/${totalImages})`;
                        }
                        
                        // 让出主线程；不依赖 rAF，避免后台标签页整批 Promise.all 长期不 resolve
                        return yieldAfterResourceTick();
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
                        if (this.tutorialUI) this.tutorialUI.beginOnboarding();
                        else if (this.classUI) this.classUI.maybeShowClassSelectOnStart();
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

        this.initVolumeSettingsUI();
        if (window.KeybindSystem) window.KeybindSystem.initSettingsUI(this);

        // 事件监听
        document.addEventListener('keydown', (e) => {
            const KB = window.KeybindSystem;
            if (KB && KB.isCapturing()) {
                KB.handleCaptureKeydown(e);
                return;
            }

            const action = KB ? KB.getActionForEvent(e) : null;
            if (action) KB.setActionPressed(this, action, true);

            // F1：仅本地 start-server.py 启动时启用开发者模式
            if (e.key === 'F1') {
                e.preventDefault();
                if (this._localPeDevServer) {
                    this.toggleDevMode();
                }
                return;
            }

            // 武器技能：非落点技立即释放；落点技按下开始蓄力瞄准
            if (action === 'weaponSkill' && !e.repeat && !this.player.isDashing) {
                this._onWeaponSkillInputDown('q');
            }
            
            // ESC键处理：关闭打开的界面或显示菜单
            if (e.key === 'Escape' || e.key === 'Esc') {
                e.preventDefault();
                
                if (this.weaponSkillAim) {
                    this.cancelWeaponSkillAim();
                    return;
                }
                if (this.classSkillAim) {
                    this.cancelClassSkillAim();
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
                const characterPanelModal = document.getElementById('character-panel-modal');
                const skillPanelModal = document.getElementById('skill-panel-modal');
                const classSelectModal = document.getElementById('class-select-modal');
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
                const eliteBoonChoiceModal = document.getElementById('elite-boon-choice-modal');
                if (eliteBoonChoiceModal && eliteBoonChoiceModal.classList.contains('show')) {
                    this.resolveEliteBoonChoice(null);
                    return;
                }
                const gapShopModal = document.getElementById('gap-shop-modal');
                if (gapShopModal && gapShopModal.classList.contains('show')) {
                    this.closeGapShopModal();
                    return;
                }
                if (blacksmithModal && blacksmithModal.classList.contains('show')) {
                    this.closeBlacksmith();
                    return;
                }
                if (this.npcUI) {
                    const npcModals = [
                        ['class-master-modal', () => this.npcUI.closeClassMaster()],
                        ['enchanter-modal', () => this.npcUI.closeEnchanter()],
                        ['jeweler-modal', () => this.npcUI.closeJeweler()],
                        ['chronicle-modal', () => this.npcUI.closeChronicle()],
                        ['awakening-modal', () => this.npcUI.closeAwakening()],
                        ['dungeon-hub-modal', () => this.dungeonUI && this.dungeonUI.close()]
                    ];
                    for (const [id, closeFn] of npcModals) {
                        const el = document.getElementById(id);
                        if (el && el.classList.contains('show')) {
                            closeFn();
                            return;
                        }
                    }
                }
                if (shopModal && shopModal.classList.contains('show')) {
                    this.closeShop();
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
                const skillLabModal = document.getElementById('skill-lab-modal');
                if (skillLabModal && skillLabModal.classList.contains('show')) {
                    if (this.skillLabUI) this.skillLabUI.close();
                    return;
                }
                if (characterPanelModal && characterPanelModal.classList.contains('show')) {
                    this.classUI.hideCharacterPanel();
                    return;
                }
                if (skillPanelModal && skillPanelModal.classList.contains('show')) {
                    this.classUI.hideSkillPanel();
                    return;
                }
                if (classSelectModal && classSelectModal.classList.contains('show')) {
                    if (window.hasPlayerClass(this.player.classData)) this.classUI.hideClassSelect();
                    return;
                }
                
                // 如果在训练场场景且没有其他模态框打开，直接返回主城
                if (this.currentScene === SCENE_TYPES.TRAINING) {
                    this.returnToTown();
                    return;
                }
                if (this.currentScene === SCENE_TYPES.SKILL_LAB) {
                    this.exitSkillLab();
                    return;
                }
                if (this.currentScene === SCENE_TYPES.TRIAL) {
                    this.abortTrial();
                    return;
                }
                if (this.currentScene === SCENE_TYPES.DUNGEON) {
                    this.abortDungeon();
                    return;
                }
                
                // 如果没有其他模态框打开，显示ESC菜单
                this.showEscMenu();
            }
            
            // 如果ESC菜单打开，禁用其他按键（本地开发时额外允许 F1）
            const escMenuModal = document.getElementById('esc-menu-modal');
            if (escMenuModal && escMenuModal.classList.contains('show')) {
                const allowF1 = this._localPeDevServer;
                if (e.key === 'F1' && !allowF1) {
                    e.preventDefault();
                    return;
                }
                if (e.key !== 'F1' && e.key !== 'Escape' && e.key !== 'Esc') {
                    e.preventDefault();
                    return;
                }
            }
            
            // 如果游戏暂停，只允许关闭界面
            if (this.paused) {
                if (action === 'inventory') {
                    const modal = document.getElementById('inventory-modal');
                    if (modal.classList.contains('show')) {
                        this.toggleInventory();
                    }
                }
                if (action === 'codex') {
                    const codexModal = document.getElementById('codex-modal');
                    if (codexModal.classList.contains('show')) {
                        this.toggleCodex();
                    }
                }
                if (action === 'guide') {
                    const guideModal = document.getElementById('guide-modal');
                    if (guideModal.classList.contains('show')) {
                        this.toggleGuide();
                    }
                }
                return; // 暂停时不处理其他按键
            }

            if (action === 'skillPanel' && !e.repeat) {
                e.preventDefault();
                if (this.classUI) this.classUI.toggleSkillPanel();
                return;
            }
            if (action === 'characterPanel' && !e.repeat) {
                e.preventDefault();
                if (this.classUI) this.classUI.toggleCharacterPanel();
                return;
            }

            if (e.key === 'Shift' && !action) {
                this.keys['shift'] = true;
            } else if (!action && e.key.toLowerCase() !== 'k') {
                this.keys[e.key.toLowerCase()] = true;
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                this.keys[e.key] = true;
            }

            if (!e.repeat && !this.player.isDashing) {
                if (action === 'skill1') this._onClassSkillInputDown(0, 'skill1');
                else if (action === 'skill2') this._onClassSkillInputDown(1, 'skill2');
                else if (action === 'skill3') this._onClassSkillInputDown(2, 'skill3');
                else if (action === 'skill4') this._onClassSkillInputDown(3, 'skill4');
            }

            if (action === 'inventory') {
                this.toggleInventory();
            }
            if (action === 'codex') {
                this.toggleCodex();
            }
            if (action === 'guide') {
                this.toggleGuide();
            }
            if (action === 'trainingDummy' && !e.repeat && this.currentScene === SCENE_TYPES.TRAINING) {
                this.openDummySpawnPanel();
            }
            if (!e.repeat && e.code === 'KeyL' && this.currentScene === SCENE_TYPES.SKILL_LAB && this.skillLabUI) {
                e.preventDefault();
                if (this.skillLabUI.isOpen()) this.skillLabUI.close();
                else this.skillLabUI.open();
            }
        });

        document.addEventListener('keyup', (e) => {
            const KB = window.KeybindSystem;
            const action = KB ? KB.getActionForEvent(e) : null;
            if (action) KB.setActionPressed(this, action, false);
            if (action === 'weaponSkill') {
                this._onWeaponSkillInputUp('q');
            }
            if (action === 'skill1') this._onClassSkillInputUp('skill1');
            else if (action === 'skill2') this._onClassSkillInputUp('skill2');
            else if (action === 'skill3') this._onClassSkillInputUp('skill3');
            else if (action === 'skill4') this._onClassSkillInputUp('skill4');
            if (e.key === 'Shift' && !action) {
                this.keys['shift'] = false;
            } else if (!action) {
                this.keys[e.key.toLowerCase()] = false;
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                this.keys[e.key] = false;
            }
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            this.updateMouseFromEvent(e);
        });
        
        this.canvas.addEventListener('contextmenu', (e) => {
            if (this.currentScene === SCENE_TYPES.TOWER || this.currentScene === SCENE_TYPES.TRAINING || this.currentScene === SCENE_TYPES.SKILL_LAB || this.currentScene === SCENE_TYPES.TRIAL || this.currentScene === SCENE_TYPES.DUNGEON) {
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
                    } else if (targetTab === 'base_types') {
                        this.updateCodexBaseTypes();
                    } else if (targetTab === 'affixes') {
                        this.updateCodexAffixes();
                    } else if (targetTab === 'powers') {
                        this.updateCodexPowers();
                    } else if (targetTab === 'sets_v2') {
                        this.updateCodexSetsV2();
                    } else if (targetTab === 'set_mechanics') {
                        this.updateCodexSetMechanics();
                    } else if (targetTab === 'consumables') {
                        this.updateCodexConsumables();
                    }
                });
            });
        });
        
        // 装备图鉴筛选器事件监听（添加防抖，避免频繁更新导致卡顿）
        const filterLevel = document.getElementById('filter-level');
        const filterSlot = document.getElementById('filter-slot');
        const filterQuality = document.getElementById('filter-quality');
        const filterSet = document.getElementById('filter-set');
        const filterSource = document.getElementById('filter-source');
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
        if (filterSource) {
            filterSource.addEventListener('change', debouncedUpdateCodex);
        }
        if (resetFilters) {
            resetFilters.addEventListener('click', () => {
                filterLevel.value = 'all';
                filterSlot.value = 'all';
                filterQuality.value = 'all';
                filterSet.value = 'all';
                if (filterSource) filterSource.value = 'procedural';
                this.updateCodexEquipments();
            });
        }
        if (typeof SET_DEFINITIONS_V2 !== 'undefined') {
            this.populateCodexSetFilter();
        }

        const filterBaseSlot = document.getElementById('filter-base-slot');
        const filterBaseWeapon = document.getElementById('filter-base-weapon');
        const resetBaseFilters = document.getElementById('reset-base-filters');
        const debouncedUpdateBaseTypes = () => {
            if (document.getElementById('codex-base_types')?.classList.contains('active')) {
                this.updateCodexBaseTypes();
            }
        };
        if (filterBaseSlot) filterBaseSlot.addEventListener('change', debouncedUpdateBaseTypes);
        if (filterBaseWeapon) filterBaseWeapon.addEventListener('change', debouncedUpdateBaseTypes);
        if (resetBaseFilters) {
            resetBaseFilters.addEventListener('click', () => {
                if (filterBaseSlot) filterBaseSlot.value = 'all';
                if (filterBaseWeapon) filterBaseWeapon.value = 'all';
                this.updateCodexBaseTypes();
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
        this.initEliteBoonChoiceModal();
        this.initDemonInterferenceUi();
        this.initDevPanelExtraControls();
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
        
        // 若本机曾用「保存到浏览器」写入存档码，启动时自动导入（剪贴板导入仍保留）
        this.tryAutoLoadBrowserSave();
        
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
        this.classUI = new ClassUI(this);
        this.classUI.init();
        this.skillLabUI = typeof SkillLabUI !== 'undefined' ? new SkillLabUI(this) : null;
        this.npcUI = new NpcUI(this);
        this.npcUI.init();
        if (typeof window.DungeonUI !== 'undefined') {
            this.dungeonUI = new window.DungeonUI(this);
            this.dungeonUI.init();
        }
        this.tutorialUI = new TutorialUI(this);
        this.tutorialUI.init();
        this.tutorialHighlightBuilding = null;
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
                const slotNames = (typeof SLOT_NAMES !== 'undefined') ? SLOT_NAMES : {
                    weapon: '武器', offHand: '副手', helmet: '头盔', body: '胸甲', hands: '手套',
                    legs: '腿甲', feet: '足具', amulet: '护符', ring: '指环', belt: '腰带'
                };
                typeDiv.textContent = `${slotNames[item.slot] || item.slot} | ${QUALITY_NAMES[item.quality] || item.quality}`;
            } else if (item.type === 'consumable') {
                const sub = item.consumableType === 'resurrection' ? '复活道具'
                    : item.consumableType === 'recipe' ? '图纸'
                    : item.consumableType === 'backpack_expansion' ? '背包扩容'
                    : '消耗品';
                typeDiv.textContent = `${sub} | ${QUALITY_NAMES[item.quality] || item.quality}`;
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
            this.rewardPickups = [];
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

    getInventoryTabCapacity(tabType) {
        if (tabType === 'consumable') {
            return this.player.maxPotionCapacity || 18;
        }
        return this.player.maxEquipmentCapacity || 18;
    }

    getInventoryTabStartIndex(tabType) {
        return tabType === 'consumable' ? 48 : 0;
    }

    getInventoryItemForTab(tabType, inventoryIndex) {
        const item = this.player.inventory[inventoryIndex];
        if (!item) return null;
        if (tabType === 'equipment') {
            return (item.type === 'equipment' || (!item.type && item.slot)) ? item : null;
        }
        if (tabType === 'consumable') {
            return (item.type === 'consumable' && item.consumableType !== 'potion') ? item : null;
        }
        return null;
    }

    ensureInventorySlotElements(minCount) {
        const inventoryItems = document.getElementById('inventory-items');
        if (!inventoryItems) return;

        const existing = inventoryItems.querySelectorAll('.inventory-slot').length;
        for (let i = existing; i < minCount; i++) {
            const slot = document.createElement('div');
            slot.className = 'inventory-slot';
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
            slot.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const index = parseInt((e.currentTarget && e.currentTarget.dataset.index) || e.target.dataset.index);
                if (!isNaN(index) && this.player.inventory[index]) {
                    if (this.currentScene === SCENE_TYPES.TOWER) {
                        this.dropInventoryItemToGround(index);
                    } else {
                        this.discardInventoryItem(index);
                    }
                }
            });
            inventoryItems.appendChild(slot);
        }
    }

    /**
     * 初始化背包界面
     */
    initInventory() {
        // 初始化当前选中的页签
        this.currentInventoryTab = 'equipment';
        
        const inventoryItems = document.getElementById('inventory-items');
        inventoryItems.innerHTML = '';
        const initialSlots = Math.max(
            this.player.maxEquipmentCapacity || 18,
            this.player.maxPotionCapacity || 18
        );
        this.ensureInventorySlotElements(initialSlots);
        
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
        // 消耗品：48-65区域中的消耗品（包括potion和consumable类型）
        const consumableStartIndex = 48;
        const consumableCount = this.player.inventory.slice(consumableStartIndex, consumableStartIndex + (this.player.maxPotionCapacity || 18)).filter(item =>
            item !== null && item !== undefined && item.type === 'consumable' && item.consumableType !== 'potion'
        ).length;
        
        // 获取各栏的最大容量（需要从玩家属性中获取，如果没有则使用默认值）
        const maxEquipment = this.player.maxEquipmentCapacity || 18;
        const maxConsumable = this.player.maxPotionCapacity || 18;
        
        // 更新显示
        const equipmentCap = document.getElementById('equipment-capacity');
        const consumableCap = document.getElementById('consumable-capacity');
        
        if (equipmentCap) equipmentCap.textContent = `装备: ${equipmentCount}/${maxEquipment}`;
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
            // 装备图鉴等会在用户点击对应标签时再加载
            
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
        const filterSlotRaw = document.getElementById('filter-slot')?.value || 'all';
        const filterQualityRaw = document.getElementById('filter-quality')?.value || 'all';
        const filterSet = document.getElementById('filter-set')?.value || 'all';
        const filterSource = document.getElementById('filter-source')?.value || 'procedural';
        const normSlot = window.EquipmentCodex ? window.EquipmentCodex.normalizeSlotFilter(filterSlotRaw) : filterSlotRaw;
        const normQuality = window.EquipmentCodex ? window.EquipmentCodex.normalizeQualityFilter(filterQualityRaw) : filterQualityRaw;

        let allEquipments = [];
        if ((filterSource === 'procedural' || filterSource === 'all') && window.EquipmentCodex) {
            const cacheKey = [filterLevel, normSlot, normQuality, filterSet, filterSource].join('|');
            if (!this._codexProcCache || this._codexProcCacheKey !== cacheKey) {
                this._codexProcCacheKey = cacheKey;
                this._codexProcCache = window.EquipmentCodex.generateProceduralSamples({
                    count: 36,
                    slot: normSlot,
                    quality: normQuality,
                    level: filterLevel,
                    setId: String(filterSet).startsWith('v2_') ? filterSet.slice(3) : null,
                    classId: this.player && typeof window.getPlayerBaseClassId === 'function'
                        ? window.getPlayerBaseClassId(this.player.classData) : null
                });
            }
            allEquipments = allEquipments.concat(this._codexProcCache || []);
        }
        
        // 缓存套装效果计算结果，避免在循环中重复计算
        const cachedActiveSetEffects = typeof getActiveSetEffects === 'function' 
            ? getActiveSetEffects(this.player.equipment) 
            : [];
        const cachedActiveSet = new Set(cachedActiveSetEffects.map(e => e.setId + '-' + e.pieceCount));
        
        // 应用筛选条件
        let filteredEquipments = allEquipments.filter(eq => {
            // 等级筛选
            if (filterLevel !== 'all' && eq.level !== parseInt(filterLevel, 10)) {
                return false;
            }
            // 部位筛选
            if (normSlot !== 'all' && eq.slot !== normSlot) {
                return false;
            }
            // 品质筛选（兼容旧键 common/fine）
            if (normQuality !== 'all') {
                const eqQ = window.EquipmentCodex
                    ? window.EquipmentCodex.normalizeQualityFilter(eq.quality)
                    : eq.quality;
                if (eqQ !== normQuality) return false;
            }
            // 套装筛选（程序化装备用 setId）
            if (filterSet !== 'all') {
                if (filterSet === 'none') {
                    if (eq.setId) return false;
                } else if (String(filterSet).startsWith('v2_')) {
                    const v2Id = filterSet.slice(3);
                    if (eq.setId !== v2Id) return false;
                } else if (eq.setId !== filterSet) {
                    return false;
                }
            }
            return true;
        });
        
        // 如果没有符合条件的装备，显示提示
        if (filteredEquipments.length === 0) {
            container.innerHTML = '';
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
            const slotOrder = {
                weapon: 1, offHand: 2, helmet: 3, body: 4, hands: 5, legs: 6, feet: 7,
                amulet: 8, ring: 9, belt: 10
            };
            if (slotOrder[a.slot] !== slotOrder[b.slot]) {
                return slotOrder[a.slot] - slotOrder[b.slot];
            }
            // 部位相同则按等级排序
            if (a.level !== b.level) {
                return a.level - b.level;
            }
            // 等级相同则按品质排序
            const qualityOrder = { normal: 1, magic: 2, rare: 3, epic: 4, legendary: 5, mythic: 6,
                common: 1, fine: 2 };
            const qA = qualityOrder[a.quality] || qualityOrder[window.EquipmentCodex?.normalizeQualityFilter(a.quality)] || 0;
            const qB = qualityOrder[b.quality] || qualityOrder[window.EquipmentCodex?.normalizeQualityFilter(b.quality)] || 0;
            return qA - qB;
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
                if (eq.procedural || eq.baseTypeId) {
                    const badge = document.createElement('span');
                    badge.className = 'codex-proc-badge';
                    badge.textContent = '程序化';
                    name.appendChild(badge);
                }
                headerDiv.appendChild(visual);
                headerDiv.appendChild(name);
                
                const stats = document.createElement('div');
                stats.className = 'equipment-stats';
                let statsHTML = '';
                if ((eq.procedural || eq.baseTypeId) && typeof eq.getTooltipHTML === 'function') {
                    statsHTML = eq.getTooltipHTML(this.player.equipment);
                    statsHTML = statsHTML.replace(/<h4[^>]*>[\s\S]*?<\/h4>/, '');
                } else {
                    statsHTML = `<p><strong>品质:</strong> <span style="color: ${QUALITY_COLORS[eq.quality]}">${QUALITY_NAMES[eq.quality] || eq.quality}</span></p>`;
                    statsHTML += `<p style="color: #ffaa00;"><strong>需要等级:</strong> ${eq.level}</p>`;
                    statsHTML += `<p>---</p>`;
                    statsHTML += `<p><strong>属性:</strong></p>`;
                    
                    let hasStats = false;
                    for (const [key, value] of Object.entries(eq.stats)) {
                        if (value !== 0) {
                            hasStats = true;
                            const statNames = {
                                attack: '攻击力', magicAttack: '魔法攻击', critRate: '暴击率', critDamage: '暴击伤害',
                                health: '生命值', defense: '防御力', magicDefense: '魔法防御', dodge: '闪避率',
                                attackSpeed: '攻击速度', moveSpeed: '移动速度'
                            };
                            const suffix = key.includes('Rate') || key.includes('Speed') || key.includes('dodge') ? '%' : '';
                            statsHTML += `<p>${statNames[key] || key}: +${value}${suffix}</p>`;
                        }
                    }
                    if (!hasStats) statsHTML += `<p style="color: #aaa;">无属性加成</p>`;
                    statsHTML += `<p style="color: #aaa; font-size: 12px; margin-top: 10px;">提示：只有达到装备要求的等级才能穿戴</p>`;
                }
                
                if (!(eq.procedural || eq.baseTypeId)) {
                    if (eq.equipmentTraits && eq.equipmentTraits.description) {
                        statsHTML += `<p>---</p>`;
                        statsHTML += `<p style="color: #88ff88;"><strong>装备词条:</strong></p>`;
                        statsHTML += `<p style="color: #88ff88; font-size: 11px;">${eq.equipmentTraits.description}</p>`;
                    }
                    // 显示武器技能（含图标）
                    if (eq.slot === 'weapon' && eq.skill) {
                        const skillIconUrl = this.getSkillIconUrl(eq.skill.name);
                        const skillIconHtml = skillIconUrl ? `<img src="${skillIconUrl}" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:6px;border-radius:4px;">` : '';
                        statsHTML += `<p>---</p>`;
                        statsHTML += `<p style="color: #ffaa00;"><strong>${skillIconHtml}武器技能: ${eq.skill.name}</strong></p>`;
                        statsHTML += `<p style="color: #aaa; font-size: 11px;">${eq.skill.description}</p>`;
                        statsHTML += `<p style="color: #aaa; font-size: 11px;">冷却时间: ${eq.skill.cooldown / 1000}秒</p>`;
                        if (eq.refineEffects) {
                            statsHTML += `<p>---</p>`;
                            statsHTML += `<p style="color: #ffd700;"><strong>精炼效果:</strong></p>`;
                            for (let i = 0; i < eq.refineEffects.length; i++) {
                                const refineEffect = eq.refineEffects[i];
                                const refineLevel = i + 1;
                                statsHTML += `<p style="color: #ffd700; font-size: 10px; margin-left: 10px;">${'★'.repeat(refineLevel)} 精炼${refineLevel}级: ${refineEffect.description}</p>`;
                            }
                        }
                    }
                    if (eq.setId && typeof SET_DEFINITIONS_V2 !== 'undefined' && SET_DEFINITIONS_V2.sets && SET_DEFINITIONS_V2.sets[eq.setId]) {
                        const setData = SET_DEFINITIONS_V2.sets[eq.setId];
                        statsHTML += `<p>---</p>`;
                        statsHTML += `<p style="color: #ffaa00;"><strong>套装: ${setData.name}</strong></p>`;
                        let pieceCount = 0;
                        if (typeof getSetV2PieceCount === 'function') {
                            pieceCount = getSetV2PieceCount(this.player.equipment, eq.setId);
                        }
                        for (const [pieceCountKey, effect] of Object.entries(setData.effects || {})) {
                            const active = pieceCount >= parseInt(pieceCountKey, 10);
                            const color = active ? '#33ff33' : '#888888';
                            statsHTML += `<p style="color: ${color}; font-size: 10px;">${pieceCountKey}件: ${typeof stripSetDescriptionMarkdown === 'function' ? stripSetDescriptionMarkdown(effect.description) : effect.description}</p>`;
                        }
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

    /** 图鉴「套装机制」：Phase 3 套装 V2 */
    updateCodexSetMechanics() {
        const container = document.getElementById('set-mechanics-list');
        if (!container) return;
        if (!window.EquipmentCodex || typeof SET_DEFINITIONS_V2 === 'undefined' || !SET_DEFINITIONS_V2.sets) {
            container.innerHTML = '<p style="color:#888;text-align:center;padding:24px;">套装数据未加载</p>';
            return;
        }
        container.innerHTML = window.EquipmentCodex.buildSetV2Html(this.player ? this.player.equipment : null);
    }

    /** 图鉴「消耗品」：常规药水已移除，展示神圣十字架等仍存在的条目 */
    updateCodexConsumables() {
        const container = document.getElementById('codex-consumables-list');
        if (!container) return;
        const sample = typeof createHolyCrossShopOffer === 'function' ? createHolyCrossShopOffer() : null;
        let html = '<p style="color:#ccc;line-height:1.7;">常规药水已从游戏中移除。以下为仍存在的消耗品图鉴说明。</p>';
        if (sample && sample.getTooltipHTML) {
            const qc = QUALITY_COLORS[sample.quality] || '#a335ee';
            html += `<div style="margin-top:16px;max-width:520px;padding:14px;background:rgba(50,50,60,0.85);border-radius:6px;border:2px solid ${qc}">`;
            html += sample.getTooltipHTML();
            html += '<p style="color:#888;font-size:12px;margin-top:12px;">神圣十字架会在商店<strong style="color:#ffd700;">装备</strong>分页商品中低概率随机出现（与「传说」品质掉落概率相同：每刷新约 2% 替换其中一格）。</p></div>';
        }
        container.innerHTML = html;
    }

    updateCodexBaseTypes() {
        const container = document.getElementById('base-types-list');
        if (!container || !window.EquipmentCodex) return;
        const slot = document.getElementById('filter-base-slot')?.value || 'all';
        const weaponType = document.getElementById('filter-base-weapon')?.value || 'all';
        container.innerHTML = window.EquipmentCodex.buildBaseTypesHtml({
            slot: slot === 'all' ? null : slot,
            weaponType: weaponType === 'all' ? null : weaponType
        });
    }

    updateCodexAffixes() {
        const container = document.getElementById('affixes-list');
        if (!container || !window.EquipmentCodex) return;
        container.innerHTML = window.EquipmentCodex.buildAffixReferenceHtml();
    }

    updateCodexPowers() {
        const container = document.getElementById('powers-list');
        if (!container || !window.EquipmentCodex) return;
        container.innerHTML = window.EquipmentCodex.buildLegendaryPowersHtml();
    }

    updateCodexSetsV2() {
        const container = document.getElementById('sets-v2-list');
        if (!container || !window.EquipmentCodex) return;
        container.innerHTML = window.EquipmentCodex.buildSetV2Html(this.player.equipment);
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
                    normal: '40',
                    magic: '50',
                    rare: '60',
                    epic: '70',
                    legendary: '80',
                    mythic: '90'
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
        
        // 根据当前页签显示相应数量的格子（仅显示当前容量上限内的格子）
        const tabType = this.currentInventoryTab || 'equipment';
        const maxSlots = this.getInventoryTabCapacity(tabType);
        const inventoryStartIndex = this.getInventoryTabStartIndex(tabType);
        this.ensureInventorySlotElements(maxSlots);

        const allSlots = document.querySelectorAll('#inventory-items .inventory-slot');
        const inventoryImageUpdates = [];
        allSlots.forEach((slot, localIndex) => {
            if (localIndex >= maxSlots) {
                slot.style.display = 'none';
                return;
            }
            slot.style.display = '';

            // 清除之前的锁图标
            const existingLock = slot.querySelector('.level-lock-icon');
            if (existingLock) {
                existingLock.remove();
            }

            const index = inventoryStartIndex + localIndex;
            const item = this.getInventoryItemForTab(tabType, index);
            
            if (item) {
                
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
                    normal: '40',
                    magic: '50',
                    rare: '60',
                    epic: '70',
                    legendary: '80',
                    mythic: '90'
                };
                slot.style.backgroundColor = qualityColor + (qualityBgOpacity[item.quality] || '40');
                slot.title = item.name;
                
                // 如果是装备，检查是否需要更新图片
                const isInventoryEquipment = item.type === 'equipment' || (!item.type && item.slot);
                if (isInventoryEquipment) {
                    inventoryImageUpdates.push({ element: slot, name: item.name, quality: item.quality, item });
                } else if (item.type === 'consumable' && item.consumableType !== 'potion') {
                    // 消耗品（图纸、神圣十字架等）显示贴图和背景色
                    slot.textContent = ''; // 清除文字，使用贴图
                    slot.style.fontSize = '';
                    slot.style.textAlign = '';
                    slot.style.display = '';
                    slot.style.alignItems = '';
                    slot.style.justifyContent = '';
                    
                    // 根据品质设置背景色
                    const qualityColors = {
                        normal: 'rgba(200, 200, 200, 0.4)',
                        magic: 'rgba(0, 255, 0, 0.35)',
                        rare: 'rgba(100, 150, 255, 0.4)',
                        epic: 'rgba(200, 100, 255, 0.4)',
                        legendary: 'rgba(255, 200, 100, 0.4)',
                        mythic: 'rgba(255, 34, 68, 0.4)'
                    };
                    slot.style.backgroundColor = qualityColors[item.quality] || qualityColors.normal;
                    
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
                        // 其他消耗品显示文字
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
                        this.assetManager.setEquipmentBackgroundImage(element, name, quality, item || null);
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
        
        if (!setId || typeof resolveSetDefinition !== 'function') {
            tooltip.classList.remove('show');
            return;
        }

        const setData = resolveSetDefinition(setId);
        if (!setData) {
            tooltip.classList.remove('show');
            return;
        }
        let html = `<h4 style="color: #ffaa00;">${setData.name}</h4>`;
        html += `<p style="color: #aaa; font-size: 11px;">套装效果:</p>`;
        
        const activeSet = new Set();
        if (typeof getAllActiveSetEffects === 'function') {
            getAllActiveSetEffects(this.player.equipment).forEach(e => {
                if (e.setId === setId) {
                    activeSet.add(e.pieceCount);
                }
            });
        }

        const pieceTargets = (typeof SET_DEFINITIONS_V2 !== 'undefined' && SET_DEFINITIONS_V2.activationPieces)
            ? SET_DEFINITIONS_V2.activationPieces : [2, 4];
        for (const pieceCount of pieceTargets) {
            const effect = setData.effects[String(pieceCount)] || setData.effects[pieceCount];
            if (!effect) continue;
            const isActive = activeSet.has(pieceCount);
            const color = isActive ? '#33ff33' : '#888888';
            const activeText = isActive ? ' (已激活)' : '';
            html += `<p style="color: ${color}; font-size: 10px;">${pieceCount}件: ${typeof stripSetDescriptionMarkdown === 'function' ? stripSetDescriptionMarkdown(effect.description) : effect.description}${activeText}</p>`;
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
            this.addItemToInventory(item, false, { markAsTowerNew: false });
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
                
                const equipSlot = (typeof window.normalizeEquipmentSlot === 'function')
                    ? window.normalizeEquipmentSlot(item.slot)
                    : item.slot;
                const currentEquipped = this.player.equipment[equipSlot];
                this.player.equipment[equipSlot] = item;
                item.slot = equipSlot;
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
                    this.player.onEquipmentSlotChanged(equipSlot);
                }
                this.updateInventoryUI();
                this.updateHUD(); // 更新HUD以刷新套装效果显示
            }
        }
    }

    /**
     * 从背包丢弃物品（永久消失，不会掉落在地上）
     * @param {number} index - 背包索引
     */
    discardInventoryItem(index) {
        const item = this.player.inventory[index];
        if (!item) return;

        const name = item.name || '物品';
        if (!confirm(`确定要丢弃「${name}」吗？\n该物品将永久消失，不会掉落在地上。`)) {
            return;
        }

        this.player.inventory[index] = null;
        this.hideItemTooltip();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        this.updateHUD();
        this.addFloatingText(this.player.x, this.player.y, `已丢弃 ${name}`, '#888888');
    }

    /**
     * 恶魔塔内：右键丢弃装备不弹确认，直接丢到地面上（可再次拾取）
     * @param {number} index
     */
    dropInventoryItemToGround(index) {
        if (this.currentScene !== SCENE_TYPES.TOWER) {
            this.discardInventoryItem(index);
            return;
        }
        const item = this.player.inventory[index];
        if (!item) return;
        // 仅处理装备（与“右键丢弃装备”一致）；其它类型走原逻辑
        if (item.type && item.type !== 'equipment') {
            this.discardInventoryItem(index);
            return;
        }
        if (!item.uniqueId) {
            item.uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        }
        const name = item.name || '装备';
        item._towerPlayerDropped = true;
        // 从背包移除
        this.player.inventory[index] = null;
        this.hideItemTooltip();
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        this.updateHUD();

        // 丢到玩家附近地面
        const ang = Math.random() * Math.PI * 2;
        const dist = 22 + Math.random() * 26;
        const dropX = this.player.x + Math.cos(ang) * dist;
        const dropY = this.player.y + Math.sin(ang) * dist;
        if (typeof DroppedItem !== 'undefined') {
            this.droppedItems.push(new DroppedItem(dropX, dropY, item, this));
        }
        this.addFloatingText(this.player.x, this.player.y, `已丢到地面：${name}`, '#cccccc');
    }

    // ====================================================================
    // 物品管理方法组
    // ====================================================================

    /**
     * 添加物品到背包
     * @param {Object} item - 要添加的物品
     * @param {boolean} [quiet=false] - 为 true 时不弹出「获得」飘字（开发者批量发放等）
     * @returns {boolean} 是否成功添加
     */
    addItemToInventory(item, quiet = false, options = null) {
        if (item && (item.type === 'material' || item.type === 'alchemy')) {
            return false;
        }
        if (item && (item.type === 'potion' || item.consumableType === 'potion')) {
            return false;
        }
        // 根据物品类型确定应该放在哪个区域
        let startIndex, endIndex;
        if (item.type === 'consumable') {
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
            
            const markAsTowerNew = !options || options.markAsTowerNew !== false;
            // 如果当前在恶魔塔中，且本次应计入“塔内新获得”时，标记这个物品
            if (this.currentScene === SCENE_TYPES.TOWER && markAsTowerNew) {
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
            if (!quiet) {
                this.addFloatingText(
                    playerX, 
                    playerY, 
                    `获得: ${item.name}`, 
                    qualityColor
                );
            }
            
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
            if (item.type === 'consumable') {
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
        this.lastInteractKeyState = false;
        if (window.KeybindSystem) {
            window.KeybindSystem.setActionPressed(this, 'interact', false);
            window.KeybindSystem.setActionPressed(this, 'attack', false);
        }
        
        // 重置攻击状态（防止场景切换时保持攻击状态）
        if (this.player) {
            this.player.slashStartTime = 0;
            this.player.slashAngle = 0;
        }
        
        // 重置攻击键状态（防止场景切换时攻击键仍按下导致持续攻击）
        this.keys['j'] = false;
        if (window.KeybindSystem) {
            window.KeybindSystem.setActionPressed(this, 'attack', false);
        }
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
        if (forcedType === 'alchemy') {
            forcedType = ROOM_TYPES.BATTLE;
        }
        const maxF = typeof window.getTowerMaxFloor === 'function' ? window.getTowerMaxFloor() : 240;
        this.floor = Math.min(this.floor, maxF);
        // 清空掉落物、传送门和怪物子弹
        this.droppedItems = [];
        this.rewardPickups = [];
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
            gap_shop: '隙间商店',
            boss: 'Boss'
        };
        const hudRt = selectedType === 'alchemy' ? 'battle' : selectedType;
        document.getElementById('room-type').textContent = typeNames[hudRt] || hudRt;
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
        // 更新左下角血条和等级条
        document.getElementById('player-hp').textContent = Math.floor(this.player.hp);
        document.getElementById('player-max-hp').textContent = this.player.maxHp;
        document.getElementById('player-level').textContent = this.player.level;
        const classNameEl = document.getElementById('player-class-name');
        if (classNameEl && typeof window.getClassDisplayName === 'function') {
            classNameEl.textContent = window.getClassDisplayName(this.player.classData);
        }
        document.getElementById('player-exp').textContent = this.player.exp;
        document.getElementById('player-exp-needed').textContent = this.player.expNeeded;
        const goldDisplay = document.getElementById('player-gold-display');
        if (goldDisplay) {
            goldDisplay.textContent = this.player.gold;
        }
        
        const hpFill = document.getElementById('hp-bar-fill');
        const hpContainer = document.querySelector('#bottom-left-bars .hp-bar-container');
        if (hpFill) {
            const hpPct = this.player.maxHp > 0 ? Math.min(100, 100 * this.player.hp / this.player.maxHp) : 0;
            hpFill.style.width = hpPct + '%';
            if (hpContainer) {
                hpContainer.classList.toggle('low-hp', hpPct > 0 && hpPct < 30);
            }
        }
        const expFill = document.getElementById('exp-bar-fill');
        if (expFill) {
            const expPct = this.player.expNeeded > 0 ? Math.min(100, 100 * this.player.exp / this.player.expNeeded) : 0;
            expFill.style.width = expPct + '%';
        }
        
        // 更新武器技能按钮
        this.updateWeaponSkillButton();
        if (this.classUI) this.classUI.updateAll();
        
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
            attackEl.textContent = this.player.effectiveAttack != null ? this.player.effectiveAttack : this.player.baseAttack;
        }

        const magicAttackEl = document.getElementById('stats-magic-attack');
        if (magicAttackEl) {
            magicAttackEl.textContent = this.player.baseMagicAttack || 0;
        }
        
        const defenseEl = document.getElementById('stats-defense');
        if (defenseEl) {
            defenseEl.textContent = this.player.baseDefense;
        }

        const magicDefenseEl = document.getElementById('stats-magic-defense');
        if (magicDefenseEl) {
            magicDefenseEl.textContent = this.player.baseMagicDefense || 0;
        }

        const classNameStatsEl = document.getElementById('stats-class-name');
        if (classNameStatsEl && typeof window.getClassDisplayName === 'function') {
            classNameStatsEl.textContent = window.getClassDisplayName(this.player.classData);
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
        
        // 更新套装效果（仅背包界面打开时重绘；避免暂停/模态时每帧清空 DOM 导致卡顿）
        const setEffectsList = document.getElementById('stats-set-effects-list');
        const inventoryModalEl = document.getElementById('inventory-modal');
        const inventoryModalOpen = inventoryModalEl && inventoryModalEl.classList.contains('show');
        if (setEffectsList && typeof getActiveSetEffects === 'function' && inventoryModalOpen) {
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
            normal: '40',
            magic: '50',
            rare: '60',
            epic: '70',
            legendary: '80',
            mythic: '90'
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
        const isIconEquipment = item.type === 'equipment' || (!item.type && item.slot);
        if (isIconEquipment && item.name) {
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
                normal: 'rgba(200, 200, 200, 0.4)',
                magic: 'rgba(0, 255, 0, 0.35)',
                rare: 'rgba(100, 150, 255, 0.4)',
                epic: 'rgba(200, 100, 255, 0.4)',
                legendary: 'rgba(255, 200, 100, 0.4)',
                mythic: 'rgba(255, 34, 68, 0.4)'
            };
            iconDiv.style.backgroundColor = qualityColors[item.quality] || qualityColors.normal;
        } else if (item.type === 'consumable' && item.consumableType === 'resurrection') {
            iconDiv.style.display = 'flex';
            iconDiv.style.alignItems = 'center';
            iconDiv.style.justifyContent = 'center';
            iconDiv.style.fontSize = `${Math.max(14, Math.floor(size * 0.42))}px`;
            iconDiv.style.lineHeight = '1';
            iconDiv.textContent = '✝';
            iconDiv.style.color = '#fff';
            iconDiv.style.textShadow = '0 0 4px rgba(0,0,0,0.85)';
        }

        return iconDiv;
    }
    
    /**
     * 更新装备栏品质边框和背景色（只应用到装备图标，不覆盖文字标签）
     */
    updateEquipmentSlotBorders() {
        const slots = (typeof window.EQUIPMENT_SLOT_ORDER !== 'undefined')
            ? window.EQUIPMENT_SLOT_ORDER.slice()
            : ['weapon', 'offHand', 'helmet', 'body', 'hands', 'legs', 'feet', 'amulet', 'ring', 'belt'];
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
                        normal: '40',
                        magic: '50',
                        rare: '60',
                        epic: '70',
                        legendary: '80',
                        mythic: '90'
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
                let hint = `按${window.KeybindSystem ? window.KeybindSystem.formatKeyCode(window.KeybindSystem.getBinding('weaponSkill')) : 'Q'}释放`;
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

    /** 是否有需要暂停游戏的模态框/面板打开 */
    isBlockingModalOpen() {
        const modalIds = [
            'inventory-modal', 'codex-modal', 'shop-modal', 'blacksmith-modal', 'guide-modal',
            'training-ground-modal', 'save-code-modal', 'import-save-modal', 'tower-exit-confirm-modal',
            'esc-menu-modal', 'gap-shop-modal', 'target-slot-select-modal', 'resurrection-modal',
            'death-penalty-modal', 'first-time-guide-modal', 'level-up-capacity-modal',
            'dummy-spawn-modal', 'random-box-quantity-modal', 'random-box-rewards-modal',
            'dungeon-selection-modal', 'elite-boon-choice-modal',
            'class-select-modal', 'character-panel-modal', 'skill-panel-modal',
            'class-master-modal', 'enchanter-modal', 'jeweler-modal', 'chronicle-modal', 'awakening-modal', 'dungeon-hub-modal',
            'player-name-modal'
        ];
        for (let i = 0; i < modalIds.length; i++) {
            const el = document.getElementById(modalIds[i]);
            if (el && el.classList.contains('show')) return true;
        }
        if (this.devMode) {
            const devPanel = document.getElementById('dev-panel');
            const devCodex = document.getElementById('dev-codex-panel');
            if ((devPanel && devPanel.classList.contains('show')) ||
                (devCodex && devCodex.classList.contains('show'))) {
                return true;
            }
        }
        return false;
    }

    /** 根据当前 UI 状态同步 paused，并刷新交互键边沿检测 */
    syncGamePausedState() {
        this.paused = this.isBlockingModalOpen();
        this.lastInteractKeyState = this._getInteractKeyState();
    }

    _getInteractKeyState() {
        const KB = window.KeybindSystem;
        return KB ? KB.isActionPressed(this, 'interact') : !!this.keys['e'];
    }

    _isInteractKeyEdge(canInteract) {
        const current = this._getInteractKeyState();
        return current && !this.lastInteractKeyState && canInteract;
    }

    _commitInteractKeyEdge() {
        this.lastInteractKeyState = this._getInteractKeyState();
    }

    handleInput() {
        try {
            // 如果游戏暂停，不处理输入
            if (this.paused) {
                return;
            }

            const inCombatLab = this.currentScene === SCENE_TYPES.SKILL_LAB
                || this.currentScene === SCENE_TYPES.TRAINING;
            const castBarActive = this.player._skillCastBar
                && Date.now() < this.player._skillCastBar.endTime;
            const castingBlocksMove = this.player.isCastingSkill || castBarActive;

            // 实验场/训练场：施法条仅限制移动，不阻断普攻测试
            if (castingBlocksMove && !inCombatLab) {
                return;
            }
            
            let dx = 0;
            let dy = 0;
            
            if (!castingBlocksMove) {
            const KB = window.KeybindSystem;
            if (KB && KB.isActionPressed(this, 'moveUp')) dy -= 1;
            if (KB && KB.isActionPressed(this, 'moveDown')) dy += 1;
            if (KB && KB.isActionPressed(this, 'moveLeft')) dx -= 1;
            if (KB && KB.isActionPressed(this, 'moveRight')) dx += 1;
            
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
            
            const dashPressed = KB && KB.isActionPressed(this, 'dash');
            
            if (dashPressed && !this.player.isDashing && this.player.dashCooldown <= 0) {
                this.player.dash(dx, dy);
            }
            
            // 无论是否冲刺，都要调用move来执行移动
            // move函数内部会根据isDashing状态决定使用冲刺速度还是正常速度
            this.player.move(dx, dy);
            }
            
            const KB = window.KeybindSystem;
            const attackPressed = (KB && KB.isActionPressed(this, 'attack')) || this.mouse.left;
            if (attackPressed && !this.player.isDashing) {
                if (this.currentScene === SCENE_TYPES.TOWER && this.currentRoom && (this.currentRoom.type === ROOM_TYPES.BATTLE || this.currentRoom.type === ROOM_TYPES.ELITE || this.currentRoom.type === ROOM_TYPES.BOSS)) {
                    this.player.attack(this.currentRoom.monsters);
                } else if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) {
                    this._ensureTrainingAttackTargets();
                    this.player.attack(this.trainingGroundScene.dummies);
                } else if (this.currentScene === SCENE_TYPES.SKILL_LAB && this.skillLabScene) {
                    this._ensureSkillLabAttackTargets();
                    this.player.attack(this.skillLabScene.dummies);
                } else if (this.currentScene === SCENE_TYPES.TRIAL && this.trialScene) {
                    this.player.attack(this.trialScene.getMonsters());
                } else if (this.currentScene === SCENE_TYPES.DUNGEON && this.dungeonScene) {
                    this.player.attack(this.dungeonScene.getMonsters());
                } else if (this.currentScene === SCENE_TYPES.TOWN) {
                    // 主城无怪物，仍允许挥击（新手教程攻击步骤、练习操作）
                    this.player.attack([]);
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

    _rewardPickupOrbCount(total) {
        if (total <= 0) return 0;
        return Math.min(12, Math.max(4, 2 + Math.ceil(Math.sqrt(total))));
    }

    _splitIntRewardTotal(total, parts) {
        if (parts <= 0 || total <= 0) return [];
        const base = Math.floor(total / parts);
        let rem = total - base * parts;
        const out = [];
        for (let i = 0; i < parts; i++) {
            out.push(base + (rem > 0 ? 1 : 0));
            if (rem > 0) rem--;
        }
        return out;
    }

    /**
     * 在指定位置生成多枚金色/绿色追踪光点，玩家碰到后才 gainGold / gainExp
     * @param {number} originX
     * @param {number} originY
     * @param {number} goldAmount
     * @param {number} expAmount
     * @param {number} [spreadRadius]
     */
    spawnRewardPickupOrbs(originX, originY, goldAmount, expAmount, spreadRadius = 30) {
        if (typeof RewardHomingPickup === 'undefined') return;
        if (!this.rewardPickups) this.rewardPickups = [];
        const gold = Math.max(0, Math.floor(goldAmount || 0));
        const exp = Math.max(0, Math.floor(expAmount || 0));
        const ng = this._rewardPickupOrbCount(gold);
        const ne = this._rewardPickupOrbCount(exp);
        const goldParts = ng ? this._splitIntRewardTotal(gold, ng) : [];
        const expParts = ne ? this._splitIntRewardTotal(exp, ne) : [];
        const place = (i, n, kind, amt, color) => {
            const ang = (Math.PI * 2 * i) / Math.max(1, n) + (Math.random() * 0.55 - 0.275);
            const r = spreadRadius * (0.85 + Math.random() * 1.35) + 14;
            const px = originX + Math.cos(ang) * r;
            const py = originY + Math.sin(ang) * r;
            this.rewardPickups.push(new RewardHomingPickup(this, originX, originY, kind, amt, color, {
                outwardX: px,
                outwardY: py,
                pauseMs: 110 + Math.random() * 70,
                burstSpeed: 560,
                homeSpeed: 520
            }));
        };
        goldParts.forEach((amt, i) => place(i, goldParts.length, 'gold', amt, '#ffd700'));
        expParts.forEach((amt, i) => place(i, expParts.length, 'exp', amt, '#00ff66'));
    }

    /** 结算尚未拾取的经验/金币光点与地面装备（副本通关、离场的兜底） */
    _flushPendingCombatRewards() {
        if (this.rewardPickups && this.rewardPickups.length) {
            this.rewardPickups.forEach(p => {
                if (!p || p.amount <= 0) return;
                if (p.kind === 'gold') this.gainGold(p.amount);
                else if (p.kind === 'exp') this.gainExp(p.amount);
            });
            this.rewardPickups = [];
        }
        if (this.droppedItems && this.droppedItems.length) {
            this.droppedItems.forEach(d => {
                if (d && d.item) this.addItemToInventory(d.item, true);
            });
            this.droppedItems = [];
        }
    }

    /**
     * 触发命中反馈：近战完整卡肉，远程强反馈但不断流
     * @param {number} x
     * @param {number} y
     * @param {{isRanged?: boolean, isCrit?: boolean, target?: any, sourceX?: number, sourceY?: number, skipSound?: boolean}} options
     */
    triggerHitImpact(x, y, options = {}) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const cfg = this.hitFxConfig;
        const isRanged = options.isRanged === true;
        const isCrit = options.isCrit === true;
        const now = Date.now();
        const skipSound = options.skipSound === true;

        if (!isRanged) {
            const d = isCrit ? cfg.critHitStopMs : cfg.meleeHitStopMs;
            this.hitStopTimer = Math.max(this.hitStopTimer, d);
        }
        this._hitStopRecoveryTicks = Math.max(this._hitStopRecoveryTicks, cfg.recoverySlowTicks);
        this.hitStretchFrames = Math.max(this.hitStretchFrames, isCrit ? 1 : 0);

        const s0 = isRanged ? cfg.rangedShake : cfg.meleeShake;
        const shakeSc = isCrit ? 1 : Math.max(0.2, cfg.nonCritShakeScale != null ? cfg.nonCritShakeScale : 0.52);
        const s = {
            ampMin: s0.ampMin * shakeSc,
            ampMax: s0.ampMax * shakeSc,
            durationMs: s0.durationMs,
            bigFrames: isCrit ? s0.bigFrames : Math.max(0, (s0.bigFrames || 0) - 1)
        };
        const amp = s.ampMin + Math.random() * (s.ampMax - s.ampMin);
        this.screenShake.amplitude = Math.max(this.screenShake.amplitude, amp);
        this.screenShake.timer = Math.max(this.screenShake.timer, s.durationMs);
        this.screenShake.duration = Math.max(this.screenShake.duration, s.durationMs);
        this.screenShake.bigFrames = Math.max(this.screenShake.bigFrames, s.bigFrames);

        this.edgeDamageFlash.timer = Math.max(this.edgeDamageFlash.timer, cfg.edgeFlash.durationMs);
        this.edgeDamageFlash.duration = cfg.edgeFlash.durationMs;
        this.edgeDamageFlash.alpha = Math.min(0.9, Math.max(this.edgeDamageFlash.alpha, cfg.edgeFlash.alpha + (isCrit ? 0.08 : 0.03)));

        if (!this.hitImpactEffects) this.hitImpactEffects = [];
        if (this.hitImpactEffects.length >= 10) this.hitImpactEffects.shift();
        const ilc = (cfg.impactLines && cfg.impactLines.count) ? cfg.impactLines.count : 6;
        this.hitImpactEffects.push({
            x, y,
            createdAt: now,
            isRanged,
            isCrit,
            flash: {
                radius: cfg.flash.startR,
                alpha: 1.0,
                maxR: cfg.flash.endR,
                duration: cfg.flash.durationMs,
                elapsed: 0
            },
            warmFlash: {
                delay: cfg.flash.warmDelayMs,
                radius: cfg.flash.startR * 0.65,
                alpha: 0.88,
                maxR: cfg.flash.warmEndR,
                duration: cfg.flash.warmDurationMs,
                elapsed: 0,
                active: false
            },
            rings: [
                { color: '255,255,255', radius: cfg.ring.startR, alpha: 0.85, maxR: cfg.ring.endR, elapsed: 0, duration: cfg.ring.durationMs },
                { color: '255,210,80', radius: cfg.ring.startR + 4, alpha: 0.72, maxR: cfg.ring.endR - 6, elapsed: 0, duration: cfg.ring.durationMs },
                { color: '255,70,40', radius: cfg.ring.startR + 6, alpha: 0.62, maxR: cfg.ring.endR - 10, elapsed: 0, duration: cfg.ring.durationMs }
            ],
            impactLines: Array.from({ length: ilc }, (_, i) => ({
                angle: (Math.PI * 2 * i) / ilc,
                length: 0,
                alpha: 1
            }))
        });

        this._spawnHitExplosionParticles(x, y, isRanged, isCrit);

        const skipEnemyKnock = options.skipEnemyKnock === true
            || (options.allowEnemyKnock !== true && !(options.knockForce > 0));
        this._applyEnemyHitReaction(options.target, options.sourceX, options.sourceY, isRanged, skipEnemyKnock, options);
        if (!skipSound) {
            this.playHitSound(isRanged ? 'ranged' : 'melee', isCrit);
        }
        this._lastHitImpactVfxTime = now;
    }

    _spawnHitExplosionParticles(x, y, isRanged, isCrit) {
        if (!this.particleManager || typeof this.particleManager.createSystem !== 'function') return;
        const pcfg = this.hitFxConfig.particles;
        const baseCount = isRanged ? pcfg.ranged : pcfg.melee;
        const weakSc = this.hitFxConfig.nonCritParticleScale != null ? this.hitFxConfig.nonCritParticleScale : 0.38;
        let count;
        if (isCrit) {
            count = Math.floor(baseCount * 2);
        } else {
            count = Math.max(10, Math.floor(baseCount * weakSc));
        }
        this.particleManager.createSystem(x, y, {
            color: '#ffffff',
            size: 2.6,
            count: Math.floor(count * 0.42),
            lifetime: 220,
            fadeoutTime: 160,
            speed: 12,
            speedVariation: 5,
            angleSpread: Math.PI * 2,
            pixelStyle: true
        });
        this.particleManager.createSystem(x, y, {
            color: '#ff6622',
            size: 3,
            count: Math.floor(count * 0.4),
            lifetime: 420,
            fadeoutTime: 220,
            speed: 10,
            speedVariation: 4,
            gravity: 0.65,
            angleSpread: Math.PI * 2,
            pixelStyle: true
        });
        this.particleManager.createSystem(x, y, {
            color: '#1a1a1a',
            size: 3.2,
            count: Math.floor(count * 0.24),
            lifetime: 520,
            fadeoutTime: 320,
            speed: 5.6,
            speedVariation: 2.2,
            gravity: -0.06,
            angleSpread: Math.PI * 2,
            pixelStyle: true
        });
    }

    _applyEnemyHitReaction(target, sourceX, sourceY, isRanged, skipEnemyKnock, options) {
        if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') return;
        const now = Date.now();
        const cfg = this.hitFxConfig.enemyKnock;
        const opts = options || {};
        if (!skipEnemyKnock) {
            const knock = opts.knockForce > 0 ? opts.knockForce : (isRanged ? cfg.ranged : cfg.melee);
            const sx = Number.isFinite(sourceX) ? sourceX : (this.player ? this.player.x : target.x - 1);
            const sy = Number.isFinite(sourceY) ? sourceY : (this.player ? this.player.y : target.y);
            const dx = target.x - sx;
            const dy = target.y - sy;
            const dist = Math.hypot(dx, dy) || 1;
            target.x += (dx / dist) * knock;
            target.y += (dy / dist) * knock;
        }
        target._hitFlashUntil = now + cfg.flashMs;
        target._hitStunUntil = now + (isRanged ? cfg.rangedStunMs : cfg.stunMs);
    }

    playHitSound(kind = 'melee', isCrit = false) {
        // 预留接口：可在此叠加“重击/骨裂”音效资源
        if (!this.soundManager) return;
        if (typeof this.soundManager.playSound === 'function') {
            this.soundManager.playSound(isCrit ? 'critical' : 'swing');
            if (kind === 'melee' && isCrit) this.soundManager.playSound('swing');
        }
    }

    updateHitImpactEffects(deltaTime) {
        const frameScale = Math.max(0.5, deltaTime / (1000 / 60));
        if (this.screenShake.timer > 0) {
            this.screenShake.timer = Math.max(0, this.screenShake.timer - deltaTime);
            if (this.screenShake.timer <= 0) {
                this.screenShake.amplitude = 0;
                this.screenShake.bigFrames = 0;
            } else if (this.screenShake.bigFrames > 0) {
                this.screenShake.bigFrames--;
            } else {
                this.screenShake.amplitude *= Math.pow(0.85, frameScale);
            }
        }
        if (this.edgeDamageFlash.timer > 0) {
            this.edgeDamageFlash.timer = Math.max(0, this.edgeDamageFlash.timer - deltaTime);
            const t = this.edgeDamageFlash.timer / Math.max(1, this.edgeDamageFlash.duration);
            this.edgeDamageFlash.alpha = Math.max(0, this.edgeDamageFlash.alpha * Math.pow(0.78, frameScale) * t);
        }
        if (!this.hitImpactEffects || this.hitImpactEffects.length === 0) return;
        this.hitImpactEffects = this.hitImpactEffects.filter(e => {
            e.flash.elapsed += deltaTime;
            const fp = Math.min(1, e.flash.elapsed / e.flash.duration);
            e.flash.radius = e.flash.maxR * fp + e.flash.radius * (1 - fp);
            e.flash.alpha = 1 - fp;
            if (!e.warmFlash.active) {
                e.warmFlash.delay -= deltaTime;
                if (e.warmFlash.delay <= 0) e.warmFlash.active = true;
            } else {
                e.warmFlash.elapsed += deltaTime;
                const wp = Math.min(1, e.warmFlash.elapsed / e.warmFlash.duration);
                e.warmFlash.radius = e.warmFlash.maxR * wp + e.warmFlash.radius * (1 - wp);
                e.warmFlash.alpha = 0.88 * (1 - wp);
            }
            e.rings.forEach(r => {
                r.elapsed += deltaTime;
                const rp = Math.min(1, r.elapsed / r.duration);
                r.radius = this.hitFxConfig.ring.startR + (r.maxR - this.hitFxConfig.ring.startR) * rp;
                r.alpha = Math.max(0, r.alpha * Math.pow(0.86, frameScale));
            });
            const ilCfg = this.hitFxConfig.impactLines || { speedPerFrame: 4, maxLength: 28, decay: 0.85 };
            if (e.impactLines && e.impactLines.length) {
                e.impactLines.forEach(line => {
                    line.length = Math.min(ilCfg.maxLength, line.length + ilCfg.speedPerFrame * frameScale);
                    line.alpha *= Math.pow(ilCfg.decay, frameScale);
                });
            }
            const ringAlive = e.rings.some(r => r.alpha > 0.03);
            const linesAlive = e.impactLines && e.impactLines.some(l => l.alpha > 0.03 && l.length > 0.5);
            return e.flash.alpha > 0.03 || e.warmFlash.alpha > 0.03 || ringAlive || linesAlive;
        });
    }

    drawHitImpactEffects(ctx) {
        if (!this.hitImpactEffects || this.hitImpactEffects.length === 0) return;
        this.hitImpactEffects.forEach(e => {
            ctx.save();
            const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.flash.radius);
            grad.addColorStop(0, `rgba(255,255,255,${Math.max(0, e.flash.alpha)})`);
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.flash.radius, 0, Math.PI * 2);
            ctx.fill();
            if (e.warmFlash.alpha > 0) {
                const wgrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.warmFlash.radius);
                wgrad.addColorStop(0, `rgba(255,180,60,${Math.max(0, e.warmFlash.alpha)})`);
                wgrad.addColorStop(1, 'rgba(255,80,10,0)');
                ctx.fillStyle = wgrad;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.warmFlash.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            e.rings.forEach((r, idx) => this._drawPixelRing(ctx, e.x, e.y, r.radius, `rgba(${r.color},${r.alpha})`, idx));
            if (e.impactLines && e.impactLines.length) {
                ctx.lineWidth = 2;
                e.impactLines.forEach(line => {
                    if (line.alpha <= 0.02 || line.length < 0.5) return;
                    const x2 = e.x + Math.cos(line.angle) * line.length;
                    const y2 = e.y + Math.sin(line.angle) * line.length;
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(x2, y2);
                    ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, line.alpha)})`;
                    ctx.stroke();
                });
            }
            ctx.restore();
        });
    }

    _drawPixelRing(ctx, cx, cy, radius, color, jagSeed) {
        const seg = 20;
        ctx.beginPath();
        for (let i = 0; i <= seg; i++) {
            const t = i / seg;
            const a = t * Math.PI * 2;
            const j = ((i + jagSeed * 3) % 2 === 0 ? 2.4 : -2.4);
            const r = radius + j;
            const x = Math.floor(cx + Math.cos(a) * r);
            const y = Math.floor(cy + Math.sin(a) * r);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawMonsterHitFlashOverlay(ctx) {
        if (!this.currentRoom || !Array.isArray(this.currentRoom.monsters)) return;
        const now = Date.now();
        this.currentRoom.monsters.forEach(m => {
            if (!m || m.hp <= 0 || !m._hitFlashUntil || now >= m._hitFlashUntil) return;
            const life = Math.max(0, (m._hitFlashUntil - now) / 120);
            const size = (m.size || 22) + 10;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.45 * life})`;
            ctx.fillRect(Math.floor(m.x - size / 2), Math.floor(m.y - size / 2), Math.floor(size), Math.floor(size));
            ctx.restore();
        });
    }

    drawEdgeDamageFlash(ctx) {
        if (!this.edgeDamageFlash || this.edgeDamageFlash.alpha <= 0 || this.edgeDamageFlash.timer <= 0) return;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.save();
        ctx.fillStyle = `rgba(140,10,10,${Math.min(0.9, this.edgeDamageFlash.alpha)})`;
        const edge = 52;
        ctx.fillRect(0, 0, w, edge);
        ctx.fillRect(0, h - edge, w, edge);
        ctx.fillRect(0, edge, edge, h - edge * 2);
        ctx.fillRect(w - edge, edge, edge, h - edge * 2);
        ctx.restore();
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
                this.lastInteractKeyState = window.KeybindSystem
            ? window.KeybindSystem.isActionPressed(this, 'interact')
            : !!this.keys['e'];
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
                this.maybeAutoSyncSaveCodeToLocalStorage(false);
                return;
            }
            
            // 更新玩家
            this.handleInput();
            this.updateWeaponSkillAimState();
            this.updateClassSkillAimState();
            if (typeof window.tickTutorialProgress === 'function') {
                window.tickTutorialProgress(this);
            }
            if (typeof window.tickPlayerClassResource === 'function') {
                const inCombat = this.currentScene === SCENE_TYPES.TOWER || this.currentScene === SCENE_TYPES.TRAINING || this.currentScene === SCENE_TYPES.SKILL_LAB || this.currentScene === SCENE_TYPES.TRIAL || this.currentScene === SCENE_TYPES.DUNGEON;
                window.tickPlayerClassResource(this.player, this.fixedTimeStep / 1000, inCombat);
            }
            if (typeof window.tickBuildPassive === 'function') {
                window.tickBuildPassive(this.player, this.fixedTimeStep / 1000, this);
            }
            
            const now = Date.now();
            const timeSinceTransition = now - this.lastSceneTransitionTime;
            const canInteract = timeSinceTransition >= 3000; // 3秒冷却
            const interactPressed = this._isInteractKeyEdge(canInteract);
            
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
            this.particleManager.update(deltaTime);            this.lastFrameTime = performance.now();
            
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
                } else if (this.currentScene === SCENE_TYPES.SKILL_LAB && this.skillLabScene) {
                    targets = this.skillLabScene.dummies;
                } else if (this.currentScene === SCENE_TYPES.TRIAL && this.trialScene) {
                    targets = this.trialScene.getMonsters();
                } else if (this.currentScene === SCENE_TYPES.DUNGEON && this.dungeonScene) {
                    targets = this.dungeonScene.getMonsters();
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
                        if (isDummy) monster._pendingDamageSource = 'basic';
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
            
            // 星辰套装等：战斗中每秒恢复（V2 暂无此类 periodic，保留兼容旧 special 名）
            if (this.player.setSpecialEffects) {
                for (const [setId, setEffect] of Object.entries(this.player.setSpecialEffects)) {
                const setData = typeof resolveSetDefinition === 'function'
                    ? resolveSetDefinition(setId) : null;
                if (!setData) continue;
                
                const effect = setData.effects[String(setEffect.pieceCount)] || setData.effects[setEffect.pieceCount];
                if (
                    effect &&
                    effect.special === 'starRegen' &&
                    (setEffect.pieceCount === 8 || setEffect.pieceCount === 4)
                ) {
                    const now = Date.now();
                    if (!this.player.lastStarUltimateHeal) this.player.lastStarUltimateHeal = 0;
                    if (now - this.player.lastStarUltimateHeal >= 1000) {
                        let pct = 0.01;
                        if (typeof effect.starRegenPercent === 'number' && effect.starRegenPercent > 0) {
                            pct = effect.starRegenPercent;
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

            if (this.player.setSpecialEffects && typeof this.player.tickOblivionExecuteSweep === 'function') {
                this.player.tickOblivionExecuteSweep(this);
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
            if (this.classUI) this.classUI.updateStatusBuffs();
            
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
            } else if (this.currentScene === SCENE_TYPES.SKILL_LAB) {
                this.updateSkillLab();
                const interactions = this.skillLabScene.checkInteraction(this.player);
                this.currentInteraction = interactions.length > 0 ? {
                    type: 'portal',
                    object: interactions[0],
                    x: interactions[0].x,
                    y: interactions[0].y - interactions[0].size / 2 - 30
                } : null;
            } else if (this.currentScene === SCENE_TYPES.TRIAL) {
                this.updateTrial();
                const interactions = this.trialScene.checkInteraction(this.player);
                this.currentInteraction = interactions.length > 0 ? {
                    type: 'portal',
                    object: interactions[0],
                    x: interactions[0].x,
                    y: interactions[0].y - interactions[0].size / 2 - 30
                } : null;
            } else if (this.currentScene === SCENE_TYPES.DUNGEON) {
                this.updateDungeon();
                const interactions = this.dungeonScene.checkInteraction(this.player);
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
                    if (typeof window.updateSkillEntities === 'function') {
                        window.updateSkillEntities(this, this.currentRoom.monsters, deltaTime / 1000);
                    }
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
                    return !item.update(this, interactPressed); // 靠近后按 E 才会尝试拾取
                });

                if (this.rewardPickups && this.rewardPickups.length && this.player) {
                    const dt = this.fixedTimeStep;
                    this.rewardPickups = this.rewardPickups.filter(p => !p.update(dt, this.player));
                }
            
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
                        this.openEliteBoonChoiceModal();
                    } else if (!this.demonInterferenceActive) {
                        if (this.currentScene === SCENE_TYPES.TOWER && Math.random() < this.demonInterferenceTriggerChance) {
                            this.startDemonInterference();
                        } else {
                            this.generatePortals();
                        }
                    }
                }
                
                // 检查传送门交互（需要按E键）- 适用于所有房间类型
                if (this.portals.length > 0 && !this.isTransitioning && interactPressed) {
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
                
                if (distance < 50 && !this.currentRoom.treasureChest.opened && interactPressed) {
                    this.currentRoom.treasureChest.opened = true;
                    // 播放开宝箱音效
                    if (this.soundManager) {
                        this.soundManager.playSound('treasure');
                    }
                    // 给予奖励：程序化装备，品质与层数档位一致
                    const chestQuality = this.currentRoom.treasureChest.quality;
                    const tierLevels = typeof getEquipmentDropTierLevelsForTowerFloor === 'function'
                        ? getEquipmentDropTierLevelsForTowerFloor(this.floor)
                        : [1, 5, 10, 15, 20];
                    const dropLevel = tierLevels.length
                        ? tierLevels[Math.floor(Math.random() * tierLevels.length)]
                        : Math.max(1, this.floor * 2);
                    const rawEq = window.EquipmentCodex && window.EquipmentCodex.generateLootEquipment
                        ? window.EquipmentCodex.generateLootEquipment({
                            quality: chestQuality,
                            monsterLevel: dropLevel,
                            monsterTier: chestQuality === 'legendary' || chestQuality === 'mythic' ? 'boss' : 'elite',
                            playerClass: typeof window.getPlayerBaseClassId === 'function'
                                ? window.getPlayerBaseClassId(this.player.classData) : null
                        })
                        : null;
                    
                    if (rawEq) {
                        const rewardEq = window.EquipmentCodex && window.EquipmentCodex.cloneEquipmentForGrant
                            ? window.EquipmentCodex.cloneEquipmentForGrant(rawEq)
                            : new Equipment({
                                id: rawEq.id,
                                name: rawEq.name,
                                slot: rawEq.slot,
                                weaponType: rawEq.weaponType,
                                quality: rawEq.quality,
                                level: rawEq.level,
                                stats: JSON.parse(JSON.stringify(rawEq.baseStats || rawEq.stats || {})),
                                baseTypeId: rawEq.baseTypeId,
                                prefixes: rawEq.prefixes || [],
                                suffixes: rawEq.suffixes || [],
                                legendaryPowers: rawEq.legendaryPowers || [],
                                setId: rawEq.setId,
                                procedural: true,
                                refineLevel: 0,
                                enhanceLevel: 0
                            });
                        if (!rewardEq.uniqueId) {
                            rewardEq.uniqueId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                        }
                        const dropX = this.currentRoom.treasureChest.x + (Math.random() * 20 - 10);
                        const dropY = this.currentRoom.treasureChest.y + 30 + (Math.random() * 16 - 8);
                        if (typeof DroppedItem !== 'undefined') {
                            this.droppedItems.push(new DroppedItem(dropX, dropY, rewardEq, this));
                            this.addFloatingText(dropX, dropY, '宝箱掉落了装备（按 E 拾取）', '#ffd700');
                        } else {
                            // 兜底：极端情况下仍可直接入包，避免奖励丢失
                            this.addItemToInventory(rewardEq);
                        }
                    }
                    
                    const goldAmount = 50 + this.floor * 12;
                    const expAmount = 40 + this.floor * 10;
                    const cx = this.currentRoom.treasureChest.x;
                    const cy = this.currentRoom.treasureChest.y;
                    this.spawnRewardPickupOrbs(cx, cy, goldAmount, expAmount, 36);
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
                if (this.portals.length > 0 && !this.isTransitioning && interactPressed) {
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
                
                if (distance < 50 && !this.currentRoom.restItem.used && interactPressed) {
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
                if (this.portals.length > 0 && !this.isTransitioning && interactPressed) {
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
                if (interactPressed && Math.sqrt(dx * dx + dy * dy) < 95 && !this.currentRoom.cleared) {
                    this.openGapShopModal();
                }
                if (this.portals.length > 0 && !this.isTransitioning && interactPressed) {
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

            this._commitInteractKeyEdge();
            
            this.updateHUD();
            this.maybeAutoSyncSaveCodeToLocalStorage(false);
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
        const interactPressed = this._isInteractKeyEdge(canInteract); // 检测按键按下事件，且不在冷却期内
        
        if (interactions.length > 0 && interactPressed) {
            const building = interactions[0];
            const handlers = {
                tower_entrance: () => this.enterTower(),
                blacksmith: () => this.openBlacksmith(),
                shop: () => this.openShop(),
                training_ground: () => this.enterTrainingGround(),
                class_master: () => this.npcUI && this.npcUI.openClassMaster(),
                skill_trainer: () => this.npcUI && this.npcUI.openSkillTrainer(),
                enchanter: () => this.npcUI && this.npcUI.openEnchanter(),
                jeweler: () => this.npcUI && this.npcUI.openJeweler(),
                chronicle_stone: () => this.npcUI && this.npcUI.openChronicle(),
                awakening_gate: () => this.npcUI && this.npcUI.openAwakeningGate(),
                material_realm: () => this.npcUI && this.npcUI.openMaterialRealm()
            };
            const fn = handlers[building.type];
            if (fn) {
                fn();
                if (typeof window.notifyTutorialEvent === 'function') {
                    window.notifyTutorialEvent(this, 'building_interact', { building: building.type });
                }
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
        if (this.currentScene === SCENE_TYPES.SKILL_LAB && this.skillLabScene) {
            return this.skillLabScene.dummies || [];
        }
        if (this.currentScene === SCENE_TYPES.TRIAL && this.trialScene) {
            return this.trialScene.getMonsters();
        }
        if (this.currentScene === SCENE_TYPES.DUNGEON && this.dungeonScene) {
            return this.dungeonScene.getMonsters();
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
        
        const escSaveBrowserBtn = document.getElementById('esc-menu-save-browser-btn');
        if (escSaveBrowserBtn) {
            escSaveBrowserBtn.addEventListener('click', () => {
                this.closeEscMenu();
                this.saveGameToBrowserStorage();
            });
        }
        
        document.getElementById('esc-menu-import-btn').addEventListener('click', () => {
            this.closeEscMenu();
            this.showImportSaveModal();
        });

        const escClearSaveBtn = document.getElementById('esc-menu-clear-save-btn');
        if (escClearSaveBtn) {
            escClearSaveBtn.addEventListener('click', () => {
                this.closeEscMenu();
                this.clearSave();
            });
        }
        
        document.getElementById('esc-menu-exit-tower-btn').addEventListener('click', () => {
            this.closeEscMenu();
            this.showTowerExitConfirm();
        });
        
        document.getElementById('esc-menu-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeEscMenu();
        });

        this.initEscMenuTabs();
        
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
     * ESC 菜单内：背景音乐 / 音效主音量滑块（写入 localStorage，与 SoundManager 主音量相乘）
     */
    initVolumeSettingsUI() {
        if (this._volumeSettingsUiBound) return;
        const musicSlider = document.getElementById('settings-music-volume');
        const musicLabel = document.getElementById('settings-music-volume-value');
        const sfxSlider = document.getElementById('settings-sfx-volume');
        const sfxLabel = document.getElementById('settings-sfx-volume-value');
        if (!musicSlider || !sfxSlider || !this.soundManager) return;
        this._volumeSettingsUiBound = true;

        const syncSlidersFromManager = () => {
            const sm = this.soundManager;
            musicSlider.value = String(Math.round(sm.masterMusicVolume * 100));
            sfxSlider.value = String(Math.round(sm.masterSfxVolume * 100));
            if (musicLabel) musicLabel.textContent = musicSlider.value + '%';
            if (sfxLabel) sfxLabel.textContent = sfxSlider.value + '%';
        };
        syncSlidersFromManager();

        const onMusicInput = () => {
            const pct = parseInt(musicSlider.value, 10);
            const v = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) : 1;
            this.soundManager.setMasterMusicVolume(v);
            if (musicLabel) musicLabel.textContent = musicSlider.value + '%';
            this.soundManager.saveVolumePrefsToStorage();
        };
        const onSfxInput = () => {
            const pct = parseInt(sfxSlider.value, 10);
            const v = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) : 1;
            this.soundManager.setMasterSfxVolume(v);
            if (sfxLabel) sfxLabel.textContent = sfxSlider.value + '%';
            this.soundManager.saveVolumePrefsToStorage();
        };
        musicSlider.addEventListener('input', onMusicInput);
        sfxSlider.addEventListener('input', onSfxInput);
        this._syncVolumeSlidersFromManager = syncSlidersFromManager;
    }

    /**
     * ESC 菜单分页切换
     */
    initEscMenuTabs() {
        const modal = document.getElementById('esc-menu-modal');
        if (!modal || modal.dataset.tabsInited) return;
        modal.dataset.tabsInited = '1';

        const tabs = modal.querySelectorAll('.esc-menu-tab');
        const panels = modal.querySelectorAll('.esc-menu-tab-panel');
        const switchTab = (tabId) => {
            tabs.forEach(tab => {
                const active = tab.dataset.escTab === tabId;
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            panels.forEach(panel => {
                panel.classList.toggle('active', panel.dataset.escPanel === tabId);
            });
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.stopPropagation();
                switchTab(tab.dataset.escTab);
            });
        });

        this._switchEscMenuTab = switchTab;
    }

    /**
     * 显示ESC菜单
     */
    showEscMenu() {
        const modal = document.getElementById('esc-menu-modal');
        if (modal) {
            modal.classList.add('show');
            modal.style.display = '';
            this.paused = true;

            if (typeof this._syncVolumeSlidersFromManager === 'function') {
                this._syncVolumeSlidersFromManager();
            }
            if (typeof this._switchEscMenuTab === 'function') {
                this._switchEscMenuTab('basic');
            }
            if (window.KeybindSystem && typeof window.KeybindSystem.renderAllSettingsLists === 'function') {
                window.KeybindSystem.renderAllSettingsLists();
            }

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
            modal.style.display = '';
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
     * 进入转职试炼
     * @param {'first'|'second'} kind
     * @param {string} targetId - 一转 id 或二转 id
     */
    enterTrial(kind, targetId) {
        let check;
        if (kind === 'first') {
            check = window.canStartFirstJobTrial(this.player, targetId);
        } else {
            check = window.canStartSecondJobTrial(this.player, targetId);
        }
        if (!check.ok) {
            this.addFloatingText(this.player.x, this.player.y, check.message || '无法进入试炼', '#ff6666');
            return false;
        }
        const trial = check.trial;
        if (!trial || !trial.bossId) {
            this.addFloatingText(this.player.x, this.player.y, '试炼配置缺失', '#ff6666');
            return false;
        }
        if (this.npcUI) this.npcUI.closeAll();
        this.activeTrial = {
            kind,
            targetId,
            bossId: trial.bossId,
            title: trial.title,
            hint: trial.hint
        };
        this.transitionScene(SCENE_TYPES.TRIAL);
        this.trialScene.spawnBoss(trial.bossId, trial);
        this.player.x = CONFIG.CANVAS_WIDTH / 2;
        this.player.y = CONFIG.CANVAS_HEIGHT - 120;
        this.monsterProjectiles = [];
        this.groundHazards = [];
        this.pendingMonsterAoE = [];
        document.getElementById('room-type').textContent = trial.title || '试炼';
        document.getElementById('floor-number').textContent = '—';
        this.addFloatingText(this.player.x, this.player.y, '试炼开始！', '#c8a2ff', 2500, 16, true);
        return true;
    }

    /**
     * 更新试炼场景
     */
    updateTrial() {
        if (!this.trialScene) return;
        const now = Date.now();
        const timeSinceTransition = now - this.lastSceneTransitionTime;
        const canInteract = timeSinceTransition >= 3000;
        const interactPressed = this._isInteractKeyEdge(canInteract);

        const interactions = this.trialScene.checkInteraction(this.player);
        if (interactions.length > 0 && interactPressed) {
            this.abortTrial();
            return;
        }

        this.trialScene.update(this.player);
        const monsters = this.trialScene.getMonsters();
        let playerDied = false;
        monsters.forEach(monster => {
            if (monster.hp > 0 && monster.attack(this.player)) {
                const md = (monster._pendingMeleeDamageMult != null && monster._pendingMeleeDamageMult > 0)
                    ? monster._pendingMeleeDamageMult : 1;
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
        if (typeof window.updateSkillEntities === 'function') {
            window.updateSkillEntities(this, monsters, this.fixedTimeStep / 1000);
        }
        this.updateMonsterProjectiles();
        if (playerDied || this.isPlayerDead) {
            this.onTrialDefeat();
        }
    }

    onTrialVictory() {
        if (!this.activeTrial) return;
        const res = window.applyTrialVictory(this);
        const name = res.ok ? (res.name || '') : (res.message || '试炼完成');
        this.addFloatingText(this.player.x, this.player.y, res.ok ? ('试炼成功：' + name) : name, res.ok ? '#88ff88' : '#ff6666', 3500, 16, true);
        if (res.ok) {
            if (typeof this.updateHUD === 'function') this.updateHUD();
            if (this.classUI) this.classUI.updateAll();
        }
        setTimeout(() => {
            this.returnToTown();
            document.getElementById('room-type').textContent = '主城';
            document.getElementById('floor-number').textContent = '准备中';
        }, 1200);
    }

    onTrialDefeat() {
        this.addFloatingText(this.player.x, this.player.y, '试炼失败', '#ff4444', 2500, 16, true);
        this.activeTrial = null;
        this.isPlayerDead = false;
        this.player.hp = Math.max(1, Math.floor(this.player.maxHp * 0.3));
        setTimeout(() => {
            this.returnToTown();
            document.getElementById('room-type').textContent = '主城';
            document.getElementById('floor-number').textContent = '准备中';
        }, 800);
    }

    abortTrial() {
        this.addFloatingText(this.player.x, this.player.y, '已放弃试炼', '#ffaa66');
        this.activeTrial = null;
        this.returnToTown();
        document.getElementById('room-type').textContent = '主城';
        document.getElementById('floor-number').textContent = '准备中';
    }

    /**
     * 进入材料秘境 / 副本
     */
    enterDungeon(dungeonId, tierId) {
        const check = window.canEnterDungeon(this.player, dungeonId, tierId);
        if (!check.ok) {
            this.addFloatingText(this.player.x, this.player.y, check.message || '无法进入', '#ff6666');
            return false;
        }
        const def = check.def;
        const tier = check.tier;
        window.consumeDungeonAttempt(this.player, def);
        if (this.dungeonUI) this.dungeonUI.close();
        if (this.npcUI) this.npcUI.closeAll();
        this.activeDungeon = { def, tier, dungeonId, tierId };
        this.transitionScene(SCENE_TYPES.DUNGEON);
        if (this.dungeonScene) this.dungeonScene.initRun(def, tier);
        this.player.x = CONFIG.CANVAS_WIDTH / 2;
        this.player.y = CONFIG.CANVAS_HEIGHT - 120;
        this.player._dungeonNoHeal = !!def.noHeal;
        this.monsterProjectiles = [];
        this.groundHazards = [];
        this.pendingMonsterAoE = [];
        this.droppedItems = [];
        this.rewardPickups = [];
        const roomTypeEl = document.getElementById('room-type');
        const floorEl = document.getElementById('floor-number');
        if (roomTypeEl) roomTypeEl.textContent = def.name;
        if (floorEl) floorEl.textContent = tier.name || '—';
        this.addFloatingText(this.player.x, this.player.y, def.name + ' 开始！', '#88ccff', 2500, 16, true);
        return true;
    }

    updateDungeon() {
        if (!this.dungeonScene) return;
        const now = Date.now();
        const timeSinceTransition = now - this.lastSceneTransitionTime;
        const canInteract = timeSinceTransition >= 3000;
        const interactPressed = this._isInteractKeyEdge(canInteract);

        const interactions = this.dungeonScene.checkInteraction(this.player);
        if (interactions.length > 0 && interactPressed) {
            this.abortDungeon();
            return;
        }

        this.dungeonScene.update(this.player);

        this.dungeonScene.monsters.forEach(m => {
            if (m && m.hp <= 0 && !m._dungeonKillNotified) {
                m._dungeonKillNotified = true;
                this.dungeonScene.notifyKilled(m);
            }
        });

        const monsters = this.dungeonScene.getMonsters();
        let playerDied = false;
        monsters.forEach(monster => {
            if (monster.hp > 0 && monster.attack(this.player)) {
                const md = (monster._pendingMeleeDamageMult != null && monster._pendingMeleeDamageMult > 0)
                    ? monster._pendingMeleeDamageMult : 1;
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
        if (typeof window.updateSkillEntities === 'function') {
            window.updateSkillEntities(this, monsters, this.fixedTimeStep / 1000);
        }
        this.updateMonsterProjectiles();

        // 地面掉落：经验/金币光点自动吸附，装备靠近后按 E 拾取（与恶魔塔一致）
        this.droppedItems = this.droppedItems.filter(item => {
            return !item.update(this, interactPressed);
        });
        if (this.rewardPickups && this.rewardPickups.length && this.player) {
            const dt = this.fixedTimeStep;
            this.rewardPickups = this.rewardPickups.filter(p => !p.update(dt, this.player));
        }

        if (this.dungeonScene.isComplete()) {
            this.onDungeonVictory();
            return;
        }
        if (playerDied || this.isPlayerDead) {
            this.onDungeonDefeat();
        }
    }

    onDungeonVictory() {
        if (!this.activeDungeon || !this.dungeonScene) return;
        this._flushPendingCombatRewards();
        const stats = this.dungeonScene.getRunStats();
        const run = Object.assign({
            def: this.activeDungeon.def,
            tier: this.activeDungeon.tier,
            eliteCleared: this.dungeonScene.eliteCleared,
            abyssGateCleared: this.dungeonScene.abyssGateCleared,
            wavesReached: stats.wavesReached,
            fullClear: stats.fullClear,
            trialTowerFloor: stats.trialTowerFloor,
            rewardMult: stats.rewardMult,
            elapsedMs: stats.elapsedMs
        }, stats);
        const granted = window.buildDungeonVictoryRewards(this, run);
        const summary = window.formatGrantedRewards(granted);
        let msg = '副本通关！';
        if (run.speedRank === 'S') msg += ' S级速通！';
        if (summary && summary !== '无') msg += ' ' + summary;
        this.addFloatingText(this.player.x, this.player.y, msg, '#88ff88', 4000, 15, true);
        if (this.activeDungeon.def.id === 'trial_tower' && stats.trialTowerFloor) {
            window.ensurePlayerDungeonProgress(this.player);
            const best = this.player.dungeonProgress.trialTowerBestFloor || 0;
            if (stats.trialTowerFloor > best) {
                this.player.dungeonProgress.trialTowerBestFloor = stats.trialTowerFloor;
            }
        }
        this.activeDungeon = null;
        this.player._dungeonNoHeal = false;
        if (this.dungeonScene) this.dungeonScene.reset();
        if (typeof this.updateHUD === 'function') this.updateHUD();
        setTimeout(() => {
            this.returnToTown();
            const roomTypeEl = document.getElementById('room-type');
            const floorEl = document.getElementById('floor-number');
            if (roomTypeEl) roomTypeEl.textContent = '主城';
            if (floorEl) floorEl.textContent = '准备中';
        }, 1400);
    }

    onDungeonDefeat() {
        this.addFloatingText(this.player.x, this.player.y, '副本失败', '#ff4444', 2500, 16, true);
        this.activeDungeon = null;
        this.player._dungeonNoHeal = false;
        this.isPlayerDead = false;
        this.player.hp = Math.max(1, Math.floor(this.player.maxHp * 0.3));
        if (this.dungeonScene) this.dungeonScene.reset();
        setTimeout(() => {
            this.returnToTown();
            const roomTypeEl = document.getElementById('room-type');
            const floorEl = document.getElementById('floor-number');
            if (roomTypeEl) roomTypeEl.textContent = '主城';
            if (floorEl) floorEl.textContent = '准备中';
        }, 800);
    }

    abortDungeon() {
        this.addFloatingText(this.player.x, this.player.y, '已放弃副本', '#ffaa66');
        this.activeDungeon = null;
        this.player._dungeonNoHeal = false;
        if (this.dungeonScene) this.dungeonScene.reset();
        this.returnToTown();
        const roomTypeEl = document.getElementById('room-type');
        const floorEl = document.getElementById('floor-number');
        if (roomTypeEl) roomTypeEl.textContent = '主城';
        if (floorEl) floorEl.textContent = '准备中';
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

    /** 技能实验场：重置玩家战斗/位移残留，避免冲锋、隐身、场效污染场景 */
    resetSkillLabCombatState() {
        const p = this.player;
        if (!p) return;

        p.isCastingSkill = false;
        p._skillCastBar = null;
        p.isDashing = false;
        p._chargeSuperArmor = false;
        p.dashGhosts = [];
        p.dashBrightness = 0;
        p.dashCompression = 0;
        p.vx = 0;
        p.vy = 0;

        delete p._pierceDash;
        delete p._leapSlam;
        delete p._backstepShot;
        delete p._backstepVisualOffset;
        delete p._leapSlamVisualOffset;
        delete p._shadowRaidReturn;
        delete p._midnightRaidFinalSlash;
        delete p._stealthUntil;

        if (Array.isArray(p.buffs)) {
            p.buffs = p.buffs.filter(b => !b || !b.stealth);
        }

        if (typeof window.clearAssassinCombatState === 'function') {
            window.clearAssassinCombatState(p);
        }
        if (typeof window.clearAssassinBranchState === 'function') {
            window.clearAssassinBranchState(p);
        }
        if (typeof window.clearPlayerSkillWorldEntities === 'function') {
            window.clearPlayerSkillWorldEntities(this);
        }

        this.equipmentEffects = [];
        this._syncSkillLabCamera();
        if (typeof p.updateStats === 'function') p.updateStats();
    }

    /** 将技能实验场相机与玩家世界坐标对齐（玩家始终在屏幕中心） */
    _syncSkillLabCamera() {
        if (!this.player) return;
        this.cameraX = this.player.x - CONFIG.CANVAS_WIDTH / 2;
        this.cameraY = this.player.y - CONFIG.CANVAS_HEIGHT / 2;
    }

    /** 在屏幕中心附近生成默认训练假人 */
    spawnSkillLabDefaultDummies() {
        if (!this.skillLabScene || !this.player) return;
        const cx = CONFIG.CANVAS_WIDTH / 2;
        const cy = CONFIG.CANVAS_HEIGHT / 2;
        this.player.x = cx;
        this.player.y = cy;
        this._syncSkillLabCamera();
        this.skillLabScene.clearAllDummies();
        // 贴近近战普攻射程（约 50–70），避免一进场就打空
        this.skillLabScene.addDummy(cx + 52, cy, { invincible: true, chasePlayer: false });
        this.skillLabScene.addDummy(cx - 48, cy + 42, { invincible: true, chasePlayer: false });
        this.skillLabScene.addDummy(cx, cy - 50, { invincible: true, chasePlayer: false });
    }

    /**
     * 开发者：进入技能实验场景
     */
    enterSkillLab() {
        const devPanel = document.getElementById('dev-panel');
        const devCodex = document.getElementById('dev-codex-panel');
        if (devPanel) devPanel.classList.remove('show');
        if (devCodex) devCodex.classList.remove('show');
        this.devMode = false;

        this._saveSkillLabReturnState();
        this.transitionScene(SCENE_TYPES.SKILL_LAB);

        this.player.hp = this.player.maxHp;
        this.resetSkillLabCombatState();
        this.spawnSkillLabDefaultDummies();

        if (this.skillLabUI) {
            this.skillLabUI.open();
            this.skillLabUI.applyDefaults();
        } else {
            this.syncGamePausedState();
        }

        this.addFloatingText(this.player.x, this.player.y, '已进入技能实验场', '#88ccff');
    }

    /** 离开技能实验场（恢复进入前状态） */
    exitSkillLab() {
        this.returnToTown();
    }

    _saveSkillLabReturnState() {
        if (!this.player) return;
        const p = this.player;
        this._skillLabReturnState = {
            classData: p.classData ? JSON.parse(JSON.stringify(p.classData)) : null,
            level: p.level,
            classResource: p.classResource ? { ...p.classResource } : null,
            skillHotbar: p.skillHotbar ? [...p.skillHotbar] : null,
            skillCooldowns: p.skillCooldowns ? { ...p.skillCooldowns } : {}
        };
    }

    _restoreSkillLabReturnState() {
        const saved = this._skillLabReturnState;
        if (!saved || !this.player) return;
        const p = this.player;
        p.classData = saved.classData ? window.normalizeClassData(saved.classData) : p.classData;
        p.level = saved.level != null ? saved.level : p.level;
        p.classResource = saved.classResource ? { ...saved.classResource } : p.classResource;
        p.skillHotbar = saved.skillHotbar ? [...saved.skillHotbar] : p.skillHotbar;
        p.skillCooldowns = saved.skillCooldowns ? { ...saved.skillCooldowns } : {};
        if (typeof window.migratePlayerSkillHotbar === 'function') window.migratePlayerSkillHotbar(p);
        if (typeof p.updateStats === 'function') p.updateStats();
        this._skillLabReturnState = null;
        this.updateHUD();
        if (typeof this.updateWeaponSkillButton === 'function') this.updateWeaponSkillButton();
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
        this.renderBattleStats();
    }
    
    /**
     * 获取所有训练假人的聚合伤害统计
     */
    getAggregatedBattleStats() {
        if (!this.trainingGroundScene || !this.trainingGroundScene.dummies) return null;
        const aggregated = { basic: { hits: 0, damage: 0 }, skills: {}, dot: { hits: 0, damage: 0 } };
        this.trainingGroundScene.dummies.forEach(dummy => {
            if (!dummy._battleStats) return;
            const bs = dummy._battleStats;
            aggregated.basic.hits += (bs.basic || {}).hits || 0;
            aggregated.basic.damage += (bs.basic || {}).damage || 0;
            aggregated.dot.hits += (bs.dot || {}).hits || 0;
            aggregated.dot.damage += (bs.dot || {}).damage || 0;
            if (bs.skills) {
                Object.keys(bs.skills).forEach(skillId => {
                    if (!aggregated.skills[skillId]) aggregated.skills[skillId] = { hits: 0, damage: 0 };
                    aggregated.skills[skillId].hits += bs.skills[skillId].hits || 0;
                    aggregated.skills[skillId].damage += bs.skills[skillId].damage || 0;
                });
            }
        });
        return aggregated;
    }
    
    /**
     * 渲染战斗统计到UI
     */
    renderBattleStats() {
        const container = document.getElementById('battle-stats-content');
        if (!container) return;
        
        const stats = this.getAggregatedBattleStats();
        if (!stats || (stats.basic.hits === 0 && stats.dot.hits === 0 && Object.keys(stats.skills).length === 0)) {
            container.innerHTML = '<p style="color: #666; text-align: center; margin: 20px 0;">生成训练桩后开始记录</p>';
            return;
        }
        
        // 获取技能名称对照表
        const skillNames = {};
        if (typeof window.getSkillDefinition === 'function') {
            Object.keys(stats.skills).forEach(id => {
                const def = window.getSkillDefinition(id);
                skillNames[id] = def ? (def.name || id) : id;
            });
        }
        
        let html = '<table style="width:100%; border-collapse: collapse; color: #ccc; font-size: 13px;">';
        html += '<thead><tr style="border-bottom: 1px solid #555; color: #aaa; font-size: 11px; text-align: left;">';
        html += '<th style="padding:4px 6px;">来源</th><th style="padding:4px 6px; text-align: right;">命中次数</th><th style="padding:4px 6px; text-align: right;">总伤害</th><th style="padding:4px 6px; text-align: right;">占比</th>';
        html += '</tr></thead><tbody>';
        
        // 先计算总伤害
        let totalDmg = stats.basic.damage + (stats.dot ? stats.dot.damage : 0);
        Object.values(stats.skills).forEach(s => totalDmg += s.damage);
        if (totalDmg <= 0) totalDmg = 1;
        
        const pct = (v) => (v / totalDmg * 100).toFixed(1);
        
        // 普攻
        if (stats.basic.hits > 0) {
            html += `<tr style="border-bottom: 1px solid #444;">
                <td style="padding:4px 6px;"><span style="color: #4af;">▲ 普攻</span></td>
                <td style="padding:4px 6px; text-align: right; color: #fff;">${stats.basic.hits}</td>
                <td style="padding:4px 6px; text-align: right; color: #ffd700;">${Math.floor(stats.basic.damage)}</td>
                <td style="padding:4px 6px; text-align: right; color: #888;">${pct(stats.basic.damage)}%</td>
            </tr>`;
        }
        
        // 各技能
        const skillSorted = Object.entries(stats.skills).sort((a, b) => b[1].damage - a[1].damage);
        skillSorted.forEach(([skillId, data]) => {
            if (data.hits <= 0) return;
            const name = skillNames[skillId] || skillId;
            html += `<tr style="border-bottom: 1px solid #444;">
                <td style="padding:4px 6px;"><span style="color: #ff9944;">◆ ${name}</span></td>
                <td style="padding:4px 6px; text-align: right; color: #fff;">${data.hits}</td>
                <td style="padding:4px 6px; text-align: right; color: #ffd700;">${Math.floor(data.damage)}</td>
                <td style="padding:4px 6px; text-align: right; color: #888;">${pct(data.damage)}%</td>
            </tr>`;
        });
        
        // DOT
        if (stats.dot && stats.dot.hits > 0) {
            html += `<tr style="border-bottom: 1px solid #444;">
                <td style="padding:4px 6px;"><span style="color: #ff4466;">● 持续伤害</span></td>
                <td style="padding:4px 6px; text-align: right; color: #fff;">${stats.dot.hits}</td>
                <td style="padding:4px 6px; text-align: right; color: #ffd700;">${Math.floor(stats.dot.damage)}</td>
                <td style="padding:4px 6px; text-align: right; color: #888;">${pct(stats.dot.damage)}%</td>
            </tr>`;
        }
        
        // 总计
        const totalHits = stats.basic.hits + (stats.dot ? stats.dot.hits : 0) + Object.values(stats.skills).reduce((a, s) => a + s.hits, 0);
        html += `<tr style="border-top: 2px solid #ffd700; font-weight: bold;">
            <td style="padding:6px 6px; color: #ffd700;">总计</td>
            <td style="padding:6px 6px; text-align: right; color: #fff;">${totalHits}</td>
            <td style="padding:6px 6px; text-align: right; color: #ffd700;">${Math.floor(totalDmg)}</td>
            <td style="padding:6px 6px; text-align: right; color: #ffd700;">100%</td>
        </tr>`;
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }
    
    /**
     * 重置所有假人的战斗统计
     */
    resetAllBattleStats() {
        if (!this.trainingGroundScene || !this.trainingGroundScene.dummies) return;
        this.trainingGroundScene.dummies.forEach(dummy => {
            dummy._battleStats = { basic: { hits: 0, damage: 0 }, skills: {} };
            dummy.totalDamage = 0;
            dummy.damageHistory = [];
        });
        this.renderBattleStats();
    }
    
    /**
     * 技能实验场：若无假人则在玩家面前生成一个，避免普攻完全无目标
     */
    _ensureSkillLabAttackTargets() {
        if (!this.skillLabScene || !this.player) return;
        if (this.skillLabScene.dummies && this.skillLabScene.dummies.length > 0) return;
        const ang = typeof this.player.angle === 'number' ? this.player.angle : 0;
        this.skillLabScene.addDummy(
            this.player.x + Math.cos(ang) * 52,
            this.player.y + Math.sin(ang) * 52,
            { invincible: true, chasePlayer: false }
        );
    }

    /**
     * 训练场：若无假人则生成一个近战测试靶
     */
    _ensureTrainingAttackTargets() {
        if (!this.trainingGroundScene || !this.player) return;
        if (this.trainingGroundScene.dummies && this.trainingGroundScene.dummies.length > 0) return;
        const ang = typeof this.player.angle === 'number' ? this.player.angle : 0;
        this.trainingGroundScene.addDummy(
            this.player.x + Math.cos(ang) * 52,
            this.player.y + Math.sin(ang) * 52,
            { invincible: true, chasePlayer: false }
        );
    }

    /**
     * 获取技能实验场所有假人的聚合伤害统计
     */
    getSkillLabBattleStats() {
        if (!this.skillLabScene || !this.skillLabScene.dummies) return null;
        const aggregated = { basic: { hits: 0, damage: 0 }, skills: {}, dot: { hits: 0, damage: 0 } };
        this.skillLabScene.dummies.forEach(dummy => {
            if (!dummy._battleStats) return;
            const bs = dummy._battleStats;
            aggregated.basic.hits += (bs.basic || {}).hits || 0;
            aggregated.basic.damage += (bs.basic || {}).damage || 0;
            aggregated.dot.hits += (bs.dot || {}).hits || 0;
            aggregated.dot.damage += (bs.dot || {}).damage || 0;
            if (bs.skills) {
                Object.keys(bs.skills).forEach(skillId => {
                    if (!aggregated.skills[skillId]) aggregated.skills[skillId] = { hits: 0, damage: 0 };
                    aggregated.skills[skillId].hits += bs.skills[skillId].hits || 0;
                    aggregated.skills[skillId].damage += bs.skills[skillId].damage || 0;
                });
            }
        });
        return aggregated;
    }
    
    /**
     * 渲染技能实验场战斗统计
     */
    renderSkillLabBattleStats() {
        const container = document.getElementById('skill-lab-battle-stats-content');
        if (!container) return;
        
        const stats = this.getSkillLabBattleStats();
        if (!stats || (stats.basic.hits === 0 && stats.dot.hits === 0 && Object.keys(stats.skills).length === 0)) {
            container.innerHTML = '<p style="color: #666; text-align: center; margin: 20px 0;">生成假人后开始记录</p>';
            return;
        }
        
        const skillNames = {};
        if (typeof window.getSkillDefinition === 'function') {
            Object.keys(stats.skills).forEach(id => {
                const def = window.getSkillDefinition(id);
                skillNames[id] = def ? (def.name || id) : id;
            });
        }
        
        let html = '<table style="width:100%; border-collapse: collapse; color: #ccc; font-size: 13px;">';
        html += '<thead><tr style="border-bottom: 1px solid #555; color: #aaa; font-size: 11px; text-align: left;">';
        html += '<th style="padding:4px 6px;">来源</th><th style="padding:4px 6px; text-align: right;">命中次数</th><th style="padding:4px 6px; text-align: right;">总伤害</th><th style="padding:4px 6px; text-align: right;">占比</th>';
        html += '</tr></thead><tbody>';
        
        let totalDmg = stats.basic.damage + (stats.dot ? stats.dot.damage : 0);
        Object.values(stats.skills).forEach(s => totalDmg += s.damage);
        if (totalDmg <= 0) totalDmg = 1;
        
        const pct = (v) => (v / totalDmg * 100).toFixed(1);
        
        if (stats.basic.hits > 0) {
            html += `<tr style="border-bottom: 1px solid #444;">
                <td style="padding:4px 6px;"><span style="color: #4af;">▲ 普攻</span></td>
                <td style="padding:4px 6px; text-align: right; color: #fff;">${stats.basic.hits}</td>
                <td style="padding:4px 6px; text-align: right; color: #ffd700;">${Math.floor(stats.basic.damage)}</td>
                <td style="padding:4px 6px; text-align: right; color: #888;">${pct(stats.basic.damage)}%</td>
            </tr>`;
        }
        
        const skillSorted = Object.entries(stats.skills).sort((a, b) => b[1].damage - a[1].damage);
        skillSorted.forEach(([skillId, data]) => {
            if (data.hits <= 0) return;
            const name = skillNames[skillId] || skillId;
            html += `<tr style="border-bottom: 1px solid #444;">
                <td style="padding:4px 6px;"><span style="color: #ff9944;">◆ ${name}</span></td>
                <td style="padding:4px 6px; text-align: right; color: #fff;">${data.hits}</td>
                <td style="padding:4px 6px; text-align: right; color: #ffd700;">${Math.floor(data.damage)}</td>
                <td style="padding:4px 6px; text-align: right; color: #888;">${pct(data.damage)}%</td>
            </tr>`;
        });
        
        if (stats.dot && stats.dot.hits > 0) {
            html += `<tr style="border-bottom: 1px solid #444;">
                <td style="padding:4px 6px;"><span style="color: #ff4466;">● 持续伤害</span></td>
                <td style="padding:4px 6px; text-align: right; color: #fff;">${stats.dot.hits}</td>
                <td style="padding:4px 6px; text-align: right; color: #ffd700;">${Math.floor(stats.dot.damage)}</td>
                <td style="padding:4px 6px; text-align: right; color: #888;">${pct(stats.dot.damage)}%</td>
            </tr>`;
        }
        
        const totalHits = stats.basic.hits + (stats.dot ? stats.dot.hits : 0) + Object.values(stats.skills).reduce((a, s) => a + s.hits, 0);
        html += `<tr style="border-top: 2px solid #ffd700; font-weight: bold;">
            <td style="padding:6px 6px; color: #ffd700;">总计</td>
            <td style="padding:6px 6px; text-align: right; color: #fff;">${totalHits}</td>
            <td style="padding:6px 6px; text-align: right; color: #ffd700;">${Math.floor(totalDmg)}</td>
            <td style="padding:6px 6px; text-align: right; color: #ffd700;">100%</td>
        </tr>`;
        
        html += '</tbody></table>';
        container.innerHTML = html;
    }
    
    /**
     * 重置技能实验场所有假人的战斗统计
     */
    resetAllSkillLabBattleStats() {
        if (!this.skillLabScene || !this.skillLabScene.dummies) return;
        this.skillLabScene.dummies.forEach(dummy => {
            dummy._battleStats = { basic: { hits: 0, damage: 0 }, skills: {} };
            dummy.totalDamage = 0;
            dummy.damageHistory = [];
        });
        this.renderSkillLabBattleStats();
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
        // 填充怪物类型选择器（含普通怪与精英怪；含 deep-monsters-add 合并后的条目）
        const monsterSelect = document.getElementById('monster-type-select');
        if (monsterSelect && typeof MONSTER_TYPES !== 'undefined') {
            monsterSelect.innerHTML = '';
            const types = Object.keys(MONSTER_TYPES).filter(type => {
                const d = MONSTER_TYPES[type];
                return d && typeof d === 'object' && (d.name || type);
            });
            types.sort((a, b) => {
                const la = MONSTER_TYPES[a].level != null ? Number(MONSTER_TYPES[a].level) : 0;
                const lb = MONSTER_TYPES[b].level != null ? Number(MONSTER_TYPES[b].level) : 0;
                if (la !== lb) return la - lb;
                const na = MONSTER_TYPES[a].name || a;
                const nb = MONSTER_TYPES[b].name || b;
                return String(na).localeCompare(String(nb), 'zh');
            });
            types.forEach(type => {
                const monsterData = MONSTER_TYPES[type];
                const option = document.createElement('option');
                option.value = type;
                const eliteLabel = monsterData.isElite ? ' [精英]' : '';
                const dispName = monsterData.name || type;
                const lv = monsterData.level != null ? monsterData.level : '?';
                option.textContent = `${dispName}${eliteLabel} (${lv}级)`;
                monsterSelect.appendChild(option);
            });
        }
        
        // 监听假人类型切换（只绑定一次，避免每次按 T 重复注册）
        if (!this._dummySpawnTypeRadioBound) {
            this._dummySpawnTypeRadioBound = true;
            const typeRadios = document.querySelectorAll('input[name="dummy-type"]');
            const monsterSelector = document.getElementById('monster-type-selector');
            typeRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    if (!monsterSelector) return;
                    if (radio.value === 'monster') {
                        monsterSelector.style.display = 'block';
                    } else {
                        monsterSelector.style.display = 'none';
                    }
                });
            });
        }
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
        const interactPressed = this._isInteractKeyEdge(canInteract); // 检测按键按下事件，且不在冷却期内
        
        if (interactions.length > 0 && interactPressed) {
            const interaction = interactions[0];
            if (interaction.name === '返回主城') {
                this.returnToTown();
            }
        }
        
        // T键：打开训练假人生成面板
        // 更新训练假人（如果允许追击）
        this.trainingGroundScene.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            if (dummy instanceof TrainingDummy || dummy instanceof MonsterTrainingDummy) {
                dummy.update(this.player);
            }
        });
        if (typeof window.updateSkillEntities === 'function') {
            window.updateSkillEntities(this, this.trainingGroundScene.dummies, 0.016);
        }
        
        // 玩家攻击训练桩（如果正在冲刺，不能攻击）
        const KB = window.KeybindSystem;
        if ((KB && KB.isActionPressed(this, 'attack')) && !this.player.isDashing) {
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
                            dummy._pendingDamageSource = 'dot';
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
     * 更新技能实验场场景
     */
    updateSkillLab() {
        const scene = this.skillLabScene;
        if (!scene) return;

        const now = Date.now();
        const timeSinceTransition = now - this.lastSceneTransitionTime;
        const canInteract = timeSinceTransition >= 3000;
        const interactPressed = this._isInteractKeyEdge(canInteract);
        const interactions = scene.checkInteraction(this.player);

        if (interactions.length > 0 && interactPressed) {
            const interaction = interactions[0];
            if (interaction.name === '返回主城') {
                this.exitSkillLab();
            }
        }

        scene.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            if (dummy instanceof TrainingDummy || dummy instanceof MonsterTrainingDummy) {
                dummy.update(this.player);
            }
        });

        if (typeof window.updateSkillEntities === 'function') {
            window.updateSkillEntities(this, scene.dummies, 0.016);
        }

        scene.dummies.forEach(dummy => {
            if (dummy instanceof TrainingDummy && dummy.statusEffects.burning && dummy.statusEffects.burning.length > 0) {
                dummy.statusEffects.burning.forEach(burn => {
                    const elapsed = now - burn.startTime;
                    if (elapsed >= 1000 && elapsed < burn.duration) {
                        const lastTick = burn.lastTick || burn.startTime;
                        if (now - lastTick >= 1000) {
                            dummy._pendingDamageSource = 'dot';
                            dummy.takeDamage(burn.damage);
                            burn.lastTick = now;
                        }
                    }
                });
            }
        });

        if (this.skillLabUI) this.skillLabUI.updateDummyCount();
        this.renderSkillLabBattleStats();
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
                        <button id="resurrection-confirm-btn" class="pe-btn pe-btn--lg pe-btn--info">确认复活</button>
                        <button id="resurrection-cancel-btn" class="pe-btn pe-btn--lg pe-btn--secondary">返回主城</button>
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
        if (this.currentScene === SCENE_TYPES.SKILL_LAB) {
            this.resetSkillLabCombatState();
            if (this.skillLabScene) this.skillLabScene.clearAllDummies();
            if (this.skillLabUI) this.skillLabUI.close();
            this._restoreSkillLabReturnState();
        }
        if (this.currentScene === SCENE_TYPES.TRIAL) {
            if (this.trialScene) this.trialScene.reset();
            this.activeTrial = null;
        }
        if (this.currentScene === SCENE_TYPES.DUNGEON) {
            if (this.dungeonScene) this.dungeonScene.reset();
            this.activeDungeon = null;
            if (this.player) this.player._dungeonNoHeal = false;
            this.droppedItems = [];
            this.rewardPickups = [];
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
        this.rewardPickups = [];
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
        if (typeof window.notifyTutorialEvent === 'function') {
            window.notifyTutorialEvent(this, 'enter_tower');
        }
        
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
        
        document.getElementById('blacksmith-upgrade-btn').addEventListener('click', () => {
            this.upgradeEquipment();
        });
        
        document.getElementById('blacksmith-refine-btn').addEventListener('click', () => {
            this.refineEquipment();
        });

        ['all', 'prefix', 'suffix'].forEach(mode => {
            const btn = document.getElementById('blacksmith-reroll-' + (mode === 'all' ? 'all' : mode) + '-btn');
            if (btn) {
                btn.addEventListener('click', () => this.rerollBlacksmithEquipment(mode === 'all' ? 'all' : mode));
            }
        });
        
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
        const rerollSection = document.getElementById('blacksmith-reroll-section');
        
        if (upgradeSection) upgradeSection.classList.remove('active');
        if (refineSection) refineSection.classList.remove('active');
        if (rerollSection) rerollSection.classList.remove('active');
        
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
        } else if (tabName === 'reroll') {
            if (rerollSection) rerollSection.classList.add('active');
            this.updateBlacksmithRerollPanel();
        }
    }

    updateBlacksmithRerollPanel() {
        const info = document.getElementById('blacksmith-reroll-info');
        const equipment = this.getSelectedBlacksmithEquipment();
        const allBtn = document.getElementById('blacksmith-reroll-all-btn');
        const preBtn = document.getElementById('blacksmith-reroll-prefix-btn');
        const sufBtn = document.getElementById('blacksmith-reroll-suffix-btn');
        if (!info) return;
        if (!equipment || (!equipment.procedural && !equipment.baseTypeId)) {
            info.innerHTML = '<p style="color:#aaa;">请选择一件程序化装备</p>';
            [allBtn, preBtn, sufBtn].forEach(b => { if (b) b.style.display = 'none'; });
            return;
        }
        const cost = window.NpcSystem ? window.NpcSystem.rerollAffixCost(equipment) : 200;
        const pre = (equipment.prefixes || []).length;
        const suf = (equipment.suffixes || []).length;
        info.innerHTML = `<p style="color:#ccc;">${equipment.name}</p>
            <p style="color:#888;font-size:12px;">前缀 ${pre} · 后缀 ${suf} · 洗练约 ${cost} 金/次</p>`;
        [allBtn, preBtn, sufBtn].forEach(b => { if (b) b.style.display = 'inline-block'; });
    }

    rerollBlacksmithEquipment(mode) {
        const equipment = this.getSelectedBlacksmithEquipment();
        if (!equipment) return;
        const res = window.rerollEquipmentAffixes(equipment, this.player, mode);
        const px = this.player.x;
        const py = this.player.y;
        this.addFloatingText(px, py, res.ok ? `洗练成功：${res.name}` : (res.message || '失败'), res.ok ? '#88ff88' : '#ff6666');
        if (res.ok) {
            if (typeof this.player.updateStats === 'function') this.player.updateStats();
            this.updateHUD();
            this.updateBlacksmithRerollPanel();
            this.showBlacksmithDetails(equipment);
            if (typeof this.updateInventoryUI === 'function') this.updateInventoryUI();
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
        
        // 伤害统计重置按钮
        const resetStatsBtn = document.getElementById('reset-battle-stats-btn');
        if (resetStatsBtn) {
            resetStatsBtn.addEventListener('click', () => {
                this.resetAllBattleStats();
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
        if (this.player && typeof window.isTutorialComplete === 'function' && !window.isTutorialComplete(this.player)) {
            if (newLevel <= 3) return;
        }
        const hints = {
            3: '你学会了新技能！按 1 键使用',
            6: '尝试在战斗中组合使用技能',
            10: '注意装备与技能的搭配',
            15: '四个技能槽已就绪，搭配装备词缀',
            19: '即将 Lv20，回主城找转职官进阶！',
            20: '恭喜达到20级！找转职官完成一转',
            25: '一转技能持续解锁，记得强化技能',
            39: '即将 Lv40，前往觉醒之门完成二转试炼',
            40: '恭喜完成二转！天赋系统已解锁（C键）',
            55: '你已解锁终极技能！',
            60: '传说被动已解锁，继续挑战恶魔塔吧'
        };
        const text = hints[newLevel];
        if (text && this.player) {
            this.addFloatingText(this.player.x, this.player.y, text, '#ffd700', 3500, 16, true);
        }
        if (newLevel === 20 && this.player && !window.normalizeClassData(this.player.classData).firstAdvancement) {
            this.player.tutorialFlags = this.player.tutorialFlags || {};
            this.player.tutorialFlags.classMasterHint = true;
        }
        if (typeof window.syncChronicleFromProgress === 'function') {
            window.syncChronicleFromProgress(this.player, this);
        }
    }
    
    /**
     * 扩大背包容量
     * @param {string} type - 容量类型 ('equipment', 'potion')
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
        this.ensureInventorySlotElements(Math.max(
            this.player.maxEquipmentCapacity,
            this.player.maxPotionCapacity
        ));
        this.updateInventoryUI();
        this.updateInventoryCapacity();
        this.updateHUD();
        
        // 显示提示
        const typeNames = {
            equipment: '装备栏',
            potion: '消耗品栏',
            consumable: '消耗品栏'
        };
        this.addFloatingText(this.player.x, this.player.y, `${typeNames[type] || '背包'}容量+3`, '#4a9eff');
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

    /**
     * 打开铁匠铺界面
     */
    openBlacksmith() {
        const modal = document.getElementById('blacksmith-modal');
        if (!modal) {
            console.error('openBlacksmith: blacksmith-modal not found');
            return;
        }
        modal.classList.add('show');
        this.syncGamePausedState();
        this.updateBlacksmithEquipmentList();
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
        if (modal) modal.classList.remove('show');
        this.syncGamePausedState();
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
            if (typeof this.updateBlacksmithRerollPanel === 'function') {
                this.updateBlacksmithRerollPanel();
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
        this.syncGamePausedState();
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
        if (modal) modal.classList.remove('show');
        this.syncGamePausedState();
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
            const newEquipments = [];
            const lockedEquipments = [];
            
            if (this.shopEquipments) {
                this.shopEquipments.forEach(eq => {
                    if (this.shopLockedItems.has(eq.id)) {
                        lockedEquipments.push(eq);
                    }
                });
            }
            
            const targetEquipments = [];
            const shopQualityMap = { fine: 'magic', common: 'normal' };
            Object.keys(this.shopTargetSlots).forEach(quality => {
                const slot = this.shopTargetSlots[quality];
                if (!slot.target) return;
                if (slot.targetSnapshot) {
                    const clone = window.EquipmentCodex?.cloneEquipmentForGrant(slot.targetSnapshot);
                    if (clone) {
                        slot.target = clone.id;
                        targetEquipments.push(clone);
                    }
                } else if (window.EquipmentCodex) {
                    const normQ = shopQualityMap[quality] || quality;
                    const eq = window.EquipmentCodex.generateProceduralSample({
                        quality: normQ,
                        monsterLevel: this.player.level || 20,
                        monsterTier: normQ === 'legendary' ? 'boss' : 'elite',
                        playerClass: typeof window.getPlayerBaseClassId === 'function'
                            ? window.getPlayerBaseClassId(this.player.classData) : null
                    });
                    const clone = eq && window.EquipmentCodex.cloneEquipmentForGrant(eq);
                    if (clone) {
                        slot.targetSnapshot = clone;
                        slot.target = clone.id;
                        targetEquipments.push(clone);
                    }
                }
            });
            
            const usedIds = new Set([...lockedEquipments.map(e => e.id), ...targetEquipments.map(e => e.id)]);
            const remainingCount = Math.max(0, 12 - lockedEquipments.length - targetEquipments.length);
            const stock = window.EquipmentCodex?.generateShopStock(this.player, remainingCount) || [];
            stock.forEach(eq => {
                if (!usedIds.has(eq.id)) {
                    newEquipments.push(eq);
                    usedIds.add(eq.id);
                }
            });

            // 神圣十字架：随机出现在装备栏某一格；概率与宝箱/掉落品质中「传说」一档相同（2%）
            const SHOP_HOLY_CROSS_CHANCE = 0.02;
            const hasHolyAlready = [...lockedEquipments, ...targetEquipments].some(
                e => e && e.type === 'consumable' && e.consumableType === 'resurrection'
            );
            if (!hasHolyAlready && newEquipments.length > 0 && Math.random() < SHOP_HOLY_CROSS_CHANCE) {
                const j = Math.floor(Math.random() * newEquipments.length);
                newEquipments[j] = typeof createHolyCrossShopOffer === 'function'
                    ? createHolyCrossShopOffer()
                    : new Consumable({
                        id: 399998,
                        name: '神圣十字架',
                        consumableType: 'resurrection',
                        quality: 'epic',
                        description: '死亡时可以使用，恢复满血并获得3秒无敌',
                        price: 500
                    });
            }
            
            // 合并：锁定的 + 定向的 + 新的
            this.shopEquipments = [...lockedEquipments, ...targetEquipments, ...newEquipments];
        }
        
        // 更新定向位显示
        this.updateTargetSlotsDisplay();
        
        const shopEquipments = this.shopEquipments;
        
        // 使用文档片段批量添加DOM元素
        const fragment = document.createDocumentFragment();
        
        shopEquipments.forEach(listing => {
            const itemDiv = document.createElement('div');
            const isHoly = listing.type === 'consumable' && listing.consumableType === 'resurrection';

            const requiredLevel = Number(listing.level);
            const playerLevel = Number(this.player.level);
            const isLevelLocked = !isHoly && !isNaN(requiredLevel) && !isNaN(playerLevel) && playerLevel < requiredLevel;

            const isLocked = this.shopLockedItems.has(listing.id);
            const isTargeted = !isHoly && Object.values(this.shopTargetSlots).some(slot => slot.target === listing.id);

            itemDiv.className = `shop-item${isLevelLocked ? ' level-locked' : ''}${isLocked ? ' locked' : ''}${isTargeted ? ' targeted' : ''}`;
            if (isTargeted) {
                itemDiv.style.border = `3px solid ${QUALITY_COLORS[listing.quality]}`;
                itemDiv.style.boxShadow = `0 0 10px ${QUALITY_COLORS[listing.quality]}`;
            }

            const price = isHoly
                ? (listing.price || 500)
                : (listing.level * 20 + Object.values(listing.stats).reduce((a, b) => a + b, 0) * 2) * (['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic'].indexOf(listing.quality) + 1);

            const itemIcon = this.createItemIcon(listing, {
                size: 50,
                style: { marginRight: '15px' }
            });

            const nameDiv = document.createElement('div');
            nameDiv.style.color = QUALITY_COLORS[listing.quality];
            nameDiv.style.fontWeight = 'bold';
            nameDiv.style.cursor = 'pointer';
            nameDiv.textContent = listing.name;
            nameDiv.dataset.itemId = listing.id;

            nameDiv.addEventListener('mouseenter', (e) => {
                this.showShopEquipmentTooltip(listing, e.clientX, e.clientY);
            });
            nameDiv.addEventListener('mouseleave', () => {
                this.tooltipManager.hideItemTooltip();
            });

            const typeLine = isHoly
                ? `复活道具 | ${QUALITY_NAMES[listing.quality]}`
                : `${SLOT_NAMES[listing.slot]} | ${QUALITY_NAMES[listing.quality]}${isLevelLocked ? ` | <span style="color: #ff6666;">需要等级 ${requiredLevel}</span>` : ''}${isTargeted ? ` | <span style="color: ${QUALITY_COLORS[listing.quality]};">定向</span>` : ''}`;

            itemDiv.innerHTML = `
                <div class="shop-item-info">
                    <div style="font-size: 12px; color: #aaa;">${typeLine}</div>
                </div>
                <div class="shop-item-price">${price} 金币</div>
                <div style="display: flex; gap: 5px;">
                    <button class="shop-buy-btn" data-item-id="${listing.id}" data-price="${price}">购买</button>
                    <button class="shop-lock-btn${isLocked ? ' is-locked' : ''}" data-item-id="${listing.id}">${isLocked ? '解锁' : '锁定'}</button>
                </div>
            `;

            const shopItemInfo = itemDiv.querySelector('.shop-item-info');
            const iconAndNameContainer = document.createElement('div');
            iconAndNameContainer.style.display = 'flex';
            iconAndNameContainer.style.alignItems = 'center';
            iconAndNameContainer.style.marginBottom = '5px';
            iconAndNameContainer.appendChild(itemIcon);
            iconAndNameContainer.appendChild(nameDiv);
            shopItemInfo.insertBefore(iconAndNameContainer, shopItemInfo.firstChild);

            const buyBtn = itemDiv.querySelector('.shop-buy-btn');
            buyBtn.addEventListener('click', () => {
                this.buyEquipment(listing, price);
            });

            const lockBtn = itemDiv.querySelector('.shop-lock-btn');
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleShopItemLock(listing.id);
            });

            const quality = listing.quality;
            if (!isHoly && !isTargeted && this.shopTargetSlots[quality] &&
                (this.shopTargetSlots[quality].available > 0 || this.shopTargetSlots[quality].target)) {
                itemDiv.style.cursor = 'pointer';
                itemDiv.title = '点击选择为定向装备';
                itemDiv.addEventListener('click', (e) => {
                    if (e.target.classList.contains('shop-buy-btn') || e.target.classList.contains('shop-lock-btn')) return;
                    this.selectTargetSlot(listing);
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
                <button class="shop-buy-capacity-expansion-btn pe-btn pe-btn--info pe-btn--sm" data-cost="${expansionCost}">购买扩容</button>
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
        if (!equipment || equipment.type !== 'equipment' || !equipment.slot) {
            return;
        }
        const quality = equipment.quality;
        if (this.shopTargetSlots[quality]) {
            this.shopTargetSlots[quality].target = equipment.id;
            this.shopTargetSlots[quality].targetSnapshot = equipment;
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
                        <button id="close-target-slot-select" class="pe-btn pe-btn--header-close">关闭</button>
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
        
        const shopQualityMap = { fine: 'magic', common: 'normal' };
        const normQ = shopQualityMap[quality] || quality;
        const qualityEquipments = window.EquipmentCodex
            ? window.EquipmentCodex.generateProceduralSamples({
                count: 24,
                quality: normQ,
                classId: typeof window.getPlayerBaseClassId === 'function'
                    ? window.getPlayerBaseClassId(this.player.classData) : null
            })
            : [];
        
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
                this.shopTargetSlots[quality].target = eq.id;
                this.shopTargetSlots[quality].targetSnapshot = eq;
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
            const isEquipment = equipment.type === 'equipment' && equipment.slot;
            tooltip.innerHTML = isEquipment ? equipment.getTooltipHTML(this.player.equipment) : equipment.getTooltipHTML();
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

        const isHolyCross =
            equipment.type === 'consumable' && equipment.consumableType === 'resurrection';

        if (isHolyCross) {
            const newCross = new Consumable({
                id: 400000000 + Math.floor(Math.random() * 100000000),
                name: equipment.name,
                consumableType: 'resurrection',
                quality: equipment.quality,
                description: equipment.description || '',
                price: equipment.price || 500
            });
            if (this.addItemToInventory(newCross)) {
                this.player.gold -= price;
                if (this.soundManager) {
                    this.soundManager.playSound('purchase');
                }
                this.updateHUD();
                if (this.shopLockedItems.has(equipment.id)) {
                    this.shopLockedItems.delete(equipment.id);
                }
                Object.keys(this.shopTargetSlots).forEach(quality => {
                    if (this.shopTargetSlots[quality].target === equipment.id) {
                        this.shopTargetSlots[quality].target = null;
                    }
                });
                this.updateShopEquipments(false);
                this.addFloatingText(this.player.x, this.player.y, `购买 ${newCross.name}`, QUALITY_COLORS[newCross.quality] || '#ffffff');
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
        
        // 收集玩家背包中可出售的物品（装备与消耗品）
        const sellableItems = [];
        
        this.player.inventory.forEach((item, index) => {
            if (!item) return;
            const isSellableConsumable =
                item.type === 'consumable' && item.consumableType !== 'potion';
            if (item.type === 'equipment' || isSellableConsumable) {
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
                const qualityMultiplier = ['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic'].indexOf(item.quality) + 1;
                const statSum = Object.values(item.stats).reduce((a, b) => a + Math.abs(b), 0);
                const baseValue = item.level * 15 + statSum * 1.5;
                sellPrice = Math.floor(baseValue * qualityMultiplier * 0.4);
            } else if (item.type === 'consumable') {
                const buyPrice = item.price || 50;
                sellPrice = Math.floor(buyPrice * 0.5);
            }
            
            let itemIcon = null;
            if (item.type === 'equipment' || item.type === 'consumable') {
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
            } else if (item.type === 'consumable') {
                const sub =
                    item.consumableType === 'resurrection' ? '复活道具' :
                    item.consumableType === 'recipe' ? '图纸' :
                    (item.consumableType || '消耗品');
                typeInfo = `${sub} | ${QUALITY_NAMES[item.quality]}`;
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
        const stretchScale = this.hitStretchFrames > 0 ? 1.02 : 1;
        this.ctx.scale(visionScale * stretchScale, visionScale / stretchScale);
        this.ctx.translate(-playerScreenX, -playerScreenY);
        if (this.hitStretchFrames > 0) this.hitStretchFrames--;
        if (this.screenShake && this.screenShake.timer > 0 && this.screenShake.amplitude > 0) {
            const sx = (Math.random() - 0.5) * this.screenShake.amplitude * 2;
            const sy = (Math.random() - 0.5) * this.screenShake.amplitude * 2;
            this.ctx.translate(sx, sy);
        }
        
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
        } else if (this.currentScene === SCENE_TYPES.SKILL_LAB) {
            this.skillLabScene.draw(this.ctx);
        } else if (this.currentScene === SCENE_TYPES.TRIAL) {
            this.trialScene.draw(this.ctx);
        } else if (this.currentScene === SCENE_TYPES.DUNGEON && this.dungeonScene) {
            this.dungeonScene.draw(this.ctx);
        }
        this.drawMonsterHitFlashOverlay(this.ctx);
        
        // 绘制掉落物
        this.droppedItems.forEach(item => {
            item.draw(this.ctx);
        });

        if (this.rewardPickups && this.rewardPickups.length) {
            this.rewardPickups.forEach(p => p.draw(this.ctx));
        }
        
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
        this.drawHitImpactEffects(this.ctx);
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
        this.drawClassSkillAimPreview(this.ctx);
        this.drawEquipmentEffects(this.ctx);
        this.drawMonsterProjectiles(this.ctx);
        this.drawGroundHazardsAndPendingAoE(this.ctx);
        if (typeof window.drawSkillEntities === 'function') {
            window.drawSkillEntities(this.ctx, this);
        }
        if (typeof window.drawWarlockSoulLinkTethers === 'function') {
            window.drawWarlockSoulLinkTethers(this.ctx, this, Date.now());
        }
        this.ctx.translate(this.cameraX, this.cameraY);

        // 技能实验场：职业特效绘制在角色之后，需再绘一层角色避免被全屏/贴身 VFX 遮住
        if (this.currentScene === SCENE_TYPES.SKILL_LAB && this.player) {
            this.ctx.save();
            const labOffsetX = CONFIG.CANVAS_WIDTH / 2 - this.player.x;
            const labOffsetY = CONFIG.CANVAS_HEIGHT / 2 - this.player.y;
            this.ctx.translate(labOffsetX, labOffsetY);
            this.player.draw(this.ctx);
            this.ctx.restore();
        }
        
        // 恢复缩放状态
        this.ctx.restore();
        if (typeof window.drawAssassinNightfallOverlay === 'function') {
            window.drawAssassinNightfallOverlay(this.ctx, this);
        }
        this.drawEdgeDamageFlash(this.ctx);
        
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
        } else if (this.currentScene === SCENE_TYPES.SKILL_LAB && this.skillLabScene) {
            if (this.skillLabScene.dummies) {
                this.skillLabScene.dummies.forEach(dummy => {
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
            startTime: Date.now() + (options.delayMs || 0),
            duration: options.duration || 500,
            radius: options.radius || 50,
            angle: options.angle || 0,
            color: options.color || '#ffffff',
            color2: options.color2 || null,
            targetX: options.targetX,
            targetY: options.targetY,
            ox: options.ox,
            oy: options.oy,
            variant: options.variant || null,
            family: options.family || null,
            followTarget: options.followTarget || null,
            projectileSpriteId: options.projectileSpriteId || null,
            eternal: options.eternal || false,
            deathMark: options.deathMark || false,
            strikeIndex: options.strikeIndex,
            strikeTotal: options.strikeTotal,
            cloneCount: options.cloneCount,
            fail: options.fail
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

    /**
     * 释放职业技能栏槽位（0-3 对应键 1-4）
     * @param {number} slotIndex
     * @param {object|null} [castOptions] - 瞄准释放参数（落点/方向/锁定目标）
     */
    useClassSkillHotbar(slotIndex, castOptions) {
        this._castClassSkillHotbar(slotIndex, castOptions || null);
    }

    _getClassSkillDefForHotbarSlot(slotIndex) {
        if (!window.hasPlayerClass(this.player.classData)) return null;
        const labMode = this.currentScene === SCENE_TYPES.SKILL_LAB;
        if (typeof window.getHotbarSkillAtSlot === 'function') {
            return window.getHotbarSkillAtSlot(this.player, slotIndex, { labMode });
        }
        const hotbar = window.getPlayerHotbarSkills(this.player);
        return hotbar[slotIndex] || null;
    }

    _canPrepareClassSkillCast(skillDef) {
        if (this.paused || !skillDef) return false;
        if (!window.hasPlayerClass(this.player.classData)) return false;
        if (!this._canUseWeaponSkillForBattle()) return false;
        const now = Date.now();
        const resolved = window.getResolvedSkillForPlayer(this.player, skillDef) || skillDef;
        if (typeof window.canShadowRaidReturnCast === 'function'
            && window.canShadowRaidReturnCast(this.player, resolved, now)) {
            return true;
        }
        if (this.player.isDashing || this.player.isCastingSkill) return false;
        if (this.player._skillCastBar && now < this.player._skillCastBar.endTime) return false;
        if (this.player.dashEndTime && now - this.player.dashEndTime < 500) return false;
        const cooldownKey = resolved.evolutionPath && resolved.evolutionPath.baseSkillId
            ? resolved.evolutionPath.baseSkillId : resolved.id;
        if (window.getSkillCooldownRemaining(this.player, cooldownKey) > 0) return false;
        if (!window.canAffordSkillCost(this.player, resolved)) return false;
        return true;
    }

    _castClassSkillHotbar(slotIndex, castOptions) {
        const skillDef = this._getClassSkillDefForHotbarSlot(slotIndex);
        if (!this._canPrepareClassSkillCast(skillDef)) return;
        if (!skillDef) return;
        const monsters = this._getSkillMonsters();
        if (!monsters) return;
        if (castOptions && castOptions.angle != null) {
            this.player.angle = castOptions.angle;
        }
        window.executeClassSkill(this.player, monsters, skillDef, this, castOptions);
    }

    cancelClassSkillAim() {
        this.classSkillAim = null;
    }

    _onClassSkillInputDown(slotIndex, source) {
        if (this.paused || !this._canUseWeaponSkillForBattle()) return;
        const skillDef = this._getClassSkillDefForHotbarSlot(slotIndex);
        if (!skillDef || !this._canPrepareClassSkillCast(skillDef)) return;

        const profile = typeof window.resolveClassSkillAimProfile === 'function'
            ? window.resolveClassSkillAimProfile(this.player, skillDef)
            : null;
        if (!profile) {
            this._castClassSkillHotbar(slotIndex, null);
            return;
        }

        this.cancelWeaponSkillAim();
        if (!this.classSkillAim || this.classSkillAim.slotIndex !== slotIndex) {
            this.classSkillAim = {
                slotIndex,
                skillDef,
                profile: Object.assign({}, profile),
                hold: new Set(),
                startTime: Date.now(),
                active: false,
                aimX: this.player.x,
                aimY: this.player.y,
                aimAngle: this.player.angle
            };
        }
        this.classSkillAim.hold.add(source);
    }

    _onClassSkillInputUp(source) {
        if (!this.classSkillAim || !this.classSkillAim.hold.has(source)) return;
        const g = this.classSkillAim;
        g.hold.delete(source);
        if (g.hold.size > 0) return;

        const slotIndex = g.slotIndex;
        const wasActive = g.active;
        const profile = g.profile;
        let castOptions = null;
        if (wasActive && profile) {
            castOptions = {};
            if (profile.mode === 'ground_aoe') {
                castOptions.groundPoint = { x: g.aimX, y: g.aimY };
            } else if (profile.mode === 'target_lock' && g.lockTarget) {
                castOptions.lockTarget = g.lockTarget;
            } else if (profile.mode === 'direction_line' || profile.mode === 'cone') {
                castOptions.angle = g.aimAngle;
            }
        }
        this.classSkillAim = null;
        this._castClassSkillHotbar(slotIndex, castOptions);
    }

    updateClassSkillAimState() {
        const g = this.classSkillAim;
        if (!g) return;
        if (this.player.isDashing || !this._canUseWeaponSkillForBattle()) {
            this.cancelClassSkillAim();
            return;
        }
        if (!this._canPrepareClassSkillCast(g.skillDef)) {
            this.cancelClassSkillAim();
            return;
        }
        const profile = typeof window.resolveClassSkillAimProfile === 'function'
            ? window.resolveClassSkillAimProfile(this.player, g.skillDef)
            : null;
        if (!profile) {
            this.cancelClassSkillAim();
            return;
        }
        g.profile = Object.assign({}, profile);

        const holdMs = 160;
        const now = Date.now();
        if (!g.active && now - g.startTime >= holdMs) {
            g.active = true;
        }
        if (!g.active) return;

        const w = this.screenToWorldForAim(this.mouse.x, this.mouse.y);
        const px = this.player.x;
        const py = this.player.y;
        g.aimAngle = Math.atan2(w.y - py, w.x - px);

        if (g.profile.mode === 'ground_aoe') {
            const c = this.clampGroundSkillAimWorldPoint(w.x, w.y, this.player, g.profile.castRange);
            g.aimX = c.x;
            g.aimY = c.y;
        } else if (g.profile.mode === 'target_lock') {
            const mon = this._getSkillMonsters();
            g.lockTarget = mon && typeof pickWeaponSkillLockTargetNearestToMouse === 'function'
                ? pickWeaponSkillLockTargetNearestToMouse(mon, this.player, g.profile.lockRange, this)
                : null;
        }
    }

    drawClassSkillAimPreview(ctx) {
        const g = this.classSkillAim;
        if (!g || !g.active || this.paused) return;
        const profile = g.profile;
        if (!profile) return;

        const px = this.player.x;
        const py = this.player.y;
        const now = Date.now();
        ctx.save();

        if (profile.mode === 'ground_aoe') {
            ctx.strokeStyle = 'rgba(120, 220, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.arc(px, py, profile.castRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(255, 210, 100, 0.92)';
            ctx.fillStyle = 'rgba(255, 210, 100, 0.15)';
            ctx.beginPath();
            ctx.arc(g.aimX, g.aimY, profile.aoeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (profile.mode === 'target_lock') {
            ctx.strokeStyle = 'rgba(180, 140, 255, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.arc(px, py, profile.lockRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            if (g.lockTarget && g.lockTarget.x != null && g.lockTarget.y != null) {
                this.drawSkillLockPreviewMarker(ctx, g.lockTarget.x, g.lockTarget.y, now);
            }
        } else if (profile.mode === 'self_aoe') {
            ctx.strokeStyle = 'rgba(255, 200, 90, 0.9)';
            ctx.fillStyle = 'rgba(255, 200, 90, 0.14)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, profile.aoeRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (profile.mode === 'cone') {
            const half = (profile.halfAngleDeg || 45) * Math.PI / 180;
            const ang = g.aimAngle;
            const range = profile.range || 80;
            ctx.fillStyle = 'rgba(255, 200, 90, 0.14)';
            ctx.strokeStyle = 'rgba(255, 200, 90, 0.88)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.arc(px, py, range, ang - half, ang + half);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (profile.mode === 'direction_line') {
            const dist = profile.distance || 120;
            const width = profile.width || 30;
            const ang = g.aimAngle;
            const ex = px + Math.cos(ang) * dist;
            const ey = py + Math.sin(ang) * dist;
            ctx.strokeStyle = 'rgba(255, 180, 80, 0.85)';
            ctx.fillStyle = 'rgba(255, 180, 80, 0.12)';
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 180, 80, 0.22)';
            ctx.beginPath();
            ctx.arc(ex, ey, width * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(120, 200, 255, 0.55)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(px, py, dist, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    _canUseWeaponSkillForBattle() {
        if (this.currentScene === SCENE_TYPES.TOWER && this.currentRoom &&
            (this.currentRoom.type === ROOM_TYPES.BATTLE || this.currentRoom.type === ROOM_TYPES.ELITE || this.currentRoom.type === ROOM_TYPES.BOSS)) {
            return true;
        }
        if (this.currentScene === SCENE_TYPES.TRAINING && this.trainingGroundScene) return true;
        if (this.currentScene === SCENE_TYPES.SKILL_LAB && this.skillLabScene) return true;
        if (this.currentScene === SCENE_TYPES.TRIAL && this.trialScene) return true;
        if (this.currentScene === SCENE_TYPES.DUNGEON && this.dungeonScene) return true;
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
        if (this.currentScene === SCENE_TYPES.SKILL_LAB && this.skillLabScene) {
            return this.skillLabScene.dummies;
        }
        if (this.currentScene === SCENE_TYPES.TRIAL && this.trialScene) {
            return this.trialScene.getMonsters();
        }
        if (this.currentScene === SCENE_TYPES.DUNGEON && this.dungeonScene) {
            return this.dungeonScene.getMonsters();
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
            this.cancelClassSkillAim();
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
        let spriteId = null;
        if (typeof resolveProjectileSpriteIdForMonster === 'function') {
            spriteId = resolveProjectileSpriteIdForMonster(monsterRef);
        }
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
            monsterRef,
            spriteId
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
            this.spawnRewardPickupOrbs(monster.x, monster.y, monster.goldBonusOnDeath, 0, 22);
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
        const am = this.assetManager;
        this.monsterProjectiles.forEach(proj => {
            const elapsed = now - proj.startTime;
            const progress = Math.min(1, elapsed / proj.duration);
            const x = proj.startX + (proj.targetX - proj.startX) * progress;
            const y = proj.startY + (proj.targetY - proj.startY) * progress;
            const ang = Math.atan2(proj.targetY - proj.startY, proj.targetX - proj.startX);
            if (am && proj.spriteId && am.drawProjectileSprite(ctx, x, y, ang, proj.spriteId, 28)) {
                return;
            }
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
            if (elapsed < 0) {
                return true;
            }
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
                    
                case 'ranged_bullet': { // 玩家远程子弹：贴图沿直线飞向目标
                    const tx = effect.targetX != null ? effect.targetX : effect.x;
                    const ty = effect.targetY != null ? effect.targetY : effect.y;
                    const bx = effect.x + (tx - effect.x) * progress;
                    const by = effect.y + (ty - effect.y) * progress;
                    const bang = Math.atan2(ty - effect.y, tx - effect.x);
                    const am = this.assetManager;
                    if (am && effect.projectileSpriteId && am.drawProjectileSprite(ctx, bx, by, bang, effect.projectileSpriteId, 32)) {
                        break;
                    }
                    ctx.fillStyle = '#ff3333';
                    ctx.beginPath();
                    ctx.arc(bx, by, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    break;
                }
                    
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

                case 'oblivion_execute': // 终焉斩杀：目标处决 — 暗渊核 + 血红厚环 + 金边 + 旋转斩叉
                    {
                        const br = effect.radius || 138;
                        const r0 = br * (0.08 + progress * 1.12);
                        const r1 = br * (0.22 + progress * 0.98);
                        const r2 = br * (0.38 + progress * 0.82);
                        ctx.fillStyle = 'rgba(8, 0, 18, ' + Math.max(0.35, alpha * 0.92) + ')';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, r0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = 'rgba(255, 30, 50, ' + Math.max(0.75, alpha) + ')';
                        ctx.lineWidth = 10;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, r1, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(255, 230, 120, ' + Math.max(0.55, alpha) + ')';
                        ctx.lineWidth = 4;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, r2, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha + ')';
                        ctx.lineWidth = 5;
                        ctx.save();
                        ctx.translate(effect.x, effect.y);
                        ctx.rotate(elapsed * 0.012);
                        const xs = br * (0.42 + progress * 0.55);
                        ctx.beginPath();
                        ctx.moveTo(-xs, -xs);
                        ctx.lineTo(xs, xs);
                        ctx.moveTo(xs, -xs);
                        ctx.lineTo(-xs, xs);
                        ctx.stroke();
                        ctx.restore();
                        ctx.fillStyle = 'rgba(255, 255, 255, ' + Math.max(0.5, alpha * 0.95) + ')';
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, br * 0.12 * (1 - progress * 0.35), 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;

                case 'oblivion_execute_corona': // 终焉斩杀：玩家周身裁决冠状冲击波
                    {
                        const cr = (effect.radius || 220) * (0.18 + progress * 1.02);
                        ctx.strokeStyle = 'rgba(255, 60, 40, ' + Math.max(0.5, alpha * 0.95) + ')';
                        ctx.lineWidth = 12;
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, cr, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.strokeStyle = 'rgba(255, 215, 80, ' + Math.max(0.4, alpha * 0.88) + ')';
                        ctx.lineWidth = 5;
                        ctx.setLineDash([14, 10]);
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, cr * 0.92, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.max(0.35, alpha * 0.75) + ')';
                        ctx.lineWidth = 2;
                        for (let ri = 0; ri < 8; ri++) {
                            const ang = (ri / 8) * Math.PI * 2 - elapsed * 0.008;
                            ctx.beginPath();
                            ctx.moveTo(effect.x, effect.y);
                            ctx.lineTo(effect.x + Math.cos(ang) * cr, effect.y + Math.sin(ang) * cr);
                            ctx.stroke();
                        }
                    }
                    break;

                case 'class_skill_vfx':
                    if (typeof window.drawClassSkillVfxEffect === 'function') {
                        window.drawClassSkillVfxEffect(ctx, effect, progress, alpha, elapsed);
                    }
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
            const tabs = ['equipment', 'consumable'];
            const tabLabels = { equipment: '装备', consumable: '消耗品' };
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
    
    initDemonInterferenceUi() {
        const overlay = document.getElementById('demon-overlay');
        if (!overlay || this._demonInterferenceUiInit) return;
        this._demonInterferenceUiInit = true;
        overlay.addEventListener('click', () => {
            if (!this.demonInterferenceActive) return;
            const hint = document.getElementById('demon-interference-hint');
            if (!hint || hint.style.display === 'none') return;
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
        });
    }
    
    initDevPanelExtraControls() {
        if (this._devPanelExtraInit) return;
        this._devPanelExtraInit = true;
        const bind = (btnId, fn) => {
            const el = document.getElementById(btnId);
            if (!el) return;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fn.call(this);
            });
        };
        bind('dev-btn-demon-trigger', this.devTriggerDemonInterference);
        bind('dev-btn-demon-preview', this.devPreviewDemonInterferenceDialog);
    }
    
    showDevPanelFeedback(message) {
        const el = document.getElementById('dev-action-feedback');
        if (el) el.textContent = message || '';
        if (this._devFeedbackClearTimer) clearTimeout(this._devFeedbackClearTimer);
        if (message) {
            this._devFeedbackClearTimer = setTimeout(() => {
                const fb = document.getElementById('dev-action-feedback');
                if (fb) fb.textContent = '';
            }, 6500);
        }
    }
    
    /** 若曾因异常留下 demonInterferenceActive 但界面已关，恢复可再次触发 */
    _recoverStuckDemonInterferenceStateForDev() {
        if (!this.demonInterferenceActive) return;
        const modal = document.getElementById('demon-interference-modal');
        const uiOpen = modal && modal.classList.contains('show');
        if (uiOpen) return;
        if (this.demonInterferenceTypingInterval) {
            clearInterval(this.demonInterferenceTypingInterval);
            this.demonInterferenceTypingInterval = null;
        }
        if (this.demonInterferenceSpaceHandler) {
            document.removeEventListener('keydown', this.demonInterferenceSpaceHandler);
            this.demonInterferenceSpaceHandler = null;
        }
        const overlay = document.getElementById('demon-overlay');
        if (overlay) overlay.classList.remove('show');
        if (modal) modal.classList.remove('show');
        const textEl = document.getElementById('demon-interference-text');
        const hintEl = document.getElementById('demon-interference-hint');
        if (textEl) textEl.textContent = '';
        if (hintEl) hintEl.style.display = 'none';
        this.demonInterferenceActive = false;
        this.demonInterferenceEffect = null;
    }
    
    showDemonInterferenceDialog(fullText, onClose) {
        const textEl = document.getElementById('demon-interference-text');
        const hintEl = document.getElementById('demon-interference-hint');
        if (!textEl || !hintEl) {
            console.error('恶魔干扰：未找到 demon-interference-text 或 demon-interference-hint，已关闭并恢复操作');
            this.closeDemonInterference();
            if (this.currentScene === SCENE_TYPES.TOWER) {
                try { this.generatePortals(); } catch (e) { /* ignore */ }
            }
            return;
        }
        
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
    
    /**
     * 开发者：在恶魔塔内触发一次完整的「恶魔的干扰」（与层间随机触发逻辑一致）
     */
    devTriggerDemonInterference() {
        this._recoverStuckDemonInterferenceStateForDev();
        if (this.demonInterferenceActive) {
            this.showDevPanelFeedback('请先按空格或点击遮罩关闭当前恶魔干扰对话框。');
            return;
        }
        if (this.currentScene !== SCENE_TYPES.TOWER) {
            this.showDevPanelFeedback('需在恶魔塔内才能触发完整流程。请点「预览干扰对话框」测 UI。');
            console.warn('[dev] 恶魔干扰：当前不在恶魔塔');
            return;
        }
        this.startDemonInterference();
    }
    
    /**
     * 开发者：仅弹出恶魔干扰 UI，随机效果与传送门逻辑均不执行（任意场景可用，用于排查显示问题）
     */
    devPreviewDemonInterferenceDialog() {
        this._recoverStuckDemonInterferenceStateForDev();
        if (this.demonInterferenceActive) {
            this.showDevPanelFeedback('请先按空格或点击遮罩关闭当前恶魔干扰对话框。');
            return;
        }
        this.demonInterferenceActive = true;
        this.paused = true;
        if (this.soundManager) this.soundManager.pauseBgm();
        const overlay = document.getElementById('demon-overlay');
        const modal = document.getElementById('demon-interference-modal');
        if (overlay) overlay.classList.add('show');
        if (modal) modal.classList.add('show');
        const previewText = '【开发者预览】此为恶魔干扰对话框界面测试。按空格或点击暗色遮罩关闭后，不会施加任何恶魔塔效果，也不会生成传送门。';
        this.showDemonInterferenceDialog(previewText, () => {
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
    
    pickDistinctEliteBoonIds(count) {
        const pool = typeof ELITE_BOON_IDS !== 'undefined' && Array.isArray(ELITE_BOON_IDS) ? [...ELITE_BOON_IDS] : [];
        if (!pool.length) return [];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = pool[i];
            pool[i] = pool[j];
            pool[j] = t;
        }
        return pool.slice(0, Math.min(count | 0, pool.length));
    }
    
    initEliteBoonChoiceModal() {
        const skipBtn = document.getElementById('elite-boon-skip-btn');
        const opts = document.getElementById('elite-boon-choice-options');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => this.resolveEliteBoonChoice(null));
        }
        if (opts) {
            opts.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-elite-boon-id]');
                if (!btn) return;
                const id = btn.getAttribute('data-elite-boon-id');
                if (id) this.resolveEliteBoonChoice(id);
            });
        }
    }
    
    openEliteBoonChoiceModal() {
        if (this._eliteBoonChoiceActive) return;
        const modal = document.getElementById('elite-boon-choice-modal');
        const container = document.getElementById('elite-boon-choice-options');
        const skipBtn = document.getElementById('elite-boon-skip-btn');
        const ids = this.pickDistinctEliteBoonIds(3);
        if (!modal || !container || !ids.length) {
            this.continueTowerAfterEliteRoomFlow();
            return;
        }
        this._eliteBoonChoiceActive = true;
        this._eliteBoonSkipGold = Math.max(0, Math.floor(20 * (this.floor | 0)));
        container.innerHTML = '';
        ids.forEach((id) => {
            const meta = typeof getEliteBoonMeta === 'function' ? getEliteBoonMeta(id) : { name: id, description: '' };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-elite-boon-id', id);
            btn.className = 'elite-boon-choice-btn';
            const nameEl = document.createElement('span');
            nameEl.className = 'elite-boon-name';
            nameEl.textContent = meta.name;
            const descEl = document.createElement('span');
            descEl.className = 'elite-boon-desc';
            descEl.textContent = meta.description || '';
            btn.appendChild(nameEl);
            btn.appendChild(descEl);
            container.appendChild(btn);
        });
        if (skipBtn) {
            skipBtn.textContent = this._eliteBoonSkipGold > 0
                ? `放弃加护（+${this._eliteBoonSkipGold} 金币）`
                : '放弃加护';
        }
        this.paused = true;
        modal.classList.add('show');
    }
    
    resolveEliteBoonChoice(id) {
        if (!this._eliteBoonChoiceActive) return;
        this._eliteBoonChoiceActive = false;
        const modal = document.getElementById('elite-boon-choice-modal');
        if (modal) modal.classList.remove('show');
        this.paused = false;
        const skipGold = this._eliteBoonSkipGold | 0;
        this._eliteBoonSkipGold = 0;
        if (id) {
            this.grantEliteBoonById(id);
        } else if (skipGold > 0) {
            this.gainGold(skipGold);
            this.addFloatingText(this.player.x, this.player.y, `放弃加护 +${skipGold} 金币`, '#ffd700');
            this.updateHUD();
        }
        this.continueTowerAfterEliteRoomFlow();
    }
    
    continueTowerAfterEliteRoomFlow() {
        if (!this.demonInterferenceActive) {
            if (this.currentScene === SCENE_TYPES.TOWER && Math.random() < this.demonInterferenceTriggerChance) {
                this.startDemonInterference();
            } else {
                this.generatePortals();
            }
        }
    }
    
    /**
     * 精英加护：按 id 叠层（塔内有效）
     */
    grantEliteBoonById(id) {
        if (!this.player || !id) return;
        if (!Array.isArray(this.player.eliteBoons)) this.player.eliteBoons = [];
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
     * 随机获得一条加护（隙间商店等）
     */
    grantRandomEliteBoon() {
        const ids = typeof ELITE_BOON_IDS !== 'undefined' ? ELITE_BOON_IDS : [];
        if (!ids.length || !this.player) return;
        const id = ids[Math.floor(Math.random() * ids.length)];
        this.grantEliteBoonById(id);
    }
    
    /**
     * Boss 被击败：发放经验、金币与掉落（普通击杀流程不会处理 Boss）
     */
    onBossDefeated(monster) {
        if (!monster) return;
        if (this.currentScene === SCENE_TYPES.TRIAL && monster._isTrialBoss) {
            if (monster._bossRewardGranted) return;
            monster._bossRewardGranted = true;
            this.onTrialVictory();
            return;
        }
        if (this.currentScene === SCENE_TYPES.DUNGEON && monster._isDungeonBoss) {
            if (monster._bossRewardGranted) return;
            monster._bossRewardGranted = true;
            if (this.dungeonScene) {
                this.dungeonScene.notifyKilled(monster);
                if (this.dungeonScene.isComplete()) {
                    this.onDungeonVictory();
                }
            }
            return;
        }
        if (monster._bossRewardGranted) return;
        monster._bossRewardGranted = true;
        this.spawnRewardPickupOrbs(monster.x, monster.y, monster.goldReward, monster.expReward, 34);
        const maxF = typeof window.getTowerMaxFloor === 'function' ? window.getTowerMaxFloor() : 240;
        if (this.floor >= maxF) {
            this.addFloatingText(this.player.x, this.player.y, '恭喜通关恶魔塔！', '#ffdd00');
        }
        const M = monster.level || 20;
        const rawEq = window.EquipmentCodex && window.EquipmentCodex.generateLootEquipment
            ? window.EquipmentCodex.generateLootEquipment({
                monsterLevel: M,
                monsterTier: 'boss',
                quality: Math.random() < 0.35 ? 'legendary' : 'epic',
                playerClass: typeof window.getPlayerBaseClassId === 'function'
                    ? window.getPlayerBaseClassId(this.player.classData) : null
            })
            : null;
        if (rawEq) {
            const newEq = window.EquipmentCodex?.cloneEquipmentForGrant(rawEq)
                || new Equipment({
                    id: rawEq.id,
                    name: rawEq.name,
                    slot: rawEq.slot,
                    weaponType: rawEq.weaponType,
                    quality: rawEq.quality,
                    level: rawEq.level,
                    stats: JSON.parse(JSON.stringify(rawEq.baseStats || rawEq.stats || {})),
                    baseTypeId: rawEq.baseTypeId,
                    prefixes: rawEq.prefixes || [],
                    suffixes: rawEq.suffixes || [],
                    legendaryPowers: rawEq.legendaryPowers || [],
                    setId: rawEq.setId,
                    procedural: true,
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
        this.updateGapShopPricesAndGold();
        requestAnimationFrame(() => {
            if (!modal.classList.contains('show')) return;
            this.renderGapShopSellList();
        });
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
        return Math.max(1, Math.floor((this.floor | 0) / 4));
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
        this.renderGapShopPanel({ refreshSellList: false });
    }
    
    updateGapShopPricesAndGold() {
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
    }
    
    renderGapShopSellList() {
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
        const frag = document.createDocumentFragment();
        sellable.forEach(({ item, index }) => {
            let sellPrice = 0;
            if (item.type === 'equipment' && item.slot) {
                const statSum = item.stats ? Object.values(item.stats).reduce((a, b) => a + b, 0) : 0;
                const baseValue = (item.level || 1) * 20 + statSum * 2;
                const qm = (['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic'].indexOf(item.quality) + 1) || 1;
                sellPrice = Math.floor(baseValue * qm * 0.4);
            } else if (item.type === 'consumable' || item.type === 'potion') {
                const buyPrice = item.buyPrice || item.price || 50;
                sellPrice = Math.floor(buyPrice * 0.5);
            } else {
                const buyPrice = item.buyPrice || item.price || 30;
                sellPrice = Math.floor(buyPrice * 0.5);
            }
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #444;font-size:12px;color:#ddd;';
            row.innerHTML = `<span>${item.name}</span><span>${sellPrice} 金 <button type="button" class="pe-btn pe-btn--xs gap-sell-one" data-i="${index}" data-p="${sellPrice}">出售</button></span>`;
            frag.appendChild(row);
        });
        list.innerHTML = '';
        list.appendChild(frag);
        list.querySelectorAll('.gap-sell-one').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.getAttribute('data-i'), 10);
                const p = parseInt(btn.getAttribute('data-p'), 10);
                this.sellItem(i, p);
                this.renderGapShopPanel({ refreshSellList: true });
            });
        });
    }
    
    renderGapShopPanel(options = {}) {
        this.updateGapShopPricesAndGold();
        if (options.refreshSellList !== false) {
            this.renderGapShopSellList();
        }
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
            const availableTypes = [ROOM_TYPES.BATTLE, ROOM_TYPES.TREASURE, ROOM_TYPES.REST, ROOM_TYPES.ELITE];
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
        const isGapShop = interaction.type === 'gap_shop';
        const w = isGapShop ? 172 : 120;
        const label = isGapShop ? '按 E 打开商店面板' : '按E交互';
        const half = w / 2;
        const h = isGapShop ? 28 : 30;
        const rx = 6;

        ctx.save();
        ctx.fillStyle = 'rgba(18, 18, 28, 0.88)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x - half, y - h / 2, w, h, rx);
        } else {
            ctx.rect(x - half, y - h / 2, w, h);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = isGapShop ? '14px "Courier New", monospace' : '16px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y);
        ctx.restore();
    }
    
    /**
     * 构建可序列化的存档对象（与导出/浏览器缓存共用）
     * @returns {Object}
     */
    buildSaveDataObject() {
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
            }
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
    }

    /**
     * 存档内容指纹（排除顶层 timestamp），用于判断是否与上次写入 localStorage 的存档码对应的数据一致。
     * @returns {string}
     */
    _computeSaveFingerprintSansTimestamp() {
        const data = this.buildSaveDataObject();
        const clone = JSON.parse(JSON.stringify(data));
        delete clone.timestamp;
        return JSON.stringify(clone);
    }

    _rememberSyncedSaveFingerprint() {
        try {
            this._lastSyncedSaveFingerprint = this._computeSaveFingerprintSansTimestamp();
            this._lastSaveCodeSyncTimeMs = Date.now();
        } catch (e) {
            this._lastSyncedSaveFingerprint = null;
        }
    }

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
    }

    /**
     * 将存档对象编码为存档码字符串（与剪贴板导出一致）
     * @param {Object} saveData
     * @returns {string}
     */
    encodeSaveDataToSaveCode(saveData) {
        const jsonStr = JSON.stringify(saveData);
        if (typeof LZString !== 'undefined') {
            return LZString.compressToBase64(jsonStr);
        }
        return btoa(encodeURIComponent(jsonStr));
    }

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
        return JSON.parse(jsonStr);
    }

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
    }

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
    }

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
    }

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
    }

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
        const saveCode = this.encodeSaveDataToSaveCode(this.buildSaveDataObject());
        this.showSaveCodeModal(saveCode);
        try {
            localStorage.setItem(Game.BROWSER_SAVE_CODE_KEY, saveCode);
            this._rememberSyncedSaveFingerprint();
        } catch (e) {
            console.warn('导出后同步存档码到 localStorage 失败', e);
        }
        this.addFloatingText(this.player.x, this.player.y, '存档已导出', '#00ff00');
    }
    
    /**
     * 导入存档
     * @param {Object} saveData - 存档数据
     * @param {{ quiet?: boolean }} [options] - quiet 为 true 时不弹窗、不飘字（用于浏览器自动读档）
     */
    importSave(saveData, options) {
        const quiet = options && options.quiet === true;
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
            baseTypeId: equipment.baseTypeId || null,
            implicit: equipment.implicit || null,
            prefixes: equipment.prefixes || [],
            suffixes: equipment.suffixes || [],
            legendaryPowers: equipment.legendaryPowers || [],
            setId: equipment.setId || null,
            classAffinity: equipment.classAffinity || null,
            procedural: equipment.procedural || false,
            gearScore: equipment.gearScore || 0
        };
    }
    
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
            classAffinity: data.classAffinity || null,
            procedural: data.procedural || false
        });
        
        // 如果存档中有装备词条，恢复它；若缺少 id（旧存档），则按名称重新生成 id，确保恢复生命值等词条能生效
        if (data.equipmentTraits) {
            eq.equipmentTraits = data.equipmentTraits;
        }
        
        // 恢复isCrafted属性
        if (data.isCrafted) {
            eq.isCrafted = true;
        }
        
        return eq;
    }
    
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
    }

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
    
    /**
     * 固定时间步长的逻辑更新（TPS）
     */
    fixedUpdate() {
        try {
            const tickStartTime = performance.now();
            this.updateHitImpactEffects(this.fixedTimeStep);
            if (!this.paused) {
                if (this.hitStopTimer > 0) {
                    this.hitStopTimer = Math.max(0, this.hitStopTimer - this.fixedTimeStep);
                    if (this.hitStopTimer === 0) this._hitStopRecoveryAccumulator = 0;
                } else {
                    if (this._hitStopRecoveryTicks > 0) {
                        this._hitStopRecoveryAccumulator += 0.5;
                        if (this._hitStopRecoveryAccumulator >= 1) {
                            this._hitStopRecoveryAccumulator -= 1;
                            this._hitStopRecoveryTicks--;
                            this.update();
                        }
                    } else {
                        this.update();
                    }
                }
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
        if (!this._localPeDevServer) {
            return;
        }
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
                this.populateDevSetGrantSelect();
                this.populateDevSetV2Select();
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
     * @param {string} tab - 标签页名称 ('equipments', 'consumables', 'recipes')
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
        } else if (activeTab === 'procedural') {
            this.updateDevCodexProcedural(content);
        } else if (activeTab === 'base_types') {
            this.updateDevCodexBaseTypes(content);
        } else if (activeTab === 'consumables') {
            this.updateDevCodexConsumables(content);
        } else if (activeTab === 'recipes') {
            this.updateDevCodexRecipes(content);
        }
    }
    
    /**
     * 更新图鉴开发者面板的装备列表
     * @param {HTMLElement} container - 容器元素
     */
    updateDevCodexEquipments(container) {
        this.updateDevCodexProcedural(container);
    }

    updateDevCodexProcedural(container) {
        if (!window.EquipmentCodex) {
            container.innerHTML = '<p style="color:#888;padding:12px;">程序化配置未加载</p>';
            return;
        }
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center;';
        toolbar.innerHTML = '<span style="color:#8cf;font-size:12px;">点击条目加入背包 · 每次刷新重新随机</span>';
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'pe-btn pe-btn--sm pe-btn--info';
        refreshBtn.textContent = '刷新样例';
        refreshBtn.onclick = () => this.updateDevCodexProcedural(container);
        toolbar.appendChild(refreshBtn);
        container.appendChild(toolbar);

        const samples = window.EquipmentCodex.generateProceduralSamples({
            count: 24,
            classId: typeof window.getPlayerBaseClassId === 'function'
                ? window.getPlayerBaseClassId(this.player.classData) : null
        });
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;';
        samples.forEach(eq => {
            const card = document.createElement('div');
            const qc = QUALITY_COLORS[eq.quality] || '#fff';
            card.style.cssText = `padding:10px;background:rgba(40,40,50,0.9);border:1px solid ${qc};border-radius:6px;cursor:pointer;`;
            card.onmouseenter = () => { card.style.background = 'rgba(55,55,70,0.95)'; };
            card.onmouseleave = () => { card.style.background = 'rgba(40,40,50,0.9)'; };
            card.onclick = () => this.devAddSpecificEquipment(eq);
            const title = document.createElement('div');
            title.style.cssText = `color:${qc};font-weight:bold;font-size:13px;margin-bottom:6px;`;
            title.textContent = eq.name;
            const meta = document.createElement('div');
            meta.style.cssText = 'color:#aaa;font-size:11px;line-height:1.45;';
            const affCount = (eq.prefixes || []).length + (eq.suffixes || []).length;
            const powCount = (eq.legendaryPowers || []).length;
            meta.innerHTML = `${SLOT_NAMES[eq.slot] || eq.slot} · Lv.${eq.level} · ${QUALITY_NAMES[eq.quality] || eq.quality}<br>基型: ${eq.baseTypeId || '-'} · 词缀: ${affCount} · 威能: ${powCount}${eq.setId ? '<br>套装: ' + eq.setId : ''}`;
            card.appendChild(title);
            card.appendChild(meta);
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }

    updateDevCodexBaseTypes(container) {
        if (!window.EquipmentCodex) {
            container.innerHTML = '<p style="color:#888;padding:12px;">基型配置未加载</p>';
            return;
        }
        const wrap = document.createElement('div');
        wrap.innerHTML = window.EquipmentCodex.buildBaseTypesHtml({});
        container.appendChild(wrap);
        wrap.querySelectorAll('.codex-base-type-entry').forEach(el => {
            el.onclick = () => {
                const baseTypeId = el.dataset.baseTypeId;
                if (!baseTypeId) return;
                const bt = window.BASE_TYPES;
                const def = (bt.weapons && bt.weapons[baseTypeId])
                    || (bt.offHand && bt.offHand[baseTypeId])
                    || (bt.armor && bt.armor[baseTypeId])
                    || (bt.accessories && bt.accessories[baseTypeId]);
                if (!def) return;
                const eq = window.EquipmentCodex.generateProceduralSample({
                    slot: def.slot,
                    quality: 'epic',
                    monsterLevel: this.player.level || 20,
                    monsterTier: 'boss',
                    playerClass: def.classAffinity || (typeof window.getPlayerBaseClassId === 'function'
                        ? window.getPlayerBaseClassId(this.player.classData) : 'warrior')
                });
                if (eq) {
                    eq.baseTypeId = baseTypeId;
                    this.devAddSpecificEquipment(eq);
                }
            };
        });
    }
    
    /**
     * 更新图鉴开发者面板的消耗品（药水已移除，仅保留神圣十字架等）
     * @param {HTMLElement} container - 容器元素
     */
    updateDevCodexConsumables(container) {
        container.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:12px;color:#ccc;line-height:1.6;';
        wrap.innerHTML = '<p style="margin-bottom:12px;">药水已从游戏中移除。点击下方条目可获得与商店上架一致的神圣十字架（新实例 id）。</p>';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
        const btn = document.createElement('button');
        btn.className = 'pe-btn pe-btn--sm pe-btn--info';
        btn.textContent = '神圣十字架';
        btn.onclick = () => this.devAddHolyCrossConsumable();
        row.appendChild(btn);
        wrap.appendChild(row);
        container.appendChild(wrap);
    }

    /**
     * 开发者功能：添加指定装备
     * @param {Equipment} equipment - 装备对象
     */
    devAddSpecificEquipment(equipment) {
        const newEq = window.EquipmentCodex && equipment.procedural
            ? window.EquipmentCodex.cloneEquipmentForGrant(equipment)
            : new Equipment({
                id: equipment.id,
                name: equipment.name,
                slot: equipment.slot,
                weaponType: equipment.weaponType,
                quality: equipment.quality,
                level: equipment.level,
                stats: JSON.parse(JSON.stringify(equipment.stats)),
                refineLevel: 0
            });
        if (!newEq) return;
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
        } else if (['helmet', 'body', 'hands', 'legs', 'feet'].includes(recipe.resultEquipment.slot)) {
            stats.health = recipe.resultEquipment.health || 0;
            stats.defense = recipe.resultEquipment.defense || 0;
        } else if (['amulet', 'ring', 'belt'].includes(recipe.resultEquipment.slot)) {
            stats.dodge = recipe.resultEquipment.dodge || 0;
            stats.attackSpeed = recipe.resultEquipment.attackSpeed || 0;
            stats.moveSpeed = recipe.resultEquipment.moveSpeed || 0;
        }
        
        const weaponType = recipe.resultEquipment.weaponType || null;
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
     * 开发者功能：添加神圣十字架（背包用消耗品实例）
     */
    devAddHolyCrossConsumable() {
        const c =
            typeof createHolyCrossShopOffer === 'function'
                ? createHolyCrossShopOffer()
                : new Consumable({
                      id: 399998,
                      name: '神圣十字架',
                      consumableType: 'resurrection',
                      quality: 'epic',
                      description: '死亡时可以使用，恢复满血并获得3秒无敌',
                      price: 500
                  });
        c.id = 400000000 + Math.floor(Math.random() * 100000000);
        this.addItemToInventory(c);
        this.addFloatingText(this.player.x, this.player.y, `获得: ${c.name} (DEV)`, QUALITY_COLORS[c.quality] || '#ffffff');
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

    populateDevSetGrantSelect() {
        this.populateDevSetV2Select();
    }

    populateCodexSetFilter() {
        const sel = document.getElementById('filter-set');
        if (!sel || typeof SET_DEFINITIONS_V2 === 'undefined' || !SET_DEFINITIONS_V2.sets) return;
        const prev = sel.value;
        sel.innerHTML = '';
        [
            ['all', '全部'],
            ['none', '无套装']
        ].forEach(([val, label]) => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            sel.appendChild(opt);
        });
        Object.entries(SET_DEFINITIONS_V2.sets).sort((a, b) => {
            return (a[1].name || a[0]).localeCompare(b[1].name || b[0], 'zh-CN');
        }).forEach(([setId, setData]) => {
            const opt = document.createElement('option');
            opt.value = 'v2_' + setId;
            opt.textContent = setData.name || setId;
            sel.appendChild(opt);
        });
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    }

    populateDevSetV2Select() {
        const sel = document.getElementById('dev-set-v2-select');
        if (!sel || typeof SET_DEFINITIONS_V2 === 'undefined' || !SET_DEFINITIONS_V2.sets) return;
        const prev = sel.value;
        sel.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '-- 选择新套装 --';
        sel.appendChild(ph);
        Object.entries(SET_DEFINITIONS_V2.sets).sort((a, b) => {
            return (a[1].name || a[0]).localeCompare(b[1].name || b[0], 'zh-CN');
        }).forEach(([setId, setData]) => {
            const opt = document.createElement('option');
            opt.value = setId;
            opt.textContent = `${setData.name || setId} (${setId})`;
            sel.appendChild(opt);
        });
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    }

    devReadProceduralDevOptions() {
        const slot = document.getElementById('dev-proc-slot')?.value || '';
        const quality = document.getElementById('dev-proc-quality')?.value || '';
        const level = parseInt(document.getElementById('dev-proc-level')?.value || '20', 10);
        const cls = document.getElementById('dev-proc-class')?.value || '';
        const playerClass = cls || (typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId(this.player.classData) : null);
        return {
            slot: slot || undefined,
            quality: quality || undefined,
            monsterLevel: Number.isFinite(level) ? level : 20,
            monsterTier: quality === 'legendary' || quality === 'mythic' ? 'boss' : 'elite',
            playerClass,
            classId: playerClass
        };
    }

    devGenerateProceduralEquipment() {
        if (!window.EquipmentCodex) {
            this.addFloatingText(this.player.x, this.player.y, '程序化模块未加载', '#ff6666');
            return;
        }
        const eq = window.EquipmentCodex.generateProceduralSample(this.devReadProceduralDevOptions());
        if (!eq) {
            this.addFloatingText(this.player.x, this.player.y, '生成失败', '#ff6666');
            return;
        }
        this.devAddSpecificEquipment(eq);
    }

    devGenerateProceduralBatch(n) {
        if (!window.EquipmentCodex) return;
        let added = 0;
        for (let i = 0; i < n; i++) {
            const eq = window.EquipmentCodex.generateProceduralSample(this.devReadProceduralDevOptions());
            if (eq && this.addItemToInventory(window.EquipmentCodex.cloneEquipmentForGrant(eq), true)) added++;
        }
        this.addFloatingText(this.player.x, this.player.y, `已生成 ${added} 件程序化装备 (DEV)`, '#8cf');
        this.updateInventoryUI();
    }

    devGenerateProceduralAllSlots() {
        if (!window.EquipmentCodex || !window.EQUIPMENT_SLOT_ORDER) return;
        const opts = this.devReadProceduralDevOptions();
        let added = 0;
        window.EQUIPMENT_SLOT_ORDER.forEach(slot => {
            const eq = window.EquipmentCodex.generateProceduralSample(Object.assign({}, opts, { slot, quality: opts.quality || 'rare' }));
            if (eq && this.addItemToInventory(window.EquipmentCodex.cloneEquipmentForGrant(eq), true)) added++;
        });
        this.addFloatingText(this.player.x, this.player.y, `十槽各1件 (${added}/10) (DEV)`, '#8cf');
        this.updateInventoryUI();
    }

    devGenerateProceduralDropSim() {
        if (typeof rollEquipmentDropAtMonster !== 'function') return;
        const monsters = (this.currentRoom && this.currentRoom.monsters) || [];
        const m = monsters.find(x => x && x.hp > 0) || { x: this.player.x, y: this.player.y, level: this.player.level || 1, isElite: false };
        rollEquipmentDropAtMonster(m, this, 1);
        this.addFloatingText(this.player.x, this.player.y, '已模拟 100% 怪物掉落 (DEV)', '#8cf');
    }

    devGrantFullSetV2() {
        const sel = document.getElementById('dev-set-v2-select');
        const setId = sel && sel.value;
        if (!setId || !window.EquipmentCodex) {
            this.addFloatingText(this.player.x, this.player.y, '请选择新套装 (DEV)', '#ff6666');
            return;
        }
        const res = window.EquipmentCodex.grantFullSetV2(setId, this);
        if (!res.ok) {
            this.addFloatingText(this.player.x, this.player.y, res.message || '发放失败', '#ff6666');
            return;
        }
        this.updateInventoryUI();
        this.addFloatingText(this.player.x, this.player.y,
            `套装「${res.name}」${res.added}/${res.total} 件 (DEV)`, res.failed ? '#ffcc66' : '#88ff88');
    }

    devGrantFullEquipmentSet() {
        const sel = document.getElementById('dev-set-grant-select') || document.getElementById('dev-set-v2-select');
        if (sel && sel.id === 'dev-set-grant-select') {
            const v2Sel = document.getElementById('dev-set-v2-select');
            if (v2Sel) v2Sel.value = sel.value;
        }
        this.devGrantFullSetV2();
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
            const consumableCount = this.player.inventory.slice(48).filter(item => item !== null).length;
            document.getElementById('dev-inventory-count').textContent = 
                `${equipmentCount}/${consumableCount} (装备/消耗品)`;
            document.getElementById('dev-floor').textContent = this.floor;
            const roomTypeNames = {
                battle: '战斗',
                treasure: '宝箱',
                rest: '休整',
                elite: '精英',
                gap_shop: '隙间商店',
                boss: 'Boss'
            };
            const roomTypeEl = document.getElementById('dev-room-type');
            if (roomTypeEl) {
                const rt = this.currentRoom && this.currentRoom.type === 'alchemy' ? 'battle' : (this.currentRoom && this.currentRoom.type);
                roomTypeEl.textContent = this.currentRoom ? (roomTypeNames[rt] || rt || '-') : '-';
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
     * 与正常升级链一致：当前等级为 level 时，升到 level+1 所需经验条上限 = 20 × level²
     */
    computePlayerExpNeededForLevel(level) {
        if (typeof window.computePlayerExpToNextLevel === 'function') {
            return window.computePlayerExpToNextLevel(level);
        }
        const Lv = Math.max(1, Math.floor(Number(level)) || 1);
        return 20 * Lv * Lv;
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
        const legacyMap = { common: 'normal', fine: 'magic' };
        const q = legacyMap[quality] || quality;
        if (window.EquipmentCodex && window.generateProceduralEquipment && ['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic'].includes(q)) {
            const eq = window.EquipmentCodex.generateProceduralSample({
                quality: q,
                monsterLevel: this.player.level || 20,
                monsterTier: q === 'legendary' || q === 'mythic' ? 'boss' : 'elite',
                playerClass: typeof window.getPlayerBaseClassId === 'function'
                    ? window.getPlayerBaseClassId(this.player.classData) : null
            });
            if (eq) {
                this.devAddSpecificEquipment(eq);
                return;
            }
        }
        this.addFloatingText(this.player.x, this.player.y, '程序化装备生成失败 (DEV)', '#ff6666');
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
        if (type === 'alchemy') type = 'battle';
        this.currentRoom = new Room(CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT, type, this.floor, this);
        this.currentRoom.generateRoom(this.player.level);
        const typeNames = {
            battle: '战斗',
            treasure: '宝箱',
            rest: '休整',
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
        
        const slots = (typeof window.EQUIPMENT_SLOT_ORDER !== 'undefined')
            ? window.EQUIPMENT_SLOT_ORDER.slice()
            : ['weapon', 'offHand', 'helmet', 'body', 'hands', 'legs', 'feet', 'amulet', 'ring', 'belt'];
        slots.forEach(slot => {
            if (window.EquipmentCodex) {
                const eq = window.EquipmentCodex.generateProceduralSample({
                    slot,
                    quality: 'legendary',
                    monsterLevel: this.player.level || 40,
                    monsterTier: 'boss',
                    playerClass: typeof window.getPlayerBaseClassId === 'function'
                        ? window.getPlayerBaseClassId(this.player.classData) : null
                });
                if (eq) this.devAddSpecificEquipment(eq);
            }
        });
        this.addFloatingText(this.player.x, this.player.y, `已添加传说装备提升战力 (DEV)`, '#ff8000');
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
}

