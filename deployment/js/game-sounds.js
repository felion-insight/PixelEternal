/**
 * Pixel Eternal - 音效管理模块
 * 管理游戏中的所有音效播放
 */

/**
 * 音效管理器类
 * 负责加载、缓存和播放游戏音效
 */
class SoundManager {
    constructor() {
        this.soundCache = new Map(); // 音效缓存
        this.walkSound = null; // 走路音效（需要循环播放）
        this.isWalking = false; // 是否正在走路
        this.lastWalkSoundTime = 0; // 上次播放走路音效的时间
        this.walkSoundInterval = 300; // 走路音效间隔（毫秒）
        this.basePath = window.location.protocol === 'file:' 
            ? 'asset/' 
            : (window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'asset/');
        
        // 背景音乐管理
        this.currentBgm = null; // 当前播放的背景音乐
        this.currentBgmName = null; // 当前背景音乐名称
        this.bgmCache = new Map(); // 背景音乐缓存

        /** 0～1，与单轨配置音量相乘（背景音乐总音量） */
        this.masterMusicVolume = 1;
        /** 0～1，与单轨配置音量相乘（音效总音量，含走路） */
        this.masterSfxVolume = 1;
        this._loadVolumePrefsFromStorage();
    }

    _loadVolumePrefsFromStorage() {
        try {
            const m = localStorage.getItem('pixelEternal_volMusic');
            const s = localStorage.getItem('pixelEternal_volSfx');
            if (m !== null) {
                const v = parseFloat(m);
                if (Number.isFinite(v)) this.masterMusicVolume = Math.max(0, Math.min(1, v));
            }
            if (s !== null) {
                const v = parseFloat(s);
                if (Number.isFinite(v)) this.masterSfxVolume = Math.max(0, Math.min(1, v));
            }
        } catch (e) {
            /* 忽略存储异常 */
        }
    }

    saveVolumePrefsToStorage() {
        try {
            localStorage.setItem('pixelEternal_volMusic', String(this.masterMusicVolume));
            localStorage.setItem('pixelEternal_volSfx', String(this.masterSfxVolume));
        } catch (e) {
            /* 忽略 */
        }
    }

    setMasterMusicVolume(v) {
        this.masterMusicVolume = Math.max(0, Math.min(1, typeof v === 'number' ? v : 1));
        this.refreshCurrentBgmVolume();
    }

    setMasterSfxVolume(v) {
        this.masterSfxVolume = Math.max(0, Math.min(1, typeof v === 'number' ? v : 1));
        this.refreshWalkSoundVolume();
    }

    refreshCurrentBgmVolume() {
        if (!this.currentBgm || !this.currentBgmName) return;
        const base = this.getBgmVolume(this.currentBgmName);
        this.currentBgm.volume = Math.min(1, Math.max(0, base * this.masterMusicVolume));
    }

    refreshWalkSoundVolume() {
        if (!this.walkSound) return;
        const base = this.getSoundVolume('walk', 0.3);
        this.walkSound.volume = Math.min(1, Math.max(0, base * this.masterSfxVolume));
    }
    
    /**
     * 获取音效文件路径
     * @param {string} soundName - 音效名称（如 'burn', 'hit' 等）
     * @returns {string|null} 音效文件路径，如果未配置则返回null
     */
    getSoundPath(soundName) {
        if (typeof MAPPINGS === 'undefined' || !MAPPINGS.sounds || !MAPPINGS.sounds[soundName]) {
            return null;
        }
        const soundConfig = MAPPINGS.sounds[soundName];
        // 支持对象格式 {file: "...", volume: ...} 和字符串格式（向后兼容）
        const fileName = typeof soundConfig === 'object' ? soundConfig.file : soundConfig;
        return this.basePath + fileName;
    }
    
    /**
     * 获取音效音量配置
     * @param {string} soundName - 音效名称
     * @param {number} defaultVolume - 默认音量（0-1）
     * @returns {number} 音量值（0-1）
     */
    getSoundVolume(soundName, defaultVolume = 0.5) {
        if (typeof MAPPINGS === 'undefined' || !MAPPINGS.sounds || !MAPPINGS.sounds[soundName]) {
            return defaultVolume;
        }
        const soundConfig = MAPPINGS.sounds[soundName];
        // 如果是对象格式，返回配置的volume；否则返回默认值
        if (typeof soundConfig === 'object' && soundConfig.volume !== undefined) {
            return soundConfig.volume;
        }
        return defaultVolume;
    }
    
