/**
 * 武器 5 星身份共鸣（仅套装身份）。
 * 无套装时由武器类型基础 5 星进阶接管；传奇威能走独立战斗状态机。
 */
(function () {
    'use strict';

    const DEFINITIONS = {
        'set:fireheart': {
            id: 'resonance_set_fireheart', sourceType: 'set', sourceId: 'fireheart',
            name: '熔火之心', description: '暴击积累余烬（最多3层）；武器技能消耗余烬，每层释放18%攻击力熔火新星。'
        },
        'set:stormfury': {
            id: 'resonance_set_stormfury', sourceType: 'set', sourceId: 'stormfury',
            name: '雷暴回路', description: '普攻积累电荷（最多5层）；武器技能消耗电荷追加连锁雷击并返还冷却。'
        },
        'set:dragonblood': {
            id: 'resonance_set_dragonblood', sourceType: 'set', sourceId: 'dragonblood',
            name: '逆鳞震怒', description: '受到伤害积累逆鳞（最多3层）；武器技能消耗逆鳞释放冲击波并获得护盾。'
        },
        // 二转大毕业（含武器位）
        'set:holy_balance': {
            id: 'resonance_set_holy_balance', sourceType: 'set', sourceId: 'holy_balance',
            name: '圣裁回响', description: '受击或格挡积累圣裁（最多3层）；武器技能消耗后每层回复4%最大HP并释放圣光冲击。'
        },
        'set:rift_howl': {
            id: 'resonance_set_rift_howl', sourceType: 'set', sourceId: 'rift_howl',
            name: '碎界战意', description: '暴击积累碎界（最多3层）；武器技能消耗后每层释放22%攻击力裂波。'
        },
        'set:breathless_hunt': {
            id: 'resonance_set_breathless_hunt', sourceType: 'set', sourceId: 'breathless_hunt',
            name: '绝息锁定', description: '普攻积累锁定（最多5层）；武器技能消耗锁定追加穿透箭并短暂提高暴率。'
        },
        'set:echo_fold': {
            id: 'resonance_set_echo_fold', sourceType: 'set', sourceId: 'echo_fold',
            name: '叠影回响', description: '闪避或暴击积累叠影（最多3层）；武器技能消耗后每层追加18%攻击力残影斩。'
        },
        'set:torrent_throne': {
            id: 'resonance_set_torrent_throne', sourceType: 'set', sourceId: 'torrent_throne',
            name: '洪流编织', description: '连续释放3个不同职业技能完成编织；下一次武器技能产生50%法强回响并返还20%冷却。'
        },
        'set:grave_throne': {
            id: 'resonance_set_grave_throne', sourceType: 'set', sourceId: 'grave_throne',
            name: '坟海召令', description: '击杀积累坟火（最多3层）；武器技能消耗后每层对周围造成20%法强伤害。'
        },
        'set:evernight_seal': {
            id: 'resonance_set_evernight_seal', sourceType: 'set', sourceId: 'evernight_seal',
            name: '永夜契印', description: '闪避、背刺或暴击积累影契（最多3层）；武器技能消耗后每层追加20%攻击力残影斩。'
        },
        'set:plague_altar': {
            id: 'resonance_set_plague_altar', sourceType: 'set', sourceId: 'plague_altar',
            name: '瘟潮回路', description: '普攻积累瘟潮（最多5层）；武器技能消耗后释放毒素链并短暂提高技能急速。'
        },
        'set:temple_covenant': {
            id: 'resonance_set_temple_covenant', sourceType: 'set', sourceId: 'temple_covenant',
            name: '永约回响', description: '格挡或受击积累永约（最多3层）；武器技能消耗后每层回复护盾并释放圣光冲击。'
        },
        'set:beast_pact': {
            id: 'resonance_set_beast_pact', sourceType: 'set', sourceId: 'beast_pact',
            name: '兽潮共鸣', description: '普攻积累兽潮（最多5层）；武器技能消耗后强化召唤协同并释放裂波。'
        },
        'set:fate_web': {
            id: 'resonance_set_fate_web', sourceType: 'set', sourceId: 'fate_web',
            name: '织命回路', description: '连续释放3个不同职业技能完成编织；下一次武器技能冻结时间余波并返还冷却。'
        },
        'set:myriad_mirror': {
            id: 'resonance_set_myriad_mirror', sourceType: 'set', sourceId: 'myriad_mirror',
            name: '镜牢回声', description: '闪避或暴击积累镜屑（最多3层）；武器技能消耗后每层追加幻术斩。'
        }
    };

    function weapon(player) {
        return player && player.equipment && player.equipment.weapon;
    }

    function resolve(item) {
        if (!item || !item.setId) return null;
        return DEFINITIONS[`set:${item.setId}`] || null;
    }

    /** 新二转套装复用既有共鸣战斗循环家族 */
    function resonanceFamily(sourceId) {
        const map = {
            holy_balance: 'dragonblood',
            rift_howl: 'fireheart',
            breathless_hunt: 'stormfury',
            echo_fold: 'shadow',
            torrent_throne: 'arcane',
            grave_throne: 'dragonblood',
            evernight_seal: 'shadow',
            plague_altar: 'stormfury',
            temple_covenant: 'dragonblood',
            beast_pact: 'stormfury',
            fate_web: 'arcane',
            myriad_mirror: 'shadow'
        };
        return map[sourceId] || sourceId;
    }

    function state(player) {
        if (!player) return null;
        const item = weapon(player);
        const def = resolve(item);
        const signature = item
            ? `${item.id}|${item.refineLevel || 0}|${item.setId || ''}|${def ? def.id : 'fallback'}`
            : 'none';
        if (!player._weaponResonanceState || player._weaponResonanceState.signature !== signature) {
            player._weaponResonanceState = {
                signature,
                identityId: def && def.id,
                counters: Object.create(null),
                flags: Object.create(null),
                differentSkills: []
            };
        }
        return player._weaponResonanceState;
    }

    function active(player) {
        const item = weapon(player);
        return !!item && (item.refineLevel || 0) >= 5 && !!resolve(item);
    }

    function attackStat(player) {
        const item = weapon(player);
        const magicTypes = ['staff', 'book', 'orb', 'rune'];
        return Math.max(1, magicTypes.includes(item && item.weaponType)
            ? (player.baseMagicAttack || player.baseAttack || 1)
            : (player.baseAttack || 1));
    }

    function targets(player) {
        const game = player && player.gameInstance;
        if (!game) return [];
        let list = null;
        if (typeof game._getSkillMonsters === 'function') list = game._getSkillMonsters();
        else if (typeof game.getCurrentSceneTargets === 'function') list = game.getCurrentSceneTargets();
        return Array.isArray(list) ? list.filter(m => m && m.hp > 0) : [];
    }

    function nearby(player, origin, radius, limit) {
        return targets(player)
            .filter(t => Math.hypot(t.x - origin.x, t.y - origin.y) <= radius)
            .slice(0, limit || 8);
    }

    function deal(player, target, ratio, label) {
        if (!target || !player) return;
        const amount = Math.max(1, Math.floor(attackStat(player) * ratio));
        if (typeof target.takeDamage === 'function') {
            target.takeDamage(amount, player, { source: 'weapon_resonance', label });
        } else {
            target.hp = Math.max(0, (target.hp || 0) - amount);
        }
        const game = player.gameInstance;
        if (game && typeof game.addFloatingText === 'function') {
            game.addFloatingText(target.x, target.y - 18, label || String(amount), '#ffd27a', 900, 12, true);
        }
    }

    function burst(player, target, family) {
        const game = player && player.gameInstance;
        if (!game || typeof game.addEquipmentEffect !== 'function' || !target) return;
        game.addEquipmentEffect('refine_mechanic', target.x, target.y, {
            family: `resonance_${family}`,
            radius: 70,
            duration: 700,
            angle: player.angle || 0
        });
    }

    function signal(def, detail) {
        const metrics = window.EquipmentLabMetrics;
        if (metrics && typeof metrics.recordEffect === 'function') {
            metrics.recordEffect(def.id, detail || {});
        }
    }

    function progress(player, key, amount, max) {
        const s = state(player);
        s.counters[key] = Math.min(max, (s.counters[key] || 0) + amount);
        return s.counters[key];
    }

    function consume(player, key) {
        const s = state(player);
        const value = s.counters[key] || 0;
        s.counters[key] = 0;
        return value;
    }

    function rememberDifferentSkill(player, skillDef) {
        const s = state(player);
        const id = skillDef.id || skillDef.name;
        s.differentSkills = (s.differentSkills || []).filter(entry => entry !== id);
        s.differentSkills.push(id);
        if (s.differentSkills.length > 3) s.differentSkills.shift();
        if (s.differentSkills.length === 3 && new Set(s.differentSkills).size === 3) {
            s.flags.woven = true;
            s.differentSkills = [];
        }
    }

    function addBuff(player, id, effects, durationMs, extra) {
        player.buffs = (player.buffs || []).filter(buff => buff.equipmentEffectId !== id);
        player.buffs.push(Object.assign({
            equipmentEffectId: id,
            effects: effects || {},
            expireTime: Date.now() + durationMs
        }, extra || {}));
        if (typeof player.updateStats === 'function') player.updateStats();
    }

    function refundCooldown(player, item, fraction) {
        const cooldown = item && item.skill && item.skill.cooldown || 8000;
        player.weaponSkillCooldown = Math.max(Date.now(), (player.weaponSkillCooldown || Date.now()) - cooldown * fraction);
    }

    const api = {
        getDefinitions() {
            return DEFINITIONS;
        },

        getDefinition(sourceType, sourceId) {
            if (sourceType !== 'set') return null;
            return DEFINITIONS[`set:${sourceId}`] || null;
        },

        getSupportedIdentityIds() {
            return Object.values(DEFINITIONS).map(def => def.id);
        },

        resolve,

        reset(player) {
            if (player) delete player._weaponResonanceState;
        },

        getStatus(player) {
            if (!active(player)) return null;
            const def = resolve(weapon(player));
            const s = state(player);
            return {
                definition: def,
                counters: Object.assign({}, s.counters),
                flags: Object.assign({}, s.flags)
            };
        },

        tick(player) {
            if (active(player)) state(player);
        },

        modifyBasicAttack(player, target, context) {
            if (!active(player) || !target) return context;
            const def = resolve(weapon(player));
            if (resonanceFamily(def.sourceId) === 'shadow' && typeof target.angle === 'number') {
                const fromTarget = Math.atan2(player.y - target.y, player.x - target.x);
                let diff = Math.abs(fromTarget - target.angle);
                while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                if (diff > Math.PI * 0.66) progress(player, 'shadows', 1, 3);
            }
            return context;
        },

        afterBasicAttack(player, target, context) {
            if (!active(player) || !target) return;
            const def = resolve(weapon(player));
            const fam = resonanceFamily(def.sourceId);
            const isCrit = !!(context && context.isCrit);
            if (fam === 'stormfury') progress(player, 'charges', 1, 5);
            if (fam === 'fireheart' && isCrit) progress(player, 'embers', 1, 3);
            if (fam === 'shadow' && isCrit) progress(player, 'shadows', 1, 3);
        },

        onDodge(player) {
            if (!active(player)) return;
            const def = resolve(weapon(player));
            if (resonanceFamily(def.sourceId) === 'shadow') progress(player, 'shadows', 1, 3);
        },

        afterDamage(player, attacker, actualDamage) {
            void attacker;
            if (!active(player) || actualDamage <= 0) return;
            const def = resolve(weapon(player));
            if (resonanceFamily(def.sourceId) === 'dragonblood') progress(player, 'scales', 1, 3);
        },

        onSkillCast(player, skillDef) {
            if (!active(player) || !skillDef) return;
            const def = resolve(weapon(player));
            if (resonanceFamily(def.sourceId) === 'arcane') rememberDifferentSkill(player, skillDef);
        },

        onKill() {},

        onWeaponSkill(player, item, hitTargets) {
            if (!active(player) || !item) return false;
            const def = resolve(item);
            if (!def) return false;
            const fam = resonanceFamily(def.sourceId);
            const list = (hitTargets || targets(player)).filter(target => target && target.hp > 0);
            const primary = list[0] || targets(player)[0];
            if (!primary) return true;
            let triggered = false;
            let detail = {};

            if (fam === 'fireheart') {
                const stacks = consume(player, 'embers');
                if (stacks > 0) {
                    nearby(player, primary, 120, 4).forEach(target => deal(player, target, 0.18 * stacks, '熔火'));
                    detail = { stacks };
                    triggered = true;
                }
            } else if (fam === 'stormfury') {
                const stacks = consume(player, 'charges');
                if (stacks > 0) {
                    nearby(player, primary, 190, Math.min(3, 1 + Math.floor(stacks / 2)))
                        .forEach(target => deal(player, target, 0.12, '雷暴'));
                    refundCooldown(player, item, Math.min(0.2, stacks * 0.04));
                    detail = { stacks };
                    triggered = true;
                }
            } else if (fam === 'dragonblood') {
                const stacks = consume(player, 'scales');
                if (stacks > 0) {
                    nearby(player, primary, 120, 4).forEach(target => deal(player, target, 0.12 * stacks, '逆鳞'));
                    addBuff(player, def.id, {}, 5000, {
                        shieldRemaining: Math.floor((player.maxHp || 1) * 0.04 * stacks)
                    });
                    detail = { stacks, shield: Math.floor((player.maxHp || 1) * 0.04 * stacks) };
                    triggered = true;
                }
            } else if (fam === 'arcane' && state(player).flags.woven) {
                state(player).flags.woven = false;
                deal(player, primary, 0.5, '奥术回响');
                refundCooldown(player, item, 0.2);
                triggered = true;
            } else if (fam === 'shadow') {
                const stacks = consume(player, 'shadows');
                if (stacks > 0) {
                    deal(player, primary, 0.18 * stacks, `残影×${stacks}`);
                    addBuff(player, def.id, { moveSpeed: 20 }, 2000);
                    detail = { stacks };
                    triggered = true;
                }
            }

            if (triggered) {
                burst(player, primary, def.sourceId);
                signal(def, detail);
            }
            return true;
        }
    };

    window.WeaponRefinementResonance = api;
})();
