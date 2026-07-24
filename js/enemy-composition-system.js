/**
 * 恶魔塔敌人编队：固定组合 + 模板特质协同
 */
(function () {
    'use strict';

    function cfg() {
        return (typeof CONFIG !== 'undefined' && CONFIG.AUTO_BATTLER_CONFIG) ||
            window.AUTO_BATTLER_CONFIG || {};
    }

    function templateById(id) {
        return (cfg().enemyTemplates || []).find((t) => t.id === id) || null;
    }

    function pickWeighted(items, rng) {
        const r = rng || Math.random;
        if (!items.length) return null;
        let total = 0;
        items.forEach((it) => { total += it.weight != null ? it.weight : 1; });
        let roll = r() * total;
        for (let i = 0; i < items.length; i++) {
            roll -= items[i].weight != null ? items[i].weight : 1;
            if (roll <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    function living(units) {
        return (units || []).filter((u) => u && u.alive);
    }

    function dist(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function hasTrait(unit, traitId) {
        return (unit.traits || []).indexOf(traitId) >= 0;
    }

    function alliesOf(battle, unit) {
        return unit.side === 'enemy' ? battle.enemies : battle.allies;
    }

    function foesOf(battle, unit) {
        return unit.side === 'enemy' ? battle.allies : battle.enemies;
    }

    function pickComposition(nodeType, layer, rng) {
        const list = cfg().encounterCompositions || [];
        const bag = list.filter((c) => {
            const types = c.nodeTypes || ['battle'];
            if (types.indexOf(nodeType) < 0) return false;
            const minL = c.layerMin != null ? c.layerMin : 0;
            const maxL = c.layerMax != null ? c.layerMax : 99;
            return layer >= minL && layer <= maxL;
        });
        return pickWeighted(bag, rng);
    }

    function attachTraitsFromTemplate(unit, template) {
        const overlay = cfg().enemyTraitOverlay || {};
        const fromTpl = (template && template.traits) ? template.traits.slice() : [];
        const fromOv = overlay[template && template.id] || [];
        const merged = fromTpl.concat(fromOv);
        unit.traits = merged.filter((t, i) => merged.indexOf(t) === i);
        unit.traitState = {};
    }

    function initBattle(battle) {
        if (!battle || battle.preview) return;
        const enemies = living(battle.enemies);
        enemies.forEach((u) => {
            if (hasTrait(u, 'templar_bless')) {
                living(enemies).forEach((ally) => {
                    if ((ally.row || 0) <= 0 && ally.alive) {
                        if (!ally.statuses) ally.statuses = [];
                        ally.statuses.push({
                            type: 'shield', amount: Math.floor(ally.maxHp * 0.08), t: 12000
                        });
                    }
                });
            }
            if (hasTrait(u, 'snipe_mark')) {
                const foes = living(battle.allies);
                let best = null;
                foes.forEach((f) => {
                    if (!best || f.maxHp > best.maxHp) best = f;
                });
                if (best) {
                    if (!best.statuses) best.statuses = [];
                    best.statuses.push({ type: 'mark', bonusPct: 0.22, t: 999999, sourceId: u.id });
                    u.traitState.markedTargetId = best.id;
                }
            }
            if (hasTrait(u, 'war_drums')) {
                living(enemies).forEach((ally) => {
                    if (!ally.statuses) ally.statuses = [];
                    ally.statuses.push({
                        type: 'buff', stat: 'attack', pct: 0.1, t: 999999, sourceId: 'war_drums'
                    });
                });
            }
        });
        if (battle.encounterSynergy) {
            applySynergy(battle, battle.encounterSynergy);
        }
    }

    function applySynergy(battle, synergyId) {
        const def = (cfg().encounterSynergies || {})[synergyId];
        if (!def || !def.effects) return;
        const enemies = living(battle.enemies);
        def.effects.forEach((eff) => {
            if (eff.type === 'team_attack' && eff.pct) {
                enemies.forEach((u) => {
                    if (!u.statuses) u.statuses = [];
                    u.statuses.push({
                        type: 'buff', stat: 'attack', pct: eff.pct, t: 999999, sourceId: synergyId
                    });
                });
            }
            if (eff.type === 'team_haste' && eff.speedPct) {
                enemies.forEach((u) => { u.speed = (u.speed || 70) * (1 + eff.speedPct); });
            }
            if (eff.type === 'team_defense' && eff.pct) {
                enemies.forEach((u) => {
                    if (!u.statuses) u.statuses = [];
                    u.statuses.push({
                        type: 'buff', stat: 'defense', pct: eff.pct, t: 999999, sourceId: synergyId
                    });
                });
            }
        });
    }

    function tickBattle(battle, dtMs) {
        if (!battle || battle.finished) return;
        const enemies = living(battle.enemies);
        enemies.forEach((u) => {
            if (hasTrait(u, 'maggot_regen')) {
                u.traitState.regenAcc = (u.traitState.regenAcc || 0) + dtMs;
                while (u.traitState.regenAcc >= 1000) {
                    u.traitState.regenAcc -= 1000;
                    u.hp = Math.min(u.maxHp, u.hp + Math.max(1, Math.floor(u.maxHp * 0.012)));
                }
            }
            if (hasTrait(u, 'blood_priest_heal')) {
                u.traitState.healAcc = (u.traitState.healAcc || 0) + dtMs;
                while (u.traitState.healAcc >= 2500) {
                    u.traitState.healAcc -= 2500;
                    const hurt = living(enemies).filter((a) => a.hp / a.maxHp < 0.85);
                    if (!hurt.length) break;
                    hurt.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
                    const t = hurt[0];
                    t.hp = Math.min(t.maxHp, t.hp + Math.floor(t.maxHp * 0.04));
                }
            }
            if (hasTrait(u, 'abyss_pulse')) {
                u.traitState.pulseAcc = (u.traitState.pulseAcc || 0) + dtMs;
                if (u.traitState.pulseAcc >= 9000) {
                    u.traitState.pulseAcc = 0;
                    const ABS = window.AutoBattleSimulator;
                    if (ABS && ABS.applyTraitDamage) {
                        living(battle.allies).forEach((ally) => {
                            ABS.applyTraitDamage(battle, u, ally, u.attack * 0.55, { isSkill: true, trait: 'abyss_pulse' });
                        });
                    }
                }
            }
            if (hasTrait(u, 'guardian_aura')) {
                living(enemies).forEach((ally) => {
                    if (ally.id === u.id) return;
                    if ((ally.row || 0) !== (u.row || 0)) return;
                    if (!ally.statuses) ally.statuses = [];
                    const existing = ally.statuses.find((s) => s.type === 'guardian_ward' && s.sourceId === u.id);
                    if (existing) { existing.t = 800; return; }
                    ally.statuses.push({
                        type: 'guardian_ward', drPct: 0.1, t: 800, sourceId: u.id
                    });
                });
            }
        });
    }

    function packAttackMult(battle, attacker) {
        if (!hasTrait(attacker, 'pack_hunter')) return 1;
        const pack = living(battle.enemies).filter((u) => hasTrait(u, 'pack_hunter')).length;
        return 1 + Math.min(3, Math.max(0, pack - 1)) * 0.1;
    }

    function soulLinkMult(battle, attacker) {
        if (!hasTrait(attacker, 'soul_link')) return 1;
        const hasNecro = living(battle.enemies).some((u) => u.templateId === 'ab_necromancer');
        return hasNecro ? 1.2 : 1;
    }

    function bloodFrenzyMult(unit) {
        if (!hasTrait(unit, 'blood_frenzy')) return 1;
        return unit.hp / Math.max(1, unit.maxHp) <= 0.5 ? 1.35 : 1;
    }

    function hexAmplifyMult(target) {
        const mark = (target.statuses || []).find((s) => s.type === 'mark' && s.t > 0);
        return mark ? 1.22 : 1;
    }

    function modifyOutgoingDamage(battle, attacker, target, dmg) {
        if (attacker.side !== 'enemy') return dmg;
        let out = dmg;
        out *= packAttackMult(battle, attacker);
        out *= soulLinkMult(battle, attacker);
        out *= bloodFrenzyMult(attacker);
        if (hasTrait(attacker, 'hex_amplify')) out *= hexAmplifyMult(target);
        return out;
    }

    function modifyIncomingDamage(battle, target, dmg, attacker) {
        if (target.side === 'enemy' && attacker && attacker.side === 'ally') {
            (target.statuses || []).forEach((s) => {
                if (s.type === 'guardian_ward' && s.t > 0) dmg *= (1 - (s.drPct || 0));
            });
        }
        return dmg;
    }

    function onBasicHit(battle, attacker, target) {
        if (attacker.side !== 'enemy' || !target || !target.alive) return;
        const ABS = window.AutoBattleSimulator;
        if (hasTrait(attacker, 'hex_mark') && Math.random() < 0.28) {
            if (!target.statuses) target.statuses = [];
            target.statuses.push({ type: 'mark', bonusPct: 0.18, t: 5000, sourceId: attacker.id });
            if (ABS && ABS.spawnEnemyTraitHitFx) ABS.spawnEnemyTraitHitFx(battle, attacker, target, 'hex_mark');
        }
        if (hasTrait(attacker, 'chain_stun') && Math.random() < 0.12) {
            const hasBrute = living(battle.enemies).some((u) => u.templateId === 'ab_brute');
            if (hasBrute) {
                if (!target.statuses) target.statuses = [];
                target.statuses.push({ type: 'stun', t: 600 });
                if (ABS && ABS.spawnEnemyTraitHitFx) ABS.spawnEnemyTraitHitFx(battle, attacker, target, 'chain_stun');
            }
        }
        if (hasTrait(attacker, 'trap_slow') && Math.random() < 0.22) {
            if (!target.statuses) target.statuses = [];
            target.statuses.push({
                type: 'debuff', stat: 'attack', pct: 0.15, t: 3500, sourceId: attacker.id
            });
            if (ABS && ABS.spawnEnemyTraitHitFx) ABS.spawnEnemyTraitHitFx(battle, attacker, target, 'trap_slow');
        }
        if (hasTrait(attacker, 'life_drain')) {
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.attack * 0.08));
            if (ABS && ABS.spawnEnemyTraitHitFx) ABS.spawnEnemyTraitHitFx(battle, attacker, target, 'life_drain');
        }
    }

    function onDeath(battle, unit) {
        if (unit.side !== 'enemy') return [];
        const results = [];
        if (hasTrait(unit, 'death_explode')) {
            living(battle.allies).forEach((ally) => {
                if (dist(unit, ally) <= 95) {
                    results.push({ target: ally, raw: unit.attack * 1.1, meta: { isSkill: true, trait: 'death_explode' } });
                }
            });
        }
        if (hasTrait(unit, 'imp_swarm_split') && !(unit.traitState && unit.traitState.didSplit)) {
            results.push({
                spawn: {
                    templateId: 'ab_imp', col: unit.col, row: unit.row, scaleMult: 0.55, maxOnce: true
                }
            });
        }
        return results;
    }

    function pickTarget(unit, foes) {
        if (hasTrait(unit, 'harpy_dive')) {
            let best = null;
            let bestScore = -Infinity;
            living(foes).forEach((f) => {
                const score = (f.row || 0) * 30 - dist(unit, f) * 0.05;
                if (score > bestScore) { bestScore = score; best = f; }
            });
            return best;
        }
        return null;
    }

    window.EnemyCompositionSystem = {
        templateById,
        pickComposition,
        attachTraitsFromTemplate,
        initBattle,
        tickBattle,
        modifyOutgoingDamage,
        modifyIncomingDamage,
        onBasicHit,
        onDeath,
        pickTarget,
        hasTrait
    };
})();