    /**
     * 加载音效
     * @param {string} soundName - 音效名称
     * @returns {Promise<HTMLAudioElement>} 音频元素
     */
    async loadSound(soundName) {
        // 检查缓存
        if (this.soundCache.has(soundName)) {
            return this.soundCache.get(soundName);
        }
        
        const soundPath = this.getSoundPath(soundName);
        if (!soundPath) {
            console.warn(`音效未配置: ${soundName}`);
            return null;
        }
        
        return new Promise((resolve, reject) => {
            const audio = new Audio(soundPath);
            audio.preload = 'auto';
            
            audio.addEventListener('canplaythrough', () => {
                this.soundCache.set(soundName, audio);
                resolve(audio);
            });
            
            audio.addEventListener('error', (e) => {
                console.warn(`音效加载失败: ${soundName}`, e);
                resolve(null); // 加载失败时返回null，不阻塞游戏
            });
            
            // 开始加载
            audio.load();
        });
    }
    
    /**
     * 播放音效（触发式）
     * @param {string} soundName - 音效名称
     * @param {number} volumeOverride - 音量覆盖值（0-1），如果提供则优先使用，否则从mappings读取
     */
    async playSound(soundName, volumeOverride = null) {
        try {
            let audio = this.soundCache.get(soundName);
            if (!audio) {
                audio = await this.loadSound(soundName);
                if (!audio) return;
            }
            
            // 如果提供了volumeOverride，使用它；否则从mappings读取；再乘主音效音量
            let volume = volumeOverride !== null ? volumeOverride : this.getSoundVolume(soundName);
            volume = Math.min(1, Math.max(0, volume * this.masterSfxVolume));
            
            // 创建新的音频实例以避免重叠播放时的冲突
            const audioClone = audio.cloneNode();
            audioClone.volume = volume;
            audioClone.play().catch(err => {
                // 忽略自动播放被阻止的错误（用户需要先交互）
                if (err.name !== 'NotAllowedError') {
                    console.warn(`音效播放失败: ${soundName}`, err);
                }
            });
        } catch (error) {
            console.warn(`播放音效出错: ${soundName}`, error);
        }
    }
    
    /**
     * 开始播放走路音效（循环）
     */
    startWalkSound() {
        if (this.isWalking) return;
        this.isWalking = true;
        
        // 如果还没有加载，先加载
        if (!this.walkSound) {
            this.loadSound('walk').then(audio => {
                if (audio) {
                    this.walkSound = audio.cloneNode();
                    this.walkSound.loop = true;
                    {
                        const wv = this.getSoundVolume('walk', 0.3);
                        this.walkSound.volume = Math.min(1, Math.max(0, wv * this.masterSfxVolume));
                    }
                    if (this.isWalking) {
                        this.walkSound.play().catch(err => {
                            if (err.name !== 'NotAllowedError') {
                                console.warn('走路音效播放失败', err);
                            }
                        });
                    }
                }
            });
        } else {
            // 如果已经加载，直接播放
            this.walkSound.currentTime = 0;
            {
                const wv = this.getSoundVolume('walk', 0.3);
                this.walkSound.volume = Math.min(1, Math.max(0, wv * this.masterSfxVolume));
            }
            this.walkSound.play().catch(err => {
                if (err.name !== 'NotAllowedError') {
                    console.warn('走路音效播放失败', err);
                }
            });
        }
    }
    
    /**
     * 停止播放走路音效
     */
    stopWalkSound() {
        if (!this.isWalking) return;
        this.isWalking = false;
        
        if (this.walkSound) {
            this.walkSound.pause();
            this.walkSound.currentTime = 0;
        }
    }
    
    /**
     * 更新走路音效状态（根据玩家是否在移动）
     * @param {boolean} isMoving - 玩家是否在移动
     */
    updateWalkSound(isMoving) {
        if (isMoving && !this.isWalking) {
            this.startWalkSound();
        } else if (!isMoving && this.isWalking) {
            this.stopWalkSound();
        }
    }
    
    /**
     * 获取背景音乐文件路径
     * @param {string} bgmName - 背景音乐名称（如 'town', 'battle'）
     * @returns {string|null} 背景音乐文件路径，如果未配置则返回null
     */
    getBgmPath(bgmName) {
        if (typeof MAPPINGS === 'undefined' || !MAPPINGS.bgm || !MAPPINGS.bgm[bgmName]) {
            return null;
        }
        const bgmConfig = MAPPINGS.bgm[bgmName];
        // 支持对象格式 {file: "...", volume: ...} 和字符串格式（向后兼容）
        const fileName = typeof bgmConfig === 'object' ? bgmConfig.file : bgmConfig;
        return this.basePath + fileName;
    }
    
    /**
     * 获取背景音乐音量配置
     * @param {string} bgmName - 背景音乐名称
     * @param {number} defaultVolume - 默认音量（0-1）
     * @returns {number} 音量值（0-1）
     */
    getBgmVolume(bgmName, defaultVolume = 0.5) {
        if (typeof MAPPINGS === 'undefined' || !MAPPINGS.bgm || !MAPPINGS.bgm[bgmName]) {
            return defaultVolume;
        }
        const bgmConfig = MAPPINGS.bgm[bgmName];
        // 如果是对象格式，返回配置的volume；否则返回默认值
        if (typeof bgmConfig === 'object' && bgmConfig.volume !== undefined) {
            return bgmConfig.volume;
        }
        return defaultVolume;
    }
    
