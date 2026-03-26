/**
 * Pixel Eternal - 游戏资源管理模块
 * 负责图片资源的加载、缓存和管理
 */

/**
 * 资源管理器类
 * 管理装备和炼金材料的图片资源
 */
class AssetManager {
    constructor() {
        // 合铸贴图：按「原材料装备对」复用；names 为展示名别名
        this.fusionCustomIcons = {};
        this.fusionIconsByPairKey = {};
        this.fusionNamesByPairKey = {};
        try {
            const raw2 = localStorage.getItem('pe_fusion_equipment_icons_v2');
            if (raw2) {
                const o = JSON.parse(raw2);
                if (o && typeof o === 'object') {
                    if (o.names && typeof o.names === 'object') this.fusionCustomIcons = o.names;
                    if (o.pairs && typeof o.pairs === 'object') this.fusionIconsByPairKey = o.pairs;
                    if (o.pairNames && typeof o.pairNames === 'object') this.fusionNamesByPairKey = o.pairNames;
                }
            } else {
                const raw1 = localStorage.getItem('pe_fusion_equipment_icons_v1');
                if (raw1) {
                    const o = JSON.parse(raw1);
                    if (o && typeof o === 'object') this.fusionCustomIcons = o;
                }
            }
        } catch (e) { /* ignore */ }

        // 装备图片缓存
        this.equipmentImageCache = new Map();
        
        // 炼金材料图片缓存
        this.alchemyMaterialImageCache = new Map();
        
        // 实体贴图缓存（建筑、房间实体、传送门、地板）
        this.entityImageCache = new Map();
        
        // 怪物贴图缓存
        this.monsterImageCache = new Map();
        
        // 玩家 GIF 帧缓存
        this.playerGifFrames = []; // 存储每一帧的 ImageData 或 canvas
        this.playerGifFrameDelays = []; // 存储每一帧的延迟时间（毫秒）
        this.playerGifLoaded = false;
    }

    /**
     * 获取装备对应的图片文件名
     * @param {string} equipmentName - 装备名称
     * @param {Object|null} eqInstance - 可选，装备实例（有 fusionPairKey 时优先按原材料对取合铸贴图）
     * @returns {string|null} 图片文件名，如果没有对应图片则返回null
     */
    getEquipmentImageName(equipmentName, eqInstance) {
        if (eqInstance && eqInstance.fusionPairKey && this.fusionIconsByPairKey && this.fusionIconsByPairKey[eqInstance.fusionPairKey]) {
            return '__fusion_pair__/' + encodeURIComponent(eqInstance.fusionPairKey);
        }
        if (this.fusionCustomIcons && this.fusionCustomIcons[equipmentName]) {
            return '__fusion__/' + encodeURIComponent(equipmentName);
        }
        // 从 mappings.json 中读取映射
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.equipment && MAPPINGS.equipment[equipmentName]) {
            return MAPPINGS.equipment[equipmentName];
        }
        
        // 回退：如果映射中不存在，尝试使用装备名.png
        if (typeof EQUIPMENT_DEFINITIONS !== 'undefined' && EQUIPMENT_DEFINITIONS.some(e => e.name === equipmentName)) {
            return equipmentName + '.png';
        }
        
