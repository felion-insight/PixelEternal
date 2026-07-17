/**
 * Pixel Eternal - 战斗状态与联动系统（v2.0）
 * 灼烧/冻伤/感电/中毒/暗蚀 + 元素联动
 */
(function () {
    'use strict';

    function cfg() {
        return window.STATUS_SYNERGY_CONFIG || null;
    }

    function statusDef(type) {
        const c = cfg();
        return (c && c.statuses && c.statuses[type]) || null;
    }

    function ensureCombatStatuses(monster) {
        if (!monster) return null;
        if (!monster.combatStatuses) {
            monster.combatStatuses = {};
        }
        return monster.combatStatuses;
    }

    window.getMonsterActiveStatusTypes = function getMonsterActiveStatusTypes(monster) {
        const st = ensureCombatStatuses(monster);
        if (!st) return [];
        const now = Date.now();
        return Object.keys(st).filter(k => st[k] && st[k].until > now);
    };

    window.applyCombatStatus = function applyCombatStatus(monster, type, opts, attacker, gameInstance) {
        if (!monster || !type) return;
        const def = statusDef(type);
        const durationMs = (opts && opts.durationMs) || (def && def.durationMs) || 4000;
        const now = Date.now();
        const st = ensureCombatStatuses(monster);
        const stacks = (opts && opts.stacks) || 1;

        if (def && def.stackable) {
            const cur = st[type] || { stacks: 0, until: 0, lastTick: now };
            const maxStacks = (def.maxStacks != null && def.maxStacks > 0) ? def.maxStacks : null;
            let addStacks = stacks;
            if (type === 'poison' && attacker && typeof window.getSetModifier === 'function') {
                const extra = window.getSetModifier(attacker, 'poisonExtraStack', 0);
                if (extra > 0 && (!attacker._poisonExtraStackCdUntil || now >= attacker._poisonExtraStackCdUntil)) {
                    addStacks += Math.floor(extra);
                    attacker._poisonExtraStackCdUntil = now + 800;
                }
            }
            cur.stacks = maxStacks ? Math.min(maxStacks, (cur.stacks || 0) + addStacks) : (cur.stacks || 0) + addStacks;
            cur.until = now + durationMs;
            cur.lastTick = cur.lastTick || now;
            cur.appliedAt = now;
            cur.durationMs = durationMs;
            cur.sourceAttack = attacker && typeof window.getPlayerEffectiveAttack === 'function'
                ? window.getPlayerEffectiveAttack(attacker) : (attacker && attacker.baseAttack) || 10;
            if (attacker) cur.owner = attacker;
            st[type] = cur;
        } else {
            st[type] = {
                until: now + durationMs,
                lastTick: now,
                appliedAt: now,
                durationMs: durationMs,
                sourceAttack: attacker && typeof window.getPlayerEffectiveAttack === 'function'
                    ? window.getPlayerEffectiveAttack(attacker) : (attacker && attacker.baseAttack) || 10,
                owner: attacker || null
            };
        }

        if (type === 'frostbite') {
            let moveMult = (def && def.moveSpeedMult) || 0.7;
            let atkMult = (def && def.attackSpeedMult) || 0.8;
            if (attacker && typeof window.getElementalMasteryBonuses === 'function') {
                const mb = window.getElementalMasteryBonuses(attacker);
                if (mb && mb.frostSlowMult > 1) {
                    moveMult = Math.max(0.15, 1 - (1 - moveMult) * mb.frostSlowMult);
                    atkMult = Math.max(0.15, 1 - (1 - atkMult) * mb.frostSlowMult);
                }
            }
            if (!monster.slowEffects) monster.slowEffects = [];
            monster.slowEffects.push({
                multiplier: moveMult,
                expireTime: now + durationMs
            });
            if (!monster.combatStatuses.attackSpeedDebuff) {
                monster.combatStatuses.attackSpeedDebuff = { until: now + durationMs, mult: atkMult };
            } else {
                monster.combatStatuses.attackSpeedDebuff.until = Math.max(monster.combatStatuses.attackSpeedDebuff.until, now + durationMs);
            }
        }

        if (type === 'burn') {
            monster._burnTintUntil = now + durationMs;
            monster._burnStacksVisual = (st[type] && st[type].stacks) || stacks || 1;
        }

        if (type === 'corruption') {
            monster._corruptionTintUntil = now + durationMs;
        }

        if (type === 'poison') {
            monster._poisonTintUntil = now + durationMs;
            monster._poisonStacksVisual = (st[type] && st[type].stacks) || stacks || 1;
        }

        if (type === 'bleed') {
            monster._bleedTintUntil = now + durationMs;
        }

        if (type === 'dark_erosion') {
            monster._darkErosionUntil = Math.max(monster._darkErosionUntil || 0, now + durationMs);
            monster._darkErosionDefReduction = (def && def.defenseReductionPercent) || 20;
        }

        if (window.SkillLabMetrics) window.SkillLabMetrics.recordStatus(type, true);
        if (typeof window.checkStatusSynergy === 'function') {
            window.checkStatusSynergy(monster, attacker, gameInstance);
        }
    };

    window.applySkillStatusEffects = function applySkillStatusEffects(skillDef, monster, attacker, gameInstance) {
        if (!skillDef || !monster) return;
        const effects = skillDef.statusEffects || [];
        effects.forEach(e => {
            // 兼容 id / type 两种字段名
            const type = e.id || e.type || e.statusId;
            if (!type) return;
            // 概率判定
            if (e.chance != null && e.chance < 1 && Math.random() > e.chance) return;
            const opts = { durationMs: e.durationMs, stacks: e.stacks };
            if (e.value != null) opts.value = e.value;
            window.applyCombatStatus(monster, type, opts, attacker, gameInstance);
        });
    };

    window.removeCombatStatus = function removeCombatStatus(monster, type) {
        const st = ensureCombatStatuses(monster);
        if (!st || !st[type]) return;
        delete st[type];
        if (type === 'dark_erosion') {
            monster._darkErosionUntil = 0;
            monster._darkErosionDefReduction = 0;
        }
    };

    window.checkStatusSynergy = function checkStatusSynergy(monster, attacker, gameInstance) {
        const c = cfg();
        if (!c || !c.synergies || !monster) return;
        const active = window.getMonsterActiveStatusTypes(monster);
        if (active.length < 2) return;

        for (const syn of c.synergies) {
            if (syn.requiredMinStatusCount && active.length >= syn.requiredMinStatusCount) {
                if (monster._lastSynergyId === syn.id) continue;
                triggerSynergy(syn, monster, attacker, gameInstance, active);
                continue;
            }
            if (!syn.requiredStatuses) continue;
            const req = syn.requiredStatuses;
            if (req.every(r => active.includes(r))) {
                if (monster._lastSynergyId === syn.id) continue;
                triggerSynergy(syn, monster, attacker, gameInstance, active);
            }
        }
    };

    function triggerSynergy(syn, monster, attacker, gameInstance, active) {
        monster._lastSynergyId = syn.id;
        setTimeout(() => { if (monster) monster._lastSynergyId = null; }, 500);

        const eff = syn.effect || {};
        if (window.SkillLabMetrics) window.SkillLabMetrics.recordSynergy(syn.id);
        const atk = attacker && typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(attacker) : (attacker && attacker.baseAttack) || 10;
        const float = (text, color) => {
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(monster.x, monster.y - 28, text, color || '#ffdd44');
            }
        };

        float(syn.name + '!', '#ffdd44');

        if (attacker && typeof window.isWizardTreePlayer === 'function'
            && window.isWizardTreePlayer(attacker)
            && typeof window.triggerWizardResonance === 'function') {
            window.triggerWizardResonance(attacker, monster, syn.id, gameInstance);
        }

        switch (eff.type) {
            case 'true_damage': {
                let dmg = Math.floor(monster.maxHp * (eff.hpPercent || 0.03));
                const cap = Math.floor(atk * (eff.capAttackMult || 3));
                dmg = Math.min(dmg, cap);
                monster.takeDamage(dmg);
                break;
            }
            case 'stun': {
                if (typeof window.applyMonsterStun === 'function') {
                    window.applyMonsterStun(monster, eff.durationMs || 1500);
                }
                if (eff.damageBonusPercent) {
                    monster._synergyDamageBonus = {
                        mult: 1 + eff.damageBonusPercent / 100,
                        until: Date.now() + (eff.damageBonusDurationMs || 4000)
                    };
                }
                break;
            }
            case 'dot_amplify': {
                const st = monster.combatStatuses && monster.combatStatuses[eff.status];
                if (st) st.amplifyMult = eff.mult || 2;
                break;
            }
            case 'chain': {
                if (gameInstance && gameInstance.monsters) {
                    const others = gameInstance.monsters.filter(m =>
                        m !== monster && m.hp > 0 && Math.hypot(m.x - monster.x, m.y - monster.y) <= (eff.radius || 100)
                    ).slice(0, eff.chainCount || 2);
                    const chainDmg = Math.max(1, Math.floor(atk * (eff.damageRatio || 0.6)));
                    others.forEach(m => m.takeDamage(chainDmg));
                }
                break;
            }
            case 'attack_debuff': {
                monster._attackDebuffUntil = Date.now() + (eff.durationMs || 4000);
                monster._attackDebuffPercent = eff.attackReductionPercent || 25;
                break;
            }
            default:
                break;
        }

        (syn.consumeStatuses || []).forEach(t => window.removeCombatStatus(monster, t));
        if (syn.consumeAllStatuses) {
            active.forEach(t => {
                const def = statusDef(t);
                const explodeRatio = eff.explosionDamageRatio || 0.5;
                if (def && def.damagePerTickRatio) {
                    const dmg = Math.floor(atk * def.damagePerTickRatio * explodeRatio);
                    monster.takeDamage(dmg);
                }
                window.removeCombatStatus(monster, t);
            });
        }
    }

    function triggerBurnExpireFx(monster, gameInstance, inst) {
        if (!monster) return;
        const src = (inst && inst.sourceAttack) || 10;
        const dmg = Math.max(1, Math.floor(src * 0.2));
        monster.takeDamage(dmg);
        if (gameInstance && typeof gameInstance.addEquipmentEffect === 'function') {
            gameInstance.addEquipmentEffect('fire_explosion', monster.x, monster.y, {
                radius: 28, duration: 320, delayMs: 0
            });
        }
        if (gameInstance && gameInstance.particleManager
            && typeof gameInstance.particleManager.createSystem === 'function') {
            gameInstance.particleManager.createSystem(monster.x, monster.y, {
                color: '#ff6622', size: 2, count: 10, lifetime: 380,
                fadeoutTime: 240, speed: 2.2, speedVariation: 1.2,
                angleSpread: Math.PI * 2, spreadRadius: 8, pixelStyle: true
            });
        }
        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(monster.x, monster.y - 10, String(dmg), '#ff8844', 700, 14, true);
        }
        monster._burnTintUntil = 0;
        monster._burnStacksVisual = 0;
    }

    const DOT_FLOAT_COLORS = {
        burn: '#ff6622',
        poison: '#66ee55',
        corruption: '#cc66bb',
        bleed: '#ff5566',
        agony_curse: '#aa66ff'
    };

    function flashDotTick(inst) {
        if (inst) inst._tickFlashUntil = Date.now() + 380;
    }

    function dotFloatColor(type) {
        return DOT_FLOAT_COLORS[type] || '#ffaa66';
    }

    const DOT_FALLBACK_DEFS = {
        corruption: { name: '腐蚀', color: '#552266', stackable: false, durationMs: 6000 },
        burn: { name: '灼烧', color: '#ff6622', stackable: true, durationMs: 4000 },
        poison: { name: '中毒', color: '#55dd44', stackable: true, durationMs: 4000 },
        bleed: { name: '撕裂', color: '#cc3344', stackable: false, durationMs: 3000 }
    };

    function collectMonsterDotEntries(monster, now) {
        const entries = [];
        if (!monster) return entries;

        const ac = monster._agonyCurse;
        if (ac && ac.until > now && ac.stacks > 0) {
            const total = ac.durationMs || 8000;
            const left = ac.until - now;
            entries.push({
                id: 'agony_curse',
                label: '诅咒',
                stacks: ac.stacks,
                until: ac.until,
                totalMs: total,
                remainRatio: Math.max(0, Math.min(1, left / total)),
                color: '#8844cc',
                badge: '#aa66ff',
                tickFlash: ac._tickFlashUntil > now
            });
        }

        const st = monster.combatStatuses;
        if (!st) return entries;

        const dotTypes = ['corruption', 'burn', 'poison', 'bleed'];
        dotTypes.forEach(type => {
            const inst = st[type];
            if (!inst || inst.until <= now) return;
            const def = statusDef(type) || DOT_FALLBACK_DEFS[type];
            if (!def) return;
            const total = inst.durationMs || def.durationMs || 4000;
            const left = inst.until - now;
            const stackCount = (inst.stacks != null && inst.stacks > 0)
                ? inst.stacks
                : (def.stackable ? 1 : 0);
            entries.push({
                id: type,
                label: def.name || type,
                stacks: stackCount,
                until: inst.until,
                totalMs: total,
                remainRatio: Math.max(0, Math.min(1, left / total)),
                color: def.color || '#aaaaaa',
                badge: def.color || '#cccccc',
                tickFlash: inst._tickFlashUntil > now,
                hasTick: !!(def.tickIntervalMs && def.damagePerTickRatio)
            });
        });
        return entries;
    }

    window.getMonsterActiveDotEntries = collectMonsterDotEntries;

    /** 腐蚀视觉：紫黑雾气 + 滴落粒子 */
    window.drawMonsterCorruptionOverlay = function drawMonsterCorruptionOverlay(ctx, x, y, size, now, remainRatio, tickFlash) {
        if (!ctx) return;
        const t = now != null ? now : Date.now();
        const r = size / 2;
        const pulse = 1 + Math.sin(t / 200) * 0.08 + (tickFlash ? 0.12 : 0);
        const alpha = 0.28 + (remainRatio || 0.5) * 0.18 + (tickFlash ? 0.2 : 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r + 10 * pulse);
        g.addColorStop(0, 'rgba(85,34,102,0.55)');
        g.addColorStop(0.55, 'rgba(68,0,102,0.28)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r + 8 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.65 + (tickFlash ? 0.25 : 0);
        ctx.strokeStyle = tickFlash ? '#dd88ff' : '#663388';
        ctx.lineWidth = tickFlash ? 2.5 : 1.5;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(x, y, r + 4 * pulse, t / 500, t / 500 + Math.PI * 1.35);
        ctx.stroke();
        ctx.setLineDash([]);
        const dripN = 3 + Math.floor((remainRatio || 0.5) * 2);
        for (let i = 0; i < dripN; i++) {
            const ang = (t / 320 + i * (Math.PI * 2 / dripN)) % (Math.PI * 2);
            const dist = r * (0.55 + Math.sin(t / 140 + i * 2.1) * 0.12);
            const sx = x + Math.cos(ang) * dist;
            const sy = y + Math.sin(ang) * dist + Math.sin(t / 90 + i) * 3;
            ctx.globalAlpha = 0.5 + Math.sin(t / 70 + i) * 0.2;
            ctx.fillStyle = i % 2 ? '#442255' : '#8844aa';
            ctx.fillRect(sx - 1, sy - 3, 2, 5);
        }
        ctx.restore();
    };

    /** 中毒视觉：绿色毒雾气泡 + 层数显示 */
    window.drawMonsterPoisonOverlay = function drawMonsterPoisonOverlay(ctx, x, y, size, now, stacks, tickFlash) {
        if (!ctx) return;
        const t = now != null ? now : Date.now();
        const r = size / 2;
        const sc = stacks || 1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.2 + sc * 0.05 + (tickFlash ? 0.15 : 0);
        ctx.fillStyle = '#44cc44';
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.fill();
        const bubbleN = 2 + Math.min(sc, 8);
        for (let i = 0; i < bubbleN; i++) {
            const ang = (t / 260 + i * 1.4) % (Math.PI * 2);
            const bx = x + Math.cos(ang) * (r * 0.5);
            const by = y + Math.sin(ang) * (r * 0.5) - Math.abs(Math.sin(t / 100 + i)) * 5;
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#88ff88';
            ctx.beginPath();
            ctx.arc(bx, by, 2 + (i % 2), 0, Math.PI * 2);
            ctx.fill();
        }
        // 层数标记：绿色数字显示在怪物头顶
        if (sc >= 1) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.92;
            var fontSize = sc >= 10 ? 12 : (sc >= 5 ? 11 : 10);
            ctx.font = 'bold ' + fontSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // 绿色发光效果
            ctx.shadowColor = sc >= 5 ? '#33ff33' : '#55cc55';
            ctx.shadowBlur = 4;
            ctx.fillStyle = sc >= 10 ? '#ffff44' : (sc >= 5 ? '#88ff44' : '#44dd44');
            ctx.fillText('\u00D7' + sc, x, y - r - 6);
            ctx.shadowBlur = 0;
        }
        ctx.restore();
    };

    /** 撕裂视觉：红色裂痕 */
    window.drawMonsterBleedOverlay = function drawMonsterBleedOverlay(ctx, x, y, size, now, tickFlash) {
        if (!ctx) return;
        const t = now != null ? now : Date.now();
        const r = size / 2;
        ctx.save();
        ctx.globalAlpha = 0.55 + (tickFlash ? 0.3 : 0);
        ctx.strokeStyle = '#cc3344';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const ang = -0.6 + i * 0.6 + Math.sin(t / 180 + i) * 0.1;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(ang) * r * 0.2, y + Math.sin(ang) * r * 0.2);
            ctx.lineTo(x + Math.cos(ang) * r * 0.85, y + Math.sin(ang) * r * 0.85);
            ctx.stroke();
        }
        ctx.restore();
    };

    /** 怪物头顶 DOT 状态条：图标 + 层数 + 剩余时间 */
    window.drawMonsterDotStatusHud = function drawMonsterDotStatusHud(ctx, monster, now) {
        if (!ctx || !monster) return;
        const t = now != null ? now : Date.now();
        const entries = collectMonsterDotEntries(monster, t);
        if (!entries.length) return;

        const x = monster.x;
        const size = monster.size || 32;
        const baseY = monster.y - size / 2 - 34;
        const pillH = 14;
        const gap = 4;
        // 毒药高叠层时自动加宽标签
        entries.forEach(function(e) {
            e._labelW = 40;
            if (e.id === 'poison' && e.stacks >= 10) e._labelW = 46;
            if (e.id === 'poison' && e.stacks >= 100) e._labelW = 52;
        });
        const totalW = entries.reduce(function(s, e) { return s + (e._labelW || 40) + gap; }, -gap);
        let startX = x - totalW / 2;

        ctx.save();
        entries.forEach((entry, idx) => {
            const pillW = entry._labelW || 40;
            const px = startX + entries.slice(0, idx).reduce(function(s, e) { return s + (e._labelW || 40) + gap; }, 0);
            const py = baseY;
            const flash = entry.tickFlash;

            ctx.globalAlpha = 0.92;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(px, py, pillW, pillH);
            ctx.fillStyle = flash ? entry.badge : entry.color;
            ctx.globalAlpha = flash ? 1 : 0.85;
            ctx.fillRect(px, py, pillW, 3);

            let label;
            if (entry.id === 'agony_curse') {
                label = '诅×' + entry.stacks;
            } else if (entry.id === 'poison') {
                label = '毒×' + (entry.stacks || 1);
            } else if (entry.id === 'burn') {
                label = entry.stacks > 1 ? ('燃×' + entry.stacks) : '灼烧';
            } else if (entry.id === 'corruption') {
                label = '腐蚀';
            } else if (entry.id === 'bleed') {
                label = '撕裂';
            } else if (entry.stacks > 1) {
                label = entry.label.slice(0, 1) + '×' + entry.stacks;
            } else {
                label = entry.label.length <= 2 ? entry.label : entry.label.slice(0, 2);
            }

            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#110011';
            ctx.strokeText(label, px + pillW / 2, py + pillH / 2 + 1);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, px + pillW / 2, py + pillH / 2 + 1);

            const barW = pillW - 4;
            const barX = px + 2;
            const barY = py + pillH - 3;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(barX, barY, barW, 2);
            ctx.fillStyle = entry.color;
            ctx.fillRect(barX, barY, barW * entry.remainRatio, 2);
        });

        const hasCorr = entries.some(e => e.id === 'corruption');
        const hasPoison = entries.some(e => e.id === 'poison');
        const hasBleed = entries.some(e => e.id === 'bleed');
        const corr = entries.find(e => e.id === 'corruption');
        const poison = entries.find(e => e.id === 'poison');
        const bleed = entries.find(e => e.id === 'bleed');

        if (hasCorr && typeof window.drawMonsterCorruptionOverlay === 'function') {
            window.drawMonsterCorruptionOverlay(
                ctx, x, monster.y, size, t,
                corr.remainRatio, corr.tickFlash
            );
        }
        if (hasPoison && typeof window.drawMonsterPoisonOverlay === 'function') {
            window.drawMonsterPoisonOverlay(ctx, x, monster.y, size, t, poison.stacks, poison.tickFlash);
        }
        if (hasBleed && typeof window.drawMonsterBleedOverlay === 'function') {
            window.drawMonsterBleedOverlay(ctx, x, monster.y, size, t, bleed.tickFlash);
        }

        ctx.restore();
    };

    window.getMonsterBurnVisualState = function getMonsterBurnVisualState(monster, now) {
        if (!monster || !monster.combatStatuses) return null;
        const t = now != null ? now : Date.now();
        const burn = monster.combatStatuses.burn;
        if (!burn || burn.until <= t) return null;
        return { stacks: burn.stacks || 1, until: burn.until };
    };

    /** 灼烧视觉：橙染 + 火花粒子 */
    window.drawMonsterBurnOverlay = function drawMonsterBurnOverlay(ctx, x, y, size, now, stacks) {
        if (!ctx) return;
        const t = now != null ? now : Date.now();
        const r = size / 2;
        const sc = stacks || 1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.22 + sc * 0.06;
        ctx.fillStyle = '#ff6622';
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.fill();
        const sparkN = 2 + sc * 2;
        for (let i = 0; i < sparkN; i++) {
            const ang = (t / 180 + i * (Math.PI * 2 / sparkN)) % (Math.PI * 2);
            const dist = r * (0.45 + Math.sin(t / 120 + i * 1.7) * 0.15);
            const sx = x + Math.cos(ang) * dist;
            const sy = y + Math.sin(ang) * dist - Math.abs(Math.sin(t / 90 + i)) * 6;
            ctx.globalAlpha = 0.55 + Math.sin(t / 80 + i) * 0.25;
            ctx.fillStyle = i % 2 ? '#ffcc66' : '#ff4400';
            ctx.fillRect(sx - 1.5, sy - 2, 3, 4);
        }
        ctx.restore();
    };

    window.tickMonsterCombatStatuses = function tickMonsterCombatStatuses(monster, gameInstance) {
        if (!monster || !monster.combatStatuses || monster.hp <= 0) return;
        const now = Date.now();
        const st = monster.combatStatuses;

        Object.keys(st).forEach(type => {
            const inst = st[type];
            if (!inst || inst.until <= now) {
                if (type === 'burn' && inst) {
                    triggerBurnExpireFx(monster, gameInstance, inst);
                }
                delete st[type];
                return;
            }
            const def = statusDef(type);
            if (!def || !def.tickIntervalMs || !def.damagePerTickRatio) return;
            let tickInterval = def.tickIntervalMs;
            if (type === 'corruption' && inst.owner
                && typeof window.isLifeDraining === 'function'
                && window.isLifeDraining(inst.owner)) {
                tickInterval = Math.max(250, Math.floor(tickInterval / 2));
            }
            if (now - (inst.lastTick || 0) < tickInterval) return;
            inst.lastTick = now;
            let ratio = def.damagePerTickRatio;
            if (inst.amplifyMult) ratio *= inst.amplifyMult;
            if (inst.stacks) ratio *= inst.stacks;
            const src = inst.sourceAttack || 10;
            let dmg = Math.floor(src * ratio);
            if (type === 'burn' && inst.owner && typeof window.getElementalMasteryBonuses === 'function') {
                const mb = window.getElementalMasteryBonuses(inst.owner);
                if (mb && mb.burnTickMult > 1) dmg = Math.floor(dmg * mb.burnTickMult);
            }
            if (type === 'shock' && gameInstance) {
                /* 感电：受击溅射在 takeDamage 时处理 */
            }
            monster._pendingDamageSource = 'dot';
            monster.takeDamage(dmg);
            flashDotTick(inst);
            // 毒理学被动：敌人死于中毒时，30%剩余毒伤转为吸血
            if (type === 'poison' && monster.hp <= 0 && inst.owner
                && typeof window.onToxicologyPoisonDeath === 'function') {
                window.onToxicologyPoisonDeath(inst.owner, monster, gameInstance);
            }
            if (gameInstance && typeof gameInstance.addFloatingText === 'function' && dmg > 0) {
                const col = dotFloatColor(type);
                const prefix = type === 'corruption' ? '腐' : type === 'poison' ? '毒'
                    : type === 'bleed' ? '裂' : type === 'burn' ? '' : '';
                const text = prefix ? (prefix + dmg) : String(dmg);
                gameInstance.addFloatingText(
                    monster.x, monster.y - 14, text, col, 620, 13, true
                );
            }
            // 毒师催化剂：中毒每跳+1催化剂
            if (type === 'poison' && inst.owner && typeof window.onAssassinPoisonTick === 'function') {
                window.onAssassinPoisonTick(inst.owner, monster, gameInstance);
            }
        });

        if (monster._synergyDamageBonus && now >= monster._synergyDamageBonus.until) {
            monster._synergyDamageBonus = null;
        }
        if (monster._darkErosionUntil && now >= monster._darkErosionUntil) {
            monster._darkErosionUntil = 0;
            monster._darkErosionDefReduction = 0;
        }
        if (monster._attackDebuffUntil && now >= monster._attackDebuffUntil) {
            monster._attackDebuffUntil = 0;
            monster._attackDebuffPercent = 0;
        }
    };

    window.getCombatStatusDamageMultiplier = function getCombatStatusDamageMultiplier(monster) {
        if (!monster) return 1;
        let mult = 1;
        if (monster._synergyDamageBonus && monster._synergyDamageBonus.until > Date.now()) {
            const synMult = monster._synergyDamageBonus.mult;
            if (typeof synMult === 'number' && Number.isFinite(synMult)) {
                mult *= synMult;
            }
        }
        if (typeof window.getMonsterSkillDebuffDamageMultiplier === 'function') {
            mult *= window.getMonsterSkillDebuffDamageMultiplier(monster);
        }
        if (monster._breakVulnerable && monster._breakVulnerable.until > Date.now()) {
            mult *= 1 + (monster._breakVulnerable.bonusPercent || 30) / 100;
        }
        if (typeof window.getDestroyMarkDamageMultiplier === 'function') {
            mult *= window.getDestroyMarkDamageMultiplier(monster);
        }
        return mult;
    };

    window.getCombatStatusDefenseReduction = function getCombatStatusDefenseReduction(monster) {
        if (!monster || !monster._darkErosionUntil) return 0;
        if (Date.now() >= monster._darkErosionUntil) return 0;
        return monster._darkErosionDefReduction || 0;
    };

    /** 眩晕（与冰冻独立：禁止移动/攻击，黄色星圈视觉） */
    window.applyMonsterStun = function applyMonsterStun(monster, ms, now) {
        if (!monster || ms <= 0) return;
        const t = now != null ? now : Date.now();
        const until = t + ms;
        monster.stunUntil = Math.max(monster.stunUntil || 0, until);
        if (monster.statusEffects) {
            monster.statusEffects.stunned = { until };
        }
    };

    window.isMonsterStunned = function isMonsterStunned(monster, now) {
        if (!monster || !monster.stunUntil) return false;
        const t = now != null ? now : Date.now();
        return t < monster.stunUntil;
    };

    function floatDebuffText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#88ccff');
        }
    }

    function syncMonsterSlowVisual(monster, mult, until) {
        if (!monster || !until) return;
        if (monster.statusEffects) {
            if (!monster.statusEffects.slowed || monster.statusEffects.slowed.until < until) {
                monster.statusEffects.slowed = { until, multiplier: mult };
            }
        }
    }

    /** 按百分比减速（30 表示减速 30%，移速倍率 0.7） */
    window.applyMonsterSlowPercent = function applyMonsterSlowPercent(monster, percent, durationMs, now) {
        if (!monster || percent == null || percent <= 0 || !durationMs) return;
        const t = now != null ? now : Date.now();
        const mult = 1 - Math.min(90, Math.max(0, percent)) / 100;
        const until = t + durationMs;
        if (!monster.slowEffects) monster.slowEffects = [];
        monster.slowEffects.push({ multiplier: mult, expireTime: until });
        syncMonsterSlowVisual(monster, mult, until);
    };

    /** 按移速倍率减速（0.5 表示移速减半） */
    window.applyMonsterSlowMult = function applyMonsterSlowMult(monster, mult, durationMs, now) {
        if (!monster || mult == null || mult <= 0 || mult >= 1 || !durationMs) return;
        const t = now != null ? now : Date.now();
        const until = t + durationMs;
        if (!monster.slowEffects) monster.slowEffects = [];
        monster.slowEffects.push({ multiplier: mult, expireTime: until });
        syncMonsterSlowVisual(monster, mult, until);
    };

    window.getMonsterActiveSlowState = function getMonsterActiveSlowState(monster, now) {
        if (!monster) return null;
        const t = now != null ? now : Date.now();
        let until = 0;
        let mult = 1;
        if (monster.slowEffects && monster.slowEffects.length) {
            monster.slowEffects = monster.slowEffects.filter(e => e.expireTime > t);
            if (monster.slowEffects.length) {
                mult = Math.min(...monster.slowEffects.map(e => e.multiplier));
                until = Math.max(...monster.slowEffects.map(e => e.expireTime));
            }
        }
        if (monster.statusEffects && monster.statusEffects.slowed && monster.statusEffects.slowed.until > t) {
            mult = Math.min(mult, monster.statusEffects.slowed.multiplier);
            until = Math.max(until, monster.statusEffects.slowed.until);
        }
        return until > t ? { multiplier: mult, until } : null;
    };

    window.getMonsterActiveVulnerableState = function getMonsterActiveVulnerableState(monster, now) {
        if (!monster) return null;
        const t = now != null ? now : Date.now();
        if (monster._skillDamageTakenDebuff && monster._skillDamageTakenDebuff.until > t) {
            return {
                mult: monster._skillDamageTakenDebuff.mult,
                until: monster._skillDamageTakenDebuff.until
            };
        }
        if (monster.vulnerableUntil > t) {
            return {
                mult: monster.vulnerableDamageTakenMult || 1.15,
                until: monster.vulnerableUntil
            };
        }
        if (monster.statusEffects && monster.statusEffects.vulnerable && monster.statusEffects.vulnerable.until > t) {
            return monster.statusEffects.vulnerable;
        }
        return null;
    };

    window.applyMonsterFreeze = function applyMonsterFreeze(monster, ms, now) {
        if (!monster || ms <= 0) return;
        const t = now != null ? now : Date.now();
        monster.frozenUntil = Math.max(monster.frozenUntil || 0, t + ms);
        if (monster.addStatusEffect) {
            monster.addStatusEffect('frozen', { duration: ms });
        }
        if (monster.statusEffects) {
            monster.statusEffects.frozen = { until: t + ms };
        }
    };

    /** 易伤：承受伤害增加（15 表示 +15% 受伤害） */
    window.applyMonsterDamageTakenDebuff = function applyMonsterDamageTakenDebuff(monster, percent, durationMs, now) {
        if (!monster || !percent || percent <= 0 || !durationMs) return;
        const t = now != null ? now : Date.now();
        const until = t + durationMs;
        const mult = 1 + percent / 100;
        if (!monster._skillDamageTakenDebuff || monster._skillDamageTakenDebuff.until < t) {
            monster._skillDamageTakenDebuff = { mult, until };
        } else {
            monster._skillDamageTakenDebuff.mult = Math.max(monster._skillDamageTakenDebuff.mult, mult);
            monster._skillDamageTakenDebuff.until = Math.max(monster._skillDamageTakenDebuff.until, until);
        }
        if (monster.statusEffects) {
            if (!monster.statusEffects.vulnerable || monster.statusEffects.vulnerable.until < until) {
                monster.statusEffects.vulnerable = { mult, until, percent };
            }
        }
    };

    window.getMonsterSkillDebuffDamageMultiplier = function getMonsterSkillDebuffDamageMultiplier(monster, now) {
        if (!monster || !monster._skillDamageTakenDebuff) return 1;
        const t = now != null ? now : Date.now();
        if (t >= monster._skillDamageTakenDebuff.until) {
            monster._skillDamageTakenDebuff = null;
            return 1;
        }
        return monster._skillDamageTakenDebuff.mult || 1;
    };

    /**
     * 统一应用 entityConfig / onTrigger 中的 CC 与 debuff
     * 兼容 debuffSlowPercent、enemySlowPercent、slowPercent、slowMult、freezeMs、stunMs、fearMs、debuffDmgTakenPercent
     */
    window.applyMonsterSkillDebuffs = function applyMonsterSkillDebuffs(monster, config, gameInstance, now, opts) {
        if (!monster || !config) return;
        const t = now != null ? now : Date.now();
        const o = opts || {};
        const showText = o.showText !== false;

        const slowPct = config.debuffSlowPercent != null ? config.debuffSlowPercent
            : (config.enemySlowPercent != null ? config.enemySlowPercent : config.slowPercent);
        const slowMs = config.debuffDurationMs || config.enemySlowMs || config.slowDurationMs || config.slowMs;
        if (slowPct != null && slowMs) {
            window.applyMonsterSlowPercent(monster, slowPct, slowMs, t);
            if (showText) floatDebuffText(gameInstance, monster.x, monster.y - 12, '减速', '#88ccff');
        }
        if (config.slowMult != null && config.slowMult < 1 && slowMs) {
            window.applyMonsterSlowMult(monster, config.slowMult, slowMs, t);
            if (showText && slowPct == null) floatDebuffText(gameInstance, monster.x, monster.y - 12, '减速', '#88ccff');
        }

        const dmgTakenPct = config.debuffDmgTakenPercent;
        const vulnMs = config.debuffDurationMs || slowMs;
        if (dmgTakenPct && vulnMs) {
            window.applyMonsterDamageTakenDebuff(monster, dmgTakenPct, vulnMs, t);
            if (showText) floatDebuffText(gameInstance, monster.x, monster.y - 24, '易伤', '#ffaa66');
        }

        const freezeMs = config.freezeMs || o.freezeMs;
        if (freezeMs) {
            window.applyMonsterFreeze(monster, freezeMs, t);
            if (showText) floatDebuffText(gameInstance, monster.x, monster.y - 12, '冰冻', '#88ddff');
        }

        const stunMs = config.stunMs || config.confuseMs || config.fearMs || o.stunMs;
        if (stunMs > 0) {
            window.applyMonsterStun(monster, stunMs, t);
            if (showText && config.fearMs) floatDebuffText(gameInstance, monster.x, monster.y - 12, '恐惧', '#cc88ff');
            else if (showText && config.stunMs) floatDebuffText(gameInstance, monster.x, monster.y - 12, '眩晕', '#ffff88');
        }

        if (config.tauntDurationMs && o.tauntTarget) {
            monster._tauntTarget = o.tauntTarget;
            monster._tauntUntil = t + config.tauntDurationMs;
        }

        const kb = config.knockback;
        if (kb > 0) {
            const src = o.tauntTarget || o.source;
            const sx = o.sourceX != null ? o.sourceX : (src && src.x != null ? src.x : monster.x);
            const sy = o.sourceY != null ? o.sourceY : (src && src.y != null ? src.y : monster.y);
            window.applyEnemyKnockback(monster, sx, sy, kb, config.knockbackAngle);
        }
    };

    /** 技能配置的击退（默认关闭；仅 entityConfig.knockback > 0 时生效） */
    window.applyEnemyKnockback = function applyEnemyKnockback(monster, sourceX, sourceY, force, angle) {
        if (!monster || !(force > 0)) return;
        let dx;
        let dy;
        if (angle != null && Number.isFinite(angle)) {
            dx = Math.cos(angle);
            dy = Math.sin(angle);
        } else {
            dx = monster.x - sourceX;
            dy = monster.y - sourceY;
        }
        const dist = Math.hypot(dx, dy) || 1;
        monster.x += (dx / dist) * force;
        monster.y += (dy / dist) * force;
    };

    /** 怪物身上减速视觉：蓝色虚线圈 + 向下箭头 */
    window.drawMonsterSlowOverlay = function drawMonsterSlowOverlay(ctx, x, y, size, now) {
        if (!ctx) return;
        const t = now != null ? now : Date.now();
        const r = size / 2 + 6;
        const pulse = 1 + Math.sin(t / 220) * 0.07;
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.strokeStyle = '#55aaff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#88ccff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) {
            const ang = -Math.PI / 2 + (i - 1) * 0.42;
            ctx.fillText('↓', x + Math.cos(ang) * (r + 5), y + Math.sin(ang) * (r + 5));
        }
        ctx.restore();
    };

    /** 怪物身上易伤视觉：橙色双环 + 感叹号 */
    window.drawMonsterVulnerableOverlay = function drawMonsterVulnerableOverlay(ctx, x, y, size, now) {
        if (!ctx) return;
        const t = now != null ? now : Date.now();
        const r = size / 2 + 9;
        const pulse = 1 + Math.sin(t / 150) * 0.1;
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = '#ff9933';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ff6622';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(x, y, (r - 3) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffcc66';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x, y - size / 2 - 6);
        ctx.restore();
    };

    /** 眩晕视觉：黄色星圈 */
    window.drawMonsterStunOverlay = function drawMonsterStunOverlay(ctx, x, y, size, now) {
        if (!ctx) return;
        const t = now != null ? now : Date.now();
        const r = size / 2 + 7;
        const pulse = 1 + Math.sin(t / 160) * 0.1;
        ctx.save();
        ctx.globalAlpha = 0.88;
        ctx.strokeStyle = '#ffee44';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffff88';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 4; i++) {
            const ang = (t / 400) + (i * Math.PI) / 2;
            ctx.fillText('★', x + Math.cos(ang) * (r + 4), y + Math.sin(ang) * (r + 4));
        }
        ctx.restore();
    };

    /** 怪物身上全部战斗 overlay（标记 / DOT / CC） */
    /** 毒理学被动：敌人死于中毒时，剩余中毒伤害30%转化为玩家生命 */
    window.onToxicologyPoisonDeath = function onToxicologyPoisonDeath(owner, monster, gameInstance) {
        if (!owner || !monster) return;
        var passive = typeof window.getClassPassiveId === 'function'
            ? window.getClassPassiveId(owner) : null;
        if (passive !== 'toxicology') return;
        if (!monster.combatStatuses || !monster.combatStatuses.poison) return;
        var inst = monster.combatStatuses.poison;
        var def = statusDef('poison');
        if (!def || !def.tickIntervalMs || !def.damagePerTickRatio) return;
        var remainMs = inst.until - Date.now();
        if (remainMs <= 0) return;
        var remainTicks = Math.max(1, Math.ceil(remainMs / def.tickIntervalMs));
        var ratio = def.damagePerTickRatio;
        if (inst.amplifyMult) ratio *= inst.amplifyMult;
        var src = inst.sourceAttack || 10;
        var totalRemainDmg = remainTicks * Math.max(1, Math.floor(src * ratio));
        var leech = Math.max(1, Math.floor(totalRemainDmg * 0.3));
        owner.hp = Math.min(owner.maxHp, owner.hp + leech);
        if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
            gameInstance.addFloatingText(owner.x, owner.y - 30, '+' + leech + ' 毒血', '#44ff44', 700, 13);
        }
    };

    window.drawMonsterCombatOverlays = function drawMonsterCombatOverlays(ctx, monster, now) {
        if (!ctx || !monster || monster.hp <= 0) return;
        const t = now != null ? now : Date.now();
        const x = monster.x;
        const y = monster.y;
        const size = monster.size || 32;

        if (typeof window.drawDestroyMarkOverlay === 'function') {
            window.drawDestroyMarkOverlay(ctx, monster, t);
        }
        if (typeof window.drawAgonyCurseOverlay === 'function') {
            window.drawAgonyCurseOverlay(ctx, monster, t);
        }
        if (typeof window.getMonsterBurnVisualState === 'function') {
            const burn = window.getMonsterBurnVisualState(monster, t);
            if (burn && typeof window.drawMonsterBurnOverlay === 'function') {
                window.drawMonsterBurnOverlay(ctx, x, y, size, t, burn.stacks);
            }
        }
        if (typeof window.drawMonsterDotStatusHud === 'function') {
            window.drawMonsterDotStatusHud(ctx, monster, t);
        }
        if (typeof window.getMonsterActiveSlowState === 'function') {
            const slow = window.getMonsterActiveSlowState(monster, t);
            if (slow && typeof window.drawMonsterSlowOverlay === 'function') {
                window.drawMonsterSlowOverlay(ctx, x, y, size, t);
            }
        }
        if (typeof window.getMonsterActiveVulnerableState === 'function') {
            const vuln = window.getMonsterActiveVulnerableState(monster, t);
            if (vuln && typeof window.drawMonsterVulnerableOverlay === 'function') {
                window.drawMonsterVulnerableOverlay(ctx, x, y, size, t);
            }
        }
        if (typeof window.isMonsterStunned === 'function'
            && window.isMonsterStunned(monster, t)
            && typeof window.drawMonsterStunOverlay === 'function') {
            window.drawMonsterStunOverlay(ctx, x, y, size, t);
        }
        if (typeof window.drawClassSkillMarkOverlay === 'function') {
            window.drawClassSkillMarkOverlay(ctx, monster, t);
        }
    };

})();
