/**
 * Pixel Eternal - 多维技能实验场指标采集器
 * 只在自动测试上下文中记录数据，不改变正常战斗逻辑。
 */
(function () {
    'use strict';

    function now() {
        return Date.now();
    }

    function emptyState() {
        return {
            active: false,
            startedAt: 0,
            endedAt: 0,
            scenario: 'burst_dps',
            events: [],
            player: {
                damageTaken: 0,
                damageMitigated: 0,
                dodges: 0,
                immunities: 0,
                deaths: 0,
                lowestHpPct: 1,
                timeBelow50Ms: 0,
                healingTotal: 0,
                effectiveHealing: 0,
                overheal: 0,
                shieldAbsorbed: 0
            },
            statuses: {},
            synergies: {},
            buffs: {},
            resources: {
                spent: 0,
                insufficient: 0,
                emptyMs: 0,
                samples: 0
            },
            feel: {
                castAttempts: 0,
                casts: 0,
                blocked: 0,
                fallbackBasic: 0,
                idleMs: 0,
                castLatencyMs: 0,
                castLatencyCount: 0,
                stuckResets: 0
            },
            vfx: {
                skillCalls: 0,
                bySkill: {},
                particleCalls: 0,
                effectCalls: 0
            },
            samples: 0
        };
    }

    const metrics = {
        state: emptyState(),

        start(options = {}) {
            this.state = emptyState();
            this.state.active = true;
            this.state.startedAt = now();
            this.state.scenario = options.scenario || 'burst_dps';
            this.state.durationMs = options.durationMs || 0;
        },

        stop(player) {
            if (!this.state.active) return this.snapshot();
            this.sample(player);
            this.state.active = false;
            this.state.endedAt = now();
            return this.snapshot();
        },

        record(type, payload = {}) {
            if (!this.state.active) return;
            this.state.events.push({ type, at: now(), ...payload });
        },

        recordDamageTaken(incoming, actual, outcome = 'hit') {
            if (!this.state.active) return;
            const raw = Math.max(0, Number(incoming) || 0);
            const dealt = Math.max(0, Number(actual) || 0);
            this.state.player.damageTaken += dealt;
            this.state.player.damageMitigated += Math.max(0, raw - dealt);
            if (outcome === 'dodge') this.state.player.dodges++;
            if (outcome === 'immune' || outcome === 'shield') this.state.player.immunities++;
            this.record('damage_taken', { incoming: raw, actual: dealt, outcome });
        },

        recordHealing(requested, effective) {
            if (!this.state.active) return;
            const raw = Math.max(0, Number(requested) || 0);
            const applied = Math.max(0, Number(effective) || 0);
            this.state.player.healingTotal += raw;
            this.state.player.effectiveHealing += applied;
            this.state.player.overheal += Math.max(0, raw - applied);
            this.record('heal', { requested: raw, effective: applied });
        },

        recordStatus(type, applied = true) {
            if (!this.state.active || !type) return;
            const item = this.state.statuses[type] || { applications: 0, resisted: 0, activeSamples: 0 };
            if (applied) item.applications++;
            else item.resisted++;
            this.state.statuses[type] = item;
            this.record('status', { status: type, applied });
        },

        recordSynergy(id, damage = 0) {
            if (!this.state.active || !id) return;
            const item = this.state.synergies[id] || { triggers: 0, damage: 0 };
            item.triggers++;
            item.damage += Math.max(0, Number(damage) || 0);
            this.state.synergies[id] = item;
            this.record('synergy', { id, damage });
        },

        recordCastAttempt(skillId, result = 'attempt') {
            if (!this.state.active) return;
            this.state.feel.castAttempts++;
            if (result === 'cast') this.state.feel.casts++;
            if (result === 'blocked') this.state.feel.blocked++;
            if (result === 'fallback_basic') this.state.feel.fallbackBasic++;
            if (result === 'insufficient') this.state.resources.insufficient++;
            this.record('cast', { skillId, result });
        },

        recordResource(before, after, max) {
            if (!this.state.active) return;
            const b = Number(before) || 0;
            const a = Number(after) || 0;
            if (a < b) this.state.resources.spent += b - a;
            if (max > 0 && a <= 0) this.state.resources.emptyMs += 30;
            this.state.resources.samples++;
        },

        recordVfx(skillId, type = 'skill') {
            if (!this.state.active) return;
            if (type === 'particle') this.state.vfx.particleCalls++;
            else if (type === 'effect') this.state.vfx.effectCalls++;
            else {
                this.state.vfx.skillCalls++;
                this.state.vfx.bySkill[skillId || 'unknown'] =
                    (this.state.vfx.bySkill[skillId || 'unknown'] || 0) + 1;
            }
        },

        recordStuckReset() {
            if (this.state.active) this.state.feel.stuckResets++;
        },

        sample(player) {
            if (!this.state.active || !player) return;
            const hpPct = player.maxHp > 0 ? Math.max(0, player.hp / player.maxHp) : 1;
            this.state.player.lowestHpPct = Math.min(this.state.player.lowestHpPct, hpPct);
            if (hpPct < 0.5) this.state.player.timeBelow50Ms += 30;
            this.state.samples++;

            const buffs = Array.isArray(player.buffs) ? player.buffs : [];
            buffs.forEach((buff, index) => {
                const key = buff.id || buff.name || `buff_${index}`;
                const item = this.state.buffs[key] || { samples: 0, activations: 0, totalMs: 0 };
                item.samples++;
                item.totalMs += 30;
                this.state.buffs[key] = item;
            });
        },

        snapshot() {
            const s = this.state;
            const durationMs = Math.max(1, (s.endedAt || now()) - s.startedAt);
            const feel = s.feel;
            return {
                scenario: s.scenario,
                durationMs,
                player: {
                    ...s.player,
                    damageTakenPerSecond: s.player.damageTaken / (durationMs / 1000),
                    healingPerSecond: s.player.effectiveHealing / (durationMs / 1000)
                },
                statuses: JSON.parse(JSON.stringify(s.statuses)),
                synergies: JSON.parse(JSON.stringify(s.synergies)),
                buffs: Object.fromEntries(Object.entries(s.buffs).map(([id, v]) => [
                    id, { ...v, uptime: Math.min(1, v.totalMs / durationMs) }
                ])),
                resources: {
                    ...s.resources,
                    emptyRatio: s.resources.samples ? s.resources.emptyMs / (s.resources.samples * 30) : 0
                },
                feel: {
                    ...feel,
                    blockedRatio: feel.castAttempts ? feel.blocked / feel.castAttempts : 0,
                    basicFallbackRatio: feel.castAttempts ? feel.fallbackBasic / feel.castAttempts : 0,
                    averageCastLatencyMs: feel.castLatencyCount
                        ? feel.castLatencyMs / feel.castLatencyCount : 0
                },
                vfx: {
                    ...s.vfx,
                    coverage: feel.casts ? Object.keys(s.vfx.bySkill).length / feel.casts : 0
                },
                eventCount: s.events.length
            };
        }
    };

    window.SkillLabMetrics = metrics;
})();
/**
 * Pixel Eternal - 多维技能实验场指标采集器
 * 只在自动测试上下文中记录数据，不改变正常战斗逻辑。
 */
