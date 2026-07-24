/**

 * 静态美术资源 URL 解析（asset/ 与 assets/ 根路径）

 */

(function () {

    'use strict';



    function projectBaseUrl() {

        if (window.location.protocol === 'file:') {

            const p = window.location.pathname;

            return p.substring(0, p.lastIndexOf('/') + 1);

        }

        return window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

    }



    /** @param {string} rel - 如 asset/foo.png 或 assets/icons/classes/warrior.png */

    function resolveRootUrl(rel) {

        if (!rel) return '';

        const clean = String(rel).replace(/\\/g, '/').replace(/^\.\//, '');

        return projectBaseUrl() + clean;

    }



    /** @param {string} relUnderAsset - 如 equipment/slots/weapon.png */

    function resolveAssetUrl(relUnderAsset) {

        return resolveRootUrl('asset/' + String(relUnderAsset || '').replace(/^asset\//, ''));

    }



    function getClassIconUrl(classId) {

        if (!classId) return '';

        let icon = '';

        if (typeof window.getClassDefinition === 'function') {

            const def = window.getClassDefinition(classId);

            if (def && def.icon) icon = def.icon;

        }

        if (!icon && window.CLASS_CONFIG) {

            const cfg = window.CLASS_CONFIG;

            const def = (cfg.baseClasses && cfg.baseClasses[classId])

                || (cfg.firstAdvancements && cfg.firstAdvancements[classId])

                || (cfg.secondAdvancements && cfg.secondAdvancements[classId]);

            if (def && def.icon) icon = def.icon;

        }

        if (!icon) icon = 'assets/icons/classes/' + classId + '.png';

        return resolveRootUrl(icon);

    }



    /** 自走棋装备槽 → 通用 slot 贴图 */

    const AB_GEAR_SLOT_MAP = {

        weapon: 'weapon',

        head: 'helmet',

        chest: 'body',

        hands: 'hands',

        feet: 'feet'

    };



    const AB_WEAPON_BY_CLASS = {

        warrior: 'sword',

        archer: 'bow',

        mage: 'staff',

        assassin: 'dagger',

        generic: 'sword'

    };



    function inferAbWeaponType(gear) {

        const tags = gear && gear.classTags ? gear.classTags : [];

        for (let i = 0; i < tags.length; i++) {

            if (AB_WEAPON_BY_CLASS[tags[i]]) return AB_WEAPON_BY_CLASS[tags[i]];

        }

        return 'sword';

    }



    function getEquipmentIconUrl(item) {

        if (!item) return '';

        if (item.baseTypeId) {

            return resolveAssetUrl('equipment/base/' + item.baseTypeId + '.png');

        }

        const slot = item.slot;

        if (slot === 'weapon') {

            const wt = item.weaponType || inferAbWeaponType(item);

            return resolveAssetUrl('equipment/types/' + wt + '.png');

        }

        const mapped = AB_GEAR_SLOT_MAP[slot] || slot;

        if (mapped) return resolveAssetUrl('equipment/slots/' + mapped + '.png');

        return '';

    }



    function getAutoBattlerGearIconUrl(gear) {

        return getEquipmentIconUrl(gear);

    }



    function getAutoBattlerNodeIconUrl(nodeType) {

        if (!nodeType) return '';

        return resolveAssetUrl('auto_battler/nodes/' + nodeType + '.png');

    }



    function getAutoBattlerHeroUrl(baseClass) {

        if (!baseClass) return '';

        return resolveAssetUrl('auto_battler/heroes/' + baseClass + '.png');

    }



    function getAutoBattlerEnemyUrl(templateId) {

        if (!templateId) return '';

        return resolveAssetUrl('auto_battler/enemies/' + templateId + '.png');

    }



    function getAutoBattlerSkillIconUrl(skillId) {

        if (!skillId) return '';

        return resolveAssetUrl('auto_battler/skills/' + skillId + '.png');

    }



    function getAutoBattlerRelicIconUrl(relicId) {

        if (!relicId) return '';

        let iconId = relicId;

        if (window.RelicSystem && window.RelicSystem.relicIconId) {

            iconId = window.RelicSystem.relicIconId(relicId) || relicId;

        }

        return resolveAssetUrl('auto_battler/relics/' + iconId + '.png');

    }



    function getAutoBattlerSceneBgUrl(sceneKey) {

        if (!sceneKey) return '';

        return resolveAssetUrl('auto_battler/scenes/' + sceneKey + '.png');

    }



    /**

     * @param {string|null} skillId - 英文 id（自走棋）或 null

     * @param {string|null} skillName - 中文名（主游戏）

     */

    function getSkillIconUrl(skillId, skillName) {

        if (skillName && typeof window.SKILL_ICON_MAP !== 'undefined' && window.SKILL_ICON_MAP[skillName]) {

            let imageName = window.SKILL_ICON_MAP[skillName];

            const fromMappings = typeof window.MAPPINGS !== 'undefined'

                && window.MAPPINGS.skill_icons

                && window.MAPPINGS.skill_icons[skillName];

            if (fromMappings) {

                imageName = fromMappings;

            } else if (imageName && !imageName.includes('/')) {

                imageName = 'skill_icons/' + imageName;

            }

            return resolveAssetUrl(imageName);

        }

        if (skillId) {

            return getAutoBattlerSkillIconUrl(skillId);

        }

        return '';

    }



    function getRelicIconUrl(relicId) {

        return getAutoBattlerRelicIconUrl(relicId);

    }



    function getPotionIconUrl(potionName) {

        if (!potionName) return '';

        const map = window.POTION_ICON_MAP;

        if (!map || !map[potionName]) return '';

        const rel = map[potionName];

        if (rel.includes('/')) return resolveAssetUrl(rel);

        return resolveAssetUrl('potion_icons/' + rel);

    }



    function getBuffIconUrl(effectKey) {

        if (!effectKey || typeof window.BUFF_ICON_MAP === 'undefined' || !window.BUFF_ICON_MAP[effectKey]) {

            return '';

        }

        return resolveAssetUrl(window.BUFF_ICON_MAP[effectKey]);

    }



    function resolveDisplayIconUrl(url) {

        if (!url) return '';

        if (window.StaticArtProcessor && window.StaticArtProcessor.resolveDisplayIconUrl) {

            return window.StaticArtProcessor.resolveDisplayIconUrl(url);

        }

        const am = window.game && window.game.assetManager;

        if (am && typeof am.getCachedDisplayUrl === 'function') {

            return am.getCachedDisplayUrl(url) || url;

        }

        return url;

    }



    window.StaticArtPaths = {

        projectBaseUrl,

        resolveRootUrl,

        resolveAssetUrl,

        getClassIconUrl,

        getEquipmentIconUrl,

        getAutoBattlerGearIconUrl,

        getAutoBattlerNodeIconUrl,

        getAutoBattlerHeroUrl,

        getAutoBattlerEnemyUrl,

        getAutoBattlerSkillIconUrl,

        getAutoBattlerRelicIconUrl,

        getAutoBattlerSceneBgUrl,

        getSkillIconUrl,

        getRelicIconUrl,

        getPotionIconUrl,

        getBuffIconUrl,

        resolveDisplayIconUrl,

        AB_GEAR_SLOT_MAP,

        AB_WEAPON_BY_CLASS

    };

})();


