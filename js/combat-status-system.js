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
            const maxStacks = def.maxStacks || 5;
            cur.stacks = Math.min(maxStacks, (cur.stacks || 0) + stacks);
            cur.until = now + durationMs;
            cur.lastTick = cur.lastTick || now;
            cur.sourceAttack = attacker && typeof window.getPlayerEffectiveAttack === 'function'
                ? window.getPlayerEffectiveAttack(attacker) : (attacker && attacker.baseAttack) || 10;
            st[type] = cur;
        } else {
            st[type] = {
                until: now + durationMs,
                lastTick: now,
                sourceAttack: attacker && typeof window.getPlayerEffectiveAttack === 'function'
                    ? window.getPlayerEffectiveAttack(attacker) : (attacker && attacker.baseAttack) || 10
            };
        }

        if (type === 'frostbite') {
            if (!monster.slowEffects) monster.slowEffects = [];
            monster.slowEffects.push({
                multiplier: (def && def.moveSpeedMult) || 0.7,
                expireTime: now + durationMs
            });
            if (!monster.combatStatuses.attackSpeedDebuff) {
                monster.combatStatuses.attackSpeedDebuff = { until: now + durationMs, mult: (def && def.attackSpeedMult) || 0.8 };
            } else {
                monster.combatStatuses.attackSpeedDebuff.until = Math.max(monster.combatStatuses.attackSpeedDebuff.until, now + durationMs);
            }
        }

        if (type === 'dark_erosion') {
            monster._darkErosionUntil = Math.max(monster._darkErosionUntil || 0, now + durationMs);
            monster._darkErosionDefReduction = (def && def.defenseReductionPercent) || 20;
        }

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
        const atk = attacker && typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(attacker) : (attacker && attacker.baseAttack) || 10;
        const float = (text, color) => {
            if (gameInstance && typeof gameInstance.addFloatingText === 'function') {
                gameInstance.addFloatingText(monster.x, monster.y - 28, text, color || '#ffdd44');
            }
        };

        float(syn.name + '!', '#ffdd44');

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

    window.tickMonsterCombatStatuses = function tickMonsterCombatStatuses(monster, gameInstance) {
        if (!monster || !monster.combatStatuses || monster.hp <= 0) return;
        const now = Date.now();
        const st = monster.combatStatuses;

        Object.keys(st).forEach(type => {
            const inst = st[type];
            if (!inst || inst.until <= now) {
                delete st[type];
                return;
            }
            const def = statusDef(type);
            if (!def || !def.tickIntervalMs || !def.damagePerTickRatio) return;
            if (now - (inst.lastTick || 0) < def.tickIntervalMs) return;
            inst.lastTick = now;
            let ratio = def.damagePerTickRatio;
            if (inst.amplifyMult) ratio *= inst.amplifyMult;
            if (inst.stacks) ratio *= inst.stacks;
            const src = inst.sourceAttack || 10;
            let dmg = Math.floor(src * ratio);
            if (type === 'shock' && gameInstance) {
                /* 感电：受击溅射在 takeDamage 时处理 */
            }
            monster.takeDamage(dmg);
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

})();
