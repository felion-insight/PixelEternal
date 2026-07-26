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
        weapon: '武器', armor: '护甲',
        head: '头', chest: '胸', hands: '手', feet: '鞋'
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

    /** 精简构筑：武器 + 护甲 两格装备栏 */
    function gearDollHtml(hero, opts) {
        opts = opts || {};
        const RSS = opts.RSS || window.RunStateSystem;
        const slots = (RSS && RSS.EQUIP_SLOTS) || ['weapon', 'armor'];
        const SAP = window.StaticArtPaths;
        let spriteStyle = '';
        if (SAP && hero && hero.baseClass) {
            const url = SAP.resolveDisplayIconUrl(SAP.getAutoBattlerHeroUrl(hero.baseClass));
            if (url) spriteStyle = ` style="background-image:url(&quot;${url}&quot;)"`;
        }
        let html = '<div class="ab-gear-doll ab-gear-doll-simple">';
        html += `<div class="ab-gear-doll-center">
            <span class="ab-gear-doll-sprite"${spriteStyle}></span>
            <strong class="ab-gear-doll-name">${esc(hero.displayName || '')}</strong>
        </div>`;
        slots.forEach((slot) => { html += gearDollSlotHtml(hero, slot, opts); });
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

    function skillEntryDisplayName(entry) {
        if (!entry) return '';
        const SMS = window.SkillMutationSystem;
        const combatId = SMS && SMS.resolveCombatSkillId
            ? SMS.resolveCombatSkillId(entry)
            : (entry.evolvedId || entry.id);
        return skillName(combatId || entry.id);
    }

    function skillBranchModsHtml(entry, compact) {
        const SMS = window.SkillMutationSystem;
        if (!SMS || !entry) return '';
        const groups = SMS.describeEntryBranches(entry) || [];
        if (!groups.length && !entry.evolvedId) return '';
        const formatBranch = SMS.formatBranchTagName
            ? (n) => SMS.formatBranchTagName(n)
            : (n) => String(n || '').replace(/支$/, '');
        // 同一派系合并展示：派系框 + 分支框（可多个分支）
        const byLineage = Object.create(null);
        groups.forEach((g) => {
            const key = g.lineageName || '派系';
            if (!byLineage[key]) byLineage[key] = { lineageName: key, branches: [], effects: [] };
            const btag = formatBranch(g.branchName);
            if (btag && byLineage[key].branches.indexOf(btag) < 0) {
                byLineage[key].branches.push(btag);
            }
            (g.effects || []).forEach((e) => byLineage[key].effects.push(e));
        });
        const chips = Object.keys(byLineage).map((key) => {
            const g = byLineage[key];
            const tip = (g.effects && g.effects.length)
                ? g.effects.join('\n')
                : (g.lineageName + (g.branches.length ? ' · ' + g.branches.join('、') : ''));
            const branchBoxes = g.branches.map((b) =>
                `<span class="ab-offer-tag ab-offer-tag-branch">${esc(b)}</span>`
            ).join('');
            return `<div class="ab-offer-tag-row ab-slot-tag-row" title="${esc(tip)}">
                <span class="ab-offer-tag ab-offer-tag-lineage">${esc(g.lineageName)}</span>
                ${branchBoxes}
            </div>`;
        }).join('');
        let evoTip = '';
        if (entry.evolvedId && SMS.describeEvolve) {
            evoTip = SMS.describeEvolve(entry.evolvedId, entry.id);
        }
        const evo = entry.evolvedId
            ? `<span class="ab-offer-tag ab-offer-tag-evo" title="${esc(evoTip)}">质变·${esc(skillName(entry.evolvedId))}</span>`
            : '';
        if (compact) {
            return `<div class="ab-branch-row ab-branch-row-compact">${chips}${evo ? `<div class="ab-offer-tag-row ab-slot-tag-row">${evo}</div>` : ''}</div>`;
        }
        const detail = groups.map((g) => {
            if (!g.effects || !g.effects.length) return '';
            const btag = formatBranch(g.branchName);
            return `<p class="ab-branch-effect-line"><strong>${esc(btag)}</strong> ${esc(g.effects.join('；'))}</p>`;
        }).join('');
        return `<div class="ab-branch-row">${chips}${evo ? `<div class="ab-offer-tag-row">${evo}</div>` : ''}</div>${detail}`;
    }

    function lineageProgressHtml(run) {
        const SMS = window.SkillMutationSystem;
        if (!SMS || !run) return '';
        const list = SMS.lineageProgressList(run) || [];
        const sparks = SMS.activeDuoSparks(run) || [];
        if (!list.length && !sparks.length) return '';
        let html = '<div class="ab-lineage-progress"><div class="ab-panel-section-title">派系进度</div><div class="ab-lineage-chips">';
        list.slice(0, 8).forEach((l) => {
            html += `<span class="ab-lineage-chip"><strong>${esc(l.name)}</strong><em>${l.count}</em></span>`;
        });
        html += '</div>';
        if (sparks.length) {
            html += '<div class="ab-spark-row">';
            sparks.forEach((sp) => {
                html += `<span class="ab-spark-chip" title="${esc(sp.desc || '')}">✦ ${esc(sp.name)}</span>`;
            });
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function rewardPreviewUpgradeHtml(opt, opts) {
        opts = opts || {};
        const rarity = opt.rarity || 'common';
        const isEvolve = opt.type === 'skill_evolve';
        const tag = isEvolve ? '质变' : '强化';
        const sid = opt.skillId;
        const SMS = window.SkillMutationSystem;
        let effect = opt.effectText || opt.description || '';
        if (!effect && !isEvolve && SMS && opt.upgradeId) {
            const hit = SMS.lookupUpgrade(opt.upgradeId);
            if (hit && hit.upgrade) effect = SMS.describeUpgrade(hit.upgrade);
        }
        if (!effect && isEvolve && SMS && opt.intoId) {
            effect = SMS.describeEvolve(opt.intoId, opt.skillId);
        }
        const skillLabel = skillName(sid);
        const title = opt.title || ('【' + skillLabel + '】' + tag);
        const lineageTag = opt.lineageName || '';
        const branchTag = opt.branchTag
            || (SMS && SMS.formatBranchTagName ? SMS.formatBranchTagName(opt.branchName) : (opt.branchName || ''));
        const tagBoxes = (lineageTag || branchTag)
            ? `<div class="ab-offer-tag-row">
                ${lineageTag ? `<span class="ab-offer-tag ab-offer-tag-lineage">${esc(lineageTag)}</span>` : ''}
                ${branchTag ? `<span class="ab-offer-tag ab-offer-tag-branch">${esc(branchTag)}</span>` : ''}
               </div>`
            : '';
        const upgradeLabel = (!isEvolve && opt.upgradeName)
            ? `<span class="ab-reward-preview-meta ab-offer-upgrade-name">${esc(opt.upgradeName)}</span>`
            : (isEvolve && opt.intoName
                ? `<span class="ab-reward-preview-meta ab-offer-upgrade-name">→ ${esc(opt.intoName)}</span>`
                : '');
        return `<div class="ab-reward-preview skill-upgrade rarity-${esc(rarity)} ${opts.selected ? 'selected' : ''}" ${opts.attrs || ''}>
            <div class="ab-reward-preview-icon" style="${skillIconStyle(sid)}"></div>
            <div class="ab-reward-preview-body">
                <span class="ab-reward-preview-tag">${tag}</span>
                <strong class="ab-reward-preview-name">${esc(title)}</strong>
                ${tagBoxes}
                ${upgradeLabel}
                <p class="ab-reward-preview-desc ab-upgrade-effect">${esc(effect || '强化该技能')}</p>
            </div>
        </div>`;
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
        if (gear.traitLines && gear.traitLines.length) {
            gear.traitLines.forEach((line) => lines.push(line));
        } else if (gear.desc) {
            lines.push(gear.desc);
        } else if (gear.passive) {
            lines.push('被动：' + gear.passive + (gear.passivePct ? ' ' + Math.round(gear.passivePct * 100) + '%' : ''));
        }
        if (gear.basicCleave) lines.push('普攻：顺劈');
        if (gear.basicPierce) lines.push('普攻：穿透');
        if (gear.basicChain) lines.push('普攻：弹射×' + gear.basicChain);
        if (gear.basicMultihit) lines.push('普攻：连击×' + gear.basicMultihit);
        if (gear.affixLines && gear.affixLines.length) {
            gear.affixLines.forEach((line) => lines.push(line));
        } else if (!gear.traitLines) {
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
        const entry = opts.entry || null;
        const baseId = entry
            ? entry.id
            : ((typeof defOrId === 'string' ? defOrId : (defOrId && defOrId.id)) || defOrId);
        const displayId = entry
            ? ((window.SkillMutationSystem && window.SkillMutationSystem.resolveCombatSkillId(entry)) || baseId)
            : baseId;
        const d = skillDef(displayId) || skillDef(baseId) ||
            (typeof defOrId === 'object' ? defOrId : null);
        const id = displayId || baseId;
        const name = skillName(id);
        const iconStyle = skillIconStyle(baseId || id);
        const stars = opts.stars != null ? opts.stars : (entry && entry.stars) || (d && d.stars);
        const starLine = stars ? `<div class="ab-skill-stars">${esc(window.RunStateSystem.formatStarLabel(stars))}</div>` : '';
        const branchLine = entry ? skillBranchModsHtml(entry, !!opts.compact) : '';
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
            ${branchLine}
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
        if (opt.type === 'skill_upgrade' || opt.type === 'skill_evolve') {
            return rewardPreviewUpgradeHtml(opt, {
                attrs: attrs + ' data-open="none"'
            });
        }
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

    function partyHudSummary(run) {
        let hp = 0;
        let max = 0;
        let alive = 0;
        const heroes = (run && run.heroes) || [];
        heroes.forEach((h) => {
            const mh = Math.max(0, h.maxHp || 0);
            const cur = Math.max(0, h.hp || 0);
            max += mh;
            hp += cur;
            if (cur > 0) alive += 1;
        });
        const pct = max > 0 ? Math.round((hp / max) * 100) : 0;
        return { alive: alive, total: heroes.length, pct: pct, hp: hp, max: max };
    }

    function hudRelicIconsHtml(relicIds) {
        const ids = relicIds || [];
        if (!ids.length) {
            return '<span class="ab-hud-relics-empty">暂无</span>';
        }
        return ids.map((id) => {
            const def = window.RelicSystem && window.RelicSystem.getRelicDef
                ? window.RelicSystem.getRelicDef(id)
                : null;
            const name = (def && def.name) || id;
            const desc = (def && def.description) || '';
            const tip = desc ? (name + ' — ' + desc) : name;
            const style = relicIconStyle(def || id);
            if (style) {
                return `<span class="ab-hud-relic" style="${style}" title="${esc(tip)}"></span>`;
            }
            return `<span class="ab-hud-relic ab-hud-relic-fallback" title="${esc(tip)}">${esc((name && name[0]) || '?')}</span>`;
        }).join('');
    }

    function hudStatsHtml(run) {
        if (!run) return '';
        const party = partyHudSummary(run);
        const pending = run.pendingLevelPoints || 0;
        const gold = run.gold || 0;
        const relics = run.relics || [];
        const corruption = run.ascension ? (run.ascension.corruption || 0) : 0;
        const zone = window.ZoneEcology && window.ZoneEcology.getZoneDisplay
            ? window.ZoneEcology.getZoneDisplay(run) : null;
        const synHtml = window.SynergyMatrix && window.SynergyMatrix.getActiveDisplay
            ? window.SynergyMatrix.getActiveDisplay(run).map((s) =>
                `<span class="ab-syn-chip" title="${esc(s.description || s.name)}" style="border-color:${s.color || '#888'}">${esc(s.name)}</span>`
            ).join('') : '';
        const weather = window.WeatherSystem && window.WeatherSystem.getDisplay
            ? window.WeatherSystem.getDisplay(run) : null;
        const bonds = window.BondSystem && window.BondSystem.computeActiveBonds
            ? window.BondSystem.computeActiveBonds(run) : [];
        const bondHtml = bonds.length ? bonds.map((b) =>
            `<span class="ab-syn-chip ab-bond-chip" title="站位羁绊">${esc(b.name)}</span>`
        ).join('') : '';
        const mutNode = run.map && run.currentNodeId && window.TowerRunMap
            ? window.TowerRunMap.getNode(run.map, run.currentNodeId) : null;
        const mutLabel = mutNode && (mutNode.mutationName || mutNode.mutationType) || null;
        const mutTip = mutNode && (mutNode.mutationDesc || mutNode.mutationName || mutNode.mutationType) || '';
        const chains = run.ascension && run.ascension.activeChains || [];
        const chainHtml = chains.length && window.EventChainSystem
            ? chains.map((c) => {
                const def = (window.EventChainSystem.chainCfg().chains || {})[c.chainId];
                const name = def && def.name || c.chainId;
                return `<span class="ab-syn-chip ab-chain-chip" title="事件链 · 进度 ${(c.progress || 0) + 1}">${esc(name)}</span>`;
            }).join('')
            : '';
        return `
            <div class="ab-stat-block gold">
                <span class="ab-stat-label">金币</span>
                <strong class="ab-stat-value">${gold}</strong>
            </div>
            <div class="ab-stat-block exp" title="战斗积累，在休息处分配给角色">
                <span class="ab-stat-label">等级</span>
                <strong class="ab-stat-value">${pending}</strong>
            </div>
            <div class="ab-stat-block party" title="存活 ${party.alive}/${party.total} · 生命 ${party.pct}%">
                <span class="ab-stat-label">队伍</span>
                <strong class="ab-stat-value">${party.alive}/${party.total}</strong>
                <span class="ab-stat-sub">${party.pct}%</span>
            </div>
            <div class="ab-stat-block corruption" title="腐化值：阈值触发全局负面">
                <span class="ab-stat-label">腐化</span>
                <strong class="ab-stat-value">${corruption}</strong>
                <span class="ab-stat-sub ab-corruption-bar"><span style="width:${Math.min(100, corruption)}%"></span></span>
            </div>
            ${zone ? `<div class="ab-stat-block zone" title="${esc(zone.trait && zone.trait.description || '')}">
                <span class="ab-stat-label">${esc(zone.name)}</span>
            </div>` : ''}
            ${weather ? `<div class="ab-stat-block weather" title="剩余${weather.battlesLeft}场">
                <span class="ab-stat-label">天气</span>
                <strong class="ab-stat-value ab-stat-sm">${esc(weather.name)}</strong>
            </div>` : ''}
            ${mutLabel ? `<div class="ab-stat-block mutation" title="${esc(mutTip)}">
                <span class="ab-stat-label">变异</span>
                <strong class="ab-stat-value ab-stat-sm">${esc(mutLabel)}</strong>
            </div>` : ''}
            ${chainHtml ? `<div class="ab-stat-block chains" title="进行中的事件链">
                <span class="ab-stat-label">事件链</span>
                <div class="ab-hud-synergies">${chainHtml}</div>
            </div>` : ''}
            <div class="ab-stat-block relics">
                <span class="ab-stat-label">遗物${relics.length ? ' · ' + relics.length : ''}</span>
                <div class="ab-hud-relics">${hudRelicIconsHtml(relics)}</div>
                ${synHtml || bondHtml ? `<div class="ab-hud-synergies">${synHtml}${bondHtml}</div>` : ''}
            </div>`;
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
                        <div id="ab-commander-bar" class="ab-commander-bar" style="display:none;">
                            <div class="ab-te-wrap">
                                <span class="ab-te-label">战术能量</span>
                                <div class="ab-te-track"><div id="ab-te-fill" class="ab-te-fill"></div></div>
                                <span id="ab-te-text" class="ab-te-text">0/100</span>
                            </div>
                            <div id="ab-commander-abilities" class="ab-commander-abilities"></div>
                            <div class="ab-battle-speed">
                                <button type="button" class="ab-btn ab-btn-ghost ab-speed-btn" data-speed="1">×1</button>
                                <button type="button" class="ab-btn ab-btn-ghost ab-speed-btn" data-speed="2">×2</button>
                                <button type="button" class="ab-btn ab-btn-ghost ab-speed-btn" data-speed="3">×3</button>
                            </div>
                        </div>
                    </div>

                    <div id="ab-intel-panel" class="ab-intel-panel" style="display:none;"></div>

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
                                    <div class="ab-brand-title">攀塔档案</div>
                                    <div class="ab-brand-sub">等级在塔内休息处分配 · 从零开荒</div>
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
                if (confirm('放弃本局？构筑与局内等级会清空（等级不带出塔外）。')) {
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
                const run = this.controller.run;
                const battle = this.controller.battle;
                if (run && run.phase === 'combat' && battle && battle.mutationReverse) {
                    if (this.controller.handleReverseCombatClick(x, y)) return;
                }
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
            this.renderCommanderBar(battle);
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
                    return t === 'gold' || t === 'heal' ||
                        t === 'skill_upgrade' || t === 'skill_evolve';
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
            } else if (result && (result.kind === 'skill_upgrade' || result.kind === 'skill_evolve')) {
                const bits = [result.title || (result.kind === 'skill_evolve' ? '技能质变' : '技能强化')];
                if (result.lineageName) bits.push(result.lineageName);
                if (result.branchTag) bits.push(result.branchTag);
                this.showToast(bits.join(' · '));
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
            const synEl = document.getElementById('ab-encounter-synergy');
            const run = this.controller && this.controller.run;
            const battle = this.controller && this.controller.battle;
            const synId = battle && battle.encounterSynergy;
            const inCombat = run && (run.phase === 'deploy' || run.phase === 'combat');
            if (synEl) {
                if (synId && inCombat) {
                    const cfg = (typeof CONFIG !== 'undefined' && CONFIG.ENCOUNTERS_CONFIG)
                        || window.ENCOUNTERS_CONFIG || {};
                    const def = (cfg.encounterSynergies || {})[synId];
                    synEl.textContent = def && def.desc ? def.desc : ('遭遇协同：' + synId);
                    synEl.style.display = 'block';
                } else {
                    synEl.textContent = '';
                    synEl.style.display = 'none';
                }
            }
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

        _getMapChoiceNodes(run) {
            const TRM = window.TowerRunMap;
            if (!run || !run.map) return [];
            if (!run.currentNodeId) {
                const start = TRM.getNode(run.map, run.map.startId);
                return start && !start.cleared ? [start] : [];
            }
            const cur = TRM.getNode(run.map, run.currentNodeId);
            if (!cur) return [];
            if (!cur.cleared) return [cur];
            return (cur.edges || [])
                .map((id) => TRM.getNode(run.map, id))
                .filter((n) => n && !n.cleared);
        }

        _flashLayerBanner(host, progressLabel) {
            if (!host || this._reduceMotion) return;
            host.innerHTML = `<div class="ab-layer-banner"><strong>${esc(progressLabel || '前进')}</strong></div>`;
            setTimeout(() => { host.innerHTML = ''; }, 1600);
        }

        refreshMeta() {
            const meta = this.controller.ensurePartyMeta();
            const bankEl = document.getElementById('ab-meta-bank');
            const heroesEl = document.getElementById('ab-meta-heroes');
            if (bankEl) {
                bankEl.innerHTML = `
                    <div class="ab-bank-card">
                        <div class="ab-bank-value">Lv.1</div>
                        <div class="ab-bank-label">局外固定起点</div>
                    </div>
                    <div class="ab-bank-meta">
                        <div><span>通关</span><strong>${meta.runsCompleted}</strong></div>
                        <div><span>最高节点</span><strong>${meta.highestRunLayer}</strong></div>
                    </div>
                    <p class="ab-muted" style="margin:10px 4px 0;line-height:1.45;">
                        已取消经验银行。战斗获得的等级点请在<strong>塔内休息处</strong>分配给角色。
                    </p>`;
            }
            if (!heroesEl) return;
            heroesEl.innerHTML = '';
            meta.heroes.forEach((h) => {
                const card = document.createElement('div');
                card.className = 'ab-hero-card ' + (CLASS_TONE[h.baseClass] || '');
                const active = window.PartyMetaSystem.getActiveClassIdForHero(h);
                card.innerHTML = `
                    <div class="ab-hero-card-head">
                        <div class="ab-avatar"${classIconStyle(h.baseClass)}>${esc(h.displayName[0])}</div>
                        <div>
                            <h3>${esc(h.displayName)} <span class="ab-lv">起点 Lv.1</span></h3>
                            <p class="ab-muted">${esc(active)} · 成长在塔内</p>
                        </div>
                    </div>`;
                heroesEl.appendChild(card);
            });
        }

        _renderHudStats(run) {
            const stats = document.getElementById('ab-stats');
            if (!stats) return;
            stats.innerHTML = hudStatsHtml(run);
        }

        refresh() {
            const run = this.controller.run;
            if (!run) return;
            if (this.game && this.game._autoBattlerPresentation && this.game._applyAutoBattlerCanvasLayout) {
                this.game._applyAutoBattlerCanvasLayout();
            }
            this._renderHudStats(run);
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
                    this.renderDeployIntel();
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
            const hud = document.getElementById('ab-hud');
            const hideTrueHud = !!(this.controller.battle && this.controller.battle.trueModeNoHud && run.phase === 'combat');
            if (hud) {
                hud.style.opacity = hideTrueHud ? '0' : '';
                hud.style.pointerEvents = hideTrueHud ? 'none' : '';
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
                const gearSlots = (window.RunStateSystem && window.RunStateSystem.EQUIP_SLOTS) || ['weapon', 'armor'];
                const gearCount = gearSlots.filter((s) => h.equipment && h.equipment[s]).length;
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
                    <span class="ab-bench-pos">${h.boardCol >= 0 ? '已上场' : '待命'} · 技${skillCount}/${window.DemonPact ? window.DemonPact.getMaxActiveSkills(run) : 4} · 装${gearCount}/${gearSlots.length}</span>`;
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
            const TRM = window.TowerRunMap;
            const choices = this._getMapChoiceNodes(run);
            const focusLayer = choices.length
                ? choices[0].layer
                : (run.currentNodeId
                    ? ((TRM.getNode(run.map, run.currentNodeId) || {}).layer || 0)
                    : 0);
            const layerAdvanced = this._lastMapFocusLayer != null && focusLayer > this._lastMapFocusLayer;
            const progressLabel = TRM.getProgressLabel
                ? TRM.getProgressLabel(run.map, focusLayer)
                : ('第 ' + (focusLayer + 1) + ' 层');
            const history = (run.map.history || []).slice(-5);
            let histHtml = '';
            if (history.length) {
                histHtml = '<div class="ab-map-history"><span class="ab-muted">近期</span>' +
                    history.map((h) => `<span class="ab-map-hist-chip ${esc(h.type)}">${esc(TRM.nodeTypeLabel(h.type))}</span>`).join('') +
                    '</div>';
            }
            const choiceHint = choices.length === 1
                ? '进入下一节点'
                : '从以下路线中选择一条';
            let html = `<div class="ab-scene-hero">
                <h2>${esc(progressLabel)}</h2>
                <p class="ab-muted">${esc(choiceHint)}</p>
            </div>
            <div class="ab-map-stage">
                <div class="ab-layer-banner-host" id="ab-layer-banner-host"></div>
                ${histHtml}
                <div class="ab-map ab-map-choices">`;
            const blindMap = !!(run.ascension && run.ascension.blindMap);
            choices.forEach((n, idx) => {
                const label = blindMap ? '未知路线' : TRM.nodeTypeLabel(n.type);
                const cls = ['ab-node', 'ab-choice-node', blindMap ? 'blind' : n.type, 'reachable',
                    !this._reduceMotion ? 'ab-map-layer-stagger' : ''].join(' ');
                html += `<button type="button" class="${cls}" data-node="${n.id}" style="--ab-layer-i:${idx}">
                    ${blindMap ? '<span class="ab-node-icon ab-node-icon-blind">?</span>' : nodeIconHtml(n.type)}
                    <span class="ab-node-name">${esc(label)}</span>
                    <span class="ab-node-sub">${blindMap ? '盲选' : ('选项 ' + (idx + 1))}</span>
                </button>`;
            });
            if (!choices.length) {
                html += '<p class="ab-muted">暂无可选节点</p>';
            }
            html += '</div></div>';
            el.innerHTML = html;
            if (layerAdvanced) {
                this._flashLayerBanner(document.getElementById('ab-layer-banner-host'), progressLabel);
            }
            this._lastMapFocusLayer = focusLayer;
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
            this._renderHudStats(run);
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
                const afford = ev.chainId ? true : (window.AutoBattlerEvents
                    ? window.AutoBattlerEvents.canAffordChoice(run, ch)
                    : true);
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
            const pending = (run && run.pendingLevelPoints) || 0;
            const heroBtns = (run.heroes || []).map((h) => {
                const lv = h.runLevel || 0;
                const disabled = pending <= 0 ? ' disabled' : '';
                return `<button type="button" class="ab-btn ab-btn-sm ab-rest-level" data-hero="${esc(h.heroId)}"${disabled}>${esc(h.displayName)} <small>局内+${lv}</small></button>`;
            }).join('');
            el.innerHTML = `<div class="ab-rest-card ab-rest-scene">
                <h3>营地</h3>
                <p>战斗积累的等级点在此分配（可多次）</p>
                <div class="ab-rest-level-row">
                    <span>可分配点数：<strong id="ab-rest-pending">${pending}</strong></span>
                    <div class="ab-rest-level-btns">${heroBtns}</div>
                </div>
                <p class="ab-muted" style="margin:8px 0 4px;">补给（选一项后离开，未分配点数会保留到下次休息）：</p>
                <div class="ab-rest-choices">
                    <button type="button" class="ab-btn ab-btn-primary" data-rest="heal">回血 ${healPct}%</button>
                    <button type="button" class="ab-btn ab-btn-gold" data-rest="star">随机已装技能升星</button>
                    <button type="button" class="ab-btn" data-rest="purify">净化仪式 (-20腐化 · 50金)</button>
                    <button type="button" class="ab-btn" data-rest="leave">直接离开</button>
                </div>
                <p class="ab-rest-msg" id="ab-rest-msg"></p>
            </div>`;
            this._showSceneView('ab-rest-view', 'rest');
            const msg = document.getElementById('ab-rest-msg');
            const pendingEl = document.getElementById('ab-rest-pending');
            const refreshLevelBtns = () => {
                const left = (this.controller.run && this.controller.run.pendingLevelPoints) || 0;
                if (pendingEl) pendingEl.textContent = String(left);
                el.querySelectorAll('[data-hero]').forEach((btn) => {
                    btn.disabled = left <= 0;
                    const hid = btn.getAttribute('data-hero');
                    const hero = (this.controller.run.heroes || []).find((h) => h.heroId === hid);
                    const lv = hero ? (hero.runLevel || 0) : 0;
                    const name = hero ? hero.displayName : hid;
                    btn.innerHTML = `${esc(name)} <small>局内+${lv}</small>`;
                });
            };
            el.querySelectorAll('[data-rest]').forEach((btn) => {
                btn.onclick = () => {
                    const res = this.controller.resolveRestChoice(btn.getAttribute('data-rest'));
                    if (!res.ok) { if (msg) msg.textContent = res.message || '失败'; return; }
                    if (msg) msg.textContent = res.message || '完成';
                    if (res.leave) setTimeout(leave, 650);
                };
            });
            el.querySelectorAll('[data-hero]').forEach((btn) => {
                btn.onclick = () => {
                    const res = this.controller.resolveRestChoice('level', btn.getAttribute('data-hero'));
                    if (!res.ok) { if (msg) msg.textContent = res.message || '失败'; return; }
                    if (msg) msg.textContent = res.message || '完成';
                    refreshLevelBtns();
                    this.refresh();
                };
            });
        }


        renderCommanderBar(battle) {
            const bar = document.getElementById('ab-commander-bar');
            if (!bar) return;
            const cm = battle && battle.commanderMode;
            const show = !!(cm && window.AscensionHub && window.AscensionHub.isEnabled('commanderMode'));
            bar.style.display = show ? 'flex' : 'none';
            if (!show || !cm) return;
            const fill = document.getElementById('ab-te-fill');
            const text = document.getElementById('ab-te-text');
            const pct = Math.min(100, (cm.energy / Math.max(1, cm.maxEnergy)) * 100);
            if (fill) fill.style.width = pct + '%';
            if (text) text.textContent = Math.floor(cm.energy) + '/' + cm.maxEnergy;
            const abEl = document.getElementById('ab-commander-abilities');
            if (!abEl) return;
            const abilities = window.CommanderMode.allAbilities();
            const run = this.controller.run;
            const unlocked = new Set(window.CommanderMode.unlockedAbilityIds(run));
            const allIds = Object.keys(abilities).sort((a, b) => {
                const au = abilities[a];
                const bu = abilities[b];
                if (au.basic && !bu.basic) return -1;
                if (!au.basic && bu.basic) return 1;
                return (au.name || a).localeCompare(bu.name || b);
            });
            abEl.innerHTML = allIds.map((id) => {
                const def = abilities[id];
                if (!def) return '';
                const locked = !unlocked.has(id);
                const cd = cm.cooldowns[id] || 0;
                const ready = !locked && window.CommanderMode.canUse(cm, id);
                return `<button type="button" class="ab-cmd-btn ${locked ? 'locked' : ''} ${ready ? '' : 'disabled'}" data-cmd="${id}" ${locked ? 'disabled' : ''} title="${esc(def.name)} · ${def.cost}TE${locked ? ' · 未解锁' : ''}">
                    ${esc(def.name)}${locked ? ' 🔒' : ''}${cd > 0 && !locked ? ' (' + Math.ceil(cd / 1000) + 's)' : ''}
                </button>`;
            }).join('');
            abEl.querySelectorAll('.ab-cmd-btn').forEach((btn) => {
                btn.onclick = () => {
                    if (btn.classList.contains('locked')) return;
                    const id = btn.getAttribute('data-cmd');
                    const def = abilities[id];
                    if (!def) return;
                    if (window.CommanderMode.needsTotemPick(def)) {
                        this._showTotemPicker(cm, id, def, battle);
                        return;
                    }
                    const target = window.CommanderMode.pickAbilityTarget(cm, def, battle);
                    window.CommanderMode.useAbility(cm, id, target);
                    this.refreshCombatBar(battle);
                };
            });
            bar.querySelectorAll('.ab-speed-btn').forEach((btn) => {
                btn.onclick = () => {
                    const sp = parseInt(btn.getAttribute('data-speed'), 10) || 1;
                    const meta = this.controller.ensurePartyMeta();
                    const unlock = meta.ascension && meta.ascension.speedUnlock;
                    if (sp > 1 && unlock && !unlock['x' + sp]) return;
                    battle.timeScale = sp;
                    if (this.controller.run && this.controller.run.ascension) {
                        this.controller.run.ascension.battleSpeedScale = sp;
                    }
                    bar.querySelectorAll('.ab-speed-btn').forEach((b) => b.classList.toggle('active', b === btn));
                };
            });
        }

        _showTotemPicker(cm, abilityId, def, battle) {
            const types = def.totemTypes || ['heal', 'attack', 'taunt'];
            const labels = { heal: '治疗图腾', attack: '攻击图腾', taunt: '嘲讽图腾' };
            const overlay = document.createElement('div');
            overlay.className = 'ab-totem-picker-overlay';
            overlay.innerHTML = `<div class="ab-totem-picker">
                <h4>选择图腾类型</h4>
                <div class="ab-actions">${types.map((t) =>
                    `<button type="button" class="ab-btn" data-totem="${t}">${esc(labels[t] || t)}</button>`
                ).join('')}</div>
                <button type="button" class="ab-btn ab-btn-sm ab-muted-btn" id="ab-totem-cancel">取消</button>
            </div>`;
            document.body.appendChild(overlay);
            overlay.querySelectorAll('[data-totem]').forEach((btn) => {
                btn.onclick = () => {
                    const totemType = btn.getAttribute('data-totem');
                    window.CommanderMode.useAbility(cm, abilityId, { totemType: totemType });
                    overlay.remove();
                    this.refreshCombatBar(battle);
                };
            });
            overlay.querySelector('#ab-totem-cancel').onclick = () => overlay.remove();
        }

        renderDeployIntel() {
            const panel = document.getElementById('ab-intel-panel');
            const run = this.controller.run;
            const hideIntel = !!(run && run.ascension && run.ascension.pact && run.ascension.pact.noIntel);
            if (!panel || !run || run.phase !== 'deploy' || hideIntel) {
                if (panel) panel.style.display = 'none';
                return;
            }
            const node = window.TowerRunMap.getNode(run.map, run.currentNodeId);
            const preview = this.controller.battle || {};
            const intel = window.PreCombatIntel
                ? window.PreCombatIntel.analyze(run, { enemies: preview.enemies || [] }, node)
                : null;
            if (!intel || !intel.enabled) {
                panel.style.display = 'none';
                return;
            }
            panel.style.display = 'block';
            const intents = (intel.intents || []).map((i) =>
                `<li>${esc(i.name)}：${esc(i.intent)} → ${esc(i.targetRow)}</li>`
            ).join('');
            const form = (intel.formation || []).map((f) =>
                `<li>${esc(f.hero)} ${f.row != null ? '第' + (f.row + 1) + '排' : ''} · ${esc(f.tip)}</li>`
            ).join('');
            const synList = (intel.synergies || []).map((s) =>
                `<li><span style="color:${s.color || '#888'}">${esc(s.name || s.id)}</span> — ${esc(s.description || '')}</li>`
            ).join('');
            const phaseList = (intel.bossPhases || []).map((p) =>
                `<li>${esc(p.name || p.id || '阶段')} · ${esc(p.hint || p.description || '')}</li>`
            ).join('');
            panel.innerHTML = `<div class="ab-intel-card">
                <h4>战前情报 <span class="ab-muted">(${Math.round(intel.accuracy * 100)}%)</span></h4>
                <p>威胁：<strong>${esc(intel.threat)}</strong> · ${esc(intel.commanderHint)}</p>
                <ul class="ab-intel-list">${intents || '<li>无特殊意图</li>'}</ul>
                <p class="ab-muted">推荐站位</p>
                <ul class="ab-intel-list">${form}</ul>
                ${synList ? `<p class="ab-muted">激活协同</p><ul class="ab-intel-list">${synList}</ul>` : ''}
                ${phaseList ? `<p class="ab-muted">Boss 阶段</p><ul class="ab-intel-list">${phaseList}</ul>` : ''}
            </div>`;
        }

        showSkirmishChoice(node, encounter) {
            this._showSceneView('ab-map-view', 'skirmish');
            const el = document.getElementById('ab-map-view');
            if (!el) return;
            const p = window.CombatPacing.calculatePower(this.controller.run, encounter);
            el.innerHTML = `<div class="ab-skirmish-choice">
                <h3>碾压遭遇</h3>
                <p>战力比 ${p.ratio.toFixed(2)}：可选择瞬间结算（约 3 秒）或观看完整战斗。</p>
                <div class="ab-actions">
                    <button type="button" id="ab-skirmish-yes" class="ab-btn ab-btn-primary">瞬间结算</button>
                    <button type="button" id="ab-skirmish-no" class="ab-btn">观看战斗</button>
                </div>
                <label class="ab-skirmish-pref"><input type="checkbox" id="ab-skirmish-always"> 满足条件时始终瞬间结算</label>
            </div>`;
            document.getElementById('ab-skirmish-yes').onclick = () => {
                const always = document.getElementById('ab-skirmish-always');
                if (always && always.checked && this.controller.run.ascension) {
                    this.controller.run.ascension.skirmishPreference = true;
                }
                this.controller.resolveSkirmish(node, true);
            };
            document.getElementById('ab-skirmish-no').onclick = () => this.controller.resolveSkirmish(node, false);
        }

        showPactSelect(meta) {
            this._showSceneView('ab-map-view', 'pact');
            const el = document.getElementById('ab-map-view');
            if (!el || !window.DemonPact) return;
            const choices = window.DemonPact.listChoices(meta);
            el.innerHTML = `<div class="ab-pact-select">
                <h3>恶魔契约</h3>
                <p class="ab-muted">选择挑战与星级（1–5 星），星级越高奖励与难度越高（可跳过）</p>
                <div class="ab-pact-grid">${choices.map((c) =>
                    `<div class="ab-pact-card" data-pact="${c.id}">
                        <strong>${esc(c.name)}</strong>
                        <span>${esc(c.description)}</span>
                        <div class="ab-pact-stars">${[1, 2, 3, 4, 5].map((s) =>
                            `<button type="button" class="ab-pact-star" data-pact="${c.id}" data-stars="${s}" title="${s} 星">${s}★</button>`
                        ).join('')}</div>
                    </div>`
                ).join('')}</div>
                <button type="button" id="ab-pact-skip" class="ab-btn ab-btn-ghost">不签订契约</button>
            </div>`;
            el.querySelectorAll('.ab-pact-star').forEach((btn) => {
                btn.onclick = () => {
                    const stars = parseInt(btn.getAttribute('data-stars'), 10) || 1;
                    this.controller.applyPactChoice(btn.getAttribute('data-pact'), stars);
                    this._hideScene(true);
                };
            });
            document.getElementById('ab-pact-skip').onclick = () => {
                this.controller.skipPactChoice();
                this._hideScene(true);
            };
        }

        showRunSummary(summary) {
            this.show();
            this._postRunSummaryActive = true;
            const el = document.getElementById('ab-summary-view');
            if (!el) return;
            const dn = summary.deathNarrative;
            const narrativeHtml = dn ? `<div class="ab-death-narrative">
                <h4>${esc(dn.title || '死亡档案')}</h4>
                <p>击杀 ${dn.kills || 0} · 推进 ${dn.layers || 0} 层 · 协同 ${dn.maxSynergies || 0}</p>
                ${(dn.newUnlocks && dn.newUnlocks.length) ? '<p>解锁：' + dn.newUnlocks.map(esc).join('、') + '</p>' : ''}
            </div>` : '';
            el.innerHTML = `<div class="ab-summary ${summary.victory ? 'win' : 'lose'}">
                <h3>${summary.victory ? '通关成功' : '挑战失败'}</h3>
                <div class="ab-summary-stats">
                    <div><span>本局经验</span><strong>+${summary.expEarned}</strong></div>
                    <div><span>未分配点数</span><strong>${summary.pendingLevelPoints || 0}</strong></div>
                    <div><span>推进节点</span><strong>${summary.layersCleared}</strong></div>
                </div>
                ${narrativeHtml}
                <p class="ab-muted" style="margin:8px 0 0;">等级不带出塔外；下次从 Lv.1 再开一局，在休息处分配成长。</p>
                <div class="ab-actions">
                    <button type="button" id="ab-summary-town" class="ab-btn ab-btn-primary">返回主城</button>
                </div>
            </div>`;
            this._showSceneView('ab-summary-view', 'summary');
            document.getElementById('ab-summary-town').onclick = () => {
                this.controller.returnToTown();
                if (this.game.saveGameToBrowserStorage) this.game.saveGameToBrowserStorage();
            };
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
            html += lineageProgressHtml(run);
            html += '<div class="ab-panel-section"><div class="ab-panel-section-title">技能槽</div>';
            html += '<div class="ab-skill-hotbar">';
            const maxSk = window.DemonPact ? window.DemonPact.getMaxActiveSkills(run) : 4;
            for (let i = 0; i < maxSk; i++) {
                const entry = RSS.normalizeSkillEntry(hero.skillSlots[i]);
                const sid = entry ? entry.id : null;
                const stars = entry && entry.stars ? entry.stars : 1;
                if (sid) {
                    const starLine = `<div class="ab-skill-stars">${esc(RSS.formatStarLabel(stars))}</div>`;
                    const branchLine = skillBranchModsHtml(entry, true);
                    const canReplace = bag && bag.kind === 'skill' && RSS.canHeroUseSkill(hero, bag.id);
                    if (canReplace) {
                        html += `<button type="button" class="ab-slot-panel filled ab-skill-slot droppable ab-slot-compact" data-fill-skill="${i}">
                            <div class="ab-slot-panel-head"><span>${i + 1}</span><span class="ab-slot-replace-hint">替换</span></div>
                            <div class="ab-slot-gear-row">
                                <span class="ab-slot-gear-icon" style="${skillIconStyle(sid)}"></span>
                                <div>
                                    <strong>${esc(skillEntryDisplayName(entry))}</strong>
                                    ${starLine}
                                    ${branchLine}
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
                                    <strong>${esc(skillEntryDisplayName(entry))}</strong>
                                    ${starLine}
                                    ${branchLine}
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
                const norm = RSS.normalizeSkillEntry(entry);
                const sid = norm ? norm.id : RSS.skillEntryId(entry);
                const stars = norm && norm.stars ? norm.stars : 1;
                const canUse = RSS.canHeroUseSkill(hero, sid);
                const sel = bag && bag.kind === 'skill' && bag.id === sid;
                html += skillCardHtml(sid, {
                    entry: norm,
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
                const maxSk = window.DemonPact ? window.DemonPact.getMaxActiveSkills(run) : 4;
                for (let i = 0; i < maxSk; i++) {
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
