/**
 * Phase 5 — 转职试炼
 */
(function () {
    'use strict';

    window.getTrialDefinition = function getTrialDefinition(kind, targetId) {
        const cfg = window.TRIAL_CONFIG;
        if (!cfg || !targetId) return null;
        if (kind === 'first') {
            const cd = window.CLASS_CONFIG && window.CLASS_CONFIG.baseClasses && window.CLASS_CONFIG.baseClasses[targetId];
            const baseClass = cd ? targetId : (typeof window.getPlayerBaseClassId === 'function'
                ? window.getPlayerBaseClassId({ baseClass: targetId, firstAdvancement: targetId })
                : targetId);
            const first = cfg.firstJob && cfg.firstJob[baseClass];
            if (first) return Object.assign({ kind: 'first', baseClass }, first);
            return null;
        }
        if (kind === 'second') {
            const sec = cfg.secondJob && cfg.secondJob[targetId];
            if (sec) return Object.assign({ kind: 'second', secondId: targetId }, sec);
            return null;
        }
        return null;
    };

    window.getFirstJobTrialForPlayer = function getFirstJobTrialForPlayer(player) {
        if (!player) return null;
        const base = typeof window.getPlayerBaseClassId === 'function'
            ? window.getPlayerBaseClassId(player.classData) : null;
        return base ? window.getTrialDefinition('first', base) : null;
    };

    window.canStartFirstJobTrial = function canStartFirstJobTrial(player, firstId) {
        if (!player || !firstId) return { ok: false, message: '无效请求' };
        const cd = window.normalizeClassData(player.classData);
        if (!cd.baseClass) return { ok: false, message: '请先选择基础职业' };
        if (cd.firstAdvancement) return { ok: false, message: '已完成一转' };
        const cfg = window.CLASS_CONFIG;
        const def = cfg && cfg.firstAdvancements && cfg.firstAdvancements[firstId];
        if (!def || def.baseClass !== cd.baseClass) return { ok: false, message: '无效一转职业' };
        const reqLv = def.requiredLevel || 20;
        if (player.level < reqLv) return { ok: false, message: `需要等级 ${reqLv}` };
        const trial = window.getFirstJobTrialForPlayer(player);
        if (!trial) return { ok: false, message: '试炼配置缺失' };
        return { ok: true, firstId, trial };
    };

    window.canStartSecondJobTrial = function canStartSecondJobTrial(player, secondId) {
        if (!player || !secondId) return { ok: false, message: '无效请求' };
        const cd = window.normalizeClassData(player.classData);
        if (!cd.firstAdvancement) return { ok: false, message: '请先完成一转' };
        if (cd.secondAdvancement) return { ok: false, message: '已完成二转' };
        const cfg = window.CLASS_CONFIG;
        const def = cfg && cfg.secondAdvancements && cfg.secondAdvancements[secondId];
        const first = cfg && cfg.firstAdvancements && cfg.firstAdvancements[cd.firstAdvancement];
        if (!def || !first || !(first.advancements || []).includes(secondId)) {
            return { ok: false, message: '无效二转职业' };
        }
        const reqLv = def.requiredLevel || 40;
        if (player.level < reqLv) return { ok: false, message: `需要等级 ${reqLv}` };
        const trial = window.getTrialDefinition('second', secondId);
        if (!trial) return { ok: false, message: '试炼配置缺失' };
        return { ok: true, secondId, trial };
    };

    window.applyTrialVictory = function applyTrialVictory(game) {
        if (!game || !game.activeTrial) return { ok: false, message: '无进行中的试炼' };
        const t = game.activeTrial;
        const p = game.player;
        let res;
        if (t.kind === 'first') {
            res = window.selectFirstAdvancement(p, t.targetId, { skipTrial: false });
        } else if (t.kind === 'second') {
            res = window.selectSecondAdvancement(p, t.targetId);
        } else {
            return { ok: false, message: '未知试炼类型' };
        }
        game.activeTrial = null;
        return res;
    };
})();
