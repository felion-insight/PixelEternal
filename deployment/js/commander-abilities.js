/**
 * 指挥官指令效果实现
 */
(function () {
    'use strict';

    function living(list) {
        return (list || []).filter((u) => u.alive !== false && (u.hp == null || u.hp > 0));
    }

    function findUnit(battle, idOrUnit) {
        if (!idOrUnit) return null;
        if (typeof idOrUnit === 'object') return idOrUnit;
        const all = (battle.allies || []).concat(battle.enemies || []);
        return all.find((u) => u.id === idOrUnit || u.heroId === idOrUnit) || null;
    }

    function applyFocusFire(cm, target, def) {
        const battle = cm.battle;
        if (!target) return;
        battle.focusFireTargetId = target.id || target.heroId;
        battle.focusFireUntil = (battle.elapsed || 0) + (def.durationMs || 6000);
        battle.focusFireBonus = def.damageBonus || 0.3;
        target.marked = true;
    }

    function applyRetreat(cm, target, def) {
        if (!target || target.side !== 'ally') return;
        const dist = def.distance || 2;
        target.row = Math.min(2, (target.row || 0) + dist);
        target.invulnUntil = (cm.battle.elapsed || 0) + (def.invulnDurationMs || 1500);
    }

    function applyShieldBurst(cm, def) {
        const pct = def.shieldPct || 0.15;
        const dur = def.durationMs || 5000;
        living(cm.battle.allies).forEach((u) => {
            u.shield = (u.shield || 0) + Math.floor(u.maxHp * pct);
            u.shieldUntil = (cm.battle.elapsed || 0) + dur;
        });
    }

    function applyTimeStop(cm, def) {
        cm.battle.timeStopRemaining = def.durationMs || 2500;
    }

    function applyBattleCry(cm, def) {
        const dur = def.durationMs || 5000;
        living(cm.battle.allies).forEach((u) => {
            u.attackBuff = def.attackMult || 1.25;
            u.speedBuff = def.speedMult || 1.15;
            u.buffUntil = (cm.battle.elapsed || 0) + dur;
        });
    }

    function applyTacticalWithdraw(cm) {
        cm.battle.tacticalWithdraw = true;
        cm.battle.finished = true;
        cm.battle.victory = false;
        cm.battle.withdrawNoReward = true;
    }

    function applySoulLink(cm, targets, def) {
        if (!targets || targets.length < 2) return;
        const a = targets[0];
        const b = targets[1];
        const link = { a: a.id, b: b.id, share: def.sharePct || 0.5, until: (cm.battle.elapsed || 0) + (def.durationMs || 8000) };
        cm.battle.soulLinks = (cm.battle.soulLinks || []).concat([link]);
    }

    function applyVoidBanish(cm, target, def) {
        if (!target || target.isBoss) return;
        target.banishedUntil = (cm.battle.elapsed || 0) + (def.durationMs || 10000);
        target.alive = false;
        target._banished = true;
    }

    function applyBloodFrenzy(cm, def) {
        const pct = def.hpCostPct || 0.2;
        living(cm.battle.allies).forEach((u) => {
            const cost = Math.floor(u.hp * pct);
            u.hp = Math.max(1, u.hp - cost);
            u.critBonus = (u.critBonus || 0) + (def.critBonus || 0.5);
            u.bloodFrenzyUntil = (cm.battle.elapsed || 0) + (def.durationMs || 5000);
        });
    }

    function applySummonReinforcements(cm, def) {
        const battle = cm.battle;
        const allies = living(battle.allies);
        if (!allies.length || !window.AutoBattleSimulator) return;
        const avgAtk = allies.reduce((s, u) => s + (u.attack || 10), 0) / allies.length;
        const avgHp = allies.reduce((s, u) => s + (u.maxHp || 100), 0) / allies.length;
        const mult = def.statMult || 0.5;
        for (let i = 0; i < (def.count || 2); i++) {
            battle.allies.push({
                id: 'phantom_' + i + '_' + Date.now(),
                side: 'ally',
                name: '幻影士兵',
                hp: Math.floor(avgHp * mult),
                maxHp: Math.floor(avgHp * mult),
                attack: Math.floor(avgAtk * mult),
                defense: 4,
                speed: 60,
                range: 48,
                row: 1,
                col: i,
                alive: true,
                phantom: true,
                phantomUntil: (battle.elapsed || 0) + (def.durationMs || 15000),
                color: '#88aacc'
            });
        }
    }

    function applyTauntAura(cm, target, def) {
        if (!target || target.side !== 'ally') return;
        cm.battle.tauntTargetId = target.id || target.heroId;
        cm.battle.tauntUntil = (cm.battle.elapsed || 0) + (def.durationMs || 3000);
        target.damageReduction = def.damageReduction || 0.4;
        target.tauntDRUntil = cm.battle.tauntUntil;
    }

    function applyManaBurn(cm, target, def) {
        if (!target || target.side !== 'enemy') return;
        target.silencedUntil = (cm.battle.elapsed || 0) + (def.durationMs || 3000);
        const dmg = Math.floor((target.maxHp || 100) * (def.manaDamagePct || 0.1));
        target.hp = Math.max(0, target.hp - dmg);
        if (target.hp <= 0) target.alive = false;
    }

    function applySwapPositions(cm, targets, def) {
        const battle = cm.battle;
        const ids = Array.isArray(targets) ? targets : [targets];
        const units = ids.map((t) => findUnit(battle, t)).filter(Boolean);
        if (units.length < 2) return;
        const a = units[0]; const b = units[1];
        const tc = a.col; const tr = a.row;
        a.col = b.col; a.row = b.row;
        b.col = tc; b.row = tr;
        const inv = def.invulnDurationMs || 2000;
        a.invulnUntil = (battle.elapsed || 0) + inv;
        b.invulnUntil = (battle.elapsed || 0) + inv;
    }

    function applyBloodSacrifice(cm, def) {
        const pct = def.hpCostPct || 0.25;
        living(cm.battle.allies).forEach((u) => {
            u.hp = Math.max(1, u.hp - Math.floor(u.hp * pct));
        });
        cm.battle.teamDamageMult = def.teamDamageMult || 1.5;
        cm.battle.teamDamageUntil = (cm.battle.elapsed || 0) + (def.durationMs || 4000);
    }

    function applyReviveAlly(cm, target, def) {
        if (!target) return;
        const h = cm.run && cm.run.heroes && cm.run.heroes.find((x) => x.heroId === target.heroId);
        target.alive = true;
        target.hp = Math.floor(target.maxHp * (def.reviveHpPct || 0.3));
        target.statuses = [];
        if (h) { h.hp = target.hp; h.maxHp = target.maxHp; }
    }

    function applyBlackHole(cm, def) {
        const battle = cm.battle;
        const cx = battle.origin ? battle.origin.x + 200 : 400;
        const cy = battle.origin ? battle.origin.y + 120 : 300;
        battle.blackHoleUntil = (battle.elapsed || 0) + (def.durationMs || 3000);
        battle.blackHoleX = cx;
        battle.blackHoleY = cy;
        battle.blackHoleCenter = { x: cx, y: cy };
    }

    function applySummonTotem(cm, def, totemType) {
        const battle = cm.battle;
        const types = def.totemTypes || ['heal', 'attack', 'taunt'];
        const pick = totemType || types[Math.floor(Math.random() * types.length)];
        const base = { id: 'totem_' + Date.now(), side: 'ally', phantom: true, row: 1, col: 2, alive: true,
            phantomUntil: (battle.elapsed || 0) + (def.durationMs || 12000), color: '#66ccaa' };
        if (pick === 'heal') {
            Object.assign(base, { name: '治疗图腾', hp: 180, maxHp: 180, attack: 0, defense: 6, speed: 0, range: 80, totemHeal: 0.02 });
        } else if (pick === 'taunt') {
            Object.assign(base, { name: '嘲讽图腾', hp: 260, maxHp: 260, attack: 8, defense: 12, speed: 0, range: 48, totemTaunt: true });
        } else {
            Object.assign(base, { name: '攻击图腾', hp: 200, maxHp: 200, attack: 22, defense: 4, speed: 0, range: 130 });
        }
        battle.allies.push(base);
    }

    function applyMirrorUnit(cm, target, def) {
        if (!target || target.side !== 'ally') return;
        const battle = cm.battle;
        const mult = def.statMult || 0.5;
        battle.allies.push(Object.assign({}, target, {
            id: 'mirror_' + Date.now(), heroId: null, phantom: true,
            hp: Math.floor(target.hp * mult), maxHp: Math.floor(target.maxHp * mult),
            attack: Math.floor(target.attack * mult),
            phantomUntil: (battle.elapsed || 0) + (def.durationMs || 8000)
        }));
    }

    function applyPurifyTeam(cm, def) {
        living(cm.battle.allies).forEach((u) => {
            u.statuses = [];
            u.debuffImmuneUntil = (cm.battle.elapsed || 0) + (def.durationMs || 3000);
        });
    }

    function applyFrenzyOrder(cm, def) {
        living(cm.battle.allies).forEach((u) => {
            u.attackBuff = def.attackMult || 1.4;
            u.damageTakenMult = def.damageTakenMult || 1.2;
            u.buffUntil = (cm.battle.elapsed || 0) + (def.durationMs || 6000);
        });
    }

    function applyTimeRift(cm, def) {
        living(cm.battle.allies).forEach((u) => {
            (u.skills || []).forEach((sk) => { sk.cd = 0; });
        });
        if (cm.battle.commanderMode) cm.battle.commanderMode.regenBlockedUntil = (cm.battle.elapsed || 0) + 10000;
    }

    function applyUltimateSacrifice(cm, target, def) {
        if (!target || target.side !== 'ally') return;
        const shield = target.hp;
        target.hp = 0;
        target.alive = false;
        target.noRevive = true;
        living(cm.battle.allies).forEach((u) => {
            if (u === target) return;
            u.shield = (u.shield || 0) + Math.floor(shield / Math.max(1, living(cm.battle.allies).length));
        });
    }

    function execute(cm, def, target) {
        if (!cm || !def) return;
        switch (def.effectType) {
            case 'focus_fire':
                applyFocusFire(cm, findUnit(cm.battle, target), def);
                break;
            case 'tactical_retreat':
                applyRetreat(cm, findUnit(cm.battle, target), def);
                break;
            case 'shield_burst':
                applyShieldBurst(cm, def);
                break;
            case 'time_stop':
                applyTimeStop(cm, def);
                break;
            case 'battle_cry':
                applyBattleCry(cm, def);
                break;
            case 'tactical_withdraw':
                applyTacticalWithdraw(cm);
                break;
            case 'soul_link':
                applySoulLink(cm, Array.isArray(target) ? target.map((t) => findUnit(cm.battle, t)) : [findUnit(cm.battle, target)], def);
                break;
            case 'void_banish':
                applyVoidBanish(cm, findUnit(cm.battle, target), def);
                break;
            case 'blood_frenzy':
                applyBloodFrenzy(cm, def);
                break;
            case 'blood_sacrifice':
                applyBloodSacrifice(cm, def);
                break;
            case 'taunt_aura':
                applyTauntAura(cm, findUnit(cm.battle, target), def);
                break;
            case 'mana_burn':
                applyManaBurn(cm, findUnit(cm.battle, target), def);
                break;
            case 'swap_positions':
                applySwapPositions(cm, target, def);
                break;
            case 'revive_ally':
                applyReviveAlly(cm, findUnit(cm.battle, target), def);
                break;
            case 'summon_totem':
                applySummonTotem(cm, def, target && target.totemType);
                break;
            case 'mirror_unit':
                applyMirrorUnit(cm, findUnit(cm.battle, target), def);
                break;
            case 'black_hole':
                applyBlackHole(cm, def);
                break;
            case 'purify_team':
                applyPurifyTeam(cm, def);
                break;
            case 'frenzy_order':
                applyFrenzyOrder(cm, def);
                break;
            case 'time_rift':
                applyTimeRift(cm, def);
                break;
            case 'ultimate_sacrifice':
                applyUltimateSacrifice(cm, findUnit(cm.battle, target), def);
                break;
            case 'summon_reinforcements':
                applySummonReinforcements(cm, def);
                break;
            case 'time_rewind':
                if (target && target._snapshot) {
                    const u = findUnit(cm.battle, target);
                    if (u && target._snapshot) Object.assign(u, target._snapshot);
                }
                break;
            default:
                break;
        }
    }

    function modifyPickTarget(battle, picker, enemies) {
        if (!battle.focusFireTargetId) return enemies;
        if (battle.focusFireUntil != null && battle.elapsed > battle.focusFireUntil) {
            battle.focusFireTargetId = null;
            return enemies;
        }
        const marked = enemies.find((e) => (e.id === battle.focusFireTargetId));
        if (marked && marked.alive !== false) return [marked].concat(enemies.filter((e) => e !== marked));
        return enemies;
    }

    function modifyOutgoingDamage(battle, attacker, target, dmg) {
        if (!battle.focusFireTargetId || !target) return dmg;
        if ((target.id === battle.focusFireTargetId || target.heroId === battle.focusFireTargetId) && battle.focusFireBonus) {
            return dmg * (1 + battle.focusFireBonus);
        }
        return dmg;
    }

    window.CommanderAbilities = {
        execute,
        modifyPickTarget,
        modifyOutgoingDamage,
        living
    };
})();
