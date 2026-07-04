/**
 * Pixel Eternal - 职业技能特殊效果（防御/治疗/位移/控制等）
 */
(function () {
    'use strict';

    function cfgEnhBonus(player, skillDef) {
        const lv = window.getSkillEnhanceLevel ? window.getSkillEnhanceLevel(player, skillDef.id) : 0;
        return 1 + lv * 0.04;
    }

    function floatText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#88ccff');
        }
    }

    function equipFx(g, id, x, y, opts) {
        if (g && typeof g.addEquipmentEffect === 'function') {
            g.addEquipmentEffect(id, x, y, opts || {});
        }
    }

    function clampPos(player, gameInstance, x, y) {
        const room = gameInstance && gameInstance.currentRoom;
        if (!room) return { x, y };
        const pad = 40;
        const minX = (room.x || 0) + pad;
        const minY = (room.y || 0) + pad;
        const maxX = (room.x || 0) + (room.width || 800) - pad;
        const maxY = (room.y || 0) + (room.height || 600) - pad;
        return {
            x: Math.max(minX, Math.min(maxX, x)),
            y: Math.max(minY, Math.min(maxY, y))
        };
    }

    function blinkTo(player, gameInstance, tx, ty, invMs) {
        const p = clampPos(player, gameInstance, tx, ty);
        player.x = p.x;
        player.y = p.y;
        player.invincibleUntil = Math.max(player.invincibleUntil || 0, Date.now() + (invMs || 280));
    }

    function inferBuffIconKey(buff) {
        if (buff.iconKey) return buff.iconKey;
        const e = buff.effects || {};
        if (buff.shieldRemaining > 0 || (buff.shieldMax && buff.shieldMax > 0)) return 'divineProtection';
        if (e.damageReduction) return 'defense';
        if (e.attackPercent || e.attack) return 'attack';
        if (e.attackSpeedPercent || e.attackSpeed) return 'attackSpeed';
        if (e.dodge) return 'dodge';
        if (e.moveSpeed) return 'moveSpeed';
        if (buff.stealth) return 'dodge';
        if (buff.onMeleeHitSlow) return 'freezeEffect';
        return 'duration';
    }

    function inferBuffHudCategory(iconKey) {
        if (['attack', 'attackSpeed', 'damageMultiplier'].includes(iconKey)) return 'attack';
        if (['defense', 'divineProtection', 'damageImmunity'].includes(iconKey)) return 'defense';
        if (['dodge', 'moveSpeed', 'move_speed'].includes(iconKey)) return 'utility';
        return 'buff';
    }

    function shouldShowBuffInHud(buff) {
        if (buff.hudVisible === false) return false;
        if (buff.hudVisible) return true;
        const id = buff.id || '';
        return id.startsWith('skill_') || id.startsWith('summon_bonus_') || id === 'ice_armor';
    }

    function pushBuff(player, buff) {
        player.buffs = player.buffs || [];
        if (buff.id) {
            player.buffs = player.buffs.filter(b => b.id !== buff.id);
        }
        buff.iconKey = inferBuffIconKey(buff);
        buff.hudCategory = inferBuffHudCategory(buff.iconKey);
        if (buff.hudVisible == null) {
            buff.hudVisible = shouldShowBuffInHud(buff);
        }
        player.buffs.push(buff);
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    window.collectPlayerHudStatusBuffs = function collectPlayerHudStatusBuffs(player, now) {
        now = now || Date.now();
        return (player && player.buffs ? player.buffs : [])
            .filter(b => shouldShowBuffInHud(b) && b.expireTime > now && (b.name || b.id))
            .sort((a, b) => a.expireTime - b.expireTime);
    };

    window.formatStatusBuffEffectSummary = function formatStatusBuffEffectSummary(buff) {
        const e = buff.effects || {};
        const parts = [];
        if (e.attackPercent) parts.push(`攻击 +${e.attackPercent}%`);
        if (e.attack) parts.push(`攻击 +${e.attack}`);
        if (e.damageReduction) parts.push(`减伤 ${e.damageReduction}%`);
        if (e.defensePenalty) parts.push(`防御 -${e.defensePenalty}%`);
        if (e.attackSpeedPercent) parts.push(`攻速 +${e.attackSpeedPercent}%`);
        if (e.attackSpeed) parts.push(`攻速 +${e.attackSpeed}`);
        if (e.dodge) parts.push(`闪避 +${e.dodge}%`);
        if (e.moveSpeed) parts.push(`移速 +${e.moveSpeed}%`);
        if (buff.shieldRemaining > 0) {
            parts.push(`护盾 ${Math.ceil(buff.shieldRemaining)}${buff.shieldMax ? '/' + buff.shieldMax : ''}`);
        }
        if (buff.stealth) parts.push('隐身');
        if (buff.onMeleeHitSlow) parts.push('近战反击减速');
        return parts.join(' · ');
    };

    window.getStatusBuffIconUrl = function getStatusBuffIconUrl(game, buff) {
        if (!game || !buff) return null;
        if (buff.name && typeof game.getSkillIconUrl === 'function') {
            const skillUrl = game.getSkillIconUrl(buff.name);
            if (skillUrl) return skillUrl;
        }
        if (buff.iconKey && typeof game.getBuffIconUrl === 'function') {
            return game.getBuffIconUrl(buff.iconKey);
        }
        return null;
    };

    function nearestEnemy(player, monsters, range) {
        let best = null;
        let bestD = Infinity;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const d = Math.hypot(m.x - player.x, m.y - player.y);
            if (d <= range && d < bestD) { bestD = d; best = m; }
        });
        return best;
    }

    function applySlow(monster, mult, ms) {
        if (!monster) return;
        const now = Date.now();
        if (!monster.slowEffects) monster.slowEffects = [];
        monster.slowEffects.push({ multiplier: mult, expireTime: now + ms });
    }

    function applyFreeze(monster, ms) {
        if (!monster) return;
        monster.frozenUntil = Math.max(monster.frozenUntil || 0, Date.now() + ms);
    }

    function applyStun(monster, ms) {
        applyFreeze(monster, ms);
    }

    function applyMark(monster, se, skillDef, now) {
        if (!monster) return;
        monster._classSkillMark = {
            expireTime: now + (se.durationMs || 8000),
            damageBonus: se.damageBonus || 15,
            critBonus: se.critBonus || 0,
            name: skillDef.name
        };
    }

    function applyPoisonDot(player, monster, dps, durationMs, gameInstance) {
        if (!player || !monster || dps <= 0) return;
        player.weaponSkillDots = player.weaponSkillDots || [];
        const now = Date.now();
        const existing = player.weaponSkillDots.find(d => d.monster === monster && d.source === 'class_skill');
        if (existing) {
            existing.damagePerSecond = Math.max(existing.damagePerSecond, dps);
            existing.duration = durationMs;
            existing.startTime = now;
            existing.lastTick = now;
        } else {
            player.weaponSkillDots.push({
                monster,
                damagePerSecond: dps,
                duration: durationMs,
                startTime: now,
                lastTick: now,
                source: 'class_skill'
            });
        }
        floatText(gameInstance, monster.x, monster.y - 12, '中毒', '#55dd44');
    }

    window.isPrimaryUtilitySkill = function isPrimaryUtilitySkill(skillDef) {
        return !!(skillDef && skillDef.skillEffect && skillDef.skillEffect.mode === 'primary');
    };

    window.isHybridUtilitySkill = function isHybridUtilitySkill(skillDef) {
        return !!(skillDef && skillDef.skillEffect && skillDef.skillEffect.mode === 'hybrid');
    };

    window.getClassSkillMarkBonus = function getClassSkillMarkBonus(monster) {
        if (!monster || !monster._classSkillMark) return { mult: 1, crit: 0 };
        if (monster._classSkillMark.expireTime <= Date.now()) {
            monster._classSkillMark = null;
            return { mult: 1, crit: 0 };
        }
        const b = monster._classSkillMark.damageBonus || 0;
        return { mult: 1 + b / 100, crit: monster._classSkillMark.critBonus || 0 };
    };

    window.applyClassSkillPrimaryEffect = function applyClassSkillPrimaryEffect(player, skillDef, gameInstance, now, ctx) {
        if (!player || !skillDef) return false;
        const se = skillDef.skillEffect || {};
        const g = gameInstance;
        const enh = cfgEnhBonus(player, skillDef);
        const buffId = 'skill_' + skillDef.id;

        switch (se.type) {
            case 'ice_armor': {
                const dr = Math.min(35, Math.floor((se.damageReduction || 15) * enh));
                pushBuff(player, {
                    name: skillDef.name,
                    id: 'ice_armor',
                    expireTime: now + (se.durationMs || 8000),
                    effects: { damageReduction: dr },
                    onMeleeHitSlow: {
                        multiplier: se.attackerSlowMultiplier != null ? se.attackerSlowMultiplier : 0.7,
                        durationMs: se.attackerSlowDurationMs || 2000
                    }
                });
                floatText(g, player.x, player.y - 24, `冰甲 · 减伤${dr}%`, '#88ddff');
                equipFx(g, 'freeze_ring', player.x, player.y, { radius: 58, duration: 700 });
                return true;
            }
            case 'damage_reduction': {
                const dr = Math.min(50, Math.floor((se.damageReduction || 20) * enh));
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 5000),
                    effects: { damageReduction: dr }
                });
                floatText(g, player.x, player.y - 20, `${skillDef.name} · 减伤${dr}%`, '#aabbff');
                equipFx(g, 'mithril_shield', player.x, player.y, { radius: 48, duration: 520 });
                return true;
            }
            case 'shield': {
                const pct = Math.floor((se.absorbPercent || 20) * enh);
                const amount = Math.max(1, Math.floor(player.maxHp * pct / 100));
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 8000),
                    effects: {},
                    shieldRemaining: amount,
                    shieldMax: amount
                });
                floatText(g, player.x, player.y - 20, `护盾 +${amount}`, '#88eeff');
                equipFx(g, 'divine_shield', player.x, player.y, { radius: 52, duration: 600 });
                return true;
            }
            case 'heal': {
                const pct = (se.healPercent || 25) * enh;
                let heal = Math.max(1, Math.floor(player.maxHp * pct / 100));
                if (typeof window.modifyBuildHealing === 'function') {
                    heal = window.modifyBuildHealing(player, heal);
                }
                player.hp = Math.min(player.maxHp, player.hp + heal);
                floatText(g, player.x, player.y - 20, `+${heal}`, '#44ff88');
                equipFx(g, 'heal_glow', player.x, player.y, { radius: 40, duration: 500 });
                return true;
            }
            case 'attack_buff': {
                const ap = Math.floor((se.attackPercent || 15) * enh);
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 8000),
                    effects: { attackPercent: ap }
                });
                floatText(g, player.x, player.y - 20, `攻击 +${ap}%`, '#ffaa44');
                return true;
            }
            case 'attack_speed_buff': {
                const sp = Math.floor((se.attackSpeedPercent || 40) * enh);
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 4000),
                    effects: { attackSpeedPercent: sp }
                });
                floatText(g, player.x, player.y - 20, `攻速 +${sp}%`, '#ffcc66');
                return true;
            }
            case 'mark': {
                const range = se.range || skillDef.range || 120;
                const target = nearestEnemy(player, ctx && ctx.monsters, range);
                if (!target) {
                    floatText(g, player.x, player.y, '无目标', '#ff6666');
                    return false;
                }
                player.angle = Math.atan2(target.y - player.y, target.x - player.x);
                applyMark(target, se, skillDef, now);
                floatText(g, target.x, target.y - 16, '印记', '#ff8844');
                return true;
            }
            case 'blink': {
                const dist = se.distance || 100;
                const dx = Math.cos(player.angle) * dist;
                const dy = Math.sin(player.angle) * dist;
                blinkTo(player, g, player.x + dx, player.y + dy, 300);
                if (se.grantMoveSpeed) {
                    pushBuff(player, {
                        name: skillDef.name + '·疾行',
                        id: buffId + '_speed',
                        expireTime: now + (se.grantMoveSpeedMs || 4000),
                        effects: { moveSpeed: se.grantMoveSpeed }
                    });
                }
                floatText(g, player.x, player.y - 16, skillDef.name, '#aa88ff');
                return true;
            }
            case 'stealth': {
                const dodge = Math.floor((se.dodge || 25) * enh);
                const effects = { dodge };
                if (se.moveSpeed) effects.moveSpeed = se.moveSpeed;
                const dur = se.durationMs || 4000;
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + dur,
                    effects,
                    stealth: true
                });
                player._stealthUntil = now + dur;
                if (typeof window.onBuildVanish === 'function') window.onBuildVanish(player);
                floatText(g, player.x, player.y - 20, '隐身', '#9966cc');
                return true;
            }
            case 'taunt': {
                const dr = Math.min(45, Math.floor((se.damageReduction || 30) * enh));
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 4000),
                    effects: { damageReduction: dr }
                });
                const radius = se.range || skillDef.aoeRadius || 120;
                (ctx && ctx.monsters || []).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    if (Math.hypot(m.x - player.x, m.y - player.y) <= radius) {
                        m._tauntTarget = player;
                        m._tauntUntil = now + (se.durationMs || 4000);
                    }
                });
                floatText(g, player.x, player.y - 20, `嘲讽 · 减伤${dr}%`, '#ffcc44');
                return true;
            }
            case 'guard': {
                const dr = Math.min(75, Math.floor((se.damageReduction || 50) * enh));
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 3000),
                    effects: { damageReduction: dr }
                });
                floatText(g, player.x, player.y - 20, `援护 · 减伤${dr}%`, '#88aaff');
                equipFx(g, 'mithril_shield', player.x, player.y, { radius: 56, duration: 400 });
                return true;
            }
            case 'berserk': {
                const effects = { attackPercent: Math.floor((se.attackPercent || 25) * enh) };
                if (se.attackSpeedPercent) effects.attackSpeedPercent = Math.floor(se.attackSpeedPercent * enh);
                if (se.defensePenalty) effects.defensePenalty = se.defensePenalty;
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 8000),
                    effects
                });
                floatText(g, player.x, player.y - 20, skillDef.name, '#ff4422');
                return true;
            }
            case 'dodge_buff': {
                const effects = { dodge: Math.floor((se.dodge || 25) * enh) };
                if (se.moveSpeed) effects.moveSpeed = se.moveSpeed;
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 4000),
                    effects
                });
                floatText(g, player.x, player.y - 20, `闪避 +${effects.dodge}%`, '#88ffaa');
                return true;
            }
            case 'cleanse': {
                player.slowEffects = [];
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.immunityMs || 3000),
                    effects: { slowImmune: true }
                });
                floatText(g, player.x, player.y - 20, '净化', '#aaffcc');
                return true;
            }
            default:
                return false;
        }
    };

    window.applyClassSkillHybridEffect = function applyClassSkillHybridEffect(player, skillDef, gameInstance, now, ctx) {
        if (!player || !skillDef) return;
        const se = skillDef.skillEffect || {};
        const g = gameInstance;
        const monsters = ctx && ctx.monsters;
        const hitTargets = ctx && ctx.hitTargets || [];
        const baseDmg = ctx && ctx.baseDamage || 0;
        const buffId = 'skill_' + skillDef.id;

        switch (se.type) {
            case 'stun':
                hitTargets.forEach(m => {
                    applyStun(m, se.stunMs || 1500);
                    floatText(g, m.x, m.y, '眩晕', '#ffff88');
                });
                break;
            case 'slow':
                hitTargets.forEach(m => {
                    applySlow(m, se.slowMult || 0.5, se.slowMs || 3000);
                    floatText(g, m.x, m.y, '减速', '#88ccff');
                });
                break;
            case 'poison_dot':
                hitTargets.forEach(m => {
                    const dotDps = Math.max(1, Math.floor(baseDmg * (se.dotMult || 0.4)));
                    applyPoisonDot(player, m, dotDps, se.dotDurationMs || 4000, g);
                });
                break;
            case 'life_drain': {
                const pct = se.healPercent || 30;
                const heal = Math.max(1, Math.floor(player.maxHp * pct / 100));
                player.hp = Math.min(player.maxHp, player.hp + heal);
                floatText(g, player.x, player.y - 20, `吸取 +${heal}`, '#aa44ff');
                break;
            }
            case 'freeze': {
                const radius = se.aoeRadius || 60;
                (monsters || []).forEach(m => {
                    if (!m || m.hp <= 0) return;
                    if (Math.hypot(m.x - player.x, m.y - player.y) <= radius) {
                        applyFreeze(m, se.freezeMs || 2000);
                    }
                });
                floatText(g, player.x, player.y, '冰冻陷阱', '#88ddff');
                equipFx(g, 'freeze_ring', player.x, player.y, { radius, duration: 800 });
                break;
            }
            case 'charge': {
                const target = hitTargets[0] || nearestEnemy(player, monsters, se.distance || 120);
                if (target) {
                    const dx = target.x - player.x;
                    const dy = target.y - player.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const dist = Math.min(se.distance || 120, len - 20);
                    if (dist > 20) {
                        blinkTo(player, g, player.x + (dx / len) * dist, player.y + (dy / len) * dist, 350);
                    }
                    applySlow(target, se.slowMult || 0.6, se.slowMs || 2000);
                    const pathDmg = Math.max(1, Math.floor(baseDmg * (se.pathDamageMult || 0.8)));
                    if (typeof target.takeDamage === 'function') target.takeDamage(pathDmg);
                }
                break;
            }
            case 'backstep': {
                const dist = se.distance || 100;
                blinkTo(player, g,
                    player.x - Math.cos(player.angle) * dist,
                    player.y - Math.sin(player.angle) * dist,
                    250);
                const shots = se.projectiles || 3;
                const target = nearestEnemy(player, monsters, skillDef.range || 120);
                if (target) {
                    const shotDmg = Math.max(1, Math.floor(baseDmg * (se.damageMult || 0.6)));
                    for (let i = 0; i < shots; i++) {
                        setTimeout(() => {
                            if (target.hp > 0) target.takeDamage(shotDmg);
                        }, i * 120);
                    }
                }
                break;
            }
            case 'blink_behind': {
                const target = hitTargets[0] || nearestEnemy(player, monsters, skillDef.range || 80);
                if (target) {
                    const ang = Math.atan2(target.y - player.y, target.x - player.x);
                    blinkTo(player, g,
                        target.x - Math.cos(ang) * 28,
                        target.y - Math.sin(ang) * 28,
                        300);
                    player.angle = ang;
                    const enh = cfgEnhBonus(player, skillDef);
                    const baseAtk = typeof window.getPlayerEffectiveAttack === 'function'
                        ? window.getPlayerEffectiveAttack(player)
                        : (player.baseAttack || 10);
                    const bonusMult = (se.bonusDamageMult || 1.8) * enh;
                    let dmg = Math.max(1, Math.floor(baseAtk * bonusMult));
                    if (typeof window.getClassSkillMarkBonus === 'function') {
                        dmg = Math.max(1, Math.floor(dmg * window.getClassSkillMarkBonus(target).mult));
                    }
                    if (typeof target.takeDamage === 'function') target.takeDamage(dmg);
                    floatText(g, target.x, target.y, '背刺!', '#cc44ff');
                }
                break;
            }
            case 'fireball':
                equipFx(g, 'fire_explosion', player.x, player.y, {
                    radius: se.aoeRadius || 70,
                    duration: 450
                });
                break;
            case 'dodge_buff':
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + (se.durationMs || 4000),
                    effects: { dodge: se.dodge || 30 }
                });
                floatText(g, player.x, player.y - 20, '烟雾掩护', '#aaaaaa');
                break;
            default:
                break;
        }
    };

    /** 冰甲等：近战命中玩家时减速攻击者 */
    window.applyPlayerDefenseSkillOnHit = function applyPlayerDefenseSkillOnHit(player, attacker) {
        if (!player || !attacker || !player.buffs || !player.buffs.length) return;
        const now = Date.now();
        if (attacker.isRanged) return;

        for (const buff of player.buffs) {
            if (buff.expireTime <= now || !buff.onMeleeHitSlow) continue;
            const slow = buff.onMeleeHitSlow;
            if (!attacker.slowEffects) attacker.slowEffects = [];
            attacker.slowEffects.push({
                multiplier: slow.multiplier,
                expireTime: now + slow.durationMs
            });
            if (player.gameInstance) {
                floatText(player.gameInstance, attacker.x, attacker.y, '冰甲减速', '#88ccff');
                equipFx(player.gameInstance, 'freeze_ring', attacker.x, attacker.y, { radius: 36, duration: 320 });
            }
            break;
        }
    };

    window.isDefensiveClassSkill = function isDefensiveClassSkill(skillDef) {
        if (!skillDef) return false;
        const tags = skillDef.effectTags || [];
        if (tags.includes('defense') || tags.includes('ice_armor') || tags.includes('heal')) return true;
        const t = skillDef.skillEffect && skillDef.skillEffect.type;
        return ['ice_armor', 'damage_reduction', 'shield', 'guard', 'taunt', 'heal', 'cleanse'].includes(t);
    };
})();
