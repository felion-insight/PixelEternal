/**
 * Phase 3 装备图鉴与开发者工具
 */
(function () {
    'use strict';

    const CANONICAL_QUALITIES = ['normal', 'magic', 'rare', 'epic', 'legendary', 'mythic'];
    const LEGACY_QUALITY_MAP = { common: 'normal', fine: 'magic', rare: 'rare' };

    function normalizeQualityFilter(q) {
        if (!q || q === 'all') return 'all';
        return LEGACY_QUALITY_MAP[q] || q;
    }

    function normalizeSlotFilter(slot) {
        const map = { chest: 'body', boots: 'feet', necklace: 'amulet', mainHand: 'weapon' };
        if (!slot || slot === 'all') return 'all';
        return map[slot] || slot;
    }

    function listBaseTypes(filter) {
        const bt = window.BASE_TYPES;
        if (!bt) return [];
        const out = [];
        const f = filter || {};
        const push = (category, id, def) => {
            if (f.slot && f.slot !== 'all' && def.slot !== f.slot) return;
            if (f.weaponType && f.weaponType !== 'all' && def.weaponType !== f.weaponType) return;
            if (f.classAffinity && f.classAffinity !== 'all' && def.classAffinity !== f.classAffinity) return;
            out.push({ category, id, def });
        };
        Object.entries(bt.weapons || {}).forEach(([id, def]) => push('weapon', id, def));
        Object.entries(bt.offHand || {}).forEach(([id, def]) => push('offHand', id, def));
        Object.entries(bt.armor || {}).forEach(([id, def]) => push('armor', id, def));
        Object.entries(bt.accessories || {}).forEach(([id, def]) => push('accessory', id, def));
        return out;
    }

    function generateProceduralSample(options) {
        if (typeof window.generateProceduralEquipment !== 'function') return null;
        const ctx = Object.assign({
            monsterLevel: 20,
            monsterTier: 'elite',
            playerClass: 'warrior'
        }, options || {});
        return window.generateProceduralEquipment(ctx);
    }

    function generateProceduralSamples(options) {
        const opts = options || {};
        const count = Math.min(60, Math.max(1, opts.count || 24));
        const slot = opts.slot && opts.slot !== 'all' ? opts.slot : null;
        const quality = opts.quality && opts.quality !== 'all' ? opts.quality : null;
        const level = opts.level && opts.level !== 'all' ? parseInt(opts.level, 10) : null;
        const classId = opts.classId || opts.playerClass || null;
        const setId = opts.setId || null;
        const baseTypeId = opts.baseTypeId || null;
        const samples = [];
        const seen = new Set();
        let attempts = 0;
        const maxAttempts = count * 25;

        while (samples.length < count && attempts < maxAttempts) {
            attempts++;
            const ctx = {
                monsterLevel: level || (5 + Math.floor(Math.random() * 12) * 5),
                monsterTier: quality === 'legendary' || quality === 'mythic' ? 'boss' : 'elite',
                playerClass: classId,
                classId
            };
            if (slot) ctx.slot = slot;
            if (quality) ctx.quality = quality;
            const eq = generateProceduralSample(ctx);
            if (!eq) break;
            if (baseTypeId && eq.baseTypeId !== baseTypeId) continue;
            if (setId && eq.setId !== setId) continue;
            const key = [eq.name, eq.baseTypeId, eq.quality, eq.level, eq.setId,
                (eq.prefixes || []).map(a => a.id + a.tier).join(','),
                (eq.suffixes || []).map(a => a.id + a.tier).join(',')].join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            samples.push(eq);
        }
        return samples;
    }

    function generateBuildEquipmentSamples(options) {
        const opts = options || {};
        const items = window.CLASS_BUILD_EQUIPMENT && window.CLASS_BUILD_EQUIPMENT.items;
        if (!items) return [];
        const quality = opts.quality && opts.quality !== 'all' ? opts.quality : 'legendary';
        if (!['epic', 'legendary', 'mythic'].includes(quality)) return [];
        const activeClassId = opts.classId || opts.playerClass || null;
        const baseClassId = opts.playerClass || activeClassId;
        return items
            .filter(def => {
                if (opts.slot && opts.slot !== 'all' && def.slot !== opts.slot) return false;
                if (def.classRestriction && def.classRestriction.length && activeClassId) {
                    if (!def.classRestriction.includes(activeClassId)
                        && !def.classRestriction.includes(baseClassId)) return false;
                }
                return true;
            })
            .map(def => generateProceduralSample({
                monsterLevel: opts.level || 60,
                monsterTier: 'boss',
                quality,
                slot: def.slot,
                weaponType: def.weaponType,
                setId: null,
                playerClass: baseClassId,
                classId: activeClassId,
                buildEquipmentId: def.equipmentId
            }))
            .filter(Boolean);
    }

    function cloneEquipmentForGrant(eq) {
        if (!eq || typeof Equipment === 'undefined') return null;
        const copy = new Equipment({
            id: 'dev_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
            name: eq.name,
            slot: eq.slot,
            weaponType: eq.weaponType,
            quality: eq.quality,
            level: eq.level,
            stats: JSON.parse(JSON.stringify(eq.baseStats || eq.stats || {})),
            baseTypeId: eq.baseTypeId,
            implicit: eq.implicit ? JSON.parse(JSON.stringify(eq.implicit)) : null,
            prefixes: eq.prefixes ? JSON.parse(JSON.stringify(eq.prefixes)) : [],
            suffixes: eq.suffixes ? JSON.parse(JSON.stringify(eq.suffixes)) : [],
            legendaryPowers: eq.legendaryPowers ? JSON.parse(JSON.stringify(eq.legendaryPowers)) : [],
            setId: eq.setId,
            buildEquipmentId: eq.buildEquipmentId || null,
            classAffinity: eq.classAffinity,
            procedural: !!eq.procedural,
            refineLevel: eq.refineLevel || 0,
            enhanceLevel: eq.enhanceLevel || 0
        });
        copy.buildEquipmentId = eq.buildEquipmentId || null;
        return copy;
    }

    function grantFullSetV2(setId, game) {
        if (!game || !setId || typeof SET_DEFINITIONS_V2 === 'undefined' || !SET_DEFINITIONS_V2.sets) {
            return { ok: false, message: '套装配置未加载' };
        }
        const setData = SET_DEFINITIONS_V2.sets[setId];
        if (!setData || !setData.slots) return { ok: false, message: '无效套装 ID' };
        let added = 0;
        let failed = 0;
        const baseLevel = game.player ? game.player.level : 20;
        setData.slots.forEach((slot, idx) => {
            const eq = generateProceduralSample({
                slot,
                quality: 'epic',
                monsterLevel: Math.max(10, baseLevel),
                monsterTier: 'boss',
                playerClass: setData.classAffinity || (game.player && typeof window.getPlayerBaseClassId === 'function'
                    ? window.getPlayerBaseClassId(game.player.classData) : 'warrior')
            });
            if (!eq) { failed++; return; }
            eq.setId = setId;
            if (typeof window.refreshEquipmentGearScore === 'function') {
                window.refreshEquipmentGearScore(eq);
            }
            const copy = cloneEquipmentForGrant(eq);
            if (copy && game.addItemToInventory(copy, true)) added++;
            else failed++;
        });
        return { ok: true, added, total: setData.slots.length, failed, name: setData.name };
    }

    function buildAffixReferenceHtml() {
        const pool = window.AFFIX_POOL;
        if (!pool) return '<p style="color:#888;">词缀配置未加载</p>';
        const tierColors = pool.tierColors || ['#ccc', '#4c4', '#48f', '#a4f', '#f80'];
        let html = '<p style="color:#aaa;font-size:13px;line-height:1.5;margin:0 0 14px;">前缀偏数值、后缀偏机制；Tier 1–5 随装备等级提升。括号内为可出现的槽位。</p>';
        const renderGroup = (title, list, sym, affixType) => {
            html += `<h3 style="color:#e0e0e0;margin:18px 0 8px;font-size:15px;">${title}</h3>`;
            (list || []).forEach(a => {
                const t5 = (a.tiers || []).find(t => t.tier === 5) || (a.tiers || [])[(a.tiers || []).length - 1];
                const t1 = (a.tiers || [])[0];
                const range = t1 && t5 ? `${t1.min}–${t5.max}${a.isPercent ? '%' : ''}` : '-';
                const slots = (a.slots || []).map(s => (window.SLOT_NAMES && window.SLOT_NAMES[s]) || s).join('、');
                html += `<div class="codex-affix-entry" data-affix-id="${a.id}" data-affix-type="${affixType}" style="background:rgba(45,45,55,0.9);border:1px solid #555;border-radius:5px;padding:10px 12px;margin-bottom:8px;">`;
                html += `<div style="color:${tierColors[4]};font-weight:bold;">${sym} ${a.name} <span style="color:#888;font-weight:normal;font-size:11px;">(${a.stat})</span></div>`;
                html += `<div style="color:#aaa;font-size:11px;margin-top:4px;">数值范围 T1→T5: ${range}</div>`;
                html += `<div style="color:#777;font-size:11px;">槽位: ${slots}</div>`;
                html += `</div>`;
            });
        };
        renderGroup('前缀', pool.prefixes, '◆', 'prefix');
        renderGroup('后缀', pool.suffixes, '◇', 'suffix');
        return html;
    }

    function buildLegendaryPowersHtml() {
        const cfg = window.LEGENDARY_POWERS;
        if (!cfg) return '<p style="color:#888;">威能配置未加载</p>';
        let html = '<p style="color:#aaa;font-size:13px;margin:0 0 14px;">传说装备必有威能，神话装备可有 2 个。史诗有概率附带。</p>';
        const renderPower = (p, tag) => {
            html += `<div class="codex-power-entry" data-power-id="${p.id}" style="background:rgba(50,40,30,0.85);border:1px solid #a60;border-radius:5px;padding:10px 12px;margin-bottom:8px;">`;
            html += `<div style="color:#fa0;font-weight:bold;">★ ${p.name} <span style="color:#888;font-size:11px;">${tag}</span></div>`;
            html += `<div style="color:#ccc;font-size:12px;margin-top:4px;line-height:1.45;">${p.description}</div>`;
            html += `<div style="color:#777;font-size:11px;margin-top:4px;">槽位: ${(p.slots || []).map(s => (window.SLOT_NAMES && window.SLOT_NAMES[s]) || s).join('、')}</div>`;
            html += `</div>`;
        };
        html += '<h3 style="color:#e0c080;margin:0 0 8px;font-size:15px;">通用威能</h3>';
        (cfg.universal || []).forEach(p => renderPower(p, '通用'));
        const clsNames = { warrior: '战士', archer: '弓箭手', mage: '法师', assassin: '刺客' };
        Object.entries(cfg.classPowers || {}).forEach(([cls, list]) => {
            html += `<h3 style="color:#88ccff;margin:16px 0 8px;font-size:15px;">${clsNames[cls] || cls}专属</h3>`;
            (list || []).forEach(p => renderPower(p, p.rarity === 'mythic' ? '神话' : '传说'));
        });
        return html;
    }

    function buildSetV2Html(activeEquipment) {
        const cfg = window.SET_DEFINITIONS_V2;
        if (!cfg || !cfg.sets) return '<p style="color:#888;">新版套装配置未加载</p>';
        let html = '<p style="color:#aaa;font-size:13px;line-height:1.5;margin:0 0 14px;">毕业路径：<strong style="color:#8cf;">一转小毕业（2件过试炼）</strong> → <strong style="color:#fc8;">二转大毕业</strong>。通用元素套作过渡，可混搭 2+2。</p>';
        const pieceTargets = cfg.activationPieces || [2, 4];
        const groups = [
            { key: 'first', title: '一转小毕业', color: '#8cf' },
            { key: 'second', title: '二转大毕业', color: '#fc8' },
            { key: 'generic', title: '通用过渡套装', color: '#aaa' }
        ];
        const byTier = { first: [], second: [], generic: [] };
        Object.entries(cfg.sets).forEach(([setId, setData]) => {
            const tier = setData.tier || (setData.classAffinity ? 'first' : 'generic');
            (byTier[tier] || byTier.generic).push([setId, setData]);
        });

        function affinityLabel(id) {
            const c = window.CLASS_CONFIG;
            if (!c || !id) return '';
            if (c.firstAdvancements && c.firstAdvancements[id]) return c.firstAdvancements[id].name;
            if (c.secondAdvancements && c.secondAdvancements[id]) return c.secondAdvancements[id].name;
            if (c.baseClasses && c.baseClasses[id]) return c.baseClasses[id].name;
            return id;
        }

        groups.forEach(g => {
            const list = byTier[g.key] || [];
            if (!list.length) return;
            html += `<h3 style="color:${g.color};margin:18px 0 10px;font-size:15px;">${g.title}</h3>`;
            list.forEach(([setId, setData]) => {
                let equipped = 0;
                if (activeEquipment && typeof getSetV2PieceCount === 'function') {
                    equipped = getSetV2PieceCount(activeEquipment, setId);
                }
                html += `<div class="codex-set-entry" data-set-id="${setId}" style="background:rgba(45,45,55,0.9);border:1px solid #666;border-radius:6px;padding:14px;margin-bottom:12px;">`;
                html += `<h3 style="margin:0 0 6px;color:#e0c080;font-size:16px;">${setData.name}`;
                if (setData.classAffinity) {
                    html += ` <span style="color:#8cf;font-size:12px;">(${affinityLabel(setData.classAffinity)}专属)</span>`;
                }
                html += `</h3>`;
                html += `<p style="color:#777;font-size:11px;margin:0 0 8px;">ID: ${setId} · 部位: ${(setData.slots || []).map(s => (window.SLOT_NAMES && window.SLOT_NAMES[s]) || s).join(' / ')}</p>`;
                if (equipped > 0) {
                    html += `<p style="color:#8f8;font-size:12px;margin:0 0 8px;">当前已装备 ${equipped} 件</p>`;
                }
                pieceTargets.forEach(pc => {
                    const eff = setData.effects && setData.effects[String(pc)];
                    if (!eff) return;
                    const active = equipped >= pc;
                    html += `<p style="color:${active ? '#3f3' : '#888'};font-size:12px;margin:4px 0;">${pc}件: ${typeof stripSetDescriptionMarkdown === 'function' ? stripSetDescriptionMarkdown(eff.description) : eff.description}</p>`;
                });
                html += `</div>`;
            });
        });
        return html;
    }

    function buildBaseTypesHtml(filter) {
        const items = listBaseTypes(filter);
        if (!items.length) return '<p style="color:#888;text-align:center;padding:24px;">无匹配基型</p>';
        let html = `<p style="color:#aaa;font-size:13px;margin:0 0 12px;">共 ${items.length} 种基型（Phase 3）</p>`;
        items.forEach(({ category, id, def }) => {
            html += `<div class="codex-base-type-entry" data-base-type-id="${id}" style="background:rgba(45,45,55,0.9);border:1px solid #555;border-radius:5px;padding:12px;margin-bottom:8px;cursor:pointer;" title="点击生成史诗样例">`;
            html += `<div style="color:#fff;font-weight:bold;">${def.name} <span style="color:#666;font-size:11px;font-weight:normal;">${id}</span></div>`;
            html += `<div style="color:#888;font-size:11px;margin-top:4px;">类别: ${category} · 槽位: ${(window.SLOT_NAMES && window.SLOT_NAMES[def.slot]) || def.slot}`;
            if (def.weaponType) html += ` · 武器: ${def.weaponType}`;
            if (def.classAffinity) html += ` · 亲和: ${def.classAffinity}`;
            if (def.style) html += ` · 风格: ${def.style}`;
            html += `</div>`;
            if (def.implicit && Object.keys(def.implicit).length) {
                html += `<div style="color:#8cf;font-size:11px;margin-top:6px;">隐式: ${Object.entries(def.implicit).map(([k, v]) => k + '+' + v).join(', ')}</div>`;
            }
            html += `</div>`;
        });
        return html;
    }

    function buildCustomEquipment(options) {
        if (typeof window.buildCustomProceduralEquipment !== 'function') return null;
        return window.buildCustomProceduralEquipment(options);
    }

    function grantCustomEquipment(game, options) {
        const eq = buildCustomEquipment(options);
        if (!eq || !game) return { ok: false, message: '生成失败' };
        const copy = cloneEquipmentForGrant(eq);
        if (!copy) return { ok: false, message: '克隆失败' };
        const added = game.addItemToInventory(copy, true);
        return { ok: !!added, equipment: copy, message: added ? `获得: ${copy.name}` : '背包已满' };
    }

    window.EquipmentCodex = {
        CANONICAL_QUALITIES,
        normalizeQualityFilter,
        normalizeSlotFilter,
        listBaseTypes,
        generateProceduralSample,
        generateProceduralSamples,
        generateBuildEquipmentSamples,
        cloneEquipmentForGrant,
        grantFullSetV2,
        buildCustomEquipment,
        grantCustomEquipment,
        buildAffixReferenceHtml,
        buildLegendaryPowersHtml,
        buildSetV2Html,
        buildBaseTypesHtml,
        generateLootEquipment(options) {
            return generateProceduralSample(options);
        },
        generateShopStock(player, count) {
            const n = Math.max(1, count || 12);
            const lv = Math.max(1, Math.floor(Number(player && player.level) || 1));
            const classId = player && typeof window.getPlayerBaseClassId === 'function'
                ? window.getPlayerBaseClassId(player.classData) : null;
            const activeClassId = player && typeof window.getActiveClassId === 'function'
                ? window.getActiveClassId(player.classData) : classId;
            const qualities = ['normal', 'magic', 'rare', 'epic', 'legendary'];
            const out = [];
            for (let i = 0; i < n; i++) {
                const q = qualities[Math.floor(Math.random() * qualities.length)];
                const eq = generateProceduralSample({
                    monsterLevel: lv,
                    monsterTier: q === 'legendary' ? 'boss' : 'elite',
                    quality: q,
                    playerClass: classId,
                    classId: activeClassId
                });
                if (eq) {
                    const copy = cloneEquipmentForGrant(eq);
                    if (copy) out.push(copy);
                }
            }
            return out;
        }
    };
})();
