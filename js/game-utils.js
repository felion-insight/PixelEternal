/**
 * Pixel Eternal - 游戏工具函数模块
 * 包含通用的工具函数
 */

/**
 * 格式化数值，最多保留2位小数
 * @param {number} value - 要格式化的数值
 * @returns {string|number} 格式化后的数值（如果是整数则返回原值，否则返回保留2位小数的字符串）
 */
function formatNumber(value) {
    if (typeof value !== 'number' || isNaN(value)) {
        return value;
    }
    // 如果是整数，直接返回
    if (value % 1 === 0) {
        return value;
    }
    // 否则保留2位小数
    return value.toFixed(2);
}

