/**
 * 战士系职业被动 — 浴血奋战（狂战士/毁灭者）
 */
(function () {
    'use strict';

    window.getBloodBattleBonuses = function getBloodBattleBonuses(player) {
        if (!player || !player.classData) {
            return { attackPercent: 0, lifeStealPercent: 0, name: null };
        }
        const classId = typeof window.getActiveClassId === 'function'
            ? window.getActiveClassId(player.classData) : null;
        if (classId !== 'berserker' && classId !== 'destroyer') {
            return { attackPercent: 0, lifeStealPercent: 0, name: null };
        }
        const maxHp = Math.max(1, player.maxHp || 1);
        const hpRatio = Math.max(0, Math.min(1, player.hp / maxHp));
        const lostPercent = Math.floor((1 - hpRatio) * 100);
        if (classId === 'berserker') {
            return {
                attackPercent: Math.min(50, Math.floor(lostPercent * 0.5)),
                lifeStealPercent: 0,
                name: '浴血奋战'
            };
        }
        return {
            attackPercent: Math.min(100, lostPercent),
            lifeStealPercent: hpRatio < 0.3 ? 20 : 0,
            name: '浴血奋战'
        };
    };

    window.applyBloodBattlePassive = function applyBloodBattlePassive(player) {
        const b = window.getBloodBattleBonuses(player);
        if (b.lifeStealPercent > 0) {
            player.lifeStealPercent = Math.min(45, player.lifeStealPercent + b.lifeStealPercent);
        }
        player._bloodBattleActive = b.attackPercent > 0 || b.lifeStealPercent > 0;
    };
})();
