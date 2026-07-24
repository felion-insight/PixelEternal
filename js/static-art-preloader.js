/**
 * 静态美术资源预加载（职业/Buff/药水/武器类型/自走棋等）
 */
(function () {
    'use strict';

    function collectStaticArtUrls() {
        const SAP = window.StaticArtPaths;
        if (!SAP) return [];

        const seen = new Set();
        const entries = [];

        function add(url, category, label) {
            if (!url || seen.has(url)) return;
            seen.add(url);
            entries.push({ url, category, label: label || url });
        }

        const classCfg = window.CLASS_CONFIG;
        if (classCfg) {
            ['baseClasses', 'firstAdvancements', 'secondAdvancements'].forEach((section) => {
                const block = classCfg[section] || {};
                Object.keys(block).forEach((id) => add(SAP.getClassIconUrl(id), 'class', id));
            });
        }

        const wa = window.WEAPON_AFFINITY_CONFIG;
        if (wa && wa.weaponTypes) {
            Object.keys(wa.weaponTypes).forEach((wt) => {
                add(SAP.resolveAssetUrl('equipment/types/' + wt + '.png'), 'weapon_type', wt);
            });
        }

        const potionMap = window.POTION_ICON_MAP;
        if (potionMap) {
            Object.keys(potionMap).forEach((name) => add(SAP.getPotionIconUrl(name), 'potion', name));
        }

        const buffMap = window.BUFF_ICON_MAP;
        if (buffMap) {
            Object.keys(buffMap).forEach((key) => add(SAP.getBuffIconUrl(key), 'buff', key));
        }

        const skillMap = window.SKILL_ICON_MAP;
        if (skillMap) {
            Object.keys(skillMap).forEach((name) => add(SAP.getSkillIconUrl(null, name), 'skill', name));
        }

        if (typeof window.MAPPINGS !== 'undefined' && window.MAPPINGS.skill_icons) {
            Object.keys(window.MAPPINGS.skill_icons).forEach((name) => {
                add(SAP.getSkillIconUrl(null, name), 'skill', name);
            });
        }

        const abCfg = window.AUTO_BATTLER_CONFIG
            || (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG)
            || {};
        (abCfg.partyOrder || ['warrior', 'archer', 'mage', 'assassin']).forEach((cls) => {
            add(SAP.getAutoBattlerHeroUrl(cls), 'ab_hero', cls);
        });
        ['battle', 'elite', 'rest', 'event', 'shop', 'boss', 'boss_final'].forEach((node) => {
            add(SAP.getAutoBattlerNodeIconUrl(node), 'ab_node', node);
        });
        (abCfg.enemyTemplates || []).forEach((t) => {
            if (t && t.id) add(SAP.getAutoBattlerEnemyUrl(t.id), 'ab_enemy', t.id);
        });
        (abCfg.skillPool || []).forEach((s) => {
            if (s && s.id) add(SAP.getAutoBattlerSkillIconUrl(s.id), 'ab_skill', s.id);
        });
        (abCfg.relics || []).forEach((r) => {
            if (r && r.id) add(SAP.getAutoBattlerRelicIconUrl(r.id), 'ab_relic', r.id);
        });

        return entries;
    }

    /**
     * @param {import('./game-assets').AssetManager} assetManager
     * @param {(loaded: number, total: number, entry: {url:string,category:string,label:string}) => void} [onProgress]
     */
    async function preloadAll(assetManager, onProgress) {
        const entries = collectStaticArtUrls();
        if (!assetManager || typeof assetManager.preloadImageUrl !== 'function') {
            return { total: entries.length, loaded: 0 };
        }

        let loaded = 0;
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            try {
                await assetManager.preloadImageUrl(entry.url);
            } catch (e) {
                console.warn('静态美术预加载失败:', entry.url, e);
            }
            loaded++;
            if (onProgress) onProgress(loaded, entries.length, entry);
        }

        if (window.AutoBattlerAssets && window.AutoBattlerAssets.ensureLoaded) {
            await window.AutoBattlerAssets.ensureLoaded();
        }

        return { total: entries.length, loaded };
    }

    window.StaticArtPreloader = {
        collectStaticArtUrls,
        preloadAll
    };
})();
