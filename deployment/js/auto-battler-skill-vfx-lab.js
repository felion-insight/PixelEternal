/**
 * 自走棋技能特效试验场 — 独立于 ARPG 技能实验场 / 装备试验场
 * 用于预览 config/auto-battler-config.json skillPool 中的全部技能 VFX
 */
(function () {
    'use strict';

    const CLASS_LABEL = {
        warrior: '战士',
        archer: '弓手',
        mage: '法师',
        assassin: '刺客',
        generic: '通用'
    };

    function drawQuad(ctx, q) {
        ctx.beginPath();
        ctx.moveTo(q.tl.x, q.tl.y);
        ctx.lineTo(q.tr.x, q.tr.y);
        ctx.lineTo(q.br.x, q.br.y);
        ctx.lineTo(q.bl.x, q.bl.y);
        ctx.closePath();
    }

    class AbSkillVfxLabScene {
        constructor(game) {
            this.game = game;
            this.exitPortal = { x: 50, y: 50, size: 40, name: '返回主城' };
        }

        checkInteraction(player) {
            const dx = this.exitPortal.x - player.x;
            const dy = this.exitPortal.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < this.exitPortal.size / 2 + 30) {
                return [this.exitPortal];
            }
            return [];
        }

        drawBoard(ctx, battle) {
            const ABS = window.AutoBattleSimulator;
            if (!ABS || !battle || !battle.board) return;
            const game = this.game;
            const cw = (game && game.canvas) ? game.canvas.width / 2 : (window.CONFIG ? CONFIG.CANVAS_WIDTH : 1200);
            const ch = (game && game.canvas) ? game.canvas.height / 2 : (window.CONFIG ? CONFIG.CANVAS_HEIGHT : 800);
            const board = battle.board;
            const ox = battle.origin.x;
            const oy = battle.origin.y;
            const cols = board.cols || 4;
            const rows = board.rows || 3;

            ctx.fillStyle = '#0a0c12';
            ctx.fillRect(0, 0, cw, ch);

            ctx.fillStyle = 'rgba(212, 180, 90, 0.08)';
            ctx.font = '11px "Courier New", "Microsoft YaHei", monospace';
            ctx.fillText('自走棋 · 技能特效试验场', 16, 28);
            ctx.fillStyle = 'rgba(140, 160, 200, 0.45)';
            ctx.fillText('点击右侧技能列表预览特效 · ESC 返回', 16, 44);

            for (let side of ['ally', 'enemy']) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const q = ABS.cellQuad(c, r, side, board, ox, oy);
                        drawQuad(ctx, q);
                        ctx.fillStyle = side === 'ally'
                            ? 'rgba(40, 56, 72, 0.55)'
                            : 'rgba(56, 32, 40, 0.55)';
                        ctx.fill();
                        ctx.strokeStyle = side === 'ally'
                            ? 'rgba(100, 140, 180, 0.28)'
                            : 'rgba(180, 90, 90, 0.28)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            }

            const midX = ox + ABS.fieldSize(board).width / 2;
            ctx.strokeStyle = 'rgba(212, 180, 90, 0.18)';
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(midX, oy - 8);
            ctx.lineTo(midX, oy + ABS.fieldSize(board).height + 8);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        drawUnits(ctx, battle) {
            if (!battle) return;
            const cell = (battle.board && battle.board.cellSize) || 70;
            const labRatio = (battle.board && battle.board.vfxLabScale) || 1;
            const radius = window.AutoBattleSimulator
                ? Math.max(12, Math.floor(window.AutoBattleSimulator.unitSpriteRadius(cell) * Math.min(1, labRatio * 0.92)))
                : Math.max(12, cell * 0.28);
            const ABA = window.AutoBattlerAssets;
            const drawOne = (u) => {
                if (!u || !u.alive) return;
                const rp = window.AutoBattleSimulator && window.AutoBattleSimulator.getUnitRenderPos
                    ? window.AutoBattleSimulator.getUnitRenderPos(u)
                    : { x: u.x, y: u.y };
                const ux = rp.x;
                const uy = rp.y;
                ctx.fillStyle = 'rgba(0,0,0,0.45)';
                ctx.beginPath();
                ctx.ellipse(ux, uy + radius * 0.85, radius * 0.75, radius * 0.28, 0, 0, Math.PI * 2);
                ctx.fill();
                let drawn = false;
                if (ABA) {
                    if (u.side === 'ally' && u.baseClass) {
                        drawn = ABA.drawHero(ctx, u.baseClass, ux, uy, radius, 1);
                    } else if (u.templateId) {
                        drawn = ABA.drawEnemy(ctx, u.templateId, ux, uy, radius, 1);
                    }
                }
                if (!drawn) {
                    const grd = ctx.createRadialGradient(ux, uy - 4, 2, ux, uy, radius);
                    grd.addColorStop(0, '#ffffff55');
                    grd.addColorStop(1, u.color || '#888');
                    ctx.fillStyle = grd;
                    ctx.beginPath();
                    ctx.arc(ux, uy, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.strokeStyle = u.side === 'ally' ? 'rgba(120,200,255,0.5)' : 'rgba(255,120,120,0.45)';
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(ux - radius, uy - radius - 10, radius * 2, 5);
                ctx.fillStyle = u.side === 'ally' ? '#6aaa7a' : '#c45a5a';
                ctx.fillRect(ux - radius, uy - radius - 10, radius * 2 * Math.max(0.05, u.hp / u.maxHp), 5);
            };
            (battle.allies || []).forEach(drawOne);
            (battle.enemies || []).forEach(drawOne);
        }

        drawPortal(ctx) {
            const p = this.exitPortal;
            ctx.fillStyle = '#4488ff';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#cce8ff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('回城', p.x, p.y + 4);
            ctx.textAlign = 'left';
        }

        draw(ctx, battle) {
            this.drawBoard(ctx, battle);
            this.drawUnits(ctx, battle);
            if (window.AutoBattleSimulator) {
                window.AutoBattleSimulator.drawUnitAuras(ctx, battle);
                window.AutoBattleSimulator.drawFx(ctx, battle);
            }
            this.drawPortal(ctx);
        }
    }

    class AbSkillVfxLabUI {
        constructor(game) {
            this.game = game;
            this._selectedId = null;
            this._filter = 'all';
            this._bindOnce();
        }

        _bindOnce() {
            const closeBtn = document.getElementById('close-ab-skill-vfx-lab');
            if (closeBtn) closeBtn.addEventListener('click', () => this.game.exitAbSkillVfxLab());
            const clearBtn = document.getElementById('ab-vfx-lab-clear');
            if (clearBtn) clearBtn.addEventListener('click', () => {
                if (this.game._abVfxLabBattle && window.AutoBattleSimulator) {
                    window.AutoBattleSimulator.clearVfxPreview(this.game._abVfxLabBattle);
                }
            });
            const replayBtn = document.getElementById('ab-vfx-lab-replay');
            if (replayBtn) replayBtn.addEventListener('click', () => {
                if (this._selectedId) this.playSkill(this._selectedId);
            });
            const filterEl = document.getElementById('ab-vfx-lab-filter');
            if (filterEl) {
                filterEl.addEventListener('change', () => {
                    this._filter = filterEl.value;
                    this.renderList();
                });
            }
        }

        open() {
            const modal = document.getElementById('ab-skill-vfx-lab-modal');
            if (modal && modal.parentElement !== document.body) {
                document.body.appendChild(modal);
            }
            if (modal) modal.classList.add('show');
            this.renderList();
            this.renderStatus('');
        }

        close() {
            document.getElementById('ab-skill-vfx-lab-modal')?.classList.remove('show');
        }

        renderStatus(text) {
            const el = document.getElementById('ab-vfx-lab-status');
            if (el) el.textContent = text || '—';
        }

        playSkill(skillId) {
            const ABS = window.AutoBattleSimulator;
            const battle = this.game._abVfxLabBattle;
            if (!ABS || !battle) return;
            ABS.clearVfxPreview(battle);
            this.game._lastAbVfxLabTick = performance.now();
            const ok = ABS.previewSkillVfx(battle, skillId);
            const def = (ABS.listVfxLabSkills() || []).find((s) => s.id === skillId);
            this._selectedId = skillId;
            this.renderList();
            this.renderStatus(ok
                ? `播放：${def ? def.name : skillId}`
                : `无法预览：${skillId}`);
        }

        renderList() {
            const container = document.getElementById('ab-vfx-lab-skill-list');
            if (!container || !window.AutoBattleSimulator) return;
            const skills = window.AutoBattleSimulator.listVfxLabSkills() || [];
            const filter = this._filter || 'all';
            const groups = { warrior: [], archer: [], mage: [], assassin: [], generic: [] };
            skills.forEach((s) => {
                const tags = s.classTags || [];
                let placed = false;
                ['warrior', 'archer', 'mage', 'assassin'].forEach((cls) => {
                    if (tags.includes(cls) && (filter === 'all' || filter === cls)) {
                        groups[cls].push(s);
                        placed = true;
                    }
                });
                if (!placed && (filter === 'all' || filter === 'generic')) {
                    groups.generic.push(s);
                }
            });
            let html = '';
            ['warrior', 'archer', 'mage', 'assassin', 'generic'].forEach((cls) => {
                const list = groups[cls];
                if (!list.length) return;
                html += `<div class="ab-vfx-lab-group"><div class="ab-vfx-lab-group-title">${CLASS_LABEL[cls] || cls}</div>`;
                list.forEach((s) => {
                    const sel = s.id === this._selectedId ? ' selected' : '';
                    html += `<button type="button" class="ab-vfx-lab-skill-row${sel}" data-vfx-skill="${s.id}">
                        <span class="ab-vfx-lab-skill-name">${escapeHtml(s.name || s.id)}</span>
                        <span class="ab-vfx-lab-skill-desc">${escapeHtml(s.description || '')}</span>
                    </button>`;
                });
                html += '</div>';
            });
            container.innerHTML = html || '<p class="ab-vfx-lab-empty">暂无技能</p>';
            container.querySelectorAll('[data-vfx-skill]').forEach((btn) => {
                btn.addEventListener('click', () => this.playSkill(btn.getAttribute('data-vfx-skill')));
            });
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    window.AbSkillVfxLabScene = AbSkillVfxLabScene;
    window.AbSkillVfxLabUI = AbSkillVfxLabUI;
})();
