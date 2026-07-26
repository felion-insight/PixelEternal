/**
 * 站位羁绊：相邻角色触发组合效果
 */
(function () {
    'use strict';

    function bondCfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.BOND_CONFIG) ||
            window.BOND_CONFIG || { bonds: {} };
    }

    function allBonds() {
        const c = bondCfg();
        return c.bonds || c.BOND_CONFIG?.bonds || {};
    }

    function heroPos(h) {
        return { col: h.boardCol != null ? h.boardCol : (h.col || 0), row: h.boardRow != null ? h.boardRow : (h.row || 0) };
    }

    function areAdjacent(a, b) {
        if (!a || !b) return false;
        const pa = heroPos(a); const pb = heroPos(b);
        if (pa.col < 0 || pa.row < 0 || pb.col < 0 || pb.row < 0) return false;
        const dc = Math.abs(pa.col - pb.col);
        const dr = Math.abs(pa.row - pb.row);
        return (dc + dr) === 1;
    }

    function countClasses(heroes) {
        const c = {};
        (heroes || []).forEach((h) => {
            if ((h.hp || 0) <= 0 && h.hp != null) return;
            const cls = h.baseClass || 'generic';
            c[cls] = (c[cls] || 0) + 1;
        });
        return c;
    }

    function computeActiveBonds(run) {
        const heroes = (run && run.heroes) || [];
        const active = [];
        const bonds = allBonds();
        Object.keys(bonds).forEach((id) => {
            const b = bonds[id];
            if (!b.requiredClasses) return;
            const counts = countClasses(heroes);
            const ok = Object.keys(b.requiredClasses).every((cls) =>
                (counts[cls] || 0) >= b.requiredClasses[cls]);
            if (!ok) return;
            const needAdj = b.adjacentRequired || b.adjacent;
            if (needAdj) {
                let found = false;
                for (let i = 0; i < heroes.length && !found; i++) {
                    for (let j = i + 1; j < heroes.length; j++) {
                        const hi = heroes[i]; const hj = heroes[j];
                        if (hi.baseClass === hj.baseClass && areAdjacent(hi, hj)) { found = true; break; }
                        const cross = b.crossClass || [];
                        if (cross.indexOf(hi.baseClass) >= 0 && cross.indexOf(hj.baseClass) >= 0 && areAdjacent(hi, hj)) {
                            found = true; break;
                        }
                        const reqKeys = Object.keys(b.requiredClasses);
                        if (reqKeys.length >= 2 && hi.baseClass !== hj.baseClass &&
                            reqKeys.indexOf(hi.baseClass) >= 0 && reqKeys.indexOf(hj.baseClass) >= 0 &&
                            areAdjacent(hi, hj)) {
                            found = true; break;
                        }
                    }
                }
                if (!found) return;
            }
            active.push({ id: id, name: b.name, effect: b.effect || {} });
        });
        return active;
    }

    function mapBondEffect(fx, bondFx) {
        if (!fx || !fx.type) return;
        switch (fx.type) {
            case 'damage_share':
                bondFx.damageSharePct = fx.sharePct || fx.damageSharePct || 0.4;
                break;
            case 'mage_echo':
                bondFx.mageEchoChance = fx.chance || fx.mageEchoChance || 0.3;
                break;
            case 'assassin_dodge_share':
                bondFx.assassinDodgeShareMs = fx.durationMs || 1500;
                break;
            case 'archer_echo_attack':
                bondFx.archerEchoChance = fx.chance || 0.2;
                break;
            case 'mage_assassin_synergy':
                bondFx.mageSkillDamageMult = fx.mageSkillDamageMult || 1.2;
                bondFx.assassinCritBonus = fx.assassinCritBonus || 0.15;
                break;
            case 'taunt_mark_bonus':
                bondFx.markDamageBonus = fx.damageBonus || fx.markDamageBonus || 0.5;
                break;
            default:
                if (fx.damageSharePct) bondFx.damageSharePct = fx.damageSharePct;
                if (fx.mageEchoChance) bondFx.mageEchoChance = fx.mageEchoChance;
                if (fx.markDamageBonus) bondFx.markDamageBonus = fx.markDamageBonus;
                if (fx.statMult) bondFx.statMult = (bondFx.statMult || 1) * fx.statMult;
        }
    }

    function applyToBattle(run, battle) {
        const bonds = computeActiveBonds(run);
        battle.activeBonds = bonds;
        battle.bondFx = {};
        bonds.forEach((b) => mapBondEffect(b.effect, battle.bondFx));
        if (run && run.ascension) run.ascension.activeBonds = bonds.map((b) => b.id);
    }

    window.BondSystem = { computeActiveBonds, applyToBattle, areAdjacent, allBonds };
})();
