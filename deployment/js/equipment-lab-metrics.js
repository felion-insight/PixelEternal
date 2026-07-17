/**
 * 装备试验场展示指标。记录演示动作和每项伤害结果，不参与战斗结算。
 */
(function () {
    'use strict';

    const api = {
        active: false,
        current: null,
        history: [],

        start(entry) {
            this.active = true;
            this.current = {
                entryId: entry.id,
                effectId: entry.effectId,
                startedAt: Date.now(),
                events: [],
                totalDamage: 0,
                dps: 0
            };
            return this.current;
        },

        record(type, detail) {
            if (!this.active || !this.current) return;
            this.current.events.push({
                type,
                atMs: Date.now() - this.current.startedAt,
                detail: detail || null
            });
        },

        recordEffect(effectId, detail) {
            this.record('effect_trigger', Object.assign({ effectId }, detail || {}));
        },

        effectTriggerCount(effectId) {
            if (!this.current) return 0;
            return this.current.events.filter(event =>
                event.type === 'effect_trigger'
                && event.detail
                && event.detail.effectId === effectId
            ).length;
        },

        finish(totalDamage, elapsedMs) {
            if (!this.current) return null;
            this.current.elapsedMs = Math.max(1, elapsedMs || (Date.now() - this.current.startedAt));
            this.current.totalDamage = Math.max(0, Number(totalDamage) || 0);
            this.current.dps = this.current.totalDamage / (this.current.elapsedMs / 1000);
            this.current.triggerCount = this.current.events.length;
            this.current.effectTriggerCount = this.current.events.filter(event =>
                event.type === 'effect_trigger'
                && event.detail
                && event.detail.effectId === this.current.effectId
            ).length;
            this.current.triggered = this.current.effectTriggerCount > 0;
            const result = this.current;
            this.history.push(result);
            this.current = null;
            this.active = false;
            return result;
        },

        reset() {
            this.active = false;
            this.current = null;
            this.history = [];
        }
    };

    window.EquipmentLabMetrics = api;
})();