(function () {
    'use strict';

    function now() {
        return Date.now();
    }

    function emptyState() {
        return {
            active: false,
            startedAt: 0,
            endedAt: 0,
            scenario: 'burst_dps',
            events: [],
            player: {
                damageTaken: 0,
                damageMitigated: 0,
                dodges: 0,
                immunities: 0,
                deaths: 0,
                lowestHpPct: 1,
                timeBelow50Ms: 0,
                healingTotal: 0,
                effectiveHealing: 0,
                overheal: 0,
                shieldAbsorbed: 0
            },
            statuses: {},
            synergies: {},
            buffs: {},
            resources: {
                spent: 0,
                insufficient: 0,
                emptyMs: 0,
                samples: 0
            },
            feel: {
                castAttempts: 0,
                casts: 0,
                blocked: 0,
                fallbackBasic: 0,
                idleMs: 0,
                castLatencyMs: 0,
                castLatencyCount: 0,
                stuckResets: 0
            },
            vfx: {
                skillCalls: 0,
                bySkill: {},
                particleCalls: 0,
                effectCalls: 0
            },
            samples: 0
        };
    }

    const metrics = {
        state: emptyState(),

        start(options = {}) {
            this.state = emptyState();
            this.state.active = true;
            this.state.startedAt = now();
            this.state.scenario = options.scenario || 'burst_dps';
            this.state.durationMs = options.durationMs || 0;
        },

        stop(player) {
            if (!this.state.active) return this.snapshot();
            this.sample(player);
            this.state.active = false;
            this.state.endedAt = now();
            return this.snapshot();
        },

        record(type, payload = {}) {
            if (!this.state.active) return;
            this.state.events.push({ type, at: now(), ...payload });
        },

        recordDamageTaken(incoming, actual, outcome = 'hit') {
            if (!this.state.active) return;
            const raw = Math.max(0, Number(incoming) || 0);
            const dealt = Math.max(0, Number(actual) || 0);
            this.state.player.damageTaken += dealt;
            this.state.player.damageMitigated += Math.max(0, raw - dealt);
            if (outcome === 'dodge') this.state.player.dodges++;
            if (outcome === 'immune' || outcome === 'shield') this.state.player.immunities++;
            this.record('damage_taken', { incoming: raw, actual: dealt, outcome });
        },

        recordHealing(requested, effective) {
            if (!this.state.active) return;
            const raw = Math.max(0, Number(requested) || 0);
            const applied = Math.max(0, Number(effective) || 0);
            this.state.player.healingTotal += raw;
            this.state.player.effectiveHealing += applied;
            this.state.player.overheal += Math.max(0, raw - applied);
            this.record('heal', { requested: raw, effective: applied });
        },

        recordStatus(type, applied = true) {
            if (!this.state.active || !type) return;
            const item = this.state.statuses[type] || { applications: 0, resisted: 0, activeSamples: 0 };
            if (applied) item.applications++;
            else item.resisted++;
            this.state.statuses[type] = item;
            this.record('status', { status: type, applied });
        },

        recordSynergy(id, damage = 0) {
            if (!this.state.active || !id) return;
            const item = this.state.synergies[id] || { triggers: 0, damage: 0 };
            item.triggers++;
            item.damage += Math.max(0, Number(damage) || 0);
            this.state.synergies[id] = item;
            this.record('synergy', { id, damage: item.damage });
        },

        recordCastAttempt(skillId, result = 'attempt') {
            if (!this.state.active) return;
            this.state.feel.castAttempts++;
            if (result === 'cast') this.state.feel.casts++;
            if (result === 'blocked') this.state.feel.blocked++;
            if (result === 'fallback_basic') this.state.feel.fallbackBasic++;
            if (result === 'insufficient') this.state.resources.insufficient++;
            this.record('cast', { skillId, result });
        },

        recordResource(before, after, max) {
            if (!this.state.active) return;
            const b = Number(before) || 0;
            const a = Number(after) || 0;
            if (a < b) this.state.resources.spent += b - a;
            if (max > 0 && a <= 0) this.state.resources.emptyMs += 30;
            this.state.resources.samples++;
        },

        recordVfx(skillId, type = 'skill') {
            if (!this.state.active) return;
            if (type === 'particle') this.state.vfx.particleCalls++;
            else if (type === 'effect') this.state.vfx.effectCalls++;
            else {
                this.state.vfx.skillCalls++;
                this.state.vfx.bySkill[skillId || 'unknown'] =
                    (this.state.vfx.bySkill[skillId || 'unknown'] || 0) + 1;
            }
        },

        recordStuckReset() {
            if (this.state.active) this.state.feel.stuckResets++;
        },

        sample(player) {
            if (!this.state.active || !player) return;
            const t = now();
            const hpPct = player.maxHp > 0 ? Math.max(0, player.hp / player.maxHp) : 1;
            this.state.player.lowestHpPct = Math.min(this.state.player.lowestHpPct, hpPct);
            if (hpPct < 0.5) this.state.player.timeBelow50Ms += 30;
            this.state.samples++;

            const buffs = Array.isArray(player.buffs) ? player.buffs : [];
            buffs.forEach((buff, index) => {
                const key = buff.id || buff.name || `buff_${index}`;
                const item = this.state.buffs[key] || { samples: 0, activations: 0, totalMs: 0 };
                item.samples++;
                item.totalMs += 30;
                this.state.buffs[key] = item;
            });
        },

        snapshot() {
            const s = this.state;
            const durationMs = Math.max(1, (s.endedAt || now()) - s.startedAt);
            const feel = s.feel;
            return {
                scenario: s.scenario,
                durationMs,
                player: { ...s.player, damageTakenPerSecond: s.player.damageTaken / (durationMs / 1000), healingPerSecond: s.player.effectiveHealing / (durationMs / 1000) },
                statuses: JSON.parse(JSON.stringify(s.statuses)),
                synergies: JSON.parse(JSON.stringify(s.synergies)),
                buffs: Object.fromEntries(Object.entries(s.buffs).map(([id, v]) => [id, { ...v, uptime: Math.min(1, v.totalMs / durationMs) }])),
                resources: { ...s.resources, emptyRatio: s.resources.samples ? s.resources.emptyMs / (s.resources.samples * 30) : 0 },
                feel: { ...feel, blockedRatio: feel.castAttempts ? feel.blocked / feel.castAttempts : 0, basicFallbackRatio: feel.castAttempts ? feel.fallbackBasic / feel.castAttempts : 0, averageCastLatencyMs: feel.castLatencyCount ? feel.castLatencyMs / feel.castLatencyCount : 0 },
                vfx: { ...s.vfx, coverage: s.feel.casts ? Object.keys(s.vfx.bySkill).length / s.feel.casts : 0 },
                eventCount: s.events.length
            };
        }
    };

    window.SkillLabMetrics = metrics;
})();
