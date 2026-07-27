/**
 * 旧 ARPG API 桩函数 — 供仍加载的职业/战斗脚本兼容自走棋-only 运行时
 */
(function () {
    'use strict';

    const noop = function () {};

    const stubs = {
        addEquipmentEffect: noop,
        addMonsterProjectile: noop,
        spawnMonsterProjectile: noop,
        addGroundHazard: noop,
        resolveEliteBoonChoice: noop,
        closeGapShopModal: noop,
        openBlacksmith: noop,
        closeBlacksmith: noop,
        openShop: noop,
        closeShop: noop,
        enterTrainingGround: noop,
        closeTrainingGround: noop,
        enterSkillLab: noop,
        exitSkillLab: noop,
        enterEquipmentLab: noop,
        exitEquipmentLab: noop,
        enterAnimPreview: noop,
        exitAnimPreview: noop,
        enterTrial: noop,
        abortTrial: noop,
        enterDungeon: noop,
        abortDungeon: noop,
        generateNewRoom: noop,
        confirmExitTower: noop,
        cancelExitTower: noop,
        closeDummySpawnPanel: noop,
        showDeathPenaltyWindow: noop,
        closeDeathPenaltyWindow: noop,
        useClassSkillHotbar: noop,
        cancelWeaponSkillAim: noop,
        cancelClassSkillAim: noop,
        _onWeaponSkillInputDown: noop,
        updateWeaponSkillAimState: noop,
        updateClassSkillAimState: noop,
        populateDevSetGrantSelect: noop,
        populateDevSetV2Select: noop,
        updateDevCodexPanel: noop,
        refreshCodexDevGrantBindings: noop,
        showDevCodexTab: noop,
        devAddRandomEquipment: noop,
        devGenerateProceduralEquipment: noop,
        devClearRoom: noop,
        devNextFloor: noop,
    };

    if (typeof Game !== 'undefined') {
        Object.assign(Game.prototype, stubs);
    }
})();
