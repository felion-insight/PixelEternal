/**
 * 自走棋 Roguelike UI — 横向战场 + 节点全屏场景（非浮窗）
 */
(function () {
    'use strict';

    const NODE_ICON = {
        battle: '⚔', elite: '◆', rest: '✚', event: '?', shop: '◈', boss: '☠', boss_final: '♚'
    };
    const PHASE_LABEL = {
        map: '选路', deploy: '布阵', combat: '激战', reward: '战利品',
        shop: '商店', event: '事件', rest: '休整', summary: '结算', transition: '前进'
    };
    const CLASS_TONE = {
        warrior: 'tone-warrior', archer: 'tone-archer', mage: 'tone-mage', assassin: 'tone-assassin'
    };
    const SLOT_LABEL = {
        weapon: '武器', head: '头', chest: '胸', hands: '手', feet: '鞋'
    };
    const KIND_LABEL = {
        relic_pick: '选择遗物', skill_pick: '选择技能',
        skill_loot: '获得技能', gear: '获得装备',
        battle_pick: '选择奖励'
    };
    const EVENT_TONE = {
        coin_cache: 'tone-gold',
        ember_camp: 'tone-warm',
        wandering_merchant: 'tone-merchant',
        old_altar: 'tone-mystic',
        skill_archive: 'tone-arcane',
        armory_ruin: 'tone-forge',
        blood_pact: 'tone-blood',
        mystery_chest: 'tone-gold',
        tower_spirit: 'tone-spirit',
        mirror_trial: 'tone-mirror',
        demon_whisper: 'tone-demon',
        gamblers_table: 'tone-gold',
        relic_shrine: 'tone-relic',
        training_dummy: 'tone-warm'
    };
    const CHOICE_KIND_LABEL = {
        risk: '冒险', cost: '交易', loot: '收获', heal: '恢复',
        exp: '成长', reward: '收益', neutral: '离开', action: '行动'
    };
    const CHOICE_KIND_ICON = {
        risk: '⚠', cost: '◈', loot: '✦', heal: '✚',
        exp: '★', reward: '◎', neutral: '→', action: '◆'
    };
    const RARITY_LABEL = {
        common: '普通', uncommon: '优秀', rare: '稀有', legendary: '传说'
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function classIconStyle(classId) {
        const SAP = window.StaticArtPaths;
        if (!SAP || !classId) return '';
        const url = SAP.resolveDisplayIconUrl(SAP.getClassIconUrl(classId));
        return url ? ` style="background-image:url(&quot;${url}&quot;)"` : '';
    }

    function gearDollSlotHtml(hero, slot, opts) {
        opts = opts || {};
        const RSS = opts.RSS || window.RunStateSystem;
        const bag = opts.bag || null;
        const compactCls = opts.compact ? ' ab-slot-compact' : '';
        const g = hero.equipment[slot];
        const isTarget = !!(bag && bag.kind === 'gear' && bag.slot === slot);
        const canWear = !!(bag && bag.kind === 'gear' && bag.slot === slot
            && RSS && RSS.canHeroWearGear(hero, bag.gear));
        let inner = '';
        if (g) {
            const st = formatGearStats(g);
            if (canWear) {
                inner = `<button type="button" class="ab-slot-panel filled rarity-${esc(st.rarity)} droppable${compactCls}" data-fill-gear="${slot}">
                    <div class="ab-slot-panel-head"><span>${esc(SLOT_LABEL[slot] || slot)}</span><span class="ab-slot-replace-hint">替换</span></div>
                    <div class="ab-slot-gear-row">
                        <span class="ab-slot-gear-icon" style="${gearIconStyle(g)}"></span>
                        <div><strong>${esc(st.title)}</strong></div>
                    </div>
                </button>`;
            } else if (opts.showUnequip) {
                inner = `<div class="ab-slot-panel filled rarity-${esc(st.rarity)}${compactCls}">
                    <div class="ab-slot-panel-head"><span>${esc(SLOT_LABEL[slot] || slot)}</span>
                        <button type="button" class="ab-btn ab-btn-xs" data-uneq-gear="${slot}">卸下</button></div>
                    <div class="ab-slot-gear-row">
                        <span class="ab-slot-gear-icon" style="${gearIconStyle(g)}"></span>
                        <div><strong>${esc(st.title)}</strong></div>
                    </div>
                </div>`;
            } else {
                inner = `<div class="ab-slot-panel filled rarity-${esc(st.rarity)}${compactCls}">
                    <div class="ab-slot-panel-head"><span>${esc(SLOT_LABEL[slot] || slot)}</span></div>
                    <div class="ab-slot-gear-row">
                        <span class="ab-slot-gear-icon" style="${gearIconStyle(g)}"></span>
                        <div><strong>${esc(st.title)}</strong></div>
                    </div>
                </div>`;
            }
        } else {
            inner = `<button type="button" class="ab-slot-panel empty${compactCls} ${canWear ? 'droppable' : ''}" data-fill-gear="${slot}" ${canWear ? '' : 'disabled'}>
                <span>${esc(SLOT_LABEL[slot] || slot)}</span>
                <small>${canWear ? '穿上' : '空'}</small>
            </button>`;
        }
        return `<div class="ab-gear-doll-slot${isTarget ? ' ab-slot-target' : ''}" data-slot="${slot}">${inner}</div>`;
    }

    /** 左：头/胸/鞋 · 中：职业精灵图 · 右：武器/手套 */
    function gearDollHtml(hero, opts) {
        opts = opts || {};
        const SAP = window.StaticArtPaths;
        let spriteStyle = '';
        if (SAP && hero && hero.baseClass) {
            const url = SAP.resolveDisplayIconUrl(SAP.getAutoBattlerHeroUrl(hero.baseClass));
            if (url) spriteStyle = ` style="background-image:url(&quot;${url}&quot;)"`;
        }
        let html = '<div class="ab-gear-doll">';
        ['head', 'chest', 'feet'].forEach((slot) => { html += gearDollSlotHtml(hero, slot, opts); });
        html += `<div class="ab-gear-doll-center">
            <span class="ab-gear-doll-sprite"${spriteStyle}></span>
            <strong class="ab-gear-doll-name">${esc(hero.displayName || '')}</strong>
        </div>`;
        ['weapon', 'hands'].forEach((slot) => { html += gearDollSlotHtml(hero, slot, opts); });
        html += '</div>';
        return html;
    }

    function gearIconStyle(gear) {
        const SAP = window.StaticArtPaths;
        if (!SAP || !gear) return '';
        const url = SAP.resolveDisplayIconUrl(SAP.getAutoBattlerGearIconUrl(gear));
        return url ? `background-image:url(&quot;${url}&quot;);` : '';
    }

    function skillIconStyle(defOrId) {
        const SAP = window.StaticArtPaths;
        if (!SAP) return '';
        const id = typeof defOrId === 'string' ? defOrId : (defOrId && defOrId.id);
        const name = typeof defOrId === 'object' && defOrId ? defOrId.name : skillName(id);
        const url = SAP.resolveDisplayIconUrl(SAP.getSkillIconUrl(id, name));
        return url ? `background-image:url(&quot;${url}&quot;);` : '';
    }

    function relicIconStyle(relicOrId) {
        const SAP = window.StaticArtPaths;
        if (!SAP) return '';
        const def = typeof relicOrId === 'string'
            ? (window.RelicSystem && window.RelicSystem.getRelicDef
                ? window.RelicSystem.getRelicDef(relicOrId)
                : { id: relicOrId })
            : relicOrId;
        const iconId = (window.RelicSystem && window.RelicSystem.relicIconId)
            ? window.RelicSystem.relicIconId(def || relicOrId)
            : ((def && (def.iconId || def.id)) || (typeof relicOrId === 'string' ? relicOrId : ''));
        if (!iconId) return '';
        const url = SAP.resolveDisplayIconUrl(SAP.getRelicIconUrl(iconId));
        return url ? `background-image:url(&quot;${url}&quot;);` : '';
    }

    function nodeIconHtml(nodeType) {
        const SAP = window.StaticArtPaths;
        const fallback = NODE_ICON[nodeType] || '·';
        if (!SAP) return `<span class="ab-node-icon">${fallback}</span>`;
        const url = SAP.resolveDisplayIconUrl(SAP.getAutoBattlerNodeIconUrl(nodeType));
        if (!url) return `<span class="ab-node-icon">${fallback}</span>`;
        return `<span class="ab-node-icon"><img src="${esc(url)}" alt="" class="ab-node-sprite" onerror="this.replaceWith(document.createTextNode('${fallback}'))"/></span>`;
    }

    function eventEmblemHtml() {
        const SAP = window.StaticArtPaths;
        const fallback = NODE_ICON.event || '?';
        if (!SAP) return `<span class="ab-event-emblem-fallback">${fallback}</span>`;
        const url = SAP.resolveDisplayIconUrl(SAP.getAutoBattlerNodeIconUrl('event'));
        if (!url) return `<span class="ab-event-emblem-fallback">${fallback}</span>`;
        return `<img src="${esc(url)}" alt="" class="ab-event-emblem-img" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ab-event-emblem-fallback',textContent:'${fallback}'}))"/>`;
    }

    function flattenEffectTypes(effects, out) {
        out = out || [];
        (effects || []).forEach((eff) => {
            if (!eff || !eff.type) return;
            out.push(eff.type);
            if (eff.type === 'random') {
                (eff.outcomes || []).forEach((o) => flattenEffectTypes(o.effects, out));
            }
        });
        return out;
    }

    function inferChoiceKind(choice) {
        if (!choice) return 'action';
        if (choice.risk) return 'risk';
        if (choice.costGold) return 'cost';
        const types = flattenEffectTypes(choice.effects);
        if (!types.length || (types.length === 1 && types[0] === 'random' && !(choice.effects[0].outcomes || []).length)) {
            return 'neutral';
        }
        if (types.indexOf('skill_loot') >= 0 || types.indexOf('gear_loot') >= 0 || types.indexOf('relic_add') >= 0) {
            return 'loot';
        }
        if (types.indexOf('heal_percent') >= 0 || types.indexOf('heal_one_full') >= 0) return 'heal';
        if (types.indexOf('exp_add') >= 0 && types.indexOf('gold_add') < 0 && types.indexOf('damage_percent') < 0) {
            return 'exp';
        }
        if (types.indexOf('gold_add') >= 0 && types.indexOf('damage_percent') < 0) return 'reward';
        if (types.indexOf('damage_percent') >= 0) return 'risk';
        return 'action';
    }

    function eventChoiceCardHtml(choice, afford) {
        const kind = inferChoiceKind(choice);
        const icon = CHOICE_KIND_ICON[kind] || CHOICE_KIND_ICON.action;
        const tag = CHOICE_KIND_LABEL[kind] || CHOICE_KIND_LABEL.action;
        const costTag = choice.costGold
            ? `<span class="ab-event-choice-cost">${choice.costGold}<small>G</small></span>`
            : '';
        const riskTag = choice.risk ? '<span class="ab-event-choice-risk">风险</span>' : '';
        return `<button type="button" class="ab-event-choice ${kind} ${afford ? '' : 'disabled'}"
            data-choice="${esc(choice.id)}" ${afford ? '' : 'disabled'}>
            <span class="ab-event-choice-icon" aria-hidden="true">${icon}</span>
            <span class="ab-event-choice-body">
                <span class="ab-event-choice-top">
                    <span class="ab-event-choice-tag">${esc(tag)}</span>
                    ${riskTag}${costTag}
                </span>
                <span class="ab-event-choice-name">${esc(choice.label)}</span>
                <span class="ab-event-choice-desc">${esc(choice.desc)}</span>
            </span>
            <span class="ab-event-choice-arrow" aria-hidden="true">›</span>
        </button>`;
    }

    function abCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) || {};
    }

    function skillDef(id) {
        if (!id) return null;
        const pool = abCfg().skillPool || [];
        return pool.find((s) => s.id === id) || null;
    }

    function skillName(id) {
        const d = skillDef(id);
        return d ? d.name : id;
    }

    function skillDescriptionText(defOrId) {
        const d = typeof defOrId === 'string' ? skillDef(defOrId) : defOrId;
        if (!d) return '未知技能';
        return d.description || d.name || d.id || '技能';
    }

    function formatGearStats(gear) {
        if (!gear) return { title: '空', lines: [], rarity: 'common' };
        const lines = [];
        if (gear.attack) lines.push(`攻击 +${gear.attack}`);
        if (gear.defense) lines.push(`防御 +${gear.defense}`);
        if (gear.maxHp) lines.push(`生命 +${gear.maxHp}`);
        if (gear.skillDamageMult && gear.skillDamageMult !== 1) {
            lines.push(`技能伤害 ×${Number(gear.skillDamageMult).toFixed(2)}`);
        }
        if (gear.affixLines && gear.affixLines.length) {
            gear.affixLines.forEach((line) => lines.push(line));
        } else {
            if (gear.critChance) lines.push(`暴击 +${Math.round(gear.critChance * 100)}%`);
            if (gear.cooldownMult && gear.cooldownMult !== 1) {
                lines.push(`技能冷却 ×${Number(gear.cooldownMult).toFixed(2)}`);
            }
            if (gear.onHitHeal) lines.push(`普攻回复 +${gear.onHitHeal}`);
        }
        if (gear.classTags && gear.classTags.length) {
            const RSS = window.RunStateSystem;
            lines.push('职业：' + (RSS && RSS.formatClassTags ? RSS.formatClassTags(gear.classTags) : gear.classTags.join('、')));
        }
        if (!lines.length) lines.push('无附加属性');
        return {
            title: gear.name || '装备',
            slot: gear.slot,
            rarity: gear.rarity || 'common',
            lines: lines
        };
    }

    function previewHeroStats(run, hero) {
        const PMS = window.PartyMetaSystem;
        const RSS = window.RunStateSystem;
        const effLv = RSS && RSS.effectiveHeroLevel ? RSS.effectiveHeroLevel(hero) : (hero.level || 1);
        const base = PMS && PMS.heroCombatStats
            ? PMS.heroCombatStats({ baseClass: hero.baseClass, level: effLv, classData: hero.classData })
            : { hp: 100, attack: 10, defense: 4, speed: 70, range: 50 };
        const relicFx = window.RelicSystem
            ? window.RelicSystem.aggregateRelicEffects((run && run.relics) || [])
            : { attackMult: 1, flatDefense: 0, maxHpMult: 1 };
        let attack = base.attack;
        let defense = base.defense;
        let maxHp = base.hp;
        let skillMult = 1;
        const gearBonus = { attack: 0, defense: 0, maxHp: 0 };
        Object.keys(hero.equipment || {}).forEach((slot) => {
            const g = hero.equipment[slot];
            if (!g) return;
            gearBonus.attack += g.attack || 0;
            gearBonus.defense += g.defense || 0;
            gearBonus.maxHp += g.maxHp || 0;
            if (g.skillDamageMult) skillMult *= g.skillDamageMult;
        });
        attack += gearBonus.attack;
        defense += gearBonus.defense;
        maxHp += gearBonus.maxHp;
        attack *= (relicFx.attackMult || 1);
        defense += (relicFx.flatDefense || 0);
        maxHp *= (relicFx.maxHpMult || 1);
        return {
            attack: Math.floor(attack),
            defense: Math.floor(defense),
            maxHp: Math.floor(maxHp),
            speed: base.speed,
            range: base.range,
            skillMult: skillMult,
            gearBonus: gearBonus,
            basicInterval: ((abCfg().combat || {}).basicAttackIntervalMs || 900) / 1000
        };
    }

    function skillCardHtml(defOrId, opts) {
        opts = opts || {};
        const d = typeof defOrId === 'string' ? skillDef(defOrId) : defOrId;
        const id = (d && d.id) || defOrId;
        const name = skillName(id);
        const iconStyle = skillIconStyle(d || id);
        const stars = opts.stars != null ? opts.stars : (d && d.stars);
        const starLine = stars ? `<div class="ab-skill-stars">${esc(window.RunStateSystem.formatStarLabel(stars))}</div>` : '';
        const desc = opts.compact ? '' : `<p class="ab-detail-desc ab-skill-desc">${esc(skillDescriptionText(d || id))}</p>`;
        return `<div class="ab-detail-card skill ${opts.compact ? 'ab-card-compact' : ''} ${opts.selected ? 'selected' : ''}" ${opts.attrs || ''}>
            <div class="ab-card-row">
                <div class="ab-card-icon" style="${iconStyle}"></div>
                <div class="ab-card-body">
            <div class="ab-detail-top">
                <span class="ab-detail-tag">技能</span>
                <strong>${esc(name)}</strong>
            </div>
            ${starLine}
            ${desc}
                </div>
            </div>
            ${opts.extra || ''}
        </div>`;
    }

    function gearCardHtml(gear, opts) {
        opts = opts || {};
        const st = formatGearStats(gear);
        const rarity = st.rarity || 'common';
        const iconStyle = gearIconStyle(gear);
        const affix = opts.compact
            ? ''
            : `<ul class="ab-affix-list">${st.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
        return `<div class="ab-detail-card gear rarity-${esc(rarity)} ${opts.compact ? 'ab-card-compact' : ''} ${opts.selected ? 'selected' : ''}" ${opts.attrs || ''}>
            <div class="ab-card-row">
                <div class="ab-card-icon" style="${iconStyle}"></div>
                <div class="ab-card-body">
            <div class="ab-detail-top">
                <span class="ab-detail-tag">${esc(SLOT_LABEL[st.slot] || st.slot || '装备')}</span>
                <strong>${esc(st.title)}</strong>
                <span class="ab-rarity">${esc(RARITY_LABEL[rarity] || rarity)}</span>
            </div>
            ${affix}
                </div>
            </div>
            ${opts.extra || ''}
        </div>`;
    }

    function relicMetaLine(d) {
        if (!d) return '';
        const RS = window.RelicSystem;
        const parts = [];
        if (RS && RS.formatBuildTags) {
            const tags = RS.formatBuildTags(d.buildTags || []);
            if (tags.length) parts.push(tags.slice(0, 3).join('·'));
        }
        if (RS && RS.relicTargetSkillNames) {
            const skills = RS.relicTargetSkillNames(d);
            if (skills.length) parts.push('强化：' + skills.join('、'));
        }
        return parts.join(' · ');
    }

    function relicCardHtml(relic, opts) {
        opts = opts || {};
        const d = typeof relic === 'string'
            ? (window.RelicSystem && window.RelicSystem.getRelicDef(relic))
            : relic;
        if (!d) return '';
        const iconStyle = relicIconStyle(d);
        const meta = relicMetaLine(d);
        const desc = opts.compact
            ? ''
            : `<p class="ab-detail-desc">${esc(d.description || '队伍被动')}</p>${
                meta ? `<p class="ab-detail-meta">${esc(meta)}</p>` : ''
            }`;
        return `<div class="ab-detail-card relic ${opts.compact ? 'ab-card-compact' : ''} ${opts.selected ? 'selected' : ''}" ${opts.attrs || ''}>
            <div class="ab-card-row">
                <div class="ab-card-icon" style="${iconStyle}"></div>
                <div class="ab-card-body">
            <div class="ab-detail-top">
                <span class="ab-detail-tag">遗物</span>
                <strong>${esc(d.name)}</strong>
                <span class="ab-rarity">${esc(RARITY_LABEL[d.rarity] || d.rarity || '')}</span>
            </div>
            ${desc}
                </div>
            </div>
            ${opts.extra || ''}
        </div>`;
    }

    function skillSummaryLine(defOrId) {
        return skillDescriptionText(defOrId);
    }

    function gearSummaryLine(gear) {
        const st = formatGearStats(gear);
        return st.lines.slice(0, 3).join(' · ') || '无附加属性';
    }

    function rewardPreviewSkillHtml(defOrId, opts) {
        opts = opts || {};
        const d = typeof defOrId === 'string' ? skillDef(defOrId) : defOrId;
        const id = (d && d.id) || defOrId;
        const name = skillName(id);
        const desc = skillDescriptionText(d || id);
        return `<div class="ab-reward-preview skill ${opts.selected ? 'selected' : ''}" ${opts.attrs || ''}>
            <div class="ab-reward-preview-icon" style="${skillIconStyle(d || id)}"></div>
            <div class="ab-reward-preview-body">
                <span class="ab-reward-preview-tag">技能</span>
                <strong class="ab-reward-preview-name">${esc(name)}</strong>
                <p class="ab-reward-preview-desc ab-skill-desc">${esc(desc)}</p>
            </div>
        </div>`;
    }

    function rewardPreviewGearHtml(gear, opts) {
        opts = opts || {};
        const st = formatGearStats(gear);
        const rarity = st.rarity || 'common';
        return `<div class="ab-reward-preview gear rarity-${esc(rarity)} ${opts.selected ? 'selected' : ''}" ${opts.attrs || ''}>
            <div class="ab-reward-preview-icon" style="${gearIconStyle(gear)}"></div>
            <div class="ab-reward-preview-body">
                <span class="ab-reward-preview-tag">${esc(SLOT_LABEL[st.slot] || st.slot || '装备')}</span>
                <strong class="ab-reward-preview-name">${esc(st.title)}</strong>
                <span class="ab-reward-preview-meta">${esc(gearSummaryLine(gear))}</span>
                <span class="ab-rarity">${esc(RARITY_LABEL[rarity] || rarity)}</span>
            </div>
        </div>`;
    }

    function rewardPreviewRelicHtml(relic, opts) {
        opts = opts || {};
        const d = typeof relic === 'string'
            ? (window.RelicSystem && window.RelicSystem.getRelicDef(relic))
            : relic;
        if (!d) return '';
        const meta = relicMetaLine(d);
        return `<div class="ab-reward-preview relic ${opts.selected ? 'selected' : ''}" ${opts.attrs || ''}>
            <div class="ab-reward-preview-icon" style="${relicIconStyle(d)}"></div>
            <div class="ab-reward-preview-body">
                <span class="ab-reward-preview-tag">遗物</span>
                <strong class="ab-reward-preview-name">${esc(d.name)}</strong>
                <span class="ab-reward-preview-meta">${esc(d.description || '队伍被动')}</span>
                ${meta ? `<span class="ab-reward-preview-meta ab-relic-build">${esc(meta)}</span>` : ''}
            </div>
        </div>`;
    }

    function rewardPreviewDraftOptHtml(opt, attrs) {
        if (!opt) return '';
        if (opt.type === 'skill' && opt.skill) {
            return rewardPreviewSkillHtml(opt.skill.id || opt.skill, {
                attrs: attrs + ' data-open="skill"'
            });
        }
        if (opt.type === 'gear' && opt.gear) {
            return rewardPreviewGearHtml(opt.gear, {
                attrs: attrs + ' data-open="gear"'
            });
        }
        if (opt.type === 'gold') {
            return `<div class="ab-reward-preview gold" ${attrs} data-open="none">
                <div class="ab-reward-preview-body">
                    <span class="ab-reward-preview-tag">金币</span>
                    <strong class="ab-reward-preview-name">+${opt.amount || 0} G</strong>
                    <span class="ab-reward-preview-meta">额外金币奖励</span>
                </div>
            </div>`;
        }
        if (opt.type === 'heal') {
            const pct = Math.round((opt.pct != null ? opt.pct : 0.2) * 100);
            return `<div class="ab-reward-preview heal" ${attrs} data-open="none">
                <div class="ab-reward-preview-body">
                    <span class="ab-reward-preview-tag">治疗</span>
                    <strong class="ab-reward-preview-name">全队回复 ${pct}%</strong>
                    <span class="ab-reward-preview-meta">立刻回复生命</span>
                </div>
            </div>`;
        }
        return '';
    }

    class AutoBattlerUI {
        constructor(game, controller) {
            this.game = game;
            this.controller = controller;
            controller.ui = this;
            this.root = null;
            this.shopStock = null;
            this._rewardDone = null;
            this._selectedHero = null;
            this._inspectHeroId = null;
            this._bagPick = null;
            this._equipMode = false;
            this._equipOnDone = null;
            this._eligibleHeroIds = null;
            this._loadoutTab = 'skills';
            this._rewardPick = null;
            this._equipWizard = null;
            this._rewardOnDone = null;
            this._rewardClaimBusy = false;
            this._toastTimer = 0;
            this._starUpOnDone = null;
            this._loadoutRaf = 0;
            this._currentSceneKey = null;
            this._currentSceneViewId = null;
            this._postRunSummaryActive = false;
            this._lastPhase = null;
            this._lastMapFocusLayer = null;
            this._combatBarKey = null;
            this._encounterSplashNodeId = null;
            this._encounterSplashTimer = 0;
            this._encounterSplashFadeTimer = 0;
            this._combatIntroActive = false;
            this._sceneTransitionTimer = 0;
            this._reduceMotion = typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this._ensureDom();
            this._bind();
            this._bindCanvas();
            this._deployLayer = document.getElementById('ab-deploy-layer');
            this._bindDeployLayer();
        }

        _ensureDom() {
            let root = document.getElementById('auto-battler-root');
            if (root) root.remove();
            root = document.createElement('div');
            root.id = 'auto-battler-root';
            root.innerHTML = `
                <div id="ab-hud" class="ab-hud">
                    <header class="ab-hud-top">
                        <div class="ab-brand">
                            <div>
                                <div class="ab-brand-title">恶魔塔</div>
                                <div class="ab-brand-sub" id="ab-phase-label">选路</div>
                            </div>
                        </div>
                        <div id="ab-encounter-panel" class="ab-encounter-panel" style="display:none;" aria-hidden="true">
                            <div class="ab-encounter-name" id="ab-encounter-name"></div>
                            <div class="ab-encounter-desc" id="ab-encounter-desc"></div>
                            <div class="ab-encounter-synergy" id="ab-encounter-synergy"></div>
                        </div>
                        <div class="ab-statbar" id="ab-stats"></div>
                        <div class="ab-top-actions">
                            <button type="button" id="ab-btn-skills" class="ab-btn ab-btn-ghost">技能</button>
                            <button type="button" id="ab-btn-gear" class="ab-btn ab-btn-ghost">装备</button>
                            <button type="button" id="ab-btn-abandon" class="ab-btn ab-btn-ghost ab-btn-danger">放弃</button>
                        </div>
                    </header>

                    <div id="ab-bench" class="ab-hud-bench" style="display:none;">
                        <div class="ab-bench-heroes" id="ab-bench-heroes"></div>
                        <button type="button" id="ab-start-combat" class="ab-btn ab-btn-primary ab-btn-lg">开战</button>
                    </div>

                    <div id="ab-combat-bar" class="ab-hud-combat" style="display:none;" aria-hidden="true">
                        <div class="ab-combat-heroes" id="ab-combat-heroes"></div>
                    </div>

                    <div id="ab-deploy-layer" class="ab-deploy-layer" style="display:none;" aria-hidden="true"></div>

                    <div id="ab-encounter-splash" class="ab-encounter-splash" style="display:none;" aria-hidden="true">
                        <div class="ab-encounter-splash-name" id="ab-encounter-splash-name"></div>
                    </div>

                    <!-- 节点全屏场景：选路 / 商店 / 事件 / 休整 / 战利品 / 结算 -->
                    <div id="ab-scene" class="ab-scene" style="display:none;" data-scene="">
                        <div class="ab-scene-frame">
                            <div id="ab-map-view" class="ab-view ab-scene-view"></div>
                            <div id="ab-reward-view" class="ab-view ab-scene-view" style="display:none;"></div>
                            <div id="ab-shop-view" class="ab-view ab-scene-view" style="display:none;"></div>
                            <div id="ab-event-view" class="ab-view ab-scene-view" style="display:none;"></div>
                            <div id="ab-rest-view" class="ab-view ab-scene-view" style="display:none;"></div>
                            <div id="ab-summary-view" class="ab-view ab-scene-view" style="display:none;"></div>
                        </div>
                    </div>

                    <!-- 角色构筑 / 详情面板 -->
                    <div id="ab-loadout-overlay" class="ab-loadout-overlay" style="display:none;">
                        <div class="ab-loadout-card ab-loadout-card-wide">
                            <button type="button" class="ab-sheet-close" id="ab-loadout-close">×</button>
                            <div id="ab-loadout-view" class="ab-view"></div>
                        </div>
                    </div>

                    <!-- 战利品 / 商店：精简装配向导 -->
                    <div id="ab-equip-overlay" class="ab-equip-overlay" style="display:none;">
                        <div class="ab-equip-wizard">
                            <button type="button" class="ab-sheet-close" id="ab-equip-close">×</button>
                            <div id="ab-equip-view" class="ab-view"></div>
                        </div>
                    </div>

                    <!-- 技能升星结果 -->
                    <div id="ab-starup-overlay" class="ab-starup-overlay" style="display:none;">
                        <div class="ab-starup-card" role="dialog" aria-modal="true" aria-labelledby="ab-starup-title">
                            <button type="button" class="ab-sheet-close" id="ab-starup-close">×</button>
                            <div id="ab-starup-view" class="ab-view"></div>
                        </div>
                    </div>
                </div>

                <div id="ab-meta-panel" class="ab-meta-overlay" style="display:none;">
                    <div class="ab-meta-card">
                        <header class="ab-hud-top">
                            <div class="ab-brand">
                                <div>
                                    <div class="ab-brand-title">编队大厅</div>
                                    <div class="ab-brand-sub">分配经验 · 升级转职</div>
                                </div>
                            </div>
                            <button type="button" id="ab-meta-close" class="ab-btn ab-btn-primary">关闭</button>
                        </header>
                        <div id="ab-meta-bank" class="ab-meta-bank"></div>
                        <div id="ab-meta-heroes" class="ab-meta-grid"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(root);
            this.root = root;
            this.root.style.display = 'none';
        }

        _bind() {
            document.getElementById('ab-btn-abandon').onclick = () => {
                if (confirm('放弃本局？构筑会清空，已获得经验仍会结算。')) {
                    this.controller.endRun(false);
                }
            };
            document.getElementById('ab-meta-close').onclick = () => this.hideMeta();
            document.getElementById('ab-loadout-close').onclick = () => this._hideLoadout();
            document.getElementById('ab-equip-close').onclick = () => this._finishEquipWizard(false);
            document.getElementById('ab-starup-close').onclick = () => this._finishStarUpModal();
            this._bindLoadoutDelegation();
            this._bindRewardDelegation();
            this._bindStarUpDelegation();
            document.getElementById('ab-btn-skills').onclick = () => {
                this._loadoutTab = 'skills';
                this.openLoadoutSheet();
            };
            document.getElementById('ab-btn-gear').onclick = () => {
                this._loadoutTab = 'gear';
                this.openLoadoutSheet();
            };
            document.getElementById('ab-start-combat').onclick = () => {
                const run = this.controller.run;
                if (!run || run.phase !== 'deploy' || this.controller.deployEnter) return;
                if (this._combatIntroActive || this._encounterSplashTimer || this._encounterSplashFadeTimer) return;
                const placed = run.heroes.filter((h) => h.boardCol >= 0 && h.boardRow >= 0);
                if (!placed.length) {
                    alert('请至少放置一名角色');
                    return;
                }
                const name = (this.controller.battle && this.controller.battle.encounterName) || '';
                this._beginCombatIntro(name, () => {
                    if (this.controller.startCombat()) {
                        this.game.paused = false;
                        this.refresh();
                    } else {
                        this._combatIntroActive = false;
                        this.refresh();
                    }
                });
            };
        }

        _canvasCoords(e) {
            const canvas = this.game.canvas;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY
            };
        }

        _deployInteractBlocked() {
            if (!this.controller.isActive()) return true;
            if (!this.controller.run || this.controller.run.phase !== 'deploy') return true;
            if (this.controller.deployEnter) return true;
            const scene = document.getElementById('ab-scene');
            if (scene && scene.style.display !== 'none') return true;
            const loadout = document.getElementById('ab-loadout-overlay');
            if (loadout && loadout.style.display !== 'none') return true;
            const equip = document.getElementById('ab-equip-overlay');
            if (equip && equip.style.display !== 'none') return true;
            return false;
        }

        _bindCanvas() {
            const canvas = this.game.canvas;
            if (!canvas || canvas._abClickBound) return;
            canvas._abClickBound = true;
            canvas.addEventListener('click', (e) => {
                if (this._deployInteractBlocked()) return;
                const { x, y } = this._canvasCoords(e);
                this.controller.handleCanvasClick(x, y);
            });
        }

        _bindDeployLayer() {
            const layer = this._deployLayer;
            if (!layer || layer._abDeployBound) return;
            layer._abDeployBound = true;
            let activePointer = null;

            layer.addEventListener('pointerdown', (e) => {
                if (this._deployInteractBlocked()) return;
                if (e.button !== 0) return;
                activePointer = e.pointerId;
                layer.setPointerCapture(e.pointerId);
                const { x, y } = this._canvasCoords(e);
                this.controller.handleDeployPointerDown(x, y);
                e.preventDefault();
            });

            layer.addEventListener('pointermove', (e) => {
                if (activePointer !== e.pointerId || !this.controller._deployDrag) return;
                const { x, y } = this._canvasCoords(e);
                this.controller.handleDeployPointerMove(x, y);
            });

            const finish = (e) => {
                if (activePointer !== e.pointerId) return;
                layer.releasePointerCapture(e.pointerId);
                activePointer = null;
                const { x, y } = this._canvasCoords(e);
                this.controller.handleDeployPointerUp(x, y);
            };
            layer.addEventListener('pointerup', finish);
            layer.addEventListener('pointercancel', (e) => {
                if (activePointer !== e.pointerId) return;
                layer.releasePointerCapture(e.pointerId);
                activePointer = null;
                this.controller.cancelDeployDrag();
            });
            if (!this._deployResizeBound) {
                this._deployResizeBound = true;
                window.addEventListener('resize', () => this._syncDeployLayer());
            }
        }

        _syncDeployLayer() {
            const layer = this._deployLayer || document.getElementById('ab-deploy-layer');
            if (!layer) return;
            const run = this.controller.run;
            const show = !!(run && run.phase === 'deploy' && !this.controller.deployEnter && !this._combatIntroActive);
            layer.style.display = show ? 'block' : 'none';
            layer.setAttribute('aria-hidden', show ? 'false' : 'true');
        }

        _showCombatBar(show) {
            const bar = document.getElementById('ab-combat-bar');
            if (!bar) return;
            bar.style.display = show ? 'flex' : 'none';
            bar.setAttribute('aria-hidden', show ? 'false' : 'true');
            if (!show) this._combatBarKey = null;
        }

        _combatBarShellKey(battle) {
            if (!battle || !battle.allies) return '';
            return battle.allies.map((u) => u.heroId + ':' + (u.skills || []).map((s) => s.id).join(',')).join('|');
        }

        _formatSkillCd(ms) {
            if (!ms || ms <= 0) return '';
            if (ms >= 1000) return Math.ceil(ms / 1000) + 's';
            return (Math.ceil(ms / 100) / 10).toFixed(1) + 's';
        }

        renderCombatBarShell(battle) {
            const el = document.getElementById('ab-combat-heroes');
            if (!el || !battle || !battle.allies || !battle.allies.length) return;
            const key = this._combatBarShellKey(battle);
            if (key === this._combatBarKey) return;
            this._combatBarKey = key;
            el.innerHTML = '';
            battle.allies.forEach((u) => {
                const card = document.createElement('div');
                card.className = 'ab-combat-card ' + (CLASS_TONE[u.baseClass] || '');
                card.dataset.heroId = u.heroId;
                const skills = u.skills || [];
                let skillsHtml = '';
                if (skills.length) {
                    skillsHtml = skills.map((sk, i) => `
                        <div class="ab-combat-skill" data-skill-idx="${i}" title="${esc(skillDescriptionText(sk.id))}">
                            <span class="ab-combat-skill-icon" style="${skillIconStyle(sk.id)}"></span>
                            <span class="ab-combat-skill-cd"></span>
                            <span class="ab-combat-skill-cd-text"></span>
                        </div>`).join('');
                } else {
                    skillsHtml = '<span class="ab-combat-no-skills">无技能</span>';
                }
                card.innerHTML = `
                    <span class="ab-combat-avatar"${classIconStyle(u.baseClass)} aria-hidden="true"></span>
                    <div class="ab-combat-body">
                        <span class="ab-combat-name">${esc(u.name || u.heroId)}</span>
                        <div class="ab-combat-hp">
                            <div class="ab-combat-hp-track">
                                <i class="ab-combat-hp-fill"></i>
                            </div>
                            <span class="ab-combat-hp-text"></span>
                        </div>
                        <div class="ab-combat-skills">${skillsHtml}</div>
                    </div>`;
                el.appendChild(card);
            });
        }

        refreshCombatBar(battle) {
            if (!battle || !battle.allies) return;
            this.renderCombatBarShell(battle);
            const el = document.getElementById('ab-combat-heroes');
            if (!el) return;
            battle.allies.forEach((u) => {
                const card = el.querySelector(`.ab-combat-card[data-hero-id="${u.heroId}"]`);
                if (!card) return;
                const dead = !u.alive;
                card.classList.toggle('dead', dead);
                const hpPct = dead ? 0 : Math.max(0, Math.min(100, (u.hp / Math.max(1, u.maxHp)) * 100));
                const fill = card.querySelector('.ab-combat-hp-fill');
                if (fill) fill.style.width = hpPct + '%';
                const hpText = card.querySelector('.ab-combat-hp-text');
                if (hpText) {
                    hpText.textContent = dead ? '阵亡' : `${Math.max(0, Math.floor(u.hp))}/${Math.max(1, Math.floor(u.maxHp))}`;
                }
                (u.skills || []).forEach((sk, i) => {
                    const slot = card.querySelector(`.ab-combat-skill[data-skill-idx="${i}"]`);
                    if (!slot) return;
                    const cd = sk.cd || 0;
                    const ready = cd <= 0;
                    slot.classList.toggle('ready', ready && !dead);
                    slot.classList.toggle('on-cd', !ready);
                    const overlay = slot.querySelector('.ab-combat-skill-cd');
                    const cdText = slot.querySelector('.ab-combat-skill-cd-text');
                    const pct = ready ? 0 : Math.min(100, (cd / Math.max(1, sk.cooldownMs || 1)) * 100);
                    if (overlay) overlay.style.height = pct + '%';
                    if (cdText) cdText.textContent = ready ? '' : this._formatSkillCd(cd);
                });
            });
        }

        show() {
            if (this.root) {
                this.root.style.display = 'block';
                this.root.classList.remove('ab-meta-only');
            }
            const hud = document.getElementById('ab-hud');
            if (hud) hud.style.display = '';
            this._lastMapFocusLayer = null;
            this._lastPhase = null;
            this._currentSceneKey = null;
            this._currentSceneViewId = null;
            this.game.paused = true;
            this.refresh();
        }

        hide() {
            if (this.root) this.root.style.display = 'none';
            this._postRunSummaryActive = false;
            this.hideMeta();
            this._hideScene();
            this._hideLoadout();
            this.game.paused = false;
        }

        showMeta() {
            this.controller.ensurePartyMeta();
            const panel = document.getElementById('ab-meta-panel');
            if (panel) panel.style.display = 'flex';
            if (this.root) {
                this.root.style.display = 'block';
                this.root.classList.add('ab-meta-only');
            }
            const hud = document.getElementById('ab-hud');
            if (hud && !this.controller.run) hud.style.display = 'none';
            this.game.paused = true;
            this.refreshMeta();
        }

        hideMeta() {
            const panel = document.getElementById('ab-meta-panel');
            if (panel) panel.style.display = 'none';
            if (this.root) this.root.classList.remove('ab-meta-only');
            const hud = document.getElementById('ab-hud');
            const resumePostRunSummary = !this.controller.run && this._postRunSummaryActive;
            if (!this.controller.run && this.root) {
                if (resumePostRunSummary) {
                    this.root.style.display = 'block';
                    if (hud) hud.style.display = 'none';
                    const scene = document.getElementById('ab-scene');
                    if (scene) {
                        scene.style.display = 'flex';
                        scene.classList.remove('ab-scene-hiding');
                    }
                    const summaryView = document.getElementById('ab-summary-view');
                    if (summaryView) summaryView.style.display = 'block';
                    this.game.paused = true;
                } else {
                    this.root.style.display = 'none';
                    if (hud) hud.style.display = '';
                    this.game.paused = false;
                }
            } else if (hud) {
                hud.style.display = '';
            }
            if (this.game && typeof this.game.syncAutoBattlerTownHud === 'function') {
                this.game.syncAutoBattlerTownHud();
            }
        }

        _showScene(sceneKey) {
            const scene = document.getElementById('ab-scene');
            if (scene) {
                scene.style.display = 'flex';
                scene.classList.remove('ab-scene-hiding');
                scene.setAttribute('data-scene', sceneKey || '');
            }
            this._currentSceneKey = sceneKey || '';
            this._resetOverlayScroll();
            this._hideLoadout();
        }

        _sceneTransitionMs() {
            return this._reduceMotion ? 0 : 160;
        }

        _hideScene(immediate) {
            const scene = document.getElementById('ab-scene');
            if (!scene || scene.style.display === 'none') return;
            this._clearSceneTransitionTimer();
            const finish = () => {
                scene.style.display = 'none';
                scene.classList.remove('ab-scene-hiding');
                scene.style.opacity = '';
                scene.setAttribute('data-scene', '');
                this._currentSceneKey = null;
                this._currentSceneViewId = null;
                this._hideAllSceneViews();
                ['ab-map-view', 'ab-reward-view', 'ab-shop-view', 'ab-event-view',
                    'ab-rest-view', 'ab-summary-view'].forEach((vid) => {
                    const el = document.getElementById(vid);
                    if (el) el.classList.remove('ab-scene-enter', 'ab-scene-enter-active', 'ab-scene-exit');
                });
                this._resetOverlayScroll();
                this._hideLoadout();
                this._dismissStarUpOverlay();
                this._hideEncounterSplash();
            };
            // 进战斗/布阵时立即收起，避免半透明灰层残留
            if (immediate || this._sceneTransitionMs() <= 0) {
                finish();
            } else {
                scene.classList.add('ab-scene-hiding');
                this._sceneTransitionTimer = setTimeout(() => {
                    this._sceneTransitionTimer = 0;
                    finish();
                }, this._sceneTransitionMs());
            }
        }

        /** 切换场景/关闭面板后重置滚动，避免整屏视觉上移/下移 */
        _resetOverlayScroll() {
            const frame = document.querySelector('#ab-scene .ab-scene-frame');
            if (frame) frame.scrollTop = 0;
            document.querySelectorAll('#ab-loadout-overlay .ab-loadout-card').forEach((el) => {
                el.scrollTop = 0;
            });
            if (typeof window.scrollTo === 'function') {
                window.scrollTo(0, 0);
            }
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
        }

        _hideLoadout(opts) {
            opts = opts || {};
            const el = document.getElementById('ab-loadout-overlay');
            if (el) {
                el.style.display = 'none';
                el.classList.remove('ab-loadout-equip');
            }
            if (!this._equipMode) return;
            this._equipMode = false;
            this._bagPick = null;
            this._eligibleHeroIds = null;
            const cb = this._equipOnDone;
            this._equipOnDone = null;
            if (!opts.silent && cb) cb();
        }

        /** 战利品/商店/事件：强制打开构筑面板（对应角色 + 技能/装备 Tab） */
        openEquipFlow(pending, onDone) {
            const run = this.controller.run;
            const RSS = window.RunStateSystem;
            if (!run || !pending) { onDone && onDone(); return; }

            let heroes = [];
            if (pending.kind === 'skill') {
                heroes = RSS.getEligibleHeroesForSkill(run, pending.skillId);
            } else if (pending.kind === 'gear') {
                heroes = RSS.getEligibleHeroesForGear(run, pending.gear);
            }
            if (!heroes.length) {
                alert('没有角色能用这件物品，已放进背包');
                onDone && onDone();
                return;
            }

            this._equipMode = true;
            this._equipOnDone = onDone;
            this._eligibleHeroIds = heroes.map((h) => h.heroId);
            this._inspectHeroId = heroes[0].heroId;

            if (pending.kind === 'skill') {
                this._bagPick = { kind: 'skill', id: pending.skillId };
                this._loadoutTab = 'skills';
            } else {
                const g = pending.gear;
                this._bagPick = { kind: 'gear', uid: g.uid, slot: g.slot, name: g.name, gear: g };
                this._loadoutTab = 'gear';
            }

            this.renderLoadout();
            const overlay = document.getElementById('ab-loadout-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.classList.add('ab-loadout-equip');
            }
            const equipOverlay = document.getElementById('ab-equip-overlay');
            if (equipOverlay) equipOverlay.style.display = 'none';
        }

        _scheduleLoadoutRender() {
            if (this._loadoutRaf) cancelAnimationFrame(this._loadoutRaf);
            this._loadoutRaf = requestAnimationFrame(() => {
                this._loadoutRaf = 0;
                this.renderLoadout();
            });
        }

        _bindLoadoutDelegation() {
            const el = document.getElementById('ab-loadout-view');
            if (!el || el.dataset.delegated === '1') return;
            el.dataset.delegated = '1';
            el.addEventListener('click', (e) => {
                const run = this.controller.run;
                const RSS = window.RunStateSystem;
                if (!run || !RSS) return;
                const hero = RSS.findHero(run, this._inspectHeroId);
                if (!hero) return;

                const doneBtn = e.target.closest('#ab-loadout-done');
                if (doneBtn) {
                    this._hideLoadout();
                    return;
                }
                const tabBtn = e.target.closest('[data-loadout-tab]');
                if (tabBtn) {
                    if (this._equipMode) return;
                    if (tabBtn.classList.contains('locked')) return;
                    this._loadoutTab = tabBtn.getAttribute('data-loadout-tab');
                    this._scheduleLoadoutRender();
                    return;
                }
                const inspectBtn = e.target.closest('[data-inspect]');
                if (inspectBtn) {
                    this._inspectHeroId = inspectBtn.getAttribute('data-inspect');
                    this._scheduleLoadoutRender();
                    return;
                }
                const bagSkill = e.target.closest('[data-bag-skill]');
                if (bagSkill) {
                    const id = bagSkill.getAttribute('data-bag-skill');
                    if (!RSS.canHeroUseSkill(hero, id)) {
                        alert('该角色无法学习此技能');
                        return;
                    }
                    this._bagPick = { kind: 'skill', id: id };
                    if (this._equipMode) this._loadoutTab = 'skills';
                    this._scheduleLoadoutRender();
                    return;
                }
                const bagGear = e.target.closest('[data-bag-gear]');
                if (bagGear) {
                    const uid = bagGear.getAttribute('data-bag-gear');
                    const g = run.inventoryGear.find((x) => x.uid === uid);
                    if (!g) return;
                    if (!RSS.canHeroWearGear(hero, g)) {
                        alert('该角色无法穿戴（职业：' + RSS.formatClassTags(g.classTags) + '）');
                        return;
                    }
                    this._bagPick = { kind: 'gear', uid: g.uid, slot: g.slot, name: g.name, gear: g };
                    if (this._equipMode) this._loadoutTab = 'gear';
                    this._scheduleLoadoutRender();
                    return;
                }
                if (e.target.closest('#ab-bag-clear')) {
                    if (this._equipMode) return;
                    this._bagPick = null;
                    this._scheduleLoadoutRender();
                    return;
                }
                if (e.target.closest('#ab-bag-clear-gear')) {
                    if (this._equipMode) return;
                    this._bagPick = null;
                    this._scheduleLoadoutRender();
                    return;
                }
                const fillSkill = e.target.closest('[data-fill-skill]');
                if (fillSkill) {
                    if (!this._bagPick || this._bagPick.kind !== 'skill') {
                        alert('请先选择要装配的技能');
                        return;
                    }
                    const res = RSS.equipSkill(run, hero.heroId, this._bagPick.id, +fillSkill.getAttribute('data-fill-skill'));
                    if (!res.ok) { alert(res.message || '装配失败'); return; }
                    if (this._equipMode) this._finishEquipFlow();
                    else { this._bagPick = null; this._scheduleLoadoutRender(); }
                    return;
                }
                const fillGear = e.target.closest('[data-fill-gear]');
                if (fillGear) {
                    const slot = fillGear.getAttribute('data-fill-gear');
                    if (!this._bagPick || this._bagPick.kind !== 'gear') {
                        alert('请先选择要装配的装备');
                        return;
                    }
                    if (this._bagPick.slot !== slot) {
                        alert('部位不匹配：该物品是' + (SLOT_LABEL[this._bagPick.slot] || this._bagPick.slot));
                        return;
                    }
                    const res = RSS.equipGear(run, hero.heroId, this._bagPick.gear);
                    if (!res.ok) { alert(res.message || '装配失败'); return; }
                    if (this._equipMode) this._finishEquipFlow();
                    else { this._bagPick = null; this._scheduleLoadoutRender(); }
                    return;
                }
                const uneqSkill = e.target.closest('[data-uneq-skill]');
                if (uneqSkill) {
                    RSS.unequipSkill(run, hero.heroId, +uneqSkill.getAttribute('data-uneq-skill'));
                    this._scheduleLoadoutRender();
                    return;
                }
                const uneqGear = e.target.closest('[data-uneq-gear]');
                if (uneqGear) {
                    RSS.unequipGear(run, hero.heroId, uneqGear.getAttribute('data-uneq-gear'));
                    this._scheduleLoadoutRender();
                    return;
                }
            });
        }

        showToast(text) {
            const msg = String(text || '').trim();
            if (!msg) return;
            let el = document.getElementById('ab-toast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'ab-toast';
                el.className = 'ab-toast';
                el.setAttribute('role', 'status');
                const hud = document.getElementById('ab-hud');
                (hud || document.body).appendChild(el);
            }
            el.textContent = msg;
            el.classList.add('show');
            if (this._toastTimer) clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => {
                el.classList.remove('show');
                this._toastTimer = 0;
            }, 2200);
        }

        _rewardChoiceMatchesOpen(choice, openKind, oi) {
            if (!choice) return false;
            oi = oi || 0;
            if (openKind === 'skill') {
                return choice.kind === 'skill_loot' || choice.kind === 'skill_pick' ||
                    (choice.kind === 'battle_pick' && choice.options && choice.options[oi] &&
                        choice.options[oi].type === 'skill');
            }
            if (openKind === 'gear') {
                return choice.kind === 'gear' ||
                    (choice.kind === 'battle_pick' && choice.options && choice.options[oi] &&
                        choice.options[oi].type === 'gear');
            }
            if (openKind === 'none') {
                if (choice.kind === 'relic_pick') return true;
                if (choice.kind === 'battle_pick' && choice.options && choice.options[oi]) {
                    const t = choice.options[oi].type;
                    return t === 'gold' || t === 'heal';
                }
                return false;
            }
            return true;
        }

        _afterRewardClaim(result, onDone) {
            const finish = () => {
                this._rewardClaimBusy = false;
                this.showReward(onDone);
            };
            if (result && result.kind === 'skill') {
                if (result.starUp) {
                    this.openStarUpModal(result, finish);
                    return;
                }
                this.openEquipFlow({ kind: 'skill', skillId: result.skillId }, finish);
                return;
            }
            if (result && result.kind === 'gear') {
                this.openEquipFlow({ kind: 'gear', gear: result.gear }, finish);
                return;
            }
            if (result && result.kind === 'gold') {
                this.showToast('获得 ' + (result.amount || 0) + ' 金币');
            } else if (result && result.kind === 'heal') {
                this.showToast('全队回复 ' + Math.round((result.pct || 0) * 100) + '% 生命');
            }
            finish();
        }

        _starUpWhereText(result) {
            const run = this.controller && this.controller.run;
            const RSS = window.RunStateSystem;
            if (!run || !RSS || !result) return '已有技能';
            if (result.heroId != null) {
                const hero = RSS.findHero(run, result.heroId);
                const heroName = hero ? hero.displayName : result.heroId;
                const slot = (result.slotIndex | 0) + 1;
                return `已装配于 ${heroName} · 技能槽 ${slot}`;
            }
            return '技能背包中的同名技能';
        }

        _starUpBonusLines(prevStars, nextStars) {
            const RSS = window.RunStateSystem;
            if (!RSS || typeof RSS.getStarScaling !== 'function') return [];
            const before = RSS.getStarScaling(prevStars);
            const after = RSS.getStarScaling(nextStars);
            const lines = [];
            if (after.damageMult !== before.damageMult) {
                lines.push(`技能伤害 ×${before.damageMult.toFixed(2)} → ×${after.damageMult.toFixed(2)}`);
            }
            if (after.cooldownMult !== before.cooldownMult) {
                lines.push(`冷却倍率 ×${before.cooldownMult.toFixed(2)} → ×${after.cooldownMult.toFixed(2)}`);
            }
            if ((after.chainJumpBonus || 0) > (before.chainJumpBonus || 0)) {
                lines.push('连锁跳跃 +1');
            }
            if ((after.lifestealBonus || 0) > (before.lifestealBonus || 0)) {
                const pct = Math.round((after.lifestealBonus || 0) * 100);
                lines.push(`吸血 +${pct}%`);
            }
            if (!lines.length) {
                lines.push('技能变强了');
            }
            return lines;
        }

        openStarUpModal(result, onDone) {
            const view = document.getElementById('ab-starup-view');
            const overlay = document.getElementById('ab-starup-overlay');
            if (!view || !overlay || !result) {
                onDone && onDone();
                return;
            }
            const RSS = window.RunStateSystem;
            const skillId = result.skillId;
            const nextStars = Math.max(1, result.stars | 0 || 1);
            const prevStars = Math.max(1, (result.prevStars != null ? result.prevStars : nextStars - 1) | 0);
            const name = skillName(skillId) || skillId;
            const desc = skillDescriptionText(skillId);
            const prevLabel = RSS ? RSS.formatStarLabel(prevStars) : `${prevStars}★`;
            const nextLabel = RSS ? RSS.formatStarLabel(nextStars) : `${nextStars}★`;
            const where = this._starUpWhereText(result);
            const bonuses = this._starUpBonusLines(prevStars, nextStars);

            this._starUpOnDone = onDone;
            view.innerHTML = `
                <header class="ab-starup-head">
                    <h2 id="ab-starup-title">技能升星</h2>
                </header>
                <div class="ab-starup-skill">
                    <div class="ab-starup-icon" style="${skillIconStyle(skillId)}"></div>
                    <div class="ab-starup-skill-body">
                        <strong class="ab-starup-name">${esc(name)}</strong>
                        <p class="ab-starup-skill-desc">${esc(desc)}</p>
                        <span class="ab-starup-where">${esc(where)}</span>
                    </div>
                </div>
                <div class="ab-starup-stars" aria-label="星级变化">
                    <div class="ab-starup-star-col">
                        <span class="ab-starup-star-label">升星前</span>
                        <span class="ab-starup-star-value">${esc(prevLabel)}</span>
                    </div>
                    <span class="ab-starup-arrow" aria-hidden="true">→</span>
                    <div class="ab-starup-star-col after">
                        <span class="ab-starup-star-label">升星后</span>
                        <span class="ab-starup-star-value">${esc(nextLabel)}</span>
                    </div>
                </div>
                <ul class="ab-starup-bonuses">
                    ${bonuses.map((l) => `<li>${esc(l)}</li>`).join('')}
                </ul>
                <footer class="ab-starup-footer">
                    <button type="button" id="ab-starup-continue" class="ab-btn ab-btn-primary ab-btn-lg">继续</button>
                </footer>`;
            overlay.style.display = 'flex';
        }

        _finishStarUpModal() {
            const overlay = document.getElementById('ab-starup-overlay');
            if (overlay) overlay.style.display = 'none';
            const cb = this._starUpOnDone;
            this._starUpOnDone = null;
            if (cb) cb();
        }

        /** 仅关闭升星层，不触发回调（场景强制收起时用） */
        _dismissStarUpOverlay() {
            const overlay = document.getElementById('ab-starup-overlay');
            if (overlay) overlay.style.display = 'none';
            this._starUpOnDone = null;
        }

        _bindStarUpDelegation() {
            const el = document.getElementById('ab-starup-view');
            if (!el || el.dataset.delegated === '1') return;
            el.dataset.delegated = '1';
            el.addEventListener('click', (e) => {
                if (e.target.closest('#ab-starup-continue')) {
                    this._finishStarUpModal();
                }
            });
        }

        _bindRewardDelegation() {
            const el = document.getElementById('ab-reward-view');
            if (!el || el.dataset.delegated === '1') return;
            el.dataset.delegated = '1';
            el.addEventListener('click', (e) => {
                const onDone = this._rewardOnDone;
                const loot = this.controller.run && this.controller.run.pendingLoot;
                if (!loot) return;

                const claimBtn = e.target.closest('[data-reward-claim]');
                if (claimBtn) {
                    if (this._rewardClaimBusy || this._equipMode || this._starUpOnDone) return;
                    const ci = +claimBtn.getAttribute('data-reward-claim');
                    const oi = claimBtn.hasAttribute('data-reward-oi')
                        ? +claimBtn.getAttribute('data-reward-oi') : 0;
                    const openKind = claimBtn.getAttribute('data-open') || 'none';
                    const choice = loot.choices && loot.choices[ci];
                    // 升星失败未刷新等情况下 DOM 索引会错位，先校验再领取
                    if (!this._rewardChoiceMatchesOpen(choice, openKind, oi)) {
                        this.showReward(onDone);
                        return;
                    }
                    this._rewardClaimBusy = true;
                    let result = { kind: 'none' };
                    try {
                        result = this.controller.takeRewardOption(ci, oi);
                    } catch (err) {
                        console.error('领取战利品失败', err);
                        this._rewardClaimBusy = false;
                        this.showReward(onDone);
                        return;
                    }
                    this._afterRewardClaim(result, onDone);
                    return;
                }

                if (e.target.closest('#ab-reward-continue')) {
                    if (this._rewardClaimBusy || this._equipMode || this._starUpOnDone) return;
                    if (loot.choices && loot.choices.length) return;
                    this.controller.run.pendingLoot = null;
                    this._hideScene();
                    if (onDone) onDone();
                }
            });
        }

        renderEquipWizard() {
            /* 已弃用：装配改由构筑面板完成 */
        }

        _finishEquipWizard(didEquip) {
            const overlay = document.getElementById('ab-equip-overlay');
            if (overlay) overlay.style.display = 'none';
            this._equipWizard = null;
        }

        _finishEquipFlow() {
            this._equipMode = false;
            this._bagPick = null;
            this._eligibleHeroIds = null;
            const cb = this._equipOnDone;
            this._equipOnDone = null;
            const el = document.getElementById('ab-loadout-overlay');
            if (el) {
                el.style.display = 'none';
                el.classList.remove('ab-loadout-equip');
            }
            this._resetOverlayScroll();
            if (cb) cb();
        }

        _hideAllSceneViews() {
            ['ab-map-view', 'ab-reward-view', 'ab-shop-view', 'ab-event-view',
                'ab-rest-view', 'ab-summary-view'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        _clearSceneTransitionTimer() {
            if (this._sceneTransitionTimer) {
                clearTimeout(this._sceneTransitionTimer);
                this._sceneTransitionTimer = 0;
            }
        }

        _showSceneView(id, sceneKey, opts) {
            opts = opts || {};
            const scene = document.getElementById('ab-scene');
            const nextEl = document.getElementById(id);
            if (!scene || !nextEl) return;

            const resolvedKey = sceneKey || id.replace('ab-', '').replace('-view', '');
            const sceneWasOpen = scene.style.display !== 'none';
            const sameView = sceneWasOpen && this._currentSceneViewId === id;
            const sceneChanged = !sceneWasOpen || this._currentSceneKey !== resolvedKey;

            // 换场景时才关构筑；同一弹窗内容刷新不播淡入，避免闪屏/叠灰
            if (sceneChanged && !opts.keepLoadout) {
                this._hideLoadout();
            }

            scene.style.display = 'flex';
            scene.classList.remove('ab-scene-hiding');
            scene.style.opacity = '';
            scene.setAttribute('data-scene', resolvedKey);
            this._currentSceneKey = resolvedKey;
            this._currentSceneViewId = id;
            if (!opts.keepScroll) this._resetOverlayScroll();

            if (sameView) {
                nextEl.style.display = 'block';
                nextEl.style.opacity = '';
                nextEl.classList.remove('ab-scene-enter', 'ab-scene-enter-active', 'ab-scene-exit');
                return;
            }

            this._clearSceneTransitionTimer();
            this._hideAllSceneViews();
            nextEl.style.display = 'block';
            nextEl.style.opacity = '';
            nextEl.classList.remove('ab-scene-enter', 'ab-scene-enter-active', 'ab-scene-exit');

            const ms = this._sceneTransitionMs();
            if (ms > 0) {
                nextEl.classList.add('ab-scene-enter');
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (this._currentSceneViewId !== id) return;
                        nextEl.classList.add('ab-scene-enter-active');
                    });
                });
                this._sceneTransitionTimer = setTimeout(() => {
                    this._sceneTransitionTimer = 0;
                    nextEl.classList.remove('ab-scene-enter', 'ab-scene-enter-active');
                    nextEl.style.opacity = '';
                }, ms + 40);
            }
        }

        _setPhaseLabel(phaseEl, phase) {
            if (!phaseEl) return;
            const label = PHASE_LABEL[phase] || phase;
            if (this._lastPhase !== phase) {
                phaseEl.textContent = label;
                if (!this._reduceMotion) {
                    phaseEl.classList.remove('ab-phase-pulse');
                    void phaseEl.offsetWidth;
                    phaseEl.classList.add('ab-phase-pulse');
                }
                this._lastPhase = phase;
            } else {
                phaseEl.textContent = label;
            }
        }

        _syncEncounterPanel() {
            const panel = document.getElementById('ab-encounter-panel');
            if (panel) {
                panel.style.display = 'none';
                panel.setAttribute('aria-hidden', 'true');
            }
        }

        _clearEncounterSplashTimers() {
            if (this._encounterSplashTimer) {
                clearTimeout(this._encounterSplashTimer);
                this._encounterSplashTimer = 0;
            }
            if (this._encounterSplashFadeTimer) {
                clearTimeout(this._encounterSplashFadeTimer);
                this._encounterSplashFadeTimer = 0;
            }
        }

        _hideEncounterSplash() {
            const splash = document.getElementById('ab-encounter-splash');
            const nameEl = document.getElementById('ab-encounter-splash-name');
            this._clearEncounterSplashTimers();
            if (!splash) return;
            splash.style.display = 'none';
            splash.style.opacity = '';
            splash.classList.remove('ab-encounter-splash-in', 'ab-encounter-splash-out');
            if (nameEl) nameEl.classList.remove('ab-encounter-splash-name-in', 'ab-encounter-splash-name-out');
            splash.setAttribute('aria-hidden', 'true');
        }

        /** 开战前：备战席下收 → 战斗栏上展 → 配置名浮现，最后开打 */
        _beginCombatIntro(name, onDone) {
            this._combatIntroActive = true;
            this.game.paused = true;
            this._syncDeployLayer();

            const phaseEl = document.getElementById('ab-phase-label');
            if (phaseEl) phaseEl.textContent = PHASE_LABEL.combat || '激战';

            const battle = this.controller && this.controller.battle;
            if (battle) {
                this.renderCombatBarShell(battle);
                this.refreshCombatBar(battle);
            }

            const afterBars = () => {
                if (!name) {
                    this._combatIntroActive = false;
                    if (onDone) onDone();
                    return;
                }
                this._showEncounterSplash(name, () => {
                    this._combatIntroActive = false;
                    if (onDone) onDone();
                });
            };

            if (this._reduceMotion) {
                const bench = document.getElementById('ab-bench');
                if (bench) {
                    bench.style.display = 'none';
                    bench.classList.remove('ab-bench-enter', 'ab-bar-exit');
                }
                this._showCombatBar(true);
                afterBars();
                return;
            }

            this._playBottomBarHandoff(afterBars);
        }

        /** 旧底栏向下收起，新底栏向上展开 */
        _playBottomBarHandoff(onDone) {
            const bench = document.getElementById('ab-bench');
            const combat = document.getElementById('ab-combat-bar');
            const exitMs = 280;
            const enterMs = 320;
            const enterDelay = 120;

            if (bench && bench.style.display !== 'none') {
                bench.classList.remove('ab-bench-enter');
                bench.classList.add('ab-bar-exit');
                bench.style.pointerEvents = 'none';
            } else if (bench) {
                bench.style.display = 'none';
            }

            if (combat) {
                combat.classList.remove('ab-bar-enter');
                combat.style.display = 'flex';
                combat.setAttribute('aria-hidden', 'false');
                combat.classList.add('ab-bar-enter-prep');
            }

            this._encounterSplashTimer = setTimeout(() => {
                if (combat) {
                    combat.classList.remove('ab-bar-enter-prep');
                    void combat.offsetWidth;
                    combat.classList.add('ab-bar-enter');
                }
            }, enterDelay);

            this._encounterSplashFadeTimer = setTimeout(() => {
                this._encounterSplashFadeTimer = 0;
                this._encounterSplashTimer = 0;
                if (bench) {
                    bench.style.display = 'none';
                    bench.style.pointerEvents = '';
                    bench.classList.remove('ab-bar-exit', 'ab-bench-enter');
                }
                if (combat) {
                    combat.classList.remove('ab-bar-enter', 'ab-bar-enter-prep');
                }
                if (onDone) onDone();
            }, Math.max(exitMs, enterDelay + enterMs) + 40);
        }

        _showEncounterSplash(name, onDone) {
            const splash = document.getElementById('ab-encounter-splash');
            const nameEl = document.getElementById('ab-encounter-splash-name');
            if (!splash || !nameEl || !name) {
                if (onDone) onDone();
                return;
            }
            this._clearEncounterSplashTimers();
            nameEl.textContent = name;
            nameEl.classList.remove('ab-encounter-splash-name-in', 'ab-encounter-splash-name-out');
            splash.style.display = 'flex';
            splash.style.opacity = '';
            splash.setAttribute('aria-hidden', 'false');
            splash.classList.remove('ab-encounter-splash-in', 'ab-encounter-splash-out');
            void nameEl.offsetWidth;
            nameEl.classList.add('ab-encounter-splash-name-in');

            const inMs = this._reduceMotion ? 0 : 650;
            const holdMs = this._reduceMotion ? 60 : 900;
            const outMs = this._reduceMotion ? 0 : 650;
            this._encounterSplashTimer = setTimeout(() => {
                nameEl.classList.remove('ab-encounter-splash-name-in');
                nameEl.classList.add('ab-encounter-splash-name-out');
                this._encounterSplashFadeTimer = setTimeout(() => {
                    this._hideEncounterSplash();
                    if (onDone) onDone();
                }, outMs);
            }, inMs + holdMs);
        }

        _getMapFocusLayer(run) {
            if (!run || !run.map) return 0;
            if (!run.currentNodeId) return 0;
            const TRM = window.TowerRunMap;
            const cur = TRM.getNode(run.map, run.currentNodeId);
            if (!cur) return 0;
            if (!cur.cleared) return cur.layer;
            let nextLayer = null;
            (cur.edges || []).forEach((edgeId) => {
                const n = TRM.getNode(run.map, edgeId);
                if (n && !n.cleared) {
                    if (nextLayer == null || n.layer < nextLayer) nextLayer = n.layer;
                }
            });
            return nextLayer != null ? nextLayer : cur.layer;
        }

        _scrollMapToLayer(mapEl, layerIndex) {
            if (!mapEl) return;
            const col = mapEl.querySelector('.ab-map-layer[data-layer="' + layerIndex + '"]');
            if (!col) return;
            const targetLeft = col.offsetLeft - Math.max(0, (mapEl.clientWidth - col.offsetWidth) * 0.5);
            mapEl.scrollTo({
                left: Math.max(0, targetLeft),
                behavior: this._reduceMotion ? 'auto' : 'smooth'
            });
        }

        _flashLayerBanner(host, layerHuman, actName) {
            if (!host || this._reduceMotion) return;
            const actLine = actName ? `<span class="ab-layer-act">${esc(actName)}</span>` : '';
            host.innerHTML = `<div class="ab-layer-banner">${actLine}<strong>第 ${layerHuman} 层</strong></div>`;
            setTimeout(() => { host.innerHTML = ''; }, 1600);
        }

        refreshMeta() {
            const meta = this.controller.ensurePartyMeta();
            const bankEl = document.getElementById('ab-meta-bank');
            const heroesEl = document.getElementById('ab-meta-heroes');
            if (bankEl) {
                bankEl.innerHTML = `
                    <div class="ab-bank-card">
                        <div class="ab-bank-value">${meta.expBank}</div>
                        <div class="ab-bank-label">经验银行</div>
                    </div>
                    <div class="ab-bank-meta">
                        <div><span>通关</span><strong>${meta.runsCompleted}</strong></div>
                        <div><span>最高节点</span><strong>${meta.highestRunLayer}</strong></div>
                    </div>`;
            }
            if (!heroesEl) return;
            heroesEl.innerHTML = '';
            meta.heroes.forEach((h) => {
                const need = window.PartyMetaSystem.expToNextLevel(h.level);
                const opts = window.PartyMetaSystem.getAdvancementOptions(h);
                const pct = Math.min(100, Math.floor((h.exp / Math.max(1, need)) * 100));
                const card = document.createElement('div');
                card.className = 'ab-hero-card ' + (CLASS_TONE[h.baseClass] || '');
                const active = window.PartyMetaSystem.getActiveClassIdForHero(h);
                card.innerHTML = `
                    <div class="ab-hero-card-head">
                        <div class="ab-avatar"${classIconStyle(h.baseClass)}>${esc(h.displayName[0])}</div>
                        <div>
                            <h3>${esc(h.displayName)} <span class="ab-lv">Lv.${h.level}</span></h3>
                            <p class="ab-muted">${esc(active)}</p>
                        </div>
                    </div>
                    <div class="ab-expbar"><i style="width:${pct}%"></i></div>
                    <div class="ab-exptext">${h.exp} / ${need}</div>
                    <div class="ab-row">
                        <button type="button" class="ab-btn ab-btn-sm" data-alloc="50">+50</button>
                        <button type="button" class="ab-btn ab-btn-sm" data-alloc="200">+200</button>
                        <button type="button" class="ab-btn ab-btn-sm ab-btn-primary" data-alloc="all">全部</button>
                    </div>
                    <div class="ab-row ab-job-row"></div>`;
                card.querySelectorAll('[data-alloc]').forEach((btn) => {
                    btn.onclick = () => {
                        const amt = btn.getAttribute('data-alloc') === 'all' ? meta.expBank : parseInt(btn.getAttribute('data-alloc'), 10);
                        window.PartyMetaSystem.allocateExpToHero(meta, h.baseClass, amt);
                        if (this.game.saveGameToBrowserStorage) this.game.saveGameToBrowserStorage();
                        this.refreshMeta();
                    };
                });
                const jobRow = card.querySelector('.ab-job-row');
                if (opts.length && ((h.level >= 20 && !h.classData.firstAdvancement) ||
                    (h.level >= 40 && h.classData.firstAdvancement && !h.classData.secondAdvancement))) {
                    opts.forEach((advId) => {
                        const b = document.createElement('button');
                        b.type = 'button';
                        b.className = 'ab-btn ab-btn-sm ab-btn-gold';
                        b.textContent = '转职 · ' + advId;
                        b.onclick = () => {
                            const res = window.PartyMetaSystem.tryAdvanceJob(h, advId);
                            alert(res.message || (res.ok ? '成功' : '失败'));
                            if (res.ok && this.game.saveGameToBrowserStorage) this.game.saveGameToBrowserStorage();
                            this.refreshMeta();
                        };
                        jobRow.appendChild(b);
                    });
                }
                heroesEl.appendChild(card);
            });
        }

        refresh() {
            const run = this.controller.run;
            if (!run) return;
            if (this.game && this.game._autoBattlerPresentation && this.game._applyAutoBattlerCanvasLayout) {
                this.game._applyAutoBattlerCanvasLayout();
            }
            const stats = document.getElementById('ab-stats');
            if (stats) {
                stats.innerHTML = `
                    <span class="ab-chip-stat gold"><i></i>${run.gold}</span>
                    <span class="ab-chip-stat exp"><i></i>${run.runExpEarned}</span>
                    <span class="ab-chip-stat relic"><i></i>${run.relics.length}</span>`;
            }
            const phaseEl = document.getElementById('ab-phase-label');
            this._setPhaseLabel(phaseEl, run.phase);
            this._syncEncounterPanel();

            const bench = document.getElementById('ab-bench');
            const combatBar = document.getElementById('ab-combat-bar');
            if (run.phase === 'deploy') {
                if (this._combatIntroActive) {
                    // 开战过场：保持战斗底栏，勿把备战席刷回来
                    if (bench) bench.style.display = 'none';
                    this._syncDeployLayer();
                    this._showCombatBar(true);
                    this._hideScene(true);
                    this.game.paused = true;
                } else {
                    this._showCombatBar(false);
                    const entering = this.controller.deployEnter;
                    this._syncDeployLayer();
                    if (bench) {
                        bench.style.display = entering ? 'none' : 'flex';
                        if (!entering && !this._reduceMotion) {
                            bench.classList.remove('ab-bench-enter');
                            void bench.offsetWidth;
                            bench.classList.add('ab-bench-enter');
                        }
                    }
                    if (!entering) this.refreshBench();
                    this._hideScene(true);
                    this.game.paused = !!entering ? false : true;
                }
            } else if (run.phase === 'combat') {
                this._syncDeployLayer();
                if (bench) bench.style.display = 'none';
                this._showCombatBar(true);
                if (this.controller.battle) {
                    this.renderCombatBarShell(this.controller.battle);
                    this.refreshCombatBar(this.controller.battle);
                }
                this._hideScene(true);
                this.game.paused = false;
            } else if (run.phase === 'transition') {
                this._showCombatBar(false);
                this._syncDeployLayer();
                if (bench) bench.style.display = 'none';
                this._hideScene(true);
                this.game.paused = false;
            } else if (run.phase === 'map') {
                this._showCombatBar(false);
                this._syncDeployLayer();
                if (bench) bench.style.display = 'none';
                this.renderMap();
                this._showSceneView('ab-map-view', 'map');
                this.game.paused = true;
            } else if (run.phase === 'shop') {
                if (bench) bench.style.display = 'none';
                this.showShop();
            } else if (run.phase === 'event') {
                if (bench) bench.style.display = 'none';
                this.showEvent();
            } else if (run.phase === 'rest') {
                if (bench) bench.style.display = 'none';
                this.showRest();
            } else if (run.phase === 'reward') {
                if (bench) bench.style.display = 'none';
            } else if (run.phase === 'summary') {
                if (bench) bench.style.display = 'none';
            } else {
                this._showCombatBar(false);
                if (bench) bench.style.display = 'none';
            }
            if (combatBar && run.phase !== 'combat') {
                combatBar.style.display = 'none';
            }
        }

        refreshBench() {
            const run = this.controller.run;
            const el = document.getElementById('ab-bench-heroes');
            if (!el || !run) return;
            el.innerHTML = '';
            run.heroes.forEach((h) => {
                const hpPct = Math.max(0, Math.min(100, Math.floor((h.hp / Math.max(1, h.maxHp)) * 100)));
                const stats = previewHeroStats(run, h);
                const skillCount = (h.skillSlots || []).filter(Boolean).length;
                const gearCount = Object.keys(h.equipment || {}).filter((s) => h.equipment[s]).length;
                const wrap = document.createElement('div');
                wrap.className = 'ab-bench-wrap';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ab-bench-card ' + (CLASS_TONE[h.baseClass] || '') +
                    (this._selectedHero === h.heroId ? ' selected' : '');
                btn.innerHTML = `
                    <span class="ab-bench-avatar"${classIconStyle(h.baseClass)}>${esc(h.displayName[0])}</span>
                    <span class="ab-bench-name">${esc(h.displayName)}</span>
                    <span class="ab-bench-stats">攻${stats.attack} · 防${stats.defense}</span>
                    <span class="ab-chip-hp"><i style="width:${hpPct}%"></i></span>
                    <span class="ab-bench-pos">${h.boardCol >= 0 ? '已上场' : '待命'} · 技${skillCount}/4 · 装${gearCount}/5</span>`;
                btn.onclick = () => {
                    this._selectedHero = h.heroId;
                    this.refreshBench();
                };
                btn.ondblclick = () => this.openLoadoutSheet(h.heroId);
                const detail = document.createElement('button');
                detail.type = 'button';
                detail.className = 'ab-btn ab-btn-xs ab-bench-detail';
                detail.textContent = '详情';
                detail.onclick = (e) => {
                    e.stopPropagation();
                    this.openLoadoutSheet(h.heroId);
                };
                wrap.appendChild(btn);
                wrap.appendChild(detail);
                el.appendChild(wrap);
            });
        }

        showDeploy() {
            this.refresh();
        }

        showCombat() {
            this.refresh();
        }

        openLoadoutSheet(heroId) {
            if (!this.controller.run) return;
            if (heroId) this._inspectHeroId = heroId;
            else if (!this._inspectHeroId) {
                this._inspectHeroId = this._selectedHero || this.controller.run.heroes[0].heroId;
            }
            if (!this._equipMode) {
                this._bagPick = null;
                this._eligibleHeroIds = null;
            }
            if (!this._loadoutTab) this._loadoutTab = 'skills';
            this.renderLoadout();
            const overlay = document.getElementById('ab-loadout-overlay');
            if (overlay) overlay.style.display = 'flex';
        }

        renderMap() {
            const el = document.getElementById('ab-map-view');
            const run = this.controller.run;
            if (!el || !run || !run.map) return;
            const layers = {};
            run.map.nodes.forEach((n) => {
                if (!layers[n.layer]) layers[n.layer] = [];
                layers[n.layer].push(n);
            });
            const layerKeys = Object.keys(layers).sort((a, b) => a - b);
            const focusLayer = this._getMapFocusLayer(run);
            const layerAdvanced = this._lastMapFocusLayer != null && focusLayer > this._lastMapFocusLayer;
            const shouldStagger = !this._reduceMotion && (this._lastMapFocusLayer == null || layerAdvanced);
            let html = `<div class="ab-scene-hero">
                <h2>路线</h2>
            </div>
            <div class="ab-map-stage">
                <div class="ab-layer-banner-host" id="ab-layer-banner-host"></div>
                <div class="ab-map ab-map-horizontal">`;
            layerKeys.forEach((L, idx) => {
                const layerNum = +L;
                const layerCls = ['ab-map-layer'];
                if (layerNum === focusLayer) layerCls.push('ab-map-layer-focus');
                if (layerAdvanced && layerNum === focusLayer) layerCls.push('ab-map-layer-rise');
                if (shouldStagger) layerCls.push('ab-map-layer-stagger');
                html += `<div class="${layerCls.join(' ')}" data-layer="${layerNum}" style="--ab-layer-i:${idx}">`;
                const act = window.TowerRunMap.getActForLayer ? window.TowerRunMap.getActForLayer(layerNum) : null;
                const actTag = act && act.name ? `<small class="ab-act-tag">${esc(act.name)}</small>` : '';
                html += `<div class="ab-layer-label"><span>${layerNum + 1}</span><small>层</small>${actTag}</div><div class="ab-layer-nodes">`;
                layers[L].forEach((n) => {
                    const label = window.TowerRunMap.nodeTypeLabel(n.type);
                    const reachable = !run.currentNodeId
                        ? n.id === run.map.startId
                        : (() => {
                            const cur = window.TowerRunMap.getNode(run.map, run.currentNodeId);
                            return cur && cur.cleared && cur.edges.indexOf(n.id) >= 0 && !n.cleared;
                        })();
                    const cls = ['ab-node', n.type, n.cleared ? 'cleared' : '', reachable ? 'reachable' : '', n.id === run.currentNodeId ? 'current' : ''].join(' ');
                    html += `<button type="button" class="${cls}" data-node="${n.id}" ${reachable && !n.cleared ? '' : 'disabled'}>
                        ${nodeIconHtml(n.type)}
                        <span class="ab-node-name">${esc(label)}</span>
                    </button>`;
                });
                html += `</div></div>`;
                if (idx < layerKeys.length - 1) {
                    html += shouldStagger
                        ? '<div class="ab-map-arrow ab-map-arrow-stagger" aria-hidden="true" style="--ab-layer-i:' + idx + '">›</div>'
                        : '<div class="ab-map-arrow" aria-hidden="true">›</div>';
                }
            });
            html += '</div></div>';
            el.innerHTML = html;
            const mapEl = el.querySelector('.ab-map-horizontal');
            if (layerAdvanced) {
                this._flashLayerBanner(
                    document.getElementById('ab-layer-banner-host'),
                    focusLayer + 1,
                    window.TowerRunMap.getActForLayer ? (window.TowerRunMap.getActForLayer(focusLayer) || {}).name : ''
                );
            }
            this._lastMapFocusLayer = focusLayer;
            requestAnimationFrame(() => this._scrollMapToLayer(mapEl, focusLayer));
            el.querySelectorAll('[data-node]').forEach((btn) => {
                btn.onclick = () => {
                    if (btn.disabled) return;
                    if (!this._reduceMotion) btn.classList.add('ab-node-pick-flash');
                    const nodeId = btn.getAttribute('data-node');
                    this.controller.selectNode(nodeId);
                    this.refresh();
                };
            });
        }

        showReward(onDone) {
            this._rewardDone = onDone;
            this._rewardOnDone = onDone;
            this._rewardClaimBusy = false;
            const el = document.getElementById('ab-reward-view');
            const loot = this.controller.run.pendingLoot;
            if (!el || !loot) { onDone && onDone(); return; }
            const run = this.controller.run;
            const phaseEl = document.getElementById('ab-phase-label');
            this._setPhaseLabel(phaseEl, 'reward');
            const stats = document.getElementById('ab-stats');
            if (stats && run) {
                stats.innerHTML = `
                    <span class="ab-chip-stat gold"><i></i>${run.gold}</span>
                    <span class="ab-chip-stat exp"><i></i>${run.runExpEarned}</span>
                    <span class="ab-chip-stat relic"><i></i>${run.relics.length}</span>`;
            }
            const bench = document.getElementById('ab-bench');
            if (bench) bench.style.display = 'none';

            const pendingCount = (loot.choices || []).length;
            const firstOpen = this._currentSceneViewId !== 'ab-reward-view'
                || (document.getElementById('ab-scene') || {}).style.display === 'none';
            let html = `<div class="ab-reward-scene${firstOpen ? ' ab-reward-scene-enter' : ''}">
                <div class="ab-reward-panel">
                    <header class="ab-reward-header">
                        <h2>战利品</h2>
                        ${pendingCount ? '' : '<p class="ab-reward-desc">奖励已领完</p>'}
                        <div class="ab-reward-loot-chips">
                            <span class="ab-chip-stat gold"><i></i>+${loot.gold}</span>
                            <span class="ab-chip-stat exp"><i></i>+${loot.exp}</span>
                        </div>
                    </header>
                    <div class="ab-reward-blocks">`;

            if (!loot.choices || !loot.choices.length) {
                html += `<p class="ab-reward-empty">没有掉落。</p>`;
            } else {
                loot.choices.forEach((ch, ci) => {
                    const isDirectLoot = ch.kind === 'skill_loot' || ch.kind === 'gear';
                    html += `<section class="ab-reward-block${isDirectLoot ? ' ab-reward-block-bare' : ''}" data-reward-ci="${ci}">`;
                    if (!isDirectLoot) {
                        const stepNum = ci + 1;
                        html += `<div class="ab-reward-block-head">
                            <span class="ab-reward-step">${stepNum}</span>
                            <div>
                                <h3>${esc(KIND_LABEL[ch.kind] || ch.kind)}</h3>
                            </div>
                        </div>`;
                    }

                    if (ch.kind === 'relic_pick') {
                        html += '<div class="ab-reward-pick-grid">';
                        (ch.options || []).forEach((opt, oi) => {
                            html += rewardPreviewRelicHtml(opt, {
                                attrs: `role="button" tabindex="0" class="ab-reward-tap" data-reward-claim="${ci}" data-reward-oi="${oi}" data-open="none"`
                            });
                        });
                        html += '</div>';
                    } else if (ch.kind === 'skill_pick') {
                        html += '<div class="ab-reward-pick-grid">';
                        (ch.options || []).forEach((opt, oi) => {
                            const id = opt.id || opt;
                            html += rewardPreviewSkillHtml(id, {
                                attrs: `role="button" tabindex="0" class="ab-reward-tap" data-reward-claim="${ci}" data-reward-oi="${oi}" data-open="skill"`
                            });
                        });
                        html += '</div>';
                    } else if (ch.kind === 'battle_pick') {
                        html += '<div class="ab-reward-pick-grid">';
                        (ch.options || []).forEach((opt, oi) => {
                            const open = opt.type === 'skill' ? 'skill' : (opt.type === 'gear' ? 'gear' : 'none');
                            html += rewardPreviewDraftOptHtml(opt,
                                `role="button" tabindex="0" class="ab-reward-tap" data-reward-claim="${ci}" data-reward-oi="${oi}" data-open="${open}"`);
                        });
                        html += '</div>';
                    } else if (ch.kind === 'skill_loot') {
                        html += rewardPreviewSkillHtml(ch.skill.id, {
                            attack: null,
                            attrs: `role="button" tabindex="0" class="ab-reward-tap" data-reward-claim="${ci}" data-open="skill"`
                        });
                    } else if (ch.kind === 'gear') {
                        html += rewardPreviewGearHtml(ch.gear, {
                            attrs: `role="button" tabindex="0" class="ab-reward-tap" data-reward-claim="${ci}" data-open="gear"`
                        });
                    }
                    html += '</section>';
                });
            }

            html += `</div>
                    <footer class="ab-reward-footer">
                        <button type="button" id="ab-reward-continue" class="ab-btn ab-btn-primary ab-btn-lg"
                            ${pendingCount ? 'disabled' : ''}>继续</button>
                    </footer>
                </div>
            </div>`;

            el.innerHTML = html;
            this._showSceneView('ab-reward-view', 'reward');
        }

        showShop() {
            const el = document.getElementById('ab-shop-view');
            if (!el) return;
            if (!this.shopStock) this.shopStock = this.controller.generateShopStock();
            const run = this.controller.run;
            const avgAtk = Math.floor(run.heroes.reduce((s, h) => s + previewHeroStats(run, h).attack, 0) / Math.max(1, run.heroes.length));
            let html = `<div class="ab-scene-hero">
                <h2>商店</h2>
                <p><strong class="ab-gold">${run.gold}</strong> G</p>
            </div><div class="ab-shop-list ab-shop-grid">`;
            this.shopStock.forEach((item, idx) => {
                let card = '';
                if (item.type === 'skill') {
                    card = skillCardHtml(item.id, {
                        attack: avgAtk,
                        extra: `<div class="ab-shop-buyrow"><span class="ab-shop-price">${item.price}<small>G</small></span>
                            <button type="button" class="ab-btn ab-btn-sm ab-btn-primary" data-shop="${idx}">购买</button></div>`
                    });
                } else if (item.type === 'gear') {
                    card = gearCardHtml(item.gear, {
                        extra: `<div class="ab-shop-buyrow"><span class="ab-shop-price">${item.price}<small>G</small></span>
                            <button type="button" class="ab-btn ab-btn-sm ab-btn-primary" data-shop="${idx}">购买</button></div>`
                    });
                } else if (item.type === 'relic') {
                    const def = window.RelicSystem.getRelicDef(item.id) || { id: item.id, name: item.name, description: '' };
                    card = relicCardHtml(def, {
                        extra: `<div class="ab-shop-buyrow"><span class="ab-shop-price">${item.price}<small>G</small></span>
                            <button type="button" class="ab-btn ab-btn-sm ab-btn-primary" data-shop="${idx}">购买</button></div>`
                    });
                }
                html += card;
            });
            html += `</div><div class="ab-actions">
                <button type="button" id="ab-shop-skills" class="ab-btn ab-btn-ghost">技能背包</button>
                <button type="button" id="ab-shop-gear" class="ab-btn ab-btn-gold">装备背包</button>
                <button type="button" id="ab-shop-leave" class="ab-btn ab-btn-primary ab-btn-lg">离开商铺</button>
            </div>`;
            el.innerHTML = html;
            this._showSceneView('ab-shop-view', 'shop');
            el.querySelectorAll('[data-shop]').forEach((btn) => {
                btn.onclick = () => {
                    const item = this.shopStock[+btn.dataset.shop];
                    if (this.controller.buyShopItem(item)) {
                        this.shopStock.splice(+btn.dataset.shop, 1);
                        if (item.type === 'skill' && item._justBought) {
                            const merge = item._mergeResult || {};
                            if (merge.starUp) {
                                this.openStarUpModal({
                                    skillId: item.id,
                                    stars: merge.stars,
                                    prevStars: merge.prevStars,
                                    heroId: merge.heroId,
                                    slotIndex: merge.slotIndex,
                                    inventoryIndex: merge.inventoryIndex
                                }, () => this.showShop());
                            } else {
                                this.openEquipFlow({ kind: 'skill', skillId: item.id }, () => this.showShop());
                            }
                        } else if (item.type === 'gear' && item._justBought) {
                            this.openEquipFlow({ kind: 'gear', gear: item.gear }, () => this.showShop());
                        } else {
                            this.showShop();
                        }
                    } else alert('金币不足');
                };
            });
            document.getElementById('ab-shop-skills').onclick = () => {
                this._loadoutTab = 'skills';
                this.openLoadoutSheet();
            };
            document.getElementById('ab-shop-gear').onclick = () => {
                this._loadoutTab = 'gear';
                this.openLoadoutSheet();
            };
            document.getElementById('ab-shop-leave').onclick = () => {
                this.shopStock = null;
                this._hideScene();
                this.controller.finishNonCombatNode();
            };
        }

        showEvent() {
            const el = document.getElementById('ab-event-view');
            if (!el) return;
            const run = this.controller.run;
            const ev = run && run.currentEvent;
            if (!ev) {
                el.innerHTML = `<div class="ab-event-scene tone-mystic">
                    <div class="ab-event-backdrop"></div>
                    <div class="ab-event-panel ab-event-panel-empty">
                        <div class="ab-event-header">
                            <div class="ab-event-emblem">${eventEmblemHtml()}</div>
                            <div class="ab-event-header-text">
                                <h2>空房间</h2>
                                <p class="ab-event-desc">这里空空如也。</p>
                            </div>
                        </div>
                        <div class="ab-actions ab-event-actions">
                            <button type="button" id="ab-event-leave" class="ab-btn ab-btn-primary ab-btn-lg">离开</button>
                        </div>
                    </div>
                </div>`;
                this._showSceneView('ab-event-view', 'event');
                document.getElementById('ab-event-leave').onclick = () => {
                    this.controller.finishNonCombatNode();
                };
                return;
            }

            const tone = EVENT_TONE[ev.id] || 'tone-mystic';
            let html = `<div class="ab-event-scene ${tone}">
                <div class="ab-event-backdrop"></div>
                <div class="ab-event-panel">
                    <div class="ab-event-header">
                        <div class="ab-event-emblem">${eventEmblemHtml()}</div>
                        <div class="ab-event-header-text">
                            <h2>${esc(ev.title)}</h2>
                            <p class="ab-event-desc">${esc(ev.desc)}</p>
                        </div>
                        <div class="ab-event-wallet">
                            <span class="ab-chip-stat gold"><i></i>${run.gold}</span>
                        </div>
                    </div>
                    <div class="ab-event-choices">`;

            (ev.choices || []).forEach((ch) => {
                const afford = window.AutoBattlerEvents
                    ? window.AutoBattlerEvents.canAffordChoice(run, ch)
                    : true;
                html += eventChoiceCardHtml(ch, afford);
            });

            html += `</div>
                    <div id="ab-event-result" class="ab-event-result" style="display:none;"></div>
                </div>
            </div>`;
            this._showSceneView('ab-event-view', 'event');
            el.innerHTML = html;
            el.querySelectorAll('[data-choice]').forEach((btn) => {
                btn.onclick = () => {
                    const choiceId = btn.getAttribute('data-choice');
                    const result = this.controller.resolveEvent(choiceId);
                    if (!result.ok) {
                        alert(result.message || '无法选择');
                        return;
                    }
                    this._showEventResult(el, result, () => {
                        this.controller.finishNonCombatNode();
                    });
                };
            });
        }

        _eventLootPreviewHtml(pendingEquip) {
            const pe = pendingEquip;
            if (!pe) return '';
            if (pe.kind === 'skill' && pe.skillId) {
                const label = pe.starUp ? '技能升星' : '获得技能';
                return `<div class="ab-event-loot">
                    <div class="ab-event-loot-label">${label}</div>
                    ${rewardPreviewSkillHtml(pe.skillId)}
                </div>`;
            }
            if (pe.kind === 'gear' && pe.gear) {
                return `<div class="ab-event-loot">
                    <div class="ab-event-loot-label">获得装备</div>
                    ${rewardPreviewGearHtml(pe.gear)}
                </div>`;
            }
            return '';
        }

        _claimEventPendingEquip(pendingEquip, onDone) {
            const pe = pendingEquip;
            if (!pe) {
                if (onDone) onDone();
                return;
            }
            if (pe.kind === 'skill' && pe.starUp) {
                this.openStarUpModal({
                    skillId: pe.skillId,
                    stars: pe.stars,
                    prevStars: pe.prevStars,
                    heroId: pe.heroId,
                    slotIndex: pe.slotIndex,
                    inventoryIndex: pe.inventoryIndex
                }, onDone);
                return;
            }
            this.openEquipFlow(pe, onDone);
        }

        _showEventResult(el, result, onDone) {
            const panel = el.querySelector('.ab-event-panel');
            const choices = el.querySelector('.ab-event-choices');
            const headerDesc = el.querySelector('.ab-event-desc');
            if (choices) choices.style.display = 'none';
            const pe = result && result.pendingEquip;
            const hasLoot = !!(pe && ((pe.kind === 'skill' && pe.skillId) || (pe.kind === 'gear' && pe.gear)));
            if (headerDesc) headerDesc.textContent = hasLoot ? '获得奖励' : '选择完成';
            if (panel) panel.classList.add('resolved');
            const box = document.getElementById('ab-event-result');
            if (!box) { onDone && onDone(); return; }

            // 技能/装备已用卡片展示，文案里去掉重复的「获得技能/装备」行
            const lines = (result.messages || []).filter((l) => {
                if (!l) return false;
                if (!hasLoot) return true;
                return !/^获得技能/.test(l) && !/^获得装备/.test(l) && !/^技能升星/.test(l);
            });
            const lootHtml = this._eventLootPreviewHtml(pe);
            const btnLabel = hasLoot ? '领取' : '继续';

            box.style.display = 'block';
            box.innerHTML = `
                <div class="ab-event-result-card">
                    <h3>${esc(result.eventTitle || '结果')}</h3>
                    ${lines.length
                        ? `<ul class="ab-event-result-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
                        : (hasLoot ? '' : '<p class="ab-muted">没有变化</p>')}
                    ${lootHtml}
                    <button type="button" id="ab-event-continue" class="ab-btn ab-btn-primary ab-btn-lg">${btnLabel}</button>
                </div>`;
            document.getElementById('ab-event-continue').onclick = () => {
                if (hasLoot) {
                    this._claimEventPendingEquip(pe, onDone);
                } else if (onDone) {
                    onDone();
                }
            };
        }

        showRest() {
            const el = document.getElementById('ab-rest-view');
            if (!el) return;
            const run = this.controller.run;
            const leave = () => {
                this._hideScene();
                this.controller.finishNonCombatNode();
            };
            if (run && run.restResolved) {
                el.innerHTML = `<div class="ab-rest-card ab-rest-scene">
                    <h3>营地</h3>
                    <p>休整已完成</p>
                    <button type="button" id="ab-rest-ok" class="ab-btn ab-btn-primary ab-btn-lg">离开</button>
                </div>`;
                this._showSceneView('ab-rest-view', 'rest');
                document.getElementById('ab-rest-ok').onclick = leave;
                return;
            }
            const cfgRewards = ((typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) || {}).rewards || {};
            const healPct = Math.round((cfgRewards.restHealPct != null ? cfgRewards.restHealPct : 0.4) * 100);
            const heroBtns = (run.heroes || []).map((h) => {
                const lv = h.runLevel || 0;
                return `<button type="button" class="ab-btn ab-btn-sm ab-rest-level" data-hero="${esc(h.heroId)}">${esc(h.displayName)} <small>局内+${lv}</small></button>`;
            }).join('');
            el.innerHTML = `<div class="ab-rest-card ab-rest-scene">
                <h3>营地</h3>
                <p>选择一项休整效果</p>
                <div class="ab-rest-choices">
                    <button type="button" class="ab-btn ab-btn-primary" data-rest="heal">回血 ${healPct}%</button>
                    <button type="button" class="ab-btn ab-btn-gold" data-rest="star">随机已装技能升星</button>
                </div>
                <div class="ab-rest-level-row">
                    <span>或局内升级一人：</span>
                    <div class="ab-rest-level-btns">${heroBtns}</div>
                </div>
                <p class="ab-rest-msg" id="ab-rest-msg"></p>
            </div>`;
            this._showSceneView('ab-rest-view', 'rest');
            const msg = document.getElementById('ab-rest-msg');
            el.querySelectorAll('[data-rest]').forEach((btn) => {
                btn.onclick = () => {
                    const res = this.controller.resolveRestChoice(btn.getAttribute('data-rest'));
                    if (!res.ok) { if (msg) msg.textContent = res.message || '失败'; return; }
                    if (msg) msg.textContent = res.message || '完成';
                    setTimeout(leave, 650);
                };
            });
            el.querySelectorAll('[data-hero]').forEach((btn) => {
                btn.onclick = () => {
                    const res = this.controller.resolveRestChoice('level', btn.getAttribute('data-hero'));
                    if (!res.ok) { if (msg) msg.textContent = res.message || '失败'; return; }
                    if (msg) msg.textContent = res.message || '完成';
                    setTimeout(leave, 650);
                };
            });
        }


        showRunSummary(summary) {
            this.show();
            this._postRunSummaryActive = true;
            const el = document.getElementById('ab-summary-view');
            if (!el) return;
            el.innerHTML = `<div class="ab-summary ${summary.victory ? 'win' : 'lose'}">
                <h3>${summary.victory ? '通关成功' : '挑战失败'}</h3>
                <div class="ab-summary-stats">
                    <div><span>本局经验</span><strong>+${summary.expEarned}</strong></div>
                    <div><span>经验银行</span><strong>${summary.expBank}</strong></div>
                    <div><span>推进节点</span><strong>${summary.layersCleared}</strong></div>
                </div>
                <div class="ab-actions">
                    <button type="button" id="ab-summary-meta" class="ab-btn ab-btn-gold">分配经验</button>
                    <button type="button" id="ab-summary-town" class="ab-btn ab-btn-primary">返回主城</button>
                </div>
            </div>`;
            this._showSceneView('ab-summary-view', 'summary');
            document.getElementById('ab-summary-town').onclick = () => {
                this.controller.returnToTown();
                if (this.game.saveGameToBrowserStorage) this.game.saveGameToBrowserStorage();
            };
            document.getElementById('ab-summary-meta').onclick = () => this.showMeta();
        }

        renderLoadout() {
            const el = document.getElementById('ab-loadout-view');
            const run = this.controller.run;
            const RSS = window.RunStateSystem;
            if (!el || !run) return;
            const equipMode = !!this._equipMode;
            const eligible = this._eligibleHeroIds;
            const heroPool = eligible && eligible.length
                ? run.heroes.filter((h) => eligible.indexOf(h.heroId) >= 0)
                : run.heroes;
            const skillBagCount = run.inventorySkills.length;
            const gearBagCount = run.inventoryGear.length;
            const relicCount = run.relics.length;

            if (!this._inspectHeroId || !RSS.findHero(run, this._inspectHeroId)) {
                this._inspectHeroId = heroPool[0] ? heroPool[0].heroId : run.heroes[0].heroId;
            }
            if (eligible && eligible.indexOf(this._inspectHeroId) < 0) {
                this._inspectHeroId = eligible[0];
            }
            const hero = RSS.findHero(run, this._inspectHeroId);
            const stats = previewHeroStats(run, hero);
            const bag = this._bagPick;
            const pendingName = bag
                ? (bag.kind === 'skill' ? skillName(bag.id) : bag.name)
                : '';
            if (equipMode && bag) {
                this._loadoutTab = bag.kind === 'skill' ? 'skills' : 'gear';
            }
            const tab = this._loadoutTab || 'skills';

            if (equipMode && bag) {
                el.innerHTML = this._renderCompactEquip(run, RSS, heroPool, hero, bag, pendingName);
                return;
            }

            let html = `<div class="ab-section-head">
                    <h3>构筑</h3>
                </div>`;

            html += '<div class="ab-hero-tabs">';
            heroPool.forEach((h) => {
                const st = previewHeroStats(run, h);
                html += `<button type="button" class="ab-hero-tab ${CLASS_TONE[h.baseClass] || ''} ${h.heroId === hero.heroId ? 'active' : ''}" data-inspect="${h.heroId}">
                    <span class="ab-tab-avatar"${classIconStyle(h.baseClass)}></span>
                    <strong>${esc(h.displayName)}</strong>
                    <span>Lv.${h.level} · 攻${st.attack}</span>
                </button>`;
            });
            html += '</div>';

            html += `<div class="ab-hero-inspect ab-hero-inspect-compact ${CLASS_TONE[hero.baseClass] || ''}">
                <div class="ab-inspect-head">
                    <div class="ab-inspect-title-row">
                        <span class="ab-avatar ab-inspect-avatar"${classIconStyle(hero.baseClass)}></span>
                        <div>
                            <h4>${esc(hero.displayName)} <span class="ab-lv">Lv.${hero.level}</span></h4>
                            <p class="ab-muted">攻 ${stats.attack} · 防 ${stats.defense} · 血 ${stats.maxHp}</p>
                        </div>
                    </div>
                </div>
            </div>`;

            html += `<nav class="ab-loadout-tabs" role="tablist">`;
            html += `<button type="button" class="ab-loadout-tab ${tab === 'skills' ? 'active' : ''}" data-loadout-tab="skills" role="tab">
                    技能<span class="ab-tab-badge">${skillBagCount}</span>
                </button>
                <button type="button" class="ab-loadout-tab ${tab === 'gear' ? 'active' : ''}" data-loadout-tab="gear" role="tab">
                    装备<span class="ab-tab-badge">${gearBagCount}</span>
                </button>
                <button type="button" class="ab-loadout-tab ${tab === 'relics' ? 'active' : ''}" data-loadout-tab="relics" role="tab">
                    遗物<span class="ab-tab-badge">${relicCount}</span>
                </button>`;
            html += '</nav>';

            // —— 技能面板 ——
            html += `<div class="ab-loadout-panel ${tab === 'skills' ? 'active' : ''}" data-loadout-panel="skills">`;
            html += '<div class="ab-panel-section"><div class="ab-panel-section-title">技能槽</div>';
            html += '<div class="ab-skill-hotbar">';
            for (let i = 0; i < 4; i++) {
                const entry = hero.skillSlots[i];
                const sid = RSS.skillEntryId(entry);
                const stars = entry && entry.stars ? entry.stars : 1;
                if (sid) {
                    const starLine = `<div class="ab-skill-stars">${esc(RSS.formatStarLabel(stars))}</div>`;
                    const canReplace = bag && bag.kind === 'skill' && RSS.canHeroUseSkill(hero, bag.id);
                    if (canReplace) {
                        html += `<button type="button" class="ab-slot-panel filled ab-skill-slot droppable ab-slot-compact" data-fill-skill="${i}">
                            <div class="ab-slot-panel-head"><span>${i + 1}</span><span class="ab-slot-replace-hint">替换</span></div>
                            <div class="ab-slot-gear-row">
                                <span class="ab-slot-gear-icon" style="${skillIconStyle(sid)}"></span>
                                <div>
                                    <strong>${esc(skillName(sid))}</strong>
                                    ${starLine}
                                </div>
                            </div>
                        </button>`;
                    } else {
                        html += `<div class="ab-slot-panel filled ab-skill-slot ab-slot-compact">
                            <div class="ab-slot-panel-head"><span>${i + 1}</span>
                                <button type="button" class="ab-btn ab-btn-xs" data-uneq-skill="${i}">卸下</button></div>
                            <div class="ab-slot-gear-row">
                                <span class="ab-slot-gear-icon" style="${skillIconStyle(sid)}"></span>
                                <div>
                                    <strong>${esc(skillName(sid))}</strong>
                                    ${starLine}
                                </div>
                            </div>
                        </div>`;
                    }
                } else {
                    const canDrop = bag && bag.kind === 'skill' && RSS.canHeroUseSkill(hero, bag.id);
                    html += `<button type="button" class="ab-slot-panel empty ab-skill-slot ab-slot-compact ${canDrop ? 'droppable' : ''}" data-fill-skill="${i}" ${canDrop ? '' : 'disabled'}>
                        <span>槽 ${i + 1}</span>
                        <small>${canDrop ? '装上' : '空'}</small>
                    </button>`;
                }
            }
            html += '</div></div>';

            html += '<div class="ab-panel-section"><div class="ab-panel-section-title">技能背包</div>';
            if (bag && bag.kind === 'skill') {
                html += `<div class="ab-bag-selected">已选：<strong>${esc(skillName(bag.id))}</strong>
                    <button type="button" class="ab-btn ab-btn-sm" id="ab-bag-clear">取消</button></div>`;
            }
            html += '<div class="ab-inspect-grid">';
            if (!run.inventorySkills.length) {
                html += '<span class="ab-muted">背包里没有技能</span>';
            }
            run.inventorySkills.forEach((entry) => {
                const sid = RSS.skillEntryId(entry);
                const stars = entry && entry.stars ? entry.stars : 1;
                const canUse = RSS.canHeroUseSkill(hero, sid);
                const sel = bag && bag.kind === 'skill' && bag.id === sid;
                html += skillCardHtml(sid, {
                    stars: stars,
                    attack: stats.attack * stats.skillMult,
                    selected: sel,
                    compact: true,
                    attrs: (canUse ? `role="button" tabindex="0" data-bag-skill="${esc(sid)}"`
                        : 'class="ab-muted-card"')
                });
            });
            html += '</div></div>';
            html += '</div>';

            // —— 装备面板 ——
            html += `<div class="ab-loadout-panel ${tab === 'gear' ? 'active' : ''}" data-loadout-panel="gear">`;
            html += '<div class="ab-panel-section"><div class="ab-panel-section-title">已穿戴</div>';
            html += gearDollHtml(hero, { RSS: RSS, bag: bag, compact: true, showUnequip: true });
            html += '</div>';

            html += '<div class="ab-panel-section"><div class="ab-panel-section-title">装备背包</div>';
            if (bag && bag.kind === 'gear') {
                html += `<div class="ab-bag-selected">已选：<strong>${esc(bag.name)}</strong>
                    <button type="button" class="ab-btn ab-btn-sm" id="ab-bag-clear-gear">取消</button></div>`;
            }
            html += '<div class="ab-inspect-grid">';
            if (!run.inventoryGear.length) {
                html += '<span class="ab-muted">背包里没有装备</span>';
            }
            run.inventoryGear.forEach((g) => {
                const canWear = RSS.canHeroWearGear(hero, g);
                const sel = bag && bag.kind === 'gear' && bag.uid === g.uid;
                html += gearCardHtml(g, {
                    selected: sel,
                    compact: true,
                    attrs: (canWear ? `role="button" tabindex="0" data-bag-gear="${esc(g.uid)}"`
                        : 'class="ab-muted-card"')
                });
            });
            html += '</div></div>';
            html += '</div>';

            // —— 遗物面板 ——
            html += `<div class="ab-loadout-panel ${tab === 'relics' ? 'active' : ''}" data-loadout-panel="relics">`;
            html += '<div class="ab-panel-section"><div class="ab-panel-section-title">队伍遗物</div>';
            html += '<div class="ab-inspect-grid">';
            if (!run.relics.length) {
                html += '<span class="ab-muted">还没有遗物</span>';
            } else {
                run.relics.forEach((id) => { html += relicCardHtml(id, { compact: true }); });
            }
            html += '</div></div></div>';

            html += `<div class="ab-actions">
                <button type="button" id="ab-loadout-done" class="ab-btn ab-btn-primary">关闭</button>
            </div>`;
            el.innerHTML = html;
        }

        /** 战利品/商店领取后的精简装配：只保留选人 + 点槽 */
        _renderCompactEquip(run, RSS, heroPool, hero, bag, pendingName) {
            let html = `<div class="ab-equip-banner ab-equip-banner-compact">
                <h3>${esc(pendingName)}</h3>
            </div>`;

            html += '<div class="ab-hero-tabs ab-hero-tabs-compact">';
            heroPool.forEach((h) => {
                html += `<button type="button" class="ab-hero-tab ${CLASS_TONE[h.baseClass] || ''} ${h.heroId === hero.heroId ? 'active' : ''}" data-inspect="${h.heroId}">
                    <span class="ab-tab-avatar"${classIconStyle(h.baseClass)}></span>
                    <strong>${esc(h.displayName)}</strong>
                </button>`;
            });
            html += '</div>';

            if (bag.kind === 'skill') {
                html += '<div class="ab-panel-section"><div class="ab-panel-section-title">技能</div>';
                html += '<div class="ab-skill-hotbar ab-skill-hotbar-compact">';
                for (let i = 0; i < 4; i++) {
                    const entry = hero.skillSlots[i];
                    const sid = RSS.skillEntryId(entry);
                    const stars = entry && entry.stars ? entry.stars : 1;
                    const canUse = RSS.canHeroUseSkill(hero, bag.id);
                    if (sid) {
                        html += `<button type="button" class="ab-slot-panel filled ab-skill-slot droppable ab-slot-compact" data-fill-skill="${i}" ${canUse ? '' : 'disabled'}>
                            <div class="ab-slot-panel-head"><span>${i + 1}</span><span class="ab-slot-replace-hint">替换</span></div>
                            <div class="ab-slot-gear-row">
                                <span class="ab-slot-gear-icon" style="${skillIconStyle(sid)}"></span>
                                <div>
                                    <strong>${esc(skillName(sid))}</strong>
                                    <div class="ab-skill-stars">${esc(RSS.formatStarLabel(stars))}</div>
                                </div>
                            </div>
                        </button>`;
                    } else {
                        html += `<button type="button" class="ab-slot-panel empty ab-skill-slot ab-slot-compact ${canUse ? 'droppable' : ''}" data-fill-skill="${i}" ${canUse ? '' : 'disabled'}>
                            <span>槽 ${i + 1}</span>
                            <small>${canUse ? '装上' : '不可用'}</small>
                        </button>`;
                    }
                }
                html += '</div></div>';
            } else {
                html += '<div class="ab-panel-section"><div class="ab-panel-section-title">装备</div>';
                html += gearDollHtml(hero, { RSS: RSS, bag: bag, compact: true, showUnequip: false });
                html += '</div>';
            }

            html += `<div class="ab-actions">
                <button type="button" id="ab-loadout-done" class="ab-btn ab-btn-primary">稍后</button>
            </div>`;
            return html;
        }
    }

    window.AutoBattlerUI = AutoBattlerUI;
})();
