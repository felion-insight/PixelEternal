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
            window.applyCombatStatus(monster, e.type, { durationMs: e.durationMs, stacks: e.stacks }, attacker, gameInstance);
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
                monster.frozenUntil = Math.max(monster.frozenUntil || 0, Date.now() + (eff.durationMs || 1500));
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
            mult *= monster._synergyDamageBonus.mult;
        }
        if (monster._breakVulnerable && monster._breakVulnerable.until > Date.now()) {
            mult *= 1 + (monster._breakVulnerable.bonusPercent || 30) / 100;
        }
        return mult;
    };

    window.getCombatStatusDefenseReduction = function getCombatStatusDefenseReduction(monster) {
        if (!monster || !monster._darkErosionUntil) return 0;
        if (Date.now() >= monster._darkErosionUntil) return 0;
        return monster._darkErosionDefReduction || 0;
    };

})();
