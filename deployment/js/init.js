/**
 * Pixel Eternal - 游戏初始化模块
 * 页面加载完成后启动游戏
 */

// ====================================================================
// 模块5: 游戏初始化
// ====================================================================

/**
 * 在加载界面显示初始化错误
 * @param {string} title
 * @param {string} message
 * @param {Function} [onRetry]
 */
function showInitError(title, message, onRetry) {
    const loadingScreen = document.getElementById('loading-screen');
    const panel = document.getElementById('loading-error-panel');
    const titleEl = document.getElementById('loading-error-title');
    const msgEl = document.getElementById('loading-error-message');
    const retryBtn = document.getElementById('loading-retry-btn');
    const statusText = document.getElementById('loading-status-text');

    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        loadingScreen.style.visibility = 'visible';
        loadingScreen.style.opacity = '1';
    }
    if (statusText) statusText.textContent = title || '初始化失败';
    if (panel) panel.style.display = 'block';
    if (titleEl) titleEl.textContent = title || '初始化失败';
    if (msgEl) msgEl.textContent = message || '';
    if (retryBtn) {
        if (typeof onRetry === 'function') {
            retryBtn.style.display = '';
            retryBtn.onclick = () => {
                if (panel) panel.style.display = 'none';
                onRetry();
            };
        } else {
            retryBtn.style.display = 'none';
        }
    }
}

console.log('init.js 脚本已加载，当前文档状态:', document.readyState);

// 防止重复初始化
if (window.gameInitialized) {
    console.log('游戏已经初始化（通过HTML脚本），跳过 init.js');
} else {
    window.gameInitialized = true;

    // 定义初始化函数
    let initRetryCount = 0;
    const MAX_INIT_RETRIES = 10; // 最多重试10次
    const initializeGame = async function() {
        console.log('initializeGame 函数被调用');
        
        // 先加载配置
        if (typeof configLoader !== 'undefined' && !configLoader.loaded) {
            console.log('加载配置文件...');
            try {
                await configLoader.loadAll();
                console.log('配置文件加载完成');
                if (configLoader.degradedMode) {
                    showInitError(
                        '配置降级模式',
                        '当前以 file:// 打开或部分配置未加载，游戏功能可能受限。\n\n建议使用本地服务器运行：\n  python start-server.py\n  或 python -m http.server 8000\n\n然后访问 http://localhost:8000/index.html',
                        () => initializeGame()
                    );
                }
            } catch (error) {
                console.error('配置文件加载失败:', error);
                showInitError(
                    '配置文件加载失败',
                    (error && error.message ? error.message : String(error))
                        + '\n\n请使用本地 HTTP 服务器运行游戏（python start-server.py）。',
                    () => {
                        if (typeof configLoader !== 'undefined') {
                            configLoader.loaded = false;
                            configLoader.configs = {};
                        }
                        initializeGame();
                    }
                );
                return;
            }
        }
        
        // 检查Game类是否已定义
        if (typeof Game === 'undefined') {
            initRetryCount++;
            if (initRetryCount >= MAX_INIT_RETRIES) {
                console.error('Game 类在1秒内仍未加载，停止重试。请检查 game-main.js 是否有语法错误。');
                showInitError(
                    '游戏脚本加载失败',
                    'Game 类未定义，请检查 game-main.js 是否有语法错误，或刷新页面重试。',
                    () => {
                        initRetryCount = 0;
                        initializeGame();
                    }
                );
                return;
            }
            console.warn(`Game 类尚未定义，等待100ms后重试... (${initRetryCount}/${MAX_INIT_RETRIES})`);
            setTimeout(initializeGame, 100);
            return;
        }
        
        // 确保加载界面可见
        const loadingScreen = document.getElementById('loading-screen');
        console.log('加载界面元素:', loadingScreen);
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
            loadingScreen.style.visibility = 'visible';
            loadingScreen.style.opacity = '1';
            console.log('加载界面已设置为可见');
        } else {
            console.error('未找到加载界面元素！');
            return; // 如果找不到加载界面，直接返回
        }
        
        // 确保游戏容器隐藏
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            gameContainer.style.display = 'none';
        }
        
        try {
            console.log('创建Game实例...');
            const game = new Game();
            console.log('Game实例创建成功');
            
            // 预加载所有资源
            console.log('开始预加载资源...');
            await game.preloadResources();
            console.log('资源预加载完成');
            
            // 资源加载完成后启动游戏
            console.log('启动游戏...');
            game.startGame();
        } catch (error) {
            console.error('游戏初始化出错:', error, error.stack);
            showInitError(
                '游戏初始化失败',
                (error && error.message ? error.message : String(error)),
                () => initializeGame()
            );
        }
    };

    // 使用多种方式确保初始化函数被调用
    // 等待Game类加载完成后再初始化
    let retryCount = 0;
    const MAX_RETRIES = 50; // 最多重试50次（5秒）
    const tryInitializeWithRetry = () => {
        if (typeof Game === 'undefined') {
            retryCount++;
            if (retryCount >= MAX_RETRIES) {
                console.error('Game 类在5秒内仍未加载，停止重试。请检查 game-main.js 是否有语法错误。');
                showInitError(
                    '游戏脚本加载失败',
                    'Game 类在 5 秒内未加载，请检查控制台错误或刷新页面。',
                    () => {
                        retryCount = 0;
                        tryInitializeWithRetry();
                    }
                );
                return;
            }
            console.log(`Game 类尚未定义，等待100ms后重试... (${retryCount}/${MAX_RETRIES})`);
            setTimeout(tryInitializeWithRetry, 100);
            return;
        }
        
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            console.log('文档已准备好，立即执行初始化');
            // 延迟一点，确保所有脚本都已加载
            setTimeout(() => {
                initializeGame();
            }, 100);
        } else {
            console.log('等待 DOMContentLoaded 或 load 事件...');
            // 同时监听两个事件，确保能触发
            let initialized = false;
            const doInit = () => {
                if (!initialized) {
                    initialized = true;
                    console.log('事件触发，开始初始化游戏...');
                    initializeGame();
                }
            };
            
            document.addEventListener('DOMContentLoaded', doInit);
            window.addEventListener('load', doInit);
            
            // 如果3秒后还没触发，强制初始化
            setTimeout(() => {
                if (!initialized) {
                    console.warn('超时，强制初始化游戏');
                    initialized = true;
                    initializeGame();
                }
            }, 3000);
        }
    };

    // 开始尝试初始化
    tryInitializeWithRetry();
} // 结束 if (!window.gameInitialized) 块
