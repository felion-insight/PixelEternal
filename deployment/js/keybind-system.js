/**
 * Pixel Eternal - 自定义键位
 * 绑定存 localStorage，使用 KeyboardEvent.code 识别按键。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'pixelEternal_keybinds';

    const ACTION_LABELS = {
        skill1: '技能栏 1',
        skill2: '技能栏 2',
        skill3: '技能栏 3',
        skill4: '技能栏 4',
        weaponSkill: '武器技能',
        dash: '冲刺',
        attack: '普攻',
        inventory: '背包',
        codex: '图鉴',
        guide: '游戏指导',
        skillPanel: '技能面板',
        characterPanel: '角色面板',
        interact: '交互',
        moveUp: '移动 · 上',
        moveDown: '移动 · 下',
        moveLeft: '移动 · 左',
        moveRight: '移动 · 右',
        trainingDummy: '训练桩面板'
    };

    const DEFAULT_BINDINGS = {
        skill1: 'Digit1',
        skill2: 'Digit2',
        skill3: 'Digit3',
        skill4: 'Digit4',
        weaponSkill: 'KeyQ',
        dash: 'ShiftLeft',
        attack: 'KeyJ',
        inventory: 'KeyB',
        codex: 'KeyH',
        guide: 'KeyG',
        skillPanel: 'KeyK',
        characterPanel: 'KeyC',
        interact: 'KeyE',
        moveUp: 'KeyW',
        moveDown: 'KeyS',
        moveLeft: 'KeyA',
        moveRight: 'KeyD',
        trainingDummy: 'KeyT'
    };

    const SETTINGS_ORDER = [
        'skill1', 'skill2', 'skill3', 'skill4',
        'weaponSkill', 'attack', 'dash', 'interact',
        'inventory', 'codex', 'guide', 'skillPanel', 'characterPanel',
        'moveUp', 'moveDown', 'moveLeft', 'moveRight',
        'trainingDummy'
    ];

    /** 键位分页：战斗 / 界面 */
    const KEYBIND_CATEGORIES = {
        combat: [
            'skill1', 'skill2', 'skill3', 'skill4',
            'weaponSkill', 'attack', 'dash', 'interact',
            'moveUp', 'moveDown', 'moveLeft', 'moveRight'
        ],
        interface: [
            'inventory', 'codex', 'guide', 'skillPanel', 'characterPanel',
            'trainingDummy'
        ]
    };

    const HOLD_ACTIONS = new Set([
        'dash', 'attack', 'moveUp', 'moveDown', 'moveLeft', 'moveRight', 'interact'
    ]);

    let bindings = null;
    let captureAction = null;
    let onBindingsChanged = null;

    function cloneDefaults() {
        return Object.assign({}, DEFAULT_BINDINGS);
    }

    function loadBindings() {
        if (bindings) return bindings;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                bindings = Object.assign(cloneDefaults(), parsed);
            } else {
                bindings = cloneDefaults();
            }
        } catch (e) {
            bindings = cloneDefaults();
        }
        return bindings;
    }

    function saveBindings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
        } catch (e) { /* ignore */ }
        if (typeof onBindingsChanged === 'function') onBindingsChanged();
    }

    function matchesCode(event, code) {
        if (!event || !code) return false;
        if (event.code === code) return true;
        if (code === 'ShiftLeft' && event.code === 'ShiftRight') return true;
        if (code === 'ShiftRight' && event.code === 'ShiftLeft') return true;
        return false;
    }

    function formatKeyCode(code) {
        if (!code) return '—';
        const map = {
            Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
            Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
            KeyA: 'A', KeyB: 'B', KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F',
            KeyG: 'G', KeyH: 'H', KeyI: 'I', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
            KeyM: 'M', KeyN: 'N', KeyO: 'O', KeyP: 'P', KeyQ: 'Q', KeyR: 'R',
            KeyS: 'S', KeyT: 'T', KeyU: 'U', KeyV: 'V', KeyW: 'W', KeyX: 'X',
            KeyY: 'Y', KeyZ: 'Z',
            ShiftLeft: 'Shift', ShiftRight: 'Shift',
            ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
            AltLeft: 'Alt', AltRight: 'Alt',
            Space: '空格',
            Escape: 'Esc',
            Tab: 'Tab',
            Backquote: '`',
            Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
            Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
            ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
        };
        return map[code] || code.replace(/^(Key|Digit|Numpad)/, '');
    }

    function getActionForEvent(event) {
        const b = loadBindings();
        for (const [action, code] of Object.entries(b)) {
            if (matchesCode(event, code)) return action;
        }
        return null;
    }

    function getActionForCode(code) {
        const b = loadBindings();
        for (const [action, bound] of Object.entries(b)) {
            if (bound === code) return action;
            if (code === 'ShiftRight' && bound === 'ShiftLeft') return action;
            if (code === 'ShiftLeft' && bound === 'ShiftRight') return action;
        }
        return null;
    }

    function setBinding(action, code) {
        if (!ACTION_LABELS[action]) return { ok: false, msg: '无效动作' };
        if (!code || code === 'Escape') return { ok: false, msg: '无效按键' };
        loadBindings();
        const blocked = new Set(['Escape', 'F1']);
        if (blocked.has(code)) return { ok: false, msg: '该键不可绑定' };

        const prev = bindings[action];
        const conflict = getActionForCode(code);
        bindings[action] = code;
        if (conflict && conflict !== action) {
            bindings[conflict] = prev;
        }
        saveBindings();
        return { ok: true };
    }

    function resetBindings() {
        bindings = cloneDefaults();
        saveBindings();
    }

    function getHotbarKeyLabel(slotIndex) {
        const action = 'skill' + (slotIndex + 1);
        return formatKeyCode(loadBindings()[action]);
    }

    function isCapturing() {
        return captureAction != null;
    }

    function getTabForAction(action) {
        if (KEYBIND_CATEGORIES.combat.includes(action)) return 'combat';
        if (KEYBIND_CATEGORIES.interface.includes(action)) return 'interface';
        return 'combat';
    }

    function startCapture(action) {
        if (!ACTION_LABELS[action]) return;
        captureAction = action;
        updateCaptureHint();
        if (window.game && typeof window.game._switchEscMenuTab === 'function') {
            window.game._switchEscMenuTab(getTabForAction(action));
        }
    }

    function cancelCapture() {
        captureAction = null;
        updateCaptureHint();
    }

    function updateCaptureHint() {
        const hint = document.getElementById('keybind-capture-hint');
        if (!hint) return;
        if (!captureAction) {
            hint.style.display = 'none';
            hint.textContent = '';
            return;
        }
        hint.style.display = 'block';
        hint.textContent = `正在为「${ACTION_LABELS[captureAction]}」绑定按键… 请按下新键（Esc 取消）`;
    }

    function handleCaptureKeydown(event) {
        if (!captureAction) return false;
        event.preventDefault();
        event.stopPropagation();
        if (event.code === 'Escape') {
            cancelCapture();
            renderAllSettingsLists();
            return true;
        }
        const res = setBinding(captureAction, event.code);
        const saved = captureAction;
        cancelCapture();
        renderAllSettingsLists();
        if (!res.ok && window.game && typeof window.game.addFloatingText === 'function') {
            window.game.addFloatingText(window.game.player.x, window.game.player.y, res.msg, '#ff6666');
        } else if (window.game && typeof window.game.addFloatingText === 'function') {
            window.game.addFloatingText(
                window.game.player.x, window.game.player.y,
                `${ACTION_LABELS[saved]} → ${formatKeyCode(event.code)}`,
                '#88ff88'
            );
        }
        return true;
    }

    function renderSettingsList(container, actionIds) {
        if (!container) return;
        loadBindings();
        const ids = actionIds || SETTINGS_ORDER;
        container.innerHTML = '';
        ids.forEach(action => {
            if (!ACTION_LABELS[action]) return;
            const row = document.createElement('div');
            row.className = 'keybind-settings-row';
            const label = document.createElement('span');
            label.className = 'keybind-settings-label';
            label.textContent = ACTION_LABELS[action];
            const keyBtn = document.createElement('button');
            keyBtn.type = 'button';
            keyBtn.className = 'keybind-settings-key' + (captureAction === action ? ' capturing' : '');
            keyBtn.textContent = formatKeyCode(bindings[action]);
            keyBtn.title = '点击更改键位';
            keyBtn.addEventListener('click', () => {
                startCapture(action);
                renderAllSettingsLists();
            });
            row.appendChild(label);
            row.appendChild(keyBtn);
            container.appendChild(row);
        });
    }

    function renderAllSettingsLists() {
        const combatEl = document.getElementById('keybind-list-combat');
        const interfaceEl = document.getElementById('keybind-list-interface');
        const legacyEl = document.getElementById('keybind-settings-list');
        if (combatEl) renderSettingsList(combatEl, KEYBIND_CATEGORIES.combat);
        if (interfaceEl) renderSettingsList(interfaceEl, KEYBIND_CATEGORIES.interface);
        if (legacyEl && !combatEl && !interfaceEl) renderSettingsList(legacyEl);
    }

    function initSettingsUI(game) {
        const resetBtn = document.getElementById('keybind-reset-btn');
        if (!document.getElementById('keybind-list-combat')
            && !document.getElementById('keybind-list-interface')
            && !document.getElementById('keybind-settings-list')) {
            return;
        }

        onBindingsChanged = () => {
            renderAllSettingsLists();
            if (game && game.classUI && typeof game.classUI.updateSkillBar === 'function') {
                game.classUI.updateSkillBar();
            }
            if (game && typeof game.updateWeaponSkillButton === 'function') {
                game.updateWeaponSkillButton();
            }
        };

        renderAllSettingsLists();
        if (resetBtn && !resetBtn.dataset.bound) {
            resetBtn.dataset.bound = '1';
            resetBtn.addEventListener('click', () => {
                resetBindings();
                renderAllSettingsLists();
                if (game && typeof game.addFloatingText === 'function') {
                    game.addFloatingText(game.player.x, game.player.y, '键位已恢复默认', '#88ff88');
                }
            });
        }
    }

    function ensureActionState(game) {
        if (!game.actionKeyState) game.actionKeyState = {};
    }

    function setActionPressed(game, action, pressed) {
        ensureActionState(game);
        if (action) game.actionKeyState[action] = pressed;
    }

    function isActionPressed(game, action) {
        ensureActionState(game);
        return !!game.actionKeyState[action];
    }

    window.KeybindSystem = {
        ACTION_LABELS,
        DEFAULT_BINDINGS,
        loadBindings,
        saveBindings,
        getBinding(action) {
            return loadBindings()[action];
        },
        getActionForEvent,
        formatKeyCode,
        getHotbarKeyLabel,
        setBinding,
        resetBindings,
        isCapturing,
        startCapture,
        cancelCapture,
        handleCaptureKeydown,
        renderSettingsList,
        renderAllSettingsLists,
        KEYBIND_CATEGORIES,
        initSettingsUI,
        setActionPressed,
        isActionPressed,
        isHoldAction(action) {
            return HOLD_ACTIONS.has(action);
        },
        shouldRepeatAction(action) {
            return action === 'attack';
        }
    };
})();
