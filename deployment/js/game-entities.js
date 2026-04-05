/**
 * Pixel Eternal - 游戏实体类模块
 * 包含FloatingText、Monster、TownScene、Room、Player类
 */

// 远程武器与远程怪物判定
const RANGED_WEAPON_NAMES = ['猎风短弓', '幽影弩', '曦光长弓', '穿云破月', '永夜·星坠'];
const RANGED_MONSTER_NAMES = ['哥布林萨满', '哥布林斥候', '骷髅弓箭手', '骷髅法师', '兽人萨满', '恶魔术士', '恶魔大法师', '灰烬先知', '熵能术士', '星渊法师', '雷纹蝠群', '黑曜喷流', '塔基弩炮'];
const MONSTER_RANGED_AIM_DURATION = 500;
const MONSTER_RANGED_ATTACK_RANGE = 360;
const MONSTER_RANGED_ATTACK_COOLDOWN = 2800;
function isPlayerWeaponRanged(weapon) {
    if (!weapon) return false;
    return weapon.weaponType === 'ranged' || RANGED_WEAPON_NAMES.includes(weapon.name);
}
function isMonsterRangedByName(name) {
    return RANGED_MONSTER_NAMES.includes(name);
}

/**
 * 读取怪物配置字段：精英优先自身，否则继承 baseMonster（与 MONSTER_TYPES 条目一致）
 */
function getMergedMonsterTrait(monsterType, field) {
    if (typeof MONSTER_TYPES === 'undefined') return undefined;
    const md = MONSTER_TYPES[monsterType];
    if (!md) return undefined;
    if (md[field] !== undefined && md[field] !== null) return md[field];
    if (md.baseMonster && MONSTER_TYPES[md.baseMonster]) {
        const b = MONSTER_TYPES[md.baseMonster][field];
        if (b !== undefined && b !== null) return b;
    }
    return undefined;
}

/**
 * 怪物近战/弹道命中玩家后的附加效果（减速、吸血等），由 game-main 在伤害结算后调用
 */
function applyMonsterOnHitPlayerEffects(player, monster) {
    if (!player || !monster || monster.hp <= 0) return;
    const now = Date.now();
    const slow = monster.onHitPlayerSlow;
    if (slow && typeof slow.multiplier === 'number' && typeof slow.durationMs === 'number') {
        if (!player.slowEffects) player.slowEffects = [];
        player.slowEffects.push({ multiplier: slow.multiplier, expireTime: now + slow.durationMs });
    }
    const msc = monster.onMeleeSlowChance;
    if (msc && typeof msc.chance === 'number' && Math.random() < msc.chance && typeof msc.multiplier === 'number' && typeof msc.durationMs === 'number') {
        if (!player.slowEffects) player.slowEffects = [];
        player.slowEffects.push({ multiplier: msc.multiplier, expireTime: now + msc.durationMs });
    }
    const ls = monster.onHitLifeStealRatio;
    if (typeof ls === 'number' && ls > 0) {
        const base = monster._baseDamage != null ? monster._baseDamage : monster.damage;
        const heal = Math.max(0, Math.floor(base * ls));
        if (heal > 0) {
            monster.hp = Math.min(monster.maxHp, monster.hp + heal);
        }
    }
    const kb = monster.knockbackOnHit;
    if (kb && typeof kb.force === 'number' && kb.force > 0 && monster.gameInstance && typeof monster.gameInstance.applyPlayerKnockback === 'function') {
        monster.gameInstance.applyPlayerKnockback(player, monster.x, monster.y, kb.force);
    }
}

/**
 * 深塔新怪：从配置绑定额外机制字段（死亡毒雾、站定晶壳、连击、自爆、闪现等）
 */
function bindExtendedMonsterMechanics(m, type) {
    const g = (f) => getMergedMonsterTrait(type, f);
    m.rangedRangeMult = (typeof g('rangedRangeMult') === 'number' && g('rangedRangeMult') > 0) ? g('rangedRangeMult') : 1;
    const dh = g('deathHazard');
    m._deathHazard = (dh && typeof dh.radius === 'number' && dh.radius > 0 && dh.durationMs > 0 && typeof dh.dps === 'number') ? dh : null;
    const ss = g('standingShell');
    m._standingShell = (ss && ss.stillMs > 0 && ss.maxStacks > 0 && typeof ss.drPerStack === 'number') ? ss : null;
    const cm = g('comboMelee');
    m._comboMelee = (cm && cm.every >= 2 && typeof cm.weakMult === 'number' && typeof cm.strongMult === 'number') ? cm : null;
    m.meleeHitIndex = 0;
    const tr = g('trailHazard');
    m._trailHazard = (tr && tr.radius > 0 && tr.durationMs > 0 && typeof tr.dps === 'number' && tr.emitIntervalMs > 0) ? tr : null;
    const sb = g('suicideBomb');
    m._suicideBomb = (sb && sb.hpRatio > 0 && sb.fuseMs > 0 && sb.radius > 0 && typeof sb.damageMult === 'number') ? sb : null;
    m._suicideState = null;
    const bk = g('blinkEscape');
    m._blinkEscape = (bk && bk.hpRatio > 0 && bk.cooldownMs > 0) ? bk : null;
    m._nextBlinkAt = 0;
    const ps = g('periodicShield');
    m._periodicShield = (ps && ps.periodMs > 0 && ps.shieldDurationMs > 0 && typeof ps.damageTakenMult === 'number') ? ps : null;
    m.periodicShieldActiveUntil = 0;
    m._periodicNextPulse = 0;
    const orb = g('aoeOrbRanged');
    m._aoeOrbRanged = (orb && orb.radius > 0 && orb.telegraphMs > 0 && typeof orb.damageMult === 'number') ? orb : null;
    const rv = g('rangedVolley');
    m._rangedVolley = (rv && rv.extraShots > 0 && rv.delayMs >= 0 && typeof rv.damageMult === 'number') ? rv : null;
    m._volleyShotsLeft = 0;
    m._volleyNextShotAt = 0;
    const sa = g('silenceAura');
    m._silenceAura = (sa && sa.range > 0 && typeof sa.playerAttackCdMult === 'number' && sa.playerAttackCdMult >= 1) ? sa : null;
    m.knockbackOnHit = (g('knockbackOnHit') && typeof g('knockbackOnHit').force === 'number') ? g('knockbackOnHit') : null;
    m.onMeleeSlowChance = (g('onMeleeSlowChance') && typeof g('onMeleeSlowChance').chance === 'number') ? g('onMeleeSlowChance') : null;
    m.firstHitBonusMult = (typeof g('firstHitBonusMult') === 'number' && g('firstHitBonusMult') > 1) ? g('firstHitBonusMult') : null;
    m._firstHitConsumed = false;
    m.goldBonusOnDeath = (typeof g('goldBonusOnDeath') === 'number' && g('goldBonusOnDeath') > 0) ? Math.floor(g('goldBonusOnDeath')) : 0;
    const sshr = g('startingShieldHpRatio');
    if (typeof sshr === 'number' && sshr > 0) {
        m.startingShieldHp = Math.floor(m.maxHp * sshr);
        const ob = g('onShieldBroken');
        m._onShieldBroken = (ob && ob.vulnerableMs > 0 && typeof ob.damageTakenMult === 'number') ? ob : null;
    } else {
        m.startingShieldHp = 0;
        m._onShieldBroken = null;
    }
    m.vulnerableUntil = 0;
    m.vulnerableDamageTakenMult = 1;
    m.shellStacks = 0;
    m._shellStillMs = 0;
    m._shellLastX = m.x;
    m._shellLastY = m.y;
    m._trailLastEmit = 0;
    m._pendingMeleeDamageMult = 1;
    const tsb = g('twinSoulBond');
    m._twinSoulTag = (tsb && typeof tsb.tag === 'string' && tsb.tag.length > 0) ? tsb.tag : null;
    m._twinSoulShared = null;
    const sc = g('soulCircleCaster');
    m._soulCircleCaster = (sc && sc.periodMs > 0 && sc.radius > 0 && sc.durationMs > 0 && typeof sc.healPerTick === 'number' && sc.healIntervalMs > 0 && typeof sc.slowMult === 'number' && sc.slowDurationMs > 0) ? sc : null;
    m._nextSoulCircleAt = 0;
    const ap = g('apostateStance');
    m._apostateStance = (ap && ap.switchMs > 0 && typeof ap.blessingDamageTakenMult === 'number' && typeof ap.judgmentOutDamageMult === 'number') ? ap : null;
    m._apostateBlessing = true;
    m._nextApostateSwitch = 0;
    const ad = g('allyDamageAura');
    m.allyDamageAura = (ad && ad.range > 0 && typeof ad.multiplier === 'number' && ad.multiplier >= 1) ? ad : null;
    m._marshalAuraDamageMult = 1;
    const pw = g('pendulumSweep');
    m._pendulumSweep = (pw && pw.telegraphMs > 0 && pw.cooldownMs > 0 && pw.range > 0 && typeof pw.halfArcRad === 'number' && typeof pw.damageMult === 'number') ? pw : null;
    m.pendulumState = null;
    m._pendulumNextAt = 0;
}

/**
 * 同 tag 的「双生缚命」成对绑定共享生命池（需在 boost 之后、战斗开始前调用）
 */
function pairTwinSoulMonstersInRoom(monsters) {
    if (!monsters || !monsters.length) return;
    const byTag = {};
    monsters.forEach(m => {
        if (!m || m.hp <= 0 || !m._twinSoulTag || m._twinSoulShared) return;
        if (!byTag[m._twinSoulTag]) byTag[m._twinSoulTag] = [];
        byTag[m._twinSoulTag].push(m);
    });
    Object.keys(byTag).forEach(tag => {
        const arr = byTag[tag];
        for (let i = 0; i + 1 < arr.length; i += 2) {
            const a = arr[i];
            const b = arr[i + 1];
            const maxHp = Math.max(1, a.maxHp + b.maxHp);
            const hp = maxHp;
            const P = { hp, maxHp, a, b, rewardsClaimed: false };
            a._twinSoulShared = b._twinSoulShared = P;
            a.maxHp = b.maxHp = maxHp;
            a.hp = b.hp = hp;
            a._baseDamage = a.damage;
            b._baseDamage = b.damage;
        }
    });
}

/**
 * 深塔队长：身边非队长怪物获得伤害倍率（每帧在 Monster.update 前由 game-main 写入 _marshalAuraDamageMult）
 */
function applyMarshalAurasToMonsters(monsters) {
    if (!monsters || !monsters.length) return;
    monsters.forEach(m => {
        if (m && m.hp > 0) m._marshalAuraDamageMult = 1;
    });
    const marshals = monsters.filter(m => m && m.hp > 0 && m.allyDamageAura);
    marshals.forEach(m => {
        const R = m.allyDamageAura.range;
        const mult = m.allyDamageAura.multiplier;
        monsters.forEach(t => {
            if (!t || t.hp <= 0 || t === m) return;
            if (t.allyDamageAura) return;
            const dx = t.x - m.x;
            const dy = t.y - m.y;
            if (dx * dx + dy * dy <= R * R) {
                t._marshalAuraDamageMult = Math.max(t._marshalAuraDamageMult || 1, mult);
            }
        });
    });
}

/** 词条 id 解析见 trait-id-helpers.js（traitIdBase / traitIdsIncludeBase 等） */

/** 精英技能地面预警持续时间（毫秒），预警播放完毕后再执行技能 */
const ELITE_TELEGRAPH_MS = 580;

/**
 * 精英怪技能运行器：按类型驱动蓄力冲撞、跳劈、火球等技能
 */
const EliteSkillRunner = {
    COOLDOWNS: {
        goblin_elite: { charge: 6000 },
        goblinWarrior_elite: { leap: 8000 },
        goblinShaman_elite: { firebolt: 3000, shield: 12000 },
        skeletonKnight_elite: { chargeSlash: 9000 },
        skeletonMage_elite: { burstOrb: 7000 },
        orcWarrior_elite: { sunder: 10000 },
        orcWarlord_elite: { battleCry: 20000, heavyCleave: 6000 },
        demon_elite: { shadowCharge: 12000, aoeBurst: 9000 },
        demonImp_elite: { rapidAssault: 10000 },
        demonBoss_elite: { royalStomp: 14000, demonicSacrifice: 20000 },
        demonAbyss_elite: { shadowCharge: 12000, aoeBurst: 9000 },
        demonVoid_elite: { rapidAssault: 10000 },
        demonTyrant_elite: { royalStomp: 14000, demonicSacrifice: 20000 },
        crystalColossus_elite: { chargeSlash: 9000 },
        sporeHorror_elite: { burstOrb: 7000 },
        rustChain_elite: { sunder: 10000 }
    },
    tryStart(monster, player, now) {
        const dx = player.x - monster.x;
        const dy = player.y - monster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const cooldowns = this.COOLDOWNS[monster.type];
        if (!cooldowns) return;
        const lowHp = monster.hp < monster.maxHp * 0.3;
        const canCharge = (key) => !monster.eliteSkillCooldowns[key] || now >= monster.eliteSkillCooldowns[key];
        const setCooldown = (key, ms) => { monster.eliteSkillCooldowns[key] = now + ms; };

        if (monster.type === 'goblin_elite' && canCharge('charge') && dist < 220 && dist > 40 && (lowHp || Math.random() < 0.08)) {
            monster.eliteSkillState = { name: 'charge', startTime: now, startX: monster.x, startY: monster.y, angle: Math.atan2(dy, dx) };
            setCooldown('charge', 6000);
            return;
        }
        if (monster.type === 'goblinWarrior_elite' && canCharge('leap') && dist < 200 && (dist < 80 || dist > 120) && Math.random() < 0.06) {
            monster.eliteSkillState = { name: 'leap', startTime: now, startX: monster.x, startY: monster.y, landX: player.x, landY: player.y };
            setCooldown('leap', 8000);
            return;
        }
        if (monster.type === 'goblinShaman_elite') {
            if (dist < 320 && canCharge('firebolt') && Math.random() < 0.12) {
                monster.eliteSkillState = { name: 'firebolt', startTime: now };
                setCooldown('firebolt', 3000);
                return;
            }
            if (dist < 100 && canCharge('shield') && Math.random() < 0.04) {
                monster.eliteSkillState = { name: 'shield', startTime: now };
                setCooldown('shield', 12000);
                return;
            }
        }
        if ((monster.type === 'skeletonKnight_elite' || monster.type === 'crystalColossus_elite') && canCharge('chargeSlash') && dist < 250 && dist > 50 && Math.random() < 0.05) {
            monster.eliteSkillState = { name: 'chargeSlash', startTime: now, startX: monster.x, startY: monster.y, angle: Math.atan2(dy, dx) };
            setCooldown('chargeSlash', 9000);
            return;
        }
        if ((monster.type === 'skeletonMage_elite' || monster.type === 'sporeHorror_elite') && canCharge('burstOrb') && dist < 360 && Math.random() < 0.07) {
            monster.eliteSkillState = { name: 'burstOrb', startTime: now, targetX: player.x, targetY: player.y };
            setCooldown('burstOrb', 7000);
            return;
        }
        if ((monster.type === 'orcWarrior_elite' || monster.type === 'rustChain_elite') && canCharge('sunder') && dist < 90 && Math.random() < 0.05) {
            monster.eliteSkillState = { name: 'sunder', startTime: now };
            setCooldown('sunder', 10000);
            return;
        }
        if (monster.type === 'orcWarlord_elite') {
            if (canCharge('battleCry') && Math.random() < 0.03) {
                monster.eliteSkillState = { name: 'battleCry', startTime: now };
                setCooldown('battleCry', 20000);
                return;
            }
            if (canCharge('heavyCleave') && dist < 100 && Math.random() < 0.06) {
                monster.eliteSkillState = { name: 'heavyCleave', startTime: now, angle: Math.atan2(dy, dx) };
                setCooldown('heavyCleave', 6000);
                return;
            }
        }
        if (monster.type === 'demon_elite' || monster.type === 'demonAbyss_elite') {
            if (canCharge('shadowCharge') && dist < 280 && dist > 60 && Math.random() < 0.04) {
                monster.eliteSkillState = { name: 'shadowCharge', startTime: now, startX: monster.x, startY: monster.y, angle: Math.atan2(dy, dx) };
                setCooldown('shadowCharge', 12000);
                return;
            }
            if (canCharge('aoeBurst') && dist < 120 && Math.random() < 0.05) {
                monster.eliteSkillState = { name: 'aoeBurst', startTime: now };
                setCooldown('aoeBurst', 9000);
                return;
            }
        }
        if ((monster.type === 'demonImp_elite' || monster.type === 'demonVoid_elite') && canCharge('rapidAssault') && dist < 95 && Math.random() < 0.05) {
            monster.eliteSkillState = { name: 'rapidAssault', startTime: now, hitCount: 0 };
            setCooldown('rapidAssault', 10000);
            return;
        }
        if (monster.type === 'demonBoss_elite' || monster.type === 'demonTyrant_elite') {
            if (canCharge('royalStomp') && dist < 150 && Math.random() < 0.04) {
                monster.eliteSkillState = { name: 'royalStomp', startTime: now };
                setCooldown('royalStomp', 14000);
                return;
            }
            if (canCharge('demonicSacrifice') && monster.gameInstance && monster.gameInstance.currentRoom && monster.gameInstance.currentRoom.monsters) {
                const others = monster.gameInstance.currentRoom.monsters.filter(m => m !== monster && m.hp > 0);
                if (others.length > 0 && Math.random() < 0.03) {
                    monster.eliteSkillState = { name: 'demonicSacrifice', startTime: now };
                    setCooldown('demonicSacrifice', 20000);
                    return;
                }
            }
        }
    },
    update(monster, player, now) {
        const s = monster.eliteSkillState;
        if (!s) return false;
        const elapsed = now - s.startTime;
        if (elapsed < ELITE_TELEGRAPH_MS) {
            if (s.startX != null && s.startY != null) {
                monster.x = s.startX;
                monster.y = s.startY;
            }
            return true;
        }
        const execElapsed = elapsed - ELITE_TELEGRAPH_MS;
        const game = monster.gameInstance;
        const baseDmg = monster._baseDamage != null ? monster._baseDamage : monster.damage;

        if (s.name === 'charge') {
            const totalDist = 120;
            const moveDur = 0.4 * 1000;
            const moved = totalDist * Math.min(1, execElapsed / moveDur);
            monster.x = s.startX + Math.cos(s.angle) * moved;
            monster.y = s.startY + Math.sin(s.angle) * moved;
            if (moved >= totalDist - 2) {
                const dx = player.x - monster.x;
                const dy = player.y - monster.y;
                if (dx * dx + dy * dy <= 55 * 55) {
                    monster.damage = Math.floor(baseDmg * 1.8);
                    monster._skillHitThisFrame = true;
                }
                return false;
            }
            return true;
        }
        if (s.name === 'leap') {
            const dur = 0.5 * 1000;
            const t = Math.min(execElapsed / dur, 1);
            const parabolic = t * (2 - t);
            monster.x = s.startX + (s.landX - s.startX) * parabolic;
            monster.y = s.startY + (s.landY - s.startY) * parabolic - 80 * Math.sin(Math.PI * t);
            if (t >= 1) {
                const dx = player.x - monster.x;
                const dy = player.y - monster.y;
                if (dx * dx + dy * dy <= 60 * 60) {
                    monster.damage = Math.floor(baseDmg * 1.5);
                    monster._skillHitThisFrame = true;
                    if (player.stunUntil === undefined) player.stunUntil = 0;
                    player.stunUntil = Math.max(player.stunUntil, now + 600);
                }
                return false;
            }
            return true;
        }
        if (s.name === 'firebolt') {
            if (game && game.addMonsterProjectile) {
                const dmg = Math.floor(baseDmg * 1.4);
                game.addMonsterProjectile(monster.x, monster.y, player.x, player.y, dmg, monster, 350);
            }
            return false;
        }
        if (s.name === 'shield') {
            if (execElapsed < 2000) return true;
            return false;
        }
        if (s.name === 'chargeSlash') {
            const totalDist = 140;
            const moveDur = 0.35 * 1000;
            const moved = totalDist * Math.min(1, execElapsed / moveDur);
            monster.x = s.startX + Math.cos(s.angle) * moved;
            monster.y = s.startY + Math.sin(s.angle) * moved;
            if (moved >= totalDist - 2) {
                const dx = player.x - monster.x;
                const dy = player.y - monster.y;
                if (dx * dx + dy * dy <= 50 * 50) {
                    monster.damage = Math.floor(baseDmg * 2);
                    monster._skillHitThisFrame = true;
                }
                return false;
            }
            return true;
        }
        if (s.name === 'burstOrb') {
            if (execElapsed < 220) return true;
            const dx = player.x - s.targetX;
            const dy = player.y - s.targetY;
            if (dx * dx + dy * dy <= 80 * 80) {
                monster.damage = Math.floor(baseDmg * 2.2);
                monster._skillHitThisFrame = true;
            }
            return false;
        }
        if (s.name === 'sunder') {
            if (execElapsed < 80) return true;
            const dx = player.x - monster.x;
            const dy = player.y - monster.y;
            if (dx * dx + dy * dy <= 55 * 55) {
                monster.damage = Math.floor(baseDmg * 1.7);
                monster._skillHitThisFrame = true;
            }
            return false;
        }
        if (s.name === 'battleCry') {
            if (execElapsed < 20) return true;
            const addBuffText = (g, wx, wy, txt, col) => {
                if (g && typeof g.addFloatingText === 'function') g.addFloatingText.call(g, wx, wy - 50, txt, col, 2000, 18, true);
            };
            if (game && game.currentRoom && game.currentRoom.monsters) {
                addBuffText(game, monster.x, monster.y, '战吼 +15% 伤害', '#ffaa00');
                game.currentRoom.monsters.forEach(m => {
                    if (m !== monster && m.hp > 0) {
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        if (dx * dx + dy * dy <= 180 * 180) {
                            m.damage = Math.floor((m._baseDamage || m.damage) * 1.15);
                            addBuffText(game, m.x, m.y, '战吼 +15% 伤害', '#ffaa00');
                        }
                    }
                });
            }
            return false;
        }
        if (s.name === 'heavyCleave') {
            if (execElapsed < 100) return true;
            const dx = player.x - monster.x;
            const dy = player.y - monster.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angleToPlayer = Math.atan2(dy, dx);
            const angleDiff = Math.abs(angleToPlayer - s.angle);
            const cone = Math.PI / 3;
            if (dist <= 90 && (angleDiff <= cone || angleDiff >= Math.PI * 2 - cone)) {
                monster.damage = Math.floor(baseDmg * 1.4);
                monster._skillHitThisFrame = true;
            }
            return false;
        }
        if (s.name === 'shadowCharge') {
            const totalDist = 160;
            const moveDur = 0.3 * 1000;
            const moved = totalDist * Math.min(1, execElapsed / moveDur);
            monster.x = s.startX + Math.cos(s.angle) * moved;
            monster.y = s.startY + Math.sin(s.angle) * moved;
            if (moved >= totalDist - 2) {
                const dx = player.x - monster.x;
                const dy = player.y - monster.y;
                if (dx * dx + dy * dy <= 50 * 50) {
                    monster.damage = Math.floor(baseDmg * 2);
                    monster._skillHitThisFrame = true;
                }
                return false;
            }
            return true;
        }
        if (s.name === 'aoeBurst') {
            if (execElapsed < 80) return true;
            const dx = player.x - monster.x;
            const dy = player.y - monster.y;
            if (dx * dx + dy * dy <= 100 * 100) {
                monster.damage = Math.floor(baseDmg * 1.6);
                monster._skillHitThisFrame = true;
            }
            return false;
        }
        if (s.name === 'rapidAssault') {
            const step = 280;
            const hitIndex = Math.floor(execElapsed / step);
            if (hitIndex >= 3) return false;
            if (hitIndex > (s.hitCount || 0)) {
                s.hitCount = hitIndex;
                const dx = player.x - monster.x;
                const dy = player.y - monster.y;
                if (dx * dx + dy * dy <= 55 * 55) {
                    monster.damage = Math.floor(baseDmg * 0.8);
                    monster._skillHitThisFrame = true;
                }
            }
            return true;
        }
        if (s.name === 'royalStomp') {
            if (execElapsed < 80) return true;
            const dx = player.x - monster.x;
            const dy = player.y - monster.y;
            if (dx * dx + dy * dy <= 130 * 130) {
                monster.damage = Math.floor(baseDmg * 2);
                monster._skillHitThisFrame = true;
                if (player.slowEffects === undefined) player.slowEffects = [];
                player.slowEffects.push({ multiplier: 0.6, expireTime: now + 3000 });
            }
            return false;
        }
        if (s.name === 'demonicSacrifice') {
            if (execElapsed < 80) return true;
            if (game && game.currentRoom && game.currentRoom.monsters) {
                let heal = 0;
                game.currentRoom.monsters.forEach(m => {
                    if (m !== monster && m.hp > 0) {
                        const take = Math.min(m.hp, Math.floor(m.maxHp * 0.2));
                        m.hp -= take;
                        heal += Math.floor(take * 0.8);
                    }
                });
                monster.hp = Math.min(monster.maxHp, monster.hp + heal);
                if (heal > 0 && game && typeof game.addFloatingText === 'function') game.addFloatingText.call(game, monster.x, monster.y - 50, '恶魔献祭 回复', '#00ff00', 2000, 18, true);
            }
            return false;
        }
        return false;
    }
};

/**
 * 飘浮文字提示类
 * 用于显示飘浮在玩家头顶的文字提示
 */
class FloatingText {
    constructor(x, y, text, color = '#ffffff', duration = 2000, initialOffsetY = 0, fontSize = 14, fixedPosition = false, direction = null) {
        this.baseX = x; // 基础X坐标
        this.baseY = y; // 基础Y坐标
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.duration = duration;
        this.startTime = Date.now();
        this.initialOffsetY = initialOffsetY; // 初始Y偏移量（用于错开多个文字）
        this.initialOffsetX = 0; // 初始X偏移量
        this.offsetY = initialOffsetY; // 当前Y偏移量
        this.offsetX = 0; // 当前X偏移量
        this.alpha = 1; // 透明度
        this.fontSize = fontSize; // 字体大小
        this.fixedPosition = fixedPosition; // 是否固定位置（true=固定，false=跟随玩家）
        this.direction = direction; // 方向：'left' 左上方，'right' 右上方，null 正上方
    }

    update(playerX, playerY) {
        const elapsed = Date.now() - this.startTime;
        const progress = elapsed / this.duration;
        
        // 如果固定位置，不跟随玩家；否则跟随玩家
        if (!this.fixedPosition) {
            // 只有当playerX和playerY有效时才更新位置，避免NaN或undefined导致的问题
            if (playerX !== null && playerX !== undefined && !isNaN(playerX) &&
                playerY !== null && playerY !== undefined && !isNaN(playerY)) {
                this.baseX = playerX;
                this.baseY = playerY;
            }
            // 如果位置无效，使用之前保存的位置（避免文字消失）
        }
        
        // 向上飘动
        if (this.fixedPosition) {
            // 固定位置：直接向左下或右下下落
            const timeProgress = elapsed / 1000; // 当前时间（秒）
            
            // 运动参数
            const horizontalSpeed = 40; // 水平移动速度（像素/秒）
            const gravity = 200; // 重力加速度（像素/秒²）
            
            // X方向：根据方向移动（匀速）
            if (this.direction === 'left') {
                // 左下：向左移动
                this.offsetX = -timeProgress * horizontalSpeed;
            } else if (this.direction === 'right') {
                // 右下：向右移动
                this.offsetX = timeProgress * horizontalSpeed;
            } else {
                // 正下方：不移动
                this.offsetX = 0;
            }
            
            // Y方向：直接下落（受重力影响）
            // 使用重力公式：s = 0.5 * g * t²
            const fallDistance = 0.5 * gravity * timeProgress * timeProgress;
            this.offsetY = this.initialOffsetY + fallDistance;
        } else {
            // 跟随位置：基于进度移动，从initialOffsetY开始向上移动
            // initialOffsetY是小的负数（用于错开多个文字），progress从0到1，所以offsetY会从initialOffsetY变到initialOffsetY-20
            // 这样文字会向上移动20像素，保持原来的行为
            this.offsetY = this.initialOffsetY - progress * 20;
            this.offsetX = 0; // 跟随玩家的文字不横向移动
        }
        
        // 淡出效果
        this.alpha = Math.max(0, 1 - progress);
        
        // 计算实际位置
        this.x = this.baseX + this.offsetX;
        this.y = this.baseY + this.offsetY;
        
        return progress >= 1; // 返回是否已过期
    }

    draw(ctx) {
        // 如果透明度为0，不绘制
        if (this.alpha <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.font = `bold ${this.fontSize}px "Courier New", monospace`;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, this.fontSize / 4.5); // 根据字体大小调整描边宽度
        
        // 绘制文字描边（黑色，更粗）
        ctx.strokeText(this.text, this.x, this.y);
        // 绘制文字（彩色）
        ctx.fillText(this.text, this.x, this.y);
        
        ctx.restore();
    }
}

/**
 * 掉落物类
 * 用于表示地面上的掉落物品
 */
class DroppedItem {
    constructor(x, y, item, gameInstance = null) {
        this.x = x;
        this.y = y;
        this.item = item;
        this.size = 20; // 比怪物小一点
        this.pickupRange = 40;
        this.glowIntensity = 0; // 光芒强度（0-1）
        this.glowDirection = 1; // 光芒方向（1向上，-1向下）
        this.createdTime = Date.now();
        this.canPickup = true; // 是否可以拾取
        this.gameInstance = gameInstance; // 保存gameInstance引用，用于访问assetManager
        this.imageUrl = null; // 缓存的图片URL
        this.image = null; // 缓存的Image对象
        this.imageLoaded = false; // 图片是否已加载
        this.imageLoading = false; // 是否正在加载图片
    }
    
    update(gameInstance) {
        // 保存gameInstance引用（如果传入）
        if (gameInstance && !this.gameInstance) {
            this.gameInstance = gameInstance;
        }
        
        // 加载图片（如果尚未加载）
        if (!this.imageLoaded && !this.imageLoading && this.gameInstance && this.gameInstance.assetManager) {
            this.loadImage();
        }
        
        // 更新光芒效果（由等级从低到高向上散发出从弱到强的对应颜色光芒）
        const qualityLevels = { common: 1, rare: 2, fine: 3, epic: 4, legendary: 5 };
        const level = qualityLevels[this.item.quality] || 1;
        const maxIntensity = level / 5; // 最高强度根据品质等级
        
        this.glowIntensity += this.glowDirection * 0.02;
        if (this.glowIntensity >= maxIntensity) {
            this.glowIntensity = maxIntensity;
            this.glowDirection = -1;
        } else if (this.glowIntensity <= 0) {
            this.glowIntensity = 0;
            this.glowDirection = 1;
        }
        
        // 检查玩家是否靠近
        if (gameInstance && gameInstance.player) {
            const dx = this.x - gameInstance.player.x;
            const dy = this.y - gameInstance.player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.pickupRange && this.canPickup) {
                // 尝试拾取
                if (gameInstance.addItemToInventory(this.item)) {
                    // 拾取成功，移除掉落物
                    return true;
                } else {
                    // 无法拾取（背包满了）
                    this.canPickup = false;
                    gameInstance.addFloatingText(this.x, this.y, '无法拾取', '#ff0000');
                }
            }
        }
        return false;
    }
    
    /**
     * 加载物品图片
     */
    async loadImage() {
        if (!this.gameInstance || !this.gameInstance.assetManager) {
            return;
        }
        
        this.imageLoading = true;
        
        try {
            if (this.item.type === 'equipment' && this.item.name) {
                // 装备图片
                const imageName = this.gameInstance.assetManager.getEquipmentImageName(this.item.name, this.item);
                if (imageName) {
                    this.imageUrl = await this.gameInstance.assetManager.loadAndProcessEquipmentImage(imageName);
                    // 创建Image对象并加载
                    this.image = new Image();
                    this.image.onload = () => {
                        this.imageLoaded = true;
                    };
                    this.image.onerror = () => {
                        this.image = null;
                        this.imageLoaded = false;
                    };
                    this.image.src = this.imageUrl;
                }
            }
        } catch (error) {
            console.warn('加载掉落物品图片失败:', error);
        } finally {
            this.imageLoading = false;
        }
    }
    
    draw(ctx) {
        const qualityColor = QUALITY_COLORS[this.item.quality] || '#ffffff';
        
        // 绘制光芒效果（从下往上，由弱到强）
        const glowRadius = this.size / 2 + this.glowIntensity * 15;
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
        gradient.addColorStop(0, qualityColor + 'FF');
        gradient.addColorStop(0.5, qualityColor + Math.floor(this.glowIntensity * 200).toString(16).padStart(2, '0'));
        gradient.addColorStop(1, qualityColor + '00');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制品质背景色（圆形背景）
        const qualityBgOpacity = {
            'common': 0.4,
            'rare': 0.5,
            'fine': 0.6,
            'epic': 0.7,
            'legendary': 0.8
        };
        const bgOpacity = qualityBgOpacity[this.item.quality] || 0.4;
        ctx.fillStyle = qualityColor + Math.floor(bgOpacity * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 如果有贴图且已加载，绘制贴图
        if (this.image && this.imageLoaded && this.image.complete) {
            ctx.save();
            
            // 绘制图片（缩小到合适大小）
            const drawSize = this.size * 0.8; // 图片大小为掉落物大小的80%
            const drawX = this.x - drawSize / 2;
            const drawY = this.y - drawSize / 2;
            
            ctx.drawImage(this.image, drawX, drawY, drawSize, drawSize);
            
            ctx.restore();
        } else {
            // 如果没有贴图，绘制默认的圆形图标
            ctx.fillStyle = qualityColor;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2 * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 绘制边框
        ctx.strokeStyle = qualityColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.stroke();
        
        // 如果无法拾取，显示提示
        if (!this.canPickup) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(this.x - 30, this.y - this.size / 2 - 20, 60, 15);
            ctx.fillStyle = '#ff0000';
            ctx.font = '10px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('无法拾取', this.x, this.y - this.size / 2 - 10);
        }
    }
}

/**
 * 传送门类
 */
class Portal {
    constructor(x, y, targetFloor, type = 'next', roomType = null) {
        this.x = x;
        this.y = y;
        this.targetFloor = targetFloor;
        this.type = type; // 'next' 或 'exit'
        this.roomType = roomType; // 房间类型（用于选择下一层）
        this.size = 60;
    }
    
    draw(ctx, gameInstance = null) {
        const assetManager = gameInstance?.assetManager;
        let portalType = null;
        
        if (this.type === 'exit') {
            portalType = 'exit';
        } else if (this.type === 'return_town') {
            portalType = 'return_town';
        } else if (this.type === 'exit_dungeon') {
            portalType = 'exit_dungeon';
        } else if (this.type === 'next') {
            // 战斗房间与精英房间均使用 fight 传送门图标
            if (this.roomType === 'battle' || this.roomType === 'elite') {
                portalType = 'fight';
            } else {
                portalType = 'next';
            }
        }
        
        // 尝试使用贴图
        if (assetManager && portalType) {
            const imageName = assetManager.getPortalImageName(portalType);
            if (imageName) {
                let img = assetManager.entityImageCache.get(imageName);
                // 如果贴图不在缓存中，尝试异步加载（下次绘制时会显示）
                if (!img) {
                    assetManager.loadEntityImage(imageName).catch(err => {
                        console.warn('Portal: 加载传送门贴图失败:', err);
                    });
                }
                if (img) {
                    assetManager.drawEntityImage(ctx, img, this.x, this.y, this.size, this.size);
                    
                    // 绘制文字
                    ctx.fillStyle = '#fff';
                    ctx.font = '14px "Courier New", monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    
                    if (this.type === 'exit') {
                        ctx.fillText('返回主城', this.x, this.y - this.size / 2 - 10);
                    } else {
                        if (this.roomType) {
                            const typeNames = {
                                battle: '战斗',
                                treasure: '宝箱',
                                rest: '休整',
                                elite: '精英',
                                alchemy: '炼金',
                                gap_shop: '隙间商店',
                                boss: 'Boss'
                            };
                            const typeName = typeNames[this.roomType] || this.roomType;
                            ctx.fillText(`第${this.targetFloor}层`, this.x, this.y - this.size / 2 - 25);
                            ctx.fillText(typeName, this.x, this.y - this.size / 2 - 10);
                        } else {
                            ctx.fillText(`第${this.targetFloor}层`, this.x, this.y - this.size / 2 - 10);
                        }
                    }
                    return;
                }
            }
        }
        
        // 回退：使用原来的绘制方式
        if (this.type === 'exit') {
            ctx.fillStyle = '#6a0dad';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#8b00ff';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.fillStyle = '#fff';
            ctx.font = '14px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('返回主城', this.x, this.y - this.size / 2 - 10);
        } else {
            const colors = ['#4a9eff', '#00ff88', '#ffaa00'];
            const colorIndex = (this.targetFloor - 1) % colors.length;
            ctx.fillStyle = colors[colorIndex];
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.fillStyle = '#fff';
            ctx.font = '14px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            
            if (this.roomType) {
                const typeNames = {
                    battle: '战斗',
                    treasure: '宝箱',
                    rest: '休整',
                    elite: '精英',
                    alchemy: '炼金',
                    gap_shop: '隙间商店',
                    boss: 'Boss'
                };
                const typeName = typeNames[this.roomType] || this.roomType;
                ctx.fillText(`第${this.targetFloor}层`, this.x, this.y - this.size / 2 - 25);
                ctx.fillText(typeName, this.x, this.y - this.size / 2 - 10);
            } else {
                ctx.fillText(`第${this.targetFloor}层`, this.x, this.y - this.size / 2 - 10);
            }
        }
    }
}

/**
 * 怪物类
 * 用于表示游戏中的怪物，包含AI、攻击、掉落等功能
 */
class Monster {
    constructor(x, y, type, gameInstance = null) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.gameInstance = gameInstance;
        this.size = CONFIG.MONSTER_SIZE;
        const moveMultRaw = getMergedMonsterTrait(type, 'moveSpeedMult');
        const moveMult = (typeof moveMultRaw === 'number' && moveMultRaw > 0 && isFinite(moveMultRaw)) ? moveMultRaw : 1;
        this.speed = CONFIG.MONSTER_SPEED * moveMult;
        this.angle = 0;
        this.lastAttackTime = 0;
        
        // 加速度系统
        this.vx = 0; // X方向速度
        this.vy = 0; // Y方向速度
        this.maxSpeed = this.speed; // 最大速度（与移速倍率一致）
        this.acceleration = 0.25; // 加速度系数
        this.friction = 0.9; // 摩擦力系数（每帧速度衰减）
        
        const monsterData = MONSTER_TYPES[type];
        this.name = monsterData.name;
        this.maxHp = monsterData.hp;
        this.hp = this.maxHp;
        this.damage = monsterData.damage;
        this.color = monsterData.color;
        this.level = monsterData.level || 1;
        this.expReward = monsterData.expReward || 10;
        this.goldReward = monsterData.goldReward || 5;
        this._baseDamage = this.damage;
        const brkHp = getMergedMonsterTrait(type, 'berserkHpRatio');
        const brkCd = getMergedMonsterTrait(type, 'berserkCooldownMult');
        this.berserkHpRatio = (typeof brkHp === 'number' && brkHp > 0 && brkHp < 1) ? brkHp : null;
        this.berserkCooldownMult = (typeof brkCd === 'number' && brkCd > 0 && brkCd < 1) ? brkCd : null;
        const ohs = getMergedMonsterTrait(type, 'onHitPlayerSlow');
        this.onHitPlayerSlow = (ohs && typeof ohs.multiplier === 'number' && typeof ohs.durationMs === 'number') ? ohs : null;
        const ls = getMergedMonsterTrait(type, 'onHitLifeStealRatio');
        this.onHitLifeStealRatio = (typeof ls === 'number' && ls > 0) ? Math.min(0.2, ls) : 0;
        this.hasStar = false; // 是否带★
        this.starCount = 0; // ★数量
        this.hasDetectedPlayer = false; // 是否已发现玩家
        this.isElite = !!(monsterData.isElite || (typeof type === 'string' && type.endsWith('_elite')));
        this.baseMonsterType = monsterData.baseMonster || (typeof type === 'string' && type.endsWith('_elite') ? type.replace(/_elite$/, '') : null);
        if (this.isElite) this.speed *= 1.12;
        
        // 精英技能状态与冷却
        this.eliteSkillState = null;
        this.eliteSkillEndTime = 0;
        this.eliteSkillCooldowns = {};
        this._skillHitThisFrame = false;
        
        // 走动动画相关
        this.walkAnimationTime = 0; // 走动动画时间（用于计算缩放）
        this.walkAnimationSpeed = 0.15; // 动画速度（每帧增加的值）
        
        // 受伤变红效果
        this.hurtUntil = 0; // 受伤变红状态结束时间
        // 远程怪：不追击，站定瞄准后发射子弹
        this.isRanged = isMonsterRangedByName(this.name);
        this.aimStartTime = 0;
        bindExtendedMonsterMechanics(this, type);
    }

    update(player) {
        const now = Date.now();
        if (this._baseDamage != null) {
            let d = this._baseDamage;
            if (this._apostateStance && !this._apostateBlessing) {
                d = Math.floor(d * this._apostateStance.judgmentOutDamageMult);
            }
            if (this._marshalAuraDamageMult && this._marshalAuraDamageMult > 1) {
                d = Math.floor(d * this._marshalAuraDamageMult);
            }
            this.damage = d;
        }

        // 检查是否被冰冻
        if (this.frozenUntil && now < this.frozenUntil) {
            return; // 被冰冻时不能移动
        } else if (this.frozenUntil && now >= this.frozenUntil) {
            this.frozenUntil = null; // 冰冻效果结束
        }

        if (!this.isElite && this._pendulumSweep && this._tickPendulumSweep(player, now)) {
            this._tickSpecialMechanics(player, now);
            return;
        }

        // 精英技能：若正在释放技能则只更新技能，不进行普通移动
        if (this.isElite && this.eliteSkillState) {
            if (EliteSkillRunner.update(this, player, now)) return;
            this.eliteSkillState = null;
        }
        if (this.isElite && !this.eliteSkillState) {
            EliteSkillRunner.tryStart(this, player, now);
        }
        if (this.isElite && this.eliteSkillState) return;
        
        // 计算移动速度（考虑减速效果）
        let currentMaxSpeed = this.speed;
        if (this.slowEffects) {
            // 移除过期的减速效果
            this.slowEffects = this.slowEffects.filter(effect => effect.expireTime > now);
            // 取最小移速倍率 = 最强减速（与玩家 slowEffects 一致）
            if (this.slowEffects.length > 0) {
                const minMult = Math.min(...this.slowEffects.map(e => e.multiplier));
                currentMaxSpeed = this.speed * minMult;
            }
        }
        this.maxSpeed = currentMaxSpeed;
        
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 检查是否在发现范围内
        const detectionRange = CONFIG.MONSTER_DETECTION_RANGE || 150;
        const chaseRange = CONFIG.MONSTER_CHASE_RANGE || 250;
        
        if (distance < detectionRange) {
            // 在发现范围内，标记为已发现
            this.hasDetectedPlayer = true;
        }
        
        // 如果已发现玩家，检查是否在追击范围内
        if (this.hasDetectedPlayer) {
            if (distance > chaseRange) {
                // 玩家逃出追击范围，停止追击
                this.hasDetectedPlayer = false;
                // 应用摩擦力减速
                this.vx *= this.friction;
                this.vy *= this.friction;
                
                // 更新位置
                this.x += this.vx;
                this.y += this.vy;
                
                // 更新走动动画
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (currentSpeed > 0.1) {
                    this.walkAnimationTime += this.walkAnimationSpeed;
                } else {
                    this.walkAnimationTime *= 0.9;
                }
            } else if (distance > CONFIG.MONSTER_ATTACK_RANGE) {
                // 在追击范围内但不在攻击范围内：远程怪不追击，只面向玩家；近战怪追击
                this.angle = Math.atan2(dy, dx);
                if (this.isRanged) {
                    // 远程怪：只减速、面向玩家，不向玩家移动
                    this.vx *= this.friction;
                    this.vy *= this.friction;
                    this.x += this.vx;
                    this.y += this.vy;
                    const currentSpeedR = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    if (currentSpeedR > 0.1) this.walkAnimationTime += this.walkAnimationSpeed;
                    else this.walkAnimationTime *= 0.9;
                } else {
                    const targetVx = Math.cos(this.angle) * this.maxSpeed;
                    const targetVy = Math.sin(this.angle) * this.maxSpeed;
                    this.vx += (targetVx - this.vx) * this.acceleration;
                    this.vy += (targetVy - this.vy) * this.acceleration;
                    let currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                    if (currentSpeed > this.maxSpeed) {
                        const scale = this.maxSpeed / currentSpeed;
                        this.vx *= scale;
                        this.vy *= scale;
                        currentSpeed = this.maxSpeed;
                    }
                    this.x += this.vx;
                this.y += this.vy;
                
                // 更新走动动画（移动时）
                if (currentSpeed > 0.1) {
                    this.walkAnimationTime += this.walkAnimationSpeed;
                } else {
                    this.walkAnimationTime *= 0.9;
                }
                }
            } else {
                // 在攻击范围内，停止移动（准备攻击）
                // 应用摩擦力减速
                this.vx *= this.friction;
                this.vy *= this.friction;
                
                // 更新位置
                this.x += this.vx;
                this.y += this.vy;
                
                // 停止移动时，动画时间逐渐归零
                this.walkAnimationTime *= 0.9;
            }
        } else {
            // 未发现玩家，应用摩擦力减速
            this.vx *= this.friction;
            this.vy *= this.friction;
            
            // 更新位置
            this.x += this.vx;
            this.y += this.vy;
            
            // 检查是否在移动
            const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (currentSpeed > 0.1) {
                this.walkAnimationTime += this.walkAnimationSpeed;
            } else {
                this.walkAnimationTime *= 0.9;
            }
        }
        this._tickSpecialMechanics(player, now);
    }

    /**
     * 钟摆械偶：非精英独立扇形预警与横扫伤害；返回 true 时本帧跳过普通移动/追击逻辑
     */
    _tickPendulumSweep(player, now) {
        const cfg = this._pendulumSweep;
        if (!cfg) return false;
        const dx0 = player.x - this.x;
        const dy0 = player.y - this.y;
        const dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;

        if (this.pendulumState) {
            const st = this.pendulumState;
            if (st.phase === 'telegraph') {
                if (now - st.startTime >= cfg.telegraphMs) {
                    const ang = st.angle;
                    const pdx = player.x - this.x;
                    const pdy = player.y - this.y;
                    const pd = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
                    const pAng = Math.atan2(pdy, pdx);
                    let diff = pAng - ang;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    if (pd <= cfg.range && Math.abs(diff) <= cfg.halfArcRad) {
                        if (this.gameInstance && this.gameInstance.player) {
                            const dmg = Math.max(1, Math.floor(this.damage * cfg.damageMult));
                            const killed = this.gameInstance.player.takeDamage(dmg, this, false);
                            if (killed) this.gameInstance.isPlayerDead = true;
                            if (typeof applyMonsterOnHitPlayerEffects === 'function') {
                                applyMonsterOnHitPlayerEffects(this.gameInstance.player, this);
                            }
                        }
                    }
                    this.pendulumState = null;
                    this._pendulumNextAt = now + cfg.cooldownMs;
                }
                this.angle = st.angle;
                return true;
            }
            return true;
        }
        if (now < (this._pendulumNextAt || 0)) return false;
        if (dist0 > cfg.range * 1.35 || dist0 < 38) return false;
        if (Math.random() < 0.012) {
            this.pendulumState = { phase: 'telegraph', startTime: now, angle: Math.atan2(dy0, dx0) };
            return true;
        }
        return false;
    }

    _drawPendulumTelegraph(ctx) {
        const st = this.pendulumState;
        const cfg = this._pendulumSweep;
        if (!st || st.phase !== 'telegraph' || !cfg) return;
        const now = Date.now();
        const ratio = Math.min(1, (now - st.startTime) / cfg.telegraphMs);
        ctx.save();
        const fillColor = 'rgba(0, 220, 255, 0.26)';
        const strokeColor = 'rgba(120, 240, 255, 0.88)';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        const start = st.angle - cfg.halfArcRad;
        const end = st.angle + cfg.halfArcRad;
        ctx.arc(this.x, this.y, cfg.range * ratio, start, end);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    }

    _tickSpecialMechanics(player, now) {
        if (this.hp <= 0) return;
        if (this._apostateStance) {
            if (!this._nextApostateSwitch) this._nextApostateSwitch = now + this._apostateStance.switchMs;
            if (now >= this._nextApostateSwitch) {
                this._apostateBlessing = !this._apostateBlessing;
                this._nextApostateSwitch = now + this._apostateStance.switchMs;
            }
        }
        if (this._soulCircleCaster && this.gameInstance && typeof this.gameInstance.addSoulCircle === 'function') {
            if (!this._nextSoulCircleAt) this._nextSoulCircleAt = now + 800;
            if (now >= this._nextSoulCircleAt) {
                const c = this._soulCircleCaster;
                this.gameInstance.addSoulCircle({
                    x: this.x,
                    y: this.y,
                    radius: c.radius,
                    expireTime: now + c.durationMs,
                    healPerTick: c.healPerTick,
                    healIntervalMs: c.healIntervalMs,
                    slowMult: c.slowMult,
                    slowDurationMs: c.slowDurationMs,
                    casterRef: this
                });
                this._nextSoulCircleAt = now + c.periodMs;
            }
        }
        if (this._periodicShield) {
            if (!this._periodicNextPulse) this._periodicNextPulse = now + this._periodicShield.periodMs;
            if (now >= this._periodicNextPulse) {
                this.periodicShieldActiveUntil = now + this._periodicShield.shieldDurationMs;
                this._periodicNextPulse = now + this._periodicShield.periodMs;
            }
        }
        if (this._standingShell) {
            const moved = Math.sqrt((this.x - this._shellLastX) ** 2 + (this.y - this._shellLastY) ** 2);
            if (moved > 14) {
                this.shellStacks = 0;
                this._shellStillMs = 0;
            } else {
                this._shellStillMs += 16;
                if (this._shellStillMs >= this._standingShell.stillMs) {
                    const cap = this._standingShell.maxStacks;
                    this.shellStacks = Math.min(cap, this.shellStacks + 1);
                    this._shellStillMs = 0;
                }
            }
            this._shellLastX = this.x;
            this._shellLastY = this.y;
        }
        if (this._trailHazard && this.hasDetectedPlayer && this.gameInstance && typeof this.gameInstance.addGroundHazard === 'function') {
            const sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (sp > 0.35 && now - this._trailLastEmit >= this._trailHazard.emitIntervalMs) {
                this._trailLastEmit = now;
                this.gameInstance.addGroundHazard(this.x, this.y, this._trailHazard.radius, this._trailHazard.durationMs, this._trailHazard.dps, 'acid');
            }
        }
        if (this._blinkEscape && this.maxHp > 0 && this.hp / this.maxHp < this._blinkEscape.hpRatio && now >= this._nextBlinkAt) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            if (d > 100 && d < 400 && Math.random() < 0.02) {
                const step = Math.min(95, d - 70);
                this.x += (dx / d) * step;
                this.y += (dy / d) * step;
                this._nextBlinkAt = now + this._blinkEscape.cooldownMs;
            }
        }
        if (this._suicideBomb && this.maxHp > 0) {
            if (this.hp / this.maxHp >= this._suicideBomb.hpRatio) {
                this._suicideState = null;
            } else if (!this._suicideState) {
                this._suicideState = { armAt: now, fuseMs: this._suicideBomb.fuseMs };
            }
        }
        if (this._suicideBomb && this._suicideState && this.gameInstance) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const fuseDone = now - this._suicideState.armAt >= this._suicideState.fuseMs;
            if (this.maxHp > 0 && this.hp / this.maxHp < this._suicideBomb.hpRatio) {
                const targetVx = dx / (dist || 1) * this.maxSpeed * 0.55;
                const targetVy = dy / (dist || 1) * this.maxSpeed * 0.55;
                this.vx += (targetVx - this.vx) * 0.08;
                this.vy += (targetVy - this.vy) * 0.08;
            }
            if (fuseDone || dist < 42) {
                const r = this._suicideBomb.radius;
                const dmg = Math.max(1, Math.floor(this.damage * this._suicideBomb.damageMult));
                if (typeof this.gameInstance.damagePlayerInRadius === 'function') {
                    this.gameInstance.damagePlayerInRadius(this.x, this.y, r, dmg, this);
                }
                this.hp = 0;
                this._suicideState = null;
                if (this.gameInstance.player && typeof this.gameInstance.player.processKillRewards === 'function') {
                    this.gameInstance.player.processKillRewards([this]);
                }
            }
        }
        if (this._volleyShotsLeft > 0 && now >= this._volleyNextShotAt && this.gameInstance && this.gameInstance.addMonsterProjectile) {
            const dmg = Math.max(1, Math.floor(this.damage * (this._rangedVolley ? this._rangedVolley.damageMult : 0.5)));
            this.gameInstance.addMonsterProjectile(this.x, this.y, player.x, player.y, dmg, this, 320);
            this._volleyShotsLeft--;
            this._volleyNextShotAt = now + (this._rangedVolley ? this._rangedVolley.delayMs : 200);
        }
    }

    attack(player) {
        const now = Date.now();
        if (this.frozenUntil && now < this.frozenUntil) return false;
        if (this.pendulumState && this.pendulumState.phase === 'telegraph') return false;
        if (this._skillHitThisFrame) {
            this._skillHitThisFrame = false;
            return true;
        }
        
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (this.isRanged) {
            const range = MONSTER_RANGED_ATTACK_RANGE * (this.rangedRangeMult || 1);
            let cooldown = MONSTER_RANGED_ATTACK_COOLDOWN;
            if (this.berserkHpRatio != null && this.berserkCooldownMult != null && this.maxHp > 0 && this.hp / this.maxHp < this.berserkHpRatio) {
                cooldown *= this.berserkCooldownMult;
            }
            if (distance > range) return false;
            if (now - this.lastAttackTime < cooldown) return false;
            if (!this.aimStartTime) {
                this.aimStartTime = now;
                return false;
            }
            const aimElapsed = now - this.aimStartTime;
            if (aimElapsed < MONSTER_RANGED_AIM_DURATION) return false;
            this.aimStartTime = 0;
            this.lastAttackTime = now;
            if (this._aoeOrbRanged && this.gameInstance && typeof this.gameInstance.queueMonsterAoETelegraph === 'function') {
                const odmg = Math.max(1, Math.floor(this.damage * this._aoeOrbRanged.damageMult));
                this.gameInstance.queueMonsterAoETelegraph(player.x, player.y, odmg, this._aoeOrbRanged.radius, this._aoeOrbRanged.telegraphMs, this);
            } else if (this.gameInstance && this.gameInstance.addMonsterProjectile) {
                let pdmg = this.damage;
                if (this.firstHitBonusMult && !this._firstHitConsumed) {
                    pdmg = Math.max(1, Math.floor(pdmg * this.firstHitBonusMult));
                    this._firstHitConsumed = true;
                }
                this.gameInstance.addMonsterProjectile(this.x, this.y, player.x, player.y, pdmg, this, 400);
                if (this._rangedVolley && this._rangedVolley.extraShots > 0) {
                    this._volleyShotsLeft = this._rangedVolley.extraShots;
                    this._volleyNextShotAt = now + this._rangedVolley.delayMs;
                }
            }
            return false;
        }
        
        let attackCooldown = CONFIG.MONSTER_ATTACK_COOLDOWN;
        if (this.attackSpeedDebuffs) {
            this.attackSpeedDebuffs = this.attackSpeedDebuffs.filter(effect => effect.expireTime > now);
            if (this.attackSpeedDebuffs.length > 0) {
                const maxSlow = Math.max(...this.attackSpeedDebuffs.map(e => e.multiplier));
                attackCooldown = CONFIG.MONSTER_ATTACK_COOLDOWN / maxSlow;
            }
        }
        if (this.berserkHpRatio != null && this.berserkCooldownMult != null && this.maxHp > 0 && this.hp / this.maxHp < this.berserkHpRatio) {
            attackCooldown *= this.berserkCooldownMult;
        }
        if (now - this.lastAttackTime < attackCooldown) return false;
        if (distance <= CONFIG.MONSTER_ATTACK_RANGE) {
            this.lastAttackTime = now;
            let mult = 1;
            if (this._comboMelee) {
                this.meleeHitIndex = (this.meleeHitIndex || 0) + 1;
                const e = this._comboMelee.every;
                mult = (this.meleeHitIndex % e === 0) ? this._comboMelee.strongMult : this._comboMelee.weakMult;
            }
            if (this.firstHitBonusMult && !this._firstHitConsumed) {
                mult *= this.firstHitBonusMult;
                this._firstHitConsumed = true;
            }
            this._pendingMeleeDamageMult = mult;
            return true;
        }
        return false;
    }

    takeDamage(amount) {
        const now = Date.now();
        if (this.hp <= 0) return false;
        let dmg = amount;
        if (this.startingShieldHp > 0) {
            const abs = Math.min(this.startingShieldHp, dmg);
            this.startingShieldHp -= abs;
            dmg -= abs;
            if (this.startingShieldHp <= 0 && this._onShieldBroken) {
                this.vulnerableUntil = now + this._onShieldBroken.vulnerableMs;
                this.vulnerableDamageTakenMult = this._onShieldBroken.damageTakenMult;
            }
        }
        if (this.periodicShieldActiveUntil > now && this._periodicShield) {
            dmg *= this._periodicShield.damageTakenMult;
        }
        if (this.vulnerableUntil > now) {
            dmg *= this.vulnerableDamageTakenMult;
        }
        if (this.shellStacks > 0 && this._standingShell) {
            const dr = Math.min(0.78, this.shellStacks * this._standingShell.drPerStack);
            dmg *= Math.max(0.22, 1 - dr);
        }
        if (this._apostateStance && this._apostateBlessing) {
            dmg *= this._apostateStance.blessingDamageTakenMult;
        }
        dmg = Math.max(0, dmg);
        if (this._twinSoulShared) {
            const P = this._twinSoulShared;
            if (P.rewardsClaimed) return false;
            P.hp -= dmg;
            if (P.hp < 0) P.hp = 0;
            P.a.hp = P.b.hp = P.hp;
            this.hurtUntil = now + 500;
            P.a.hurtUntil = P.b.hurtUntil = now + 500;
            if (P.hp <= 0) {
                P.rewardsClaimed = true;
                return true;
            }
            return false;
        }
        this.hp -= dmg;
        this.hurtUntil = now + 500;
        return this.hp <= 0;
    }

    /**
     * 绘制精英技能地面预警范围（由内向外动画，播放完毕后才执行技能）
     */
    _drawEliteTelegraph(ctx) {
        const s = this.eliteSkillState;
        if (!s || !this.isElite) return;
        const now = Date.now();
        const elapsed = now - s.startTime;
        if (elapsed >= ELITE_TELEGRAPH_MS && ['charge', 'chargeSlash', 'shadowCharge', 'leap'].includes(s.name)) return;
        const ratio = Math.min(1, elapsed / ELITE_TELEGRAPH_MS);
        ctx.save();
        const fillColor = 'rgba(255, 120, 0, 0.28)';
        const strokeColor = 'rgba(255, 180, 50, 0.85)';
        const strokeW = 2;
        const drawLine = (x1, y1, angle, length, width, animRatio) => {
            const len = length * animRatio;
            const x2 = x1 + Math.cos(angle) * len;
            const y2 = y1 + Math.sin(angle) * len;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const l = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / l;
            const ny = dx / l;
            const h = (width || 50) / 2;
            ctx.beginPath();
            ctx.moveTo(x1 + nx * h, y1 + ny * h);
            ctx.lineTo(x2 + nx * h, y2 + ny * h);
            ctx.lineTo(x2 - nx * h, y2 - ny * h);
            ctx.lineTo(x1 - nx * h, y1 - ny * h);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeW;
            ctx.stroke();
        };
        const drawCircle = (x, y, radius, animRatio) => {
            const r = radius * animRatio;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeW;
            ctx.stroke();
        };
        const drawCone = (cx, cy, angle, radius, coneAngleRad, animRatio) => {
            const r = radius * animRatio;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            const start = angle - coneAngleRad / 2;
            const end = angle + coneAngleRad / 2;
            ctx.arc(cx, cy, r, start, end);
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeW;
            ctx.stroke();
        };
        switch (s.name) {
            case 'charge':
                drawLine(this.x, this.y, s.angle, 120, 50, ratio);
                break;
            case 'leap':
                drawCircle(s.landX, s.landY, 60, ratio);
                break;
            case 'firebolt':
                drawCircle(this.x, this.y, 25, ratio);
                break;
            case 'chargeSlash':
                drawLine(this.x, this.y, s.angle, 140, 50, ratio);
                break;
            case 'burstOrb':
                drawCircle(s.targetX, s.targetY, 80, ratio);
                break;
            case 'sunder':
                drawCircle(this.x, this.y, 55, ratio);
                break;
            case 'battleCry':
                drawCircle(this.x, this.y, 180, ratio);
                break;
            case 'heavyCleave':
                drawCone(this.x, this.y, s.angle, 90, Math.PI / 3, ratio);
                break;
            case 'shadowCharge':
                drawLine(this.x, this.y, s.angle, 160, 50, ratio);
                break;
            case 'aoeBurst':
                drawCircle(this.x, this.y, 100, ratio);
                break;
            case 'rapidAssault':
                drawCircle(this.x, this.y, 55, ratio);
                break;
            case 'royalStomp':
                drawCircle(this.x, this.y, 130, ratio);
                break;
            default:
                break;
        }
        ctx.restore();
    }

    draw(ctx, playerLevel = 1) {
        const now = Date.now();
        const isFrozen = this.frozenUntil && now < this.frozenUntil;
        const isHurt = this.hurtUntil && now < this.hurtUntil;
        
        if (this.isElite && this.eliteSkillState) this._drawEliteTelegraph(ctx);
        if (!this.isElite && this.pendulumState && this._pendulumSweep) this._drawPendulumTelegraph(ctx);

        // 尝试使用贴图绘制
        const assetManager = this.gameInstance?.assetManager;
        if (assetManager) {
            const monsterConfig = assetManager.getMonsterImageConfig(this.type);
            if (monsterConfig && monsterConfig.image) {
                let monsterImg = assetManager.monsterImageCache.get(monsterConfig.image);
                // 如果贴图不在缓存中，尝试加载（异步，下次绘制时会显示）
                if (!monsterImg && assetManager.monsterImageCache.get(monsterConfig.image) !== null) {
                    assetManager.loadMonsterImage(monsterConfig.image).catch(err => {
                        console.warn('Monster: 加载贴图失败:', err);
                    });
                }
                
                if (monsterImg) {
                    ctx.save();
                    
                    // 应用受伤变红效果（优先于冰冻效果）
                    if (isHurt) {
                        // 受伤时变红：使用红色色调滤镜
                        // 计算红色强度（随时间衰减）
                        const hurtElapsed = now - (this.hurtUntil - 500);
                        const hurtProgress = Math.min(1.0, hurtElapsed / 500); // 0到1，1表示完全恢复
                        // 红色强度从1.0衰减到0
                        const redIntensity = 1.0 - hurtProgress;
                        // 使用红色色调滤镜：增加饱和度，提高亮度，调整色相偏向红色
                        ctx.filter = `saturate(${1.0 + redIntensity * 2.0}) brightness(${1.0 + redIntensity * 0.8}) hue-rotate(${-redIntensity * 20}deg)`;
                    } else if (isFrozen) {
                        // 如果被冰冻，添加蓝色滤镜效果
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.globalAlpha = 0.7;
                        ctx.filter = 'hue-rotate(180deg) saturate(1.5)';
                    }
                    
                    // 计算走动时的上下缩放效果
                    const walkScale = 1.0 + Math.sin(this.walkAnimationTime) * 0.1; // 上下缩放10%
                    
                    // 计算绘制尺寸（应用缩放配置）
                    const baseScale = monsterConfig.scale || 1.0;
                    const drawSize = this.size * baseScale;
                    
                    // 应用缩放变换（只缩放Y轴，模拟上下跳动）
                    ctx.translate(this.x, this.y);
                    ctx.scale(1.0, walkScale);
                    ctx.translate(-this.x, -this.y);
                    
                    // 绘制怪物贴图
                    assetManager.drawEntityImage(ctx, monsterImg, this.x, this.y, drawSize, drawSize);
                    
                    ctx.restore();
                } else {
                    // 回退：绘制默认圆形（也应用走动动画）
                    ctx.save();
                    
                    // 应用受伤变红效果（优先于冰冻效果）
                    if (isHurt) {
                        const hurtElapsed = now - (this.hurtUntil - 500);
                        const hurtProgress = Math.min(1.0, hurtElapsed / 500);
                        const redIntensity = 1.0 - hurtProgress;
                        ctx.filter = `saturate(${1.0 + redIntensity * 2.0}) brightness(${1.0 + redIntensity * 0.8}) hue-rotate(${-redIntensity * 20}deg)`;
                    } else if (isFrozen) {
                        ctx.filter = 'hue-rotate(180deg) saturate(1.5)';
                    }
                    
                    // 计算走动时的上下缩放效果
                    const walkScale = 1.0 + Math.sin(this.walkAnimationTime) * 0.1; // 上下缩放10%
                    
                    // 应用缩放变换（只缩放Y轴）
                    ctx.translate(this.x, this.y);
                    ctx.scale(1.0, walkScale);
                    ctx.translate(-this.x, -this.y);
                    
                    // 受伤时改变圆形颜色为亮红色，否则使用默认颜色
                    if (isHurt) {
                        const hurtElapsed = now - (this.hurtUntil - 500);
                        const hurtProgress = Math.min(1.0, hurtElapsed / 500);
                        const redIntensity = 1.0 - hurtProgress;
                        const baseColor = isFrozen ? '#00ffff' : this.color;
                        const r = Math.floor(255 * redIntensity + parseInt(baseColor.slice(1, 3), 16) * (1 - redIntensity));
                        const g = Math.floor(50 * redIntensity + parseInt(baseColor.slice(3, 5), 16) * (1 - redIntensity));
                        const b = Math.floor(50 * redIntensity + parseInt(baseColor.slice(5, 7), 16) * (1 - redIntensity));
                        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                    } else if (isFrozen) {
                        ctx.fillStyle = '#00ffff'; // 冰冻时显示为青色
                    } else {
                        ctx.fillStyle = this.color;
                    }
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.restore();
                }
            } else {
                // 回退：绘制默认圆形（也应用走动动画）
                ctx.save();
                
                // 应用受伤变红效果（优先于冰冻效果）
                if (isHurt) {
                    const hurtElapsed = now - (this.hurtUntil - 500);
                    const hurtProgress = Math.min(1.0, hurtElapsed / 500);
                    const redIntensity = 1.0 - hurtProgress;
                    ctx.filter = `saturate(${1.0 + redIntensity * 2.0}) brightness(${1.0 + redIntensity * 0.8}) hue-rotate(${-redIntensity * 20}deg)`;
                } else if (isFrozen) {
                    ctx.filter = 'hue-rotate(180deg) saturate(1.5)';
                }
                
                // 计算走动时的上下缩放效果
                const walkScale = 1.0 + Math.sin(this.walkAnimationTime) * 0.1; // 上下缩放10%
                
                // 应用缩放变换（只缩放Y轴）
                ctx.translate(this.x, this.y);
                ctx.scale(1.0, walkScale);
                ctx.translate(-this.x, -this.y);
                
                // 受伤时改变圆形颜色为亮红色，否则使用默认颜色
                if (isHurt) {
                    const hurtElapsed = now - (this.hurtUntil - 500);
                    const hurtProgress = Math.min(1.0, hurtElapsed / 500);
                    const redIntensity = 1.0 - hurtProgress;
                    const baseColor = isFrozen ? '#00ffff' : this.color;
                    const r = Math.floor(255 * redIntensity + parseInt(baseColor.slice(1, 3), 16) * (1 - redIntensity));
                    const g = Math.floor(50 * redIntensity + parseInt(baseColor.slice(3, 5), 16) * (1 - redIntensity));
                    const b = Math.floor(50 * redIntensity + parseInt(baseColor.slice(5, 7), 16) * (1 - redIntensity));
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                } else if (isFrozen) {
                    ctx.fillStyle = '#00ffff'; // 冰冻时显示为青色
                } else {
                    ctx.fillStyle = this.color;
                }
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.restore();
            }
        } else {
            // 回退：绘制默认圆形（也应用走动动画）
            ctx.save();
            
            // 应用受伤变红效果（优先于冰冻效果）
            if (isHurt) {
                const hurtElapsed = now - (this.hurtUntil - 500);
                const hurtProgress = Math.min(1.0, hurtElapsed / 500);
                const redIntensity = 1.0 - hurtProgress;
                ctx.filter = `saturate(${1.0 + redIntensity * 2.0}) brightness(${1.0 + redIntensity * 0.8}) hue-rotate(${-redIntensity * 20}deg)`;
            } else if (isFrozen) {
                ctx.filter = 'hue-rotate(180deg) saturate(1.5)';
            }
            
            // 计算走动时的上下缩放效果
            const walkScale = 1.0 + Math.sin(this.walkAnimationTime) * 0.1; // 上下缩放10%
            
            // 应用缩放变换（只缩放Y轴）
            ctx.translate(this.x, this.y);
            ctx.scale(1.0, walkScale);
            ctx.translate(-this.x, -this.y);
            
            // 受伤时改变圆形颜色为亮红色，否则使用默认颜色
            if (isHurt) {
                const hurtElapsed = now - (this.hurtUntil - 500);
                const hurtProgress = Math.min(1.0, hurtElapsed / 500);
                const redIntensity = 1.0 - hurtProgress;
                const baseColor = isFrozen ? '#00ffff' : this.color;
                const r = Math.floor(255 * redIntensity + parseInt(baseColor.slice(1, 3), 16) * (1 - redIntensity));
                const g = Math.floor(50 * redIntensity + parseInt(baseColor.slice(3, 5), 16) * (1 - redIntensity));
                const b = Math.floor(50 * redIntensity + parseInt(baseColor.slice(5, 7), 16) * (1 - redIntensity));
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            } else if (isFrozen) {
                ctx.fillStyle = '#00ffff'; // 冰冻时显示为青色
            } else {
                ctx.fillStyle = this.color;
            }
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // 精英怪：高亮边框/光环
        if (this.isElite) {
            ctx.save();
            ctx.strokeStyle = this.color || '#ffff00';
            ctx.shadowColor = this.color || '#ffff00';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2 + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.restore();
        }
        
        // 头顶显示等级与名称：怪物等级高于玩家用红色，否则用绿色
        const levelColor = this.level > (playerLevel ?? 0) ? '#ff3333' : '#33ff33';
        let label = `Lv.${this.level} ${this.name}`;
        if (this.isElite) label += ' [精英]';
        // 显示★标记
        if (this.hasStar && this.starCount) {
            label += ' ' + '★'.repeat(this.starCount);
        }
        ctx.save();
        ctx.font = 'bold 11px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(label, this.x, this.y - this.size / 2 - 18);
        ctx.fillStyle = levelColor;
        ctx.fillText(label, this.x, this.y - this.size / 2 - 18);
        ctx.restore();
        
        // 绘制血条（比例限制在 [0,1]，避免 hp 异常时血条向左延伸或超出）
        const barWidth = this.size;
        const barHeight = 4;
        const hpRatio = this.maxHp <= 0 ? 0 : Math.max(0, Math.min(1, this.hp / this.maxHp));
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.size / 2 - 10, barWidth, barHeight);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.x - barWidth / 2, this.y - this.size / 2 - 10, barWidth * hpRatio, barHeight);
        
        // 如果被冰冻，绘制冰冻效果（如果使用贴图，在贴图上方绘制）
        if (isFrozen) {
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2 + 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        // 远程怪瞄准阶段：绘制红色弹道预览线
        if (this.isRanged && this.aimStartTime && this.gameInstance && this.gameInstance.player) {
            const aimElapsed = now - this.aimStartTime;
            if (aimElapsed < MONSTER_RANGED_AIM_DURATION) {
                const px = this.gameInstance.player.x;
                const py = this.gameInstance.player.y;
                ctx.save();
                ctx.strokeStyle = '#ff2222';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(px, py);
                ctx.stroke();
                ctx.restore();
            }
        }
    }
}

/**
 * Boss类
 * 用于秘境战斗，继承Monster类并添加特殊技能系统
 */
class Boss extends Monster {
    constructor(x, y, bossId, gameInstance = null) {
        // 检查bossId是否有效
        if (!bossId) {
            throw new Error(`Boss ID未定义！`);
        }
        
        // 检查BOSS_DEFINITIONS是否已加载
        if (typeof BOSS_DEFINITIONS === 'undefined' || !BOSS_DEFINITIONS || BOSS_DEFINITIONS.length === 0) {
            throw new Error(`BOSS_DEFINITIONS未加载或为空！`);
        }
        
        // 通过bossId获取Boss配置
        const bossData = BOSS_DEFINITIONS.find(b => b && b.id === bossId);
        if (!bossData) {
            console.error('可用的Boss ID:', BOSS_DEFINITIONS.map(b => b ? b.id : 'null'));
            throw new Error(`Boss配置不存在: ${bossId}`);
        }
        
        // 使用临时type来初始化Monster（避免Monster构造函数报错，因为bossId不在MONSTER_TYPES中）
        super(x, y, 'demonBoss', gameInstance);
        
        // 覆盖Monster的属性为Boss的属性
        this.bossId = bossId;
        // 设置type为bossId，这样draw方法可以使用对应的贴图
        this.type = bossId;
        this.name = bossData.name;
        this.maxHp = bossData.hp;
        this.hp = this.maxHp;
        this.damage = bossData.damage;
        this.color = bossData.color;
        this.level = bossData.level;
        this.expReward = bossData.expReward;
        this.goldReward = bossData.goldReward;
        this.size = CONFIG.MONSTER_SIZE * 1.5; // Boss更大
        this.speed = CONFIG.MONSTER_SPEED * 0.8; // Boss稍慢但更强大
        
        // Boss技能系统
        this.skills = bossData.skills || [];
        this.skillCooldowns = {}; // 技能冷却时间 {skillName: lastUseTime}
        this.activeSkills = []; // 当前激活的技能效果
        
        // Boss状态
        this.isBerserk = false; // 是否处于狂暴状态
        this.berserkEndTime = 0;
        
        // 技能特效
        this.skillEffects = []; // 当前技能特效 [{type, x, y, radius, damage, startTime, duration, ...}]
    }
    
    /**
     * 更新Boss（包括技能系统）
     */
    update(player) {
        const now = Date.now();
        
        // 更新Boss状态
        if (this.isBerserk && now >= this.berserkEndTime) {
            this.isBerserk = false;
            this.speed = CONFIG.MONSTER_SPEED * 0.8; // 恢复原速度
            this.maxSpeed = this.speed; // 更新最大速度（用于加速度系统）
        }
        
        // 更新技能冷却
        this.skills.forEach(skill => {
            if (this.skillCooldowns[skill.name]) {
                if (now - this.skillCooldowns[skill.name] >= skill.cooldown) {
                    // 技能冷却完成，可以使用
                }
            }
        });
        
        // 执行技能
        this.executeSkills(player, now);
        
        // 更新技能特效（传入player用于追踪弹追踪）
        this.updateSkillEffects(now, player);
        
        // 调用父类的update方法
        super.update(player);
    }
    
    /**
     * 执行技能
     */
    executeSkills(player, now) {
        this.skills.forEach(skill => {
            const lastUseTime = this.skillCooldowns[skill.name] || 0;
            if (now - lastUseTime >= skill.cooldown) {
                // 技能冷却完成，执行技能
                this.useSkill(skill, player, now);
                this.skillCooldowns[skill.name] = now;
            }
        });
    }
    
    /**
     * 使用技能
     */
    useSkill(skill, player, now) {
        switch (skill.type) {
            case 'charge':
                // 冲锋技能
                this.chargeSkill(skill, player, now);
                break;
            case 'aoe':
                // 范围攻击技能
                this.aoeSkill(skill, now);
                break;
            case 'projectile':
                // 追踪弹技能
                this.projectileSkill(skill, player, now);
                break;
            case 'berserk':
                // 狂暴技能
                this.berserkSkill(skill, now);
                break;
        }
    }
    
    /**
     * 冲锋技能
     */
    chargeSkill(skill, player, now) {
        // 计算方向
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) return;
        
        const angle = Math.atan2(dy, dx);
        
        // 创建冲锋效果
        this.skillEffects.push({
            type: 'charge',
            x: this.x,
            y: this.y,
            angle: angle,
            speed: skill.speed,
            damage: skill.damage,
            startTime: now,
            duration: skill.duration,
            distance: 0,
            maxDistance: skill.speed * (skill.duration / 1000)
        });
    }
    
    /**
     * 范围攻击技能
     */
    aoeSkill(skill, now) {
        // 创建范围攻击效果
        this.skillEffects.push({
            type: 'aoe',
            x: this.x,
            y: this.y,
            radius: 0,
            maxRadius: skill.radius,
            damage: skill.damage,
            startTime: now,
            duration: skill.duration
        });
    }
    
    /**
     * 追踪弹技能
     */
    projectileSkill(skill, player, now) {
        // 创建多个追踪弹
        for (let i = 0; i < skill.count; i++) {
            const angle = Math.atan2(player.y - this.y, player.x - this.x) + (Math.PI * 2 * i / skill.count);
            this.skillEffects.push({
                type: 'projectile',
                x: this.x,
                y: this.y,
                targetX: player.x,
                targetY: player.y,
                angle: angle,
                speed: skill.speed,
                damage: skill.damage,
                startTime: now,
                duration: skill.duration
            });
        }
    }
    
    /**
     * 狂暴技能
     */
    berserkSkill(skill, now) {
        this.isBerserk = true;
        this.berserkEndTime = now + skill.duration;
        this.speed = CONFIG.MONSTER_SPEED * 0.8 * skill.moveSpeedMultiplier;
        this.maxSpeed = this.speed; // 更新最大速度（用于加速度系统）
    }
    
    /**
     * 更新技能特效
     * @param {number} now - 当前时间
     * @param {Player} player - 玩家对象（用于追踪弹追踪）
     */
    updateSkillEffects(now, player = null) {
        this.skillEffects = this.skillEffects.filter(effect => {
            const elapsed = now - effect.startTime;
            
            switch (effect.type) {
                case 'charge':
                    // 更新冲锋位置
                    effect.x += Math.cos(effect.angle) * effect.speed;
                    effect.y += Math.sin(effect.angle) * effect.speed;
                    effect.distance += effect.speed;
                    return elapsed < effect.duration && effect.distance < effect.maxDistance;
                    
                case 'aoe':
                    // 更新范围攻击半径
                    effect.radius = (elapsed / effect.duration) * effect.maxRadius;
                    return elapsed < effect.duration;
                    
                case 'projectile':
                    // 更新追踪弹位置（实时追踪玩家）
                    if (player) {
                        effect.targetX = player.x;
                        effect.targetY = player.y;
                    }
                    const dx = effect.targetX - effect.x;
                    const dy = effect.targetY - effect.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > 0) {
                        effect.angle = Math.atan2(dy, dx);
                        effect.x += Math.cos(effect.angle) * effect.speed;
                        effect.y += Math.sin(effect.angle) * effect.speed;
                    }
                    return elapsed < effect.duration;
            }
            
            return elapsed < effect.duration;
        });
    }
    
    /**
     * 检查技能是否击中玩家
     */
    checkSkillHit(player) {
        const now = Date.now();
        const hits = [];
        
        this.skillEffects.forEach(effect => {
            const elapsed = now - effect.startTime;
            
            // 避免重复伤害：每个技能效果只能造成一次伤害
            if (effect.hitPlayer) return;
            
            const dx = player.x - effect.x;
            const dy = player.y - effect.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            switch (effect.type) {
                case 'charge':
                    if (distance < this.size / 2 + CONFIG.PLAYER_SIZE / 2 && elapsed > 50) {
                        hits.push({ damage: effect.damage, type: 'charge' });
                        effect.hitPlayer = true; // 标记已命中
                    }
                    break;
                    
                case 'aoe':
                    if (distance < effect.radius + CONFIG.PLAYER_SIZE / 2 && elapsed > 200) {
                        hits.push({ damage: effect.damage, type: 'aoe' });
                        effect.hitPlayer = true; // 标记已命中
                    }
                    break;
                    
                case 'projectile':
                    if (distance < 20 + CONFIG.PLAYER_SIZE / 2) {
                        hits.push({ damage: effect.damage, type: 'projectile' });
                        effect.hitPlayer = true; // 标记已命中
                        effect.duration = 0; // 移除已命中的追踪弹
                    }
                    break;
            }
        });
        
        return hits;
    }
    
    /**
     * 绘制Boss（包括技能特效）
     */
    draw(ctx, playerLevel = 1) {
        // 绘制Boss本体
        super.draw(ctx, playerLevel);
        
        // 绘制技能特效
        this.drawSkillEffects(ctx);
        
        // 如果处于狂暴状态，绘制特效
        if (this.isBerserk) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2 + 5, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    
    /**
     * 绘制技能特效
     */
    drawSkillEffects(ctx) {
        this.skillEffects.forEach(effect => {
            switch (effect.type) {
                case 'charge':
                    // 绘制冲锋轨迹（矩形）
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.fillRect(effect.x - 15, effect.y - 15, 30, 30);
                    break;
                    
                case 'aoe':
                    // 绘制范围攻击（圆形）
                    ctx.strokeStyle = '#ff0000';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                    ctx.fill();
                    break;
                    
                case 'projectile':
                    // 绘制追踪弹（小圆形）
                    ctx.fillStyle = '#ffaa00';
                    ctx.beginPath();
                    ctx.arc(effect.x, effect.y, 10, 0, Math.PI * 2);
                    ctx.fill();
                    break;
            }
        });
    }
}

/**
 * 训练桩类
 * 用于训练场，不会死亡，显示DPS、累计伤害和异常状态
 */
class TrainingDummy {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;
        this.size = CONFIG.MONSTER_SIZE;
        this.maxHp = 999999; // 无限血量
        this.hp = this.maxHp;
        this.color = '#666666'; // 灰色训练桩
        
        // 可配置属性
        this.chasePlayer = options.chasePlayer !== undefined ? options.chasePlayer : true; // 是否追击玩家
        this.invincible = options.invincible !== undefined ? options.invincible : true; // 是否无敌
        this.hasDetectedPlayer = false; // 是否已发现玩家
        
        // 伤害统计
        this.totalDamage = 0; // 累计总伤害
        this.damageHistory = []; // 伤害历史记录（用于计算DPS）
        this.dpsWindow = 5000; // DPS计算窗口（5秒）
        
        // 异常状态
        this.statusEffects = {
            frozen: null, // 冰冻 {until: timestamp}
            slowed: null, // 减速 {until: timestamp, multiplier: number}
            attackSpeedDebuff: null, // 攻击速度降低 {until: timestamp, multiplier: number}
            burning: [] // 燃烧效果 [{damage: number, duration: number, startTime: timestamp}]
        };
        
        this.createdTime = Date.now();
        this.speed = CONFIG.MONSTER_SPEED;
        this.angle = 0;
        
        // 加速度系统
        this.vx = 0; // X方向速度
        this.vy = 0; // Y方向速度
        this.maxSpeed = CONFIG.MONSTER_SPEED; // 最大速度
        this.acceleration = 0.25; // 加速度系数
        this.friction = 0.9; // 摩擦力系数（每帧速度衰减）
    }
    
    /**
     * 更新训练假人（如果允许追击）
     */
    update(player) {
        if (!this.chasePlayer) return;
        
        const now = Date.now();
        
        // 检查是否被冰冻
        if (this.statusEffects.frozen && now < this.statusEffects.frozen.until) {
            return; // 被冰冻时不能移动
        }
        
        // 计算移动速度（考虑减速效果）
        let currentMaxSpeed = this.speed;
        if (this.statusEffects.slowed && now < this.statusEffects.slowed.until) {
            currentMaxSpeed = this.speed * this.statusEffects.slowed.multiplier;
        }
        this.maxSpeed = currentMaxSpeed;
        
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 检查是否在发现范围内
        const detectionRange = CONFIG.MONSTER_DETECTION_RANGE || 150;
        const chaseRange = CONFIG.MONSTER_CHASE_RANGE || 250;
        
        if (distance < detectionRange) {
            // 在发现范围内，标记为已发现
            this.hasDetectedPlayer = true;
        }
        
        // 如果已发现玩家，检查是否在追击范围内
        if (this.hasDetectedPlayer) {
            if (distance > chaseRange) {
                // 玩家逃出追击范围，停止追击
                this.hasDetectedPlayer = false;
                // 应用摩擦力减速
                this.vx *= this.friction;
                this.vy *= this.friction;
                
                // 更新位置
                this.x += this.vx;
                this.y += this.vy;
            } else if (distance > CONFIG.MONSTER_ATTACK_RANGE) {
                // 在追击范围内但不在攻击范围内，追击玩家
                // 计算目标方向
                this.angle = Math.atan2(dy, dx);
                const targetVx = Math.cos(this.angle) * this.maxSpeed;
                const targetVy = Math.sin(this.angle) * this.maxSpeed;
                
                // 应用加速度
                this.vx += (targetVx - this.vx) * this.acceleration;
                this.vy += (targetVy - this.vy) * this.acceleration;
                
                // 限制最大速度
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (currentSpeed > this.maxSpeed) {
                    const scale = this.maxSpeed / currentSpeed;
                    this.vx *= scale;
                    this.vy *= scale;
                }
                
                // 更新位置
                this.x += this.vx;
                this.y += this.vy;
            } else {
                // 在攻击范围内，停止移动（准备攻击）
                // 应用摩擦力减速
                this.vx *= this.friction;
                this.vy *= this.friction;
                
                // 更新位置
                this.x += this.vx;
                this.y += this.vy;
            }
        } else {
            // 未发现玩家，应用摩擦力减速
            this.vx *= this.friction;
            this.vy *= this.friction;
            
            // 更新位置
            this.x += this.vx;
            this.y += this.vy;
        }
    }
    
    /**
     * 受到伤害
     * @param {number} amount - 伤害值
     */
    takeDamage(amount) {
        const now = Date.now();
        
        // 记录伤害
        this.totalDamage += amount;
        this.damageHistory.push({
            damage: amount,
            time: now
        });
        
        // 清理过期的伤害记录（只保留最近5秒的）
        this.damageHistory = this.damageHistory.filter(record => 
            now - record.time <= this.dpsWindow
        );
        
        // 如果无敌，hp始终保持满值
        if (this.invincible) {
            this.hp = this.maxHp;
            return false; // 永远返回false，表示不会死亡
        } else {
            // 如果不是无敌，正常扣血
            this.hp -= amount;
            return this.hp <= 0;
        }
    }
    
    /**
     * 添加异常状态
     */
    addStatusEffect(type, data) {
        const now = Date.now();
        
        switch(type) {
            case 'frozen':
                this.statusEffects.frozen = { until: now + (data.duration || 2000) };
                break;
            case 'slowed':
                this.statusEffects.slowed = { 
                    until: now + (data.duration || 2000),
                    multiplier: data.multiplier || 0.5
                };
                break;
            case 'attackSpeedDebuff':
                if (!this.statusEffects.attackSpeedDebuff) {
                    this.statusEffects.attackSpeedDebuff = [];
                }
                this.statusEffects.attackSpeedDebuff.push({
                    until: now + (data.duration || 2000),
                    multiplier: data.multiplier || 0.5
                });
                break;
            case 'burning':
                if (!this.statusEffects.burning) {
                    this.statusEffects.burning = [];
                }
                this.statusEffects.burning.push({
                    damage: data.damage || 0,
                    duration: data.duration || 3000,
                    startTime: now
                });
                break;
        }
    }
    
    /**
     * 更新异常状态
     */
    updateStatusEffects() {
        const now = Date.now();
        
        // 清理过期的冰冻效果
        if (this.statusEffects.frozen && now >= this.statusEffects.frozen.until) {
            this.statusEffects.frozen = null;
        }
        
        // 清理过期的减速效果
        if (this.statusEffects.slowed && now >= this.statusEffects.slowed.until) {
            this.statusEffects.slowed = null;
        }
        
        // 清理过期的攻击速度降低效果
        if (this.statusEffects.attackSpeedDebuff) {
            this.statusEffects.attackSpeedDebuff = this.statusEffects.attackSpeedDebuff.filter(
                effect => now < effect.until
            );
            if (this.statusEffects.attackSpeedDebuff.length === 0) {
                this.statusEffects.attackSpeedDebuff = null;
            }
        }
        
        // 清理过期的燃烧效果
        if (this.statusEffects.burning) {
            this.statusEffects.burning = this.statusEffects.burning.filter(
                effect => now - effect.startTime < effect.duration
            );
            if (this.statusEffects.burning.length === 0) {
                this.statusEffects.burning = [];
            }
        }
    }
    
    /**
     * 获取当前DPS
     */
    getCurrentDPS() {
        const now = Date.now();
        const recentDamage = this.damageHistory.filter(record => 
            now - record.time <= this.dpsWindow
        );
        
        if (recentDamage.length === 0) return 0;
        
        const totalDamage = recentDamage.reduce((sum, record) => sum + record.damage, 0);
        const oldestTime = Math.min(...recentDamage.map(r => r.time));
        const timeSpan = Math.max(1000, now - oldestTime); // 至少1秒
        
        return (totalDamage / timeSpan) * 1000; // 转换为每秒伤害
    }
    
    /**
     * 获取异常状态列表
     */
    getStatusEffectsList() {
        const now = Date.now();
        const effects = [];
        
        if (this.statusEffects.frozen && now < this.statusEffects.frozen.until) {
            effects.push({
                name: '冰冻',
                color: '#00ffff',
                remaining: Math.ceil((this.statusEffects.frozen.until - now) / 1000)
            });
        }
        
        if (this.statusEffects.slowed && now < this.statusEffects.slowed.until) {
            effects.push({
                name: '减速',
                color: '#8888ff',
                remaining: Math.ceil((this.statusEffects.slowed.until - now) / 1000)
            });
        }
        
        if (this.statusEffects.attackSpeedDebuff && this.statusEffects.attackSpeedDebuff.length > 0) {
            const maxRemaining = Math.max(...this.statusEffects.attackSpeedDebuff.map(e => e.until - now));
            if (maxRemaining > 0) {
                effects.push({
                    name: '攻击速度降低',
                    color: '#ff8888',
                    remaining: Math.ceil(maxRemaining / 1000)
                });
            }
        }
        
        if (this.statusEffects.burning && this.statusEffects.burning.length > 0) {
            const maxRemaining = Math.max(...this.statusEffects.burning.map(e => 
                e.duration - (now - e.startTime)
            ));
            if (maxRemaining > 0) {
                effects.push({
                    name: '燃烧',
                    color: '#ff6600',
                    remaining: Math.ceil(maxRemaining / 1000)
                });
            }
        }
        
        return effects;
    }
    
    /**
     * 绘制训练桩
     */
    draw(ctx) {
        const now = Date.now();
        
        // 更新异常状态
        this.updateStatusEffects();
        
        // 如果被冰冻，改变颜色
        if (this.statusEffects.frozen && now < this.statusEffects.frozen.until) {
            ctx.fillStyle = '#00ffff'; // 冰冻时显示为青色
        } else {
            ctx.fillStyle = this.color;
        }
        
        // 绘制训练桩主体
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制边框
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 绘制信息面板背景
        const panelY = this.y - this.size / 2 - 80;
        const panelWidth = 200;
        const panelHeight = 60;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(this.x - panelWidth / 2, panelY, panelWidth, panelHeight);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - panelWidth / 2, panelY, panelWidth, panelHeight);
        
        // 绘制DPS
        const dps = this.getCurrentDPS();
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(`DPS: ${dps.toFixed(1)}`, this.x, panelY + 15);
        
        // 绘制累计伤害
        ctx.fillText(`累计伤害: ${Math.floor(this.totalDamage)}`, this.x, panelY + 30);
        
        // 绘制异常状态
        const statusEffects = this.getStatusEffectsList();
        if (statusEffects.length > 0) {
            let statusText = '状态: ';
            statusEffects.forEach((effect, index) => {
                if (index > 0) statusText += ', ';
                statusText += `${effect.name}(${effect.remaining}s)`;
            });
            ctx.fillStyle = '#ffff00';
            ctx.font = '10px Courier New';
            ctx.fillText(statusText, this.x, panelY + 45);
        }
        
        // 如果被冰冻，绘制冰冻效果
        if (this.statusEffects.frozen && now < this.statusEffects.frozen.until) {
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2 + 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        // 如果燃烧，绘制燃烧效果
        if (this.statusEffects.burning && this.statusEffects.burning.length > 0) {
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2 + 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}

/**
 * 怪物类型训练假人类
 * 继承Monster但显示DPS和累计伤害，可配置是否无敌和追击
 */
class MonsterTrainingDummy extends Monster {
    constructor(x, y, type, options = {}) {
        const gameInstance = options.gameInstance !== undefined ? options.gameInstance : null;
        super(x, y, type, gameInstance);
        
        // 可配置属性
        this.chasePlayer = options.chasePlayer !== undefined ? options.chasePlayer : true; // 是否追击玩家
        this.invincible = options.invincible !== undefined ? options.invincible : true; // 是否无敌
        
        // 伤害统计
        this.totalDamage = 0; // 累计总伤害
        this.damageHistory = []; // 伤害历史记录（用于计算DPS）
        this.dpsWindow = 5000; // DPS计算窗口（5秒）
        
        // 如果无敌，设置无限血量
        if (this.invincible) {
            this.maxHp = 999999;
            this.hp = this.maxHp;
        }
    }
    
    /**
     * 更新怪物（如果允许追击）
     */
    update(player) {
        if (!this.chasePlayer) return;
        super.update(player);
    }
    
    /**
     * 受到伤害
     */
    takeDamage(amount) {
        const now = Date.now();
        
        // 记录伤害
        this.totalDamage += amount;
        this.damageHistory.push({
            damage: amount,
            time: now
        });
        
        // 清理过期的伤害记录（只保留最近5秒的）
        this.damageHistory = this.damageHistory.filter(record => 
            now - record.time <= this.dpsWindow
        );
        
        // 如果无敌，hp始终保持满值
        if (this.invincible) {
            this.hp = this.maxHp;
            return false; // 永远返回false，表示不会死亡
        } else {
            // 如果不是无敌，正常扣血
            this.hp -= amount;
            return this.hp <= 0;
        }
    }
    
    /**
     * 获取当前DPS
     */
    getCurrentDPS() {
        const now = Date.now();
        const recentDamage = this.damageHistory.filter(record => 
            now - record.time <= this.dpsWindow
        );
        
        if (recentDamage.length === 0) return 0;
        
        const totalDamage = recentDamage.reduce((sum, record) => sum + record.damage, 0);
        const oldestTime = Math.min(...recentDamage.map(r => r.time));
        const timeSpan = Math.max(1000, now - oldestTime); // 至少1秒
        
        return (totalDamage / timeSpan) * 1000; // 转换为每秒伤害
    }
    
    /**
     * 绘制怪物（带DPS信息）
     */
    draw(ctx) {
        // 先绘制怪物本身
        super.draw(ctx);
        
        // 绘制信息面板背景
        const panelY = this.y - this.size / 2 - 80;
        const panelWidth = 200;
        const panelHeight = 60;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(this.x - panelWidth / 2, panelY, panelWidth, panelHeight);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x - panelWidth / 2, panelY, panelWidth, panelHeight);
        
        // 绘制DPS
        const dps = this.getCurrentDPS();
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(`DPS: ${dps.toFixed(1)}`, this.x, panelY + 15);
        
        // 绘制累计伤害
        ctx.fillText(`累计伤害: ${Math.floor(this.totalDamage)}`, this.x, panelY + 30);
        
        // 绘制名称
        ctx.fillText(this.name, this.x, panelY + 45);
    }
}

/**
 * 主城场景类
 * 用于绘制和管理主城场景，包含建筑物交互
 */
class TownScene {
    constructor(gameInstance = null) {
        this.gameInstance = gameInstance;
        this.width = CONFIG.CANVAS_WIDTH;
        this.height = CONFIG.CANVAS_HEIGHT;
        this.buildings = {
            towerEntrance: { x: this.width / 2, y: this.height / 2, size: 60, name: '恶魔塔入口', type: 'tower_entrance' },
            blacksmith: { x: 200, y: 200, size: 50, name: '铁匠铺', type: 'blacksmith' },
            shop: { x: this.width - 200, y: 200, size: 50, name: '商店', type: 'shop' },
            trainingGround: { x: 200, y: this.height - 200, size: 50, name: '训练场', type: 'training_ground' }
        };
        // 预加载贴图
        this._preloadTextures();
    }

    async _preloadTextures() {
        if (!this.gameInstance || !this.gameInstance.assetManager) {
            console.warn('TownScene: assetManager 未初始化，跳过贴图预加载');
            return;
        }
        
        const assetManager = this.gameInstance.assetManager;
        // 预加载地板贴图
        const floorImageName = assetManager.getFloorImageName('town');
        if (floorImageName) {
            await assetManager.loadEntityImage(floorImageName);
        }

        // 预加载建筑贴图
        for (const building of Object.values(this.buildings)) {
            const imageName = assetManager.getBuildingImageName(building.type);
            if (imageName) {
                await assetManager.loadEntityImage(imageName);
            }
        }
    }

    draw(ctx) {
        const assetManager = this.gameInstance?.assetManager;
        
        // 绘制地板贴图
        if (assetManager) {
            const floorImageName = assetManager.getFloorImageName('town');
            if (floorImageName) {
                const floorImg = assetManager.entityImageCache.get(floorImageName);
                if (floorImg) {
                    // 平铺地板贴图
                    const tileSize = CONFIG.TILE_SIZE || 50;
                    for (let x = 0; x < this.width; x += tileSize) {
                        for (let y = 0; y < this.height; y += tileSize) {
                            ctx.drawImage(floorImg, x, y, tileSize, tileSize);
                        }
                    }
                } else {
                    // 回退：绘制默认背景
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(0, 0, this.width, this.height);
                }
            } else {
                // 回退：绘制默认背景
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, this.width, this.height);
            }
        } else {
            // 回退：绘制默认背景
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, this.width, this.height);
        }
        
        // 绘制建筑物（使用贴图）
        if (assetManager) {
            for (const building of Object.values(this.buildings)) {
                const imageName = assetManager.getBuildingImageName(building.type);
                if (imageName) {
                    const img = assetManager.entityImageCache.get(imageName);
                    if (img) {
                        assetManager.drawEntityImage(ctx, img, building.x, building.y, building.size, building.size);
                    } else {
                        // 回退：绘制默认颜色方块
                        this._drawBuildingFallback(ctx, building);
                    }
                } else {
                    // 回退：绘制默认颜色方块
                    this._drawBuildingFallback(ctx, building);
                }
            }
        } else {
            // 回退：绘制默认颜色方块
            for (const building of Object.values(this.buildings)) {
                this._drawBuildingFallback(ctx, building);
            }
        }
        
        // 绘制建筑名称（铁匠铺上方增加合铸状态行）
        ctx.textAlign = 'center';
        Object.values(this.buildings).forEach(building => {
            if (building.type === 'blacksmith' && this.gameInstance && typeof this.gameInstance.getFusionTownStatusText === 'function') {
                const fusionLine = this.gameInstance.getFusionTownStatusText();
                ctx.fillStyle = '#bbbbbb';
                ctx.font = '12px "Courier New", monospace';
                ctx.fillText(fusionLine, building.x, building.y + building.size / 2 + 6);
                ctx.fillStyle = '#fff';
                ctx.font = '14px "Courier New", monospace';
                ctx.fillText(building.name, building.x, building.y + building.size / 2 + 22);
            } else {
                ctx.fillStyle = '#fff';
                ctx.font = '14px "Courier New", monospace';
                ctx.fillText(building.name, building.x, building.y + building.size / 2 + 15);
            }
        });
    }

    _drawBuildingFallback(ctx, building) {
        // 回退绘制方法：使用原来的颜色方块
        const colors = {
            tower_entrance: { fill: '#6a0dad', stroke: '#8b00ff' },
            blacksmith: { fill: '#8b4513', stroke: '#ff6600' },
            shop: { fill: '#daa520', stroke: '#ffd700' },
            training_ground: { fill: '#2d5016', stroke: '#4a9eff' }
        };
        const color = colors[building.type] || { fill: '#ffffff', stroke: '#000000' };
        ctx.fillStyle = color.fill;
        ctx.fillRect(building.x - building.size / 2, building.y - building.size / 2, building.size, building.size);
        ctx.strokeStyle = color.stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(building.x - building.size / 2, building.y - building.size / 2, building.size, building.size);
    }

    checkInteraction(player) {
        const interactions = [];
        Object.values(this.buildings).forEach(building => {
            const dx = building.x - player.x;
            const dy = building.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < building.size / 2 + 30) {
                interactions.push(building);
            }
        });
        return interactions;
    }
}

/**
 * 训练场场景类
 * 用于绘制和管理训练场场景，包含训练桩
 */
class TrainingGroundScene {
    constructor(gameInstance = null) {
        this.gameInstance = gameInstance;
        this.width = CONFIG.CANVAS_WIDTH;
        this.height = CONFIG.CANVAS_HEIGHT;
        this.dummies = []; // 训练桩列表
        this.exitPortal = { 
            x: 50, 
            y: 50, 
            size: 40, 
            name: '返回主城' 
        };
    }
    
    /**
     * 添加训练桩
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {Object} options - 配置选项
     */
    addDummy(x, y, options = {}) {
        const dummy = new TrainingDummy(x, y, options);
        this.dummies.push(dummy);
        return dummy;
    }
    
    /**
     * 添加怪物类型训练假人
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {string} monsterType - 怪物类型
     * @param {Object} options - 配置选项
     */
    addMonsterDummy(x, y, monsterType, options = {}) {
        const opts = { ...options };
        if (this.gameInstance && opts.gameInstance === undefined) opts.gameInstance = this.gameInstance;
        const dummy = new MonsterTrainingDummy(x, y, monsterType, opts);
        this.dummies.push(dummy);
        return dummy;
    }
    
    /**
     * 移除训练桩
     * @param {TrainingDummy} dummy - 要移除的训练桩
     */
    removeDummy(dummy) {
        const index = this.dummies.indexOf(dummy);
        if (index > -1) {
            this.dummies.splice(index, 1);
        }
    }
    
    /**
     * 清空所有训练桩
     */
    clearAllDummies() {
        this.dummies = [];
    }
    
    /**
     * 检查交互
     * @param {Player} player - 玩家对象
     */
    checkInteraction(player) {
        const interactions = [];
        
        // 检查退出传送门
        const dx = this.exitPortal.x - player.x;
        const dy = this.exitPortal.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.exitPortal.size / 2 + 30) {
            interactions.push(this.exitPortal);
        }
        
        return interactions;
    }
    
    /**
     * 绘制训练场场景
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     */
    draw(ctx) {
        const assetManager = this.gameInstance?.assetManager;
        
        // 绘制地板贴图
        if (assetManager) {
            const floorImageName = assetManager.getFloorImageName('training');
            if (floorImageName) {
                const floorImg = assetManager.entityImageCache.get(floorImageName);
                if (floorImg) {
                    // 平铺地板贴图
                    const tileSize = CONFIG.TILE_SIZE || 50;
                    for (let x = 0; x < this.width; x += tileSize) {
                        for (let y = 0; y < this.height; y += tileSize) {
                            ctx.drawImage(floorImg, x, y, tileSize, tileSize);
                        }
                    }
                } else {
                    // 回退：绘制默认背景
                    ctx.fillStyle = '#0a0a1a';
                    ctx.fillRect(0, 0, this.width, this.height);
                }
            } else {
                // 回退：绘制默认背景
                ctx.fillStyle = '#0a0a1a';
                ctx.fillRect(0, 0, this.width, this.height);
            }
        } else {
            // 回退：绘制默认背景
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, this.width, this.height);
        }
        
        // 绘制退出传送门
        ctx.fillStyle = '#6a0dad';
        ctx.fillRect(
            this.exitPortal.x - this.exitPortal.size / 2,
            this.exitPortal.y - this.exitPortal.size / 2,
            this.exitPortal.size,
            this.exitPortal.size
        );
        ctx.strokeStyle = '#8b00ff';
        ctx.lineWidth = 3;
        ctx.strokeRect(
            this.exitPortal.x - this.exitPortal.size / 2,
            this.exitPortal.y - this.exitPortal.size / 2,
            this.exitPortal.size,
            this.exitPortal.size
        );
        ctx.fillStyle = '#fff';
        ctx.font = '12px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('返回', this.exitPortal.x, this.exitPortal.y + 5);
        
        // 绘制所有训练桩（不绘制已死亡的非无敌怪物型假人）
        this.dummies.forEach(dummy => {
            if (dummy instanceof MonsterTrainingDummy && !dummy.invincible && dummy.hp <= 0) return;
            dummy.draw(ctx);
        });
    }
}

function getMonsterMaxLevelCap() {
    return (typeof CONFIG !== 'undefined' && CONFIG.MONSTER_MAX_LEVEL != null) ? CONFIG.MONSTER_MAX_LEVEL : 60;
}

function maxMonsterLevelForFloor(floor) {
    const cap = getMonsterMaxLevelCap();
    const maxF = (typeof window.getTowerMaxFloor === 'function') ? window.getTowerMaxFloor() : 240;
    if (floor <= 1) return 1;
    return Math.min(cap, Math.max(1, Math.round(1 + (floor - 1) * (cap - 1) / Math.max(1, maxF - 1))));
}

/**
 * 恶魔塔普通战斗房：该怪物类型最早可出现楼层（避免底层刷出高模板血量的骷髅/兽人/恶魔，仅压等级仍像首领）
 * 哥布林系：1 层起；骷髅系：6 层起；兽人系：16 层起；恶魔 15 档：26 层起；恶魔 20 档：41 层起
 */
function towerMinFloorForMonsterType(type, monsterData) {
    if (!monsterData || monsterData.isElite || (typeof type === 'string' && type.endsWith('_elite'))) return 0;
    if (monsterData.towerMinFloor != null && monsterData.towerMinFloor >= 0) return monsterData.towerMinFloor;
    const t = String(type);
    if (t.startsWith('goblin')) return 1;
    if (t.startsWith('skeleton')) return 6;
    if (t.startsWith('orc')) return 16;
    if (t.startsWith('demon')) {
        const lv = monsterData.level != null ? monsterData.level : 1;
        if (lv >= 20) return 41;
        return 26;
    }
    return 1;
}

function boostMonsterTowardLevel(monster, targetLevel) {
    const delta = targetLevel - monster.level;
    if (delta === 0) return;
    // 低层 maxLevel 为 1～2 时，必须把模板里 5/10/15/20 级的怪「压级」，仅向上 boost 会导致第一层仍出现高级怪
    // 略低于旧版 1.082，避免高层怪物血量复合远超玩家攻击成长（与深阶装备、等级攻击补正配套）
    const mult = Math.pow(1.056, delta);
    monster.maxHp = Math.max(1, Math.floor(monster.maxHp * mult));
    monster.hp = monster.maxHp;
    monster.damage = Math.max(1, Math.floor(monster.damage * mult));
    monster._baseDamage = monster.damage;
    const rewardMult = Math.pow(1.035, delta);
    monster.expReward = Math.max(0, Math.floor(monster.expReward * rewardMult));
    monster.goldReward = Math.max(0, Math.floor(monster.goldReward * rewardMult));
    monster.level = targetLevel;
}

/**
 * 房间类
 * 用于表示恶魔塔中的房间，包含房间类型、内容生成等功能
 */
class Room {
    constructor(width, height, type, floor, gameInstance = null) {
        this.type = type;
        this.floor = floor;
        this.gameInstance = gameInstance;
        // 扩大地图尺寸：宽度和高度都增加50%
        this.width = width || (CONFIG.CANVAS_WIDTH * 1.5);
        this.height = height || (CONFIG.CANVAS_HEIGHT * 1.5);
        this.monsters = [];
        this.treasureChest = null;
        this.restItem = null;
        this.cleared = false;
        // 预加载贴图
        this._preloadTextures();
    }

    async _preloadTextures() {
        if (!this.gameInstance || !this.gameInstance.assetManager) {
            console.warn('Room: assetManager 未初始化，跳过贴图预加载');
            return;
        }
        
        const assetManager = this.gameInstance.assetManager;
        // 预加载地板贴图
        const floorImageName = assetManager.getFloorImageName('tower');
        if (floorImageName) {
            await assetManager.loadEntityImage(floorImageName);
        }

        // 预加载房间实体贴图（这些实体在 generateRoom() 中创建）
        if (this.treasureChest) {
            const imageName = assetManager.getRoomEntityImageName('treasure_chest');
            if (imageName) {
                await assetManager.loadEntityImage(imageName);
            }
        }
        if (this.restItem) {
            const restType = this.restItem.type;
            const imageName = assetManager.getRoomEntityImageName(`rest_${restType}`);
            if (imageName) {
                await assetManager.loadEntityImage(imageName);
            }
        }
        
        // 预加载所有portal贴图（next, fight, exit, return_town, exit_dungeon）
        const portalTypes = ['next', 'fight', 'exit', 'return_town', 'exit_dungeon'];
        for (const portalType of portalTypes) {
            const portalImageName = assetManager.getPortalImageName(portalType);
            if (portalImageName) {
                await assetManager.loadEntityImage(portalImageName);
            }
        }
    }

    generateRoom(playerLevel = 1) {
        if (this.type === ROOM_TYPES.BATTLE) {
            // 战斗房间：根据玩家水平动态生成怪物
            const monsterCount = 3 + Math.floor(this.floor / 3);
            
            // 根据玩家等级和楼层动态生成怪物
            // 一层里会生成几只超过玩家水平/等级的怪物
            const overLevelCount = Math.max(1, Math.floor(monsterCount * 0.3)); // 30%的怪物超过玩家等级
            
            // 收集所有可用的怪物类型（普通战斗房不包含精英怪，精英怪仅在精英房生成）
            const allMonsterTypes = Object.keys(MONSTER_TYPES);
            const availableMonsters = [];
            const overLevelMonsters = [];
            
            const maxLevelForFloor = maxMonsterLevelForFloor(this.floor);
            // 开发者模式等极高玩家等级会导致筛选池异常；用楼层上限钳制用于刷怪的「有效等级」
            const spawnPlayerLevel = Math.min(Math.max(playerLevel, 1), maxLevelForFloor + 5);
            
            allMonsterTypes.forEach(type => {
                const monsterData = MONSTER_TYPES[type];
                if (monsterData.isElite || (typeof type === 'string' && type.endsWith('_elite'))) return;
                const maxLvCap = getMonsterMaxLevelCap();
                if (monsterData.level <= maxLvCap) {
                    if (this.floor < towerMinFloorForMonsterType(type, monsterData)) return;
                    availableMonsters.push({ type, level: monsterData.level });
                    // 超过有效玩家等级的怪物
                    if (monsterData.level > spawnPlayerLevel) {
                        overLevelMonsters.push({ type, level: monsterData.level });
                    }
                }
            });
            
            // 生成超过玩家水平的怪物
            for (let i = 0; i < overLevelCount && overLevelMonsters.length > 0; i++) {
                const selected = overLevelMonsters[Math.floor(Math.random() * overLevelMonsters.length)];
                const x = 100 + Math.random() * (this.width - 200);
                const y = 100 + Math.random() * (this.height - 200);
                const monster = new Monster(x, y, selected.type, this.gameInstance);
                const tLo = Math.max(1, maxLevelForFloor - 10);
                const tHi = maxLevelForFloor;
                boostMonsterTowardLevel(monster, tLo + Math.floor(Math.random() * Math.max(1, tHi - tLo + 1)));
                this.monsters.push(monster);
            }
            
            // 生成其他怪物（根据玩家水平）
            const remainingCount = monsterCount - this.monsters.length;
            for (let i = 0; i < remainingCount; i++) {
                // 优先选择接近玩家等级的怪物
                const suitableMonsters = availableMonsters.filter(m => 
                    Math.abs(m.level - spawnPlayerLevel) <= 5
                );
                const candidates = suitableMonsters.length > 0 ? suitableMonsters : availableMonsters;
                const selected = candidates[Math.floor(Math.random() * candidates.length)];
                const x = 100 + Math.random() * (this.width - 200);
                const y = 100 + Math.random() * (this.height - 200);
                const monster = new Monster(x, y, selected.type, this.gameInstance);
                {
                    const tLo = Math.max(1, maxLevelForFloor - 10);
                    const tHi = maxLevelForFloor;
                    boostMonsterTowardLevel(monster, tLo + Math.floor(Math.random() * Math.max(1, tHi - tLo + 1)));
                }
                
                // 当玩家大于20级时，会生成带★的怪物
                if (spawnPlayerLevel > 20 && Math.random() < 0.3) {
                    monster.hasStar = true; // 标记为带★怪物
                    monster.starCount = 1; // 一颗★
                    // 一颗★怪物数据x2，视为比原来等级高5级
                    monster.maxHp *= 2;
                    monster.hp = monster.maxHp;
                    monster.damage *= 2;
                    monster._baseDamage = monster.damage;
                    monster.expReward = Math.floor(monster.expReward * 1.5);
                    monster.goldReward = Math.floor(monster.goldReward * 1.5);
                }
                
                this.monsters.push(monster);
            }
            
            // 当玩家超出怪物等级时添加新的超过玩家水平的怪物
            if (spawnPlayerLevel > 20) {
                const newOverLevelMonsters = availableMonsters.filter(m => m.level > spawnPlayerLevel - 5);
                if (newOverLevelMonsters.length > 0) {
                    const selected = newOverLevelMonsters[Math.floor(Math.random() * newOverLevelMonsters.length)];
                    const x = 100 + Math.random() * (this.width - 200);
                    const y = 100 + Math.random() * (this.height - 200);
                    const monster = new Monster(x, y, selected.type, this.gameInstance);
                    {
                        const tLo = Math.max(1, maxLevelForFloor - 10);
                        const tHi = maxLevelForFloor;
                        boostMonsterTowardLevel(monster, tLo + Math.floor(Math.random() * Math.max(1, tHi - tLo + 1)));
                    }
                    if (Math.random() < 0.5) {
                        monster.hasStar = true;
                        monster.starCount = 1;
                        monster.maxHp *= 2;
                        monster.hp = monster.maxHp;
                        monster.damage *= 2;
                        monster._baseDamage = monster.damage;
                        monster.expReward = Math.floor(monster.expReward * 1.5);
                        monster.goldReward = Math.floor(monster.goldReward * 1.5);
                    }
                    this.monsters.push(monster);
                }
            }
        } else if (this.type === (ROOM_TYPES && ROOM_TYPES.ELITE) || this.type === 'elite') {
            // 精英房间：生成2~4只精英怪，按楼层选择精英类型
            const elitePools = {
                low: ['goblin_elite', 'goblinWarrior_elite', 'goblinShaman_elite'],
                mid: ['goblin_elite', 'goblinWarrior_elite', 'goblinShaman_elite', 'skeletonKnight_elite', 'skeletonMage_elite'],
                high: ['skeletonKnight_elite', 'skeletonMage_elite', 'orcWarrior_elite', 'orcWarlord_elite'],
                top: ['orcWarrior_elite', 'orcWarlord_elite', 'demon_elite', 'demonImp_elite', 'demonBoss_elite'],
                abyss: ['demon_elite', 'demonImp_elite', 'demonBoss_elite', 'demonAbyss_elite', 'demonVoid_elite', 'crystalColossus_elite', 'sporeHorror_elite'],
                voidEnd: ['demonBoss_elite', 'demonTyrant_elite', 'demonVoid_elite', 'demonAbyss_elite', 'rustChain_elite', 'crystalColossus_elite']
            };
            let pool = elitePools.low;
            if (this.floor >= 180) pool = elitePools.voidEnd;
            else if (this.floor >= 120) pool = elitePools.abyss;
            else if (this.floor >= 60) pool = elitePools.top;
            else if (this.floor >= 36) pool = elitePools.high;
            else if (this.floor >= 16) pool = elitePools.high;
            else if (this.floor >= 6) pool = elitePools.mid;
            const cap = maxMonsterLevelForFloor(this.floor);
            const monsterCount = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < monsterCount; i++) {
                const eliteType = pool[Math.floor(Math.random() * pool.length)];
                const x = 100 + Math.random() * (this.width - 200);
                const y = 100 + Math.random() * (this.height - 200);
                const monster = new Monster(x, y, eliteType, this.gameInstance);
                boostMonsterTowardLevel(monster, Math.max(1, cap - Math.floor(Math.random() * 8)));
                this.monsters.push(monster);
            }
        } else if (this.type === (ROOM_TYPES && ROOM_TYPES.BOSS) || this.type === 'boss') {
            const bossId = (typeof window.getTowerBossIdForFloor === 'function')
                ? window.getTowerBossIdForFloor(this.floor)
                : ('boss_' + this.floor);
            const bx = this.width / 2;
            const by = this.height / 2;
            this.monsters.push(new Boss(bx, by, bossId, this.gameInstance));
        } else if (this.type === (ROOM_TYPES && ROOM_TYPES.GAP_SHOP) || this.type === 'gap_shop') {
            this.monsters = [];
            this.cleared = false;
        } else if (this.type === ROOM_TYPES.TREASURE) {
            // 宝箱房间：生成宝箱
            this.treasureChest = {
                x: this.width / 2,
                y: this.height / 2,
                opened: false,
                quality: this.getRandomQuality()
            };
        } else if (this.type === ROOM_TYPES.REST) {
            // 休整房间：生成恢复道具
            const restTypes = ['campfire', 'medkit', 'fountain', 'altar'];
            const weights = [0.5, 0.3, 0.15, 0.05]; // 概率权重
            let rand = Math.random();
            let selectedType = restTypes[0];
            let cumulative = 0;
            
            for (let i = 0; i < restTypes.length; i++) {
                cumulative += weights[i];
                if (rand < cumulative) {
                    selectedType = restTypes[i];
                    break;
                }
            }
            
            this.restItem = {
                x: this.width / 2,
                y: this.height / 2,
                type: selectedType,
                used: false
            };
        }

        if ((this.type === ROOM_TYPES.BATTLE || this.type === (ROOM_TYPES && ROOM_TYPES.ELITE) || this.type === 'elite') && this.monsters && this.monsters.length) {
            if (typeof pairTwinSoulMonstersInRoom === 'function') pairTwinSoulMonstersInRoom(this.monsters);
        }

        // 生成房间内容后，再次预加载实体贴图
        this._preloadTextures();
    }

    getRandomQuality() {
        const rand = Math.random();
        if (rand < 0.4) return 'common';
        if (rand < 0.7) return 'rare';
        if (rand < 0.9) return 'fine';
        if (rand < 0.98) return 'epic';
        return 'legendary';
    }

    update(player) {
        const isEliteRoom = this.type === (ROOM_TYPES && ROOM_TYPES.ELITE) || this.type === 'elite';
        const isBossRoom = this.type === (ROOM_TYPES && ROOM_TYPES.BOSS) || this.type === 'boss';
        if (this.type === ROOM_TYPES.BATTLE || isEliteRoom || isBossRoom) {
            applyMarshalAurasToMonsters(this.monsters);
            this.monsters.forEach(monster => {
                if (monster.hp > 0) {
                    monster.update(player);
                }
            });
            
            // 检查是否清空
            if (this.monsters.every(m => m.hp <= 0) && !this.cleared) {
                this.cleared = true;
            }
        }
    }

    /**
     * 检查玩家是否靠近可交互对象
     * @param {Player} player - 玩家对象
     * @returns {Object|null} 返回可交互对象，如果没有则返回null
     */
    checkInteraction(player, portals = []) {
        // 首先检查传送门（优先级最高）
        if (portals && portals.length > 0) {
            for (const portal of portals) {
                const dx = portal.x - player.x;
                const dy = portal.y - player.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < portal.size / 2 + 30) {
                    return {
                        type: 'portal',
                        object: portal,
                        x: portal.x,
                        y: portal.y - portal.size / 2 - 40
                    };
                }
            }
        }
        
        // 然后检查房间内的其他交互对象
        if (this.type === ROOM_TYPES.TREASURE && this.treasureChest && !this.treasureChest.opened) {
            const dx = this.treasureChest.x - player.x;
            const dy = this.treasureChest.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 50) {
                return { type: 'treasure', object: this.treasureChest, x: this.treasureChest.x, y: this.treasureChest.y };
            }
        } else if (this.type === ROOM_TYPES.REST && this.restItem && !this.restItem.used) {
            const dx = this.restItem.x - player.x;
            const dy = this.restItem.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 50) {
                return { type: 'rest', object: this.restItem, x: this.restItem.x, y: this.restItem.y };
            }
        } else if ((this.type === (ROOM_TYPES && ROOM_TYPES.GAP_SHOP) || this.type === 'gap_shop') && !this.cleared) {
            const cx = this.width / 2;
            const cy = this.height / 2;
            const dx = cx - player.x;
            const dy = cy - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < 90) {
                return { type: 'gap_shop', object: this, x: cx, y: cy - 30 };
            }
        }
        return null;
    }

    draw(ctx, playerLevel = 1) {
        const assetManager = this.gameInstance?.assetManager;
        
        // 绘制地板贴图
        if (assetManager) {
            const floorImageName = assetManager.getFloorImageName('tower');
            if (floorImageName) {
                let floorImg = assetManager.entityImageCache.get(floorImageName);
                // 如果贴图不在缓存中，尝试加载（异步，下次绘制时会显示）
                if (!floorImg) {
                    assetManager.loadEntityImage(floorImageName).catch(err => {
                        console.warn('Room: 加载地板贴图失败:', err);
                    });
                }
                if (floorImg) {
                    // 平铺地板贴图
                    const tileSize = CONFIG.TILE_SIZE || 50;
                    for (let x = 0; x < this.width; x += tileSize) {
                        for (let y = 0; y < this.height; y += tileSize) {
                            ctx.drawImage(floorImg, x, y, tileSize, tileSize);
                        }
                    }
                } else {
                    // 回退：绘制默认背景
                    ctx.fillStyle = '#2a2a2a';
                    ctx.fillRect(0, 0, this.width, this.height);
                }
            } else {
                // 回退：绘制默认背景
                ctx.fillStyle = '#2a2a2a';
                ctx.fillRect(0, 0, this.width, this.height);
            }
        } else {
            // 回退：绘制默认背景
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(0, 0, this.width, this.height);
        }
        
        // 绘制房间内容
        const isEliteRoom = this.type === (ROOM_TYPES && ROOM_TYPES.ELITE) || this.type === 'elite';
        const isBossRoom = this.type === (ROOM_TYPES && ROOM_TYPES.BOSS) || this.type === 'boss';
        if (this.type === ROOM_TYPES.BATTLE || isEliteRoom || isBossRoom) {
            this.monsters.forEach(monster => {
                if (monster.hp > 0) {
                    monster.draw(ctx, playerLevel);
                }
            });
        } else if (this.type === ROOM_TYPES.TREASURE && this.treasureChest) {
            if (!this.treasureChest.opened) {
                if (assetManager) {
                    const imageName = assetManager.getRoomEntityImageName('treasure_chest');
                    if (imageName) {
                        const img = assetManager.entityImageCache.get(imageName);
                        if (img) {
                            assetManager.drawEntityImage(ctx, img, this.treasureChest.x, this.treasureChest.y, 120, 80);
                        } else {
                            this._drawTreasureChestFallback(ctx);
                        }
                    } else {
                        this._drawTreasureChestFallback(ctx);
                    }
                } else {
                    this._drawTreasureChestFallback(ctx);
                }
            }
        } else if (this.type === ROOM_TYPES.REST && this.restItem) {
            if (!this.restItem.used) {
                if (assetManager) {
                    const entityType = `rest_${this.restItem.type}`;
                    const imageName = assetManager.getRoomEntityImageName(entityType);
                    if (imageName) {
                        const img = assetManager.entityImageCache.get(imageName);
                        if (img) {
                            assetManager.drawEntityImage(ctx, img, this.restItem.x, this.restItem.y, 100, 100);
                        } else {
                            this._drawRestItemFallback(ctx);
                        }
                    } else {
                        this._drawRestItemFallback(ctx);
                    }
                } else {
                    this._drawRestItemFallback(ctx);
                }
            }
        } else if ((this.type === (ROOM_TYPES && ROOM_TYPES.GAP_SHOP) || this.type === 'gap_shop')) {
            ctx.fillStyle = 'rgba(60, 45, 30, 0.92)';
            ctx.fillRect(this.width / 2 - 140, this.height / 2 - 50, 280, 100);
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 3;
            ctx.strokeRect(this.width / 2 - 140, this.height / 2 - 50, 280, 100);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('隙间商店', this.width / 2, this.height / 2 - 8);
            ctx.font = '12px "Courier New", monospace';
            ctx.fillStyle = '#aaa';
            ctx.fillText('按 E 打开商店', this.width / 2, this.height / 2 + 22);
        }
    }

    _drawTreasureChestFallback(ctx) {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.treasureChest.x - 30, this.treasureChest.y - 20, 60, 40);
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.treasureChest.x - 30, this.treasureChest.y - 20, 60, 40);
    }

    _drawRestItemFallback(ctx) {
        const colors = {
            campfire: '#ff6600',
            medkit: '#ff0000',
            fountain: '#0088ff',
            altar: '#ff00ff'
        };
        ctx.fillStyle = colors[this.restItem.type] || '#ffffff';
        ctx.beginPath();
        ctx.arc(this.restItem.x, this.restItem.y, 25, 0, Math.PI * 2);
        ctx.fill();
    }

}

/**
 * 弹射/溅射/装备词条特效的伤害目标是否仍有效（灰色训练桩始终可命中；怪型假人非无敌且已死则否）
 */
function isCombatTargetAliveForEquipmentProc(m) {
    if (!m) return false;
    if (m instanceof TrainingDummy) return true;
    if (m instanceof MonsterTrainingDummy) {
        return !!(m.invincible || m.hp > 0);
    }
    return m.hp > 0;
}

/** 深阶套装 JSON 中的可选数值字段 */
function deepSetEffectNum(effect, key, defaultVal) {
    const v = effect && effect[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : defaultVal;
}

/** 套装机制触发时的屏幕特效（与 game-main.addEquipmentEffect / drawEquipmentEffects 对应） */
function queueSetProcFx(gameInstance, type, x, y, opts) {
    if (!gameInstance || typeof gameInstance.addEquipmentEffect !== 'function') return;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
    gameInstance.addEquipmentEffect(type, x, y, opts || {});
}

/** 深阶「印蚀」：目标在持续时间内承受更高玩家伤害 */
function applyDeepExposeDamageBonus(monster, damage) {
    if (!monster || typeof damage !== 'number' || damage <= 0) return damage;
    const now = Date.now();
    if (monster.deepExposeUntil && now < monster.deepExposeUntil && monster.deepExposeMult > 1) {
        return Math.floor(damage * monster.deepExposeMult);
    }
    return damage;
}

/** 武器技能：落点半径内的可命中目标 */
function collectMonstersInGroundSkillRadius(monsters, cx, cy, radius) {
    const r2 = radius * radius;
    const out = [];
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (!isCombatTargetAliveForEquipmentProc(m)) continue;
        const dx = m.x - cx;
        const dy = m.y - cy;
        if (dx * dx + dy * dy <= r2) out.push(m);
    }
    return out;
}

/**
 * 锁定施法：优先选取准星方向扇形内最近敌人，否则取距离最近者
 */
function pickWeaponSkillLockTarget(monsters, player, range, gameInstance) {
    const r2 = range * range;
    const inRange = [];
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (!isCombatTargetAliveForEquipmentProc(m)) continue;
        const dx = m.x - player.x;
        const dy = m.y - player.y;
        if (dx * dx + dy * dy <= r2) inRange.push(m);
    }
    if (!inRange.length) return null;
    const cx = CONFIG.CANVAS_WIDTH / 2;
    const cy = CONFIG.CANVAS_HEIGHT / 2;
    let ax = 0;
    let ay = 0;
    if (gameInstance && gameInstance.mouse) {
        ax = (gameInstance.mouse.x != null ? gameInstance.mouse.x : cx) - cx;
        ay = (gameInstance.mouse.y != null ? gameInstance.mouse.y : cy) - cy;
    }
    if (Math.hypot(ax, ay) < 12) {
        ax = Math.cos(player.angle);
        ay = Math.sin(player.angle);
    } else {
        const L = Math.hypot(ax, ay) || 1;
        ax /= L;
        ay /= L;
    }
    const coneCos = Math.cos(Math.PI * 0.46);
    let best = null;
    let bestDot = -2;
    for (let j = 0; j < inRange.length; j++) {
        const m = inRange[j];
        const dx = m.x - player.x;
        const dy = m.y - player.y;
        const dlen = Math.hypot(dx, dy) || 1;
        const dot = (dx / dlen) * ax + (dy / dlen) * ay;
        if (dot >= coneCos && dot > bestDot) {
            bestDot = dot;
            best = m;
        }
    }
    if (best) return best;
    let nearest = inRange[0];
    let nd = (nearest.x - player.x) ** 2 + (nearest.y - player.y) ** 2;
    for (let k = 1; k < inRange.length; k++) {
        const m = inRange[k];
        const d2 = (m.x - player.x) ** 2 + (m.y - player.y) ** 2;
        if (d2 < nd) {
            nd = d2;
            nearest = m;
        }
    }
    return nearest;
}

/**
 * 锁定施法：在技能射程内，选取离「鼠标所指世界点」直线距离最近的敌人（用于右键释放）
 */
function pickWeaponSkillLockTargetNearestToMouse(monsters, player, range, gameInstance) {
    const r2 = range * range;
    const inRange = [];
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (!isCombatTargetAliveForEquipmentProc(m)) continue;
        const dx = m.x - player.x;
        const dy = m.y - player.y;
        if (dx * dx + dy * dy <= r2) inRange.push(m);
    }
    if (!inRange.length) return null;
    let wx = player.x;
    let wy = player.y;
    if (gameInstance && typeof gameInstance.screenToWorldForAim === 'function' && gameInstance.mouse) {
        const p = gameInstance.screenToWorldForAim(gameInstance.mouse.x, gameInstance.mouse.y);
        wx = p.x;
        wy = p.y;
    }
    let best = inRange[0];
    let bestD = (best.x - wx) ** 2 + (best.y - wy) ** 2;
    for (let j = 1; j < inRange.length; j++) {
        const m = inRange[j];
        const d2 = (m.x - wx) ** 2 + (m.y - wy) ** 2;
        if (d2 < bestD) {
            bestD = d2;
            best = m;
        }
    }
    return best;
}

/**
 * 玩家类
 * 用于表示玩家角色，包含移动、攻击、装备、属性等功能
 */
class Player {
    constructor(x, y, gameInstance = null) {
        this.x = x;
        this.y = y;
        this.size = CONFIG.PLAYER_SIZE;
        // 确保使用最新的 CONFIG.PLAYER_SPEED 值
        const baseSpeed = window.CONFIG ? window.CONFIG.PLAYER_SPEED : CONFIG.PLAYER_SPEED;
        this.speed = baseSpeed;
        this.angle = 0;
        
        // 加速度系统
        this.vx = 0; // X方向速度
        this.vy = 0; // Y方向速度
        this.maxSpeed = baseSpeed; // 最大速度
        this.acceleration = 0.5; // 加速度系数（提高以降低惯性）
        this.friction = 0.7; // 摩擦力系数（降低以更快停止，降低惯性）
        this.hp = 100;
        this.maxHp = 100;
        this.level = 1;
        this.exp = 0;
        this.expNeeded = 50; // 降低初始经验需求
        this.gold = 0;
        this.lastAttackTime = 0;
        this._towerSilenceAttackCdMult = 1;
        this.dashCooldown = 0;
        this.isDashing = false;
        this.dashDirection = { x: 0, y: 0 };
        this.gameInstance = gameInstance; // 保存Game实例引用
        
        // 装备
        this.equipment = {
            weapon: null,
            helmet: null,
            chest: null,
            legs: null,
            boots: null,
            necklace: null,
            ring: null,
            belt: null
        };
        
        // 背包 - 初始化为固定大小的数组，用null填充
        this.inventory = new Array(CONFIG.INVENTORY_SIZE).fill(null);
        
        // 背包容量（可升级）
        this.maxEquipmentCapacity = 18; // 装备：0-17
        this.maxAlchemyCapacity = 30; // 材料：18-47
        this.maxPotionCapacity = 18; // 消耗品：48-65
        
        // Buff系统
        this.buffs = []; // 存储当前生效的buff
        
        // 恶魔干扰：本次恶魔塔内永久属性降低（离开塔时清除）
        this.demonDebuffs = {}; // 如 { maxHp: 0.1 } 表示血量上限降低10%
        
        // 精英房加护：通关精英房获得，仅本次恶魔塔有效（回主城清除）
        this.eliteBoons = []; // { id: string, stacks: number }[]
        // 隙间商店等：本次恶魔塔内额外复活次数、生命上限百分比（回主城清除）
        this.towerReviveCharges = 0;
        this.towerMaxHpBonusPercent = 0;
        
        // 武器技能系统
        this.weaponSkillCooldown = 0; // 武器技能冷却时间
        this.weaponSkillDots = []; // 持续伤害效果列表
        this.isCastingSkill = false; // 是否正在释放技能（用于禁用输入）
        
        // 词条效果系统
        this.traitStacks = {}; // 词条叠加层数（如焚天、骁勇等）
        this.traitCooldowns = {}; // 词条冷却时间
        this.traitTrails = []; // 移动轨迹（银河轨迹、踏火余烬等）
        this.trailAccumulatedDistance = 0; // 轨迹累积距离（用于基于距离的轨迹添加）
        this.lastDodgeSuccess = false; // 上次是否闪避成功（暗影词条）
        this.nextAttackCrit = false; // 下次攻击是否必定暴击（暗影词条）
        this.skillDamageBoost = 1.0; // 技能伤害加成（咏咒词条）
        this.lastMoveTime = 0;
        
        // 战力系统
        this.combatPower = 0; // 当前战力
        this.lastCombatPower = 0; // 上次战力（用于检测变化）
        this.isInitialized = false; // 标记是否已初始化（避免初始化时触发变化提示）
        
        // 高阶装备机制（由 updateStats 从装备汇总）
        this.lifeStealPercent = 0;
        this.thornPercent = 0;
        this.skillHastePercent = 0;
        this.damageReductionPercent = 0;
        this.towerGoldBonusPercent = 0;
        this.voidRiposteMul = 1;
        this.voidChaseStrike = null;
        
        // 其他属性
        this.lastMoveX = x; // 上次移动X坐标
        this.lastMoveY = y; // 上次移动Y坐标
        this.setSpecialEffects = {}; // 套装特殊效果
        this.invincibleUntil = 0; // 无敌状态结束时间
        this.hurtUntil = 0; // 受伤变红状态结束时间
        this.moveTraitCooldowns = {}; // 移动词条冷却时间
        this.lastTrailTime = 0; // 上次添加轨迹的时间
        this.dashEndTime = 0; // 冲刺结束时间（用于限制冲刺后0.5秒内不能攻击或释放技能）
        this.lastDashTrailTime = 0; // 上次创建冲刺拖尾粒子的时间
        this.dashBrightness = 0; // 冲刺时的亮度值（0-1，用于渐变）
        this.dashStartTime = 0; // 冲刺开始时间
        this.dashCompression = 0; // 冲刺时的压缩值（0-1，用于渐变，1表示最大压缩）
        this.dashGhosts = []; // 冲刺重影数组 [{x, y, frameIndex, time, alpha}]
        this.lastGhostTime = 0; // 上次创建重影的时间
        this.slashStartTime = 0; // 剑气开始时间
        this.slashAngle = 0; // 剑气角度
        
        // 玩家 GIF 动画相关
        this.playerGifFrames = []; // GIF 帧数组
        this.playerGifDelays = []; // 每帧延迟时间（毫秒）
        this.playerGifLoaded = false; // GIF 是否已加载
        this.lastDirection = 1; // 上次移动方向：1=右，-1=左
        // 从 mappings.json 获取缩放配置（延迟到 assetManager 初始化后）
        this.playerGifSize = this.size * 1.5; // 默认值，会在 _loadPlayerGif 中更新
        this.currentFrameIndex = 0; // 当前帧索引
        this.lastFrameTime = 0; // 上次切换帧的时间
        
        // 预加载玩家 GIF
        this._loadPlayerGif();
        
        this.updateStats();
    }

    async _loadPlayerGif() {
        console.log('_loadPlayerGif: 开始加载', {
            hasGameInstance: !!this.gameInstance,
            hasAssetManager: !!(this.gameInstance && this.gameInstance.assetManager)
        });
        
        if (this.gameInstance && this.gameInstance.assetManager) {
            try {
                // 从 mappings.json 获取缩放配置
                const playerConfig = this.gameInstance.assetManager.getPlayerGifConfig();
                const playerGifScale = playerConfig ? (playerConfig.scale || 1.5) : 1.5;
                this.playerGifSize = this.size * playerGifScale;
                
                const {frames, delays} = await this.gameInstance.assetManager.loadPlayerGifFrames();
                if (frames.length > 0) {
                    this.playerGifFrames = frames;
                    this.playerGifDelays = delays;
                    this.playerGifLoaded = true;
                    this.currentFrameIndex = 0;
                    this.lastFrameTime = Date.now();
                    console.log('_loadPlayerGif: 加载成功，共', frames.length, '帧');
                } else {
                    console.warn('_loadPlayerGif: 未提取到任何帧');
                    this.playerGifLoaded = false;
                }
            } catch (error) {
                console.warn('加载玩家 GIF 失败:', error);
                this.playerGifLoaded = false;
            }
        } else {
            console.warn('_loadPlayerGif: gameInstance 或 assetManager 未初始化');
            // 如果 assetManager 还没初始化，延迟重试
            setTimeout(() => {
                this._loadPlayerGif();
            }, 100);
        }
    }

    updateStats() {
        const oldMaxHp = this.maxHp;
        // 保存当前血量百分比（避免精度损失）
        const hpPercent = oldMaxHp > 0 ? this.hp / oldMaxHp : 1;
        
        // 重置基础属性（等级成长与 gainExp 一致：每级 +20 生命、+2 攻击）
        this.maxHp = 100;
        this.baseAttack = 10;
        {
            const lv = Math.max(1, this.level | 0);
            this.maxHp += (lv - 1) * 20;
            this.baseAttack += (lv - 1) * 2;
            // 21 级起额外攻击成长，使满级在深塔中的输出与楼层缩放后的怪物匹配
            if (lv > 20) {
                this.baseAttack += Math.floor((lv - 20) * 4.5);
            }
        }
        this.baseDefense = 0;
        this.baseCritRate = 5;
        this.baseCritDamage = 20;
        this.baseDodge = 0;
        this.baseAttackSpeed = 100;
        // 确保使用最新的 CONFIG.PLAYER_SPEED 值
        const baseSpeed = window.CONFIG ? window.CONFIG.PLAYER_SPEED : CONFIG.PLAYER_SPEED;
        this.baseMoveSpeed = baseSpeed;
        // 确保使用最新的 CONFIG.PLAYER_VISION 值
        const baseVision = window.CONFIG ? window.CONFIG.PLAYER_VISION : (CONFIG.PLAYER_VISION || 200);
        this.baseVision = baseVision;
        let moveSpeedPercent = 0; // 移动速度百分比加成
        
        this.lifeStealPercent = 0;
        this.thornPercent = 0;
        this.skillHastePercent = 0;
        this.damageReductionPercent = 0;
        this.towerGoldBonusPercent = 0;
        
        // 应用装备属性
        Object.values(this.equipment).forEach(eq => {
            if (eq) {
                if (eq.stats.health) this.maxHp += eq.stats.health;
                if (eq.stats.attack) this.baseAttack += eq.stats.attack;
                if (eq.stats.defense) this.baseDefense += eq.stats.defense;
                if (eq.stats.critRate) this.baseCritRate += eq.stats.critRate;
                if (eq.stats.critDamage) this.baseCritDamage += eq.stats.critDamage;
                if (eq.stats.dodge) this.baseDodge += eq.stats.dodge;
                if (eq.stats.attackSpeed) this.baseAttackSpeed += eq.stats.attackSpeed;
                // 移动速度改为百分比加成，而不是直接相加
                if (eq.stats.moveSpeed) moveSpeedPercent += eq.stats.moveSpeed;
                // 视野加成（支持装备提升视野）
                if (eq.stats.vision) this.baseVision += eq.stats.vision;
                if (eq.stats.lifeSteal) this.lifeStealPercent += eq.stats.lifeSteal;
                if (eq.stats.thorn) this.thornPercent += eq.stats.thorn;
                if (eq.stats.skillHaste) this.skillHastePercent += eq.stats.skillHaste;
                if (eq.stats.damageReduction) this.damageReductionPercent += eq.stats.damageReduction;
                if (eq.stats.towerGoldBonus) this.towerGoldBonusPercent += eq.stats.towerGoldBonus;
            }
        });
        this.lifeStealPercent = Math.min(25, this.lifeStealPercent);
        this.thornPercent = Math.min(40, this.thornPercent);
        this.skillHastePercent = Math.min(50, this.skillHastePercent);
        this.damageReductionPercent = Math.min(35, this.damageReductionPercent);
        this.towerGoldBonusPercent = Math.min(100, this.towerGoldBonusPercent);
        
        // 应用套装效果
        this.activeSetEffects = getActiveSetEffects(this.equipment);
        let setStatsMultiplier = 1; // 套装属性百分比加成
        this.setSpecialEffects = {};

        this.activeSetEffects.forEach(setEffect => {
            const effect = setEffect.effect;
            
            // 应用基础属性加成
            if (effect.stats) {
                if (effect.stats.attack) this.baseAttack += effect.stats.attack;
                if (effect.stats.defense) this.baseDefense += effect.stats.defense;
                if (effect.stats.health) this.maxHp += effect.stats.health;
                if (effect.stats.critRate) this.baseCritRate += effect.stats.critRate;
                if (effect.stats.critDamage) this.baseCritDamage += effect.stats.critDamage;
                if (effect.stats.dodge) this.baseDodge += effect.stats.dodge;
                if (effect.stats.attackSpeed) this.baseAttackSpeed += effect.stats.attackSpeed;
                if (effect.stats.moveSpeed) moveSpeedPercent += effect.stats.moveSpeed;
                
                // 处理百分比属性加成
                if (effect.stats.allStats) {
                    setStatsMultiplier += effect.stats.allStats;
                }
            }
            
            // 记录特殊效果
            if (effect.special) {
                this.setSpecialEffects[setEffect.setId] = {
                    pieceCount: setEffect.pieceCount,
                    special: effect.special
                };
            }
        });
        
        // 应用百分比属性加成
        if (setStatsMultiplier > 1) {
            this.baseAttack = Math.floor(this.baseAttack * setStatsMultiplier);
            this.baseDefense = Math.floor(this.baseDefense * setStatsMultiplier);
            this.maxHp = Math.floor(this.maxHp * setStatsMultiplier);
            this.baseCritRate = Math.floor(this.baseCritRate * setStatsMultiplier);
            this.baseCritDamage = Math.floor(this.baseCritDamage * setStatsMultiplier);
            this.baseDodge = Math.floor(this.baseDodge * setStatsMultiplier);
            this.baseAttackSpeed = Math.floor(this.baseAttackSpeed * setStatsMultiplier);
            moveSpeedPercent = Math.floor(moveSpeedPercent * setStatsMultiplier);
            // 视野也受百分比加成影响
            this.baseVision = Math.floor(this.baseVision * setStatsMultiplier);
        }
        
        // 应用Buff效果
        const now = Date.now();
        this.buffs = this.buffs.filter(buff => {
            return buff.expireTime > now; // 移除过期的buff
        });
        
        this.buffs.forEach(buff => {
            if (buff.effects.attack) this.baseAttack += buff.effects.attack;
            if (buff.effects.defense) this.baseDefense += buff.effects.defense;
            if (buff.effects.critRate) this.baseCritRate += buff.effects.critRate;
            if (buff.effects.critDamage) this.baseCritDamage += buff.effects.critDamage;
            if (buff.effects.dodge) this.baseDodge += buff.effects.dodge;
            if (buff.effects.attackSpeed) this.baseAttackSpeed += buff.effects.attackSpeed;
            if (buff.effects.moveSpeed) moveSpeedPercent += buff.effects.moveSpeed;
            // 视野也受buff影响
            if (buff.effects.vision) this.baseVision += buff.effects.vision;
        });
        
        // 应用词条属性加成
        const traitIds = this.getEquipmentTraitIds();
        let traitStatsMultiplier = 1.0;
        
        // 百分比属性加成词条
        if (traitIdsIncludeBase(traitIds, 'medal')) traitStatsMultiplier += 0.02;
        if (traitIdsIncludeBase(traitIds, 'woven')) traitStatsMultiplier += 0.01;
        if (traitIdsIncludeBase(traitIds, 'iron_belt')) traitStatsMultiplier += 0.05;
        if (traitIdsIncludeBase(traitIds, 'divine_crown')) traitStatsMultiplier += 0.1;
        if (traitIdsIncludeBase(traitIds, 'divine_favor')) traitStatsMultiplier += 0.12;
        if (traitIdsIncludeBase(traitIds, 'celestial')) traitStatsMultiplier += 0.12;
        if (traitIdsIncludeBase(traitIds, 'law')) traitStatsMultiplier += 0.08;
        if (traitIdsIncludeBase(traitIds, 'creation_law')) traitStatsMultiplier += 0.15;
        if (traitIdsIncludeBase(traitIds, 'divine_helmet')) traitStatsMultiplier += 0.12; // 神威头盔
        
        // 应用百分比加成
        if (traitStatsMultiplier > 1.0) {
            this.baseAttack = Math.floor(this.baseAttack * traitStatsMultiplier);
            this.baseDefense = Math.floor(this.baseDefense * traitStatsMultiplier);
            this.maxHp = Math.floor(this.maxHp * traitStatsMultiplier);
            this.baseCritRate = Math.floor(this.baseCritRate * traitStatsMultiplier);
            this.baseCritDamage = Math.floor(this.baseCritDamage * traitStatsMultiplier);
            this.baseDodge = Math.floor(this.baseDodge * traitStatsMultiplier);
            this.baseAttackSpeed = Math.floor(this.baseAttackSpeed * traitStatsMultiplier);
            moveSpeedPercent = Math.floor(moveSpeedPercent * traitStatsMultiplier);
        }
        
        // 固定属性加成词条
        if (traitIdsIncludeBase(traitIds, 'armor_belt')) this.baseDefense = Math.floor(this.baseDefense * 1.03);
        if (traitIdsIncludeBase(traitIds, 'dragon_scale')) this.baseDefense = Math.floor(this.baseDefense * 1.15); // 龙鳞护甲
        if (traitIdsIncludeBase(traitIds, 'mithril_armor')) this.baseDefense = Math.floor(this.baseDefense * 1.2); // 秘银战甲
        if (traitIdsIncludeBase(traitIds, 'steel_buckle')) {
            this.baseAttack = Math.floor(this.baseAttack * 1.03);
            this.baseDefense = Math.floor(this.baseDefense * 1.03);
        }
        if (traitIdsIncludeBase(traitIds, 'fortress')) {
            this.baseDefense = Math.floor(this.baseDefense * 1.1);
            this.baseAttack = Math.floor(this.baseAttack * 0.95);
        }
        if (traitIdsIncludeBase(traitIds, 'dragon_leather')) {
            this.maxHp = Math.floor(this.maxHp * 1.15);
            this.baseDefense = Math.floor(this.baseDefense * 1.08);
        }
        if (traitIdsIncludeBase(traitIds, 'mottled')) this.baseDefense = Math.floor(this.baseDefense * 1.05);
        if (traitIdsIncludeBase(traitIds, 'heavy')) {
            this.baseDefense = Math.floor(this.baseDefense * 1.08);
            moveSpeedPercent = Math.max(0, moveSpeedPercent - 5);
        }
        if (traitIdsIncludeBase(traitIds, 'sturdy')) {
            this.baseDefense = Math.floor(this.baseDefense * 1.05);
            moveSpeedPercent += 3;
        }
        
        // 攻击速度加成词条
        if (traitIdsIncludeBase(traitIds, 'thumb_ring')) this.baseAttackSpeed += Math.floor(this.baseAttackSpeed * 0.03);
        if (traitIdsIncludeBase(traitIds, 'swift_shadow')) {
            this.baseAttackSpeed += Math.floor(this.baseAttackSpeed * 0.08);
            moveSpeedPercent += 5;
        }
        if (traitIdsIncludeBase(traitIds, 'flowing_silver')) this.baseAttackSpeed += Math.floor(this.baseAttackSpeed * 0.05);
        if (traitIdsIncludeBase(traitIds, 'silver_wing')) {
            moveSpeedPercent += 5;
            this.baseAttackSpeed += Math.floor(this.baseAttackSpeed * 0.05);
        }
        
        // 移动速度加成词条
        if (traitIdsIncludeBase(traitIds, 'ranger')) {
            moveSpeedPercent += 5;
            this.baseDodge += Math.floor(this.baseDodge * 0.03);
        }
        if (traitIdsIncludeBase(traitIds, 'traveler')) moveSpeedPercent += 8;
        if (traitIdsIncludeBase(traitIds, 'cheetah')) moveSpeedPercent += 10;
        if (traitIdsIncludeBase(traitIds, 'god_chase')) moveSpeedPercent += 15;
        if (traitIdsIncludeBase(traitIds, 'dragon_tendon')) moveSpeedPercent += 10;
        
        // 暴击相关词条
        if (traitIdsIncludeBase(traitIds, 'discipline')) {
            this.baseCritRate += Math.floor(this.baseCritRate * 0.05);
            this.baseCritDamage += Math.floor(this.baseCritDamage * 0.1);
        }
        if (traitIdsIncludeBase(traitIds, 'astrology')) {
            this.baseCritRate += Math.floor(this.baseCritRate * 0.05);
        }
        if (traitIdBase(this.getCurrentWeaponTraitId()) === 'divine_judgment') {
            this.baseCritDamage = Math.floor(this.baseCritDamage * 1.5);
        }
        
        // 闪避相关词条
        if (traitIdsIncludeBase(traitIds, 'bright_moon') && this.hp < this.maxHp * 0.3) {
            this.baseDodge += Math.floor(this.baseDodge * 0.15);
            this.baseAttackSpeed += Math.floor(this.baseAttackSpeed * 0.15);
        }
        if (traitIdsIncludeBase(traitIds, 'moon_shadow') && this.hp < this.maxHp * 0.3) {
            this.baseDodge += Math.floor(this.baseDodge * 0.15);
            this.baseAttackSpeed += Math.floor(this.baseAttackSpeed * 0.15);
        }
        
        // 生命值相关词条
        if (traitIdsIncludeBase(traitIds, 'dragon_heart') && this.hp < this.maxHp * 0.3) {
            // 每秒恢复5%最大生命值（在update中处理）
        }
        
        // 攻击力相关词条
        if (traitIdsIncludeBase(traitIds, 'brute_force')) {
            this.baseAttack = Math.floor(this.baseAttack * 1.05);
            this.baseDefense = Math.floor(this.baseDefense * 0.97);
        }
        if (traitIdBase(this.getCurrentWeaponTraitId()) === 'reverse_scale' && this.hp < this.maxHp * 0.3) {
            this.baseAttack = Math.floor(this.baseAttack * 1.3);
        }
        if (traitIdsIncludeBase(traitIds, 'perseverance') && this.hp < this.maxHp * 0.5) {
            this.baseDefense = Math.floor(this.baseDefense * 1.2);
        }
        if (traitIdsIncludeBase(traitIds, 'lion') && this.hp > this.maxHp * 0.7) {
            this.baseAttack = Math.floor(this.baseAttack * 1.15);
        }
        if (traitIdsIncludeBase(traitIds, 'charge') && this.hp < this.maxHp * 0.4) {
            this.baseAttack = Math.floor(this.baseAttack * 1.2);
            this.baseDefense = Math.floor(this.baseDefense * 1.2);
        }
        
        // 精英房加护（词条之后、移速封顶与恶魔干扰之前）
        if (typeof applyEliteBoonPassivesInUpdateStats === 'function') {
            applyEliteBoonPassivesInUpdateStats(this);
        }
        if (this.towerMaxHpBonusPercent > 0) {
            this.maxHp = Math.floor(this.maxHp * (1 + this.towerMaxHpBonusPercent / 100));
        }
        moveSpeedPercent += this._ebMoveSpeedPercent || 0;
        
        // 技能冷却时间减少词条
        // 这些在useWeaponSkill中处理
        
        // 技能效果提升词条
        // 这些在useWeaponSkill中处理
        
        // 应用移动速度百分比加成（限制最大加成不超过100%）
        moveSpeedPercent = Math.min(moveSpeedPercent, 100);
        // 使用之前声明的 baseSpeed 变量
        this.baseMoveSpeed = baseSpeed * (1 + moveSpeedPercent / 100);
        // 更新最大速度（用于加速度系统）
        this.maxSpeed = this.baseMoveSpeed;
        // 同时更新 speed 属性以保持一致性
        this.speed = this.baseMoveSpeed;
        
        // 设置最终视野属性（确保至少为1）
        this.vision = Math.max(1, Math.floor(this.baseVision));
        
        // 应用恶魔干扰的永久属性降低（本次恶魔塔内有效）
        if (this.demonDebuffs && Object.keys(this.demonDebuffs).length > 0) {
            const mult = (key, val) => Math.max(0.1, 1 - (this.demonDebuffs[key] || 0));
            if (this.demonDebuffs.maxHp) this.maxHp = Math.max(1, Math.floor(this.maxHp * mult('maxHp', this.demonDebuffs.maxHp)));
            if (this.demonDebuffs.defense) this.baseDefense = Math.max(0, Math.floor(this.baseDefense * mult('defense', this.demonDebuffs.defense)));
            if (this.demonDebuffs.attack) this.baseAttack = Math.max(1, Math.floor(this.baseAttack * mult('attack', this.demonDebuffs.attack)));
            if (this.demonDebuffs.critRate) this.baseCritRate = Math.max(0, Math.floor(this.baseCritRate * mult('critRate', this.demonDebuffs.critRate)));
            if (this.demonDebuffs.critDamage) this.baseCritDamage = Math.max(0, Math.floor(this.baseCritDamage * mult('critDamage', this.demonDebuffs.critDamage)));
            if (this.demonDebuffs.moveSpeed) {
                this.baseMoveSpeed = Math.max(baseSpeed * 0.1, this.baseMoveSpeed * mult('moveSpeed', this.demonDebuffs.moveSpeed));
                this.maxSpeed = this.baseMoveSpeed;
                this.speed = this.baseMoveSpeed;
            }
            if (this.demonDebuffs.attackSpeed) this.baseAttackSpeed = Math.max(10, Math.floor(this.baseAttackSpeed * mult('attackSpeed', this.demonDebuffs.attackSpeed)));
        }
        
        // 血量上限变化时，保持当前血量百分比不变（避免精度损失）
        if (oldMaxHp > 0 && oldMaxHp !== this.maxHp) {
            // 使用保存的血量百分比来计算新血量，避免反复乘除导致的精度损失
            this.hp = Math.max(1, Math.min(this.maxHp, Math.round(this.maxHp * hpPercent)));
        } else if (oldMaxHp === 0) {
            // 如果旧最大血量为0（初始化情况），设置为满血
            this.hp = this.maxHp;
        }
        
        // 确保HP不超过最大值且至少为1
        if (this.hp > this.maxHp) {
            this.hp = this.maxHp;
        }
        if (this.hp < 1 && this.maxHp > 0) {
            this.hp = 1;
        }
        
        // 计算战力
        this.calculateCombatPower();
        
        // 标记为已初始化（第一次计算后）
        if (!this.isInitialized) {
            this.isInitialized = true;
            // 初始化时，将当前战力设为上次战力，避免触发变化提示
            this.lastCombatPower = this.combatPower;
        }
    }
    
    /**
     * 计算战力
     * 综合考虑等级、攻击、防御、生命、暴击、闪避、速度等属性
     */
    calculateCombatPower() {
        // 保存上次战力
        const previousPower = this.combatPower;
        
        // 基础战力（等级加成）
        let power = this.level * 50;
        
        // 攻击力贡献（主要输出属性）
        // 攻击力越高，贡献越大，但边际递减
        power += this.baseAttack * 3;
        
        // 防御力贡献（生存能力）
        // 防御力按百分比减伤，所以贡献需要考虑实际减伤效果
        // 假设平均怪物攻击为50，防御力每点减少约1%伤害
        const defenseValue = this.baseDefense * 0.5; // 防御力价值系数
        power += defenseValue * 2;
        
        // 生命值贡献（生存能力）
        // 生命值越高，能承受更多伤害
        power += this.maxHp * 0.5;
        
        // 暴击系统贡献（输出加成）
        // 暴击期望伤害 = 攻击力 * (1 + 暴击率 * 暴击伤害)
        const critMultiplier = 1 + (this.baseCritRate / 100) * (this.baseCritDamage / 100);
        const critBonus = this.baseAttack * (critMultiplier - 1);
        power += critBonus * 2;
        
        // 闪避率贡献（生存能力）
        // 闪避率越高，生存能力越强
        // 假设平均怪物命中率为100%，闪避率直接转化为生存价值
        const dodgeValue = (this.baseDodge / 100) * this.maxHp * 0.3;
        power += dodgeValue;
        
        // 攻击速度贡献（输出频率）
        // 攻击速度越高，DPS越高
        // 基础攻击速度为100，每增加1%攻击速度，DPS增加1%
        const attackSpeedMultiplier = this.baseAttackSpeed / 100;
        const attackSpeedBonus = this.baseAttack * (attackSpeedMultiplier - 1);
        power += attackSpeedBonus * 1.5;
        
        power += (this.lifeStealPercent || 0) * 8;
        power += (this.thornPercent || 0) * 5;
        power += (this.skillHastePercent || 0) * 4;
        power += (this.damageReductionPercent || 0) * 10;
        power += (this.towerGoldBonusPercent || 0) * 2;
        
        // 移动速度贡献（机动性）
        // 移动速度影响走位和生存能力
        const moveSpeedMultiplier = this.baseMoveSpeed / CONFIG.PLAYER_SPEED;
        const moveSpeedBonus = (moveSpeedMultiplier - 1) * 100;
        power += moveSpeedBonus * 0.5;
        
        // 取整
        this.combatPower = Math.floor(power);
        
        // 如果战力发生变化且已初始化，通知游戏实例
        if (this.gameInstance && this.isInitialized && this.combatPower !== previousPower) {
            this.gameInstance.onCombatPowerChanged(this.combatPower, previousPower);
            // 更新上次战力
            this.lastCombatPower = previousPower;
        }
    }

    // 使用药水
    usePotion(potion) {
        const now = Date.now();
        
        // 如果是生命药水，立即恢复生命值
        if (potion.effects.health) {
            this.heal(potion.effects.health);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `恢复 ${potion.effects.health} 生命值`, '#00ff00');
            }
        }
        
        // 如果有持续时间，添加buff
        if (potion.duration > 0) {
            this.buffs.push({
                name: potion.name,
                effects: JSON.parse(JSON.stringify(potion.effects)),
                expireTime: now + potion.duration
            });
            
            // 更新属性
            this.updateStats();
            
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `使用 ${potion.name}`, QUALITY_COLORS[potion.quality] || '#ffffff');
            }
        }
    }

    move(dx, dy) {
        try {
            // 更新走路音效状态
            const isMoving = (dx !== 0 || dy !== 0) && !this.isDashing;
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.updateWalkSound(isMoving);
            }
            
            if (this.isDashing) {
                // 冲刺时直接设置速度（不使用加速度）
                this.vx = this.dashDirection.x * CONFIG.PLAYER_DASH_SPEED;
                this.vy = this.dashDirection.y * CONFIG.PLAYER_DASH_SPEED;
                // 更新角度为冲刺方向
                this.angle = Math.atan2(this.dashDirection.y, this.dashDirection.x);
                
                // 更新冲刺亮度和压缩（渐变到1.0）
                const now = Date.now();
                const dashElapsed = now - this.dashStartTime;
                const fadeInDuration = 50; // 50毫秒渐变到最亮
                if (dashElapsed < fadeInDuration) {
                    this.dashBrightness = Math.min(1.0, dashElapsed / fadeInDuration);
                    this.dashCompression = Math.min(1.0, dashElapsed / fadeInDuration);
                } else {
                    this.dashBrightness = 1.0; // 保持最亮
                    this.dashCompression = 1.0; // 保持最大压缩
                }
                
                // 创建重影（每20毫秒创建一次）
                if (now - this.lastGhostTime >= 20) {
                    if (this.playerGifLoaded && this.playerGifFrames.length > 0) {
                        this.dashGhosts.push({
                            x: this.x,
                            y: this.y,
                            frameIndex: this.currentFrameIndex,
                            lastDirection: this.lastDirection,
                            time: now,
                            alpha: 0.6 // 初始透明度
                        });
                        this.lastGhostTime = now;
                        
                        // 限制重影数量，避免内存泄漏
                        if (this.dashGhosts.length > 10) {
                            this.dashGhosts.shift();
                        }
                    }
                }
                
                // 持续创建拖尾粒子效果（每15毫秒创建一次，避免性能问题）
                if (this.gameInstance && this.gameInstance.particleManager && (now - this.lastDashTrailTime >= 15)) {
                    const trailColor = window.CONFIG ? (window.CONFIG.PLAYER_DASH_TRAIL_COLOR || '#00ffff') : (CONFIG.PLAYER_DASH_TRAIL_COLOR || '#00ffff');
                    // 计算冲刺方向的反方向（用于拖尾效果）
                    const trailAngle = Math.atan2(-this.dashDirection.y, -this.dashDirection.x);
                    // 在玩家后方稍微偏移的位置创建粒子
                    const offsetDistance = this.size / 2;
                    const offsetX = this.x - this.dashDirection.x * offsetDistance;
                    const offsetY = this.y - this.dashDirection.y * offsetDistance;
                    
                    // 计算拖尾宽度（人物宽度的1.8倍，再加宽一倍）
                    const trailWidth = this.playerGifSize * 1.8; // 增加到人物宽度的180%
                    // 根据拖尾宽度计算角度扩散（使用反正切函数）
                    // 假设拖尾长度为offsetDistance，宽度为trailWidth
                    // angleSpread = 2 * atan(trailWidth / 2 / offsetDistance)
                    const trailLength = offsetDistance;
                    const angleSpread = 2 * Math.atan((trailWidth / 2) / trailLength);
                    
                    this.gameInstance.particleManager.createSystem(offsetX, offsetY, {
                        color: trailColor,
                        size: 2,
                        count: 16, // 增加粒子数量以适应更宽的拖尾（加一倍）
                        lifetime: 250,
                        fadeoutTime: 180,
                        speed: 0.4,
                        angle: trailAngle,
                        angleSpread: angleSpread, // 根据人物宽度计算的角度扩散
                        gravity: 0,
                        spreadRadius: 10, // 增加随机散布半径，使拖尾更宽（加一倍）
                        pixelStyle: true // 像素风格
                    });
                    
                    this.lastDashTrailTime = now;
                }
            } else {
                // 冲刺结束后，渐变恢复亮度和压缩
                if (this.dashBrightness > 0 || this.dashCompression > 0) {
                    const now = Date.now();
                    const fadeOutDuration = 100; // 100毫秒渐变恢复
                    const timeSinceDashEnd = now - this.dashEndTime;
                    if (timeSinceDashEnd < fadeOutDuration) {
                        const fadeProgress = timeSinceDashEnd / fadeOutDuration;
                        this.dashBrightness = Math.max(0, 1.0 - fadeProgress);
                        this.dashCompression = Math.max(0, 1.0 - fadeProgress);
                    } else {
                        this.dashBrightness = 0; // 完全恢复
                        this.dashCompression = 0; // 完全恢复
                    }
                }
                
                // 更新重影（逐渐淡出并移除）
                const now = Date.now();
                this.dashGhosts = this.dashGhosts.filter(ghost => {
                    const age = now - ghost.time;
                    const ghostLifetime = 300; // 重影持续时间300毫秒
                    if (age >= ghostLifetime) {
                        return false; // 移除过期的重影
                    }
                    // 更新透明度（逐渐淡出）
                    const fadeProgress = age / ghostLifetime;
                    ghost.alpha = 0.6 * (1 - fadeProgress);
                    return true;
                });
                
                // 使用加速度系统（玩家被减速：取最小移速倍率 = 最强减速）
                let effectiveMaxSpeed = this.maxSpeed;
                if (this.slowEffects && this.slowEffects.length) {
                    this.slowEffects = this.slowEffects.filter(e => e.expireTime > now);
                    if (this.slowEffects.length > 0) {
                        const minMult = Math.min(...this.slowEffects.map(e => e.multiplier));
                        effectiveMaxSpeed = this.maxSpeed * minMult;
                    }
                }
                
                if (dx !== 0 || dy !== 0) {
                    // 计算目标速度方向
                    const targetVx = dx * effectiveMaxSpeed;
                    const targetVy = dy * effectiveMaxSpeed;
                    
                    // 应用加速度
                    this.vx += (targetVx - this.vx) * this.acceleration;
                    this.vy += (targetVy - this.vy) * this.acceleration;
                    
                    // 更新角度
                    this.angle = Math.atan2(dy, dx);
                } else {
                    // 没有输入时，应用摩擦力
                    this.vx *= this.friction;
                    this.vy *= this.friction;
                }
                
                // 限制最大速度
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (currentSpeed > effectiveMaxSpeed) {
                    const scale = effectiveMaxSpeed / currentSpeed;
                    this.vx *= scale;
                    this.vy *= scale;
                }
            }
            
            // 更新位置
            this.x += this.vx;
            this.y += this.vy;
            
            // 边界限制（碰撞后停止速度）
            if (this.x < this.size / 2) {
                this.x = this.size / 2;
                this.vx = 0;
            } else if (this.x > CONFIG.CANVAS_WIDTH - this.size / 2) {
                this.x = CONFIG.CANVAS_WIDTH - this.size / 2;
                this.vx = 0;
            }
            if (this.y < this.size / 2) {
                this.y = this.size / 2;
                this.vy = 0;
            } else if (this.y > CONFIG.CANVAS_HEIGHT - this.size / 2) {
                this.y = CONFIG.CANVAS_HEIGHT - this.size / 2;
                this.vy = 0;
            }
            
            // 处理移动时的词条效果
            // 使用try-catch包装，确保词条处理错误不会影响移动
            try {
                this.processMoveTraits(dx, dy);
            } catch (traitError) {
                console.error('处理移动词条效果出错:', traitError, traitError.stack);
                // 确保即使词条处理出错也能继续移动
            }
        } catch (error) {
            console.error('玩家移动出错:', error, error.stack);
            // 确保即使出错也能继续游戏
        }
    }

    dash(dx, dy) {
        if (this.dashCooldown <= 0) {
            // 如果没有方向输入，使用玩家当前朝向
            if (dx === 0 && dy === 0) {
                dx = Math.cos(this.angle);
                dy = Math.sin(this.angle);
            }
            // 归一化方向
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > 0) {
                dx /= length;
                dy /= length;
            } else {
                // 如果完全没有方向，默认向前
                dx = 1;
                dy = 0;
            }
            this.isDashing = true;
            this.dashDirection = { x: dx, y: dy };
            this.dashCooldown = 1000;
            this.dashStartTime = Date.now(); // 记录冲刺开始时间
            
            // 播放冲刺音效
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.playSound('dash');
            }
            this.dashBrightness = 0; // 初始亮度为0
            this.dashGhosts = []; // 清空重影数组，开始新的冲刺
            this.lastGhostTime = Date.now(); // 重置重影时间
            // 冲刺时获得短暂无敌时间（约0.2秒，与闪避相同）
            this.invincibleUntil = Date.now() + CONFIG.PLAYER_DASH_DURATION;
            // 冲刺时重置攻击时间，打断攻击
            this.lastAttackTime = Date.now();
            // 冲刺时打断技能释放（但不重置冷却时间）
            // 如果正在释放技能，设置标志为false，让技能处理完成但不会继续执行
            if (this.isCastingSkill) {
                this.isCastingSkill = false;
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '冲刺!', '#00ffff');
                
                // 创建冲刺拖尾粒子效果
                const trailColor = window.CONFIG ? (window.CONFIG.PLAYER_DASH_TRAIL_COLOR || '#00ffff') : (CONFIG.PLAYER_DASH_TRAIL_COLOR || '#00ffff');
                if (this.gameInstance.particleManager) {
                    // 计算冲刺方向的反方向（用于拖尾效果）
                    const trailAngle = Math.atan2(-this.dashDirection.y, -this.dashDirection.x);
                    this.gameInstance.particleManager.createSystem(this.x, this.y, {
                        color: trailColor,
                        size: 2,
                        count: 8,
                        lifetime: 300,
                        fadeoutTime: 200,
                        speed: 0.5,
                        angle: trailAngle,
                        angleSpread: Math.PI / 3, // 60度扩散
                        gravity: 0,
                        spreadRadius: 5, // 随机散布半径
                        pixelStyle: true // 像素风格
                    });
                }
            }
            setTimeout(() => {
                this.isDashing = false;
                // 记录冲刺结束时间，用于限制冲刺后0.5秒内不能攻击或释放技能
                this.dashEndTime = Date.now();
            }, CONFIG.PLAYER_DASH_DURATION);
        }
    }

    /**
     * 当前武器若为落点范围技，返回施法距离与伤害半径（与 _executeWeaponSkill 中 refine 对 range 的处理一致）
     * @returns {{ castRange: number, aoeRadius: number }|null}
     */
    resolveGroundAoeSkillRanges() {
        const weapon = this.equipment.weapon;
        if (!weapon || !weapon.skill || weapon.skill.castMode !== 'ground_aoe') return null;
        const skill = Object.assign({}, weapon.skill);
        const refineLevel = weapon.refineLevel || 0;
        const refineEffect = refineLevel > 0 ? weapon.getRefineEffect(refineLevel) : null;
        if (refineEffect && refineEffect.rangeMultiplier) {
            skill.range = skill.range * (1 + refineEffect.rangeMultiplier);
        }
        const castRange = skill.groundCastRange != null ? skill.groundCastRange : skill.range * 1.08;
        const aoeRadius = skill.groundAoERadius != null ? skill.groundAoERadius : skill.range * 0.64;
        return { castRange, aoeRadius };
    }

    /**
     * 当前武器若为锁定技，返回技能射程（与 _executeWeaponSkill 中 refine 对 range 的处理一致）
     * @returns {{ range: number }|null}
     */
    resolveTargetLockSkillRange() {
        const weapon = this.equipment.weapon;
        if (!weapon || !weapon.skill || weapon.skill.castMode !== 'target_lock') return null;
        const skill = Object.assign({}, weapon.skill);
        const refineLevel = weapon.refineLevel || 0;
        const refineEffect = refineLevel > 0 ? weapon.getRefineEffect(refineLevel) : null;
        if (refineEffect && refineEffect.rangeMultiplier) {
            skill.range = skill.range * (1 + refineEffect.rangeMultiplier);
        }
        return { range: skill.range };
    }

    /**
     * 释放武器技能
     * @param {Array} monsters - 怪物列表
     * @param {{ groundPoint?: { x: number, y: number }, lockPickMode?: 'mouse_nearest', lockTarget?: object }} [options] - 落点坐标 / 锁定目标（长按瞄准时指定）
     * @returns {boolean} 是否成功释放技能
     */
    useWeaponSkill(monsters, options = {}) {
        // 如果正在冲刺，不能释放技能
        if (this.isDashing) {
            return false;
        }
        
        // 如果正在释放技能，不能再次释放
        if (this.isCastingSkill) {
            return false;
        }
        
        // 如果冲刺结束后0.5秒内，不能释放技能
        const now = Date.now();
        if (this.dashEndTime && now - this.dashEndTime < 500) {
            return false;
        }
        
        const weapon = this.equipment.weapon;
        if (!weapon || !weapon.skill) return false;
        
        if (this.weaponSkillCooldown > now) return false;
        
        // 设置技能释放标志，禁用输入
        this.isCastingSkill = true;
        
        // 使用 setTimeout 异步处理技能效果，避免阻塞主线程
        // 使用 0ms 延迟确保在下一个事件循环中执行，不会阻塞当前帧
        setTimeout(() => {
            try {
                this._executeWeaponSkill(monsters, weapon, now, options);
            } catch (error) {
                console.error('技能释放出错:', error, error.stack);
            } finally {
                // 确保在技能处理完成后清除标志，恢复输入
                this.isCastingSkill = false;
            }
        }, 0);
        
        return true;
    }
    
    /**
     * 执行武器技能效果（内部方法）
     * @private
     */
    _executeWeaponSkill(monsters, weapon, now, options = {}) {
        // 获取精炼效果
        const refineLevel = weapon.refineLevel || 0;
        const refineEffect = refineLevel > 0 ? weapon.getRefineEffect(refineLevel) : null;
        
        // 应用技能冷却时间减少词条
        const traitIds = this.getEquipmentTraitIds();
        let cooldownReduction = 1.0;
        if (traitIdsIncludeBase(traitIds, 'star_sea')) cooldownReduction -= 0.15;
        if (traitIdsIncludeBase(traitIds, 'arcane_core')) cooldownReduction -= 0.1;
        if (traitIdsIncludeBase(traitIds, 'star_bond')) cooldownReduction -= 0.15;
        if (traitIdsIncludeBase(traitIds, 'creation_law')) cooldownReduction -= 0.2;
        // 套装：银月8（12%）/ 星辰4（10%）等对武器技能冷却；多件取最高，且套装部分单独封顶 15%
        if (typeof getActiveSetEffects === 'function') {
            let setCdrFrac = 0;
            getActiveSetEffects(this.equipment).forEach(se => {
                const e = se.effect;
                if (!e || e.special !== 'cooldownReduction') return;
                const p = e.cooldownReductionPercent;
                if (typeof p === 'number' && p > 0) {
                    setCdrFrac = Math.max(setCdrFrac, Math.min(20, p) / 100);
                }
            });
            setCdrFrac = Math.min(0.15, setCdrFrac);
            cooldownReduction -= setCdrFrac;
        }
        cooldownReduction = Math.max(0.1, cooldownReduction); // 最少10%冷却时间
        
        // 应用精炼效果的冷却时间减少
        if (refineEffect && refineEffect.cooldownReduction) {
            const refineCooldownReduction = (weapon.skill.cooldown - refineEffect.cooldownReduction) / weapon.skill.cooldown;
            cooldownReduction = Math.min(cooldownReduction, refineCooldownReduction);
        }
        
        // 设置冷却时间（记录冷却结束时间）
        const actualCooldown = Math.floor(weapon.skill.cooldown * cooldownReduction);
        this.weaponSkillCooldown = now + actualCooldown;
        if (traitIdsIncludeBase(traitIds, 'void_n_skill') && typeof deepTraitBand === 'function') {
            const vns = voidTraitTierFromList(traitIds, 'void_n_skill');
            if (deepTraitBand(vns) >= 3) {
                this.weaponSkillCooldown = Math.max(now, this.weaponSkillCooldown - (420 + 45 * vns));
            }
        }

        // 咏咒词条：使用技能后，下次攻击伤害提升30%
        if (traitIdsIncludeBase(traitIds, 'chant')) {
            this.skillDamageBoost = 1.3;
        }
        
        // 优化：使用浅拷贝而不是深度复制，避免阻塞
        // 创建一个新对象，但只复制需要的属性
        const skill = Object.assign({}, weapon.skill);
        
        // 应用精炼效果到技能属性
        if (refineEffect) {
            // 伤害倍率提升
            if (refineEffect.damageMultiplier) {
                skill.damageMultiplier = skill.damageMultiplier * (1 + refineEffect.damageMultiplier);
            }
            
            // 范围提升
            if (refineEffect.rangeMultiplier) {
                skill.range = skill.range * (1 + refineEffect.rangeMultiplier);
            }
            
            // 冷却时间减少（已在上面处理）
            
            // 暴击率加成
            if (refineEffect.critRateBonus) {
                skill.critRateBonus = (skill.critRateBonus || 0) + refineEffect.critRateBonus;
            }
            
            // 暴击伤害加成
            if (refineEffect.critDamageBonus) {
                skill.critDamageBonus = (skill.critDamageBonus || 0) + refineEffect.critDamageBonus;
            }
            
            // 必定暴击
            if (refineEffect.guaranteedCrit) {
                skill.guaranteedCrit = true;
            }
            
            // 额外伤害
            if (refineEffect.extraDamage) {
                skill.extraDamage = refineEffect.extraDamage;
            }
            
            // Buff/Debuff持续时间加成
            if (refineEffect.buffDurationBonus) {
                if (skill.speedBoostDuration) skill.speedBoostDuration += refineEffect.buffDurationBonus;
                if (skill.dodgeBoostDuration) skill.dodgeBoostDuration += refineEffect.buffDurationBonus;
                if (skill.attackSpeedBoostDuration) skill.attackSpeedBoostDuration += refineEffect.buffDurationBonus;
                if (skill.attackBoostDuration) skill.attackBoostDuration += refineEffect.buffDurationBonus;
                if (skill.allStatsBoostDuration) skill.allStatsBoostDuration += refineEffect.buffDurationBonus;
            }
            
            if (refineEffect.debuffDurationBonus) {
                if (skill.slowDuration) skill.slowDuration += refineEffect.debuffDurationBonus;
                if (skill.freezeDuration) skill.freezeDuration += refineEffect.freezeDurationBonus || refineEffect.debuffDurationBonus;
            }
            
            // Buff效果加成
            if (refineEffect.speedBoostBonus) {
                skill.speedBoost = (skill.speedBoost || 0) + refineEffect.speedBoostBonus;
            }
            if (refineEffect.dodgeBoostBonus) {
                skill.dodgeBoost = (skill.dodgeBoost || 0) + refineEffect.dodgeBoostBonus;
            }
            if (refineEffect.attackSpeedBoostBonus) {
                skill.attackSpeedBoost = (skill.attackSpeedBoost || 0) + refineEffect.attackSpeedBoostBonus;
            }
            if (refineEffect.attackBoostBonus) {
                skill.attackBoost = (skill.attackBoost || 0) + refineEffect.attackBoostBonus;
            }
            if (refineEffect.allStatsBoostBonus) {
                skill.allStatsBoost = (skill.allStatsBoost || 0) + refineEffect.allStatsBoostBonus;
            }
            
            // 范围伤害加成（魔法水晶剑）
            if (refineEffect.aoeDamageBonus) {
                skill.aoeDamage = (skill.aoeDamage || 0) + refineEffect.aoeDamageBonus;
            }
            if (refineEffect.aoeRangeBonus) {
                skill.refine_aoeRangeBonus = refineEffect.aoeRangeBonus;
            }
            if (refineEffect.chainExplosion) {
                skill.refine_chainExplosion = true;
                skill.refine_chainExplosionDamage = refineEffect.chainExplosionDamage || 0.5;
            }
            
            // 敌人debuff加成（混沌之刃）
            if (refineEffect.enemyDebuffBonus) {
                skill.enemyDebuff = (skill.enemyDebuff || 0) + refineEffect.enemyDebuffBonus;
            }
            if (refineEffect.debuffStackable) {
                skill.refine_debuffStackable = true;
            }
            if (refineEffect.debuffExplosionThreshold) {
                skill.refine_debuffExplosionThreshold = refineEffect.debuffExplosionThreshold;
                skill.refine_debuffExplosionDamage = refineEffect.debuffExplosionDamage || 1.5;
            }
            
            // 扇形角度加成（远古龙刃）
            if (refineEffect.coneAngleBonus) {
                skill.refine_coneAngleBonus = refineEffect.coneAngleBonus;
            }
            if (refineEffect.guaranteedDragonBreath) {
                skill.refine_guaranteedDragonBreath = true;
            }
            if (refineEffect.guaranteedCrystalMagic) {
                skill.refine_guaranteedCrystalMagic = true;
            }
            if (refineEffect.guaranteedChaosBlade) {
                skill.refine_guaranteedChaosBlade = true;
            }
            
            // 攻击力提升叠加（精钢长剑）
            if (refineEffect.attackBoostStackable) {
                skill.refine_attackBoostStackable = true;
                skill.refine_attackBoostMaxStacks = refineEffect.attackBoostMaxStacks || 2;
            }
            if (refineEffect.attackBoostOnHit) {
                skill.refine_attackBoostOnHit = refineEffect.attackBoostOnHit;
            }
            
            // Debuff效果加成
            if (refineEffect.slowEffectBonus) {
                skill.slowEffect = (skill.slowEffect || 0) + refineEffect.slowEffectBonus;
            }
            if (refineEffect.enemySlowEffectBonus) {
                skill.enemySlowEffect = (skill.enemySlowEffect || 0) + refineEffect.enemySlowEffectBonus;
            }
            
            // 持续伤害加成
            if (refineEffect.dotDamageBonus) {
                skill.dotDamage = (skill.dotDamage || 0) + refineEffect.dotDamageBonus;
            }
            if (refineEffect.dotDurationBonus) {
                skill.dotDuration = (skill.dotDuration || 0) + refineEffect.dotDurationBonus;
            }
            
            // 冰冻持续时间加成
            if (refineEffect.freezeDurationBonus) {
                skill.freezeDuration = (skill.freezeDuration || 0) + refineEffect.freezeDurationBonus;
            }
            
            // 恢复生命值加成
            if (refineEffect.healPercentBonus) {
                skill.healPercent = (skill.healPercent || 0) + refineEffect.healPercentBonus;
            }
            
            // 将精炼效果的其他属性复制到技能对象中，以便后续处理
            Object.keys(refineEffect).forEach(key => {
                if (!['damageMultiplier', 'rangeMultiplier', 'cooldownReduction', 'description'].includes(key)) {
                    skill[`refine_${key}`] = refineEffect[key];
                }
            });
        }
        let hit = false;
        const killedMonsters = [];
        let skillVisualAoeDone = false;  // 范围技能特效只播一次
        let skillVisualDragonDone = false;

        const castMode = skill.castMode || 'radial';
        let groundCx = null;
        let groundCy = null;
        let groundGar = 0;
        let targetsHit = [];

        if (castMode === 'ground_aoe' && this.gameInstance && typeof this.gameInstance.getSkillGroundAimPoint === 'function') {
            const gcr = skill.groundCastRange != null ? skill.groundCastRange : skill.range * 1.08;
            groundGar = skill.groundAoERadius != null ? skill.groundAoERadius : skill.range * 0.64;
            let pt;
            const gp = options.groundPoint;
            if (gp && Number.isFinite(gp.x) && Number.isFinite(gp.y) && typeof this.gameInstance.clampGroundSkillAimWorldPoint === 'function') {
                pt = this.gameInstance.clampGroundSkillAimWorldPoint(gp.x, gp.y, this, gcr);
            } else {
                pt = this.gameInstance.getSkillGroundAimPoint(this, gcr);
            }
            groundCx = pt.x;
            groundCy = pt.y;
            targetsHit = collectMonstersInGroundSkillRadius(monsters, groundCx, groundCy, groundGar);
            this.gameInstance.addEquipmentEffect('ground_sigil', groundCx, groundCy, { radius: groundGar, duration: 520 });
            if (skill.aoeDamage && !skillVisualAoeDone) {
                skillVisualAoeDone = true;
                this.gameInstance.addEquipmentEffect('magic_explosion', groundCx, groundCy, {
                    radius: Math.max(96, groundGar * 1.08),
                    duration: 500
                });
            }
            if (weapon.name === '远古龙刃' && targetsHit.length) {
                skillVisualDragonDone = true;
                const breathRange = skill.range * 0.6;
                const effectX = this.x + Math.cos(this.angle) * breathRange;
                const effectY = this.y + Math.sin(this.angle) * breathRange;
                this.gameInstance.addEquipmentEffect('dragon_breath', effectX, effectY, {
                    radius: skill.range,
                    angle: this.angle,
                    duration: 600
                });
            }
        } else if (castMode === 'target_lock') {
            const r2 = skill.range * skill.range;
            let primary = null;
            const lt = options.lockTarget;
            if (lt && isCombatTargetAliveForEquipmentProc(lt)) {
                const dx = lt.x - this.x;
                const dy = lt.y - this.y;
                if (dx * dx + dy * dy <= r2) primary = lt;
            }
            if (!primary && options.lockPickMode === 'mouse_nearest') {
                primary = pickWeaponSkillLockTargetNearestToMouse(monsters, this, skill.range, this.gameInstance);
            }
            if (!primary) {
                primary = pickWeaponSkillLockTarget(monsters, this, skill.range, this.gameInstance);
            }
            if (primary) {
                targetsHit = [primary];
                if (skill.showLockMarker !== false && this.gameInstance) {
                    const lockMs = Math.min(950, Math.max(420, Math.floor((skill.cooldown || 8000) * 0.055 + 380)));
                    this.gameInstance.addEquipmentEffect('skill_lock_marker', primary.x, primary.y, {
                        duration: lockMs,
                        followTarget: primary
                    });
                }
            }
        } else {
            const r2 = skill.range * skill.range;
            targetsHit = monsters.filter(m => {
                const isD = m instanceof TrainingDummy || m instanceof MonsterTrainingDummy;
                if (!isD && m.hp <= 0) return false;
                const dx = m.x - this.x;
                const dy = m.y - this.y;
                return dx * dx + dy * dy <= r2;
            });
        }

        targetsHit.forEach(monster => {
            // 检查是否是训练桩（包括怪物类型训练假人）
            const isDummy = monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy;
            
            // 对于普通怪物，检查是否已死亡
            if (!isDummy && monster.hp <= 0) return;
            
            hit = true;
                
                // 通用技能命中特效（所有武器技能命中时显示）
                if (this.gameInstance) {
                    this.gameInstance.addEquipmentEffect('skill_hit', monster.x, monster.y, {
                        radius: 48,
                        duration: 380,
                        angle: this.angle
                    });
                }
                // 打造武器·魔法水晶剑：技能范围伤害时显示魔法爆炸（非落点施法时仍按首目标）
                if (skill.aoeDamage && this.gameInstance && !skillVisualAoeDone && castMode !== 'ground_aoe') {
                    skillVisualAoeDone = true;
                    this.gameInstance.addEquipmentEffect('magic_explosion', monster.x, monster.y, {
                        radius: 120,
                        duration: 500
                    });
                }
                // 打造武器·远古龙刃：扇形龙息特效（只播一次；落点施法已在上方处理）
                if (weapon.name === '远古龙刃' && this.gameInstance && !skillVisualDragonDone && castMode !== 'ground_aoe') {
                    skillVisualDragonDone = true;
                    const breathRange = skill.range * 0.6;
                    const effectX = this.x + Math.cos(this.angle) * breathRange;
                    const effectY = this.y + Math.sin(this.angle) * breathRange;
                    this.gameInstance.addEquipmentEffect('dragon_breath', effectX, effectY, {
                        radius: skill.range,
                        angle: this.angle,
                        duration: 600
                    });
                }
                // 打造武器·混沌之刃：每个命中目标显示混沌爆炸
                if (weapon.name === '混沌之刃' && this.gameInstance) {
                    this.gameInstance.addEquipmentEffect('chaos_blast', monster.x, monster.y, {
                        radius: 80,
                        duration: 600
                    });
                }
                
                // 应用技能效果提升词条
                const traitIds = this.getEquipmentTraitIds();
                let skillEffectMultiplier = 1.0;
                if (traitIdsIncludeBase(traitIds, 'star_map')) skillEffectMultiplier += 0.2;
                if (traitIdsIncludeBase(traitIds, 'eternal_star')) skillEffectMultiplier += 0.25;
                if (traitIdsIncludeBase(traitIds, 'resonance')) skillEffectMultiplier += 0.15;
                if (traitIdsIncludeBase(traitIds, 'void_n_skill')) {
                    const ts = voidTraitTierFromList(traitIds, 'void_n_skill');
                    skillEffectMultiplier += (5 + 0.65 * ts) / 100;
                    if (typeof deepTraitBand === 'function') {
                        const nsb = deepTraitBand(ts);
                        if (nsb >= 1) skillEffectMultiplier += 0.02;
                        if (nsb >= 2) skillEffectMultiplier += 0.035;
                    }
                }
                
                // 计算伤害
                let damage = this.baseAttack * skill.damageMultiplier * skillEffectMultiplier;
                
                // 处理范围伤害（魔法水晶剑）- 对周围敌人造成额外伤害（落点施法已在落点圈内打满主伤害，不再以各目标为中心二次爆炸）
                if (skill.aoeDamage && this.gameInstance && castMode !== 'ground_aoe') {
                    const aoeRange = skill.range * 1.2; // 范围伤害的范围稍大
                    const aoeDamageMultiplier = skill.aoeDamage + (skill.refine_aoeDamageBonus || 0);
                    const aoeDamage = this.baseAttack * skill.damageMultiplier * aoeDamageMultiplier * skillEffectMultiplier;
                    
                    monsters.forEach(m => {
                        if (m === monster) return; // 跳过主目标
                        if (!isCombatTargetAliveForEquipmentProc(m)) return;
                        
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        const aoeDistance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (aoeDistance <= aoeRange) {
                            let aoeDmg = Math.floor(aoeDamage);
                            
                            // 处理暴击
                            const critRoll = Math.random() * 100;
                            if (critRoll < this.baseCritRate) {
                                aoeDmg += this.baseCritDamage;
                            }
                            
                            this.damageMonsterFromEnvironment(m, aoeDmg);
                            this.gameInstance.addFloatingText(
                                m.x,
                                m.y,
                                `爆炸: ${aoeDmg}`,
                                '#ff00ff',
                                2000,
                                18,
                                true
                            );
                            
                            // 处理连锁爆炸（精炼效果）
                            if (skill.refine_chainExplosion && this.gameInstance) {
                                const chainExplosionDamage = aoeDmg * (skill.refine_chainExplosionDamage || 0.5);
                                monsters.forEach(m2 => {
                                    if (m2 === m || m2 === monster) return;
                                    if (!isCombatTargetAliveForEquipmentProc(m2)) return;
                                    
                                    const dx2 = m2.x - m.x;
                                    const dy2 = m2.y - m.y;
                                    const chainDistance = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                                    
                                    if (chainDistance <= aoeRange * 0.8) {
                                        this.damageMonsterFromEnvironment(m2, Math.floor(chainExplosionDamage));
                                        this.gameInstance.addFloatingText(
                                            m2.x,
                                            m2.y,
                                            `二次爆炸: ${Math.floor(chainExplosionDamage)}`,
                                            '#ff88ff',
                                            2000,
                                            18,
                                            true
                                        );
                                    }
                                });
                            }
                        }
                    });
                }
                
                // 应用精炼效果的额外伤害
                if (skill.extraDamage) {
                    damage += this.baseAttack * skill.extraDamage;
                }
                
                // 应用精炼效果：低生命值伤害加成（坠星裁决5级）
                if (skill.refine_lowHpDamageBonus && skill.refine_lowHpThreshold && skill.refine_lowHpDamageMultiplier) {
                    const hpPercent = this.hp / this.maxHp;
                    if (hpPercent < skill.refine_lowHpThreshold) {
                        damage *= skill.refine_lowHpDamageMultiplier;
                    }
                }
                
                // 应用咏咒词条的伤害加成
                if (this.skillDamageBoost > 1.0) {
                    damage *= this.skillDamageBoost;
                    this.skillDamageBoost = 1.0; // 使用后重置
                }
                
                // 处理暴击
                let isCrit = false;
                let critRate = this.baseCritRate;
                if (skill.critRateBonus) {
                    critRate += skill.critRateBonus;
                }
                
                if (skill.guaranteedCrit) {
                    isCrit = true;
                    damage += this.baseCritDamage * (1 + (skill.critDamageBonus || 0));
                } else if (skill.critBonus) {
                    // 有额外暴击伤害加成
                    const critRoll = Math.random() * 100;
                    if (critRoll < critRate) {
                        isCrit = true;
                        damage += this.baseCritDamage * (1 + skill.critBonus + (skill.critDamageBonus || 0));
                    }
                } else {
                    // 普通暴击判定
                    const critRoll = Math.random() * 100;
                    if (critRoll < critRate) {
                        isCrit = true;
                        damage += this.baseCritDamage * (1 + (skill.critDamageBonus || 0));
                    }
                }
                
                // 应用精炼效果：冰冻时额外伤害（晶曜寒锋）
                if (skill.refine_freezeExtraDamage && monster.frozenUntil && monster.frozenUntil > now) {
                    damage += this.baseAttack * skill.refine_freezeExtraDamage;
                }
                
                // 造成伤害
                const mainSkillDmg = Math.floor(damage);
                const killed = monster.takeDamage(mainSkillDmg);
                if (!isDummy && mainSkillDmg > 0) this.applyLifeStealFromHit(mainSkillDmg);
                // 播放打击音效
                if (this.gameInstance && this.gameInstance.soundManager) {
                    this.gameInstance.soundManager.playSound('hit');
                }
                
                // 应用精炼效果：技能命中后恢复生命（坠星裁决4-5级）
                if (skill.refine_healOnHit && this.gameInstance) {
                    const healAmount = Math.floor(this.maxHp * skill.refine_healOnHit);
                    this.hp = Math.min(this.hp + healAmount, this.maxHp);
                    this.gameInstance.addFloatingText(
                        this.x,
                        this.y,
                        `+${healAmount} 生命值`,
                        '#00ff00'
                    );
                }
                
                // 应用精炼效果：技能命中后减少所有技能冷却时间（圣耀·断罪4-5级）
                if (skill.refine_reduceAllCooldownsOnHit && this.gameInstance) {
                    this.weaponSkillCooldown = Math.max(0, this.weaponSkillCooldown - skill.refine_reduceAllCooldownsOnHit);
                }
                
                // 应用精炼效果：技能命中后重置普通攻击冷却（逐月银芒剑5级）
                if (skill.refine_resetAttackCooldown) {
                    this.lastAttackTime = 0;
                }
                
                // 应用精炼效果：击杀敌人后重置技能冷却（圣耀·断罪5级）
                if (skill.refine_resetCooldownOnKill && killed && !isDummy) {
                    this.weaponSkillCooldown = 0;
                }
                
                // 应用精炼效果：连锁闪电（辉光秘银刃3-5级，惊雷破晓5级）
                if (skill.refine_chainLightning && (isCrit || skill.refine_guaranteedChain) && this.gameInstance) {
                    // 播放感电音效
                    if (this.gameInstance.soundManager) {
                        this.gameInstance.soundManager.playSound('shock');
                    }
                    const chainCount = skill.refine_chainCount || 1;
                    const chainDamage = skill.refine_chainDamage || 0.5;
                    const chainRange = skill.refine_chainRange || CONFIG.PLAYER_ATTACK_RANGE * 1.5;
                    
                    let chainedMonsters = [];
                    let currentChainTarget = monster;
                    
                    for (let i = 0; i < chainCount; i++) {
                        // 查找下一个目标
                        let nextTarget = null;
                        let minDistance = chainRange;
                        
                        monsters.forEach(m => {
                            if (m === currentChainTarget || chainedMonsters.includes(m)) return;
                            if (!isCombatTargetAliveForEquipmentProc(m)) return;
                            
                            const dx = m.x - currentChainTarget.x;
                            const dy = m.y - currentChainTarget.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            
                            if (distance <= chainRange && distance < minDistance) {
                                nextTarget = m;
                                minDistance = distance;
                            }
                        });
                        
                        if (nextTarget) {
                            chainedMonsters.push(nextTarget);
                            const chainDmg = Math.floor(this.baseAttack * skill.damageMultiplier * chainDamage);
                            this.damageMonsterFromEnvironment(nextTarget, chainDmg);
                            
                            this.gameInstance.addFloatingText(
                                nextTarget.x,
                                nextTarget.y,
                                `连锁: ${chainDmg}`,
                                '#ffff00'
                            );
                            
                            currentChainTarget = nextTarget;
                        } else {
                            break;
                        }
                    }
                }
                
                // 应用精炼效果：冰冻扩散（晶曜寒锋4-5级）
                if (skill.refine_freezeSpread && skill.freezeEffect && this.gameInstance) {
                    const spreadRange = skill.refine_freezeSpreadRange || CONFIG.PLAYER_ATTACK_RANGE * 1.5;
                    monsters.forEach(m => {
                        if (m === monster) return;
                        if (!isCombatTargetAliveForEquipmentProc(m)) return;
                        
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance <= spreadRange) {
                            const freezeDuration = skill.freezeDuration || 1500;
                            const isDummyM = m instanceof TrainingDummy || m instanceof MonsterTrainingDummy;
                            if (isDummyM) {
                                m.addStatusEffect('frozen', { duration: freezeDuration });
                            } else {
                                m.frozenUntil = now + freezeDuration;
                            }
                            this.gameInstance.addFloatingText(
                                m.x,
                                m.y,
                                '冰冻扩散!',
                                '#00ffff',
                                2000,
                                18,
                                true
                            );
                        }
                    });
                }
                
                // 应用精炼效果：冰冻敌人死亡时爆炸（晶曜寒锋5级）
                if (skill.refine_freezeExplosion && killed && monster.frozenUntil && monster.frozenUntil > now && this.gameInstance) {
                    const explosionRange = skill.refine_freezeExplosionRange || CONFIG.PLAYER_ATTACK_RANGE * 1.5;
                    const explosionDamage = this.baseAttack * (skill.refine_freezeExplosionDamage || 0.5);
                    
                    monsters.forEach(m => {
                        if (m === monster) return;
                        if (!isCombatTargetAliveForEquipmentProc(m)) return;
                        
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        
                        if (distance <= explosionRange) {
                            this.damageMonsterFromEnvironment(m, Math.floor(explosionDamage));
                            this.gameInstance.addFloatingText(
                                m.x,
                                m.y,
                                `爆炸: ${Math.floor(explosionDamage)}`,
                                '#ff00ff',
                                2000,
                                18,
                                true
                            );
                        }
                    });
                }
                
                // 应用精炼效果：持续伤害叠加（逆鳞屠龙锋4-5级）
                if (skill.refine_dotStackable && skill.dotDamage && skill.dotDuration && this.gameInstance) {
                    // 检查是否已有持续伤害效果
                    const existingDot = this.weaponSkillDots.find(dot => dot.monster === monster);
                    if (existingDot) {
                        // 叠加层数
                        existingDot.damagePerSecond += this.baseAttack * skill.dotDamage;
                        existingDot.duration = Math.max(existingDot.duration, skill.dotDuration);
                        existingDot.lastTick = now;
                        
                        // 检查是否达到爆炸阈值（逆鳞屠龙锋5级）
                        if (skill.refine_dotExplosionThreshold && (existingDot.stackCount || 1) >= skill.refine_dotExplosionThreshold) {
                            const explosionDamage = this.baseAttack * (skill.refine_dotExplosionDamage || 2.0);
                            const explosionRange = skill.refine_freezeExplosionRange || CONFIG.PLAYER_ATTACK_RANGE * 2.0;
                            
                            this.damageMonsterFromEnvironment(monster, Math.floor(explosionDamage));
                            this.gameInstance.addFloatingText(
                                monster.x,
                                monster.y,
                                `爆炸: ${Math.floor(explosionDamage)}`,
                                '#ff0000',
                                2000,
                                18,
                                true
                            );
                            
                            // 对周围敌人造成伤害
                            monsters.forEach(m => {
                                if (m === monster || !isCombatTargetAliveForEquipmentProc(m)) return;
                                
                                const dx = m.x - monster.x;
                                const dy = m.y - monster.y;
                                const distance = Math.sqrt(dx * dx + dy * dy);
                                
                                if (distance <= explosionRange) {
                                    this.damageMonsterFromEnvironment(m, Math.floor(explosionDamage * 0.5));
                                }
                            });
                            
                            // 移除持续伤害效果
                            const dotIndex = this.weaponSkillDots.indexOf(existingDot);
                            if (dotIndex > -1) {
                                this.weaponSkillDots.splice(dotIndex, 1);
                            }
                        } else {
                            existingDot.stackCount = (existingDot.stackCount || 1) + 1;
                        }
                    } else {
                        // 创建新的持续伤害效果
                        this.weaponSkillDots.push({
                            monster: monster,
                            damagePerSecond: this.baseAttack * skill.dotDamage,
                            duration: skill.dotDuration,
                            startTime: now,
                            lastTick: now,
                            stackCount: 1
                        });
                    }
                }
                
                // 添加持续伤害效果（如果有，且未叠加）
                if (skill.dotDamage && skill.dotDuration && this.gameInstance && !skill.refine_dotStackable) {
                    // 播放燃烧音效
                    if (this.gameInstance.soundManager) {
                        this.gameInstance.soundManager.playSound('burn');
                    }
                    // 对于训练桩，添加燃烧状态
                    if (isDummy) {
                        monster.addStatusEffect('burning', {
                            damage: this.baseAttack * skill.dotDamage,
                            duration: skill.dotDuration
                        });
                    } else {
                        this.weaponSkillDots.push({
                            monster: monster,
                            damagePerSecond: this.baseAttack * skill.dotDamage,
                            duration: skill.dotDuration,
                            startTime: now,
                            lastTick: now
                        });
                    }
                }
                
                // 添加冰冻效果（如果有）
                if (skill.freezeEffect && skill.freezeDuration && this.gameInstance) {
                    const isDummy = monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy;
                    if (isDummy) {
                        monster.addStatusEffect('frozen', { duration: skill.freezeDuration });
                    } else {
                        monster.frozenUntil = now + skill.freezeDuration;
                    }
                    this.gameInstance.addFloatingText(
                        monster.x,
                        monster.y,
                        '冰冻!',
                        '#00ffff'
                    );
                }
                
                // 添加减速效果（如果有）
                if (skill.slowEffect && skill.slowDuration && this.gameInstance) {
                    const isDummy = monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy;
                    
                    // 应用精炼效果：减速叠加（鸣霜青铜剑4-5级，凛冬之拥4-5级）
                    if (skill.refine_slowStackable || skill.refine_enemySlowStackable) {
                        if (isDummy) {
                            const existingSlow = monster.statusEffects?.find(se => se.type === 'slowed');
                            if (existingSlow) {
                                // 叠加减速效果
                                existingSlow.multiplier = Math.max(0.1, existingSlow.multiplier * (1 - skill.slowEffect));
                                existingSlow.duration = Math.max(existingSlow.duration, skill.slowDuration);
                            } else {
                                monster.addStatusEffect('slowed', {
                                    multiplier: 1 - skill.slowEffect,
                                    duration: skill.slowDuration
                                });
                            }
                        } else {
                            if (!monster.slowEffects) monster.slowEffects = [];
                            // 计算总减速效果
                            let totalSlow = skill.slowEffect;
                            monster.slowEffects.forEach(se => {
                                if (se.expireTime > now) {
                                    totalSlow += (1 - se.multiplier);
                                }
                            });
                            totalSlow = Math.min(0.9, totalSlow); // 最多减速90%
                            
                            monster.slowEffects.push({
                                multiplier: 1 - skill.slowEffect,
                                expireTime: now + skill.slowDuration
                            });
                            
                            // 应用精炼效果：减速达到阈值时冰冻（鸣霜青铜剑5级，凛冬之拥5级）
                            if (skill.refine_slowToFreeze && totalSlow >= skill.refine_slowToFreeze) {
                                const freezeDuration = skill.refine_freezeDuration || 2000;
                                monster.frozenUntil = now + freezeDuration;
                                this.gameInstance.addFloatingText(
                                    monster.x,
                                    monster.y,
                                    '减速冰冻!',
                                    '#00ffff'
                                );
                            }
                        }
                    } else {
                        // 普通减速效果
                        if (isDummy) {
                            monster.addStatusEffect('slowed', {
                                multiplier: 1 - skill.slowEffect,
                                duration: skill.slowDuration
                            });
                        } else {
                            if (!monster.slowEffects) monster.slowEffects = [];
                            monster.slowEffects.push({
                                multiplier: 1 - skill.slowEffect,
                                expireTime: now + skill.slowDuration
                            });
                        }
                    }
                }
                
                // 添加敌人攻击速度降低效果（如果有）
                if (skill.enemySlowEffect && skill.slowDuration && this.gameInstance) {
                    const isDummy = monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy;
                    
                    // 应用精炼效果：减速敌人时提升自身防御（凛冬之拥4-5级）
                    if (skill.refine_defenseBoostFromSlow) {
                        this.buffs.push({
                            effects: { defense: this.baseDefense * skill.refine_defenseBoostFromSlow },
                            expireTime: now + skill.slowDuration
                        });
                        this.updateStats();
                    }
                    
                    // 应用精炼效果：敌人攻击速度降低叠加（凛冬之拥4-5级）
                    if (skill.refine_enemySlowStackable) {
                        if (isDummy) {
                            const existingDebuff = monster.statusEffects?.find(se => se.type === 'attackSpeedDebuff');
                            if (existingDebuff) {
                                existingDebuff.multiplier = Math.max(0.1, existingDebuff.multiplier * (1 - skill.enemySlowEffect));
                                existingDebuff.duration = Math.max(existingDebuff.duration, skill.slowDuration);
                            } else {
                                monster.addStatusEffect('attackSpeedDebuff', {
                                    multiplier: 1 - skill.enemySlowEffect,
                                    duration: skill.slowDuration
                                });
                            }
                        } else {
                            if (!monster.attackSpeedDebuffs) monster.attackSpeedDebuffs = [];
                            // 计算总减速效果
                            let totalSlow = skill.enemySlowEffect;
                            monster.attackSpeedDebuffs.forEach(debuff => {
                                if (debuff.expireTime > now) {
                                    totalSlow += (1 - debuff.multiplier);
                                }
                            });
                            totalSlow = Math.min(0.9, totalSlow); // 最多减速90%
                            
                            monster.attackSpeedDebuffs.push({
                                multiplier: 1 - skill.enemySlowEffect,
                                expireTime: now + skill.slowDuration
                            });
                            
                            // 应用精炼效果：减速达到阈值时冰冻（凛冬之拥5级）
                            if (skill.refine_slowToFreeze && totalSlow >= skill.refine_slowToFreeze) {
                                const freezeDuration = skill.refine_freezeDuration || 2000;
                                monster.frozenUntil = now + freezeDuration;
                                // 播放冰冻音效
                                if (this.gameInstance.soundManager) {
                                    this.gameInstance.soundManager.playSound('freeze');
                                }
                                this.gameInstance.addFloatingText(
                                    monster.x,
                                    monster.y,
                                    '减速冰冻!',
                                    '#00ffff'
                                );
                            }
                        }
                    } else {
                        // 普通减速效果
                        if (isDummy) {
                            monster.addStatusEffect('attackSpeedDebuff', {
                                multiplier: 1 - skill.enemySlowEffect,
                                duration: skill.slowDuration
                            });
                        } else {
                            if (!monster.attackSpeedDebuffs) monster.attackSpeedDebuffs = [];
                            monster.attackSpeedDebuffs.push({
                                multiplier: 1 - skill.enemySlowEffect,
                                expireTime: now + skill.slowDuration
                            });
                        }
                    }
                }
                
                // 处理敌人debuff（混沌之刃）- 降低敌人所有属性
                if (skill.enemyDebuff && skill.debuffDuration && this.gameInstance) {
                    const debuffMultiplier = 1 - (skill.enemyDebuff + (skill.refine_enemyDebuffBonus || 0));
                    const debuffDuration = skill.debuffDuration + (skill.refine_debuffDurationBonus || 0);
                    
                    // 应用精炼效果：debuff可叠加
                    if (skill.refine_debuffStackable) {
                        if (!monster.chaosDebuffs) monster.chaosDebuffs = [];
                        monster.chaosDebuffs.push({
                            multiplier: debuffMultiplier,
                            expireTime: now + debuffDuration
                        });
                        
                        // 检查是否达到爆炸阈值（精炼5级）
                        if (skill.refine_debuffExplosionThreshold && monster.chaosDebuffs.length >= skill.refine_debuffExplosionThreshold) {
                            const explosionDamage = this.baseAttack * (skill.refine_debuffExplosionDamage || 1.5);
                            this.damageMonsterFromEnvironment(monster, Math.floor(explosionDamage));
                            this.gameInstance.addFloatingText(
                                monster.x,
                                monster.y,
                                `混沌爆炸: ${Math.floor(explosionDamage)}`,
                                '#8b00ff',
                                2000,
                                18,
                                true
                            );
                            
                            // 清空debuff层数
                            monster.chaosDebuffs = [];
                        }
                    } else {
                        // 普通debuff效果
                        if (!monster.chaosDebuffs) monster.chaosDebuffs = [];
                        monster.chaosDebuffs = [{
                            multiplier: debuffMultiplier,
                            expireTime: now + debuffDuration
                        }];
                    }
                    
                    this.gameInstance.addFloatingText(
                        monster.x,
                        monster.y,
                        `属性降低${Math.floor((1 - debuffMultiplier) * 100)}%`,
                        '#8b00ff'
                    );
                }
                
                // 只有普通怪物才会被击杀，训练桩不会死亡
                if (killed && !isDummy && this.gameInstance) {
                    killedMonsters.push(monster);
                }
                
                // 技能伤害数字从怪物头上弹出（与普攻一致，只显示数字）
                if (this.gameInstance) {
                    const damageNum = Math.floor(damage);
                    const direction = Math.random() < 0.5 ? 'left' : 'right';
                    const color = isCrit ? '#ffd700' : '#ffffff';
                    const fontSize = isCrit ? 28 : 20;
                    this.gameInstance.addFloatingText(monster.x, monster.y, damageNum.toString(), color, 1500, fontSize, true, direction);
                }
        });
        
        // 应用玩家自身的buff效果（如果有）
        if (hit && this.gameInstance) {
            // 移动速度提升
            if (skill.speedBoost && skill.speedBoostDuration) {
                this.buffs.push({
                    effects: { moveSpeed: this.baseMoveSpeed * skill.speedBoost * 100 / CONFIG.PLAYER_SPEED },
                    expireTime: now + skill.speedBoostDuration
                });
                this.updateStats();
            }
            
            // 闪避率提升
            if (skill.dodgeBoost && skill.dodgeBoostDuration) {
                this.buffs.push({
                    effects: { dodge: skill.dodgeBoost * 100 },
                    expireTime: now + skill.dodgeBoostDuration
                });
                this.updateStats();
            }
            
            // 攻击速度提升
            if (skill.attackSpeedBoost && skill.attackSpeedBoostDuration) {
                const effects = { attackSpeed: skill.attackSpeedBoost * 100 };
                
                // 应用精炼效果：攻击速度提升时移动速度也提升（逐月银芒剑4-5级）
                if (skill.refine_attackSpeedAlsoBoostsMoveSpeed) {
                    effects.moveSpeed = skill.attackSpeedBoost * 100;
                }
                
                this.buffs.push({
                    effects: effects,
                    expireTime: now + skill.attackSpeedBoostDuration
                });
                this.updateStats();
            }
            
            // 攻击力提升
            if (skill.attackBoost && skill.attackBoostDuration) {
                const effects = { attack: this.baseAttack * skill.attackBoost };
                
                // 应用精炼效果：攻击力提升时暴击率也提升（劫火焚伤4-5级）
                if (skill.refine_attackBoostAlsoBoostsCrit && skill.refine_critRateFromAttackBoost) {
                    effects.critRate = this.baseCritRate * skill.refine_critRateFromAttackBoost;
                }
                
                this.buffs.push({
                    effects: effects,
                    expireTime: now + skill.attackBoostDuration
                });
                this.updateStats();
            }
            
            // 所有属性提升
            if (skill.allStatsBoost && skill.allStatsBoostDuration) {
                const boostPercent = skill.allStatsBoost;
                const effects = {
                    attack: this.baseAttack * boostPercent,
                    defense: this.baseDefense * boostPercent,
                    critRate: this.baseCritRate * boostPercent,
                    critDamage: this.baseCritDamage * boostPercent,
                    dodge: this.baseDodge * boostPercent,
                    attackSpeed: this.baseAttackSpeed * boostPercent,
                    moveSpeed: (this.baseMoveSpeed / CONFIG.PLAYER_SPEED - 1) * 100 * boostPercent
                };
                
                // 应用精炼效果：全属性提升时免疫控制效果（惊雷破晓4-5级）
                if (skill.refine_immuneToCC) {
                    // 添加免疫控制效果的标记
                    this.ccImmuneUntil = now + skill.allStatsBoostDuration;
                }
                
                this.buffs.push({
                    effects: effects,
                    expireTime: now + skill.allStatsBoostDuration
                });
                this.updateStats();
            }
            
            // 恢复生命值
            if (skill.healPercent) {
                const healAmount = Math.floor(this.maxHp * skill.healPercent);
                this.hp = Math.min(this.hp + healAmount, this.maxHp);
                
                // 应用精炼效果：恢复生命时提升攻击力（坠星裁决3-5级）
                if (skill.refine_healBoostsAttack && skill.refine_healAttackBoost && skill.refine_healAttackBoostDuration) {
                    this.buffs.push({
                        effects: { attack: this.baseAttack * skill.refine_healAttackBoost },
                        expireTime: now + skill.refine_healAttackBoostDuration
                    });
                    this.updateStats();
                }
                
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(
                        this.x,
                        this.y,
                        `+${healAmount} 生命值`,
                        '#00ff00'
                    );
                }
            }
            
            // 应用精炼效果：技能后附加火焰伤害（淬火精钢剑5级）
            if (skill.refine_postSkillFireDamage && skill.refine_postSkillFireDuration) {
                this.postSkillFireDamage = skill.refine_postSkillFireDamage;
                this.postSkillFireDamageUntil = now + skill.refine_postSkillFireDuration;
            }
            
            // 应用精炼效果：闪避后无敌（幽冥绝影刃5级）
            if (skill.refine_dodgeInvincibleDuration) {
                this.dodgeInvincibleUntil = now + skill.refine_dodgeInvincibleDuration;
            }
            
            // 应用精炼效果：攻击力提升持续时间刷新（劫火焚伤5级）
            if (skill.refine_refreshAttackBoostOnHit && skill.attackBoost) {
                // 查找现有的攻击力提升buff并刷新
                const attackBoostBuff = this.buffs.find(buff => buff.effects.attack && buff.effects.attack > 0);
                if (attackBoostBuff) {
                    attackBoostBuff.expireTime = now + skill.attackBoostDuration;
                }
            }
        }
        
        // 处理击杀奖励
        killedMonsters.forEach(monster => {
            if (this.gameInstance) {
                this.gameInstance.gainExp(monster.expReward);
                this.gameInstance.gainGold(monster.goldReward);
                this.gameInstance.addFloatingText(
                    this.x,
                    this.y,
                    `+${monster.expReward} 经验`,
                    '#00ff00'
                );
                this.gameInstance.addFloatingText(
                    this.x,
                    this.y,
                    `+${monster.goldReward} 金币`,
                    '#ffd700'
                );
                
                // 处理套装击杀效果
                this.handleSetKillEffects(monster);
                
                // 掉落处理（与普通攻击相同）
                if (Math.random() < 0.3) {
                    const allEquipments = generateEquipments();
                    const levelMap = {
                        1: [1],
                        5: [1, 5],
                        10: [1, 5, 10],
                        15: [5, 10, 15],
                        20: [10, 15, 20]
                    };
                    const availableLevels = levelMap[monster.level] || levelMap[1];
                    const levelEquipments = allEquipments.filter(eq => availableLevels.includes(eq.level));
                    if (levelEquipments.length > 0) {
                        const randomEq = levelEquipments[Math.floor(Math.random() * levelEquipments.length)];
                        const newEq = new Equipment({
                            id: randomEq.id,
                            name: randomEq.name,
                            slot: randomEq.slot,
                            quality: randomEq.quality,
                            level: randomEq.level,
                            stats: JSON.parse(JSON.stringify(randomEq.stats)),
                            refineLevel: 0 // 明确设置为0，确保掉落的装备是未精炼的
                        });
                        // 创建掉落物而不是直接添加到背包，随机分散在怪物周围
                        const dropAngle = Math.random() * Math.PI * 2;
                        const dropDistance = 20 + Math.random() * 40;
                        const dropX = monster.x + Math.cos(dropAngle) * dropDistance;
                        const dropY = monster.y + Math.sin(dropAngle) * dropDistance;
                        this.gameInstance.droppedItems.push(new DroppedItem(dropX, dropY, newEq, this.gameInstance));
                    }
                }
            }
        });
        
        return hit;
    }

    attack(monsters) {
        try {
            // 如果正在冲刺，不能攻击
            if (this.isDashing) {
                return false;
            }
            
            // 如果冲刺结束后0.5秒内，不能攻击
            const now = Date.now();
            if (this.dashEndTime && now - this.dashEndTime < 500) {
                return false;
            }
            
            const silenceMult = (this._towerSilenceAttackCdMult > 1) ? this._towerSilenceAttackCdMult : 1;
            const cooldown = CONFIG.PLAYER_ATTACK_COOLDOWN * (100 / (100 + this.baseAttackSpeed)) * silenceMult;
            
            if (now - this.lastAttackTime < cooldown) return false;
            
            this.lastAttackTime = now;
            
            const weapon = this.equipment.weapon;
            const rangedRange = (CONFIG.PLAYER_RANGED_ATTACK_RANGE ?? 220);
            
            // 远程武器：面前90°扇形内最近目标，不播放剑气
            if (isPlayerWeaponRanged(weapon)) {
                const PI = Math.PI;
                const inCone = monsters.filter(m => {
                    if (m.hp <= 0) return false;
                    if (m instanceof TrainingDummy || m instanceof MonsterTrainingDummy) return false;
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > rangedRange) return false;
                    let angleDiff = Math.atan2(dy, dx) - this.angle;
                    while (angleDiff > PI) angleDiff -= 2 * PI;
                    while (angleDiff < -PI) angleDiff += 2 * PI;
                    return Math.abs(angleDiff) <= PI / 4;
                });
                const nearest = inCone.slice().sort((a, b) => {
                    const da = (a.x - this.x) ** 2 + (a.y - this.y) ** 2;
                    const db = (b.x - this.x) ** 2 + (b.y - this.y) ** 2;
                    return da - db;
                })[0];
                if (!nearest) return false;
                const dx = nearest.x - this.x;
                const dy = nearest.y - this.y;
                const moveDot = this.vx * dx + this.vy * dy;
                const speedSq = this.vx * this.vx + this.vy * this.vy;
                if (moveDot < 0 && speedSq > 0.02) return false; // 背对目标移动时不能远程攻击
                this.angle = Math.atan2(dy, dx);
                this.lastDirection = dx >= 0 ? 1 : -1;
                let isCrit = Math.random() * 100 < this.baseCritRate;
                let damage = this.baseAttack;
                if (isCrit) damage += this.baseCritDamage;
                const traitResult = this.processAttackTraits(nearest, damage, isCrit);
                damage = traitResult.damage || damage;
                let damageType = traitResult.damageType || 'physical';
                const setEffectResult = this.applySetAttackEffects(damage, nearest);
                damage = setEffectResult.damage || damage;
                if (setEffectResult.damageType && setEffectResult.damageType !== 'physical') damageType = setEffectResult.damageType;
                damage = applyDeepExposeDamageBonus(nearest, damage);
                const killed = nearest.takeDamage(damage);
                if (this._ebOnHitHeal > 0 && damage > 0) {
                    this.heal(this._ebOnHitHeal, { playSound: false });
                }
                if (this.gameInstance) {
                    const damageColor = damageType === 'fire' ? '#ff4400' : damageType === 'ice' || damageType === 'lightning' ? '#00ffff' : isCrit ? '#ffd700' : '#ffffff';
                    const fontSize = isCrit ? 28 : 20;
                    const direction = Math.random() < 0.5 ? 'left' : 'right';
                    this.gameInstance.addFloatingText(nearest.x, nearest.y, Math.floor(damage).toString(), damageColor, 1500, fontSize, true, direction);
                    if (this.gameInstance.soundManager) this.gameInstance.soundManager.playSound('swing');
                    this.gameInstance.addEquipmentEffect('ranged_bullet', this.x, this.y, { duration: 200, targetX: nearest.x, targetY: nearest.y });
                }
                if (killed && this.gameInstance) this.processKillRewards([nearest]);
                return true;
            }
            
            // 近战：启动剑气圆弧效果（挥刀动作）
            this.slashStartTime = now;
            this.slashAngle = this.angle;
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.playSound('swing');
            }
            let hit = false;
            const killedMonsters = [];
            monsters.forEach(monster => {
            // 检查是否是训练桩（包括怪物类型训练假人）
            const isDummy = monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy;
            
            // 检查是否是Boss
            const isBoss = monster instanceof Boss;
            
            // 对于普通怪物，检查是否已死亡（Boss需要特殊处理，因为可能在死亡后还需要调用onBossDefeated）
            if (!isDummy && !isBoss && monster.hp <= 0) return;
            
            const dx = monster.x - this.x;
            const dy = monster.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // 检查是否在剑气范围内（弧形范围）
            const isInSlashRange = this.checkSlashRange(monster.x, monster.y);
            
            if (isInSlashRange) {
                hit = true;
                let isCrit = Math.random() * 100 < this.baseCritRate;
                let damage = this.baseAttack;
                if (isCrit) {
                    damage += this.baseCritDamage;
                }
                
                // 处理词条攻击效果（对训练桩和怪物都有效）
                const traitResult = this.processAttackTraits(monster, damage, isCrit);
                damage = traitResult.damage || damage;
                let damageType = traitResult.damageType || 'physical'; // 获取伤害类型
                
                // 处理套装攻击效果（对训练桩和怪物都有效）
                const setEffectResult = this.applySetAttackEffects(damage, monster);
                damage = setEffectResult.damage || damage;
                // 如果套装效果改变了伤害类型，使用套装的伤害类型
                if (setEffectResult.damageType && setEffectResult.damageType !== 'physical') {
                    damageType = setEffectResult.damageType;
                }
                
                // 对于Boss，如果已经死亡，直接处理死亡逻辑
                if (isBoss && monster.hp <= 0) {
                    // Boss已经死亡，直接调用onBossDefeated
                    if (this.gameInstance && this.gameInstance.onBossDefeated) {
                        this.gameInstance.onBossDefeated(monster);
                    }
                    return; // 不再处理伤害
                }
                
                damage = applyDeepExposeDamageBonus(monster, damage);
                const killed = monster.takeDamage(damage);
                if (!isDummy && damage > 0) this.applyLifeStealFromHit(Math.floor(damage));
                if (!isDummy && this._ebOnHitHeal > 0 && damage > 0) {
                    this.heal(this._ebOnHitHeal, { playSound: false });
                }
                
                // 显示伤害数字
                if (this.gameInstance) {
                    let damageColor = '#ffffff'; // 默认白色（物理伤害）
                    let fontSize = isCrit ? 28 : 20; // 暴击时使用更大的字体
                    
                    // 根据伤害类型设置颜色
                    if (damageType === 'fire') {
                        damageColor = '#ff4400'; // 火焰伤害 - 红色
                    } else if (damageType === 'ice') {
                        damageColor = '#00ffff'; // 冰冻伤害 - 青色
                    } else if (damageType === 'lightning') {
                        damageColor = '#00ffff'; // 雷电伤害 - 青色
                    } else if (isCrit) {
                        damageColor = '#ffd700'; // 暴击伤害 - 金色
                    } else {
                        damageColor = '#ffffff'; // 普通物理伤害 - 白色
                    }
                    
                    // 显示伤害数字（固定位置，不跟随玩家）
                    const damageText = Math.floor(damage).toString();
                    // 确保坐标有效，并在怪物中心显示伤害数字
                    if (monster.x !== undefined && monster.y !== undefined && !isNaN(monster.x) && !isNaN(monster.y)) {
                        // 随机选择方向：左上方或右上方
                        const direction = Math.random() < 0.5 ? 'left' : 'right';
                        // 在怪物中心显示伤害数字，让它从中心向左上方或右上方弹出
                        this.gameInstance.addFloatingText(monster.x, monster.y, damageText, damageColor, 1500, fontSize, true, direction);
                    }
                }
                
                // 只有普通怪物才会被击杀，训练桩不会死亡
                // Boss有特殊的死亡处理逻辑
                if (killed && !isDummy && !isBoss && this.gameInstance) {
                    // 保存击杀信息，稍后处理
                    killedMonsters.push(monster);
                } else if (killed && isBoss && this.gameInstance) {
                    // Boss死亡时立即调用onBossDefeated
                    if (this.gameInstance.onBossDefeated) {
                        console.log('Boss被击杀，调用onBossDefeated');
                        this.gameInstance.onBossDefeated(monster);
                    }
                }
            }
        });
        
        this.processKillRewards(killedMonsters);
        
        return hit;
        } catch (error) {
            console.error('玩家攻击出错:', error);
            return false; // 出错时返回false，避免影响游戏循环
        }
    }

    takeDamage(amount, attacker = null, isCrit = false) {
        try {
            // 记录战斗时间（用于游侠词条）
            if (this.gameInstance) {
                this.lastCombatTime = Date.now();
            }
            
            // 计算闪避
            const dodgeSuccess = Math.random() * 100 < this.baseDodge;
            if (dodgeSuccess) {
                // 暗影词条：闪避后下次攻击必定暴击（须手持幽冥绝影刃）
                if (traitIdBase(this.getCurrentWeaponTraitId()) === 'shadow') {
                    this.nextAttackCrit = true;
                    if (this.gameInstance) {
                        this.gameInstance.addFloatingText(this.x, this.y, '暗影!', '#9900ff');
                    }
                }
                // 闪避后有几帧无敌时间（约0.2秒）
                this.invincibleUntil = Date.now() + 200;
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(this.x, this.y, '闪避!', '#00ff00');
                }
                const tFlash = this.getEquipmentTraitIds();
                if (traitIdsIncludeBase(tFlash, 'void_f_flash') && Math.random() < (0.14 + voidTraitTierFromList(tFlash, 'void_f_flash') * 0.01)) {
                    const tf = voidTraitTierFromList(tFlash, 'void_f_flash');
                    const fb = typeof deepTraitBand === 'function' ? deepTraitBand(tf) : 0;
                    const hh = Math.floor(this.maxHp * (0.019 + 0.0022 * tf) * (1 + 0.12 * fb));
                    if (hh > 0) {
                        this.hp = Math.min(this.maxHp, this.hp + hh);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(this.x, this.y, `虚步 +${hh}`, '#88ffcc');
                        }
                    }
                    if (fb >= 1) {
                        this.invincibleUntil = Math.max(this.invincibleUntil || 0, Date.now() + 120 + 50 * fb);
                    }
                    if (fb >= 2) {
                        this.buffs.push({ effects: { moveSpeed: 8 + 3 * fb }, expireTime: Date.now() + 2800 });
                        this.updateStats();
                    }
                    if (fb >= 3 && this.gameInstance) {
                        const sd = Math.floor(this.baseAttack * (0.22 + 0.025 * tf));
                        this.gameInstance.getCurrentSceneTargets().forEach(m => {
                            if (m.hp <= 0) return;
                            const dx = m.x - this.x;
                            const dy = m.y - this.y;
                            if (Math.sqrt(dx * dx + dy * dy) <= 100) {
                                this.damageMonsterFromEnvironment(m, sd);
                                this.gameInstance.addFloatingText(m.x, m.y, `步罡 ${sd}`, '#aaffee', 1400, 13, true);
                            }
                        });
                    }
                }
                return false; // 闪避成功
            }
            
            // 检查无敌状态
            if (this.invincibleUntil && Date.now() < this.invincibleUntil) {
                return false; // 无敌中，不受到伤害
            }
            
            // 处理词条防御效果
            amount = this.processDefenseTraits(amount, attacker, isCrit);
            
            // 如果词条效果将伤害降为0（免疫），直接返回
            if (amount <= 0) {
                return false; // 免疫成功，不受到伤害
            }
            
            // 应用套装防御效果
            amount = this.applySetDefenseEffects(amount, attacker);
            
            // 如果套装效果将伤害降为0（免疫），直接返回
            if (amount <= 0) {
                return false; // 免疫成功，不受到伤害
            }
            
            // 计算实际伤害（防御力按百分比减少伤害，而不是直接扣除）
            // 防御力减少伤害的公式：实际伤害 = 原始伤害 * (100 / (100 + 防御力 * 0.2))
            // 调整系数为0.2，使防御力减伤效果更合理，避免减伤过多
            // 例如：防御力100时，减伤 = 100 / (100 + 100 * 0.2) = 100 / 120 ≈ 0.83，受到83%伤害
            // 防御力50时，减伤 = 100 / (100 + 50 * 0.2) = 100 / 110 ≈ 0.91，受到91%伤害
            // 防御力200时，减伤 = 100 / (100 + 200 * 0.2) = 100 / 140 ≈ 0.71，受到71%伤害
            // 最大减伤不超过50%（即至少受到50%伤害）
            const defenseReduction = Math.max(0.5, 100 / (100 + this.baseDefense * 0.2));
            const drEquip = Math.min(35, this.damageReductionPercent || 0);
            const damageAfterDefense = amount * defenseReduction * (1 - drEquip / 100);
            // 确保至少造成1点伤害（除非完全免疫），并向下取整
            const actualDamage = Math.max(1, Math.floor(damageAfterDefense));
            
            const tp = Math.min(40, this.thornPercent || 0);
            if (tp > 0 && attacker && typeof attacker.takeDamage === 'function' && attacker.hp > 0) {
                const refDmg = Math.floor(actualDamage * (tp / 100));
                if (refDmg > 0) {
                    attacker.takeDamage(refDmg);
                    if (this.gameInstance) {
                        this.gameInstance.addFloatingText(attacker.x, attacker.y, `荆棘 ${refDmg}`, '#66ddaa', 1200, 16, true);
                    }
                }
            }
            
            // 扣血
            this.hp -= actualDamage;
            
            // 确保生命值不会低于0
            if (this.hp < 0) {
                this.hp = 0;
            }
            
            // 设置受伤变红效果（持续500毫秒）
            this.hurtUntil = Date.now() + 500;
            
            // 显示伤害数字（确保实际伤害大于0）
            const finalDamage = actualDamage > 0 ? actualDamage : 1;
            if (this.gameInstance && finalDamage > 0) {
                let damageColor = '#ff6666'; // 玩家受到伤害使用红色
                let fontSize = 20; // 普通伤害字体大小
                
                // 如果是暴击伤害，使用更大的字体和更亮的颜色
                if (isCrit) {
                    damageColor = '#ff0000'; // 暴击伤害使用更亮的红色
                    fontSize = 24; // 暴击时使用更大的字体
                }
                
                // 显示伤害数字（固定位置，不跟随玩家）
                const damageText = Math.floor(finalDamage).toString();
                // 随机选择方向：左下或右下
                const direction = Math.random() < 0.5 ? 'left' : 'right';
                // 在玩家中心显示伤害数字，让它从中心向左下或右下下落
                this.gameInstance.addFloatingText(this.x, this.y, damageText, damageColor, 1500, fontSize, true, direction);
            }
            
            return this.hp <= 0;
        } catch (error) {
            console.error('玩家受到伤害处理出错:', error, error.stack);
            // 出错时，至少造成1点伤害，避免完全免疫
            try {
                const fallbackDamage = Math.max(1, Math.floor(amount * 0.1)); // 至少造成10%的原始伤害
                this.hp -= fallbackDamage;
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(this.x, this.y, fallbackDamage.toString(), '#ff6666', 1500, 20, true);
                }
                return this.hp <= 0;
            } catch (fallbackError) {
                console.error('备用伤害处理也出错:', fallbackError);
                return false;
            }
        }
    }
    
    /**
     * 应用套装攻击效果
     * @param {number} damage - 原始伤害
     * @param {Monster} monster - 目标怪物
     * @returns {Object} 包含damage和damageType的对象
     */
    applySetAttackEffects(damage, monster) {
        if (!this.setSpecialEffects || !this.gameInstance) return { damage, damageType: 'physical' };
        
        let damageType = 'physical'; // 默认物理伤害
        
        const isStoolDummy = monster instanceof TrainingDummy;
        
        for (const [setId, setEffect] of Object.entries(this.setSpecialEffects)) {
            const setData = SET_DEFINITIONS[setId];
            if (!setData) continue;
            
            const effect = setData.effects[setEffect.pieceCount];
            if (!effect || !effect.special) continue;
            
            // 火焰爆炸效果（烈焰套装4件 / 深阶可调参数）
            if (effect.special === 'flameExplosion' && Math.random() < deepSetEffectNum(effect, 'flameExplosionChance', 0.2)) {
                const explosionDamage = this.baseAttack * deepSetEffectNum(effect, 'flameExplosionMult', 0.5);
                if (isStoolDummy) {
                    // 对于训练假人，将额外伤害合并到主伤害中
                    damage += explosionDamage;
                    damageType = 'fire'; // 标记为火焰伤害
                } else {
                    this.damageMonsterFromEnvironment(monster, explosionDamage);
                }
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(
                        monster.x,
                        monster.y,
                        `火焰爆炸! ${Math.floor(explosionDamage)}`,
                        '#ff4400',
                        2000,
                        18,
                        true
                    );
                    queueSetProcFx(this.gameInstance, 'small_fire_breath', monster.x, monster.y, { radius: 54, duration: 420 });
                }
            }
            
            // 连锁闪电效果（雷霆套装4件 / 深阶可调）
            if (effect.special === 'chainLightning' && Math.random() < deepSetEffectNum(effect, 'chainLightningChance', 0.25)) {
                if (this.gameInstance && this.gameInstance.soundManager) {
                    this.gameInstance.soundManager.playSound('shock');
                }
                const lightningDamage = this.baseAttack * deepSetEffectNum(effect, 'chainLightningDamageMult', 0.8);
                const chainRange = deepSetEffectNum(effect, 'chainLightningRange', 100);
                const applySlow = !!effect.chainLightningApplySlow;
                if (this.gameInstance) {
                    queueSetProcFx(this.gameInstance, 'lightning_chain', monster.x, monster.y, {
                        radius: Math.min(92, chainRange * 0.92),
                        duration: 480
                    });
                    const chainTargets = this.gameInstance.getCurrentSceneTargets();
                    chainTargets.forEach(m => {
                        if (m !== monster && isCombatTargetAliveForEquipmentProc(m)) {
                            const dx = m.x - monster.x;
                            const dy = m.y - monster.y;
                            if (Math.sqrt(dx * dx + dy * dy) <= chainRange) {
                                this.damageMonsterFromEnvironment(m, lightningDamage);
                                if (applySlow && m.addStatusEffect) {
                                    m.addStatusEffect('slowed', {
                                        duration: deepSetEffectNum(effect, 'chainLightningSlowMs', 750),
                                        multiplier: deepSetEffectNum(effect, 'chainLightningSlowMult', 0.74)
                                    });
                                }
                                if (this.gameInstance) {
                                    this.gameInstance.addFloatingText(m.x, m.y, `连锁闪电! ${Math.floor(lightningDamage)}`, '#00ffff', 2000, 18, true);
                                }
                            }
                        }
                    });
                }
            }

            // 裂点·殛刃：单体强电击 + 感电减速
            if (effect.special === 'voltStrike' && Math.random() < deepSetEffectNum(effect, 'voltStrikeChance', 0.28)) {
                if (this.gameInstance && this.gameInstance.soundManager) {
                    this.gameInstance.soundManager.playSound('shock');
                }
                const vd = Math.max(1, Math.floor(this.baseAttack * deepSetEffectNum(effect, 'voltStrikeDamageMult', 0.92)));
                if (isStoolDummy) {
                    damage += vd;
                    damageType = 'physical';
                } else {
                    this.damageMonsterFromEnvironment(monster, vd);
                }
                if (monster.addStatusEffect) {
                    monster.addStatusEffect('slowed', {
                        duration: deepSetEffectNum(effect, 'voltStrikeSlowMs', 900),
                        multiplier: deepSetEffectNum(effect, 'voltStrikeSlowMult', 0.68)
                    });
                }
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, `殛刃 ${vd}`, '#66eeff', 1600, 17, true);
                    queueSetProcFx(this.gameInstance, 'deep_volt_spike', monster.x, monster.y, { radius: 52, duration: 400 });
                }
            }

            // 腐噬·溃解：溃烂持续伤害（沿用 burning 结算）
            if (effect.special === 'plagueDoT' && Math.random() < deepSetEffectNum(effect, 'plagueDoTChance', 0.24)) {
                if (monster.addStatusEffect) {
                    const dps = this.baseAttack * deepSetEffectNum(effect, 'plagueDpsMult', 0.13);
                    const dur = deepSetEffectNum(effect, 'plagueDurationMs', 2800);
                    monster.addStatusEffect('burning', { damage: dps, duration: dur });
                }
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, '溃解!', '#88ff66', 1400, 16, true);
                    queueSetProcFx(this.gameInstance, 'deep_plague_burst', monster.x, monster.y, { radius: 46, duration: 380 });
                }
            }

            // 深阶通用 DoT：流血 / 影噬 / 烬噬等（burning 结算，文案与数值由配置区分）
            if (effect.special === 'deepDoT' && monster.addStatusEffect && Math.random() < deepSetEffectNum(effect, 'deepDoTChance', 0.22)) {
                const dps = this.baseAttack * deepSetEffectNum(effect, 'deepDoTDpsMult', 0.12);
                const dur = deepSetEffectNum(effect, 'deepDoTDurationMs', 3000);
                monster.addStatusEffect('burning', { damage: dps, duration: dur });
                if (this.gameInstance) {
                    const label = typeof effect.deepDoTLabel === 'string' ? effect.deepDoTLabel : '持续伤';
                    const color = typeof effect.deepDoTColor === 'string' ? effect.deepDoTColor : '#ff8866';
                    this.gameInstance.addFloatingText(monster.x, monster.y, label, color, 1400, 16, true);
                    queueSetProcFx(this.gameInstance, 'deep_tint_burst', monster.x, monster.y, {
                        radius: 40,
                        duration: 360,
                        color
                    });
                }
            }

            // 深阶印蚀：短时提高对该目标造成的伤害
            if (effect.special === 'exposeMark' && Math.random() < deepSetEffectNum(effect, 'exposeMarkChance', 0.22)) {
                const nowMs = Date.now();
                monster.deepExposeUntil = nowMs + deepSetEffectNum(effect, 'exposeMarkDurationMs', 3200);
                monster.deepExposeMult = deepSetEffectNum(effect, 'exposeMarkDamageMult', 1.12);
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, '印蚀!', '#ddaaff', 1200, 15, true);
                    queueSetProcFx(this.gameInstance, 'deep_expose_ring', monster.x, monster.y, {
                        radius: 42,
                        duration: 420,
                        followTarget: monster
                    });
                }
            }

            // 深阶虚回：极短延迟的二次折返伤害
            if (effect.special === 'voidEcho' && !isStoolDummy && Math.random() < deepSetEffectNum(effect, 'voidEchoChance', 0.18)) {
                const echoFrac = deepSetEffectNum(effect, 'voidEchoDamageFrac', 0.35);
                const echoDelay = deepSetEffectNum(effect, 'voidEchoDelayMs', 220);
                const echoDmg = Math.max(1, Math.floor(damage * echoFrac));
                const gi = this.gameInstance;
                const m = monster;
                const pl = this;
                setTimeout(() => {
                    if (!gi || !m || !isCombatTargetAliveForEquipmentProc(m)) return;
                    pl.damageMonsterFromEnvironment(m, echoDmg);
                    gi.addFloatingText(m.x, m.y, `虚回 ${echoDmg}`, '#aa88ff', 1100, 15, true);
                    queueSetProcFx(gi, 'deep_void_ping', m.x, m.y, { radius: 46, duration: 300 });
                }, echoDelay);
            }
            
            // 冰冻效果（霜寒套装4件 / 深阶可调概率与时长）
            if (effect.special === 'freezeChance' && Math.random() < deepSetEffectNum(effect, 'freezeProcChance', 0.25)) {
                // 播放冰冻音效
                if (this.gameInstance && this.gameInstance.soundManager) {
                    this.gameInstance.soundManager.playSound('freeze');
                }
                const now = Date.now();
                monster.frozenUntil = now + deepSetEffectNum(effect, 'freezeDurationMs', 2000);
                if (isStoolDummy) {
                    damageType = 'ice'; // 标记为冰冻伤害
                }
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(
                        monster.x,
                        monster.y,
                        '冰冻!',
                        '#00ffff',
                        2000,
                        18,
                        true
                    );
                    queueSetProcFx(this.gameInstance, 'freeze_ring', monster.x, monster.y, { radius: 46, duration: 500 });
                }
            }
        }
        
        return { damage, damageType };
    }
    
    /**
     * 处理套装击杀效果
     * @param {Monster} monster - 被击杀的怪物
     */
    handleSetKillEffects(monster) {
        if (!this.setSpecialEffects || !this.gameInstance) return;
        
        for (const [setId, setEffect] of Object.entries(this.setSpecialEffects)) {
            const setData = SET_DEFINITIONS[setId];
            if (!setData) continue;
            
            const effect = setData.effects[setEffect.pieceCount];
            if (!effect || !effect.special) continue;
            
            // 击杀恢复生命值（青铜套装8件、星辰套装6件、终焉双噬等）
            if (effect.special === 'killHeal' || effect.special === 'killBuff' || effect.special === 'killHealAndRegen') {
                const hpPct = (typeof effect.killHealPercent === 'number' && effect.killHealPercent > 0)
                    ? effect.killHealPercent
                    : 0.05;
                const healAmount = Math.floor(this.maxHp * hpPct);
                this.hp = Math.min(this.hp + healAmount, this.maxHp);
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(
                        this.x,
                        this.y,
                        `+${healAmount} 生命值`,
                        '#00ff00'
                    );
                    queueSetProcFx(this.gameInstance, 'heal_aura', this.x, this.y, { radius: 48, duration: 400 });
                }
            }
            
            // 击杀buff效果（星辰套装6件）
            if (effect.special === 'killBuff') {
                const now = Date.now();
                this.buffs.push({
                    effects: {
                        attack: Math.floor(this.baseAttack * 0.05),
                        defense: Math.floor(this.baseDefense * 0.05),
                        critRate: Math.floor(this.baseCritRate * 0.05),
                        critDamage: Math.floor(this.baseCritDamage * 0.05),
                        dodge: Math.floor(this.baseDodge * 0.05),
                        attackSpeed: Math.floor(this.baseAttackSpeed * 0.05),
                        moveSpeed: 5
                    },
                    expireTime: now + 10000 // 持续10秒
                });
                this.updateStats();
                if (this.gameInstance) {
                    queueSetProcFx(this.gameInstance, 'speed_aura', this.x, this.y, { radius: 40, duration: 450 });
                }
            }

            // 深阶殒震：击杀时在尸体位置造成小范围溅射
            if (effect.special === 'killShockwave') {
                const R = deepSetEffectNum(effect, 'killShockwaveRadius', 76);
                const frac = deepSetEffectNum(effect, 'killShockwaveDamageFrac', 0.38);
                const dmg = Math.max(1, Math.floor(this.baseAttack * frac));
                const cx = monster.x;
                const cy = monster.y;
                const R2 = R * R;
                const targets = this.gameInstance.getCurrentSceneTargets();
                for (let i = 0; i < targets.length; i++) {
                    const m = targets[i];
                    if (!isCombatTargetAliveForEquipmentProc(m)) continue;
                    const dx = m.x - cx;
                    const dy = m.y - cy;
                    if (dx * dx + dy * dy > R2) continue;
                    this.damageMonsterFromEnvironment(m, dmg);
                }
                this.gameInstance.addFloatingText(cx, cy, '殒震!', '#ffaa66', 1000, 16, true);
                queueSetProcFx(this.gameInstance, 'deep_shockwave_ring', cx, cy, { radius: R, duration: 520 });
            }
        }
    }
    
    /**
     * 处理套装受到伤害效果
     * @param {number} damage - 原始伤害
     * @param {*} attacker - 伤害来源（若有）
     * @returns {number} 修改后的伤害
     */
    applySetDefenseEffects(damage, attacker = null) {
        try {
            if (!this.setSpecialEffects) return damage;
            
            for (const [setId, setEffect] of Object.entries(this.setSpecialEffects)) {
            const setData = SET_DEFINITIONS[setId];
            if (!setData) continue;
            
            const effect = setData.effects[setEffect.pieceCount];
            if (!effect || !effect.special) continue;
            
            // 伤害转化为生命值（晶化套装6件 / 深阶可调）
            if (effect.special === 'damageToHeal' && Math.random() < deepSetEffectNum(effect, 'damageToHealChance', 0.12)) {
                const ratio = deepSetEffectNum(effect, 'damageToHealRatio', 0.18);
                const healAmount = Math.floor(damage * ratio);
                this.hp = Math.min(this.hp + healAmount, this.maxHp);
                damage = Math.floor(damage * (1 - ratio));
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(
                        this.x,
                        this.y,
                        `伤害转化! +${healAmount}`,
                        '#00ff00'
                    );
                    queueSetProcFx(this.gameInstance, 'heal_aura', this.x, this.y, { radius: 52, duration: 380 });
                }
            }
            
            // 圣耀套装6件 / 深阶可调：低概率大幅减伤
            if (effect.special === 'damageImmunity' && Math.random() < deepSetEffectNum(effect, 'damageImmunityChance', 0.08)) {
                damage = Math.floor(damage * 0.55);
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(
                        this.x,
                        this.y,
                        '圣佑减伤',
                        '#ffff88'
                    );
                    queueSetProcFx(this.gameInstance, 'holy_blast', this.x, this.y, { radius: 56, duration: 340 });
                }
            }

            // 深阶反噬：受击时概率对攻击来源造成基于攻击力的反伤
            if (
                effect.special === 'deepRetaliate' &&
                attacker &&
                typeof attacker.takeDamage === 'function' &&
                attacker.hp > 0 &&
                Math.random() < deepSetEffectNum(effect, 'deepRetaliateChance', 0.14)
            ) {
                const rm = deepSetEffectNum(effect, 'deepRetaliateMult', 0.38);
                const rd = Math.max(1, Math.floor(this.baseAttack * rm));
                attacker.takeDamage(rd);
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(attacker.x, attacker.y, `反噬 ${rd}`, '#cc8866', 1100, 15, true);
                    queueSetProcFx(this.gameInstance, 'deep_retaliate_burst', attacker.x, attacker.y, { radius: 38, duration: 300 });
                }
            }
        }
        
        return damage;
        } catch (error) {
            console.error('应用套装防御效果出错:', error);
            return damage; // 出错时返回原始伤害，避免完全免疫
        }
    }

    /**
     * 深阶套装：周期性场地效果（电场、天雷等），由 Game.update 在战斗中调用
     */
    tickDeepSetPeriodicEffects(gameInstance) {
        if (!gameInstance || !this.setSpecialEffects || typeof SET_DEFINITIONS === 'undefined') return;
        const now = Date.now();
        if (!this._deepSetPeriodicTs) this._deepSetPeriodicTs = {};
        const px = this.x;
        const py = this.y;

        for (const [setId, setEffect] of Object.entries(this.setSpecialEffects)) {
            const setData = SET_DEFINITIONS[setId];
            if (!setData) continue;
            const effect = setData.effects[setEffect.pieceCount];
            if (!effect || !effect.special) continue;
            if (effect.special !== 'voltField' && effect.special !== 'skyBolt') continue;
            const key = setId + '_' + effect.special + '_' + setEffect.pieceCount;

            if (effect.special === 'voltField') {
                const iv = deepSetEffectNum(effect, 'voltFieldIntervalMs', 480);
                const last = this._deepSetPeriodicTs[key] || 0;
                if (now - last < iv) continue;
                this._deepSetPeriodicTs[key] = now;
                const R = deepSetEffectNum(effect, 'voltFieldRadius', 110);
                const frac = deepSetEffectNum(effect, 'voltFieldDamageFrac', 0.13);
                const slowM = deepSetEffectNum(effect, 'voltSlowMult', 0.72);
                const slowD = deepSetEffectNum(effect, 'voltSlowDurationMs', 700);
                const dmg = Math.max(1, Math.floor(this.baseAttack * frac));
                const targets = gameInstance.getCurrentSceneTargets();
                let hits = 0;
                for (let i = 0; i < targets.length; i++) {
                    const m = targets[i];
                    if (!isCombatTargetAliveForEquipmentProc(m)) continue;
                    const dx = m.x - px;
                    const dy = m.y - py;
                    if (dx * dx + dy * dy > R * R) continue;
                    this.damageMonsterFromEnvironment(m, dmg);
                    if (m.addStatusEffect) {
                        m.addStatusEffect('slowed', { duration: slowD, multiplier: slowM });
                    }
                    hits++;
                }
                if (hits > 0) {
                    gameInstance.addFloatingText(px, py, '裂隙电场', '#88ddff', 900, 15, true);
                    if (gameInstance.soundManager) gameInstance.soundManager.playSound('shock');
                    queueSetProcFx(gameInstance, 'deep_volt_ring', px, py, { radius: R, duration: 460 });
                }
            }

            if (effect.special === 'skyBolt') {
                const iv = deepSetEffectNum(effect, 'skyBoltIntervalMs', 1700);
                const last = this._deepSetPeriodicTs[key] || 0;
                if (now - last < iv) continue;
                this._deepSetPeriodicTs[key] = now;
                const range = deepSetEffectNum(effect, 'skyBoltRange', 400);
                const mult = deepSetEffectNum(effect, 'skyBoltDamageMult', 1.0);
                const candidates = gameInstance.getCurrentSceneTargets().filter(m => {
                    if (!isCombatTargetAliveForEquipmentProc(m)) return false;
                    const dx = m.x - px;
                    const dy = m.y - py;
                    return dx * dx + dy * dy <= range * range;
                });
                if (candidates.length === 0) continue;
                const m = candidates[Math.floor(Math.random() * candidates.length)];
                const bolt = Math.max(1, Math.floor(this.baseAttack * mult));
                this.damageMonsterFromEnvironment(m, bolt);
                if (m.addStatusEffect) {
                    m.addStatusEffect('slowed', {
                        duration: deepSetEffectNum(effect, 'skyBoltSlowMs', 900),
                        multiplier: deepSetEffectNum(effect, 'skyBoltSlowMult', 0.7)
                    });
                }
                gameInstance.addFloatingText(m.x, m.y, `天雷 ${bolt}`, '#00ffff', 1800, 18, true);
                if (gameInstance.soundManager) gameInstance.soundManager.playSound('shock');
                queueSetProcFx(gameInstance, 'deep_sky_bolt', m.x, m.y, { radius: 72, duration: 540 });
            }
        }
    }

    heal(amount, opts) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        const playSound = !opts || opts.playSound !== false;
        if (playSound && this.gameInstance && this.gameInstance.soundManager && amount > 0) {
            this.gameInstance.soundManager.playSound('heal');
        }
    }

    /** 按「吸血」比例，根据本次造成的伤害回复生命（训练桩不计） */
    applyLifeStealFromHit(damageDealt) {
        const pct = this.lifeStealPercent || 0;
        if (pct <= 0 || damageDealt <= 0) return;
        const h = Math.floor(damageDealt * pct / 100);
        if (h > 0) this.heal(h, { playSound: false });
    }

    gainExp(amount) {
        this.exp += amount;
        while (this.exp >= this.expNeeded) {
            this.exp -= this.expNeeded;
            this.level++;
            this.expNeeded = Math.floor(this.expNeeded * 1.3); // 降低经验增长倍数（从1.5改为1.3）
            
            // 播放升级音效
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.playSound('levelup');
            }
            
            // 升级时扩大背包容量（通过游戏实例处理）
            if (this.gameInstance) {
                this.gameInstance.onPlayerLevelUp(this.level);
            }
            this.updateStats();
            this.hp = this.maxHp;
        }
    }
    
    /**
     * 获取装备词条ID列表
     * @returns {Array} 词条ID数组
     */
    getEquipmentTraitIds() {
        try {
            const traitIds = [];
            if (!this.equipment) {
                return traitIds;
            }
            Object.values(this.equipment).forEach(eq => {
                if (eq && eq.equipmentTraits && eq.equipmentTraits.id) {
                    traitIds.push(eq.equipmentTraits.id);
                }
            });
            return traitIds;
        } catch (error) {
            console.error('获取装备词条ID出错:', error);
            return []; // 出错时返回空数组，避免影响游戏
        }
    }
    
    /**
     * 当前手持武器的词条 id（无武器或未配置词条时为 null）
     * 武器类效果必须以此为准，避免仅靠全装备 trait 列表误判（如换装后仍触发旧武器特效）。
     */
    getCurrentWeaponTraitId() {
        try {
            const w = this.equipment && this.equipment.weapon;
            if (w && w.equipmentTraits && w.equipmentTraits.id) {
                return w.equipmentTraits.id;
            }
        } catch (e) { /* ignore */ }
        return null;
    }
    
    /**
     * 装备栏变化后同步临时状态（武器技能 DOT/冷却、咏咒增伤、暗影预暴击等）
     * @param {string|null} slot - 变化的部位；null 表示多处变化或读档后整体同步
     */
    onEquipmentSlotChanged(slot) {
        const all = slot === null || slot === undefined;
        const weaponTouched = all || slot === 'weapon';
        const chestTouched = all || slot === 'chest';
        if (weaponTouched) {
            this.weaponSkillCooldown = 0;
            this.weaponSkillDots = [];
            if (traitIdBase(this.getCurrentWeaponTraitId()) !== 'shadow') {
                this.nextAttackCrit = false;
            }
        }
        if (chestTouched || all) {
            if (!traitIdsIncludeBase(this.getEquipmentTraitIds(), 'chant')) {
                this.skillDamageBoost = 1.0;
            }
        }
    }
    
    /**
     * 处理攻击时的词条效果
     * @param {Monster} monster - 目标怪物
     * @param {number} damage - 伤害值
     * @param {boolean} isCrit - 是否暴击
     * @returns {Object} 包含damage和damageType的对象
     */
    processAttackTraits(monster, damage, isCrit) {
        const traitIds = this.getEquipmentTraitIds();
        const weaponTrait = this.getCurrentWeaponTraitId();
        const now = Date.now();
        const isStoolDummy = monster instanceof TrainingDummy;
        let damageType = 'physical'; // 默认物理伤害
        const meleeW = this.equipment.weapon && !isPlayerWeaponRanged(this.equipment.weapon);
        const rangedW = this.equipment.weapon && isPlayerWeaponRanged(this.equipment.weapon);
        const wB = voidEquipTraitBase(weaponTrait);
        const wT = voidEquipTraitTier(weaponTrait);
        const vbd = typeof deepTraitBand === 'function' ? deepTraitBand(wT) : 0;
        const stdProc = Math.min(1.18, 1 + 0.045 * traitIdTier(weaponTrait));

        let voidStrikeMul = 1;
        if (this.voidChaseStrike && this.voidChaseStrike.until > now) {
            voidStrikeMul *= this.voidChaseStrike.mul;
            this.voidChaseStrike = null;
        }
        if (this.voidRiposteMul && this.voidRiposteMul > 1) {
            voidStrikeMul *= this.voidRiposteMul;
            this.voidRiposteMul = 1;
        }
        if (voidStrikeMul > 1) {
            damage = Math.floor(damage * voidStrikeMul);
        }

        if (isStoolDummy || monster.hp > 0) {
            if (monster.voidSigilExpire && now > monster.voidSigilExpire) {
                monster.voidSigilStacks = 0;
                monster.voidSigilPerStack = undefined;
            }
            if (monster.voidShredExpire && now > monster.voidShredExpire) {
                monster.voidShredStacks = 0;
            }
            if (monster.voidOathUntil && now > monster.voidOathUntil) {
                monster.voidOathMul = undefined;
                monster.voidOathUntil = undefined;
            }
            // 终幕·誓刃：本击消耗标记并增伤（仅当前武器为誓刃档时触发）
            if (meleeW && wB === 'void_w_sigil' && wT === 4 && monster.voidOathMul && monster.voidOathMul > 1) {
                damage = Math.floor(damage * monster.voidOathMul);
                monster.voidOathMul = undefined;
                monster.voidOathUntil = undefined;
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, '誓刃!', '#ffaaee', 1200, 14, true);
                }
            }
            // 渊隙～腐噬·魔印：仅持魔印档武器时叠层增伤生效
            const vst = (meleeW && wB === 'void_w_sigil' && wT <= 2) ? (monster.voidSigilStacks || 0) : 0;
            if (vst > 0) {
                const perS = monster.voidSigilPerStack != null ? monster.voidSigilPerStack : 0.035;
                damage = Math.floor(damage * (1 + perS * vst));
            }
            // 黑曜·溃印：仅持溃印档武器
            if (meleeW && wB === 'void_w_sigil' && wT === 3) {
                const sh = Math.min(2, monster.voidShredStacks || 0);
                if (sh > 0) {
                    damage = Math.floor(damage * (1 + (0.065 + 0.008 * wT) * sh));
                }
            }
        }

        if (meleeW && traitIdsIncludeBase(traitIds, 'void_l_ram') && this.dashEndTime) {
            const tr = voidTraitTierFromList(traitIds, 'void_l_ram');
            const ramMs = 420 + tr * 40;
            if (now - this.dashEndTime < ramMs) {
                damage = Math.floor(damage * (1 + (6 + 0.65 * tr) / 100));
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_r_sever') && monster.maxHp > 0) {
            const ts = voidTraitTierFromList(traitIds, 'void_r_sever');
            if (monster.hp / monster.maxHp < (31 - 0.55 * ts) / 100) {
                damage = Math.floor(damage * (1 + (9 + 0.9 * ts) / 100));
            }
        }

        if (meleeW && wB === 'void_w_cull' && monster.maxHp > 0) {
            const th = (32 - 0.9 * wT - (vbd >= 2 ? 3 : 0)) / 100;
            if (monster.hp / monster.maxHp < th) {
                let cm = 1 + (8 + 1.2 * wT) / 100;
                if (vbd >= 3) cm *= 1.1;
                damage = Math.floor(damage * cm);
                if (vbd >= 1) {
                    const lh = Math.floor(damage * (0.04 + 0.015 * vbd));
                    if (lh > 0) this.hp = Math.min(this.maxHp, this.hp + lh);
                }
                if (vbd >= 2 && !isStoolDummy && monster.baseAttack != null) {
                    if (!monster.debuffs) monster.debuffs = [];
                    monster.debuffs.push({
                        effects: { attack: -Math.floor((monster.baseAttack || 0) * (0.06 + 0.02 * vbd)) },
                        expireTime: now + 3500
                    });
                }
                if (vbd >= 3 && this.gameInstance && monster.hp / monster.maxHp < 0.18) {
                    const er = 70 + 5 * wT;
                    const ed = Math.floor(this.baseAttack * (0.35 + 0.02 * wT));
                    this.gameInstance.getCurrentSceneTargets().forEach(m => {
                        if (m === monster || !isCombatTargetAliveForEquipmentProc(m)) return;
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= er) {
                            this.damageMonsterFromEnvironment(m, ed);
                        }
                    });
                }
            }
        }

        if (rangedW && wB === 'void_b_snipe' && monster.maxHp > 0 && monster.hp / monster.maxHp > (84 - 0.6 * wT) / 100) {
            let snMul = 1 + (7 + 0.8 * wT) / 100;
            if (vbd >= 3) snMul *= 1.08;
            damage = Math.floor(damage * snMul);
            if (vbd >= 1) {
                const hh = Math.floor(this.maxHp * (0.004 + 0.002 * vbd));
                if (hh > 0) this.hp = Math.min(this.maxHp, this.hp + hh);
            }
            if (vbd >= 2 && this.gameInstance) {
                const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
                const near = others.filter(m => {
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    return Math.sqrt(dx * dx + dy * dy) <= 100;
                });
                if (near.length) {
                    const t2 = near[Math.floor(Math.random() * near.length)];
                    const pd = Math.floor(this.baseAttack * (18 + 2 * wT) / 100);
                    this.damageMonsterFromEnvironment(t2, pd);
                    this.gameInstance.addFloatingText(t2.x, t2.y, `穿虹 ${pd}`, '#aaddff', 1400, 13, true);
                }
            }
        }
        
        // 暗影词条：闪避后下次攻击必定暴击（由本函数消耗标记，避免远程攻击提前清掉标记）
        if (this.nextAttackCrit && traitIdBase(weaponTrait) === 'shadow') {
            this.nextAttackCrit = false;
            if (!isCrit) {
                damage += this.baseCritDamage;
            }
            isCrit = true;
        }
        
        // 圣耀词条：暴击伤害提升50%
        if (isCrit && traitIdBase(weaponTrait) === 'divine_judgment') {
            damage = Math.floor(damage * 1.5);
        }

        if (isCrit && traitIdsIncludeBase(traitIds, 'void_r_fervor')) {
            const tf = voidTraitTierFromList(traitIds, 'void_r_fervor');
            this.buffs.push({
                effects: { attack: Math.floor(this.baseAttack * (0.065 + 0.009 * tf)) },
                expireTime: now + 4800 + 120 * tf
            });
            this.updateStats();
        }
        
        // 淬火词条：暴击时有8%概率触发额外伤害（降低频率）
        if (isCrit && traitIdBase(weaponTrait) === 'quench' && Math.random() < 0.2 * stdProc) {
            const extraDamage = Math.floor(this.baseAttack * 0.5);
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('fire_spark', monster.x, monster.y, { radius: 35, duration: 400 });
            }
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += extraDamage;
                damageType = 'fire'; // 淬火是火焰伤害
            } else {
                this.damageMonsterFromEnvironment(monster, extraDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `淬火! ${extraDamage}`, '#ff6600', 2000, 18, true);
            }
        }
        
        // 霜寒词条：攻击时有15%概率降低目标移动速度（鸣霜青铜剑，仅当前武器）
        if (traitIdBase(weaponTrait) === 'frost' && Math.random() < 0.15 * stdProc) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('freeze_ring', monster.x, monster.y, { radius: 40, duration: 350 });
            }
            if (isStoolDummy) {
                monster.addStatusEffect('slowed', { multiplier: 0.8, duration: 2000 });
            } else {
                if (!monster.slowEffects) monster.slowEffects = [];
                monster.slowEffects.push({
                    multiplier: 0.8,
                    expireTime: now + 2000
                });
            }
        }
        
        // 冰晶词条：仅手持晶曜寒锋时生效
        if (traitIdBase(weaponTrait) === 'ice_crystal' && Math.random() < 0.2 * stdProc) {
            // 播放冰冻音效
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.playSound('freeze');
            }
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('freeze_ring', monster.x, monster.y, { radius: 45, duration: 450 });
            }
            if (isStoolDummy) {
                monster.addStatusEffect('frozen', { duration: 1000 });
            } else {
                monster.frozenUntil = now + 1000;
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, '冰冻!', '#00ffff', 2000, 18, true);
            }
        }
        
        // 圣耀词条：暴击时有30%概率触发范围伤害
        if (isCrit && traitIdBase(weaponTrait) === 'divine_judgment' && Math.random() < 0.3) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('holy_blast', monster.x, monster.y, { radius: 100, duration: 450 });
            }
            const rangeDamage = Math.floor(damage * 0.5);
            const targets = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targets.forEach(m => {
                if (isCombatTargetAliveForEquipmentProc(m)) {
                    if (m === monster) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 100) {
                        this.damageMonsterFromEnvironment(m, rangeDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `范围伤害! ${rangeDamage}`, '#ff00ff', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 雷神词条：攻击时有20%概率触发连锁闪电，对附近敌人造成80%攻击力伤害
        if (traitIdBase(weaponTrait) === 'thunder_god' && Math.random() < 0.2 * stdProc) {
            // 播放感电音效
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.playSound('shock');
            }
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('lightning_chain', monster.x, monster.y, { radius: 120, duration: 400 });
            }
            const lightningDamage = Math.floor(this.baseAttack * 0.8);
            const targetsThunder = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsThunder.forEach(m => {
                if (isCombatTargetAliveForEquipmentProc(m)) {
                    if (m === monster) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 120) {
                        this.damageMonsterFromEnvironment(m, lightningDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `连锁闪电! ${lightningDamage}`, '#00ffff', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 辉光词条：每次攻击有10%概率提升攻击速度
        if (traitIdBase(weaponTrait) === 'radiance' && Math.random() < 0.1 * stdProc) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('speed_aura', this.x, this.y, { radius: 35, duration: 350 });
            }
            this.buffs.push({
                effects: { attackSpeed: Math.floor(this.baseAttackSpeed * 0.15) },
                expireTime: now + 5000
            });
            this.updateStats();
        }
        
        // 骑士精神词条：攻击时有15%概率提升防御力
        if (traitIdBase(weaponTrait) === 'knight_spirit' && Math.random() < 0.15 * stdProc) {
            this.buffs.push({
                effects: { defense: Math.floor(this.baseDefense * 0.1) },
                expireTime: now + 3000
            });
            this.updateStats();
        }
        
        // 兽纹皮裤词条：攻击时有10%概率提升15%移动速度，持续3秒
        if (traitIdsIncludeBase(traitIds, 'beast_pattern') && Math.random() < 0.1) {
            this.buffs.push({
                effects: { moveSpeed: 15 },
                expireTime: now + 3000
            });
            this.updateStats();
        }
        
        // 征战铁靴词条：攻击时有15%概率提升20%移动速度，持续3秒
        if (traitIdsIncludeBase(traitIds, 'war') && Math.random() < 0.15) {
            this.buffs.push({
                effects: { moveSpeed: 20 },
                expireTime: now + 3000
            });
            this.updateStats();
        }
        
        // 古遗词条：攻击时有10%概率触发额外伤害
        if (traitIdsIncludeBase(traitIds, 'ancient_relic') && Math.random() < 0.1) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('relic_spark', monster.x, monster.y, { radius: 30, duration: 350 });
            }
            const extraDamage = Math.floor(damage * 0.3);
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += extraDamage;
            } else {
                this.damageMonsterFromEnvironment(monster, extraDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `额外伤害! ${extraDamage}`, '#ffaa00', 2000, 18, true);
            }
        }
        
        // 占星词条：暴击时有5%概率触发额外暴击（降低频率）
        if (isCrit && traitIdsIncludeBase(traitIds, 'astrology') && Math.random() < 0.1) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('crit_spark', monster.x, monster.y, { radius: 28, duration: 320 });
            }
            const extraCritDamage = this.baseCritDamage;
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += extraCritDamage;
            } else {
                this.damageMonsterFromEnvironment(monster, extraCritDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `额外暴击! ${extraCritDamage}`, '#ff00ff', 2000, 18, true);
            }
        }
        
        // 炽焰重盔词条：攻击时有5%概率造成持续火焰伤害（降低频率）
        if (traitIdsIncludeBase(traitIds, 'blazing_helmet') && Math.random() < 0.1) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('fire_spark', monster.x, monster.y, { radius: 38, duration: 420 });
            }
            if (isStoolDummy) {
                monster.addStatusEffect('burning', {
                    damage: Math.floor(this.baseAttack * 0.1),
                    duration: 3000
                });
            } else {
                if (this.gameInstance && !monster.burningDots) {
                    monster.burningDots = [];
                }
                if (monster.burningDots) {
                    monster.burningDots.push({
                        damagePerSecond: Math.floor(this.baseAttack * 0.1),
                        duration: 3000,
                        startTime: now,
                        lastTick: now
                    });
                }
            }
        }
        
        // 雷鸣词条：攻击时有15%概率触发雷电，对周围敌人造成伤害
        if (traitIdsIncludeBase(traitIds, 'thunder_crown') && Math.random() < 0.15) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('lightning_chain', this.x, this.y, { radius: 80, duration: 380 });
            }
            const thunderDamage = Math.floor(this.baseAttack * 0.6);
            const targetsCrown = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsCrown.forEach(m => {
                const alive = isCombatTargetAliveForEquipmentProc(m);
                if (alive) {
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 80) {
                        this.damageMonsterFromEnvironment(m, thunderDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `雷电! ${thunderDamage}`, '#00ffff', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 流银词条：攻击时有6%概率触发连击（降低频率）
        if (traitIdsIncludeBase(traitIds, 'flowing_silver') && Math.random() < 0.15) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('combo_slash', monster.x, monster.y, { radius: 32, duration: 300 });
            }
            const comboDamage = Math.floor(damage * 0.5);
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += comboDamage;
            } else {
                this.damageMonsterFromEnvironment(monster, comboDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `连击! ${comboDamage}`, '#ffaa00', 2000, 18, true);
            }
        }
        
        // 猎豹疾靴词条：攻击时有5%概率触发额外攻击（降低频率）
        if (traitIdsIncludeBase(traitIds, 'cheetah') && Math.random() < 0.1) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('combo_slash', monster.x, monster.y, { radius: 34, duration: 320 });
            }
            const extraAttackDamage = Math.floor(damage * 0.7);
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += extraAttackDamage;
            } else {
                this.damageMonsterFromEnvironment(monster, extraAttackDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `额外攻击! ${extraAttackDamage}`, '#ffaa00', 2000, 18, true);
            }
        }
        
        // 秘银私语词条：攻击时有5%概率触发额外攻击（降低频率）
        if (traitIdsIncludeBase(traitIds, 'whisper') && Math.random() < 0.1) {
            const extraAttackDamage = Math.floor(damage * 0.8);
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += extraAttackDamage;
            } else {
                this.damageMonsterFromEnvironment(monster, extraAttackDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `私语! ${extraAttackDamage}`, '#ffaa00', 2000, 18, true);
            }
        }
        
        // 逐神之迹词条：攻击时有20%概率触发范围伤害
        if (traitIdsIncludeBase(traitIds, 'god_chase') && Math.random() < 0.2) {
            const rangeDamage = Math.floor(damage * 0.6);
            const targetsGod = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsGod.forEach(m => {
                if (isCombatTargetAliveForEquipmentProc(m)) {
                    if (m === monster) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 90) {
                        this.damageMonsterFromEnvironment(m, rangeDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `范围! ${rangeDamage}`, '#ffaa00', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 红莲词条：攻击时有15%概率触发火焰爆炸（范围伤害）
        if (traitIdsIncludeBase(traitIds, 'crimson_lotus') && Math.random() < 0.15) {
            const explosionDamage = Math.floor(this.baseAttack * 0.8);
            const targetsLotus = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsLotus.forEach(m => {
                const alive = isCombatTargetAliveForEquipmentProc(m);
                if (alive) {
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 100) {
                        this.damageMonsterFromEnvironment(m, explosionDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `火焰爆炸! ${explosionDamage}`, '#ff4400', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 永冻词条：攻击时有20%概率冰冻目标
        if (traitIdsIncludeBase(traitIds, 'eternal_freeze') && Math.random() < 0.2) {
            // 播放冰冻音效
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.playSound('freeze');
            }
            if (isStoolDummy) {
                monster.addStatusEffect('frozen', { duration: 2000 });
            } else {
                monster.frozenUntil = now + 2000;
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, '冰冻!', '#00ffff', 2000, 18, true);
            }
        }
        
        // 雷纹词条：攻击时有20%概率触发连锁闪电
        if (traitIdsIncludeBase(traitIds, 'thunder_pattern') && Math.random() < 0.2) {
            // 播放感电音效
            if (this.gameInstance && this.gameInstance.soundManager) {
                this.gameInstance.soundManager.playSound('shock');
            }
            const chainDamage = Math.floor(this.baseAttack * 0.7);
            const targetsPattern = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsPattern.forEach(m => {
                if (isCombatTargetAliveForEquipmentProc(m)) {
                    if (m === monster) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 110) {
                        this.damageMonsterFromEnvironment(m, chainDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `连锁! ${chainDamage}`, '#00ffff', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 龙息之握词条：攻击时有6%概率触发火焰伤害（降低频率）
        if (traitIdsIncludeBase(traitIds, 'dragon_breath_ring') && Math.random() < 0.15) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('small_fire_breath', monster.x, monster.y, { radius: 45, duration: 400 });
            }
            const fireDamage = Math.floor(this.baseAttack * 0.5);
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += fireDamage;
                damageType = 'fire'; // 火焰伤害
            } else {
                this.damageMonsterFromEnvironment(monster, fireDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `火焰! ${fireDamage}`, '#ff4400', 2000, 18, true);
            }
        }
        
        // 寒芒词条：攻击时有20%概率冰冻目标
        if (traitIdsIncludeBase(traitIds, 'cold_star') && Math.random() < 0.2) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('freeze_ring', monster.x, monster.y, { radius: 42, duration: 400 });
            }
            if (isStoolDummy) {
                monster.addStatusEffect('frozen', { duration: 1500 });
            } else {
                monster.frozenUntil = now + 1500;
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, '冰冻!', '#00ffff', 2000, 18, true);
            }
        }
        
        // 炎魔之瞳词条：攻击时有15%概率触发火焰爆炸（范围）
        if (traitIdsIncludeBase(traitIds, 'demon_eye') && Math.random() < 0.15) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('fire_spark', monster.x, monster.y, { radius: 95, duration: 450 });
            }
            const explosionDamage = Math.floor(this.baseAttack * 0.75);
            const targetsEye = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsEye.forEach(m => {
                const alive = isCombatTargetAliveForEquipmentProc(m);
                if (alive) {
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 95) {
                        this.damageMonsterFromEnvironment(m, explosionDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `爆炸! ${explosionDamage}`, '#ff4400', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 霜魂凝视词条：攻击时有25%概率冰冻目标
        if (traitIdsIncludeBase(traitIds, 'frost_soul') && Math.random() < 0.25) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('freeze_ring', monster.x, monster.y, { radius: 48, duration: 500 });
            }
            monster.frozenUntil = now + 2000;
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, '冰冻!', '#00ffff', 2000, 18, true);
            }
        }
        
        // 狂雷怒吼词条：攻击时有20%概率触发雷电，对周围敌人造成伤害
        if (traitIdsIncludeBase(traitIds, 'thunder_roar') && Math.random() < 0.2) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('lightning_chain', this.x, this.y, { radius: 85, duration: 400 });
            }
            const thunderDamage = Math.floor(this.baseAttack * 0.7);
            const targetsRoar = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsRoar.forEach(m => {
                const alive = isCombatTargetAliveForEquipmentProc(m);
                if (alive) {
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 85) {
                        this.damageMonsterFromEnvironment(m, thunderDamage);
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `雷电! ${thunderDamage}`, '#00ffff', 2000, 18, true);
                        }
                    }
                }
            });
        }
        
        // 炽炎之环词条：攻击时有5%概率触发火焰伤害（降低频率）
        if (traitIdsIncludeBase(traitIds, 'blazing_ring') && Math.random() < 0.1) {
            const fireDamage = Math.floor(this.baseAttack * 0.4);
            if (isStoolDummy) {
                // 对于训练假人，将额外伤害合并到主伤害中
                damage += fireDamage;
                damageType = 'fire'; // 火焰伤害
            } else {
                this.damageMonsterFromEnvironment(monster, fireDamage);
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `火焰! ${fireDamage}`, '#ff4400', 2000, 18, true);
            }
        }
        
        // 霜冻之触词条：攻击时有15%概率冰冻目标（保持，非伤害效果）
        if (traitIdsIncludeBase(traitIds, 'frost_touch') && Math.random() < 0.15) {
            monster.frozenUntil = now + 1500;
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, '冰冻!', '#00ffff', 2000, 18, true);
            }
        }
        
        // 精钢长剑词条：攻击时有20%概率提升15%攻击力，持续5秒，可叠加2层
        if (traitIdBase(weaponTrait) === 'steel_blade' && Math.random() < 0.2 * stdProc) {
            if (!this.traitStacks['steel_blade']) this.traitStacks['steel_blade'] = 0;
            if (this.traitStacks['steel_blade'] < 2) {
                this.traitStacks['steel_blade']++;
                this.buffs.push({
                    effects: { attack: Math.floor(this.baseAttack * 0.15) },
                    expireTime: now + 5000
                });
                this.updateStats();
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(this.x, this.y, `精钢 ${this.traitStacks['steel_blade']}/2`, '#88ff88');
                }
            }
        }
        
        // 魔法水晶剑词条：攻击时有25%概率触发魔法爆炸
        if (traitIdBase(weaponTrait) === 'crystal_magic' && Math.random() < 0.25 * stdProc) {
            const magicDamage = Math.floor(this.baseAttack * 1.0);
            // 添加魔法爆炸特效
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('magic_explosion', monster.x, monster.y, {
                    radius: 120,
                    duration: 500
                });
            }
            const targetsMagic = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsMagic.forEach(m => {
                const alive = isCombatTargetAliveForEquipmentProc(m);
                if (alive) {
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 120) {
                        if (isStoolDummy && m === monster) {
                            damage += magicDamage;
                        } else {
                            this.damageMonsterFromEnvironment(m, magicDamage);
                        }
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `魔法爆炸! ${magicDamage}`, '#ff00ff', 2000, 18, true);
                        }
                    }
                }
            });
            damageType = 'magic';
        }
        
        // 远古龙刃词条：每次攻击有15%概率召唤龙息（扇形范围）
        if (traitIdBase(weaponTrait) === 'ancient_dragon' && Math.random() < 0.15 * stdProc) {
            const dragonBreathDamage = Math.floor(this.baseAttack * 1.5);
            const angle = this.angle;
            const range = 150;
            if (this.gameInstance) {
                const effectX = this.x + Math.cos(angle) * (range * 0.4);
                const effectY = this.y + Math.sin(angle) * (range * 0.4);
                this.gameInstance.addEquipmentEffect('dragon_breath', effectX, effectY, {
                    radius: range,
                    angle: angle,
                    duration: 600
                });
            }
            const targetsDragon = this.gameInstance ? this.gameInstance.getCurrentSceneTargets() : [];
            targetsDragon.forEach(m => {
                const alive = isCombatTargetAliveForEquipmentProc(m);
                if (!alive) return;
                const dx = m.x - this.x;
                const dy = m.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= range) {
                    const targetAngle = Math.atan2(dy, dx);
                    const angleDiff = Math.abs(targetAngle - angle);
                    const normalizedAngleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
                    if (normalizedAngleDiff < Math.PI / 3) {
                        if (isStoolDummy && m === monster) {
                            damage += dragonBreathDamage;
                        } else {
                            this.damageMonsterFromEnvironment(m, dragonBreathDamage);
                        }
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(m.x, m.y, `龙息! ${dragonBreathDamage}`, '#ff4400', 2000, 18, true);
                        }
                    }
                }
            });
            damageType = 'fire';
        }
        
        // 混沌之刃词条：攻击时有30%概率触发混沌之力
        if (traitIdBase(weaponTrait) === 'chaos_blade' && Math.random() < 0.3 * stdProc) {
            const chaosDamage = Math.floor(damage * 2.0);
            // 添加混沌爆炸特效
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('chaos_blast', monster.x, monster.y, {
                    radius: 80,
                    duration: 600
                });
            }
            if (isStoolDummy) {
                damage = chaosDamage;
            } else {
                this.damageMonsterFromEnvironment(monster, chaosDamage);
                // 降低目标属性（简化处理，通过添加debuff）
                if (!monster.debuffs) monster.debuffs = [];
                monster.debuffs.push({
                    effects: { attack: -Math.floor(monster.baseAttack * 0.3), defense: -Math.floor(monster.baseDefense * 0.3) },
                    expireTime: now + 5000
                });
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `混沌! ${chaosDamage}`, '#8b00ff', 2000, 18, true);
            }
            damageType = 'chaos';
        }
        
        // 奔雷束缚词条：攻击时有6%概率触发雷电（降低频率）
        if (traitIdsIncludeBase(traitIds, 'thunder_bind') && Math.random() < 0.15) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('lightning_chain', monster.x, monster.y, { radius: 40, duration: 350 });
            }
            const thunderDamage = Math.floor(this.baseAttack * 0.5);
            this.damageMonsterFromEnvironment(monster, thunderDamage);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, `雷电! ${thunderDamage}`, '#00ffff', 2000, 18, true);
            }
        }

        // ---------- 恶魔塔深阶·武器与饰品（普攻/远程），档位 0～7 与装备 id 后缀一致 ----------
        if (meleeW && wB === 'void_w_rend' && isCrit && Math.random() < Math.min(0.92, ((18 + 2 * wT) / 100) * (1 + 0.04 * vbd))) {
            let ratio = (20 + 2.5 * wT) / 100;
            if (vbd >= 3) ratio *= 1.12;
            const rd = Math.floor(damage * ratio);
            if (rd > 0) {
                if (isStoolDummy) {
                    damage += rd;
                } else {
                    this.damageMonsterFromEnvironment(monster, rd);
                }
                if (vbd >= 1) {
                    const hh = Math.floor(this.maxHp * (0.006 + 0.003 * vbd));
                    if (hh > 0) this.hp = Math.min(this.maxHp, this.hp + hh);
                }
                if (vbd >= 2 && this.gameInstance) {
                    const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
                    const near = others.filter(m => {
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        return Math.sqrt(dx * dx + dy * dy) <= 75;
                    });
                    if (near.length) {
                        const t2 = near[Math.floor(Math.random() * near.length)];
                        const sd = Math.floor(rd * 0.42);
                        if (sd > 0) {
                            this.damageMonsterFromEnvironment(t2, sd);
                            this.gameInstance.addFloatingText(t2.x, t2.y, `裂潮 ${sd}`, '#dd88ff', 1600, 14, true);
                        }
                    }
                }
                if (vbd >= 3 && monster.maxHp > 0 && monster.hp / monster.maxHp < 0.4 && this.gameInstance) {
                    const ex = Math.floor(this.baseAttack * (32 + 2 * wT) / 100);
                    this.damageMonsterFromEnvironment(monster, ex);
                    this.gameInstance.addFloatingText(monster.x, monster.y, `终裂 ${ex}`, '#ffccff', 1700, 15, true);
                }
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, `裂伤 ${rd}`, '#cc66ff', 1800, 16, true);
                }
            }
        }

        if (meleeW && wB === 'void_w_mire' && Math.random() < Math.min(0.92, ((9 + wT) / 100) * (1 + 0.035 * vbd))) {
            const mult = (90 - wT - (vbd >= 2 ? 2 : 0)) / 100;
            const dur = 2000 + 80 * wT + (vbd >= 3 ? 400 : 0);
            if (isStoolDummy && monster.addStatusEffect) {
                monster.addStatusEffect('slowed', { multiplier: mult, duration: dur });
            } else if (!isStoolDummy) {
                if (!monster.slowEffects) monster.slowEffects = [];
                monster.slowEffects.push({ multiplier: mult, expireTime: now + dur });
            }
            if (vbd >= 1) {
                const dot = Math.floor(this.baseAttack * (0.06 + 0.02 * vbd));
                if (dot > 0) this.damageMonsterFromEnvironment(monster, dot);
            }
            if (vbd >= 2 && this.gameInstance) {
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m === monster || !isCombatTargetAliveForEquipmentProc(m)) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 55) {
                        if (m instanceof TrainingDummy && m.addStatusEffect) {
                            m.addStatusEffect('slowed', { multiplier: 0.92, duration: 800 });
                        } else {
                            if (!m.slowEffects) m.slowEffects = [];
                            m.slowEffects.push({ multiplier: 0.92, expireTime: now + 800 });
                        }
                    }
                });
            }
            if (vbd >= 3) {
                if (isStoolDummy && monster.addStatusEffect) {
                    monster.addStatusEffect('frozen', { duration: 120 });
                } else {
                    monster.frozenUntil = Math.max(monster.frozenUntil || 0, now + 120);
                }
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, vbd >= 1 ? '虚淤' : '淤滞', '#8866aa', 1500, 14, true);
            }
        }

        if (meleeW && wB === 'void_w_fork' && Math.random() < Math.min(0.92, ((12 + wT) / 100) * (1 + 0.035 * vbd)) && this.gameInstance) {
            const forkR = 90 + 5 * wT + (vbd >= 2 ? 25 : 0);
            const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
            const near = others.filter(m => {
                const dx = m.x - monster.x;
                const dy = m.y - monster.y;
                return Math.sqrt(dx * dx + dy * dy) <= forkR;
            });
            if (near.length) {
                const t = near[Math.floor(Math.random() * near.length)];
                let fd = Math.floor(this.baseAttack * (30 + 1.8 * wT) / 100);
                if (vbd >= 3) fd = Math.floor(fd * 1.2);
                this.damageMonsterFromEnvironment(t, fd);
                this.gameInstance.addFloatingText(t.x, t.y, `分岔 ${fd}`, '#aa88ff', 1800, 16, true);
                if (vbd >= 1) {
                    this.buffs.push({ effects: { moveSpeed: 6 + 2 * vbd }, expireTime: now + 2000 });
                    this.updateStats();
                }
                if (vbd >= 2 && near.length > 1) {
                    const t2 = near.filter(x => x !== t)[Math.floor(Math.random() * (near.length - 1))];
                    if (t2) {
                        const fd2 = Math.floor(fd * 0.55);
                        this.damageMonsterFromEnvironment(t2, fd2);
                        this.gameInstance.addFloatingText(t2.x, t2.y, `连环 ${fd2}`, '#ccaaee', 1600, 14, true);
                    }
                }
            }
        }

        if (rangedW && wB === 'void_b_ricochet' && Math.random() < Math.min(0.92, ((12 + wT) / 100) * (1 + 0.035 * vbd)) && this.gameInstance) {
            const ricR = 80 + 4 * wT + (vbd >= 3 ? 30 : 0);
            const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
            const near = others.filter(m => {
                const dx = m.x - monster.x;
                const dy = m.y - monster.y;
                return Math.sqrt(dx * dx + dy * dy) <= ricR;
            });
            if (near.length) {
                const t = near[Math.floor(Math.random() * near.length)];
                let fd = Math.floor(this.baseAttack * (28 + 1.2 * wT) / 100);
                this.damageMonsterFromEnvironment(t, fd);
                this.gameInstance.addFloatingText(t.x, t.y, `跳弹 ${fd}`, '#88ccff', 1800, 16, true);
                if (vbd >= 1 && !isStoolDummy) {
                    monster.debuffs = monster.debuffs || [];
                    monster.debuffs.push({ effects: { defense: -Math.floor((monster.baseDefense || 5) * (0.05 + 0.02 * vbd)) }, expireTime: now + 4000 });
                }
                if (vbd >= 2 && near.length > 1) {
                    const t2 = near.filter(x => x !== t)[0];
                    if (t2) {
                        const fd2 = Math.floor(fd * 0.5);
                        this.damageMonsterFromEnvironment(t2, fd2);
                        this.gameInstance.addFloatingText(t2.x, t2.y, `连弹 ${fd2}`, '#99ddff', 1600, 14, true);
                    }
                }
                if (vbd >= 3) {
                    const boom = Math.floor(fd * 0.45);
                    this.gameInstance.getCurrentSceneTargets().forEach(m => {
                        if (m === t || !isCombatTargetAliveForEquipmentProc(m)) return;
                        const dx = m.x - t.x;
                        const dy = m.y - t.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 55) this.damageMonsterFromEnvironment(m, boom);
                    });
                }
            }
        }

        if (rangedW && wB === 'void_b_weaken' && Math.random() < Math.min(0.92, ((11 + wT) / 100) * (1 + 0.03 * vbd))) {
            const mult = (91 - 0.8 * wT - (vbd >= 2 ? 2 : 0)) / 100;
            const dur = 1850 + 70 * wT + (vbd >= 3 ? 500 : 0);
            if (isStoolDummy && monster.addStatusEffect) {
                monster.addStatusEffect('slowed', { multiplier: mult, duration: dur });
            } else if (!isStoolDummy) {
                if (!monster.slowEffects) monster.slowEffects = [];
                monster.slowEffects.push({ multiplier: mult, expireTime: now + dur });
            }
            if (vbd >= 1 && !isStoolDummy) {
                monster.debuffs = monster.debuffs || [];
                monster.debuffs.push({ effects: { attack: -Math.floor((monster.baseAttack || 8) * 0.08) }, expireTime: now + dur });
            }
            if (vbd >= 2 && this.gameInstance) {
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m === monster || !isCombatTargetAliveForEquipmentProc(m)) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 70) {
                        if (m instanceof TrainingDummy && m.addStatusEffect) {
                            m.addStatusEffect('slowed', { multiplier: 0.94, duration: 600 });
                        } else {
                            if (!m.slowEffects) m.slowEffects = [];
                            m.slowEffects.push({ multiplier: 0.94, expireTime: now + 600 });
                        }
                    }
                });
            }
            if (vbd >= 3) {
                if (isStoolDummy && monster.addStatusEffect) {
                    monster.addStatusEffect('frozen', { duration: 180 });
                } else if (!isStoolDummy) {
                    monster.frozenUntil = Math.max(monster.frozenUntil || 0, now + 180);
                }
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, vbd >= 1 ? '蚀印' : '蚀弦', '#6699cc', 1500, 14, true);
            }
        }

        if (rangedW && wB === 'void_b_volley' && Math.random() < Math.min(0.92, ((10 + wT) / 100) * (1 + 0.035 * vbd)) && this.gameInstance) {
            const volR = 55 + 4 * wT;
            let splash = Math.floor(this.baseAttack * (40 + 2 * wT) / 100);
            if (vbd >= 3) splash = Math.floor(splash * 1.15);
            this.gameInstance.getCurrentSceneTargets().forEach(m => {
                if (m === monster || !isCombatTargetAliveForEquipmentProc(m)) return;
                const dx = m.x - monster.x;
                const dy = m.y - monster.y;
                if (Math.sqrt(dx * dx + dy * dy) <= volR) {
                    this.damageMonsterFromEnvironment(m, splash);
                    this.gameInstance.addFloatingText(m.x, m.y, `散矢 ${splash}`, '#99aaff', 1600, 14, true);
                }
            });
            if (vbd >= 1) {
                const cx = Math.floor(this.baseAttack * (0.12 + 0.04 * vbd));
                if (cx > 0) this.damageMonsterFromEnvironment(monster, cx);
            }
            if (vbd >= 2) {
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m === monster || !isCombatTargetAliveForEquipmentProc(m)) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= volR * 0.6) {
                        const bd = Math.floor(splash * 0.25);
                        if (bd > 0) this.damageMonsterFromEnvironment(m, bd);
                    }
                });
            }
        }

        if (rangedW && wB === 'void_b_star' && isCrit && Math.random() < Math.min(0.92, ((19 + 2 * wT) / 100) * (1 + 0.03 * vbd)) && this.gameInstance) {
            const starR = 72 + 5 * wT;
            let nova = Math.floor(this.baseAttack * (48 + 2.2 * wT) / 100);
            this.gameInstance.getCurrentSceneTargets().forEach(m => {
                if (!isCombatTargetAliveForEquipmentProc(m)) return;
                const dx = m.x - monster.x;
                const dy = m.y - monster.y;
                if (Math.sqrt(dx * dx + dy * dy) <= starR) {
                    this.damageMonsterFromEnvironment(m, nova);
                    this.gameInstance.addFloatingText(m.x, m.y, `星落 ${nova}`, '#ddddff', 1800, 15, true);
                }
            });
            if (vbd >= 1) {
                const hh = Math.floor(this.maxHp * (0.005 + 0.002 * vbd));
                if (hh > 0) this.hp = Math.min(this.maxHp, this.hp + hh);
            }
            if (vbd >= 2) {
                const sn = Math.floor(nova * 0.55);
                if (sn > 0) this.damageMonsterFromEnvironment(monster, sn);
            }
            if (vbd >= 3) {
                const big = Math.floor(nova * 1.1);
                this.damageMonsterFromEnvironment(monster, big);
                this.gameInstance.addFloatingText(monster.x, monster.y, `星殒 ${big}`, '#ffffff', 1900, 16, true);
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_r_twin') && Math.random() < (5 + voidTraitTierFromList(traitIds, 'void_r_twin')) / 100) {
            const tt = voidTraitTierFromList(traitIds, 'void_r_twin');
            const tb = typeof deepTraitBand === 'function' ? deepTraitBand(tt) : 0;
            let td = Math.floor(damage * (24 + 2 * tt) / 100);
            if (tb >= 3) td = Math.floor(td * 1.15);
            if (td > 0) {
                if (isStoolDummy) {
                    damage += td;
                } else {
                    this.damageMonsterFromEnvironment(monster, td);
                }
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, tb >= 2 ? `叠环 ${td}` : `双环 ${td}`, '#ffcc66', 1600, 15, true);
                }
                if (tb >= 1) {
                    const ls = Math.max(1, Math.floor(td * (0.25 + 0.08 * tb)));
                    this.hp = Math.min(this.maxHp, this.hp + ls);
                    if (this.gameInstance) this.gameInstance.addFloatingText(this.x, this.y, `环汲 +${ls}`, '#ffeeaa', 1100, 12, true);
                }
                if (tb >= 2 && this.gameInstance) {
                    const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
                    const near = others.filter(m => {
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        return Math.sqrt(dx * dx + dy * dy) <= 95;
                    });
                    if (near.length) {
                        const t2 = near[Math.floor(Math.random() * near.length)];
                        const td2 = Math.floor(td * 0.42);
                        if (td2 > 0) {
                            this.damageMonsterFromEnvironment(t2, td2);
                            this.gameInstance.addFloatingText(t2.x, t2.y, `余环 ${td2}`, '#ffdd88', 1500, 14, true);
                        }
                    }
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_n_mend') && Math.random() < (7 + voidTraitTierFromList(traitIds, 'void_n_mend')) / 100) {
            const tm = voidTraitTierFromList(traitIds, 'void_n_mend');
            const mb = typeof deepTraitBand === 'function' ? deepTraitBand(tm) : 0;
            let h = Math.floor(this.maxHp * (1.2 + 0.2 * tm) / 100);
            if (mb >= 2) h = Math.floor(h * 1.35);
            if (h > 0) {
                this.hp = Math.min(this.maxHp, this.hp + h);
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(this.x, this.y, mb >= 1 ? `双泉 +${h}` : `涌泉 +${h}`, '#66ffaa');
                }
            }
            if (mb >= 1 && this.slowEffects && this.slowEffects.length) {
                this.slowEffects = this.slowEffects.filter(e => e.expireTime > now);
                if (this.slowEffects.length) {
                    this.slowEffects.pop();
                    this.updateStats();
                }
            }
            if (mb >= 3 && h > 0) {
                const h2 = Math.floor(h * 0.4);
                if (h2 > 0) {
                    this.hp = Math.min(this.maxHp, this.hp + h2);
                    if (this.gameInstance) this.gameInstance.addFloatingText(this.x, this.y, `链泉 +${h2}`, '#44ff99', 1000, 12, true);
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_n_snare') && Math.random() < (6 + voidTraitTierFromList(traitIds, 'void_n_snare')) / 100) {
            const tn = voidTraitTierFromList(traitIds, 'void_n_snare');
            const nb = typeof deepTraitBand === 'function' ? deepTraitBand(tn) : 0;
            let fz = 420 + 35 * tn + (nb >= 2 ? 120 + 40 * nb : 0);
            if (isStoolDummy && monster.addStatusEffect) {
                monster.addStatusEffect('frozen', { duration: fz });
                if (nb >= 1) monster.addStatusEffect('slowed', { multiplier: 0.78, duration: fz });
            } else {
                monster.frozenUntil = now + fz;
                if (nb >= 1) {
                    if (!monster.slowEffects) monster.slowEffects = [];
                    monster.slowEffects.push({ multiplier: 0.78, expireTime: now + fz });
                }
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(monster.x, monster.y, nb >= 3 ? '渊缚' : '缚链', '#66ccff', 1200, 14, true);
                if (nb >= 3) {
                    const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
                    others.forEach(m => {
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 88) {
                            if (m instanceof TrainingDummy && m.addStatusEffect) {
                                m.addStatusEffect('slowed', { multiplier: 0.85, duration: 1800 });
                            } else {
                                if (!m.slowEffects) m.slowEffects = [];
                                m.slowEffects.push({ multiplier: 0.85, expireTime: now + 1800 });
                            }
                            this.gameInstance.addFloatingText(m.x, m.y, '缚散', '#88ddff', 900, 11, true);
                        }
                    });
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_n_arc') && Math.random() < (5 + voidTraitTierFromList(traitIds, 'void_n_arc')) / 100 && this.gameInstance) {
            const ta = voidTraitTierFromList(traitIds, 'void_n_arc');
            const ab = typeof deepTraitBand === 'function' ? deepTraitBand(ta) : 0;
            const arcR = 92 + 5 * ta;
            const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
            const near = others.filter(m => {
                const dx = m.x - monster.x;
                const dy = m.y - monster.y;
                return Math.sqrt(dx * dx + dy * dy) <= arcR;
            });
            if (near.length) {
                const t = near[Math.floor(Math.random() * near.length)];
                let ad = Math.floor(this.baseAttack * (28 + 1.2 * ta) / 100);
                if (ab >= 3) ad = Math.floor(ad * 1.12);
                this.damageMonsterFromEnvironment(t, ad);
                this.gameInstance.addFloatingText(t.x, t.y, ab >= 2 ? `折弧 ${ad}` : `弧光 ${ad}`, '#aaddff', 1700, 15, true);
                if (ab >= 1) {
                    const sh = Math.floor(this.maxHp * (0.006 + 0.003 * ab));
                    if (sh > 0) {
                        this.hp = Math.min(this.maxHp, this.hp + sh);
                        this.gameInstance.addFloatingText(this.x, this.y, `弧愈 +${sh}`, '#99ffdd', 1000, 11, true);
                    }
                }
                if (ab >= 2) {
                    const rest = near.filter(m => m !== t);
                    if (rest.length) {
                        const t2 = rest[Math.floor(Math.random() * rest.length)];
                        const ad2 = Math.floor(ad * 0.52);
                        if (ad2 > 0) {
                            this.damageMonsterFromEnvironment(t2, ad2);
                            this.gameInstance.addFloatingText(t2.x, t2.y, `回弧 ${ad2}`, '#cceeff', 1600, 14, true);
                        }
                    }
                }
                if (ab >= 3 && !(t instanceof TrainingDummy)) {
                    if (!t.burningDots) t.burningDots = [];
                    t.burningDots.push({
                        damagePerSecond: Math.max(1, Math.floor(ad * 0.12)),
                        duration: 2200,
                        startTime: now,
                        lastTick: now
                    });
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_l_overdrive') && Math.random() < (8 + voidTraitTierFromList(traitIds, 'void_l_overdrive')) / 100) {
            const to = voidTraitTierFromList(traitIds, 'void_l_overdrive');
            const ob = typeof deepTraitBand === 'function' ? deepTraitBand(to) : 0;
            const asp = Math.floor(this.baseAttackSpeed * (6 + 0.9 * to) / 100);
            this.buffs.push({
                effects: { attackSpeed: asp, moveSpeed: ob >= 1 ? 6 + 2 * ob : 0 },
                expireTime: now + 4800 + 120 * to + (ob >= 2 ? 500 : 0)
            });
            this.updateStats();
            if (ob >= 3 && this.gameInstance) {
                const pd = Math.floor(this.baseAttack * (0.2 + 0.02 * to));
                this.damageMonsterFromEnvironment(monster, pd);
                this.gameInstance.addFloatingText(monster.x, monster.y, `过载 ${pd}`, '#ffaa66', 1400, 14, true);
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_f_trace') && Math.random() < (8 + voidTraitTierFromList(traitIds, 'void_f_trace')) / 100) {
            const ttr = voidTraitTierFromList(traitIds, 'void_f_trace');
            const trb = typeof deepTraitBand === 'function' ? deepTraitBand(ttr) : 0;
            const asp2 = Math.floor(this.baseAttackSpeed * (7.5 + 0.9 * ttr) / 100);
            this.buffs.push({
                effects: { attackSpeed: asp2, moveSpeed: trb >= 1 ? 8 + 2 * trb : 0 },
                expireTime: now + 3600 + 100 * ttr + (trb >= 2 ? 400 : 0)
            });
            this.updateStats();
            if (trb >= 3 && this.gameInstance) {
                if (isStoolDummy && monster.addStatusEffect) {
                    monster.addStatusEffect('slowed', { multiplier: 0.8, duration: 2400 });
                } else {
                    if (!monster.slowEffects) monster.slowEffects = [];
                    monster.slowEffects.push({ multiplier: 0.8, expireTime: now + 2400 });
                }
                this.gameInstance.addFloatingText(monster.x, monster.y, '滞痕', '#99ccff', 1200, 13, true);
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_r_tempo') && Math.random() < (7 + voidTraitTierFromList(traitIds, 'void_r_tempo')) / 100 && this.weaponSkillCooldown > now) {
            const ttp = voidTraitTierFromList(traitIds, 'void_r_tempo');
            const rtb = typeof deepTraitBand === 'function' ? deepTraitBand(ttp) : 0;
            let red = 320 + 35 * ttp + (rtb >= 1 ? 40 + 20 * rtb : 0);
            if (rtb >= 3) red = Math.floor(red * 1.12);
            this.weaponSkillCooldown = Math.max(now, this.weaponSkillCooldown - red);
            if (rtb >= 2) {
                this.buffs.push({ effects: { moveSpeed: 10 + 2 * rtb }, expireTime: now + 3000 });
                this.updateStats();
            }
        }

        if (meleeW && wB === 'void_w_sigil') {
            if (wT === 7) {
                monster.voidRuinHits = (monster.voidRuinHits || 0) + 1;
                if (monster.voidRuinHits >= 3) {
                    monster.voidRuinHits = 0;
                    if (this.gameInstance) {
                        const ruinR = 88 + 4 * wT;
                        const nova = Math.floor(this.baseAttack * (55 + 3 * wT) / 100);
                        this.gameInstance.getCurrentSceneTargets().forEach(m => {
                            if (m === monster || !isCombatTargetAliveForEquipmentProc(m)) return;
                            const dx = m.x - monster.x;
                            const dy = m.y - monster.y;
                            if (Math.sqrt(dx * dx + dy * dy) <= ruinR) {
                                this.damageMonsterFromEnvironment(m, nova);
                                this.gameInstance.addFloatingText(m.x, m.y, `墟印 ${nova}`, '#dd99ff', 1800, 15, true);
                            }
                        });
                        this.gameInstance.addFloatingText(monster.x, monster.y, '归墟!', '#eeccff', 1400, 16, true);
                    }
                }
            }
            if (wT <= 2 && Math.random() < 0.22 + 0.01 * wT) {
                const cap = Math.min(6, 4 + Math.floor(wT / 2));
                monster.voidSigilStacks = Math.min(cap, (monster.voidSigilStacks || 0) + 1);
                monster.voidSigilPerStack = (3.5 + 0.3 * wT) / 100;
                monster.voidSigilExpire = now + (5 + Math.floor(wT / 2)) * 1000;
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, `印×${monster.voidSigilStacks}`, '#bbaaff', 1200, 13, true);
                }
            } else if (wT === 3 && Math.random() < 0.24 + 0.01 * wT) {
                monster.voidShredStacks = Math.min(2, (monster.voidShredStacks || 0) + 1);
                monster.voidShredExpire = now + 4500;
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, `溃×${monster.voidShredStacks}`, '#ccaa88', 1200, 13, true);
                }
            } else if (wT === 4 && Math.random() < 0.2 + 0.01 * wT) {
                monster.voidOathMul = 1.28 + 0.015 * wT;
                monster.voidOathUntil = now + 3200;
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(monster.x, monster.y, '誓印', '#ff99cc', 1200, 13, true);
                }
            } else if (wT === 5 && this.gameInstance && Math.random() < 0.22 + 0.01 * wT) {
                const linkR = 80 + 5 * wT;
                const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== monster && isCombatTargetAliveForEquipmentProc(m));
                const near = others.filter(m => {
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    return Math.sqrt(dx * dx + dy * dy) <= linkR;
                });
                if (near.length) {
                    const t = near[Math.floor(Math.random() * near.length)];
                    const ld = Math.floor(this.baseAttack * (38 + 2 * wT) / 100);
                    this.damageMonsterFromEnvironment(t, ld);
                    this.gameInstance.addFloatingText(t.x, t.y, `星链 ${ld}`, '#99ddff', 1800, 15, true);
                }
            } else if (wT === 6 && Math.random() < 0.2 + 0.01 * wT) {
                const vd = Math.floor(this.baseAttack * (30 + 2.5 * wT) / 100);
                if (vd > 0) {
                    this.damageMonsterFromEnvironment(monster, vd);
                    if (this.gameInstance) {
                        this.gameInstance.addEquipmentEffect('void_vein_burst', monster.x, monster.y, {
                            radius: 48,
                            duration: 450
                        });
                        // 与普攻白字错开：上移 + 高对比色 + 更大字号，突出「独立结算」裂脉段
                        this.gameInstance.addFloatingText(
                            monster.x,
                            monster.y - 22,
                            `裂脉 ${vd}`,
                            '#ea80fc',
                            2800,
                            22,
                            true
                        );
                        if (this.gameInstance.soundManager) {
                            this.gameInstance.soundManager.playSound('shock');
                        }
                    }
                }
            }
        }
        
        // 已卸下幽冥刃等仍保留「下次必暴」标记时清掉，避免永久残留
        if (this.nextAttackCrit && traitIdBase(this.getCurrentWeaponTraitId()) !== 'shadow') {
            this.nextAttackCrit = false;
        }
        
        return { damage, damageType };
    }
    
    /**
     * 处理移动时的词条效果
     * @param {number} dx - X方向移动量
     * @param {number} dy - Y方向移动量
     */
    processMoveTraits(dx, dy) {
        try {
            const traitIds = this.getEquipmentTraitIds();
            const now = Date.now();
            
            // 检查是否真的在移动
            const moved = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
            if (!moved) return;
            
            // 确保moveTraitCooldowns已初始化
            if (!this.moveTraitCooldowns) {
                this.moveTraitCooldowns = {};
            }
            
            // 确保lastMoveX和lastMoveY已初始化
            if (this.lastMoveX === undefined) {
                this.lastMoveX = this.x;
            }
            if (this.lastMoveY === undefined) {
                this.lastMoveY = this.y;
            }
        
        // 清理超过10秒的足迹
        if (this.traitTrails) {
            this.traitTrails = this.traitTrails.filter(trail => now - trail.startTime < 10000);
        }
        
        // 计算移动距离
        const moveDistance = Math.sqrt(dx * dx + dy * dy);
        
        // 初始化轨迹累积距离（用于基于距离的轨迹添加）
        if (!this.trailAccumulatedDistance) {
            this.trailAccumulatedDistance = 0;
        }
        
        // 检查是否有轨迹词条或套装效果
        const hasGalaxyTrail = traitIdsIncludeBase(traitIds, 'galaxy_trail');
        const hasFireTrail = traitIdsIncludeBase(traitIds, 'fire_trail');
        
        // 检查是否有套装效果（套装效果也会产生轨迹，只是颜色不同）
        let hasSetTrail = false;
        if (typeof getActiveSetEffects === 'function') {
            const activeSets = getActiveSetEffects(this.equipment);
            activeSets.forEach(set => {
                if (set.setName === '烈焰套装' || set.setName === '霜寒套装' || set.setName === '雷霆套装') {
                    hasSetTrail = true;
                }
            });
        }
        
        // 如果有任何轨迹效果，边走边画（每移动一定距离就添加一个点）
        if (hasGalaxyTrail || hasFireTrail || hasSetTrail) {
            if (!this.traitTrails) this.traitTrails = [];
            
            // 累积移动距离
            this.trailAccumulatedDistance += moveDistance;
            
            // 银河/火焰轨迹需要密；纯套装装饰轨迹降低密度，避免冰套鞋「满屏特效」且减轻性能压力
            const minDistance = (hasSetTrail && !hasGalaxyTrail && !hasFireTrail) ? 12 : 2;
            
            // 如果累积距离达到阈值，添加轨迹点
            while (this.trailAccumulatedDistance >= minDistance) {
                // 根据词条类型决定轨迹类型
                let trailType = 'default';
                if (hasGalaxyTrail) {
                    trailType = 'galaxy';
                } else if (hasFireTrail) {
                    trailType = 'fire';
                } else if (hasSetTrail) {
                    // 套装效果使用默认类型，颜色由绘制函数决定
                    trailType = 'set';
                }
                
                this.traitTrails.push({
                    x: this.x,
                    y: this.y,
                    type: trailType,
                    damage: hasGalaxyTrail ? Math.floor(this.baseAttack * 0.1) : (hasFireTrail ? Math.floor(this.baseAttack * 0.12) : 0),
                    duration: hasGalaxyTrail ? 2000 : (hasFireTrail ? 2500 : 2000),
                    startTime: now
                });
                
                this.trailAccumulatedDistance -= minDistance; // 减去已使用的距离，保留余数
                this.lastTrailTime = now;
            }
        } else {
            // 如果没有轨迹效果，重置累积距离
            this.trailAccumulatedDistance = 0;
        }
        
        // 电光战袍词条：移动时有3%概率触发闪电（降低频率，添加冷却）
        const lightningRobeKey = 'lightning_robe';
        if (traitIdsIncludeBase(traitIds, 'lightning_robe')) {
            if (!this.moveTraitCooldowns[lightningRobeKey] || now > this.moveTraitCooldowns[lightningRobeKey]) {
                if (Math.random() < 0.03) {
                    this.moveTraitCooldowns[lightningRobeKey] = now + 500; // 0.5秒冷却
                    const lightningDamage = Math.floor(this.baseAttack * 0.6);
                    if (this.gameInstance) {
                        const targetsRobe = this.gameInstance.getCurrentSceneTargets();
                        targetsRobe.forEach(m => {
                            const alive = isCombatTargetAliveForEquipmentProc(m);
                            if (alive) {
                                const dx = m.x - this.x;
                                const dy = m.y - this.y;
                                if (Math.sqrt(dx * dx + dy * dy) <= 100) {
                                    this.damageMonsterFromEnvironment(m, lightningDamage);
                                    if (this.gameInstance) {
                                        this.gameInstance.addFloatingText(m.x, m.y, `电光! ${lightningDamage}`, '#00ffff', 2000, 18, true);
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
        
        // 疾雷腿甲词条：移动时有3%概率触发雷电（对周围敌人造成伤害）
        const swiftThunderKey = 'swift_thunder';
        if (traitIdsIncludeBase(traitIds, 'swift_thunder')) {
            if (!this.moveTraitCooldowns[swiftThunderKey] || now > this.moveTraitCooldowns[swiftThunderKey]) {
                if (Math.random() < 0.03) {
                    this.moveTraitCooldowns[swiftThunderKey] = now + 500;
                    const thunderDamage = Math.floor(this.baseAttack * 0.5);
                    if (this.gameInstance) {
                        const targetsSwift = this.gameInstance.getCurrentSceneTargets();
                        targetsSwift.forEach(m => {
                            const alive = isCombatTargetAliveForEquipmentProc(m);
                            if (alive) {
                                const dx = m.x - this.x;
                                const dy = m.y - this.y;
                                if (Math.sqrt(dx * dx + dy * dy) <= 80) {
                                    this.damageMonsterFromEnvironment(m, thunderDamage);
                                    if (this.gameInstance) {
                                        this.gameInstance.addFloatingText(m.x, m.y, `雷电! ${thunderDamage}`, '#00ffff', 2000, 18, true);
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
        
        // 星轨漫步词条：移动时有3%概率触发星辰（对周围敌人造成伤害）
        const starTrailKey = 'star_trail';
        if (traitIdsIncludeBase(traitIds, 'star_trail')) {
            if (!this.moveTraitCooldowns[starTrailKey] || now > this.moveTraitCooldowns[starTrailKey]) {
                if (Math.random() < 0.03) {
                    this.moveTraitCooldowns[starTrailKey] = now + 500;
                    const starDamage = Math.floor(this.baseAttack * 0.7);
                    if (this.gameInstance) {
                        const targetsStar = this.gameInstance.getCurrentSceneTargets();
                        targetsStar.forEach(m => {
                            const alive = isCombatTargetAliveForEquipmentProc(m);
                            if (alive) {
                                const dx = m.x - this.x;
                                const dy = m.y - this.y;
                                if (Math.sqrt(dx * dx + dy * dy) <= 90) {
                                    this.damageMonsterFromEnvironment(m, starDamage);
                                    if (this.gameInstance) {
                                        this.gameInstance.addFloatingText(m.x, m.y, `星辰! ${starDamage}`, '#ffd700', 2000, 18, true);
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
        
        // 龙踏云靴词条：移动时有3%概率触发瞬移伤害（降低频率，添加冷却）
        const cloudStepKey = 'cloud_step';
        if (traitIdsIncludeBase(traitIds, 'cloud_step')) {
            if (!this.moveTraitCooldowns[cloudStepKey] || now > this.moveTraitCooldowns[cloudStepKey]) {
                if (Math.random() < 0.03) {
                    this.moveTraitCooldowns[cloudStepKey] = now + 500; // 0.5秒冷却
                    const dashDamage = Math.floor(this.baseAttack * 0.8);
                    if (this.gameInstance) {
                        const targets = this.gameInstance.getCurrentSceneTargets();
                        const moveDist = Math.sqrt(dx * dx + dy * dy) * 50;
                        // 确保dx和dy不为0，避免除以0的错误
                        // 确保lastMoveX和lastMoveY已初始化
                        if (this.lastMoveX === undefined) this.lastMoveX = this.x;
                        if (this.lastMoveY === undefined) this.lastMoveY = this.y;
                        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
                            targets.forEach(m => {
                                if (!isCombatTargetAliveForEquipmentProc(m)) return;
                                const dx2 = m.x - this.lastMoveX;
                                const dy2 = m.y - this.lastMoveY;
                                const distSq = dx * dx + dy * dy;
                                if (distSq > 0.001) {
                                    const distToPath = Math.abs(dx2 * dy - dy2 * dx) / Math.sqrt(distSq);
                                    if (distToPath <= 30 && Math.abs(dx2 * dx + dy2 * dy) >= 0) {
                                        this.damageMonsterFromEnvironment(m, dashDamage);
                                        if (this.gameInstance) {
                                            this.gameInstance.addFloatingText(m.x, m.y, `瞬移! ${dashDamage}`, '#ff00ff', 2000, 18, true);
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            }
        }
        
        // 烁光银靴词条：移动时有3%概率触发闪光（降低频率，添加冷却）
        const shimmerKey = 'shimmer';
        if (traitIdsIncludeBase(traitIds, 'shimmer')) {
            if (!this.moveTraitCooldowns[shimmerKey] || now > this.moveTraitCooldowns[shimmerKey]) {
                if (Math.random() < 0.03) {
                    this.moveTraitCooldowns[shimmerKey] = now + 500; // 0.5秒冷却
                    const flashDamage = Math.floor(this.baseAttack * 0.6);
                    if (this.gameInstance) {
                        const targetsShimmer = this.gameInstance.getCurrentSceneTargets();
                        targetsShimmer.forEach(m => {
                            const alive = isCombatTargetAliveForEquipmentProc(m);
                            if (alive) {
                                const dx = m.x - this.x;
                                const dy = m.y - this.y;
                                const distance = Math.sqrt(dx * dx + dy * dy);
                                if (distance <= 85) {
                                    this.damageMonsterFromEnvironment(m, flashDamage);
                                    if (this.gameInstance) {
                                        this.gameInstance.addFloatingText(m.x, m.y, `闪光! ${flashDamage}`, '#ffff00', 2000, 18, true);
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
        
        // 凝霜远行词条：移动时有5%概率冰冻路径上的敌人（降低频率，添加冷却）
        const frostWalkKey = 'frost_walk';
        if (traitIdsIncludeBase(traitIds, 'frost_walk')) {
            if (!this.moveTraitCooldowns[frostWalkKey] || now > this.moveTraitCooldowns[frostWalkKey]) {
                if (Math.random() < 0.03) {
                    this.moveTraitCooldowns[frostWalkKey] = now + 500; // 0.5秒冷却
                    if (this.gameInstance) {
                        this.gameInstance.addEquipmentEffect('freeze_ring', this.x, this.y, { radius: 55, duration: 400 });
                        const targetsFrost = this.gameInstance.getCurrentSceneTargets();
                        // 确保lastMoveX和lastMoveY已初始化
                        if (this.lastMoveX === undefined) this.lastMoveX = this.x;
                        if (this.lastMoveY === undefined) this.lastMoveY = this.y;
                        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
                            const distSq = dx * dx + dy * dy;
                            if (distSq > 0.001) {
                                targetsFrost.forEach(m => {
                                    const alive = isCombatTargetAliveForEquipmentProc(m);
                                    if (alive) {
                                        const dx2 = m.x - this.lastMoveX;
                                        const dy2 = m.y - this.lastMoveY;
                                        const distToPath = Math.abs(dx2 * dy - dy2 * dx) / Math.sqrt(distSq);
                                        if (distToPath <= 40 && Math.abs(dx2 * dx + dy2 * dy) >= 0) {
                                            if (m instanceof TrainingDummy || m instanceof MonsterTrainingDummy) {
                                                m.addStatusEffect('frozen', { duration: 1500 });
                                            } else {
                                                m.frozenUntil = now + 1500;
                                            }
                                            if (this.gameInstance) {
                                                this.gameInstance.addFloatingText(m.x, m.y, '冰冻!', '#00ffff', 2000, 18, true);
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // 迅雷闪步词条：移动时有4%概率触发闪电（对周围敌人造成伤害）
        const thunderStepKey = 'thunder_step';
        if (traitIdsIncludeBase(traitIds, 'thunder_step')) {
            if (!this.moveTraitCooldowns[thunderStepKey] || now > this.moveTraitCooldowns[thunderStepKey]) {
                if (Math.random() < 0.04) {
                    this.moveTraitCooldowns[thunderStepKey] = now + 500;
                    // 播放感电音效
                    if (this.gameInstance && this.gameInstance.soundManager) {
                        this.gameInstance.soundManager.playSound('shock');
                    }
                    if (this.gameInstance) {
                        this.gameInstance.addEquipmentEffect('lightning_chain', this.x, this.y, { radius: 75, duration: 350 });
                    }
                    const thunderDamage = Math.floor(this.baseAttack * 0.65);
                    if (this.gameInstance) {
                        const targetsStep = this.gameInstance.getCurrentSceneTargets();
                        targetsStep.forEach(m => {
                            const alive = isCombatTargetAliveForEquipmentProc(m);
                            if (alive) {
                                const dx = m.x - this.x;
                                const dy = m.y - this.y;
                                const distance = Math.sqrt(dx * dx + dy * dy);
                                if (distance <= 75) {
                                    this.damageMonsterFromEnvironment(m, thunderDamage);
                                    if (this.gameInstance) {
                                        this.gameInstance.addFloatingText(m.x, m.y, `闪电! ${thunderDamage}`, '#00ffff', 2000, 18, true);
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
        
        // 更新移动记录
        this.lastMoveTime = now;
        this.lastMoveX = this.x;
        this.lastMoveY = this.y;
        } catch (error) {
            console.error('处理移动词条效果出错:', error, error.stack);
            // 确保即使出错也能继续游戏
            // 确保lastMoveX和lastMoveY被正确初始化，避免后续错误
            if (this.lastMoveX === undefined) this.lastMoveX = this.x;
            if (this.lastMoveY === undefined) this.lastMoveY = this.y;
        }
    }
    
    /**
     * 处理受到伤害时的词条效果
     * @param {number} damage - 原始伤害
     * @param {Monster} attacker - 攻击者（如果有）
     * @param {boolean} isCrit - 是否暴击
     * @returns {number} 修改后的伤害值
     */
    processDefenseTraits(damage, attacker = null, isCrit = false) {
        try {
            const traitIds = this.getEquipmentTraitIds();
            const now = Date.now();
        
        // 坚韧词条：受到伤害时，有10%概率恢复生命值（斑驳铁剑，仅当前武器）
        if (traitIdBase(this.getCurrentWeaponTraitId()) === 'toughness' && Math.random() < 0.1) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('heal_aura', this.x, this.y, { radius: 28, duration: 350 });
            }
            const healAmount = Math.floor(this.maxHp * 0.05);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `坚韧! +${healAmount}`, '#00ff00');
            }
        }
        
        // 永恒神威词条（胸甲）：受到伤害时提升20%防御力，持续5秒
        if (traitIdsIncludeBase(traitIds, 'eternal_divine') && damage > 0) {
            this.buffs.push({
                effects: { defense: Math.floor(this.baseDefense * 0.2) },
                expireTime: now + 5000
            });
            this.updateStats();
        }
        
        // 极星护佑词条：受到伤害时，有15%概率恢复5%最大生命值（抗性体现）
        if (traitIdsIncludeBase(traitIds, 'star_guard') && Math.random() < 0.15) {
            const healAmount = Math.floor(this.maxHp * 0.05);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `极星! +${healAmount}`, '#00ff00');
            }
        }
        
        // 古朴词条：受到暴击时，有12%概率使该次暴击伤害减半（不再完全免疫）
        if (isCrit && traitIdsIncludeBase(traitIds, 'ancient') && Math.random() < 0.12) {
            damage = Math.floor(damage * 0.5);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '古朴格挡', '#ffff88');
            }
        }
        
        // 龙息战盔词条：受到攻击时，有15%概率对攻击者造成火焰伤害
        if (attacker && traitIdsIncludeBase(traitIds, 'dragon_breath_helmet') && Math.random() < 0.15) {
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('small_fire_breath', attacker.x, attacker.y, { radius: 40, duration: 380 });
            }
            const fireDamage = Math.floor(this.baseAttack * 0.5);
            attacker.takeDamage(fireDamage);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(attacker.x, attacker.y, `龙息! ${fireDamage}`, '#ff4400', 2000, 18, true);
            }
        }
        
        // 苦行词条：受到伤害时，有5%概率恢复生命值
        if (traitIdsIncludeBase(traitIds, 'ascetic') && Math.random() < 0.05) {
            const healAmount = Math.floor(this.maxHp * 0.1);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `苦行! +${healAmount}`, '#00ff00');
            }
        }
        
        // 斑驳词条：受到攻击时有10%概率反弹伤害
        if (attacker && traitIdsIncludeBase(traitIds, 'mottled') && Math.random() < 0.1) {
            const reflectDamage = Math.floor(damage * 0.3);
            attacker.takeDamage(reflectDamage);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(attacker.x, attacker.y, `反弹! ${reflectDamage}`, '#ffaa00', 2000, 18, true);
            }
        }
        
        // 荆棘词条：受到近战攻击时，反弹20%伤害（降低反弹伤害比例）
        if (attacker && traitIdsIncludeBase(traitIds, 'thorn')) {
            const reflectDamage = Math.floor(damage * 0.1); // 从20%降低到10%
            attacker.takeDamage(reflectDamage);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(attacker.x, attacker.y, `荆棘! ${reflectDamage}`, '#ffaa00', 2000, 18, true);
            }
        }
        
        // 锁链词条：受到攻击时，有15%概率降低攻击者攻击速度
        if (attacker && traitIdsIncludeBase(traitIds, 'chain') && Math.random() < 0.15) {
            if (!attacker.attackSpeedDebuffs) attacker.attackSpeedDebuffs = [];
            attacker.attackSpeedDebuffs.push({
                multiplier: 0.85,
                expireTime: now + 3000
            });
        }
        
        // 逆鳞龙铠：致命一击时，90 秒冷却内至多一次，15% 概率将该次伤害压至不超过最大生命 12%（不再无敌）
        if (traitIdsIncludeBase(traitIds, 'reverse_scale_armor') && this.hp - damage <= 0) {
            const cooldownKey = 'reverse_scale_armor_cooldown';
            if (!this.traitCooldowns[cooldownKey] || now > this.traitCooldowns[cooldownKey]) {
                if (Math.random() < 0.15) {
                    this.traitCooldowns[cooldownKey] = now + 90000;
                    const cap = Math.max(1, Math.floor(this.maxHp * 0.12));
                    if (damage > cap) damage = cap;
                    if (this.gameInstance) {
                        this.gameInstance.addFloatingText(this.x, this.y, '逆鳞卸劲', '#ff88ff');
                    }
                }
            }
        }
        
        // 晶化内衬甲词条：受到伤害时，有25%概率将伤害降低50%
        if (traitIdsIncludeBase(traitIds, 'crystal_chest') && Math.random() < 0.25) {
            damage = Math.floor(damage * 0.5);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '晶化减伤!', '#00ffff');
            }
        }
        
        // 熔岩重铠词条：受到攻击时，对周围敌人造成持续火焰伤害（降低触发频率和伤害）
        if (attacker && traitIdsIncludeBase(traitIds, 'lava')) {
            const lavaKey = 'lava_cooldown';
            if (!this.traitCooldowns[lavaKey] || now > this.traitCooldowns[lavaKey]) {
                if (Math.random() < 0.3) { // 30%概率触发
                    this.traitCooldowns[lavaKey] = now + 2000; // 2秒冷却
                    if (this.gameInstance) {
                        const lavaTargets = this.gameInstance.getCurrentSceneTargets();
                        lavaTargets.forEach(m => {
                            if (m === attacker || !isCombatTargetAliveForEquipmentProc(m)) return;
                                const dx = m.x - this.x;
                                const dy = m.y - this.y;
                                if (Math.sqrt(dx * dx + dy * dy) <= 70) {
                                    const dps = Math.floor(this.baseAttack * 0.08);
                                    if (m instanceof TrainingDummy && m.addStatusEffect) {
                                        m.addStatusEffect('burning', { damage: dps, duration: 2000 });
                                    } else {
                                        if (!m.burningDots) m.burningDots = [];
                                        m.burningDots.push({
                                            damagePerSecond: dps,
                                            duration: 2000,
                                            startTime: now,
                                            lastTick: now
                                        });
                                    }
                                }
                        });
                    }
                }
            }
        }
        
        // 凛风冰衣词条：受到攻击时，有30%概率冰冻攻击者（仅对怪物生效，避免误伤玩家对象）
        if (attacker instanceof Monster && traitIdsIncludeBase(traitIds, 'cold_wind') && Math.random() < 0.3) {
            attacker.frozenUntil = now + 1000;
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(attacker.x, attacker.y, '冰冻!', '#00ffff', 2000, 18, true);
            }
        }
        
        // 绝尘霜盔词条：受到攻击时，有25%概率降低攻击者移动速度
        if (attacker && traitIdsIncludeBase(traitIds, 'frost_helmet') && Math.random() < 0.25) {
            if (!attacker.slowEffects) attacker.slowEffects = [];
            attacker.slowEffects.push({
                multiplier: 0.7,
                expireTime: now + 2000
            });
        }
        
        // 晶化词条（头盔）：受到伤害时，有20%概率将30%伤害转化为生命值恢复
        if (traitIdsIncludeBase(traitIds, 'crystal_helmet') && Math.random() < 0.2) {
            const healAmount = Math.floor(damage * 0.3);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            damage = Math.floor(damage * 0.7);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `晶化恢复! +${healAmount}`, '#00ff00');
            }
        }
        
        // 纯银吊坠词条：受到伤害时，有10%概率恢复生命值
        if (traitIdsIncludeBase(traitIds, 'silver') && Math.random() < 0.1) {
            const healAmount = Math.floor(this.maxHp * 0.05);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `纯银! +${healAmount}`, '#00ff00');
            }
        }
        
        // 神威头盔：概率减伤（不再完全免疫）
        if (traitIdsIncludeBase(traitIds, 'divine_helmet') && Math.random() < 0.12) {
            damage = Math.floor(damage * 0.62);
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('divine_shield', this.x, this.y, {
                    radius: 40,
                    duration: 400
                });
                this.gameInstance.addFloatingText(this.x, this.y, '神威护壳', '#ffff88');
            }
        }
        
        // 龙鳞护甲词条：受到攻击时有30%概率反弹50%伤害，并恢复反弹伤害50%的生命值
        if (attacker && traitIdsIncludeBase(traitIds, 'dragon_scale') && Math.random() < 0.3) {
            const reflectDamage = Math.floor(damage * 0.5);
            attacker.takeDamage(reflectDamage);
            const healAmount = Math.floor(reflectDamage * 0.5);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('reflect_shield', this.x, this.y, {
                    radius: 50,
                    duration: 400
                });
                this.gameInstance.addFloatingText(attacker.x, attacker.y, `龙鳞反弹! ${reflectDamage}`, '#ffaa00', 2000, 18, true);
                this.gameInstance.addFloatingText(this.x, this.y, `恢复! +${healAmount}`, '#00ff00');
            }
        }
        
        // 秘银战甲词条：受到伤害时有35%概率将伤害降低60%，并提升10%攻击力，持续5秒
        if (traitIdsIncludeBase(traitIds, 'mithril_armor') && Math.random() < 0.35) {
            damage = Math.floor(damage * 0.4);
            this.buffs.push({
                effects: { attack: Math.floor(this.baseAttack * 0.1) },
                expireTime: now + 5000
            });
            this.updateStats();
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('mithril_shield', this.x, this.y, {
                    radius: 45,
                    duration: 500
                });
                this.gameInstance.addFloatingText(this.x, this.y, '秘银减伤!', '#00ffff');
            }
        }
        
        // 永恒战甲词条：受到伤害时提升30%防御力
        if (traitIdsIncludeBase(traitIds, 'eternal_armor')) {
            this.buffs.push({
                effects: { defense: Math.floor(this.baseDefense * 0.3) },
                expireTime: now + 3000
            });
            this.updateStats();
            // 添加恢复光环特效（在update中每秒触发）
            if (this.gameInstance && Math.random() < 0.1) { // 降低频率，避免特效过多
                this.gameInstance.addEquipmentEffect('heal_aura', this.x, this.y, {
                    radius: 30,
                    duration: 300
                });
            }
        }
        
        // 铁卫护腿词条：受到攻击时，有15%概率提升防御力
        if (traitIdsIncludeBase(traitIds, 'iron_guard') && Math.random() < 0.15) {
            this.buffs.push({
                effects: { defense: Math.floor(this.baseDefense * 0.2) },
                expireTime: now + 5000
            });
            this.updateStats();
        }
        
        // 硬革皮靴词条：受到攻击时，有10%概率提升移动速度
        if (traitIdsIncludeBase(traitIds, 'hard_leather') && Math.random() < 0.1) {
            this.buffs.push({
                effects: { moveSpeed: 15 },
                expireTime: now + 3000
            });
            this.updateStats();
        }
        
        // 琉璃晶胫词条：受到伤害时，有20%概率将伤害转化为护盾（这里简化为减伤）
        if (traitIdsIncludeBase(traitIds, 'glazed') && Math.random() < 0.2) {
            damage = Math.floor(damage * 0.5);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '护盾!', '#00ffff');
            }
        }
        
        // 晶纹饰带词条：受到伤害时，有20%概率将伤害降低30%
        if (traitIdsIncludeBase(traitIds, 'crystal_pattern') && Math.random() < 0.2) {
            damage = Math.floor(damage * 0.7);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '晶纹减伤!', '#00ffff');
            }
        }
        
        // 极地词条：受到攻击时，有25%概率降低攻击者攻击速度
        if (attacker && traitIdsIncludeBase(traitIds, 'winter') && Math.random() < 0.25) {
            if (!attacker.attackSpeedDebuffs) attacker.attackSpeedDebuffs = [];
            attacker.attackSpeedDebuffs.push({
                multiplier: 0.7,
                expireTime: now + 3000
            });
        }
        
        // 神威冠冕：受击时低概率减伤（移除锁血）
        if (traitIdsIncludeBase(traitIds, 'divine_crown') && Math.random() < 0.06) {
            damage = Math.floor(damage * 0.78);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '神威护体', '#ddaaff');
            }
        }
        
        // 诸神眷顾：受击时小幅减伤（移除致命免疫）
        if (traitIdsIncludeBase(traitIds, 'divine_favor') && Math.random() < 0.06) {
            damage = Math.floor(damage * 0.82);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '眷顾', '#ffffaa');
            }
        }
        
        // 天庭之束：概率减伤，不再完全免疫
        if (traitIdsIncludeBase(traitIds, 'celestial') && Math.random() < 0.1) {
            damage = Math.floor(damage * 0.65);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '天束减伤', '#ffff88');
            }
        }
        
        // 律法圣带：概率减伤，不再完全免疫
        if (traitIdsIncludeBase(traitIds, 'law') && Math.random() < 0.1) {
            damage = Math.floor(damage * 0.72);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, '律法', '#eeeeaa');
            }
        }

        // ---------- 恶魔塔深阶·防具受击（四段机制带 deepTraitBand + 独立特效） ----------
        const voidDefBand = (base) => (typeof deepTraitBand === 'function' ? deepTraitBand(voidTraitTierFromList(traitIds, base)) : 0);

        if (traitIdsIncludeBase(traitIds, 'void_h_aegis') && damage > 0 && Math.random() < Math.min(0.92, ((8 + voidTraitTierFromList(traitIds, 'void_h_aegis')) / 100) * (1 + 0.03 * voidDefBand('void_h_aegis')))) {
            const ta = voidTraitTierFromList(traitIds, 'void_h_aegis');
            const ab = voidDefBand('void_h_aegis');
            const cut = (4 + 0.35 * ta) / 100;
            const after = Math.floor(damage * (1 - cut));
            const absorbed = damage - after;
            damage = after;
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, ab >= 1 ? '反盾' : '虚盾', '#aaaaff', 900, 14, true);
            }
            if (ab >= 1 && attacker && typeof attacker.takeDamage === 'function' && attacker.hp > 0 && absorbed > 0) {
                const rf = Math.max(1, Math.floor(absorbed * (0.12 + 0.04 * ab)));
                attacker.takeDamage(rf);
                if (this.gameInstance) this.gameInstance.addFloatingText(attacker.x, attacker.y, `反噬 ${rf}`, '#9999ff', 900, 12, true);
            }
            if (ab >= 2) {
                this.buffs.push({ effects: { defense: Math.floor(this.baseDefense * (0.04 + 0.02 * ab)) }, expireTime: now + 3500 });
                this.updateStats();
            }
            if (ab >= 3 && attacker) {
                if (!attacker.slowEffects) attacker.slowEffects = [];
                attacker.slowEffects.push({ multiplier: 0.88, expireTime: now + 2000 });
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_h_bastion') && damage > 0 && Math.random() < Math.min(0.92, ((10 + voidTraitTierFromList(traitIds, 'void_h_bastion')) / 100) * (1 + 0.03 * voidDefBand('void_h_bastion')))) {
            const tb = voidTraitTierFromList(traitIds, 'void_h_bastion');
            const bb = voidDefBand('void_h_bastion');
            this.buffs.push({
                effects: { defense: Math.floor(this.baseDefense * (8 + 0.7 * tb) / 100) },
                expireTime: now + 3600 + 120 * tb + (bb >= 2 ? 800 : 0)
            });
            if (bb >= 1) {
                const hh = Math.floor(this.maxHp * (0.008 + 0.004 * bb));
                if (hh > 0) this.hp = Math.min(this.maxHp, this.hp + hh);
            }
            if (bb >= 2) {
                this.buffs.push({ effects: { attackSpeed: Math.floor(this.baseAttackSpeed * 0.05) }, expireTime: now + 4000 });
            }
            this.updateStats();
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, bb >= 3 ? '震垒' : '固守', '#8888cc', 1200, 14, true);
                if (bb >= 3) {
                    const qd = Math.floor(this.baseAttack * (0.22 + 0.03 * tb));
                    this.gameInstance.getCurrentSceneTargets().forEach(m => {
                        if (m.hp <= 0) return;
                        const dx = m.x - this.x;
                        const dy = m.y - this.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 110) {
                            this.damageMonsterFromEnvironment(m, qd);
                            this.gameInstance.addFloatingText(m.x, m.y, `垒震 ${qd}`, '#aaaadd', 1400, 13, true);
                        }
                    });
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_h_pulse') && damage > 0 && Math.random() < Math.min(0.92, ((6 + voidTraitTierFromList(traitIds, 'void_h_pulse')) / 100) * (1 + 0.035 * voidDefBand('void_h_pulse')))) {
            const tp = voidTraitTierFromList(traitIds, 'void_h_pulse');
            const pb = voidDefBand('void_h_pulse');
            let hh = Math.floor(this.maxHp * (1.8 + 0.22 * tp) / 100);
            if (pb >= 2) hh = Math.floor(hh * 1.45);
            if (hh > 0) {
                this.hp = Math.min(this.maxHp, this.hp + hh);
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(this.x, this.y, pb >= 1 ? `链脉 +${hh}` : `脉动 +${hh}`, '#99ffcc');
                }
            }
            if (pb >= 1) {
                this.buffs.push({ effects: { moveSpeed: 8 + 2 * pb }, expireTime: now + 2800 });
                this.updateStats();
            }
            if (pb >= 3 && this.gameInstance) {
                const ed = Math.floor(this.baseAttack * (0.18 + 0.02 * tp));
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m.hp <= 0) return;
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 95) {
                        this.damageMonsterFromEnvironment(m, ed);
                        this.gameInstance.addFloatingText(m.x, m.y, `溢脉 ${ed}`, '#88ffdd', 1300, 12, true);
                    }
                });
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_h_mirror') && damage > 0 && attacker && typeof attacker.takeDamage === 'function' && attacker.hp > 0 && Math.random() < Math.min(0.92, ((7 + voidTraitTierFromList(traitIds, 'void_h_mirror')) / 100) * (1 + 0.03 * voidDefBand('void_h_mirror')))) {
            const tm = voidTraitTierFromList(traitIds, 'void_h_mirror');
            const mb = voidDefBand('void_h_mirror');
            let rd = Math.floor(this.baseAttack * (28 + 2 * tm) / 100);
            if (mb >= 3) rd = Math.floor(rd * 1.2);
            if (rd > 0) {
                attacker.takeDamage(rd);
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(attacker.x, attacker.y, `折光 ${rd}`, '#ccccff', 1600, 15, true);
                }
                if (mb >= 1) {
                    const lh = Math.floor(rd * (0.35 + 0.1 * mb));
                    if (lh > 0) this.hp = Math.min(this.maxHp, this.hp + lh);
                }
                if (mb >= 2 && this.gameInstance) {
                    const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== attacker && m.hp > 0);
                    const near = others.filter(m => {
                        const dx = m.x - attacker.x;
                        const dy = m.y - attacker.y;
                        return Math.sqrt(dx * dx + dy * dy) <= 100;
                    });
                    if (near.length) {
                        const t2 = near[Math.floor(Math.random() * near.length)];
                        const rd2 = Math.floor(rd * 0.42);
                        if (rd2 > 0) {
                            this.damageMonsterFromEnvironment(t2, rd2);
                            this.gameInstance.addFloatingText(t2.x, t2.y, `双折 ${rd2}`, '#ddeeff', 1400, 13, true);
                        }
                    }
                }
                if (mb >= 3 && attacker.frozenUntil !== undefined) {
                    attacker.frozenUntil = Math.max(attacker.frozenUntil || 0, now + 280);
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_h_last') && damage > 0) {
            const tl = voidTraitTierFromList(traitIds, 'void_h_last');
            const lb = voidDefBand('void_h_last');
            if (this.hp - damage < this.maxHp * (23 - 0.4 * tl) / 100) {
                const ck = 'void_h_last_cd';
                if (!this.traitCooldowns[ck] || now > this.traitCooldowns[ck]) {
                    if (Math.random() < Math.min(0.95, ((10 + tl) / 100) * (1 + 0.025 * lb))) {
                        damage = Math.floor(damage * 0.5);
                        this.traitCooldowns[ck] = now + 30000 - 1500 * tl;
                        if (lb >= 1) this.invincibleUntil = Math.max(this.invincibleUntil || 0, now + 120 + 40 * lb);
                        if (lb >= 2) {
                            const rh = Math.floor(this.maxHp * (0.015 + 0.005 * lb));
                            if (rh > 0) this.hp = Math.min(this.maxHp, this.hp + rh);
                        }
                        if (this.gameInstance) {
                            this.gameInstance.addFloatingText(this.x, this.y, lb >= 3 ? '墟照' : '残照', '#ffccff', 1400, 16, true);
                            if (lb >= 3) {
                                const ud = Math.floor(this.baseAttack * (0.3 + 0.03 * tl));
                                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                                    if (m.hp <= 0) return;
                                    const dx = m.x - this.x;
                                    const dy = m.y - this.y;
                                    if (Math.sqrt(dx * dx + dy * dy) <= 125) {
                                        this.damageMonsterFromEnvironment(m, ud);
                                        this.gameInstance.addFloatingText(m.x, m.y, `照破 ${ud}`, '#ffddff', 1500, 13, true);
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_c_spike') && damage > 0 && attacker && typeof attacker.takeDamage === 'function' && attacker.hp > 0 && Math.random() < Math.min(0.92, ((9 + voidTraitTierFromList(traitIds, 'void_c_spike')) / 100) * (1 + 0.03 * voidDefBand('void_c_spike')))) {
            const ts = voidTraitTierFromList(traitIds, 'void_c_spike');
            const sb = voidDefBand('void_c_spike');
            let sp = Math.max(1, Math.floor(damage * (7 + 0.6 * ts) / 100));
            if (sb >= 3) sp = Math.floor(sp * 1.35);
            attacker.takeDamage(sp);
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(attacker.x, attacker.y, sb >= 1 ? `血棘 ${sp}` : `棘反 ${sp}`, '#ffaa88', 1600, 14, true);
            }
            if (sb >= 1 && !attacker.burningDots) attacker.burningDots = [];
            if (sb >= 1) {
                attacker.burningDots.push({
                    damagePerSecond: Math.max(1, Math.floor(sp * 0.15)),
                    duration: 1500 + 400 * sb,
                    startTime: now,
                    lastTick: now
                });
            }
            if (sb >= 2 && this.gameInstance) {
                const others = this.gameInstance.getCurrentSceneTargets().filter(m => m !== attacker && m.hp > 0);
                const near = others.filter(m => {
                    const dx = m.x - attacker.x;
                    const dy = m.y - attacker.y;
                    return Math.sqrt(dx * dx + dy * dy) <= 95;
                });
                if (near.length) {
                    const t2 = near[Math.floor(Math.random() * near.length)];
                    const sp2 = Math.floor(sp * 0.5);
                    if (sp2 > 0) {
                        this.damageMonsterFromEnvironment(t2, sp2);
                        this.gameInstance.addFloatingText(t2.x, t2.y, `链棘 ${sp2}`, '#ffccaa', 1400, 13, true);
                    }
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_c_dampen') && damage > 16 + 2 * voidTraitTierFromList(traitIds, 'void_c_dampen') && Math.random() < Math.min(0.92, ((11 + voidTraitTierFromList(traitIds, 'void_c_dampen')) / 100) * (1 + 0.03 * voidDefBand('void_c_dampen')))) {
            const td = voidTraitTierFromList(traitIds, 'void_c_dampen');
            const db = voidDefBand('void_c_dampen');
            damage = Math.floor(damage * (90 - 0.9 * td) / 100);
            if (db >= 1) {
                const dh = Math.floor(this.maxHp * (0.012 + 0.004 * db));
                if (dh > 0) this.hp = Math.min(this.maxHp, this.hp + dh);
            }
            if (db >= 2 && attacker) {
                if (!attacker.slowEffects) attacker.slowEffects = [];
                attacker.slowEffects.push({ multiplier: 0.82, expireTime: now + 2200 });
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, db >= 3 ? '震缓' : '缓冲', '#aabbff', 1000, 13, true);
                if (db >= 3) {
                    const sh = Math.floor(this.baseAttack * (0.2 + 0.02 * td));
                    this.gameInstance.getCurrentSceneTargets().forEach(m => {
                        if (m.hp <= 0) return;
                        const dx = m.x - this.x;
                        const dy = m.y - this.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 100) {
                            this.damageMonsterFromEnvironment(m, sh);
                            this.gameInstance.addFloatingText(m.x, m.y, `缓震 ${sh}`, '#aaccff', 1300, 12, true);
                        }
                    });
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_c_echo') && damage > 0 && Math.random() < Math.min(0.92, ((7 + voidTraitTierFromList(traitIds, 'void_c_echo')) / 100) * (1 + 0.03 * voidDefBand('void_c_echo'))) && this.gameInstance) {
            const te = voidTraitTierFromList(traitIds, 'void_c_echo');
            const eb = voidDefBand('void_c_echo');
            let ed = Math.floor(this.baseAttack * (23 + 1.2 * te) / 100);
            const echoR = 95 + 5 * te;
            const dealEcho = (mult, tag) => {
                const d = Math.floor(ed * mult);
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m.hp <= 0) return;
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= echoR) {
                        this.damageMonsterFromEnvironment(m, d);
                        if (eb >= 1 && !m.slowEffects) m.slowEffects = [];
                        if (eb >= 1) {
                            if (!m.slowEffects) m.slowEffects = [];
                            m.slowEffects.push({ multiplier: 0.9, expireTime: now + 1500 });
                        }
                        this.gameInstance.addFloatingText(m.x, m.y, `${tag} ${d}`, '#bbaaff', 1600, 14, true);
                    }
                });
            };
            dealEcho(1, eb >= 2 ? '双响' : '回响');
            if (eb >= 2) dealEcho(0.55, '余震');
            if (eb >= 3) {
                const targets = this.gameInstance.getCurrentSceneTargets().filter(m => m.hp > 0);
                let closest = null;
                let best = 1e9;
                targets.forEach(m => {
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    const d = dx * dx + dy * dy;
                    if (d < best && d > 1) {
                        best = d;
                        closest = m;
                    }
                });
                if (closest) {
                    const ex = Math.floor(ed * 0.85);
                    this.damageMonsterFromEnvironment(closest, ex);
                    this.gameInstance.addFloatingText(closest.x, closest.y, `涡响 ${ex}`, '#ddd0ff', 1700, 15, true);
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_c_riposte') && damage > 0 && Math.random() < Math.min(0.92, ((6 + voidTraitTierFromList(traitIds, 'void_c_riposte')) / 100) * (1 + 0.03 * voidDefBand('void_c_riposte')))) {
            const trp = voidTraitTierFromList(traitIds, 'void_c_riposte');
            const rb = voidDefBand('void_c_riposte');
            let mul = 1 + (12 + 1.2 * trp) / 100;
            if (rb >= 2) mul *= 1.06;
            this.voidRiposteMul = mul;
            if (rb >= 1) {
                this.buffs.push({ effects: { moveSpeed: 10 + 3 * rb }, expireTime: now + 3200 });
                this.updateStats();
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, rb >= 3 ? '斩势' : '蓄势', '#ffddaa', 1200, 14, true);
                if (rb >= 3) {
                    const sd = Math.floor(this.baseAttack * (0.25 + 0.02 * trp));
                    this.gameInstance.getCurrentSceneTargets().forEach(m => {
                        if (m.hp <= 0) return;
                        const dx = m.x - this.x;
                        const dy = m.y - this.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 90) {
                            this.damageMonsterFromEnvironment(m, sd);
                            this.gameInstance.addFloatingText(m.x, m.y, `势斩 ${sd}`, '#ffeecc', 1400, 13, true);
                        }
                    });
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_c_bulwark') && damage > 0 && damage > this.maxHp * (16 - 0.9 * voidTraitTierFromList(traitIds, 'void_c_bulwark')) / 100 && Math.random() < Math.min(0.92, ((9 + voidTraitTierFromList(traitIds, 'void_c_bulwark')) / 100) * (1 + 0.03 * voidDefBand('void_c_bulwark')))) {
            const tbu = voidTraitTierFromList(traitIds, 'void_c_bulwark');
            const wb = voidDefBand('void_c_bulwark');
            damage = Math.floor(damage * (85 - 0.7 * tbu) / 100);
            if (wb >= 1) {
                const bh = Math.floor(this.maxHp * (0.018 + 0.006 * wb));
                if (bh > 0) this.hp = Math.min(this.maxHp, this.hp + bh);
            }
            if (wb >= 2 && attacker) {
                if (!attacker.attackSpeedDebuffs) attacker.attackSpeedDebuffs = [];
                attacker.attackSpeedDebuffs.push({ multiplier: 0.75, expireTime: now + 3500 });
            }
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, wb >= 3 ? '裂锚' : '重锚', '#8899dd', 1200, 14, true);
                if (wb >= 3) {
                    const gd = Math.floor(this.baseAttack * (0.28 + 0.03 * tbu));
                    this.gameInstance.getCurrentSceneTargets().forEach(m => {
                        if (m.hp <= 0) return;
                        const dx = m.x - this.x;
                        const dy = m.y - this.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 115) {
                            this.damageMonsterFromEnvironment(m, gd);
                            this.gameInstance.addFloatingText(m.x, m.y, `地裂 ${gd}`, '#99aadd', 1500, 13, true);
                        }
                    });
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_l_grit') && damage > 0 && Math.random() < Math.min(0.92, ((8 + voidTraitTierFromList(traitIds, 'void_l_grit')) / 100) * (1 + 0.03 * voidDefBand('void_l_grit')))) {
            const tg = voidTraitTierFromList(traitIds, 'void_l_grit');
            const gb = voidDefBand('void_l_grit');
            this.buffs.push({
                effects: { defense: Math.floor(this.baseDefense * (7.5 + 0.7 * tg) / 100) },
                expireTime: now + 4800 + 150 * tg + (gb >= 2 ? 600 : 0)
            });
            this.updateStats();
            if (gb >= 1 && attacker && typeof attacker.takeDamage === 'function' && attacker.hp > 0) {
                const th = Math.max(1, Math.floor(damage * (0.06 + 0.03 * gb)));
                attacker.takeDamage(th);
                if (this.gameInstance) this.gameInstance.addFloatingText(attacker.x, attacker.y, `刺胫 ${th}`, '#ccaa88', 1200, 12, true);
            }
            if (gb >= 3 && this.gameInstance) {
                const jd = Math.floor(this.baseAttack * (0.2 + 0.02 * tg));
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m.hp <= 0) return;
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 85) {
                        this.damageMonsterFromEnvironment(m, jd);
                        this.gameInstance.addFloatingText(m.x, m.y, `震胫 ${jd}`, '#ddbb99', 1300, 12, true);
                    }
                });
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_f_rush') && damage > 0 && Math.random() < Math.min(0.92, ((9 + voidTraitTierFromList(traitIds, 'void_f_rush')) / 100) * (1 + 0.03 * voidDefBand('void_f_rush')))) {
            const tfu = voidTraitTierFromList(traitIds, 'void_f_rush');
            const fb = voidDefBand('void_f_rush');
            const ms = Math.round(12 + tfu + (fb >= 2 ? 6 + 2 * fb : 0));
            this.buffs.push({
                effects: { moveSpeed: ms },
                expireTime: now + 1600 + 80 * tfu + (fb >= 2 ? 400 : 0)
            });
            if (fb >= 1) {
                this.buffs.push({ effects: { attackSpeed: Math.floor(this.baseAttackSpeed * (0.05 + 0.02 * fb)) }, expireTime: now + 3500 });
            }
            this.updateStats();
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, fb >= 3 ? '旋撤' : '疾撤', '#99ddff', 1200, 14, true);
                if (fb >= 3 && attacker && typeof attacker.takeDamage === 'function' && attacker.hp > 0) {
                    const kd = Math.floor(this.baseAttack * (0.24 + 0.02 * tfu));
                    attacker.takeDamage(kd);
                    this.gameInstance.addFloatingText(attacker.x, attacker.y, `旋踢 ${kd}`, '#ffddaa', 1400, 14, true);
                }
            }
        }
        
        return damage;
        } catch (error) {
            console.error('处理防御词条效果出错:', error);
            return damage; // 出错时返回原始伤害，避免完全免疫
        }
    }

    /**
     * 由足迹、移动词条、持续伤害等非普攻路径对怪物造成伤害；若击杀则结算奖励（与普攻一致）
     */
    damageMonsterFromEnvironment(monster, damage) {
        if (!monster || damage <= 0) return;
        damage = applyDeepExposeDamageBonus(monster, damage);
        const isDummy = monster instanceof TrainingDummy || monster instanceof MonsterTrainingDummy;
        if (isDummy) {
            monster.takeDamage(damage);
            return;
        }
        if (monster.hp <= 0) return;
        const killed = monster.takeDamage(damage);
        if (damage > 0) this.applyLifeStealFromHit(Math.floor(damage));
        if (!killed || !this.gameInstance) return;
        this.processKillRewards([monster]);
    }
    
    /**
     * 处理击杀奖励（经验、金币、词条、套装、掉落），供近战与远程共用
     * @param {Array} killedMonsters - 被击杀的怪物列表
     */
    processKillRewards(killedMonsters) {
        if (!this.gameInstance) return;
        killedMonsters.forEach(monster => {
            if (this.gameInstance && typeof this.gameInstance.onMonsterSlain === 'function') {
                this.gameInstance.onMonsterSlain(monster);
            }
            const isBoss = monster instanceof Boss;
            if (isBoss) {
                if (this.gameInstance.onBossDefeated) this.gameInstance.onBossDefeated(monster);
                return;
            }
            this.gameInstance.gainExp(monster.expReward);
            this.gameInstance.gainGold(monster.goldReward);
            this.processKillTraits(monster);
            this.handleSetKillEffects(monster);
            this.gameInstance.addFloatingText(this.gameInstance.player.x, this.gameInstance.player.y, `+${monster.expReward} 经验`, '#00ff00');
            this.gameInstance.addFloatingText(this.gameInstance.player.x, this.gameInstance.player.y, `+${monster.goldReward} 金币`, '#ffd700');
            if (Math.random() < 0.3) {
                const allEquipments = generateEquipments();
                const tierLevels = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
                const M = monster.level;
                let availableLevels = tierLevels.filter(L => L <= M && L >= M - 22);
                if (!availableLevels.length) availableLevels = tierLevels.filter(L => L <= M);
                if (!availableLevels.length) availableLevels = [1];
                const levelEquipments = allEquipments.filter(eq => availableLevels.includes(eq.level) && !eq.isCrafted);
                if (levelEquipments.length > 0) {
                    const randomEq = levelEquipments[Math.floor(Math.random() * levelEquipments.length)];
                    const newEq = new Equipment({
                        id: randomEq.id,
                        name: randomEq.name,
                        slot: randomEq.slot,
                        weaponType: randomEq.weaponType,
                        quality: randomEq.quality,
                        level: randomEq.level,
                        stats: JSON.parse(JSON.stringify(randomEq.stats)),
                        refineLevel: 0
                    });
                    const dropAngle = Math.random() * Math.PI * 2;
                    const dropDistance = 20 + Math.random() * 40;
                    const dropX = monster.x + Math.cos(dropAngle) * dropDistance;
                    const dropY = monster.y + Math.sin(dropAngle) * dropDistance;
                    this.gameInstance.droppedItems.push(new DroppedItem(dropX, dropY, newEq, this.gameInstance));
                }
            }
        });
    }

    /**
     * 处理击杀时的词条效果
     * @param {Monster} monster - 被击杀的怪物
     */
    processKillTraits(monster) {
        const traitIds = this.getEquipmentTraitIds();
        const now = Date.now();
        
        // 神威头盔词条：击杀敌人后恢复15%最大生命值
        if (traitIdsIncludeBase(traitIds, 'divine_helmet')) {
            const healAmount = Math.floor(this.maxHp * 0.15);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            if (this.gameInstance) {
                this.gameInstance.addEquipmentEffect('heal_aura', this.x, this.y, {
                    radius: 40,
                    duration: 400
                });
                this.gameInstance.addFloatingText(this.x, this.y, `神威! +${healAmount}`, '#00ff00');
            }
        }
        
        // 坠星裁决词条：每次击杀恢复生命值并提升属性
        if (traitIdBase(this.getCurrentWeaponTraitId()) === 'starfall') {
            const healAmount = Math.floor(this.maxHp * 0.1);
            this.hp = Math.min(this.hp + healAmount, this.maxHp);
            this.buffs.push({
                effects: {
                    attack: Math.floor(this.baseAttack * 0.05),
                    defense: Math.floor(this.baseDefense * 0.05),
                    critRate: Math.floor(this.baseCritRate * 0.05),
                    critDamage: Math.floor(this.baseCritDamage * 0.05),
                    dodge: Math.floor(this.baseDodge * 0.05),
                    attackSpeed: Math.floor(this.baseAttackSpeed * 0.05),
                    moveSpeed: 5
                },
                expireTime: now + 10000
            });
            this.updateStats();
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, `星辰! +${healAmount}`, '#00ff00');
            }
        }
        
        // 焚天词条：击杀后攻击力提升，最多叠加5层
        if (traitIdBase(this.getCurrentWeaponTraitId()) === 'flame_burn') {
            if (!this.traitStacks['flame_burn']) this.traitStacks['flame_burn'] = 0;
            if (this.traitStacks['flame_burn'] < 5) {
                this.traitStacks['flame_burn']++;
                this.buffs.push({
                    effects: { attack: Math.floor(this.baseAttack * 0.05) },
                    expireTime: now + 30000 // 持续30秒
                });
                this.updateStats();
                if (this.gameInstance) {
                    this.gameInstance.addFloatingText(this.x, this.y, `焚天 ${this.traitStacks['flame_burn']}/5`, '#ff4400');
                }
            }
        }
        
        // 骁勇词条：击杀后攻击力提升，最多叠加3层
        if (traitIdsIncludeBase(traitIds, 'brave')) {
            if (!this.traitStacks['brave']) this.traitStacks['brave'] = 0;
            if (this.traitStacks['brave'] < 3) {
                this.traitStacks['brave']++;
                this.buffs.push({
                    effects: { attack: Math.floor(this.baseAttack * 0.03) },
                    expireTime: now + 20000
                });
                this.updateStats();
            }
        }
        
        // 猎手词条：攻击怪物时，有10%概率获得额外经验
        if (traitIdsIncludeBase(traitIds, 'hunter') && Math.random() < 0.1) {
            const extraExp = Math.floor(monster.expReward * 0.5);
            if (this.gameInstance) {
                this.gameInstance.gainExp(extraExp);
                this.gameInstance.addFloatingText(this.x, this.y, `额外经验! +${extraExp}`, '#00ff00');
            }
        }
        
        // 黄金契约词条：击杀后获得额外金币和经验
        if (traitIdsIncludeBase(traitIds, 'golden_contract')) {
            const extraGold = Math.floor(monster.goldReward * 0.3);
            const extraExp = Math.floor(monster.expReward * 0.3);
            if (this.gameInstance) {
                this.gameInstance.gainGold(extraGold);
                this.gameInstance.gainExp(extraExp);
                this.gameInstance.addFloatingText(this.x, this.y, `契约! +${extraGold}金 +${extraExp}经验`, '#ffd700');
            }
        }
        
        // 灰烬护足词条：击杀后移动速度提升
        if (traitIdsIncludeBase(traitIds, 'ash')) {
            this.buffs.push({
                effects: { moveSpeed: 10 },
                expireTime: now + 5000
            });
            this.updateStats();
        }
        
        // 岁月青铜词条：击杀后有10%概率获得额外经验
        if (traitIdsIncludeBase(traitIds, 'years') && Math.random() < 0.1) {
            const extraExp = Math.floor(monster.expReward * 0.4);
            if (this.gameInstance) {
                this.gameInstance.gainExp(extraExp);
                this.gameInstance.addFloatingText(this.x, this.y, `岁月! +${extraExp}`, '#00ff00');
            }
        }

        const killVoidBand = (base) => (typeof deepTraitBand === 'function' ? deepTraitBand(voidTraitTierFromList(traitIds, base)) : 0);

        if (traitIdsIncludeBase(traitIds, 'void_l_surge') && Math.random() < (15 + voidTraitTierFromList(traitIds, 'void_l_surge')) / 100) {
            const tls = voidTraitTierFromList(traitIds, 'void_l_surge');
            const kb = killVoidBand('void_l_surge');
            const ms = Math.round(18 + 1.2 * tls + (kb >= 2 ? 4 + 2 * kb : 0));
            const eff = { moveSpeed: ms };
            if (kb >= 1) eff.attackSpeed = Math.floor(this.baseAttackSpeed * (0.05 + 0.02 * kb));
            this.buffs.push({
                effects: eff,
                expireTime: now + 2700 + 120 * tls + (kb >= 2 ? 400 : 0)
            });
            this.updateStats();
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, kb >= 3 ? '猎潮' : '追猎', '#88ddff', 1200, 14, true);
                if (kb >= 3) {
                    const kd = Math.floor(this.baseAttack * (0.22 + 0.02 * tls));
                    this.gameInstance.getCurrentSceneTargets().forEach(m => {
                        if (m.hp <= 0) return;
                        const dx = m.x - monster.x;
                        const dy = m.y - monster.y;
                        if (Math.sqrt(dx * dx + dy * dy) <= 105) {
                            this.damageMonsterFromEnvironment(m, kd);
                            this.gameInstance.addFloatingText(m.x, m.y, `猎爆 ${kd}`, '#99eeff', 1300, 12, true);
                        }
                    });
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_l_strike') && Math.random() < (12 + voidTraitTierFromList(traitIds, 'void_l_strike')) / 100) {
            const tlk = voidTraitTierFromList(traitIds, 'void_l_strike');
            const sb = killVoidBand('void_l_strike');
            let atkPct = (10 + tlk) / 100;
            if (sb >= 3) atkPct *= 1.1;
            const eff = { attack: Math.floor(this.baseAttack * atkPct) };
            if (sb >= 1) eff.critRate = Math.floor(this.baseCritRate * (0.04 + 0.02 * sb));
            this.buffs.push({
                effects: eff,
                expireTime: now + 3600 + 120 * tlk + (sb >= 2 ? 500 : 0)
            });
            this.updateStats();
            if (sb >= 3 && this.gameInstance) {
                const sd = Math.floor(this.baseAttack * (0.18 + 0.02 * tlk));
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m.hp <= 0) return;
                    const dx = m.x - this.x;
                    const dy = m.y - this.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 95) {
                        this.damageMonsterFromEnvironment(m, sd);
                        this.gameInstance.addFloatingText(m.x, m.y, `斩环 ${sd}`, '#ffccaa', 1300, 12, true);
                    }
                });
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_f_chase') && Math.random() < (18 + voidTraitTierFromList(traitIds, 'void_f_chase')) / 100) {
            const tfc = voidTraitTierFromList(traitIds, 'void_f_chase');
            const cb = killVoidBand('void_f_chase');
            let mul = 1 + (15 + 1.1 * tfc) / 100;
            if (cb >= 2) mul *= 1 + 0.025 * cb;
            let dur = (5 + Math.floor(tfc / 4)) * 1000 + (cb >= 1 ? 400 + 200 * cb : 0);
            this.voidChaseStrike = { mul, until: now + dur };
            if (this.gameInstance) {
                this.gameInstance.addFloatingText(this.x, this.y, cb >= 3 ? '掠影' : '追影', '#ffdd99', 1200, 14, true);
            }
            if (cb >= 3) {
                this.buffs.push({ effects: { moveSpeed: 12 + 2 * cb }, expireTime: now + 3500 });
                this.updateStats();
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_f_surge') && Math.random() < (14 + voidTraitTierFromList(traitIds, 'void_f_surge')) / 100) {
            const tfs = voidTraitTierFromList(traitIds, 'void_f_surge');
            const fsb = killVoidBand('void_f_surge');
            const eff = {
                attack: Math.floor(this.baseAttack * (12 + tfs) / 100),
                attackSpeed: fsb >= 1 ? Math.floor(this.baseAttackSpeed * (0.045 + 0.015 * fsb)) : 0
            };
            if (!eff.attackSpeed) delete eff.attackSpeed;
            this.buffs.push({
                effects: eff,
                expireTime: now + 3200 + 120 * tfs + (fsb >= 2 ? 450 : 0)
            });
            this.updateStats();
            if (fsb >= 3) {
                const rh = Math.floor(this.maxHp * (0.012 + 0.004 * tfs));
                if (rh > 0) {
                    this.hp = Math.min(this.maxHp, this.hp + rh);
                    if (this.gameInstance) this.gameInstance.addFloatingText(this.x, this.y, `涌愈 +${rh}`, '#ffeecc', 1100, 12, true);
                }
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_r_greed') && Math.random() < (6 + voidTraitTierFromList(traitIds, 'void_r_greed')) / 100 && this.gameInstance) {
            const tgr = voidTraitTierFromList(traitIds, 'void_r_greed');
            const gb = killVoidBand('void_r_greed');
            let glo = 9 + 2 * tgr + (gb >= 1 ? 2 + gb : 0);
            let ghi = 16 + 2 * tgr + (gb >= 2 ? 4 + 2 * gb : 0);
            if (gb >= 3) ghi += 6;
            const gg = glo + Math.floor(Math.random() * (ghi - glo + 1));
            this.gameInstance.gainGold(gg);
            this.gameInstance.addFloatingText(this.x, this.y, gb >= 2 ? `深噬 +${gg}金` : `贪噬 +${gg}金`, '#ffd700');
            if (gb >= 3 && monster.type && String(monster.type).includes('_elite') && Math.random() < 0.35) {
                const eg = 5 + tgr;
                this.gameInstance.gainGold(eg);
                this.gameInstance.addFloatingText(this.x, this.y, `爵赏 +${eg}`, '#ffee88', 1200, 13, true);
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_g_tithe') && Math.random() < (9 + voidTraitTierFromList(traitIds, 'void_g_tithe')) / 100 && this.gameInstance) {
            const tgt = voidTraitTierFromList(traitIds, 'void_g_tithe');
            const tb = killVoidBand('void_g_tithe');
            let lo = 8 + 2 * tgt;
            let hi = 17 + 2 * tgt;
            if (tb >= 2) {
                lo += 2 + tb;
                hi += 4 + tb;
            }
            let g = lo + Math.floor(Math.random() * (hi - lo + 1));
            this.gameInstance.gainGold(g);
            this.gameInstance.addFloatingText(this.x, this.y, tb >= 1 ? `深课 +${g}` : `课金 +${g}`, '#ffd700');
            if (tb >= 3 && Math.random() < 0.22) {
                const g2 = 4 + tgt;
                this.gameInstance.gainGold(g2);
                this.gameInstance.addFloatingText(this.x, this.y, `再课 +${g2}`, '#fff0aa', 1000, 11, true);
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_g_elite') && this.gameInstance && monster.type && String(monster.type).includes('_elite')) {
            const tge = voidTraitTierFromList(traitIds, 'void_g_elite');
            const eb = killVoidBand('void_g_elite');
            let ge = 12 + 2 * tge + (eb >= 1 ? 2 + 2 * eb : 0);
            if (eb >= 3) ge = Math.floor(ge * 1.12);
            this.gameInstance.gainGold(ge);
            this.gameInstance.addFloatingText(this.x, this.y, eb >= 2 ? `深爵 +${ge}金` : `猎爵 +${ge}金`, '#ffdd44');
            if (eb >= 3 && this.gameInstance) {
                const splash = Math.max(1, Math.floor(ge * 0.25));
                this.gameInstance.getCurrentSceneTargets().forEach(m => {
                    if (m.hp <= 0 || m === monster) return;
                    const dx = m.x - monster.x;
                    const dy = m.y - monster.y;
                    if (Math.sqrt(dx * dx + dy * dy) <= 90) {
                        this.damageMonsterFromEnvironment(m, splash);
                        this.gameInstance.addFloatingText(m.x, m.y, `爵压 ${splash}`, '#ffeeaa', 1200, 11, true);
                    }
                });
            }
        }

        if (traitIdsIncludeBase(traitIds, 'void_g_fortune') && Math.random() < (6 + voidTraitTierFromList(traitIds, 'void_g_fortune')) / 100 && this.gameInstance) {
            const tf = voidTraitTierFromList(traitIds, 'void_g_fortune');
            const fb = killVoidBand('void_g_fortune');
            this.gameInstance.gainGold(monster.goldReward);
            this.gameInstance.addFloatingText(this.x, this.y, fb >= 2 ? '洪运!' : '洪福!', '#fff0aa');
            if (fb >= 1 && Math.random() < 0.35 + 0.08 * fb) {
                const eg = Math.floor(monster.goldReward * (0.12 + 0.06 * fb));
                if (eg > 0) {
                    this.gameInstance.gainGold(eg);
                    this.gameInstance.addFloatingText(this.x, this.y, `余财 +${eg}`, '#ffe8aa', 1100, 12, true);
                }
            }
            if (fb >= 3 && this.gameInstance.gainExp) {
                const ex = Math.floor(monster.expReward * 0.15);
                if (ex > 0) {
                    this.gameInstance.gainExp(ex);
                    this.gameInstance.addFloatingText(this.x, this.y, `洪慧 +${ex}`, '#aaffcc', 1100, 12, true);
                }
            }
        }
    }

    /**
     * 近战普攻剑气外沿半径（与 draw 中圆弧一致）
     * @returns {number}
     */
    meleeSlashArcRadius() {
        return this.size / 2 + 20;
    }

    /**
     * 检查点是否在剑气扇形内：从角色中心到剑气特效弧外沿（与绘制同角度、同外径）
     * @param {number} x - 点的X坐标
     * @param {number} y - 点的Y坐标
     * @returns {boolean} 是否在剑气范围内
     */
    checkSlashRange(x, y) {
        if (this.slashStartTime === 0) return false;

        const dx = x - this.x;
        const dy = y - this.y;
        const distSq = dx * dx + dy * dy;
        const arcR = this.meleeSlashArcRadius();
        const outerSlop = 12; // 怪物体积中心略超出弧外沿时仍算命中
        const maxDist = arcR + outerSlop;
        if (distSq > maxDist * maxDist) return false;

        const PI = Math.PI;
        let angleDiff = Math.atan2(dy, dx) - this.slashAngle;
        while (angleDiff > PI) angleDiff -= 2 * PI;
        while (angleDiff < -PI) angleDiff += 2 * PI;
        // 与绘制一致：slashAngle ± π/6，共 60°
        return Math.abs(angleDiff) <= PI / 6;
    }

    draw(ctx) {
        const now = Date.now();
        const isInvincible = this.invincibleUntil && now < this.invincibleUntil;
        
        // 计算是否在移动
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const isMoving = speed > 0.1;
        
        // 更新移动方向（根据 vx 判断左右）
        if (isMoving) {
            if (this.vx > 0) {
                this.lastDirection = -1; // 向右（需要翻转，所以是 -1）
            } else if (this.vx < 0) {
                this.lastDirection = 1; // 向左（不需要翻转，所以是 1）
            }
            // 如果 vx 为 0，保持上次的方向
        }
        
        // 绘制冲刺重影（在玩家之前绘制，这样玩家会显示在重影上方）
        if (this.dashGhosts.length > 0 && this.playerGifLoaded && this.playerGifFrames.length > 0) {
            for (const ghost of this.dashGhosts) {
                ctx.save();
                
                // 应用重影透明度
                ctx.globalAlpha = ghost.alpha;
                
                // 根据重影的方向翻转图片
                if (ghost.lastDirection === -1) {
                    // 向右：水平翻转
                    ctx.translate(ghost.x, ghost.y);
                    ctx.scale(-1, 1);
                    ctx.translate(-ghost.x, -ghost.y);
                }
                
                // 绘制重影帧
                const ghostFrame = this.playerGifFrames[ghost.frameIndex];
                if (ghostFrame) {
                    const drawSize = this.playerGifSize;
                    ctx.drawImage(
                        ghostFrame,
                        ghost.x - drawSize / 2,
                        ghost.y - drawSize / 2,
                        drawSize,
                        drawSize
                    );
                }
                
                ctx.restore();
            }
        }
        
        // 绘制玩家（无敌时闪烁效果）
        if (isInvincible) {
            // 无敌时闪烁：每100ms切换一次透明度
            const blink = Math.floor(now / 100) % 2 === 0;
            ctx.globalAlpha = blink ? 0.5 : 1.0;
        }
        
        // 检查是否受伤
        const isHurt = this.hurtUntil && now < this.hurtUntil;
        
        // 如果 GIF 已加载，使用缓存的帧绘制
        if (this.playerGifLoaded && this.playerGifFrames.length > 0) {
            ctx.save();
            
            // 应用受伤变红效果（优先于冲刺亮度效果）
            if (isHurt) {
                // 受伤时变红：使用红色色调滤镜
                // 计算红色强度（随时间衰减）
                const hurtElapsed = now - (this.hurtUntil - 500);
                const hurtProgress = Math.min(1.0, hurtElapsed / 500); // 0到1，1表示完全恢复
                // 红色强度从1.0衰减到0
                const redIntensity = 1.0 - hurtProgress;
                // 使用红色色调滤镜：增加饱和度，提高亮度，调整色相偏向红色
                ctx.filter = `saturate(${1.0 + redIntensity * 2.0}) brightness(${1.0 + redIntensity * 0.8}) hue-rotate(${-redIntensity * 20}deg)`;
            } else if (this.dashBrightness > 0) {
                // 应用冲刺时的亮度效果（渐变）
                // brightness(1.0) = 正常，brightness(2.0) = 最亮（白色）
                const brightnessValue = 1.0 + this.dashBrightness; // 从1.0到2.0
                ctx.filter = `brightness(${brightnessValue})`;
            }
            
            // 应用冲刺时的垂直压缩效果（上下压缩）
            // compression从0到1，1表示最大压缩（压缩到0.7倍高度）
            if (this.dashCompression > 0) {
                const compressionScale = 1.0 - (this.dashCompression * 0.3); // 从1.0压缩到0.7
                ctx.translate(this.x, this.y);
                ctx.scale(1, compressionScale); // 只压缩Y轴
                ctx.translate(-this.x, -this.y);
            }
            
            // 根据移动方向翻转图片
            if (this.lastDirection === -1) {
                // 向左：水平翻转
                ctx.translate(this.x, this.y);
                ctx.scale(-1, 1);
                ctx.translate(-this.x, -this.y);
            }
            
            // 如果正在移动，更新当前帧索引（按帧延迟循环播放）
            // 如果静止，显示第一帧
            if (isMoving) {
                const currentTime = Date.now();
                if (this.playerGifDelays.length > 0 && this.currentFrameIndex < this.playerGifDelays.length) {
                    const frameDelay = this.playerGifDelays[this.currentFrameIndex] || 100;
                    if (currentTime - this.lastFrameTime >= frameDelay) {
                        this.currentFrameIndex = (this.currentFrameIndex + 1) % this.playerGifFrames.length;
                        this.lastFrameTime = currentTime;
                    }
                }
            } else {
                // 静止时恢复到第一帧
                this.currentFrameIndex = 0;
            }
            
            // 绘制当前帧
            const currentFrame = this.playerGifFrames[this.currentFrameIndex];
            if (currentFrame) {
                const drawSize = this.playerGifSize;
                ctx.drawImage(
                    currentFrame,
                    this.x - drawSize / 2,
                    this.y - drawSize / 2,
                    drawSize,
                    drawSize
                );
            }
            
            ctx.restore();
        } else {
            // 回退：绘制默认圆形（放大）
            ctx.save();
            
            // 应用受伤变红效果（优先于冲刺亮度效果）
            if (isHurt) {
                // 受伤时变红：使用红色色调滤镜
                // 计算红色强度（随时间衰减）
                const hurtElapsed = now - (this.hurtUntil - 500);
                const hurtProgress = Math.min(1.0, hurtElapsed / 500); // 0到1，1表示完全恢复
                // 红色强度从1.0衰减到0
                const redIntensity = 1.0 - hurtProgress;
                // 使用红色色调滤镜：增加饱和度，提高亮度，调整色相偏向红色
                ctx.filter = `saturate(${1.0 + redIntensity * 2.0}) brightness(${1.0 + redIntensity * 0.8}) hue-rotate(${-redIntensity * 20}deg)`;
            } else if (this.dashBrightness > 0) {
                // 应用冲刺时的亮度效果（渐变）
                const brightnessValue = 1.0 + this.dashBrightness; // 从1.0到2.0
                ctx.filter = `brightness(${brightnessValue})`;
            }
            
            // 应用冲刺时的垂直压缩效果（上下压缩）
            if (this.dashCompression > 0) {
                const compressionScale = 1.0 - (this.dashCompression * 0.3); // 从1.0压缩到0.7
                ctx.translate(this.x, this.y);
                ctx.scale(1, compressionScale); // 只压缩Y轴
                ctx.translate(-this.x, -this.y);
            }
            
            // 受伤时改变圆形颜色为亮红色，否则使用默认蓝色
            if (isHurt) {
                const hurtElapsed = now - (this.hurtUntil - 500);
                const hurtProgress = Math.min(1.0, hurtElapsed / 500);
                const redIntensity = 1.0 - hurtProgress;
                // 从亮红色渐变回蓝色（更亮的红色）
                const r = Math.floor(255 * redIntensity + 187 * (1 - redIntensity));
                const g = Math.floor(50 * redIntensity + 187 * (1 - redIntensity));
                const b = Math.floor(50 * redIntensity + 255 * (1 - redIntensity));
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            } else {
                ctx.fillStyle = '#00bbff';
            }
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.playerGifSize / 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // 无敌时绘制金色边框
        if (isInvincible) {
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.playerGifSize / 2 + 2, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1.0; // 恢复透明度
        
        // 绘制剑气圆弧（仅近战武器；远程武器不绘制剑气）
        if (!isPlayerWeaponRanged(this.equipment.weapon) && this.slashStartTime > 0) {
            const slashElapsed = now - this.slashStartTime;
            const slashDuration = 200; // 剑气持续时间200毫秒
            
            if (slashElapsed < slashDuration) {
                ctx.save();
                
                // 计算透明度（逐渐淡出）
                const fadeProgress = slashElapsed / slashDuration;
                ctx.globalAlpha = 1.0 - fadeProgress;
                
                // 绘制圆弧（像素加宽）；半径与 checkSlashRange / meleeSlashArcRadius 一致
                const arcRadius = this.meleeSlashArcRadius();
                const arcStartAngle = this.slashAngle - Math.PI / 6; // 起始角度（右侧，60度范围）
                const arcEndAngle = this.slashAngle + Math.PI / 6; // 结束角度（左侧，60度范围）
                const arcSegments = 40; // 圆弧分段数（保持40，不增加平滑度）
                
                ctx.fillStyle = '#ffffff'; // 白色剑气
                
                // 计算当前应该显示到哪个位置（顺时针出现）
                const appearProgress = Math.min(1.0, slashElapsed / (slashDuration * 0.6)); // 前60%时间用于出现
                const visibleSegments = Math.floor(arcSegments * appearProgress);
                
                // 绘制圆弧（顺时针一点一点出现，从起点粗到终点细）
                for (let i = 0; i < visibleSegments; i++) {
                    const progress = i / (arcSegments - 1); // 0到1，从起点到终点
                    const angle = arcStartAngle + (arcEndAngle - arcStartAngle) * progress;
                    
                    // 计算宽度（先粗后细：起点粗，终点细，整体加宽）
                    const width = Math.max(2, 8 * (1 - progress)); // 起点最粗（8像素），终点最细（2像素）
                    
                    // 计算位置
                    const x = this.x + Math.cos(angle) * arcRadius;
                    const y = this.y + Math.sin(angle) * arcRadius;
                    
                    // 绘制像素方块（像素风格）
                    const pixelSize = Math.floor(width);
                    ctx.fillRect(
                        Math.floor(x) - Math.floor(pixelSize / 2),
                        Math.floor(y) - Math.floor(pixelSize / 2),
                        pixelSize,
                        pixelSize
                    );
                }
                
                ctx.restore();
            } else {
                // 剑气结束，重置
                this.slashStartTime = 0;
            }
        }
        
        // 绘制朝向（可选，如果 GIF 已经显示方向，可以注释掉）
        // ctx.strokeStyle = '#ffffff';
        // ctx.lineWidth = 3;
        // ctx.beginPath();
        // ctx.moveTo(this.x, this.y);
        // ctx.lineTo(
        //     this.x + Math.cos(this.angle) * (this.size / 2 + 5),
        //     this.y + Math.sin(this.angle) * (this.size / 2 + 5)
        // );
        // ctx.stroke();
    }
}