    /**
     * 加载背景音乐
     * @param {string} bgmName - 背景音乐名称
     * @returns {Promise<HTMLAudioElement>} 音频元素
     */
    async loadBgm(bgmName) {
        // 检查缓存
        if (this.bgmCache.has(bgmName)) {
            return this.bgmCache.get(bgmName);
        }
        
        const bgmPath = this.getBgmPath(bgmName);
        if (!bgmPath) {
            console.warn(`背景音乐未配置: ${bgmName}`);
            return null;
        }
        
        return new Promise((resolve, reject) => {
            const audio = new Audio(bgmPath);
            audio.preload = 'auto';
            audio.loop = true; // 背景音乐循环播放
            
            audio.addEventListener('canplaythrough', () => {
                this.bgmCache.set(bgmName, audio);
                resolve(audio);
            });
            
            audio.addEventListener('error', (e) => {
                console.warn(`背景音乐加载失败: ${bgmName}`, e);
                resolve(null); // 加载失败时返回null，不阻塞游戏
            });
            
            // 开始加载
            audio.load();
        });
    }
    
    /**
     * 播放背景音乐
     * @param {string} bgmName - 背景音乐名称（如 'town', 'battle'）
     * @param {number} volumeOverride - 音量覆盖值（0-1），如果提供则优先使用，否则从mappings读取
     */
    async playBgm(bgmName, volumeOverride = null) {
        console.log(`playBgm 被调用，bgmName: ${bgmName}, 当前播放: ${this.currentBgmName}`);
        
        // 如果已经在播放相同的背景音乐，不重复播放
        if (this.currentBgmName === bgmName) {
            console.log('已经在播放相同的背景音乐，跳过');
            return;
        }
        this.currentBgmName = bgmName;
        
        // 停止所有可能正在播放的背景音乐（包括当前的和所有缓存的）
        console.log('停止所有背景音乐');
        this.stopAllBgm();
        
        try {
            // 从缓存中获取或加载背景音乐
            let audio = await this.loadBgm(bgmName);
            
            // 确保这个音频实例是停止的（防止它之前被播放过）
            try {
                if (!audio.paused) {
                    console.log(`警告: ${bgmName} 音频实例仍在播放，强制停止`);
                    audio.pause();
                }
                audio.currentTime = 0;
            } catch (e) {
                console.warn(`重置 ${bgmName} 音频时出错:`, e);
            }
            
            // 检查音频是否已经加载完成（readyState: 4 = HAVE_ENOUGH_DATA）
            // 如果音频被 load() 重置，readyState 可能变成 0，需要等待加载完成
            if (audio.readyState < 4) {
                console.log(`等待 ${bgmName} 音频加载完成，当前 readyState: ${audio.readyState}`);
                await new Promise((resolve) => {
                    const onCanPlay = () => {
                        audio.removeEventListener('canplaythrough', onCanPlay);
                        audio.removeEventListener('error', onError);
                        resolve();
                    };
                    const onError = () => {
                        audio.removeEventListener('canplaythrough', onCanPlay);
                        audio.removeEventListener('error', onError);
                        console.warn(`${bgmName} 音频加载失败`);
                        resolve(); // 即使失败也继续，让 play() 处理错误
                    };
                    audio.addEventListener('canplaythrough', onCanPlay);
                    audio.addEventListener('error', onError);
                    // 如果已经可以播放，立即解析
                    if (audio.readyState >= 3) {
                        setTimeout(() => {
                            if (audio.readyState >= 3) {
                                audio.removeEventListener('canplaythrough', onCanPlay);
                                audio.removeEventListener('error', onError);
                                resolve();
                            }
                        }, 100);
                    }
                });
            }
            
            // 确保音频设置正确
            audio.loop = true;
            
            // 如果提供了volumeOverride，使用它；否则从mappings读取；再乘主音乐音量
            const baseVol = volumeOverride !== null ? volumeOverride : this.getBgmVolume(bgmName);
            const volume = Math.min(1, Math.max(0, baseVol * this.masterMusicVolume));
            audio.volume = volume;
            
            // 保存当前播放的背景音乐
            this.currentBgm = audio;
            this.currentBgmName = bgmName;
            
            console.log(`开始播放背景音乐: ${bgmName}, 音量: ${volume}, paused: ${audio.paused}, readyState: ${audio.readyState}`);
            
            // 播放背景音乐
            audio.play().catch(err => {
                // 忽略自动播放被阻止的错误（用户需要先交互）
                if (err.name !== 'NotAllowedError') {
                    console.warn(`背景音乐播放失败: ${bgmName}`, err);
                } else {
                    console.log('背景音乐自动播放被阻止（需要用户交互）');
                }
            });
        } catch (error) {
            console.warn(`播放背景音乐出错: ${bgmName}`, error);
        }
    }
    