        return null;
    }

    /**
     * 加载并处理装备图片
     * @param {string} imageName - 图片文件名
     * @returns {Promise<string>} 处理后的图片URL（data URL）
     */
    async loadAndProcessEquipmentImage(imageName) {
        // 检查缓存
        if (this.equipmentImageCache.has(imageName)) {
            return this.equipmentImageCache.get(imageName);
        }

        if (typeof imageName === 'string' && imageName.indexOf('__fusion__/') === 0) {
            const rawName = decodeURIComponent(imageName.replace('__fusion__/', ''));
            const dataUrl = this.fusionCustomIcons && this.fusionCustomIcons[rawName];
            if (!dataUrl) {
                return Promise.reject(new Error('合铸图标缺失: ' + rawName));
            }
            this.equipmentImageCache.set(imageName, dataUrl);
            return Promise.resolve(dataUrl);
        }

        if (typeof imageName === 'string' && imageName.indexOf('__fusion_pair__/') === 0) {
            const pairKey = decodeURIComponent(imageName.replace('__fusion_pair__/', ''));
            const dataUrl = this.fusionIconsByPairKey && this.fusionIconsByPairKey[pairKey];
            if (!dataUrl) {
                return Promise.reject(new Error('合铸图标缺失(pair): ' + pairKey));
            }
            this.equipmentImageCache.set(imageName, dataUrl);
            return Promise.resolve(dataUrl);
        }

        // imageName已经包含完整路径（如equipment/xxx.png），直接使用
        let imagePath;
        if (window.location.protocol === 'file:') {
            imagePath = 'asset/' + imageName;
        } else {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            imagePath = baseUrl + 'asset/' + imageName;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                try {
                    // 创建canvas来处理图片
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 缩小一圈：缩小10%
                    const scale = 0.9;
                    const newWidth = Math.floor(img.width * scale);
                    const newHeight = Math.floor(img.height * scale);
                    const offsetX = Math.floor((img.width - newWidth) / 2);
                    const offsetY = Math.floor((img.height - newHeight) / 2);
                    
                    canvas.width = newWidth;
                    canvas.height = newHeight;
                    
                    // 绘制缩小后的图片（从原图中心区域裁剪）
                    ctx.drawImage(
                        img,
                        offsetX, offsetY, newWidth, newHeight,  // 源图像区域
                        0, 0, newWidth, newHeight  // 目标canvas区域
                    );
                    
                    // 尝试去除右下角水印（可能会因为跨域问题失败）
                    try {
                        // 去除右下角水印：将右下角20%的区域设为透明
                        const watermarkAreaWidth = Math.floor(newWidth * 0.2);
                        const watermarkAreaHeight = Math.floor(newHeight * 0.2);
                        const watermarkX = newWidth - watermarkAreaWidth;
                        const watermarkY = newHeight - watermarkAreaHeight;
                        
                        // 获取右下角区域的图像数据（这里可能会触发跨域错误）
                        const imageData = ctx.getImageData(watermarkX, watermarkY, watermarkAreaWidth, watermarkAreaHeight);
                        const data = imageData.data;
                        
                        // 检测白色水印区域并设为透明
                        for (let i = 0; i < data.length; i += 4) {
                            const r = data[i];
                            const g = data[i + 1];
                            const b = data[i + 2];
                            // 如果像素接近白色（RGB值都大于200），则设为透明
                            if (r > 200 && g > 200 && b > 200) {
                                data[i + 3] = 0; // alpha设为0（透明）
                            }
                        }
                        
                        // 将处理后的图像数据放回canvas
                        ctx.putImageData(imageData, watermarkX, watermarkY);
                    } catch (watermarkError) {
                        // 如果去除水印失败（跨域问题），继续使用缩小后的图片（不去除水印）
                        // 静默处理，不输出错误
                    }
                    
                    // 尝试转换为data URL（如果canvas被污染，这里也会失败）
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        this.equipmentImageCache.set(imageName, dataUrl);
                        resolve(dataUrl);
                    } catch (dataUrlError) {
                        // 如果转换为data URL失败（跨域问题），使用原始图片URL
                        // 使用CSS的background-size来实现缩小效果
                        this.equipmentImageCache.set(imageName, imagePath);
                        resolve(imagePath);
                    }
                } catch (error) {
                    // 如果整个处理过程失败（包括drawImage），直接使用原始图片URL
                    this.equipmentImageCache.set(imageName, imagePath);
                    resolve(imagePath);
                }
            };
            
            img.onerror = (e) => {
                console.error(`无法加载装备图片: ${imageName}`, e);
                console.error(`尝试的路径: ${imagePath}`);
                reject(new Error(`无法加载图片: ${imageName}`));
            };
            
            // 设置图片源
            img.src = imagePath;
        });
    }

    _persistFusionIconStore() {
        try {
            localStorage.setItem('pe_fusion_equipment_icons_v2', JSON.stringify({
                names: this.fusionCustomIcons || {},
                pairs: this.fusionIconsByPairKey || {},
                pairNames: this.fusionNamesByPairKey || {}
            }));
        } catch (e) {
            console.warn('合铸图标持久化失败', e);
        }
    }

    /**
     * 注册合铸贴图：按原材料对存一份，并按当前展示名存别名（同一对永远共用 dataUrl）
     * @param {string|null} pairKey - computeFusionPairKey 结果；无则仅写 names
     * @param {string} displayName - 装备中文名
     * @param {string} dataUrl - image/png data URL
     */
    registerFusionEquipmentPairAndName(pairKey, displayName, dataUrl) {
        if (!dataUrl) return;
        this.fusionCustomIcons = this.fusionCustomIcons || {};
        this.fusionIconsByPairKey = this.fusionIconsByPairKey || {};
        if (pairKey) {
            this.fusionIconsByPairKey[pairKey] = dataUrl;
            this.equipmentImageCache.delete('__fusion_pair__/' + encodeURIComponent(pairKey));
        }
        if (displayName) {
            this.fusionCustomIcons[displayName] = dataUrl;
            this.equipmentImageCache.delete('__fusion__/' + encodeURIComponent(displayName));
        }
        this._persistFusionIconStore();
    }

    /** @deprecated 请使用 registerFusionEquipmentPairAndName；仅按名称注册（无 pair 复用） */
    registerFusionEquipmentIcon(equipmentName, dataUrl) {
        this.registerFusionEquipmentPairAndName(null, equipmentName, dataUrl);
    }

    getFusionIconDataUrlByPairKey(pairKey) {
        if (!pairKey || !this.fusionIconsByPairKey) return null;
        return this.fusionIconsByPairKey[pairKey] || null;
    }

    /** @returns {string|null} 同一原材料对已缓存的合铸展示名 */
    getFusionDisplayNameForPair(pairKey) {
        if (!pairKey || !this.fusionNamesByPairKey) return null;
        const n = this.fusionNamesByPairKey[pairKey];
        return (typeof n === 'string' && n.trim()) ? n.trim() : null;
    }

    /** 首次合铸某一对时写入展示名，之后同对始终复用 */
    registerFusionDisplayNameForPair(pairKey, displayName) {
        if (!pairKey || !displayName) return;
        const s = String(displayName).trim();
        if (!s) return;
        this.fusionNamesByPairKey = this.fusionNamesByPairKey || {};
        this.fusionNamesByPairKey[pairKey] = s;
        this._persistFusionIconStore();
    }

    /**
     * 为装备元素设置背景图片
     * @param {HTMLElement} element - 要设置背景的元素
     * @param {string} equipmentName - 装备名称
     * @param {string} quality - 装备品质（已废弃，不再使用）
     * @param {Object|null} eqInstance - 可选装备实例（合铸贴图按 fusionPairKey 解析）
     */
    async setEquipmentBackgroundImage(element, equipmentName, quality = null, eqInstance = null) {
        if (!element) {
            console.warn(`setEquipmentBackgroundImage: 元素不存在，装备名称: ${equipmentName}`);
            return Promise.resolve();
        }
        
        const imageName = this.getEquipmentImageName(equipmentName, eqInstance);
        if (!imageName) {
            // 如果没有对应的图片，清除背景图片样式
            if (!element.dataset.itemId) {
                element.style.backgroundImage = '';
                element.style.backgroundSize = '';
                element.style.backgroundPosition = '';
                element.style.backgroundRepeat = '';
            }
            return Promise.resolve();
        }

        // 检查缓存，如果已缓存则直接同步设置，避免异步延迟
        if (this.equipmentImageCache && this.equipmentImageCache.has(imageName)) {
            const imageUrl = this.equipmentImageCache.get(imageName);
            // 检查元素是否仍然存在（不需要parentNode，因为元素可能还未添加到DOM）
            if (element) {
                this._applyImageToElement(element, imageUrl);
            }
            return Promise.resolve();
        }

        // 如果不在缓存中，异步加载
        const itemIdBeforeLoad = element.dataset.itemId;
        try {
            const imageUrl = await this.loadAndProcessEquipmentImage(imageName);
            if (imageUrl) {
                // 检查元素是否仍然存在（不需要parentNode，因为元素可能还未添加到DOM）
                if (!element) {
                    return Promise.resolve();
                }
                
                // 对于有itemId的元素，检查itemId是否仍然存在（防止异步加载期间装备被移除或更换）
                if (!itemIdBeforeLoad || element.dataset.itemId === itemIdBeforeLoad) {
                    this._applyImageToElement(element, imageUrl);
                }
            } else if (!element.dataset.itemId && element) {
                element.style.backgroundImage = '';
            }
            return Promise.resolve();
        } catch (error) {
            // 静默处理错误
            if (element && !element.dataset.itemId) {
                element.style.backgroundImage = '';
            }
            return Promise.resolve();
        }
    }

    /**
     * 应用图片到元素（内部方法）
     * @private
     */
    _applyImageToElement(element, imageUrl) {
        element.style.backgroundImage = `url(${imageUrl})`;
        element.style.backgroundPosition = 'center';
        element.style.backgroundRepeat = 'no-repeat';
        
        // 如果使用的是data URL（已处理的图片），使用contain保持比例，不放大
        // 如果使用的是原始URL（未处理的图片），使用90%缩小
        if (imageUrl.startsWith('data:')) {
            element.style.backgroundSize = 'contain';
        } else {
            element.style.backgroundSize = '90%';
        }
    }

    /**
     * 获取炼金材料对应的图片文件名
     * @param {string} materialName - 材料名称
     * @returns {string|null} 图片文件名，如果没有对应图片则返回null
     */
    getAlchemyMaterialImageName(materialName) {
        // 从 mappings.json 中读取映射
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.alchemy_material && MAPPINGS.alchemy_material[materialName]) {
            return MAPPINGS.alchemy_material[materialName];
        }
        
        // 回退：如果映射中不存在，尝试使用材料名.png
        return materialName + '.png';
    }

    /**
     * 加载并处理炼金材料图片
     * @param {string} imageName - 图片文件名
     * @returns {Promise<string>} 处理后的图片URL（data URL）
     */
    async loadAndProcessAlchemyMaterialImage(imageName) {
        if (this.alchemyMaterialImageCache.has(imageName)) {
            return this.alchemyMaterialImageCache.get(imageName);
        }
        // imageName已经包含完整路径（如alchemy_materials/xxx.png），直接使用
        let imagePath;
        if (window.location.protocol === 'file:') {
            imagePath = 'asset/' + imageName;
        } else {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            imagePath = baseUrl + 'asset/' + imageName;
        }
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const scale = 0.9;
                    const newWidth = Math.floor(img.width * scale);
                    const newHeight = Math.floor(img.height * scale);
                    const offsetX = Math.floor((img.width - newWidth) / 2);
                    const offsetY = Math.floor((img.height - newHeight) / 2);
                    canvas.width = newWidth;
                    canvas.height = newHeight;
                    ctx.drawImage(img, offsetX, offsetY, newWidth, newHeight, 0, 0, newWidth, newHeight);
                    try {
                        const watermarkAreaWidth = Math.floor(newWidth * 0.2);
                        const watermarkAreaHeight = Math.floor(newHeight * 0.2);
                        ctx.clearRect(newWidth - watermarkAreaWidth, newHeight - watermarkAreaHeight, watermarkAreaWidth, watermarkAreaHeight);
                    } catch (e) { /* Cross-origin issue, ignore */ }
                    const dataUrl = canvas.toDataURL('image/png');
                    this.alchemyMaterialImageCache.set(imageName, dataUrl);
                    resolve(dataUrl);
                } catch (error) {
                    this.alchemyMaterialImageCache.set(imageName, imagePath);
                    resolve(imagePath);
                }
            };
            img.onerror = (e) => {
                console.warn(`Failed to load alchemy material image: ${imagePath}`, e);
                this.alchemyMaterialImageCache.set(imageName, imagePath);
                resolve(imagePath);
            };
            img.src = imagePath;
        });
    }

    /**
     * 为炼金材料元素设置背景图片
     * @param {HTMLElement} element - 要设置背景的元素
     * @param {string} materialName - 材料名称
     * @param {string} size - 背景大小（CSS值，如 '48px 48px' 或 'cover'）
     */
    async setAlchemyMaterialBackgroundImage(element, materialName, size = 'cover') {
        if (!element) return Promise.resolve();
        
        // 保存当前的itemId（如果有），用于异步加载完成后的检查
        const itemIdBeforeLoad = element.dataset.itemId;
        
        const imageName = this.getAlchemyMaterialImageName(materialName);
        if (!imageName) {
            if (element) {
                element.style.backgroundImage = '';
            }
            return Promise.resolve();
        }
        if (this.alchemyMaterialImageCache && this.alchemyMaterialImageCache.has(imageName)) {
            const imageUrl = this.alchemyMaterialImageCache.get(imageName);
            // 检查元素是否仍然有效（不需要parentNode，因为元素可能还未添加到DOM）
            if (element) {
                // 如果有itemId，验证是否仍然匹配
                if (!itemIdBeforeLoad || element.dataset.itemId === itemIdBeforeLoad) {
                    element.style.backgroundImage = `url(${imageUrl})`;
                    // 如果使用的是data URL（已处理的图片），使用contain；否则使用传入的size参数
                    if (imageUrl.startsWith('data:')) {
                        element.style.backgroundSize = 'contain';
                    } else {
                        element.style.backgroundSize = size;
                    }
                    element.style.backgroundPosition = 'center';
                    element.style.backgroundRepeat = 'no-repeat';
                }
            }
            return Promise.resolve();
        }
        try {
            const imageUrl = await this.loadAndProcessAlchemyMaterialImage(imageName);
            // 检查元素是否仍然存在（不需要parentNode，因为元素可能还未添加到DOM）
            if (!element) {
                return Promise.resolve();
            }
            
            // 如果有itemId，验证是否仍然匹配
            if (itemIdBeforeLoad && element.dataset.itemId !== itemIdBeforeLoad) {
                // itemId已变化，不设置图片
                return Promise.resolve();
            }
            
            if (imageUrl) {
                element.style.backgroundImage = `url(${imageUrl})`;
                // 如果使用的是data URL（已处理的图片），使用contain；否则使用传入的size参数
                if (imageUrl.startsWith('data:')) {
                    element.style.backgroundSize = 'contain';
                } else {
                    element.style.backgroundSize = size;
                }
                element.style.backgroundPosition = 'center';
                element.style.backgroundRepeat = 'no-repeat';
            } else {
                element.style.backgroundImage = '';
            }
            return Promise.resolve();
        } catch (error) {
            if (element) {
                element.style.backgroundImage = '';
            }
            return Promise.resolve();
        }
    }

    /**
     * 获取建筑对应的图片文件名
     * @param {string} buildingType - 建筑类型（tower_entrance, blacksmith, shop, training_ground, dungeon）
     * @returns {string|null} 图片文件名，如果没有对应图片则返回null
     */
    getBuildingImageName(buildingType) {
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.building && MAPPINGS.building[buildingType]) {
            return MAPPINGS.building[buildingType];
        }
        return null;
    }

    /**
     * 获取房间实体对应的图片文件名
     * @param {string} entityType - 实体类型（treasure_chest, rest_campfire, rest_medkit, rest_fountain, rest_altar, alchemy_table）
     * @returns {string|null} 图片文件名，如果没有对应图片则返回null
     */
    getRoomEntityImageName(entityType) {
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.room_entity && MAPPINGS.room_entity[entityType]) {
            return MAPPINGS.room_entity[entityType];
        }
        return null;
    }

    /**
     * 获取传送门对应的图片文件名
     * @param {string} portalType - 传送门类型（exit, next, return_town, exit_dungeon）
     * @returns {string|null} 图片文件名，如果没有对应图片则返回null
     */
    getPortalImageName(portalType) {
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.portal && MAPPINGS.portal[portalType]) {
            return MAPPINGS.portal[portalType];
        }
        return null;
    }

    /**
     * 获取地板对应的图片文件名
     * @param {string} floorType - 地板类型（town, tower, training, dungeon, dungeon_cave, dungeon_forest, dungeon_void, dungeon_volcano）
     * @returns {string|null} 图片文件名，如果没有对应图片则返回null
     */
    getFloorImageName(floorType) {
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.floor && MAPPINGS.floor[floorType]) {
            return MAPPINGS.floor[floorType];
        }
        return null;
    }

    /**
     * 获取怪物贴图配置
     * @param {string} monsterType - 怪物类型
     * @returns {Object|null} 包含 image 和 scale 的配置对象，如果没有则返回null
     */
    getMonsterImageConfig(monsterType) {
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.monster && MAPPINGS.monster[monsterType]) {
            return MAPPINGS.monster[monsterType];
        }
        return null;
    }

    /**
     * 获取玩家 GIF 配置
     * @returns {Object|null} 包含 image 和 scale 的配置对象，如果没有则返回null
     */
    getPlayerGifConfig() {
        if (typeof MAPPINGS !== 'undefined' && MAPPINGS.player && MAPPINGS.player.player) {
            return MAPPINGS.player.player;
        }
        return null;
    }

    /**
     * 加载怪物贴图
     * @param {string} imageName - 图片文件名
     * @returns {Promise<Image>} 加载完成的Image对象
     */
    async loadMonsterImage(imageName) {
        // 检查缓存
        if (this.monsterImageCache.has(imageName)) {
            return this.monsterImageCache.get(imageName);
        }

        // imageName已经包含完整路径（如monsters/xxx.png），直接使用
        let imagePath;
        if (window.location.protocol === 'file:') {
            const currentPath = window.location.pathname;
            const pathBase = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            imagePath = pathBase + 'asset/' + imageName;
        } else {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            imagePath = baseUrl + 'asset/' + imageName;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                this.monsterImageCache.set(imageName, img);
                resolve(img);
            };
            
            img.onerror = (e) => {
                console.warn(`无法加载怪物贴图: ${imageName}`, e);
                // 即使加载失败也缓存null，避免重复尝试
                this.monsterImageCache.set(imageName, null);
                resolve(null);
            };
            
            img.src = imagePath;
        });
    }

    /**
     * 加载实体贴图（建筑、房间实体、传送门、地板）
     * @param {string} imageName - 图片文件名
     * @returns {Promise<Image>} 加载完成的Image对象
     */
    async loadEntityImage(imageName) {
        // 检查缓存
        if (this.entityImageCache.has(imageName)) {
            return this.entityImageCache.get(imageName);
        }

        // imageName已经包含完整路径（如tiles/xxx.png），直接使用
        let imagePath;
        if (window.location.protocol === 'file:') {
            imagePath = 'asset/' + imageName;
        } else {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            imagePath = baseUrl + 'asset/' + imageName;
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                this.entityImageCache.set(imageName, img);
                resolve(img);
            };
            
            img.onerror = (e) => {
                console.warn(`无法加载实体贴图: ${imageName}`, e);
                console.warn(`尝试的路径: ${imagePath}`);
                // 即使加载失败也缓存null，避免重复尝试
                this.entityImageCache.set(imageName, null);
                resolve(null);
            };
            
            img.src = imagePath;
        });
    }

    /**
     * 绘制实体贴图到canvas
     * @param {CanvasRenderingContext2D} ctx - Canvas上下文
     * @param {Image} img - 图片对象
     * @param {number} x - X坐标（中心点）
     * @param {number} y - Y坐标（中心点）
     * @param {number} width - 绘制宽度
     * @param {number} height - 绘制高度
     */
    drawEntityImage(ctx, img, x, y, width, height) {
        if (!img) return;
        
        ctx.save();
        // 确保使用正确的合成模式以支持透明度
        ctx.globalCompositeOperation = 'source-over';
        // 确保图片平滑不会影响透明度
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // 绘制图片（会自动保留透明度）
        ctx.drawImage(
            img,
            x - width / 2,
            y - height / 2,
            width,
            height
        );
        ctx.restore();
    }

    /**
     * 加载并分解玩家 GIF 成帧
     * @returns {Promise<{frames: Array<HTMLCanvasElement>, delays: Array<number>}>} 帧数组和延迟数组
     */
    async loadPlayerGifFrames() {
        // 检查缓存
        if (this.playerGifLoaded && this.playerGifFrames.length > 0) {
            console.log('loadPlayerGifFrames: 使用缓存');
            return {
                frames: this.playerGifFrames,
                delays: this.playerGifFrameDelays
            };
        }

        // 从mapping中获取玩家GIF路径
        const playerConfig = this.getPlayerGifConfig();
        let gifFileName = 'player/player.gif';
        if (playerConfig && playerConfig.image) {
            gifFileName = playerConfig.image;
        }
        
        // gifFileName已经包含完整路径（如player/player.gif），直接使用
        let imagePath;
        if (window.location.protocol === 'file:') {
            const currentPath = window.location.pathname;
            const pathBase = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
            imagePath = pathBase + 'asset/' + gifFileName;
        } else {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            imagePath = baseUrl + 'asset/' + gifFileName;
        }

        console.log('loadPlayerGifFrames: 开始加载并分解 GIF，路径:', imagePath);

        return new Promise((resolve, reject) => {
            // 使用 libgif.js 来解析 GIF
            // 如果没有 libgif.js，使用备用方案：创建一个隐藏的 img 元素并逐帧提取
            const img = document.createElement('img');
            img.style.display = 'none';
            img.style.position = 'absolute';
            img.style.visibility = 'hidden';
            document.body.appendChild(img);

            // 安全的移除函数
            const safeRemove = () => {
                try {
                    if (img && img.parentNode === document.body) {
                        document.body.removeChild(img);
                    }
                } catch (e) {
                    // 忽略移除错误
                }
            };

            img.onload = () => {
                console.log('loadPlayerGifFrames: GIF 加载成功，开始分解帧');
                this._extractGifFrames(img).then(({frames, delays}) => {
                    this.playerGifFrames = frames;
                    this.playerGifFrameDelays = delays;
                    this.playerGifLoaded = true;
                    safeRemove();
                    console.log(`loadPlayerGifFrames: 成功分解 ${frames.length} 帧`);
                    resolve({frames, delays});
                }).catch(error => {
                    console.error('loadPlayerGifFrames: 分解帧失败', error);
                    safeRemove();
                    resolve({frames: [], delays: []});
                });
            };

            img.onerror = (e) => {
                console.error(`无法加载玩家 GIF: ${imagePath}`, e);
                safeRemove();
                resolve({frames: [], delays: []});
            };

            img.src = imagePath;
        });
    }

    /**
     * 提取 GIF 的每一帧
     * @param {HTMLImageElement} img - GIF 图片元素
     * @returns {Promise<{frames: Array<HTMLCanvasElement>, delays: Array<number>}>}
     */
    async _extractGifFrames(img) {
        return new Promise((resolve, reject) => {
            const frames = [];
            const delays = [];
            
            // 使用 SuperGif (libgif.js) 如果可用
            if (typeof SuperGif !== 'undefined') {
                const gif = new SuperGif({ 
                    gif: img,
                    auto_play: false // 不自动播放
                });
                
                gif.load(() => {
                    try {
                        // 等待一帧，确保 GIF 完全加载
                        setTimeout(() => {
                            try {
                                const frameCount = gif.get_length();
                                const gifCanvas = gif.get_canvas();
                                
                                console.log(`loadPlayerGifFrames: GIF 加载完成，共 ${frameCount} 帧`);
                                
                                // 访问内部 frames 数组来获取延迟信息
                                // 注意：这是 libgif.js 的内部实现，但这是获取延迟信息的唯一方法
                                // 需要通过闭包访问，尝试多种方式
                                let internalFrames = [];
                                try {
                                    // 尝试访问内部 frames（如果可访问）
                                    if (gif.frames) {
                                        internalFrames = gif.frames;
                                    }
                                } catch (e) {
                                    console.warn('无法访问内部 frames，使用默认延迟');
                                }
                                
                                for (let i = 0; i < frameCount; i++) {
                                    // 移动到指定帧
                                    gif.move_to(i);
                                    
                                    // 等待一帧，确保 canvas 更新
                                    // 从 canvas 中提取当前帧
                                    const frameCanvas = document.createElement('canvas');
                                    frameCanvas.width = gifCanvas.width;
                                    frameCanvas.height = gifCanvas.height;
                                    const frameCtx = frameCanvas.getContext('2d');
                                    
                                    // 复制 canvas 内容到新 canvas
                                    frameCtx.drawImage(gifCanvas, 0, 0);
                                    frames.push(frameCanvas);
                                    
                                    // 获取延迟时间（delay 以 1/100 秒为单位，需要乘以 10 转换为毫秒）
                                    let delay = 100; // 默认 100ms
                                    if (internalFrames[i] && internalFrames[i].delay !== undefined) {
                                        delay = internalFrames[i].delay * 10;
                                        if (delay === 0) delay = 100; // 如果延迟为 0，使用默认值
                                    }
                                    delays.push(delay);
                                }
                                
                                console.log(`loadPlayerGifFrames: 成功提取 ${frames.length} 帧`);
                                resolve({frames, delays});
                            } catch (error) {
                                console.error('loadPlayerGifFrames: 提取帧时出错', error);
                                // 备用方案：至少提取第一帧
                                const frameCanvas = document.createElement('canvas');
                                frameCanvas.width = img.naturalWidth || img.width;
                                frameCanvas.height = img.naturalHeight || img.height;
                                const frameCtx = frameCanvas.getContext('2d');
                                frameCtx.drawImage(img, 0, 0);
                                frames.push(frameCanvas);
                                delays.push(100);
                                resolve({frames, delays});
                            }
                        }, 100); // 延迟 100ms 确保 GIF 完全加载
                    } catch (error) {
                        console.error('loadPlayerGifFrames: load 回调出错', error);
                        // 备用方案：至少提取第一帧
                        const frameCanvas = document.createElement('canvas');
                        frameCanvas.width = img.naturalWidth || img.width;
                        frameCanvas.height = img.naturalHeight || img.height;
                        const frameCtx = frameCanvas.getContext('2d');
                        frameCtx.drawImage(img, 0, 0);
                        frames.push(frameCanvas);
                        delays.push(100);
                        resolve({frames, delays});
                    }
                });
            } else {
                // 备用方案：使用 fetch 获取 GIF 数据，然后手动解析
                // 或者简单地提取第一帧作为静态图片
                console.warn('libgif.js 未加载，使用备用方案：仅提取第一帧');
                const frameCanvas = document.createElement('canvas');
                frameCanvas.width = img.naturalWidth || img.width;
                frameCanvas.height = img.naturalHeight || img.height;
                const frameCtx = frameCanvas.getContext('2d');
                frameCtx.drawImage(img, 0, 0);
                frames.push(frameCanvas);
                delays.push(100); // 默认 100ms
                resolve({frames, delays});
            }
        });
    }

}

