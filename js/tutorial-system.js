/**
 * Pixel Eternal — 统一新手引导（步骤机）
 */
(function () {
    'use strict';

    const SETUP_STEPS = ['need_class', 'need_name'];

    function cfg() {
        return window.TUTORIAL_CONFIG;
    }

    function steps() {
        const c = cfg();
        return (c && c.steps) || [];
    }

    function stepById(id) {
        return steps().find(s => s.id === id) || null;
    }

    function ensureFlags(player) {
        if (!player) return null;
        if (!player.tutorialFlags || typeof player.tutorialFlags !== 'object') {
            player.tutorialFlags = {};
        }
        const f = player.tutorialFlags;
        if (f.version == null) f.version = (cfg() && cfg().version) || 1;
        if (!Array.isArray(f.completedSteps)) f.completedSteps = [];
        if (f.skipped === undefined) f.skipped = false;
        if (f._moveStartX == null) f._moveStartX = null;
        if (f._attackCount == null) f._attackCount = 0;
        return f;
    }

    window.isTutorialComplete = function isTutorialComplete(player) {
        const f = ensureFlags(player);
        if (!f) return true;
        if (f.skipped) return true;
        return f.completedSteps.includes('done');
    };

    window.getTutorialCurrentStepId = function getTutorialCurrentStepId(player) {
        const f = ensureFlags(player);
        if (!f || f.skipped || f.completedSteps.includes('done')) return null;
        const list = steps();
        for (let i = 0; i < list.length; i++) {
            const id = list[i].id;
            if (!f.completedSteps.includes(id)) return id;
        }
        return null;
    };

    window.getTutorialCurrentStep = function getTutorialCurrentStep(player) {
        const id = window.getTutorialCurrentStepId(player);
        return id ? stepById(id) : null;
    };

    window.getTutorialProgress = function getTutorialProgress(player) {
        const f = ensureFlags(player);
        const total = steps().length;
        const done = f ? f.completedSteps.length : 0;
        return { done, total, current: window.getTutorialCurrentStep(player) };
    };

    window.completeTutorialStep = function completeTutorialStep(player, stepId) {
        if (!player || !stepId) return false;
        const f = ensureFlags(player);
        if (f.completedSteps.includes(stepId)) return false;
        f.completedSteps.push(stepId);
        if (stepId === 'need_name') f.named = true;
        if (stepId === 'meet_class_master') {
            f.classMasterVisited = true;
            f.needClassMaster = false;
        }
        return true;
    };

    window.skipTutorial = function skipTutorial(player) {
        const f = ensureFlags(player);
        if (!f) return;
        f.skipped = true;
        steps().forEach(s => {
            if (!f.completedSteps.includes(s.id)) f.completedSteps.push(s.id);
        });
        f.named = true;
        f.classMasterVisited = true;
        f.needClassMaster = false;
    };

    window.getTutorialHighlightBuilding = function getTutorialHighlightBuilding(player) {
        const step = window.getTutorialCurrentStep(player);
        return step && step.building ? step.building : null;
    };

    window.evaluateTutorialOnStart = function evaluateTutorialOnStart(game) {
        if (!game || !game.player) return 'idle';
        if (window.isTutorialComplete(game.player)) return 'done';
        const stepId = window.getTutorialCurrentStepId(game.player);
        if (!stepId || stepId === 'need_class') {
            if (!window.hasPlayerClass(game.player.classData)) return 'need_class';
        }
        if (stepId === 'need_name' || (window.hasPlayerClass(game.player.classData) && !ensureFlags(game.player).named)) {
            return 'need_name';
        }
        return 'in_game';
    };

    window.tickTutorialProgress = function tickTutorialProgress(game) {
        if (!game || !game.player || window.isTutorialComplete(game.player)) {
            game.tutorialHighlightBuilding = null;
            return;
        }
        const player = game.player;
        const f = ensureFlags(player);
        const step = window.getTutorialCurrentStep(player);
        if (!step) {
            game.tutorialHighlightBuilding = null;
            return;
        }
        game.tutorialHighlightBuilding = step.building || null;

        if (step.completeOn === 'move_distance') {
            const need = step.moveDistance || 100;
            if (f._moveStartX == null) {
                f._moveStartX = player.x;
                f._moveStartY = player.y;
            }
            const dx = player.x - f._moveStartX;
            const dy = player.y - (f._moveStartY || player.y);
            if (Math.sqrt(dx * dx + dy * dy) >= need) {
                window.completeTutorialStep(player, step.id);
                f._moveStartX = null;
                f._moveStartY = null;
                if (game.tutorialUI) game.tutorialUI.refresh();
            }
        }

        if (step.completeOn === 'room_cleared' && game.currentScene === window.SCENE_TYPES.TOWER) {
            if (game.currentRoom && game.currentRoom.cleared) {
                window.completeTutorialStep(player, step.id);
                if (game.tutorialUI) game.tutorialUI.refresh();
            }
        }
    };

    window.notifyTutorialEvent = function notifyTutorialEvent(game, event, payload) {
        if (!game || !game.player || window.isTutorialComplete(game.player)) return;
        const step = window.getTutorialCurrentStep(game.player);
        if (!step) return;
        const p = game.player;
        let matched = false;
        if (event === 'class_selected' && step.completeOn === 'class_selected') matched = true;
        if (event === 'named' && step.completeOn === 'named') matched = true;
        if (event === 'button' && step.completeOn === 'button') matched = true;
        if (event === 'attack_once' && step.completeOn === 'attack_once') matched = true;
        if (event === 'open_skill_panel' && step.completeOn === 'open_skill_panel') matched = true;
        if (event === 'building_interact' && step.completeOn === 'building_interact' &&
            payload && payload.building === step.building) matched = true;
        if (event === 'enter_tower' && step.completeOn === 'enter_tower') matched = true;
        if (matched) {
            window.completeTutorialStep(p, step.id);
            if (event === 'attack_once') ensureFlags(p)._attackCount = (p.tutorialFlags._attackCount || 0) + 1;
            if (game.tutorialUI) game.tutorialUI.refresh();
        }
    };

    window.migrateLegacyTutorialFlags = function migrateLegacyTutorialFlags(player) {
        const f = ensureFlags(player);
        if (!f) return;
        if (f.completedSteps.includes('done') || f.skipped) return;
        if (f.named && !f.completedSteps.includes('need_name')) {
            f.completedSteps.push('need_name');
        }
        if (window.hasPlayerClass(player.classData) && !f.completedSteps.includes('need_class')) {
            f.completedSteps.push('need_class');
        }
        if (f.classMasterVisited && !f.completedSteps.includes('meet_class_master')) {
            f.completedSteps.push('meet_class_master');
        }
        // 老玩家（已有进度）不再强制走完整教程
        if ((player.level || 1) >= 10 && !f.completedSteps.includes('done')) {
            window.skipTutorial(player);
        }
    };
})();
