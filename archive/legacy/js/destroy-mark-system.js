/**
 * 毁灭印记 — 毁灭者核心机制
 * 最多 5 层，每层 -5% 有效防御（等效 +5% 受伤害）；满层自动爆发并眩晕
 */
(function () {
    'use strict';

    const MARK_MAX = 5;
    const DEF_PER_STACK = 5;
    const MARK_DURATION_MS = 12000;
    const AUTO_BURST_STUN_MS = 1200;
    const AUTO_BURST_DMG_MULT = 1.0;

    function floatText(g, x, y, text, color) {
        if (g && typeof g.addFloatingText === 'function') {
            g.addFloatingText(x, y, text, color || '#ff4422');
        }
    }

    function baseAtk(player) {
        return typeof window.getPlayerEffectiveAttack === 'function'
            ? window.getPlayerEffectiveAttack(player)
            : (player && player.baseAttack) || 10;
    }

    function applySkillDamage(monster, dmg, player, skillDef) {
        if (!monster || dmg <= 0) return 0;
        if (typeof window.getClassSkillMarkBonus === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getClassSkillMarkBonus(monster, skillDef).mult));
        }
        if (typeof window.getCombatStatusDamageMultiplier === 'function') {
            dmg = Math.max(1, Math.floor(dmg * window.getCombatStatusDamageMultiplier(monster)));
        }
        if (typeof window.getStrikerDamageBonus === 'function' && player) {
            dmg = Math.max(1, Math.floor(dmg * window.getStrikerDamageBonus(player, monster)));
        }
        if (typeof window.getBuildDamageMultiplier === 'function' && player) {
            dmg = Math.max(1, Math.floor(dmg * window.getBuildDamageMultiplier(player, monster, skillDef)));
        }
        const defRed = typeof window.getCombatStatusDefenseReduction === 'function'
            ? window.getCombatStatusDefenseReduction(monster) : 0;
        if (defRed > 0) dmg = Math.max(1, Math.floor(dmg * (1 + defRed / 100)));
        monster.takeDamage(dmg);
        return dmg;
    }

    window.getDestroyMarkStacks = function getDestroyMarkStacks(monster) {
        if (!monster || !monster._destroyMark) return 0;
        const now = Date.now();
        if (monster._destroyMark.expireTime <= now) {
            monster._destroyMark = null;
            return 0;
        }
        return monster._destroyMark.stacks || 0;
    };

    window.getDestroyMarkDamageMultiplier = function getDestroyMarkDamageMultiplier(monster) {
        const stacks = window.getDestroyMarkStacks(monster);
        if (stacks <= 0) return 1;
        return 1 + stacks * (DEF_PER_STACK / 100);
    };

    window.clearDestroyMark = function clearDestroyMark(monster) {
        if (monster) monster._destroyMark = null;
    };

    function triggerAutoBurst(monster, player, skillDef, gameInstance, now) {
        const atk = baseAtk(player);
        const dmg = Math.max(1, Math.floor(atk * AUTO_BURST_DMG_MULT));
        applySkillDamage(monster, dmg, player, skillDef);
        if (typeof window.applyMonsterStun === 'function') {
            window.applyMonsterStun(monster, AUTO_BURST_STUN_MS, now);
        }
        floatText(gameInstance, monster.x, monster.y - 18, '印记爆发!', '#ff2200');
        if (gameInstance && typeof gameInstance.addEquipmentEffect === 'function') {
            gameInstance.addEquipmentEffect('fire_explosion', monster.x, monster.y, {
                radius: 48, duration: 380
            });
        }
        if (typeof window.playClassSkillVfx === 'function' && player) {
            window.playClassSkillVfx(player, skillDef || { id: 'destroy_mark', name: '毁灭印记' }, gameInstance, {
                hitTargets: [monster],
                hit: true,
                destroyMarkBurst: true
            });
        }
        window.clearDestroyMark(monster);
    }

    window.applyDestroyMark = function applyDestroyMark(monster, amount, player, skillDef, gameInstance, opts) {
        if (!monster || !amount || amount <= 0 || monster.hp <= 0) return 0;
        const now = (opts && opts.now != null) ? opts.now : Date.now();
        const maxStacks = (opts && opts.maxStacks) || MARK_MAX;
        const gainBonus = player && typeof window.getSetModifier === 'function'
            ? window.getSetModifier(player, 'destroyMarkGain', 0) : 0;
        const addAmount = gainBonus > 0 ? Math.max(1, Math.ceil(amount * (1 + gainBonus))) : amount;
        let total = window.getDestroyMarkStacks(monster) + addAmount;

        while (total >= maxStacks) {
            monster._destroyMark = { stacks: maxStacks, expireTime: now + MARK_DURATION_MS };
            triggerAutoBurst(monster, player, skillDef, gameInstance, now);
            total -= maxStacks;
        }

        if (total > 0) {
            monster._destroyMark = { stacks: total, expireTime: now + MARK_DURATION_MS };
            floatText(gameInstance, monster.x, monster.y - 8, `印记 ${total}`, '#ff6644');
        } else {
            window.clearDestroyMark(monster);
        }

        if (opts && opts.teamMarkBonus) {
            monster._classSkillMark = {
                expireTime: now + MARK_DURATION_MS,
                damageBonus: opts.teamMarkBonus,
                critBonus: 0,
                name: skillDef && skillDef.name
            };
        }

        return total;
    };

    window.detonateDestroyMarks = function detonateDestroyMarks(monster, player, skillDef, gameInstance, multPerStack, now) {
        if (!monster || monster.hp <= 0) return 0;
        const stacks = window.getDestroyMarkStacks(monster);
        if (stacks <= 0) return 0;
        const t = now != null ? now : Date.now();
        const mult = multPerStack != null ? multPerStack : 0.3;
        const dmg = Math.max(1, Math.floor(baseAtk(player) * mult * stacks));
        applySkillDamage(monster, dmg, player, skillDef);
        window.clearDestroyMark(monster);
        floatText(gameInstance, monster.x, monster.y - 16, `引爆 ×${stacks}`, '#ffaa22');
        if (gameInstance && typeof gameInstance.addEquipmentEffect === 'function') {
            gameInstance.addEquipmentEffect('fire_explosion', monster.x, monster.y, {
                radius: 40 + stacks * 6, duration: 320
            });
        }
        return dmg;
    };

    window.detonateAllDestroyMarks = function detonateAllDestroyMarks(monsters, player, skillDef, gameInstance, multPerStack, now) {
        let total = 0;
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            total += window.detonateDestroyMarks(m, player, skillDef, gameInstance, multPerStack, now);
        });
        return total;
    };

    window.applySkillDestroyMarks = function applySkillDestroyMarks(player, monster, skillDef, stacks, gameInstance, opts) {
        if (!stacks || stacks <= 0) return;
        const o = opts || {};
        if (skillDef && skillDef.entityConfig && skillDef.entityConfig.teamMarkBonusPercent) {
            o.teamMarkBonus = skillDef.entityConfig.teamMarkBonusPercent;
        }
        window.applyDestroyMark(monster, stacks, player, skillDef, gameInstance, o);
    };

    /** 毁灭降临：脉冲冲击波 */
    window.pulseDestructionForm = function pulseDestructionForm(player, skillDef, gameInstance, monsters, cfg, now) {
        if (!player || !cfg) return;
        const radius = cfg.pulseRadius || cfg.range || 160;
        const mult = cfg.pulseDamageMult != null ? cfg.pulseDamageMult : 1.0;
        const markStacks = cfg.markPerPulse || 1;
        const dmg = Math.max(1, Math.floor(baseAtk(player) * mult));
        const hit = [];
        (monsters || []).forEach(m => {
            if (!m || m.hp <= 0) return;
            if (Math.hypot(m.x - player.x, m.y - player.y) <= radius) {
                applySkillDamage(m, dmg, player, skillDef);
                window.applySkillDestroyMarks(player, m, skillDef, markStacks, gameInstance, { now });
                hit.push(m);
            }
        });
        if (typeof window.playClassSkillVfx === 'function') {
            window.playClassSkillVfx(player, skillDef, gameInstance, {
                hitTargets: hit,
                hit: hit.length > 0,
                destructionPulse: true,
                aoeRadius: radius
            });
        }
        if (gameInstance && typeof gameInstance.addEquipmentEffect === 'function') {
            gameInstance.addEquipmentEffect('fire_explosion', player.x, player.y, {
                radius: radius * 0.65, duration: 360
            });
        }
    };

    window.updateDestructionForm = function updateDestructionForm(gameInstance, monsters, now) {
        const p = gameInstance && gameInstance.player;
        if (!p || !p._destructionForm) return;
        const f = p._destructionForm;
        if (now >= f.expireTime) {
            if (!f._finalBurst) {
                f._finalBurst = true;
                window.detonateAllDestroyMarks(monsters, p, f.skillDef, gameInstance, f.finalDetonateMult || 0.6, now);
                floatText(gameInstance, p.x, p.y - 36, '大地碎裂!', '#ff2200');
                if (gameInstance.addEquipmentEffect) {
                    gameInstance.addEquipmentEffect('fire_explosion', p.x, p.y, {
                        radius: f.pulseRadius || 160, duration: 650
                    });
                }
                if (typeof window.playClassSkillVfx === 'function') {
                    window.playClassSkillVfx(p, f.skillDef, gameInstance, {
                        hit: true,
                        destructionFinal: true,
                        aoeRadius: f.pulseRadius || 160
                    });
                }
            }
            p._destructionForm = null;
            p._transformSizeMult = null;
            if (f.healToFullOnEnd) {
                p.hp = p.maxHp;
                floatText(gameInstance, p.x, p.y - 48, '生命回满!', '#44ff88');
            }
            if (!p.isDashing) p._chargeSuperArmor = false;
            if (typeof p.updateStats === 'function') p.updateStats();
            return;
        }
        if (f.ccImmune) {
            p.stunUntil = 0;
            p.frozenUntil = 0;
            p._chargeSuperArmor = true;
            if (p.statusEffects) {
                p.statusEffects.stunned = null;
                p.statusEffects.frozen = null;
            }
        }
        if (now - f.lastPulse >= f.pulseIntervalMs) {
            f.lastPulse = now;
            window.pulseDestructionForm(p, f.skillDef, gameInstance, monsters, f, now);
        }
    };

    window.drawDestroyMarkOverlay = function drawDestroyMarkOverlay(ctx, monster, now) {
        const stacks = window.getDestroyMarkStacks(monster);
        if (!stacks || !ctx || !monster) return;
        const x = monster.x;
        const y = monster.y;
        const size = monster.size || 32;
        const t = now != null ? now : Date.now();
        const pulse = 1 + Math.sin(t / 110) * 0.14;
        const r = size / 2 + 10;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.22 + stacks * 0.07;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * pulse * 1.4);
        glow.addColorStop(0, stacks >= 5 ? '#ff2200' : '#ff5533');
        glow.addColorStop(0.55, '#aa1100');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * pulse * 1.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = stacks >= 5 ? '#ff1100' : '#ff4422';
        ctx.lineWidth = stacks >= 4 ? 3 : 2;
        ctx.beginPath();
        ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ff8866';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(x, y, (r - 4) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        for (let i = 0; i < MARK_MAX; i++) {
            const filled = i < stacks;
            const ang = -Math.PI / 2 + (i - (MARK_MAX - 1) / 2) * 0.38;
            const px = x + Math.cos(ang) * (r + 6);
            const py = y + Math.sin(ang) * (r + 6) * 0.55;
            ctx.globalAlpha = filled ? 1 : 0.4;
            ctx.fillStyle = filled ? '#ff2200' : '#441100';
            ctx.beginPath();
            ctx.arc(px, py, filled ? 5 : 3.5, 0, Math.PI * 2);
            ctx.fill();
            if (filled) {
                ctx.fillStyle = '#ffddcc';
                ctx.font = 'bold 8px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('灭', px, py + 1);
            }
        }

        ctx.globalAlpha = 1;
        const badgeY = y - size / 2 - 16;
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#220000';
        ctx.lineWidth = 3;
        ctx.strokeText(`×${stacks}`, x, badgeY);
        ctx.fillStyle = stacks >= 5 ? '#ffff44' : '#ff6644';
        ctx.fillText(`×${stacks}`, x, badgeY);
        ctx.restore();
    };
})();
