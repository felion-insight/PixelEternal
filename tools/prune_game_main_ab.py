#!/usr/bin/env python3
"""从 game-main.js 删除已由 AB 模块接管的 legacy 方法（自底向上删，避免行号漂移）。"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAIN = os.path.join(ROOT, 'js', 'game-main.js')

REMOVE_METHODS = {
    'init',
    'checkFirstTimeGuide', 'closeFirstTimeGuide',
    'showDeathPenaltyWindow', 'closeDeathPenaltyWindow',
    'getInventoryTabCapacity', 'getInventoryTabStartIndex', 'getInventoryItemForTab',
    'ensureInventorySlotElements', 'initInventory', 'switchInventoryTab',
    'updateInventoryCapacity', 'toggleInventory', 'toggleCodex', 'refreshCodexDevGrantBindings',
    'toggleGuide', 'updateCodexMonsters', 'updateCodexSetMechanics', 'updateCodexConsumables',
    'updateCodexBaseTypes', 'updateCodexAffixes', 'updateCodexPowers', 'updateCodexSetsV2',
    'updateInventoryUI', 'adjustTooltipPosition', 'adjustTooltipPosition_OLD',
    'handleEquipmentSlotClick', 'handleInventorySlotClick', 'discardInventoryItem',
    'dropInventoryItemToGround', 'addItemToInventory',
    'generateNewRoom',
    'initWeaponSkillButton', 'updateHUD', 'updateInventoryStats',
    'updateEquipmentSlotBorders', 'updateWeaponSkillButton', 'handleInput',
    'update', 'updateTown', 'getCurrentSceneTargets', 'initDungeonSelection',
    'showTowerExitConfirm', 'confirmExitTower', 'cancelExitTower',
    'enterTrial', 'updateTrial', 'onTrialVictory', 'onTrialDefeat', 'abortTrial',
    'enterDungeon', 'updateDungeon', 'onDungeonVictory', 'onDungeonDefeat', 'abortDungeon',
    'enterTrainingGround', 'resetSkillLabCombatState', '_syncSkillLabCamera',
    'spawnSkillLabDefaultDummies', 'enterSkillLab', 'exitSkillLab',
    'enterEquipmentLab', 'exitEquipmentLab', 'enterAnimPreview', 'exitAnimPreview',
    'enterAbSkillVfxLab', 'tickAbVfxLabPreview', 'exitAbSkillVfxLab', 'updateAbSkillVfxLab',
    'updateAnimPreview', 'updateEquipmentLab', '_saveSkillLabReturnState', '_restoreSkillLabReturnState',
    'openTrainingGround', 'closeTrainingGround', 'updateTrainingGroundUI',
    'getAggregatedBattleStats', 'renderBattleStats', 'resetAllBattleStats',
    '_ensureSkillLabAttackTargets', '_ensureTrainingAttackTargets',
    'getSkillLabBattleStats', 'renderSkillLabBattleStats', 'resetAllSkillLabBattleStats',
    'openDummySpawnPanel', 'initDummySpawnPanel', 'closeDummySpawnPanel', 'spawnDummy',
    'clearAllTrainingDummies', 'updateTrainingGround', 'updateSkillLab',
    'findResurrectionItem', 'showResurrectionDialog', 'useResurrection', 'cancelResurrection',
    'returnToTown', 'enterTower',
    'initBlacksmith', 'switchBlacksmithTab', 'updateBlacksmithRerollPanel', 'rerollBlacksmithEquipment',
    'initShop', 'initTrainingAndCapacity', 'initLevelUpCapacity', 'onPlayerLevelUp',
    'expandCapacity', 'buyCapacityExpansion', 'openBlacksmith', 'closeBlacksmith',
    'getSelectedBlacksmithEquipment', 'updateBlacksmithEquipmentList', 'showBlacksmithDetails',
    'updateRefineInfo', 'refineEquipment', 'upgradeEquipment',
    'openShop', 'refreshShop', 'updateShopRefreshButton', 'closeShop',
    'updateShopEquipments', 'updateTargetSlotsDisplay', 'selectTargetSlot', 'buyTargetSlot',
    'showTargetSlotEquipmentSelection', 'toggleShopItemLock', 'showShopEquipmentTooltip',
    'buyEquipment', 'updateShopSell', 'sellItem',
    'draw', 'drawMinimap', 'addEquipmentEffect', 'getSkillGroundAimPoint', '_getVisionScaleForAim',
    'screenToWorldForAim', 'clampGroundSkillAimWorldPoint',
    'useClassSkillHotbar', '_getClassSkillDefForHotbarSlot', '_canPrepareClassSkillCast',
    '_castClassSkillHotbar', 'cancelClassSkillAim', '_onClassSkillInputDown', '_onClassSkillInputUp',
    'updateClassSkillAimState', 'drawClassSkillAimPreview',
    '_canUseWeaponSkillForBattle', '_getSkillMonsters', 'cancelWeaponSkillAim',
    '_onWeaponSkillInputDown', '_onWeaponSkillInputUp', 'updateWeaponSkillAimState',
    'drawSkillLockPreviewMarker', 'drawWeaponSkillAimPreview',
    'addMonsterProjectile', 'onMonsterSlain', 'addGroundHazard', 'addSoulCircle',
    'updateSoulCircles', 'updateGroundHazards', 'queueMonsterAoETelegraph', 'updatePendingMonsterAoE',
    'damagePlayerInRadius', 'applyPlayerKnockback', 'updateMonsterProjectiles',
    'drawGroundHazardsAndPendingAoE', 'drawMonsterProjectiles', 'drawEquipmentEffects',
    'drawTrails', 'startDemonInterference', 'pickRandomDemonEffect', 'applyDemonEffect',
    'updateDemonEffectDisplay', 'initDemonInterferenceUi', 'initDevPanelExtraControls',
    'showDevPanelFeedback', '_recoverStuckDemonInterferenceStateForDev', 'showDemonInterferenceDialog',
    'closeDemonInterference', 'devTriggerDemonInterference', 'devPreviewDemonInterferenceDialog',
    'devClearBuffs', 'pickDistinctEliteBoonIds', 'initEliteBoonChoiceModal', 'openEliteBoonChoiceModal',
    'resolveEliteBoonChoice', 'continueTowerAfterEliteRoomFlow', 'grantEliteBoonById', 'grantRandomEliteBoon',
    'onBossDefeated', 'initGapShop', 'openGapShopModal', 'closeGapShopModal', 'finishGapShopLeave',
    'gapShopPriceMult', 'tryGapShopBuy', 'updateGapShopPricesAndGold', 'renderGapShopSellList',
    'renderGapShopPanel', 'syncTowerBranchPortals', 'generatePortals', 'getTowerPlaytestSnapshot',
    'drawInteractionHint',
    'toggleDevMode', 'showDevCodexTab', 'updateDevCodexPanel', 'readDevForgeOptions',
    'refreshDevForgePreview', 'filterDevForgeChips', 'updateDevCodexCustomForge',
    'openDevForgeWithPreset', 'updateDevCodexEquipments', 'updateDevCodexProcedural',
    'updateDevCodexBuilds', 'updateDevCodexBaseTypes', 'updateDevCodexSets',
    'updateDevCodexConsumables', 'devGrantFromBaseTypeId', 'devGrantFullSetById',
    'devAddSpecificEquipment', 'devAddSpecificCraftedEquipment', 'devAddHolyCrossConsumable',
    'updateDevCodexRecipes', 'devAddSpecificRecipe', 'devAddAllCraftedEquipments',
    'populateDevSetGrantSelect', 'populateCodexSetFilter', 'populateDevSetV2Select',
    'devReadProceduralDevOptions', 'devGenerateProceduralEquipment', 'devGenerateProceduralBatch',
    'devGenerateProceduralAllSlots', 'devGenerateProceduralDropSim', 'devGrantFullSetV2',
    'devGrantFullEquipmentSet', 'updateDevInfo',
    'devAddExp', 'devAddGold', 'devHealPlayer', 'computePlayerExpNeededForLevel',
    'devSetPlayerLevel', 'devSetPlayerLevelFromInput', 'devAddRandomEquipment',
    'devClearRoom', 'devNextFloor', 'devGenerateRoom', 'devAddRandomRecipe',
    'devClearInventory', 'devSetCombatPower',
    'updateCodexEquipments',
    'showItemTooltip', 'hideItemTooltip', 'showSetEffectTooltip',
}


def find_class_methods(lines):
    """返回 [(name, start_line, end_line)] 1-based，仅匹配 Game 类四级缩进方法。"""
    pat = re.compile(r'^    ([a-zA-Z_$][\w$]*)\([^)]*\)\s*\{?\s*$')
    methods = []
    i = 0
    while i < len(lines):
        m = pat.match(lines[i])
        if m:
            name = m.group(1)
            start = i
            depth = 0
            started = False
            j = i
            while j < len(lines):
                depth += lines[j].count('{') - lines[j].count('}')
                if '{' in lines[j]:
                    started = True
                if started and depth == 0:
                    methods.append((name, start, j))
                    i = j + 1
                    break
                j += 1
            else:
                i += 1
        else:
            i += 1
    return methods


def doc_block_start(lines, method_start):
    i = method_start - 1
    while i >= 0:
        s = lines[i].strip()
        if s == '':
            i -= 1
            continue
        if s.startswith('//') or s.startswith('*') or s.startswith('/**') or s.endswith('*/'):
            i -= 1
            continue
        break
    return i + 1


def main():
    with open(MAIN, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    methods = find_class_methods(lines)
    spans = []

    for name, start, end in methods:
        if name not in REMOVE_METHODS:
            continue
        spans.append((doc_block_start(lines, start), end))

    # resizeCanvas 有两个实现：删掉较早的那个（无 _autoBattlerPresentation 分支）
    resize_spans = [(s, e) for n, s, e in methods if n == 'resizeCanvas']
    if len(resize_spans) >= 2:
        spans.append((doc_block_start(lines, resize_spans[0][0]), resize_spans[0][1]))

    # 去重 span
    spans = sorted(set(spans))

    removed = 0
    for start, end in reversed(spans):
        del lines[start:end + 1]
        removed += end - start + 1

    with open(MAIN, 'w', encoding='utf-8') as f:
        f.writelines(lines)

    print(f'Removed {removed} lines ({len(spans)} method spans) from game-main.js')
    print(f'Remaining lines: {len(lines)}')


if __name__ == '__main__':
    main()
