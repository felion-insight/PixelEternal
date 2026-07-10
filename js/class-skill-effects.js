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
        if (buff.holyShieldStacks > 0) return 'divineProtection';
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
        if (buff.holyShieldStacks > 0) {
            parts.push(`圣盾 ${buff.holyShieldStacks}/${buff.stackMax || 3}`);
        }
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

    function isInFrontArc(px, py, facing, tx, ty, halfArcRad) {
        let diff = Math.atan2(ty - py, tx - px) - facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) <= halfArcRad;
    }

    function isBehindPlayer(px, py, facing, tx, ty) {
        const dx = tx - px;
        const dy = ty - py;
        return Math.cos(facing) * dx + Math.sin(facing) * dy < -8;
    }

    function clearRaiseShield(player) {
        if (!player) return;
        player._raiseShield = null;
        player.buffs = (player.buffs || []).filter(b => !b._raiseShieldTag);
    }

    function performShieldCounter(player, skillDef, se, gameInstance, monsters, now) {
        const range = se.counterRange || 80;
        const half = (se.counterHalfAngleDeg || 55) * Math.PI / 180;
        const mult = se.counterDamageMultiplier || 1.2;
        const stunMs = se.counterStunMs || 1000;
        const baseAtk = typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(player) : (player.baseAttack || 10);
        const dmg = Math.max(1, Math.floor(baseAtk * mult));
        let hits = 0;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            const dx = m.x - player.x;
            const dy = m.y - player.y;
            if (Math.hypot(dx, dy) > range) return;
            let diff = Math.atan2(dy, dx) - player.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) <= half) {
                hits++;
                if (typeof player.damageMonsterFromEnvironment === 'function') {
                    player.damageMonsterFromEnvironment(m, dmg);
                }
                applyStun(m, stunMs);
            }
        });
        floatText(gameInstance, player.x, player.y - 24, hits > 0 ? '盾击反击!' : '盾击', '#ddaa22');
        equipFx(gameInstance, 'mithril_shield', player.x, player.y, { radius: 68, duration: 420 });
        if (typeof window.playClassSkillVfx === 'function') {
            window.playClassSkillVfx(player, skillDef, gameInstance, {
                hit: hits > 0, hitTargets: [], instantShape: 'cone', defensive: true
            });
        }
        return hits > 0;
    }

    window.pickNearestAllyTarget = function pickNearestAllyTarget(player, gameInstance, range) {
        if (!player || !gameInstance || !gameInstance._skillEntities) return null;
        let best = null;
        let bestD = Infinity;
        (gameInstance._skillEntities.summons || []).forEach(s => {
            if (!s || s.owner !== player || s.hp <= 0) return;
            const d = Math.hypot(s.x - player.x, s.y - player.y);
            if (d <= range && d < bestD) { bestD = d; best = s; }
        });
        return best;
    };

    window.applyRaiseShieldBlock = function applyRaiseShieldBlock(player, amount, attacker) {
        if (!player || !attacker || amount <= 0) return amount;
        const rs = player._raiseShield;
        if (!rs || Date.now() >= rs.expireTime) return amount;
        const halfRad = ((rs.blockArcDeg || 120) * 0.5) * Math.PI / 180;
        const ax = attacker.x != null ? attacker.x : player.x;
        const ay = attacker.y != null ? attacker.y : player.y;
        if (!isInFrontArc(player.x, player.y, player.angle, ax, ay, halfRad)) return amount;
        const pct = Math.min(80, rs.blockPercent || 40);
        const reduced = amount * (1 - pct / 100);
        if (player.gameInstance && reduced < amount) {
            floatText(player.gameInstance, player.x, player.y - 44, '格挡', '#ffee88');
        }
        return Math.max(0, reduced);
    };

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
        if (!monster || ms <= 0) return;
        if (typeof window.applyMonsterStun === 'function') {
            window.applyMonsterStun(monster, ms);
        }
    }

    const HOLY_SHIELD_BUFF_ID = 'holy_shield_stacks';

    function findHolyShieldBuff(player) {
        if (!player || !player.buffs) return null;
        return player.buffs.find(b => b.id === HOLY_SHIELD_BUFF_ID && b.expireTime > Date.now()) || null;
    }

    window.getHolyShieldStacks = function getHolyShieldStacks(player) {
        const buff = findHolyShieldBuff(player);
        return buff ? (buff.holyShieldStacks || 0) : 0;
    };

    window.grantHolyShieldStacks = function grantHolyShieldStacks(player, amount, opts) {
        if (!player || amount <= 0) return 0;
        opts = opts || {};
        const now = Date.now();
        const stackMax = opts.stackMax || 3;
        const pct = opts.absorbPercentPerStack || 5;
        player.buffs = player.buffs || [];
        let buff = findHolyShieldBuff(player);
        if (!buff) {
            buff = {
                id: HOLY_SHIELD_BUFF_ID,
                name: '圣盾',
                expireTime: now + (opts.durationMs || 300000),
                holyShieldStacks: 0,
                stackMax,
                absorbPercentPerStack: pct,
                hudVisible: true,
                effects: {}
            };
            player.buffs.push(buff);
        }
        buff.holyShieldStacks = Math.min(stackMax, (buff.holyShieldStacks || 0) + amount);
        buff.stackMax = stackMax;
        buff.absorbPercentPerStack = pct;
        buff.expireTime = Math.max(buff.expireTime, now + (opts.durationMs || 300000));
        return buff.holyShieldStacks;
    };

    window.consumeHolyShieldStack = function consumeHolyShieldStack(player, count) {
        if (!player || count <= 0) return false;
        const buff = findHolyShieldBuff(player);
        if (!buff || buff.holyShieldStacks <= 0) return false;
        buff.holyShieldStacks = Math.max(0, buff.holyShieldStacks - count);
        if (buff.holyShieldStacks <= 0) {
            player.buffs = player.buffs.filter(b => b.id !== HOLY_SHIELD_BUFF_ID);
        }
        return true;
    };

    window.updateHolyLightFields = function updateHolyLightFields(gameInstance, now) {
        const p = gameInstance && gameInstance.player;
        if (!p || !p._holyLightField) return;
        const f = p._holyLightField;
        if (now >= f.expireTime) {
            p._holyLightField = null;
            return;
        }
        f.x = p.x;
        f.y = p.y;
        if (now - f.lastConsumeTime >= 1000) {
            f.lastConsumeTime = now;
            const had = window.getHolyShieldStacks(p);
            if (had <= 0 || !window.consumeHolyShieldStack(p, f.consumePerSec || 1)) {
                f.expireTime = now;
                floatText(gameInstance, p.x, p.y - 32, '圣盾耗尽', '#ffaa44');
                p._holyLightField = null;
                return;
            }
        }
        p.invincibleUntil = Math.max(p.invincibleUntil || 0, now + 200);
    };

    window.updateClassSkillTransformEffects = function updateClassSkillTransformEffects(gameInstance, now) {
        const p = gameInstance && gameInstance.player;
        if (!p) return;
        if (p._damageRedirectField) {
            const f = p._damageRedirectField;
            if (now >= f.expireTime) {
                p._damageRedirectField = null;
            } else {
                f.x = p.x;
                f.y = p.y;
                if (f.healAllyPerSecPercent > 0 && now - (f.lastHealTick || 0) >= 1000) {
                    f.lastHealTick = now;
                    const heal = Math.max(1, Math.floor(p.maxHp * f.healAllyPerSecPercent / 100));
                    p.hp = Math.min(p.maxHp, p.hp + heal);
                }
            }
        }
        if (p._raiseShield && now >= p._raiseShield.expireTime) {
            clearRaiseShield(p);
            if (typeof p.updateStats === 'function') p.updateStats();
        }
        if (p._divineBastion) {
            if (now >= p._divineBastion.expireTime) {
                p._divineBastion = null;
            } else if (gameInstance && gameInstance._skillEntities) {
                if (now - (p._divineBastion.lastTick || 0) >= 1000) {
                    p._divineBastion.lastTick = now;
                    const db = p._divineBastion;
                    (gameInstance._skillEntities.summons || []).forEach(s => {
                        if (!s || s.owner !== p || s.hp <= 0) return;
                        if (Math.hypot(s.x - p.x, s.y - p.y) > (db.allyBehindRange || 160)) return;
                        if (!isBehindPlayer(p.x, p.y, p.angle, s.x, s.y)) return;
                        s._guardDrPercent = db.allyBehindDr || 25;
                        s._guardShieldUntil = now + 1200;
                        if (db.allyHealPerSecPercent > 0) {
                            const heal = Math.max(1, Math.floor(p.maxHp * db.allyHealPerSecPercent / 100));
                            s.hp = Math.min((s.maxHp || s.hp) + heal, s.hp + heal);
                        }
                    });
                }
            }
        }
        if (p._sacredBond && now >= p._sacredBond.expireTime) {
            const t = p._sacredBond.target;
            if (t) {
                delete t._sacredBondGuardian;
                delete t._sacredBondUntil;
                if (t._sacredBondBaseAttack != null) {
                    t.attack = t._sacredBondBaseAttack;
                    delete t._sacredBondBaseAttack;
                }
                delete t._sacredBondAttackPct;
            }
            p._sacredBond = null;
        }
        const drain = p._transformHpDrain;
        if (!drain || now >= drain.until) {
            if (drain && now >= drain.until) {
                p._transformHpDrain = null;
                p._transformBasicRangeMult = null;
                p._transformSizeMult = null;
                p._transformLifeStealPercent = null;
            }
            return;
        }
        if (now - drain.lastTick >= 1000) {
            drain.lastTick = now;
            const loss = Math.max(1, Math.floor(p.maxHp * drain.perSec / 100));
            if (p.hp - loss > 1) {
                p.hp -= loss;
            } else {
                p.hp = 1;
            }
        }
    };

    function applyMark(monster, se, skillDef, now) {
        if (!monster) return;
        window.applyClassSkillMarkOnMonster(monster, {
            durationMs: se.durationMs || 8000,
            damageBonus: se.damageBonus || 15,
            critBonus: se.critBonus || 0,
            markId: skillDef && skillDef.id
        }, skillDef, now);
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

    window.getClassSkillMarkBonus = function getClassSkillMarkBonus(monster, skillDef) {
        if (!monster || !monster._classSkillMark) return { mult: 1, crit: 0, windMult: 1, critDmg: 0 };
        if (monster._classSkillMark.expireTime <= Date.now()) {
            monster._classSkillMark = null;
            return { mult: 1, crit: 0, windMult: 1, critDmg: 0 };
        }
        const mark = monster._classSkillMark;
        let mult = 1 + (mark.damageBonus || 0) / 100;
        let windMult = 1;
        const windBonus = mark.windDamageBonus || 0;
        if (windBonus > 0 && typeof window.isWindMarkBonusSkill === 'function'
            && window.isWindMarkBonusSkill(skillDef)) {
            windMult = 1 + windBonus / 100;
            mult *= windMult;
        }
        return { mult, windMult, crit: mark.critBonus || 0, critDmg: mark.critDmgBonus || 0 };
    };

    function markVisualStyle(mark) {
        const id = (mark && mark.markId) || '';
        if (id.includes('weakness_mark_de') || id.includes('death_mark')) {
            return { stroke: '#ff3322', glow: '#ff1100', core: '#ff8866', label: '弱', badge: '#ff4422' };
        }
        if (id.includes('weakness')) {
            return { stroke: '#ffdd22', glow: '#ccaa00', core: '#fff4aa', label: '弱', badge: '#ffcc00' };
        }
        if (id.includes('hunting')) {
            return { stroke: '#ff8844', glow: '#dd6622', core: '#ffe8cc', label: '令', badge: '#ff8833' };
        }
        if (id.includes('phantom_mark') || id.includes('phantom')) {
            return { stroke: '#9944cc', glow: '#6622aa', core: '#eeccff', label: '影', badge: '#9944dd' };
        }
        if (id.includes('wind_mark') || id.includes('wind')) {
            return { stroke: '#44ddcc', glow: '#22aa99', core: '#e8fffa', label: '风', badge: '#33ddcc' };
        }
        return { stroke: '#ffcc44', glow: '#ddaa22', core: '#fff8cc', label: '猎', badge: '#ffaa33' };
    }

    window.applyClassSkillMarkOnMonster = function applyClassSkillMarkOnMonster(monster, opts, skillDef, now) {
        if (!monster || !opts) return;
        const t = now != null ? now : Date.now();
        const duration = opts.durationMs || 8000;
        monster._classSkillMark = {
            expireTime: t + duration,
            appliedTime: t,
            durationMs: duration,
            damageBonus: opts.damageBonus != null ? opts.damageBonus : 15,
            critBonus: opts.critBonus || 0,
            critDmgBonus: opts.critDmgBonus || 0,
            windDamageBonus: opts.windDamageBonus || 0,
            ownerDamageBonus: opts.ownerDamageBonus,
            ownerCritDmgBonus: opts.ownerCritDmgBonus,
            executeThreshold: opts.executeThreshold,
            executeMultiplier: opts.executeMultiplier,
            name: (skillDef && skillDef.name) || opts.name || '标记',
            markId: (skillDef && skillDef.id) || opts.markId || 'hunters_mark',
            owner: opts.owner || null,
            petDamageBonus: opts.petDamageBonus || 0,
            phantomEchoDamageBonus: opts.phantomEchoDamageBonus || 0,
            phantomConfuseChance: opts.phantomConfuseChance || 0,
            phantomConfuseRadius: opts.phantomConfuseRadius || 0
        };
    };

    /** 猎人印记等 — 怪物身上标记视觉 */
    window.drawClassSkillMarkOverlay = function drawClassSkillMarkOverlay(ctx, monster, now) {
        if (!ctx || !monster || !monster._classSkillMark) return;
        const mark = monster._classSkillMark;
        const t = now != null ? now : Date.now();
        if (mark.expireTime <= t) {
            monster._classSkillMark = null;
            return;
        }
        const x = monster.x;
        const y = monster.y;
        const size = monster.size || 32;
        const style = markVisualStyle(mark);
        const total = mark.durationMs || 8000;
        const left = mark.expireTime - t;
        const ratio = Math.max(0, Math.min(1, left / total));
        const pulse = 1 + Math.sin(t / 160) * 0.08;
        const r = size / 2 + 8 + (1 - ratio) * 2;
        const rot = t / 900;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + ratio * 0.12;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * pulse * 1.5);
        glow.addColorStop(0, style.glow);
        glow.addColorStop(0.5, style.stroke);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * pulse * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.globalAlpha = 0.85 + Math.sin(t / 200) * 0.1;
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.strokeStyle = style.core;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.75 * ratio;
        const arm = r * 0.55;
        for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * arm * 0.35, Math.sin(a) * arm * 0.35);
            ctx.lineTo(Math.cos(a) * arm, Math.sin(a) * arm);
            ctx.stroke();
        }
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, arm * 0.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const badgeY = y - size / 2 - 14;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#332200';
        ctx.lineWidth = 3;
        ctx.strokeText(style.label, x, badgeY);
        ctx.fillStyle = style.badge;
        ctx.fillText(style.label, x, badgeY);

        const barW = size * 0.7;
        const barH = 3;
        const barX = x - barW / 2;
        const barY = y + size / 2 + 6;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = style.stroke;
        ctx.fillRect(barX, barY, barW * ratio, barH);

        ctx.restore();
    };

    window.applyClassSkillPrimaryEffect = function applyClassSkillPrimaryEffect(player, skillDef, gameInstance, now, ctx) {
        if (!player || !skillDef) return false;
        const se = skillDef.skillEffect || {};
        const g = gameInstance;
        const enh = cfgEnhBonus(player, skillDef);
        const buffId = 'skill_' + skillDef.id;

        if (typeof window.applySageSkillPrimary === 'function') {
            const sageOk = window.applySageSkillPrimary(player, skillDef, g, now, ctx);
            if (sageOk) return true;
        }
        if (typeof window.applyWarlockSkillPrimary === 'function') {
            const warOk = window.applyWarlockSkillPrimary(player, skillDef, g, now, ctx);
            if (warOk) return true;
        }
        if (se.type === 'elemental_liberation' || se.type === 'meteor_liberation') {
            if (typeof window.applyElementalLiberationEffect === 'function') {
                return window.applyElementalLiberationEffect(player, skillDef, g, now);
            }
        }

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
            case 'invincible_field': {
                const stacks = window.getHolyShieldStacks(player);
                if (stacks <= 0) {
                    floatText(g, player.x, player.y - 20, '需要圣盾层数', '#ff6666');
                    return false;
                }
                const radius = se.fieldRadius || skillDef.aoeRadius || 150;
                const dur = se.durationMs || 8000;
                player._holyLightField = {
                    expireTime: now + dur,
                    radius,
                    lastConsumeTime: now,
                    consumePerSec: se.consumeShieldPerSec || 1,
                    x: player.x,
                    y: player.y
                };
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + dur,
                    effects: {},
                    hudVisible: true
                });
                floatText(g, player.x, player.y - 28, `圣光领域 · ${Math.ceil(dur / 1000)}s`, '#66ddff');
                equipFx(g, 'holy_blast', player.x, player.y, { radius, duration: 700 });
                return true;
            }
            case 'transform': {
                const effects = {};
                if (se.attackPercent) effects.attackPercent = Math.floor(se.attackPercent * enh);
                if (se.attackSpeedPercent) effects.attackSpeedPercent = Math.floor(se.attackSpeedPercent * enh);
                if (se.defensePenalty) effects.defensePenalty = se.defensePenalty;
                const dur = se.durationMs || 10000;
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + dur,
                    effects,
                    hudVisible: true
                });
                if (se.basicAttackRangeMult) player._transformBasicRangeMult = se.basicAttackRangeMult;
                if (se.sizeMult) player._transformSizeMult = se.sizeMult;
                if (se.lifeStealPercent) player._transformLifeStealPercent = se.lifeStealPercent;
                if (se.hpDrainPerSec) {
                    player._transformHpDrain = {
                        perSec: se.hpDrainPerSec,
                        until: now + dur,
                        lastTick: now
                    };
                }
                floatText(g, player.x, player.y - 28, `${skillDef.name} · ${Math.ceil(dur / 1000)}s`, '#ff8844');
                equipFx(g, 'fire_explosion', player.x, player.y, { radius: 52, duration: 520 });
                return true;
            }
            case 'destruction_form': {
                const dur = se.durationMs || 10000;
                const effects = { attackPercent: Math.floor((se.attackPercent || 60) * enh) };
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + dur,
                    effects,
                    hudVisible: true
                });
                if (se.sizeMult) player._transformSizeMult = se.sizeMult;
                player._chargeSuperArmor = true;
                player._destructionForm = {
                    expireTime: now + dur,
                    lastPulse: now,
                    pulseIntervalMs: se.pulseIntervalMs || 800,
                    pulseRadius: se.pulseRadius || 160,
                    pulseDamageMult: se.pulseDamageMult != null ? se.pulseDamageMult : 1.0,
                    markPerPulse: se.markPerPulse || 1,
                    finalDetonateMult: se.finalDetonateMult != null ? se.finalDetonateMult : 0.6,
                    ccImmune: se.ccImmune !== false,
                    healToFullOnEnd: !!se.healToFullOnEnd,
                    skillDef
                };
                if (typeof player.updateStats === 'function') player.updateStats();
                floatText(g, player.x, player.y - 28, `毁灭形态 · ${Math.ceil(dur / 1000)}s`, '#ff2200');
                equipFx(g, 'fire_explosion', player.x, player.y, { radius: 72, duration: 620 });
                return true;
            }
            case 'damage_redirect':
            case 'sacred_sacrifice': {
                const dur = se.durationMs || 8000;
                const radius = skillDef.aoeRadius || se.fieldRadius || 150;
                player._damageRedirectField = {
                    expireTime: now + dur,
                    redirectPercent: se.redirectPercent || 50,
                    selfDrPercent: se.selfDrPercent || 80,
                    radius,
                    x: player.x,
                    y: player.y,
                    allyReviveOnDeath: se.allyReviveOnDeath || 0,
                    revivesUsed: 0,
                    reviveInvincibleMs: se.reviveInvincibleMs || 0,
                    endRetaliationRadius: se.endRetaliationRadius,
                    endRetaliationDmgRatio: se.endRetaliationDmgRatio
                };
                const dr = Math.min(90, Math.floor((se.selfDrPercent || 80) * enh));
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + dur,
                    effects: { damageReduction: dr },
                    hudVisible: true
                });
                floatText(g, player.x, player.y - 28, `${skillDef.name} · ${Math.ceil(dur / 1000)}s`, '#ddaa22');
                equipFx(g, 'divine_shield', player.x, player.y, { radius, duration: 700 });
                return true;
            }
            case 'raise_shield': {
                if (player._raiseShield && player._raiseShield.expireTime > now && player._raiseShield.canCounter) {
                    clearRaiseShield(player);
                    if (typeof player.updateStats === 'function') player.updateStats();
                    return performShieldCounter(player, skillDef, se, g, ctx && ctx.monsters, now);
                }
                clearRaiseShield(player);
                const dur = se.durationMs || 4000;
                const blockPct = Math.min(55, Math.floor((se.blockPercent || 40) * enh));
                player._raiseShield = {
                    expireTime: now + dur,
                    blockArcDeg: se.blockArcDeg || 120,
                    blockPercent: blockPct,
                    canCounter: true,
                    canMove: se.canMove !== false,
                    skillDefId: skillDef.id
                };
                pushBuff(player, {
                    name: skillDef.name + '·格挡',
                    id: buffId,
                    expireTime: now + dur,
                    effects: {},
                    hudVisible: true,
                    _raiseShieldTag: true,
                    iconKey: 'defense'
                });
                floatText(g, player.x, player.y - 24, `举盾 · 格挡${blockPct}%`, '#ddaa22');
                equipFx(g, 'mithril_shield', player.x, player.y, { radius: 54, duration: 520 });
                return true;
            }
            case 'divine_bastion': {
                clearRaiseShield(player);
                const dur = se.durationMs || 6000;
                const blockPct = Math.min(60, Math.floor((se.blockPercent || 50) * enh));
                player._raiseShield = {
                    expireTime: now + dur,
                    blockArcDeg: 360,
                    blockPercent: blockPct,
                    canCounter: false,
                    skillDefId: skillDef.id
                };
                player._divineBastion = {
                    expireTime: now + dur,
                    allyBehindDr: se.allyBehindDr || 25,
                    allyHealPerSecPercent: se.allyHealPerSecPercent || 3,
                    allyBehindRange: se.allyBehindRange || 160,
                    lastTick: now
                };
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + dur,
                    effects: { damageReduction: Math.floor(blockPct * 0.3) },
                    hudVisible: true,
                    iconKey: 'defense'
                });
                floatText(g, player.x, player.y - 28, `神圣壁垒 · 格挡${blockPct}%`, '#ffee88');
                equipFx(g, 'divine_shield', player.x, player.y, { radius: 80, duration: 680 });
                return true;
            }
            case 'sacred_bond': {
                const range = se.range || skillDef.range || 200;
                const ally = (ctx && ctx.bondTarget)
                    || window.pickNearestAllyTarget(player, g, range);
                if (!ally) {
                    floatText(g, player.x, player.y, '无队友可链接', '#ff6666');
                    return false;
                }
                const dur = se.durationMs || 8000;
                const dr = Math.min(75, Math.floor((se.selfDrPercent || 60) * enh));
                player._sacredBond = {
                    expireTime: now + dur,
                    target: ally,
                    redirectPercent: se.redirectPercent || 50
                };
                pushBuff(player, {
                    name: skillDef.name,
                    id: buffId,
                    expireTime: now + dur,
                    effects: { damageReduction: dr },
                    hudVisible: true
                });
                ally._sacredBondGuardian = player;
                ally._sacredBondUntil = now + dur;
                ally._sacredBondAttackPct = Math.floor((se.allyAttackPercent || 25) * enh);
                if (ally.attack != null) {
                    ally._sacredBondBaseAttack = ally._sacredBondBaseAttack != null
                        ? ally._sacredBondBaseAttack : ally.attack;
                    ally.attack = Math.floor(ally._sacredBondBaseAttack * (1 + ally._sacredBondAttackPct / 100));
                }
                floatText(g, player.x, player.y - 28, `圣约 · 承伤${se.redirectPercent || 50}%`, '#ffee88');
                equipFx(g, 'divine_shield', (player.x + ally.x) * 0.5, (player.y + ally.y) * 0.5, { radius: 44, duration: 600 });
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
                if (typeof window.startPlayerBackstepShot === 'function') {
                    window.startPlayerBackstepShot(player, g, {
                        distance: dist,
                        durationMs: se.durationMs || 320,
                        peakHeight: se.peakHeight || 32,
                        angle: player.angle
                    }, now);
                } else {
                    blinkTo(player, g,
                        player.x - Math.cos(player.angle) * dist,
                        player.y - Math.sin(player.angle) * dist,
                        250);
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
                    dmg = Math.max(1, Math.floor(dmg * window.getClassSkillMarkBonus(target, skillDef).mult));
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
        return ['ice_armor', 'damage_reduction', 'shield', 'guard', 'taunt', 'heal', 'cleanse', 'invincible_field',
            'raise_shield', 'divine_bastion', 'sacred_bond', 'damage_redirect', 'sacred_sacrifice',
            'foresight_shield', 'purify_time', 'chrono_aura', 'sacred_rewind', 'time_field', 'fate_weave',
            'fate_reversal', 'time_rewind', 'agony_curse', 'life_drain', 'dark_harvest', 'spreading_curse',
            'soul_harvest', 'elemental_liberation', 'meteor_liberation'].includes(t);
    };
})();
