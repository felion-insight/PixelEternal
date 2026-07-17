/**
 * Pixel Eternal - 物品详情面板
 * 点击装备格子展开详情；不再依赖鼠标悬浮。
 */

class TooltipManager {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.pinned = null; // { source: 'inventory'|'equipment'|'shop'|'set', index?, slot?, itemId }
        this._outsideBound = null;
        this._ensureOutsideClose();
    }

    _ensureOutsideClose() {
        if (this._outsideBound) return;
        this._outsideBound = (e) => {
            const tooltip = document.getElementById('item-tooltip');
            if (!tooltip || !tooltip.classList.contains('show') || !tooltip.classList.contains('pinned')) return;
            if (tooltip.contains(e.target)) return;
            if (e.target.closest && (
                e.target.closest('.inventory-slot') ||
                e.target.closest('.equipment-item') ||
                e.target.closest('.shop-item-name') ||
                e.target.closest('.set-effect-line')
            )) return;
            this.closeItemDetailPanel();
        };
        document.addEventListener('mousedown', this._outsideBound, true);
    }

    adjustTooltipPosition(tooltip, x, y, offsetX = 14, offsetY = 14) {
        tooltip.style.left = '-9999px';
        tooltip.style.top = '-9999px';
        tooltip.classList.add('show');

        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let finalX = x + offsetX;
        let finalY = y + offsetY;

        if (finalX + tooltipWidth > viewportWidth) {
            finalX = viewportWidth - tooltipWidth - 10;
            if (finalX < 10) {
                finalX = Math.max(10, x - tooltipWidth - offsetX);
            }
        }
        if (finalX < 10) finalX = 10;

        if (finalY + tooltipHeight > viewportHeight) {
            finalY = viewportHeight - tooltipHeight - 10;
            if (finalY < 10) {
                finalY = Math.max(10, y - tooltipHeight - offsetY);
            }
        }
        if (finalY < 10) finalY = 10;

        tooltip.style.left = finalX + 'px';
        tooltip.style.top = finalY + 'px';
    }

    _resolveItemFromElement(element) {
        const root = element.closest && (element.closest('.inventory-slot') || element.closest('.equipment-item')) || element;
        const itemId = (root.dataset && root.dataset.itemId) || element.dataset.itemId;
        if (!itemId) return { root, itemId: null, item: null };

        let item = null;
        Object.values(this.game.player.equipment).forEach(eq => {
            if (eq && eq.id.toString() === itemId) item = eq;
        });
        if (!item) {
            this.game.player.inventory.forEach(inv => {
                if (inv && inv.id.toString() === itemId) item = inv;
            });
        }
        return { root, itemId, item };
    }

    _buildDetailHtml(displayItem, actions) {
        let html = '';
        if (displayItem.getTooltipHTML) {
            const isEquipment = (displayItem.type === 'equipment')
                || (displayItem.slot != null && displayItem.stats != null);
            html = isEquipment
                ? displayItem.getTooltipHTML(this.game.player.equipment)
                : displayItem.getTooltipHTML();
            if (isEquipment && typeof window.appendBuildEquipmentTooltip === 'function') {
                html = window.appendBuildEquipmentTooltip(html, displayItem);
            }
        } else {
            html = `<h4>${displayItem.name || '未知物品'}</h4>`;
        }

        const buttons = [];
        if (actions && actions.primaryLabel) {
            buttons.push(`<button type="button" class="item-detail-btn primary" data-detail-action="primary">${actions.primaryLabel}</button>`);
        }
        buttons.push('<button type="button" class="item-detail-btn" data-detail-action="close">关闭</button>');
        html += `<div class="item-detail-actions">${buttons.join('')}</div>`;
        return html;
    }

    _bindPanelActions(tooltip) {
        const actions = tooltip.querySelector('.item-detail-actions');
        if (!actions) return;
        actions.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-detail-action]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const action = btn.dataset.detailAction;
            if (action === 'close') {
                this.closeItemDetailPanel();
                return;
            }
            if (action === 'primary' && this.pinned) {
                this._runPrimaryAction();
            }
        });
    }

    _runPrimaryAction() {
        const pin = this.pinned;
        if (!pin) return;
        if (pin.source === 'inventory' && typeof pin.index === 'number') {
            this.closeItemDetailPanel();
            this.game.handleInventorySlotClick(pin.index);
            return;
        }
        if (pin.source === 'equipment' && pin.slot) {
            this.closeItemDetailPanel();
            this.game.handleEquipmentSlotClick(pin.slot);
        }
    }

    _clearDetailHighlight() {
        document.querySelectorAll('.inventory-slot.detail-open, .equipment-item.detail-open').forEach(el => {
            el.classList.remove('detail-open');
        });
    }

    /**
     * 点击展开物品详情面板（钉住）
     */
    openItemDetailPanel(element, clientX, clientY, meta) {
        const tooltip = document.getElementById('item-tooltip');
        if (!tooltip) return;

        const { root, itemId, item } = this._resolveItemFromElement(element);
        if (!itemId || !item) {
            this.closeItemDetailPanel();
            return;
        }

        // 再次点击同一物品 → 关闭
        if (this.pinned && this.pinned.itemId === itemId
            && this.pinned.source === (meta && meta.source)
            && ((meta && meta.source === 'inventory' && this.pinned.index === meta.index)
                || (meta && meta.source === 'equipment' && this.pinned.slot === meta.slot))) {
            this.closeItemDetailPanel();
            return;
        }

        let displayItem = item;
        const looksLikeEquipment =
            displayItem.type === 'equipment' ||
            (displayItem.slot != null && displayItem.stats != null && displayItem.quality != null);
        if (!displayItem.getTooltipHTML && looksLikeEquipment &&
            typeof this.game.serializeEquipment === 'function' &&
            typeof this.game.deserializeEquipment === 'function') {
            try {
                displayItem = this.game.deserializeEquipment(this.game.serializeEquipment(displayItem));
            } catch (e) {
                console.warn('openItemDetailPanel: 无法还原 Equipment 实例', e);
            }
        }

        const isEquipment = (displayItem.type === 'equipment')
            || (displayItem.slot != null && displayItem.stats != null);
        let primaryLabel = null;
        if (meta && meta.source === 'inventory' && isEquipment) primaryLabel = '装备';
        else if (meta && meta.source === 'equipment') primaryLabel = '卸下';

        this.pinned = {
            source: meta && meta.source,
            index: meta && meta.index,
            slot: meta && meta.slot,
            itemId: String(itemId)
        };

        this._clearDetailHighlight();
        if (root && root.classList) root.classList.add('detail-open');

        tooltip.classList.add('pinned');
        tooltip.style.display = '';
        tooltip.innerHTML = this._buildDetailHtml(displayItem, { primaryLabel });
        this._bindPanelActions(tooltip);

        const rect = root.getBoundingClientRect ? root.getBoundingClientRect() : null;
        const x = rect ? rect.right : clientX;
        const y = rect ? rect.top : clientY;
        this.adjustTooltipPosition(tooltip, x, y, 12, 0);
    }

    closeItemDetailPanel() {
        const tooltip = document.getElementById('item-tooltip');
        this.pinned = null;
        this._clearDetailHighlight();
        if (!tooltip) return;
        tooltip.classList.remove('show', 'pinned');
        tooltip.style.display = 'none';
        tooltip.innerHTML = '';
        setTimeout(() => {
            if (tooltip && !tooltip.classList.contains('show')) {
                tooltip.style.display = '';
            }
        }, 50);
    }

    /** 兼容旧调用名：改为关闭钉住面板 */
    hideItemTooltip() {
        this.closeItemDetailPanel();
    }

    /**
     * 兼容旧 API：若仍被调用，改为钉住详情
     */
    showItemTooltip(element, x, y) {
        const root = element.closest && (element.closest('.inventory-slot') || element.closest('.equipment-item')) || element;
        const meta = {};
        if (root.classList && root.classList.contains('inventory-slot')) {
            meta.source = 'inventory';
            meta.index = parseInt(root.dataset.index, 10);
        } else if (root.classList && root.classList.contains('equipment-item')) {
            meta.source = 'equipment';
            meta.slot = root.dataset.slot;
        }
        this.openItemDetailPanel(element, x, y, meta);
    }

    /**
     * 套装效果：点击展开（钉住）
     */
    showSetEffectTooltip(setId, currentPieceCount, x, y) {
        const tooltip = document.getElementById('item-tooltip');
        if (!tooltip) return;

        if (!setId || typeof resolveSetDefinition !== 'function') {
            this.closeItemDetailPanel();
            return;
        }

        const setData = resolveSetDefinition(setId);
        if (!setData) {
            this.closeItemDetailPanel();
            return;
        }

        let html = `<h4 style="color: #ffaa00;">${setData.name}</h4>`;
        html += `<p style="color: #aaa; font-size: 11px;">套装效果:</p>`;

        const activeSet = new Set();
        if (typeof getAllActiveSetEffects === 'function') {
            getAllActiveSetEffects(this.game.player.equipment).forEach(e => {
                if (e.setId === setId) activeSet.add(e.pieceCount);
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
            const desc = typeof stripSetDescriptionMarkdown === 'function'
                ? stripSetDescriptionMarkdown(effect.description)
                : effect.description;
            html += `<p style="color: ${color}; font-size: 10px;">${pieceCount}件: ${desc}${activeText}</p>`;
        }
        html += '<div class="item-detail-actions"><button type="button" class="item-detail-btn" data-detail-action="close">关闭</button></div>';

        this.pinned = { source: 'set', itemId: `set:${setId}` };
        this._clearDetailHighlight();
        tooltip.classList.add('pinned');
        tooltip.style.display = '';
        tooltip.innerHTML = html;
        this._bindPanelActions(tooltip);
        this.adjustTooltipPosition(tooltip, x, y);
    }
}
