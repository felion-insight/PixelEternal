/**
 * Pixel Eternal - 工具提示系统模块
 * 负责物品和套装效果的工具提示显示
 */

/**
 * 工具提示管理器类
 */
class TooltipManager {
    constructor(gameInstance) {
        this.game = gameInstance;
    }

    /**
     * 调整工具提示位置，确保不超出屏幕
     * @param {HTMLElement} tooltip - 工具提示元素
     * @param {number} x - 鼠标X坐标
     * @param {number} y - 鼠标Y坐标
     * @param {number} offsetX - X偏移量
     * @param {number} offsetY - Y偏移量
     */
    adjustTooltipPosition(tooltip, x, y, offsetX = 10, offsetY = 10) {
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

    /**
     * 显示物品工具提示
     * @param {HTMLElement} element - 触发元素
     * @param {number} x - 鼠标X坐标
     * @param {number} y - 鼠标Y坐标
     */
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
        Object.values(this.game.player.equipment).forEach(eq => {
            if (eq && eq.id.toString() === itemId) {
                item = eq;
            }
        });
        if (!item) {
            this.game.player.inventory.forEach(inv => {
                if (inv && inv.id.toString() === itemId) {
                    item = inv;
                }
            });
        }
        
        if (item) {
            // 支持装备和药水，装备传入当前已穿戴以区分套装激活/未激活
            if (item.getTooltipHTML) {
                const isEquipment = (item.type === 'equipment') || (item.slot != null && item.stats != null);
                tooltip.innerHTML = isEquipment ? item.getTooltipHTML(this.game.player.equipment) : item.getTooltipHTML();
            } else {
                // 兼容旧代码
                tooltip.innerHTML = `<h4>${item.name || '未知物品'}</h4>`;
            }
            // 使用位置调整函数
            this.adjustTooltipPosition(tooltip, x, y);
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
            getActiveSetEffects(this.game.player.equipment).forEach(e => {
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
                html += `<p style="color: ${color}; font-size: 10px;">${pieceCount}件: ${effect.description}${activeText}</p>`;
            }
        }

        tooltip.innerHTML = html;
        tooltip.classList.add('show');
        // 移除可能存在的 display: none 样式，让 CSS 的 .show 类控制显示
        tooltip.style.display = '';
        this.adjustTooltipPosition(tooltip, x, y);
    }
}

