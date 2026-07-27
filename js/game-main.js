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
        this.trainingGroundScene = typeof TrainingGroundScene !== 'undefined'
            ? new TrainingGroundScene(this) : null;
        this.skillLabScene = typeof SkillLabScene !== 'undefined'
            ? new SkillLabScene(this) : null;
        this.animPreviewScene = typeof AnimPreviewScene !== 'undefined' ? new AnimPreviewScene(this) : null;
        this.abSkillVfxLabScene = typeof AbSkillVfxLabScene !== 'undefined' ? new AbSkillVfxLabScene(this) : null;
        this.abSkillVfxLabUI = typeof AbSkillVfxLabUI !== 'undefined' ? new AbSkillVfxLabUI(this) : null;
        this._abVfxLabBattle = null;
        this._lastAbVfxLabTick = 0;
        this.equipmentLabScene = typeof EquipmentLabScene !== 'undefined' ? new EquipmentLabScene(this) : null;
        this.equipmentLabController = typeof window.EquipmentLabController !== 'undefined'
            ? new window.EquipmentLabController(this) : null;
        this.trialScene = typeof TrialScene !== 'undefined' ? new TrialScene(this) : null;
        this.dungeonScene = typeof window.DungeonScene !== 'undefined' ? new window.DungeonScene(this) : null;
        this.activeTrial = null; // { kind, targetId, bossId, title }
        this.activeDungeon = null; // { def, tier, dungeonId, tierId }
        this.dungeonUI = null;
        this.partyMeta = (typeof window.PartyMetaSystem !== 'undefined')
            ? window.PartyMetaSystem.createDefaultPartyMeta()
            : null;
        this.autoBattlerController = (typeof window.AutoBattlerController !== 'undefined')
            ? new window.AutoBattlerController(this)
            : null;
        this.autoBattlerUI = (this.autoBattlerController && typeof window.AutoBattlerUI !== 'undefined')
            ? new window.AutoBattlerUI(this, this.autoBattlerController)
            : null;
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
        this.tooltipManager = typeof TooltipManager !== 'undefined' ? new TooltipManager(this) : null;
        
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
        
        // 将game实例暴露到全局，方便开发者模式调用（仅本地 dev server 下可写）
        if (this._localPeDevServer) {
            window.game = this;
        } else {
            Object.defineProperty(window, 'game', {
                configurable: true,
                get: () => this,
                set: () => {
                    console.warn('window.game 为只读；请使用游戏内 ESC 菜单或正常流程操作');
                }
            });
        }

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
            if (typeof WEAPON_AFFINITY_CONFIG !== 'undefined' && WEAPON_AFFINITY_CONFIG.weaponTypes) {
                Object.keys(WEAPON_AFFINITY_CONFIG.weaponTypes).forEach(wt => {
                    imageNames.add('equipment/types/' + wt + '.png');
                });
            }
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

            // 3b. Sprite Sheet 怪物动画
            if (typeof SPRITE_ANIMATIONS !== 'undefined' && SPRITE_ANIMATIONS) {
                const entities = SPRITE_ANIMATIONS.entities || SPRITE_ANIMATIONS;
                Object.keys(entities).forEach((animId) => {
                    const entry = entities[animId];
                    if (entry && entry.sheet && entry.meta) {
                        resourcesToLoad.push({
                            type: 'spriteAnim',
                            name: '动画:' + animId,
                            imageName: entry.sheet,
                            loadFn: () => this.assetManager.loadSpriteAnimation(animId)
                        });
                    }
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

            // 5. 静态美术（职业/Buff/药水/自走棋等）
            if (window.StaticArtPreloader && typeof StaticArtPreloader.collectStaticArtUrls === 'function') {
                StaticArtPreloader.collectStaticArtUrls().forEach(entry => {
                    if (!this.assetManager.genericImageCache.has(entry.url)) {
                        resourcesToLoad.push({
                            type: 'static_art',
                            name: entry.label,
                            imageName: entry.url,
                            category: entry.category,
                            loadFn: () => this.assetManager.preloadImageUrl(entry.url)
                        });
                    }
                });
            }
            
            const totalImages = resourcesToLoad.length;
            console.log('需要加载的资源数量:', totalImages, {
                equipment: resourcesToLoad.filter(r => r.type === 'equipment').length,
                monster: resourcesToLoad.filter(r => r.type === 'monster').length,
                player: resourcesToLoad.filter(r => r.type === 'player').length,
                projectile: resourcesToLoad.filter(r => r.type === 'projectile').length,
                static_art: resourcesToLoad.filter(r => r.type === 'static_art').length
            });
            let loadedImages = 0;
            const failedResources = [];
            
            const showLoadingError = (title, message, onRetry) => {
                const panel = document.getElementById('loading-error-panel');
                const titleEl = document.getElementById('loading-error-title');
                const msgEl = document.getElementById('loading-error-message');
                const retryBtn = document.getElementById('loading-retry-btn');
                if (panel) panel.style.display = 'block';
                if (titleEl) titleEl.textContent = title || '加载失败';
                if (msgEl) msgEl.textContent = message || '';
                if (retryBtn && typeof onRetry === 'function') {
                    retryBtn.onclick = () => {
                        if (panel) panel.style.display = 'none';
                        onRetry();
                    };
                    retryBtn.style.display = '';
                } else if (retryBtn) {
                    retryBtn.style.display = 'none';
                }
            };
            
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
                    projectile: resourcesToLoad.filter(r => r.type === 'projectile').length,
                    static_art: resourcesToLoad.filter(r => r.type === 'static_art').length
                };
                statusText.textContent = `准备加载 ${totalImages} 个资源 (装备:${typeCounts.equipment} 怪物:${typeCounts.monster} 玩家:${typeCounts.player} 飞射体:${typeCounts.projectile} 静态美术:${typeCounts.static_art})...`;
                console.log('状态文本已更新:', statusText.textContent);
            }
            updateProgress();
            await new Promise(resolve => setTimeout(resolve, 300)); // 让UI更新，增加延迟时间
            
            // 批量加载资源（并发 8 个，平衡速度与 UI 响应）
            const batchSize = 8;
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
                                   resource.type === 'projectile' ? '飞射体' :
                                   resource.type === 'static_art' ? '静态美术' : '资源';
                    console.log(`开始加载资源: ${typeName} ${resource.name} (${resource.imageName})`);
                    return resource.loadFn().catch(error => {
                        console.warn(`加载资源失败: ${resource.imageName}`, error);
                        failedResources.push(resource.imageName || resource.name);
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

            if (failedResources.length > 0) {
                const preview = failedResources.slice(0, 5).join('\n');
                const more = failedResources.length > 5 ? `\n…等共 ${failedResources.length} 项` : '';
                showLoadingError(
                    `部分资源加载失败（${failedResources.length}）`,
                    `${preview}${more}\n\n游戏可继续，但相关贴图可能缺失。`,
                    () => this.preloadResources().then(() => this.startGame())
                );
                if (statusText) {
                    statusText.textContent = `${failedResources.length} 个资源加载失败，详见下方提示`;
                }
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            if (window.AutoBattlerAssets && window.AutoBattlerAssets.ensureLoaded) {
                await window.AutoBattlerAssets.ensureLoaded();
            }
            
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
            const panel = document.getElementById('loading-error-panel');
            const titleEl = document.getElementById('loading-error-title');
            const msgEl = document.getElementById('loading-error-message');
            const retryBtn = document.getElementById('loading-retry-btn');
            if (panel) panel.style.display = 'block';
            if (titleEl) titleEl.textContent = '资源加载出错';
            if (msgEl) msgEl.textContent = (error && error.message) ? error.message : String(error);
            if (statusText) statusText.textContent = '加载出错';
            if (retryBtn) {
                retryBtn.onclick = () => {
                    if (panel) panel.style.display = 'none';
                    this.preloadResources().then(() => this.startGame());
                };
            }
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
        if (previousScene !== targetScene && this.player && window.EquipmentEffectSystem
            && typeof window.EquipmentEffectSystem.reset === 'function') {
            window.EquipmentEffectSystem.reset(this.player);
            this.player.updateStats();
        }
        if (previousScene === SCENE_TYPES.TOWER && targetScene !== SCENE_TYPES.TOWER && this.player) {
            this.resetDemonTowerTransientPlayerState();
        }
        if (previousScene === SCENE_TYPES.AUTO_BATTLER && targetScene !== SCENE_TYPES.AUTO_BATTLER) {
            if (this.autoBattlerUI) this.autoBattlerUI.hide();
            if (this.autoBattlerController) {
                this.autoBattlerController.battle = null;
                this.autoBattlerController.run = null;
            }
            if (typeof this.setAutoBattlerPresentation === 'function') {
                this.setAutoBattlerPresentation(false);
            }
        }
        if (targetScene === SCENE_TYPES.AUTO_BATTLER && typeof this.setAutoBattlerPresentation === 'function') {
            this.setAutoBattlerPresentation(true);
        }
        if (typeof this.syncAutoBattlerTownHud === 'function') {
            // 下一帧同步，避免 transition 中途 scene 未落稳
            setTimeout(() => this.syncAutoBattlerTownHud(), 0);
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
     * 根据技能名返回技能图标 URL（若已配置且存在则返回，否则返回 null）
     * @param {string} skillName - 技能名称
     * @returns {string|null}
     */
    resolveIconDisplayUrl(url) {
        if (!url || !this.assetManager) return url;
        return this.assetManager.getCachedDisplayUrl(url);
    }

    getSkillIconUrl(skillName, skillId) {
        if (window.StaticArtPaths && window.StaticArtPaths.getSkillIconUrl) {
            const url = window.StaticArtPaths.getSkillIconUrl(skillId || null, skillName);
            if (url) return this.resolveIconDisplayUrl(url);
        }
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
        return this.resolveIconDisplayUrl(base + imageName);
    }

    /**
     * 根据增幅键（如 attack, defense）返回增幅图标 URL（若已配置则返回，否则返回 null）
     * @param {string} effectKey - 增幅键，与 BUFF_ICON_MAP 的 key 一致
     * @returns {string|null}
     */
    getBuffIconUrl(effectKey) {
        if (window.StaticArtPaths && window.StaticArtPaths.getBuffIconUrl) {
            const url = window.StaticArtPaths.getBuffIconUrl(effectKey);
            if (url) return this.resolveIconDisplayUrl(url);
        }
        if (typeof BUFF_ICON_MAP === 'undefined' || !effectKey || !BUFF_ICON_MAP[effectKey]) return null;
        const base = window.location.protocol === 'file:' ? 'asset/' : (window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'asset/');
        return this.resolveIconDisplayUrl(base + BUFF_ICON_MAP[effectKey]);
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
                iconDiv.style.backgroundSize = 'contain';
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
            iconDiv.style.backgroundSize = 'contain';
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
        } else if ((item.type === 'potion' || (item.type === 'consumable' && item.consumableType === 'potion')) && item.name) {
            const rawUrl = window.StaticArtPaths && window.StaticArtPaths.getPotionIconUrl(item.name);
            const url = rawUrl ? this.resolveIconDisplayUrl(rawUrl) : '';
            if (url) {
                iconDiv.style.backgroundImage = `url(${url})`;
                iconDiv.style.backgroundSize = 'contain';
                iconDiv.style.backgroundPosition = 'center';
                iconDiv.style.backgroundRepeat = 'no-repeat';
            }
        }

        return iconDiv;
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

            // 如果在恶魔塔 / 自走棋 Run 中，显示退出按钮
            const exitBtn = document.getElementById('esc-menu-exit-tower-btn');
            if (exitBtn) {
                if (this.currentScene === SCENE_TYPES.TOWER || this.currentScene === SCENE_TYPES.AUTO_BATTLER) {
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
     * 调整canvas尺寸以占满屏幕
     */
    resizeCanvas() {
        if (this._autoBattlerPresentation) {
            this._applyAutoBattlerCanvasLayout();
            return;
        }
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
     * 自走棋模式：隐藏旧 ARPG HUD，画布铺满视口，避免左右分屏错觉
     */
    setAutoBattlerPresentation(on) {
        this._autoBattlerPresentation = !!on;
        document.body.classList.toggle('pe-auto-battler-mode', !!on);
        document.documentElement.classList.toggle('pe-auto-battler-mode-root', !!on);
        if (on) {
            document.body.classList.remove('pe-auto-battler-town');
            this._applyAutoBattlerCanvasLayout();
            if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
        } else {
            this.resizeCanvas();
            this.syncAutoBattlerTownHud();
        }
    }

    /** 主城启用自走棋时：隐藏旧爬塔 HUD，只留城镇导航 */
    isAutoBattlerTownMode() {
        return !!(typeof window.AutoBattlerController !== 'undefined'
            && window.AutoBattlerController.isEnabled
            && window.AutoBattlerController.isEnabled()
            && this.currentScene === (typeof SCENE_TYPES !== 'undefined' ? SCENE_TYPES.TOWN : 'town')
            && !this._autoBattlerPresentation);
    }

    syncAutoBattlerTownHud() {
        const on = this.isAutoBattlerTownMode();
        document.body.classList.toggle('pe-auto-battler-town', on);
        if (!on) return;
        const roomType = document.getElementById('room-type');
        const floorEl = document.getElementById('floor-number');
        if (roomType) roomType.textContent = '恶魔塔主城';
        if (floorEl) {
            const meta = this.partyMeta || (this.autoBattlerController && this.autoBattlerController.ensurePartyMeta());
            if (meta) {
                floorEl.textContent = `从零开荒 · 最高节点 ${meta.highestRunLayer || 0}`;
            } else {
                floorEl.textContent = '轻操作攀塔';
            }
        }
        const skillBar = document.getElementById('class-skill-bar');
        if (skillBar) skillBar.style.display = 'none';
        const weapon = document.getElementById('weapon-skill-container');
        if (weapon) weapon.style.display = 'none';
    }

    _applyAutoBattlerCanvasLayout() {
        if (!this.canvas) return;
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.transform = 'none';
        this.canvas.style.margin = '0';
        this.canvas.style.width = '100vw';
        this.canvas.style.height = '100vh';
        this.canvas.style.display = 'block';
        this.canvas.style.zIndex = '1';
        this.canvas.style.objectFit = 'cover';
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
            const vfxLabScene = (typeof SCENE_TYPES !== 'undefined' && SCENE_TYPES.AB_SKILL_VFX_LAB)
                ? SCENE_TYPES.AB_SKILL_VFX_LAB
                : 'ab_skill_vfx_lab';
            if (this.currentScene === vfxLabScene && this._abVfxLabBattle) {
                this.tickAbVfxLabPreview();
            }
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
        this._gameLoopStarted = true;
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

if (typeof window !== 'undefined') {
    window.Game = Game;
}