    /**
     * 暂停背景音乐（保留播放位置，用于恢复）
     */
    pauseBgm() {
        if (this.currentBgm && !this.currentBgm.paused) {
            try {
                this.currentBgm.pause();
            } catch (e) {
                console.warn('暂停背景音乐失败:', e);
            }
        }
    }
    
    /**
     * 恢复播放背景音乐
     */
    resumeBgm() {
        if (this.currentBgm && this.currentBgm.paused) {
            try {
                this.currentBgm.play().catch(err => {
                    if (err.name !== 'NotAllowedError') {
                        console.warn('恢复背景音乐失败:', err);
                    }
                });
            } catch (e) {
                console.warn('恢复背景音乐失败:', e);
            }
        }
    }
    
    /**
     * 停止播放背景音乐
     */
    stopBgm() {
        if (this.currentBgm) {
            try {
                const audioToStop = this.currentBgm;
                const bgmNameToStop = this.currentBgmName;
                console.log(`停止当前背景音乐: ${bgmNameToStop}, paused: ${audioToStop.paused}, currentTime: ${audioToStop.currentTime}, readyState: ${audioToStop.readyState}`);
                
                // 强制暂停播放（无论当前状态如何）
                try {
                    audioToStop.pause();
                } catch (e) {
                    console.warn('pause()调用失败:', e);
                }
                
                // 立即重置播放位置
                try {
                    audioToStop.currentTime = 0;
                } catch (e) {
                    // 某些浏览器可能不允许设置currentTime，忽略错误
                    console.log('无法重置currentTime:', e);
                }
                
                // 注意：不调用 load()，因为这会重置 readyState，导致需要重新加载
                // 只暂停和重置位置就足够了
                
                // 验证是否真的停止了
                setTimeout(() => {
                    if (!audioToStop.paused) {
                        console.warn(`警告: ${bgmNameToStop} 音频在停止后仍在播放，强制暂停`);
                        try {
                            audioToStop.pause();
                            audioToStop.currentTime = 0;
                        } catch (e) {
                            console.warn('延迟停止失败:', e);
                        }
                    }
                }, 50);
                
            } catch (error) {
                console.warn('停止背景音乐时出错:', error);
            }
            this.currentBgm = null;
            this.currentBgmName = null;
        }
    }
    
    /**
     * 停止所有背景音乐（包括当前播放的和所有缓存的）
     */
    stopAllBgm() {
        // 强制停止所有缓存的背景音乐（不管它们是否在播放）
        try {
            for (const [bgmName, audio] of this.bgmCache.entries()) {
                if (audio) {
                    console.log(`强制停止缓存的背景音乐: ${bgmName}, paused: ${audio.paused}, currentTime: ${audio.currentTime}, readyState: ${audio.readyState}`);
                    try {
                        // 先暂停（如果正在播放）
                        if (!audio.paused) {
                            audio.pause();
                        }
                        
                        // 重置播放位置（必须在pause之后）
                        try {
                            audio.currentTime = 0;
                        } catch (e) {
                            // 某些浏览器可能不允许设置currentTime，忽略错误
                            console.log(`无法重置 ${bgmName} 的currentTime:`, e);
                        }
                        
                        // 注意：不调用 load()，因为这会重置 readyState，导致需要重新加载
                        // 只暂停和重置位置就足够了
                    } catch (e) {
                        console.warn(`停止 ${bgmName} 时出错:`, e);
                    }
                }
            }
        } catch (error) {
            console.warn('停止所有背景音乐时出错:', error);
        }
    }
    
    /**
     * 根据场景类型播放对应的背景音乐
     * @param {string} sceneType - 场景类型 (SCENE_TYPES.TOWN, SCENE_TYPES.TOWER, SCENE_TYPES.TRAINING)
     */
    playBgmForScene(sceneType) {
        console.log('playBgmForScene 被调用，场景类型:', sceneType);
        
        // 主城和训练场使用town背景音乐
        // SCENE_TYPES.TOWN = 'town', SCENE_TYPES.TRAINING = 'training'
        if (sceneType === 'town' || sceneType === 'training') {
            console.log('播放town背景音乐');
            this.playBgm('town');
        }
        // 恶魔塔使用 battle 背景音乐
        else if (sceneType === 'tower') {
            console.log('播放battle背景音乐');
            this.playBgm('battle');
        }
        // 其他情况停止背景音乐
        else {
            console.log('停止背景音乐，未知场景类型:', sceneType);
            this.stopBgm();
        }
    }
}

