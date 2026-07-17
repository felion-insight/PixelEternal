/**
 * Pixel Eternal - Automated Class Balance Tester
 * 自动化全职业数值与机制平衡性测试脚本
 */
(function () {
    'use strict';

    // 28个职业的完整配置列表
    const CLASSES_TO_TEST = [
        // 基础职业 (Base Classes)
        { id: 'warrior', name: '战士', tier: '基础', baseClass: 'warrior', firstAdvancement: null, secondAdvancement: null },
        { id: 'archer', name: '游侠', tier: '基础', baseClass: 'archer', firstAdvancement: null, secondAdvancement: null },
        { id: 'mage', name: '法师', tier: '基础', baseClass: 'mage', firstAdvancement: null, secondAdvancement: null },
        { id: 'assassin', name: '刺客', tier: '基础', baseClass: 'assassin', firstAdvancement: null, secondAdvancement: null },

        // 一转职业 (First Advancements)
        { id: 'knight', name: '骑士', tier: '一转', baseClass: 'warrior', firstAdvancement: 'knight', secondAdvancement: null },
        { id: 'berserker', name: '狂战士', tier: '一转', baseClass: 'warrior', firstAdvancement: 'berserker', secondAdvancement: null },
        { id: 'guardian', name: '守护者', tier: '一转', baseClass: 'warrior', firstAdvancement: 'guardian', secondAdvancement: null },
        { id: 'ranger', name: '巡林客', tier: '一转', baseClass: 'archer', firstAdvancement: 'ranger', secondAdvancement: null },
        { id: 'marksman', name: '神射手', tier: '一转', baseClass: 'archer', firstAdvancement: 'marksman', secondAdvancement: null },
        { id: 'windrunner', name: '风行者', tier: '一转', baseClass: 'archer', firstAdvancement: 'windrunner', secondAdvancement: null },
        { id: 'wizard', name: '巫师', tier: '一转', baseClass: 'mage', firstAdvancement: 'wizard', secondAdvancement: null },
        { id: 'sage', name: '贤者', tier: '一转', baseClass: 'mage', firstAdvancement: 'sage', secondAdvancement: null },
        { id: 'warlock', name: '术士', tier: '一转', baseClass: 'mage', firstAdvancement: 'warlock', secondAdvancement: null },
        { id: 'shadowdancer', name: '影舞者', tier: '一转', baseClass: 'assassin', firstAdvancement: 'shadowdancer', secondAdvancement: null },
        { id: 'trickster', name: '诡术师', tier: '一转', baseClass: 'assassin', firstAdvancement: 'trickster', secondAdvancement: null },
        { id: 'venomancer', name: '毒术士', tier: '一转', baseClass: 'assassin', firstAdvancement: 'venomancer', secondAdvancement: null },

        // 二转职业 (Second Advancements)
        { id: 'paladin', name: '圣骑士', tier: '二转', baseClass: 'warrior', firstAdvancement: 'knight', secondAdvancement: 'paladin' },
        { id: 'destroyer', name: '毁灭者', tier: '二转', baseClass: 'warrior', firstAdvancement: 'berserker', secondAdvancement: 'destroyer' },
        { id: 'temple_knight', name: '神殿骑士', tier: '二转', baseClass: 'warrior', firstAdvancement: 'guardian', secondAdvancement: 'temple_knight' },
        { id: 'beastmaster', name: '兽王', tier: '二转', baseClass: 'archer', firstAdvancement: 'ranger', secondAdvancement: 'beastmaster' },
        { id: 'deadeye', name: '鹰眼', tier: '二转', baseClass: 'archer', firstAdvancement: 'marksman', secondAdvancement: 'deadeye' },
        { id: 'phantom', name: '幻影', tier: '二转', baseClass: 'archer', firstAdvancement: 'windrunner', secondAdvancement: 'phantom' },
        { id: 'archmage', name: '大法师', tier: '二转', baseClass: 'mage', firstAdvancement: 'wizard', secondAdvancement: 'archmage' },
        { id: 'oracle', name: '神谕者', tier: '二转', baseClass: 'mage', firstAdvancement: 'sage', secondAdvancement: 'oracle' },
        { id: 'necromancer', name: '死灵法师', tier: '二转', baseClass: 'mage', firstAdvancement: 'warlock', secondAdvancement: 'necromancer' },
        { id: 'nightblade', name: '夜刃', tier: '二转', baseClass: 'assassin', firstAdvancement: 'shadowdancer', secondAdvancement: 'nightblade' },
        { id: 'illusionist', name: '幻术师', tier: '二转', baseClass: 'assassin', firstAdvancement: 'trickster', secondAdvancement: 'illusionist' },
        { id: 'plaguebringer', name: '瘟疫使者', tier: '二转', baseClass: 'assassin', firstAdvancement: 'venomancer', secondAdvancement: 'plaguebringer' }
    ];

    class AutomatedBalanceTester {
        constructor() {
            this.isRunning = false;
            this.currentClassIndex = 0;
            this.testDurationMs = 5000; // 默认每个职业测试5秒
            this.testLevel = 60; // 默认测试等级60
            this.infiniteResource = false; // 默认不开启无限资源，以测试资源循环
            this.scenario = 'burst_dps';
            this.scenarios = ['burst_dps'];
            this.rotationMode = 'priority';
            this.randomSeed = 1;
            this.equipmentPreset = 'preserve';
            this.classesToTest = [...CLASSES_TO_TEST];
            this.results = [];
            this.originalState = null;
            this.timerId = null;
            this.tickId = null;
            this.currentClassStartTime = 0;
            this.currentClassDamage = 0;
            this.currentMetrics = null;

            this.injectCSS();
            this.initUI();
        }

        /**
         * 注入测试界面所需的CSS样式
         */
        injectCSS() {
            if (document.getElementById('balance-tester-styles')) return;
            const style = document.createElement('style');
            style.id = 'balance-tester-styles';
            style.textContent = `
                /* 按钮样式 */
                .pe-btn--warning {
                    background: #e0a800 !important;
                    border-color: #d39e00 !important;
                    color: #fff !important;
                }
                .pe-btn--warning:hover {
                    background: #c69500 !important;
                    border-color: #b38600 !important;
                }

                /* 配置弹窗 */
                .bt-modal {
                    display: none;
                    position: fixed;
                    left: 50%;
                    top: 50%;
                    transform: translate(-50%, -50%);
                    width: 600px;
                    max-width: 90%;
                    max-height: 85vh;
                    background: rgba(20, 20, 30, 0.98);
                    border: 3px solid #ffd700;
                    border-radius: 12px;
                    box-shadow: 0 0 25px rgba(0, 0, 0, 0.7), 0 0 15px rgba(255, 215, 0, 0.2);
                    z-index: 9999;
                    color: #ccc;
                    font-family: 'Microsoft YaHei', sans-serif;
                    overflow: hidden;
                    flex-direction: column;
                }
                .bt-modal.show {
                    display: flex !important;
                }
                .bt-header {
                    background: linear-gradient(90deg, #ffd700, #ffaa00);
                    color: #111;
                    padding: 12px 20px;
                    font-weight: bold;
                    font-size: 18px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .bt-header h3 {
                    margin: 0;
                    font-size: 18px;
                }
                .bt-close {
                    background: none;
                    border: none;
                    color: #111;
                    font-size: 24px;
                    cursor: pointer;
                    line-height: 1;
                }
                .bt-content {
                    padding: 20px;
                    overflow-y: auto;
                    flex: 1;
                }
                .bt-footer {
                    padding: 15px 20px;
                    background: rgba(10, 10, 15, 0.9);
                    border-top: 1px solid #444;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }

                /* 配置表单 */
                .bt-form-group {
                    margin-bottom: 16px;
                }
                .bt-form-group label {
                    display: block;
                    margin-bottom: 6px;
                    color: #ffd700;
                    font-weight: bold;
                }
                .bt-form-row {
                    display: flex;
                    gap: 15px;
                }
                .bt-form-row .bt-form-group {
                    flex: 1;
                }
                .bt-input, .bt-select {
                    width: 100%;
                    padding: 8px 12px;
                    background: #222;
                    border: 1px solid #555;
                    border-radius: 4px;
                    color: #fff;
                    box-sizing: border-box;
                }
                .bt-checkbox-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    color: #ccc;
                    user-select: none;
                }

                /* 职业选择网格 */
                .bt-class-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 8px;
                    background: rgba(0,0,0,0.3);
                    padding: 10px;
                    border-radius: 6px;
                    border: 1px solid #333;
                    max-height: 200px;
                    overflow-y: auto;
                }
                .bt-class-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    padding: 4px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 4px;
                }

                /* 进度覆盖层 */
                .bt-progress-overlay {
                    display: none;
                    position: fixed;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.85);
                    z-index: 10000;
                    justify-content: center;
                    align-items: center;
                    flex-direction: column;
                    color: #fff;
                    font-family: 'Microsoft YaHei', sans-serif;
                }
                .bt-progress-overlay.show {
                    display: flex !important;
                }
                .bt-progress-box {
                    width: 500px;
                    background: #1a1a24;
                    border: 2px solid #ffd700;
                    border-radius: 10px;
                    padding: 25px;
                    box-shadow: 0 0 30px rgba(0,0,0,0.8);
                    text-align: center;
                }
                .bt-progress-title {
                    font-size: 20px;
                    color: #ffd700;
                    margin-bottom: 15px;
                    font-weight: bold;
                }
                .bt-progress-bar-bg {
                    width: 100%;
                    height: 20px;
                    background: #333;
                    border-radius: 10px;
                    overflow: hidden;
                    margin-bottom: 15px;
                    border: 1px solid #555;
                }
                .bt-progress-bar-fill {
                    width: 0%;
                    height: 100%;
                    background: linear-gradient(90deg, #ffd700, #ffaa00);
                    transition: width 0.1s linear;
                }
                .bt-progress-details {
                    font-size: 14px;
                    color: #ccc;
                    margin-bottom: 20px;
                    line-height: 1.6;
                }
                .bt-realtime-dps {
                    font-size: 24px;
                    color: #ff4444;
                    font-weight: bold;
                    font-family: monospace;
                    margin: 10px 0;
                }

                /* 报告面板 */
                .bt-report-tabs {
                    display: flex;
                    border-bottom: 2px solid #ffd700;
                    margin-bottom: 15px;
                }
                .bt-report-tab {
                    padding: 8px 16px;
                    cursor: pointer;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid #444;
                    border-bottom: none;
                    border-radius: 4px 4px 0 0;
                    margin-right: 4px;
                    font-size: 14px;
                }
                .bt-report-tab.active {
                    background: #ffd700;
                    color: #111;
                    font-weight: bold;
                    border-color: #ffd700;
                }
                .bt-tab-content {
                    display: none;
                    height: 400px;
                    overflow-y: auto;
                }
                .bt-tab-content.active {
                    display: block;
                }

                /* 排行榜表格 */
                .bt-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }
                .bt-table th, .bt-table td {
                    padding: 8px 10px;
                    text-align: left;
                    border-bottom: 1px solid #333;
                }
                .bt-table th {
                    background: rgba(255,255,255,0.08);
                    color: #ffd700;
                    font-weight: bold;
                }
                .bt-table tr:hover {
                    background: rgba(255,255,255,0.03);
                }
                .bt-rank-1 { color: #ff3333; font-weight: bold; }
                .bt-rank-2 { color: #ffaa00; font-weight: bold; }
                .bt-rank-3 { color: #ffd700; font-weight: bold; }

                /* 警告卡片 */
                .bt-alert-card {
                    background: rgba(224, 168, 0, 0.15);
                    border-left: 4px solid #e0a800;
                    padding: 12px;
                    border-radius: 4px;
                    margin-bottom: 12px;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .bt-alert-card.danger {
                    background: rgba(255, 68, 68, 0.15);
                    border-left-color: #ff4444;
                }
                .bt-alert-card h4 {
                    margin: 0 0 6px 0;
                    color: #fff;
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * 初始化测试UI界面
         */
        initUI() {
            // 1. 在技能实验场工具栏中添加“数值平衡测试”按钮
            const checkInterval = setInterval(() => {
                const toolbar = document.querySelector('.skill-lab-toolbar');
                if (toolbar && !document.getElementById('skill-lab-balance-test')) {
                    clearInterval(checkInterval);
                    
                    const testBtn = document.createElement('button');
                    testBtn.type = 'button';
                    testBtn.id = 'skill-lab-balance-test';
                    testBtn.className = 'pe-btn pe-btn--sm pe-btn--warning';
                    testBtn.textContent = '数值平衡测试';
                    testBtn.style.marginLeft = '10px';
                    testBtn.addEventListener('click', () => this.openConfigModal());

                    // 插入到“清空假人”按钮后面
                    const clearBtn = document.getElementById('skill-lab-clear-dummies');
                    if (clearBtn) {
                        clearBtn.parentNode.insertBefore(testBtn, clearBtn.nextSibling);
                    } else {
                        toolbar.appendChild(testBtn);
                    }
                }
            }, 500);

            // 2. 创建配置模态框
            this.createConfigModal();

            // 3. 创建进度覆盖层
            this.createProgressOverlay();

            // 4. 创建报告模态框
            this.createReportModal();
        }

        /**
         * 创建配置弹窗
         */
        createConfigModal() {
            if (document.getElementById('bt-config-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'bt-config-modal';
            modal.className = 'bt-modal';
            
            let classCheckboxesHTML = '';
            CLASSES_TO_TEST.forEach(c => {
                classCheckboxesHTML += `
                    <div class="bt-class-item">
                        <input type="checkbox" id="bt-chk-${c.id}" value="${c.id}" checked>
                        <label for="bt-chk-${c.id}">${c.name} (${c.tier})</label>
                    </div>
                `;
            });

            modal.innerHTML = `
                <div class="bt-header">
                    <h3>全职业数值平衡性自动化测试</h3>
                    <button type="button" class="bt-close" id="bt-config-close">&times;</button>
                </div>
                <div class="bt-content">
                    <p style="margin-top: 0; font-size: 13px; color: #aaa;">
                        此脚本将自动控制角色，依次切换各个职业，并自动装配技能，在技能试验场中对假人进行持续输出。
                        测试结束后，将生成详细的DPS排行、技能伤害占比以及职业机制/数值平衡性分析报告。
                    </p>
                    <div class="bt-form-row">
                        <div class="bt-form-group">
                            <label for="bt-input-duration">单职业测试时长 (秒)</label>
                            <input type="number" id="bt-input-duration" class="bt-input" min="3" max="30" value="5">
                        </div>
                        <div class="bt-form-group">
                            <label for="bt-input-level">测试角色等级</label>
                            <input type="number" id="bt-input-level" class="bt-input" min="1" max="999" value="60">
                        </div>
                    </div>
                    <div class="bt-form-group">
                        <label for="bt-select-scenario">测试场景</label>
                        <select id="bt-select-scenario" class="bt-select">
                            <option value="burst_dps">爆发输出（无敌木桩）</option>
                            <option value="sustained_dps">持续输出（资源循环）</option>
                            <option value="multi_target">多目标范围收益</option>
                            <option value="survivability">生存与承伤（攻击型怪物桩）</option>
                            <option value="sustain_healing">受伤与治疗反应</option>
                            <option value="buff_status">Buff、异常与协同</option>
                            <option value="feel_timing">操作节奏与卡手</option>
                            <option value="vfx_coverage">技能视觉覆盖</option>
                        </select>
                    </div>
                    <div class="bt-form-group">
                        <label for="bt-select-equipment-preset">确定性装备预设</label>
                        <select id="bt-select-equipment-preset" class="bt-select">
                            <option value="preserve">保持当前装备（兼容模式）</option>
                            <option value="naked">Naked（无装备）</option>
                            <option value="standard10">Standard10（Lv10 标准装）</option>
                            <option value="legendary">Legendary（全身传说）</option>
                            <option value="set2">Set2（职业亲和 2 件套）</option>
                            <option value="set4">Set4（职业亲和 4 件套）</option>
                            <option value="build">Build（职业流派核心装）</option>
                            <option value="affinity_mismatch">Affinity mismatch（错职业亲和）</option>
                        </select>
                    </div>
                    <div class="bt-form-group">
                        <label class="bt-checkbox-label">
                            <input type="checkbox" id="bt-input-infinite-resource">
                            <span>无限职业资源 (开启后将自动补满 Rage/Mana/Focus 等，不测试资源循环瓶颈)</span>
                        </label>
                    </div>
                    <div class="bt-form-group">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <label style="margin: 0;">选择测试职业</label>
                            <div style="font-size: 12px; display: flex; gap: 10px;">
                                <span style="cursor: pointer; color: #ffd700;" id="bt-select-all">全选</span>
                                <span style="cursor: pointer; color: #ffd700;" id="bt-select-none">全不选</span>
                                <span style="cursor: pointer; color: #ffd700;" id="bt-select-t2">仅二转</span>
                            </div>
                        </div>
                        <div class="bt-class-grid">
                            ${classCheckboxesHTML}
                        </div>
                    </div>
                </div>
                <div class="bt-footer">
                    <button type="button" class="pe-btn pe-btn--sm pe-btn--danger" id="bt-config-cancel" style="padding: 6px 16px;">取消</button>
                    <button type="button" class="pe-btn pe-btn--sm pe-btn--warning" id="bt-config-start" style="padding: 6px 20px; font-weight: bold;">开始测试</button>
                </div>
            `;

            document.body.appendChild(modal);

            // 绑定事件
            document.getElementById('bt-config-close').addEventListener('click', () => this.closeConfigModal());
            document.getElementById('bt-config-cancel').addEventListener('click', () => this.closeConfigModal());
            document.getElementById('bt-config-start').addEventListener('click', () => this.startTestFromUI());

            document.getElementById('bt-select-all').addEventListener('click', () => {
                CLASSES_TO_TEST.forEach(c => {
                    document.getElementById(`bt-chk-${c.id}`).checked = true;
                });
            });
            document.getElementById('bt-select-none').addEventListener('click', () => {
                CLASSES_TO_TEST.forEach(c => {
                    document.getElementById(`bt-chk-${c.id}`).checked = false;
                });
            });
            document.getElementById('bt-select-t2').addEventListener('click', () => {
                CLASSES_TO_TEST.forEach(c => {
                    document.getElementById(`bt-chk-${c.id}`).checked = (c.tier === '二转');
                });
            });
        }

        /**
         * 创建进度覆盖层
         */
        createProgressOverlay() {
            if (document.getElementById('bt-progress-overlay')) return;

            const overlay = document.createElement('div');
            overlay.id = 'bt-progress-overlay';
            overlay.className = 'bt-progress-overlay';
            overlay.innerHTML = `
                <div class="bt-progress-box">
                    <div class="bt-progress-title">全职业数值平衡测试中</div>
                    <div class="bt-progress-bar-bg">
                        <div class="bt-progress-bar-fill" id="bt-progress-fill"></div>
                    </div>
                    <div class="bt-progress-details" id="bt-progress-text">
                        正在准备测试环境...
                    </div>
                    <div style="font-size: 13px; color: #888; margin-bottom: 15px;">当前职业实时 DPS:</div>
                    <div class="bt-realtime-dps" id="bt-progress-dps">0</div>
                    <button type="button" class="pe-btn pe-btn--sm pe-btn--danger" id="bt-progress-stop" style="padding: 6px 20px;">停止测试</button>
                </div>
            `;

            document.body.appendChild(overlay);
            document.getElementById('bt-progress-stop').addEventListener('click', () => this.stopTest());
        }

        /**
         * 创建报告模态框
         */
        createReportModal() {
            if (document.getElementById('bt-report-modal')) return;

            const modal = document.createElement('div');
            modal.id = 'bt-report-modal';
            modal.className = 'bt-modal';
            modal.style.width = '800px';
            modal.style.maxHeight = '90vh';

            modal.innerHTML = `
                <div class="bt-header">
                    <h3>测试结果与平衡性分析报告</h3>
                    <button type="button" class="bt-close" id="bt-report-close">&times;</button>
                </div>
                <div class="bt-content">
                    <div class="bt-report-tabs">
                        <div class="bt-report-tab active" data-tab="overview">DPS 排行榜</div>
                        <div class="bt-report-tab" data-tab="details">职业详细数据</div>
                        <div class="bt-report-tab" data-tab="analysis">平衡性诊断</div>
                    </div>

                    <!-- 标签页 1: DPS 排行榜 -->
                    <div class="bt-tab-content active" id="bt-tab-overview">
                        <table class="bt-table" id="bt-overview-table">
                            <thead>
                                <tr>
                                    <th style="width: 60px; text-align: center;">排名</th>
                                    <th>职业名称</th>
                                    <th>职业阶级</th>
                                    <th style="text-align: right;">总伤害</th>
                                    <th style="text-align: right;">平均 DPS</th>
                                    <th style="text-align: right;">伤害占比</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- 动态插入 -->
                            </tbody>
                        </table>
                    </div>

                    <!-- 标签页 2: 职业详细数据 -->
                    <div class="bt-tab-content" id="bt-tab-details">
                        <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center;">
                            <span style="font-weight: bold; color: #ffd700;">选择职业:</span>
                            <select id="bt-detail-select" class="bt-select" style="width: 200px; display: inline-block;">
                                <!-- 动态插入 -->
                            </select>
                        </div>
                        <div id="bt-detail-content">
                            <!-- 动态插入 -->
                        </div>
                    </div>

                    <!-- 标签页 3: 平衡性诊断 -->
                    <div class="bt-tab-content" id="bt-tab-analysis">
                        <div id="bt-analysis-content">
                            <!-- 动态插入 -->
                        </div>
                    </div>
                </div>
                <div class="bt-footer">
                    <button type="button" class="pe-btn pe-btn--sm" id="bt-report-copy" style="padding: 6px 16px; background: #444; color: #fff;">复制 Markdown 报告</button>
                    <button type="button" class="pe-btn pe-btn--sm pe-btn--warning" id="bt-report-download" style="padding: 6px 16px;">下载 Markdown 报告</button>
                    <button type="button" class="pe-btn pe-btn--sm pe-btn--danger" id="bt-report-done" style="padding: 6px 20px;">关闭</button>
                </div>
            `;

            document.body.appendChild(modal);

            // 绑定事件
            document.getElementById('bt-report-close').addEventListener('click', () => this.closeReportModal());
            document.getElementById('bt-report-done').addEventListener('click', () => this.closeReportModal());
            
            // 标签页切换
            const tabs = modal.querySelectorAll('.bt-report-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');

                    modal.querySelectorAll('.bt-tab-content').forEach(c => c.classList.remove('active'));
                    document.getElementById(`bt-tab-${tab.dataset.tab}`).classList.add('active');
                });
            });

            // 详细数据下拉菜单切换
            document.getElementById('bt-detail-select').addEventListener('change', (e) => {
                this.renderClassDetails(e.target.value);
            });

            // 复制与下载报告
            document.getElementById('bt-report-copy').addEventListener('click', () => this.copyMarkdownReport());
            document.getElementById('bt-report-download').addEventListener('click', () => this.downloadMarkdownReport());
        }

        openConfigModal() {
            document.getElementById('bt-config-modal').classList.add('show');
            if (window.game && typeof window.game.syncGamePausedState === 'function') {
                window.game.paused = true;
                window.game.syncGamePausedState();
            }
        }

        closeConfigModal() {
            document.getElementById('bt-config-modal').classList.remove('show');
            if (window.game && typeof window.game.syncGamePausedState === 'function') {
                window.game.paused = false;
                window.game.syncGamePausedState();
            }
        }

        closeReportModal() {
            document.getElementById('bt-report-modal').classList.remove('show');
            if (window.game && typeof window.game.syncGamePausedState === 'function') {
                window.game.paused = false;
                window.game.syncGamePausedState();
            }
        }

        /**
         * 从UI配置中获取参数并启动测试
         */
        startTestFromUI() {
            const duration = parseInt(document.getElementById('bt-input-duration').value, 10) || 5;
            const level = parseInt(document.getElementById('bt-input-level').value, 10) || 60;
            const infiniteResource = document.getElementById('bt-input-infinite-resource').checked;
            const scenario = document.getElementById('bt-select-scenario').value;
            const equipmentPreset = document.getElementById('bt-select-equipment-preset').value;

            const selectedClassIds = [];
            CLASSES_TO_TEST.forEach(c => {
                if (document.getElementById(`bt-chk-${c.id}`).checked) {
                    selectedClassIds.push(c.id);
                }
            });

            if (selectedClassIds.length === 0) {
                alert('请至少选择一个职业进行测试！');
                return;
            }

            this.closeConfigModal();
            
            const selectedClasses = CLASSES_TO_TEST.filter(c => selectedClassIds.includes(c.id));
            this.startTest({
                duration: duration * 1000,
                level,
                infiniteResource,
                scenario,
                equipmentPreset,
                classes: selectedClasses
            });
        }

        /**
         * 启动自动化测试流程
         */
        startTest(options = {}) {
            if (this.isRunning) return;
            
            const g = window.game;
            if (!g) {
                alert('未找到游戏实例！');
                return;
            }

            // 必须在技能实验场中进行
            if (g.currentScene !== 'skill_lab') {
                if (typeof g.enterSkillLab === 'function') {
                    g.enterSkillLab();
                } else {
                    alert('请先进入技能实验场！');
                    return;
                }
            }

            this.isRunning = true;
            this.testDurationMs = options.duration || 5000;
            this.testLevel = options.level || 60;
            this.infiniteResource = !!options.infiniteResource;
            this.scenario = options.scenario || 'burst_dps';
            this.scenarios = Array.isArray(options.scenarios) && options.scenarios.length
                ? options.scenarios : [this.scenario];
            this.rotationMode = options.rotationMode || 'priority';
            this.randomSeed = Number.isFinite(options.seed) ? options.seed : 1;
            this.equipmentPreset = String(options.equipmentPreset || 'preserve').toLowerCase();
            const knownPresets = window.SKILL_LAB_EQUIPMENT_PRESETS || ['preserve'];
            if (!knownPresets.includes(this.equipmentPreset)) {
                this.isRunning = false;
                throw new Error('未知装备测试预设: ' + this.equipmentPreset);
            }
            this.classesToTest = options.classes || [...CLASSES_TO_TEST];
            this.currentClassIndex = 0;
            this.results = [];

            // 保存玩家当前状态，以便测试结束后还原
            this.originalState = typeof window.captureSkillLabPlayerState === 'function'
                ? window.captureSkillLabPlayerState(g.player)
                : {
                    classData: JSON.parse(JSON.stringify(g.player.classData)),
                    level: g.player.level,
                    equipment: Object.assign({}, g.player.equipment || {}),
                    skillHotbar: g.player.skillHotbar ? JSON.parse(JSON.stringify(g.player.skillHotbar)) : null
                };
            this.originalState.gameEquipmentEffects = Array.isArray(g.equipmentEffects)
                ? g.equipmentEffects.slice() : [];

            // 显示进度覆盖层
            document.getElementById('bt-progress-overlay').classList.add('show');
            
            // 暂停游戏正常更新，但我们手动更新测试
            g.paused = false;

            this.runNextClass();
        }

        /**
         * 运行下一个职业的测试
         */
        getScenarioConfig() {
            const configs = {
                burst_dps: { dummyCount: 3, distance: 60, durationMs: this.testDurationMs, invincible: true, chasePlayer: false },
                sustained_dps: { dummyCount: 1, distance: 70, durationMs: Math.max(this.testDurationMs, 15000), invincible: true, chasePlayer: false },
                multi_target: { dummyCount: 6, distance: 65, durationMs: this.testDurationMs, invincible: true, chasePlayer: false },
                survivability: { dummyCount: 1, distance: 30, durationMs: Math.max(this.testDurationMs, 15000), invincible: true, chasePlayer: true, monsterType: 'goblin' },
                sustain_healing: { dummyCount: 1, distance: 30, durationMs: Math.max(this.testDurationMs, 15000), invincible: true, chasePlayer: true, monsterType: 'goblin' },
                buff_status: { dummyCount: 3, distance: 65, durationMs: Math.max(this.testDurationMs, 10000), invincible: true, chasePlayer: false },
                feel_timing: { dummyCount: 1, distance: 65, durationMs: this.testDurationMs, invincible: true, chasePlayer: false },
                vfx_coverage: { dummyCount: 1, distance: 65, durationMs: this.testDurationMs, invincible: true, chasePlayer: false }
            };
            return configs[this.scenario] || configs.burst_dps;
        }

        setupScenarioDummies(g, p) {
            const cfg = this.getScenarioConfig();
            const count = cfg.dummyCount;
            const ang = p.angle || 0;
            const spacing = count > 3 ? 0.22 : 0.25;
            for (let i = 0; i < count; i++) {
                const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spacing;
                const distance = cfg.distance + (i % 2) * 5;
                const x = p.x + Math.cos(ang + offset) * distance;
                const y = p.y + Math.sin(ang + offset) * distance;
                const options = {
                    invincible: cfg.invincible,
                    chasePlayer: cfg.chasePlayer,
                    facingAngle: ang + Math.PI
                };
                if (cfg.monsterType && typeof g.skillLabScene.addMonsterDummy === 'function') {
                    g.skillLabScene.addMonsterDummy(x, y, cfg.monsterType, options);
                } else {
                    g.skillLabScene.addDummy(x, y, options);
                }
            }
        }

        selectSkillForScenario(g, target) {
            const candidates = [];
            for (let i = 0; i < 4; i++) {
                const skillDef = g._getClassSkillDefForHotbarSlot(i);
                if (skillDef) candidates.push({ slot: i, skillDef });
            }
            if (!candidates.length) return null;
            if (this.scenario === 'sustain_healing') {
                const healing = candidates.find(item => {
                    const tags = item.skillDef.effectTags || [];
                    const text = `${item.skillDef.id || ''} ${item.skillDef.description || ''}`.toLowerCase();
                    return tags.includes('heal') || tags.includes('support') || /heal|治疗|回复|护盾|shield/.test(text);
                });
                if (healing) return healing;
            }
            if (this.scenario === 'buff_status') {
                const support = candidates.find(item => {
                    const tags = item.skillDef.effectTags || [];
                    return tags.includes('buff') || tags.includes('debuff') || (item.skillDef.statusEffects || []).length > 0;
                });
                if (support) return support;
            }
            // 输出测试不能按快捷栏顺序永远优先释放无伤害的团队/姿态技能。
            // 例如鹰眼的“屏息”原本会一直可准备，从而把狙击完全挤出轮转。
            const scored = candidates.map(item => {
                const def = item.skillDef;
                const tags = def.effectTags || [];
                const multiplier = Number(def.damageMultiplier) || 0;
                let score = multiplier * 100;
                if (def.id === 'beast_pack') score += 60; // 兽群指令本身由宠物造成伤害
                if (tags.includes('buff') || tags.includes('support')) score -= 500;
                if (def.id === 'breath_hold') score -= 500;
                return Object.assign(item, { score });
            }).sort((a, b) => b.score - a.score);
            return scored.find(item => g._canPrepareClassSkillCast(item.skillDef))
                || scored[0];
        }

        runNextClass() {
            if (!this.isRunning) return;

            if (this.currentClassIndex >= this.classesToTest.length) {
                this.finishTest();
                return;
            }

            const g = window.game;
            const p = g.player;
            const targetClass = this.classesToTest[this.currentClassIndex];

            if (typeof g.resetSkillLabCombatState === 'function') {
                g.resetSkillLabCombatState();
            }

            // 1. 更新进度UI
            const progressPct = ((this.currentClassIndex) / this.classesToTest.length * 100).toFixed(0);
            document.getElementById('bt-progress-fill').style.width = `${progressPct}%`;
            document.getElementById('bt-progress-text').innerHTML = `
                正在测试职业 (${this.currentClassIndex + 1}/${this.classesToTest.length}): <strong style="color: #ffd700; font-size: 16px;">${targetClass.name} (${targetClass.tier})</strong><br>
                进度: ${progressPct}% | 单职业时长: ${this.testDurationMs / 1000}s | 等级: ${this.testLevel}<br>
                <span style="color: #888;">请勿进行手动操作...</span>
            `;

            // 2. 切换玩家职业与等级
            const classData = {
                baseClass: targetClass.baseClass,
                firstAdvancement: targetClass.firstAdvancement,
                secondAdvancement: targetClass.secondAdvancement
            };
            window.applySkillLabPlayerConfig(p, classData, this.testLevel);
            const presetResult = typeof window.applySkillLabEquipmentPreset === 'function'
                ? window.applySkillLabEquipmentPreset(p, this.equipmentPreset, {
                    level: this.testLevel,
                    seed: this.randomSeed
                })
                : { ok: this.equipmentPreset === 'preserve', preset: this.equipmentPreset };
            if (!presetResult.ok) {
                this.stopTest(false);
                throw new Error(presetResult.message || `无法应用装备预设 ${this.equipmentPreset}`);
            }
            this.currentEquipmentSummary = presetResult;
            p.hp = p.maxHp;

            // 3. 自动装配前4个主动技能到快捷栏
            const skills = window.getSkillLabSkillList(p.classData, this.testLevel);
            const activeSkills = skills.filter(s => s.type === 'active');
            
            // 清空快捷栏
            for (let i = 0; i < 4; i++) {
                window.assignSkillLabHotbar(p, i, null);
            }
            // 装配主动技能
            for (let i = 0; i < Math.min(4, activeSkills.length); i++) {
                window.assignSkillLabHotbar(p, i, activeSkills[i].id);
            }

            // 4. 按场景清理并重新生成测试目标
            g.skillLabScene.clearAllDummies();
            this.setupScenarioDummies(g, p);

            // 5. 重置战斗统计
            g.resetAllSkillLabBattleStats();
            this.currentClassStartTime = Date.now();
            this.currentClassDamage = 0;
            this.currentMetrics = window.SkillLabMetrics || null;
            if (this.currentMetrics) {
                this.currentMetrics.start({
                    scenario: this.scenario,
                    durationMs: this.testDurationMs,
                    seed: this.randomSeed
                });
            }

            // 6. 启动每帧战斗模拟 (每 30ms 触发一次，模拟极高频率的连招判定)
            if (this.tickId) clearInterval(this.tickId);
            this.tickId = setInterval(() => this.combatTick(), 30);

            // 7. 设置当前职业测试倒计时
            if (this.timerId) clearTimeout(this.timerId);
            this.timerId = setTimeout(() => {
                this.collectClassResult(targetClass);
                this.currentClassIndex++;
                this.runNextClass();
            }, this.testDurationMs);
        }

        /**
         * 模拟单帧战斗行为 (自动连招)
         */
        combatTick() {
            const g = window.game;
            const p = g.player;
            const dummies = g.skillLabScene.dummies;

            if (!p || !dummies || dummies.length === 0) return;

            // 1. 强制玩家面向木桩
            const target = dummies[0];
            const dx = target.x - p.x;
            const dy = target.y - p.y;
            p.angle = Math.atan2(dy, dx);

            // 2. 无限资源选项
            if (this.infiniteResource && p.classResource) {
                p.classResource.current = p.classResource.max;
            }
            const resourceBefore = p.classResource ? p.classResource.current : 0;

            // 3. 检查玩家是否处于施法或特殊动作状态，避免打断
            const now = Date.now();
            const hasActiveCastBar = p._skillCastBar && now < p._skillCastBar.endTime;
            const hasActiveLeap = !!p._leapSlam;
            const hasActiveBackstep = !!p._backstepShot;
            const hasActivePierce = !!p._pierceDash;
            const hasActiveDash = p.isDashing;

            // 安全防卡死机制：如果处于 isCastingSkill 状态，但没有任何活跃的动作/施法条，且持续时间超过 1.5 秒，则强制重置
            if (p.isCastingSkill) {
                if (!hasActiveCastBar && !hasActiveLeap && !hasActiveBackstep && !hasActivePierce && !hasActiveDash) {
                    if (!this._castStartTimestamp) {
                        this._castStartTimestamp = now;
                    } else if (now - this._castStartTimestamp > 1500) {
                        console.warn("检测到玩家施法状态卡死，强制重置施法状态");
                        if (this.currentMetrics) this.currentMetrics.recordStuckReset();
                        p.isCastingSkill = false;
                        p._skillCastBar = null;
                        this._castStartTimestamp = null;
                    }
                } else {
                    this._castStartTimestamp = null;
                }
            } else {
                this._castStartTimestamp = null;
            }

            // 如果正在吟唱、引导、跳跃、后撤或冲刺，不进行新的操作
            if (p.isCastingSkill || hasActiveCastBar || hasActiveLeap || hasActiveBackstep || hasActivePierce || hasActiveDash) {
                return;
            }

            // 圣骑士特殊机制：天使降临/审判净地需要圣盾层数，自动测试时如果圣盾层数为0，强行给圣盾，避免卡住或无法释放
            const activeProg = window.getActiveClassProgressionId ? window.getActiveClassProgressionId(p.classData) : null;
            if (activeProg === 'paladin') {
                if (typeof window.getHolyShieldStacks === 'function' && window.getHolyShieldStacks(p) <= 0) {
                    if (typeof window.grantHolyShieldStacks === 'function') {
                        window.grantHolyShieldStacks(p, 5, { stackMax: 5 });
                    }
                }
            }

            // 4. 按场景策略释放技能
            let castAny = false;
            const selected = this.selectSkillForScenario(g, target);
            if (selected && g._canPrepareClassSkillCast(selected.skillDef)) {
                    if (this.currentMetrics) this.currentMetrics.recordCastAttempt(selected.skillDef.id, 'cast');
                    g._castClassSkillHotbar(selected.slot, { angle: p.angle, lockTarget: target });
                    castAny = true;
            } else if (selected && this.currentMetrics) {
                this.currentMetrics.recordCastAttempt(selected.skillDef.id, 'blocked');
            }

            // 5. 如果所有技能都在CD或放不出，则进行普攻
            if (!castAny) {
                if (this.currentMetrics) this.currentMetrics.recordCastAttempt('basic', 'fallback_basic');
                p.attack(dummies);
            }
            if (this.currentMetrics) {
                const resourceAfter = p.classResource ? p.classResource.current : resourceBefore;
                this.currentMetrics.recordResource(resourceBefore, resourceAfter, p.classResource && p.classResource.max);
                this.currentMetrics.sample(p);
            }

            // 6. 实时更新界面 DPS 预览
            const stats = g.getSkillLabBattleStats();
            if (stats) {
                let totalDmg = stats.basic.damage + (stats.dot ? stats.dot.damage : 0);
                Object.values(stats.skills).forEach(s => totalDmg += s.damage);
                const elapsedSec = (Date.now() - this.currentClassStartTime) / 1000;
                const dps = elapsedSec > 0 ? (totalDmg / elapsedSec).toFixed(0) : 0;
                document.getElementById('bt-progress-dps').textContent = Number(dps).toLocaleString();
            }
        }

        /**
         * 收集当前职业的测试数据
         */
        collectClassResult(targetClass) {
            if (this.tickId) clearInterval(this.tickId);

            const g = window.game;
            const stats = g.getSkillLabBattleStats();
            const metrics = this.currentMetrics
                ? this.currentMetrics.stop(g.player)
                : null;
            
            let totalDmg = 0;
            const skillBreakdown = [];

            if (stats) {
                // 普攻伤害
                if (stats.basic.damage > 0) {
                    totalDmg += stats.basic.damage;
                    skillBreakdown.push({
                        name: '基础普攻',
                        hits: stats.basic.hits,
                        damage: stats.basic.damage
                    });
                }

                // 技能伤害
                Object.entries(stats.skills).forEach(([skillId, data]) => {
                    if (data.damage > 0) {
                        totalDmg += data.damage;
                        let skillName = skillId;
                        if (typeof window.getSkillDefinition === 'function') {
                            const def = window.getSkillDefinition(skillId);
                            if (def) skillName = def.name || skillId;
                        }
                        skillBreakdown.push({
                            name: skillName,
                            hits: data.hits,
                            damage: data.damage
                        });
                    }
                });

                // DOT伤害
                if (stats.dot && stats.dot.damage > 0) {
                    totalDmg += stats.dot.damage;
                    skillBreakdown.push({
                        name: '持续伤害(DOT/协同反应)',
                        hits: stats.dot.hits,
                        damage: stats.dot.damage
                    });
                }
            }

            const durationSec = this.testDurationMs / 1000;
            const dps = totalDmg / durationSec;

            // 排序技能占比
            skillBreakdown.sort((a, b) => b.damage - a.damage);

            this.results.push({
                classInfo: targetClass,
                scenario: this.scenario,
                equipmentPreset: this.equipmentPreset,
                equipmentSummary: this.currentEquipmentSummary || null,
                totalDamage: totalDmg,
                dps: dps,
                skills: skillBreakdown,
                metrics: metrics || {}
            });
        }

        /**
         * 停止测试 (手动干预)
         */
        stopTest(showAlert = true) {
            this.isRunning = false;
            if (this.timerId) clearTimeout(this.timerId);
            if (this.tickId) clearInterval(this.tickId);

            document.getElementById('bt-progress-overlay').classList.remove('show');
            this.restorePlayerState();
            if (showAlert) alert('测试已手动停止。');
        }

        /**
         * 测试圆满结束
         */
        finishTest() {
            this.isRunning = false;
            if (this.timerId) clearTimeout(this.timerId);
            if (this.tickId) clearInterval(this.tickId);

            document.getElementById('bt-progress-overlay').classList.remove('show');
            this.restorePlayerState();

            // 按 DPS 从高到低排序结果
            this.results.sort((a, b) => b.dps - a.dps);

            // 渲染结果到报告弹窗
            this.renderReport();

            // 显示报告弹窗
            document.getElementById('bt-report-modal').classList.add('show');
        }

        /**
         * 还原玩家测试前的原始状态
         */
        restorePlayerState() {
            const g = window.game;
            if (!g || !this.originalState) return;

            const p = g.player;
            const os = this.originalState;

            if (typeof window.restoreSkillLabPlayerState === 'function') {
                window.restoreSkillLabPlayerState(p, os);
            } else {
                p.classData = os.classData;
                p.level = os.level;
                p.equipment = Object.assign({}, os.equipment || {});
                p.skillHotbar = os.skillHotbar || os.hotbar;
                if (typeof p.updateStats === 'function') p.updateStats();
            }

            // 重新同步游戏UI
            if (typeof g.updateHUD === 'function') g.updateHUD();
            if (g.classUI) g.classUI.updateSkillBar();
            g.equipmentEffects = Array.isArray(os.gameEquipmentEffects)
                ? os.gameEquipmentEffects.slice() : [];
            if (g.skillLabUI) {
                const cd = window.normalizeClassData(p.classData);
                g.skillLabUI.populateClassSelect();
                g.skillLabUI._selectedClassValue = [cd.baseClass || '', cd.firstAdvancement || '', cd.secondAdvancement || ''].join('|');
                g.skillLabUI._selectedLevel = p.level || 60;
                const select = document.getElementById('skill-lab-class-select');
                const levelInput = document.getElementById('skill-lab-level');
                if (select) select.value = g.skillLabUI._selectedClassValue;
                if (levelInput) levelInput.value = String(g.skillLabUI._selectedLevel);
                g.skillLabUI.renderHotbarEditor();
                g.skillLabUI.renderSkillList();
            }

            // 重新生成默认木桩
            g.skillLabScene.clearAllDummies();
            if (typeof g.spawnSkillLabDefaultDummies === 'function') {
                g.spawnSkillLabDefaultDummies();
                p.x = os.x == null ? p.x : os.x;
                p.y = os.y == null ? p.y : os.y;
                p.angle = os.angle == null ? p.angle : os.angle;
                if (typeof g._syncSkillLabCamera === 'function') g._syncSkillLabCamera();
            }
            this.originalState = null;
        }

        /**
         * 渲染测试报告
         */
        renderReport() {
            // 1. 渲染 DPS 排行榜
            const tbody = document.querySelector('#bt-overview-table tbody');
            tbody.innerHTML = '';

            let totalAllClassesDps = this.results.reduce((sum, r) => sum + r.dps, 0);
            if (totalAllClassesDps <= 0) totalAllClassesDps = 1;

            this.results.forEach((r, idx) => {
                const rank = idx + 1;
                let rankClass = '';
                if (rank === 1) rankClass = 'bt-rank-1';
                else if (rank === 2) rankClass = 'bt-rank-2';
                else if (rank === 3) rankClass = 'bt-rank-3';

                const pct = (r.dps / (totalAllClassesDps / this.results.length) * 100).toFixed(0);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="text-align: center;" class="${rankClass}">${rank}</td>
                    <td style="font-weight: bold; color: #fff;">${r.classInfo.name}</td>
                    <td><span class="pe-badge" style="background: ${this.getTierColor(r.classInfo.tier)}; color: #111; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${r.classInfo.tier}</span></td>
                    <td style="text-align: right; color: #ffd700; font-family: monospace;">${Math.floor(r.totalDamage).toLocaleString()}</td>
                    <td style="text-align: right; color: #ff4444; font-weight: bold; font-family: monospace;">${Math.floor(r.dps).toLocaleString()}</td>
                    <td style="text-align: right; color: #888;">${pct}% (较均值)</td>
                `;
                tbody.appendChild(tr);
            });

            // 2. 填充详细数据下拉菜单
            const select = document.getElementById('bt-detail-select');
            select.innerHTML = '';
            this.results.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.classInfo.id;
                opt.textContent = `${r.classInfo.name} (${r.classInfo.tier}) - DPS: ${Math.floor(r.dps)}`;
                select.appendChild(opt);
            });

            // 默认渲染第一名的详细数据
            if (this.results.length > 0) {
                this.renderClassDetails(this.results[0].classInfo.id);
            }

            // 3. 渲染平衡性诊断
            this.renderBalanceAnalysis();
        }

        /**
         * 渲染某个职业的详细技能伤害占比
         */
        renderClassDetails(classId) {
            const r = this.results.find(res => res.classInfo.id === classId);
            const container = document.getElementById('bt-detail-content');
            if (!r) {
                container.innerHTML = '<p>未找到该职业的测试数据。</p>';
                return;
            }

            let skillsHTML = `
                <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #444;">
                    <div><strong style="color: #ffd700;">总伤害:</strong> <span style="font-family: monospace; font-size: 16px; color: #fff;">${Math.floor(r.totalDamage).toLocaleString()}</span></div>
                    <div><strong style="color: #ff4444;">平均 DPS:</strong> <span style="font-family: monospace; font-size: 16px; color: #fff;">${Math.floor(r.dps).toLocaleString()}</span></div>
                </div>
                <table class="bt-table">
                    <thead>
                        <tr>
                            <th>伤害来源</th>
                            <th style="text-align: right; width: 100px;">命中次数</th>
                            <th style="text-align: right; width: 150px;">总伤害</th>
                            <th style="text-align: right; width: 100px;">伤害占比</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (r.skills.length === 0) {
                skillsHTML += `<tr><td colspan="4" style="text-align: center; color: #666; padding: 20px;">测试期间未造成任何伤害（可能存在技能释放Bug或射程问题）</td></tr>`;
            } else {
                r.skills.forEach(s => {
                    const pct = r.totalDamage > 0 ? (s.damage / r.totalDamage * 100).toFixed(1) : 0;
                    skillsHTML += `
                        <tr>
                            <td style="font-weight: bold; color: #fff;">${s.name}</td>
                            <td style="text-align: right; font-family: monospace;">${s.hits}</td>
                            <td style="text-align: right; color: #ffd700; font-family: monospace;">${Math.floor(s.damage).toLocaleString()}</td>
                            <td style="text-align: right; color: #888; font-weight: bold;">${pct}%</td>
                        </tr>
                    `;
                });
            }

            skillsHTML += `
                    </tbody>
                </table>
            `;

            container.innerHTML = skillsHTML;
        }

        /**
         * 渲染平衡性诊断与机制警告
         */
        renderBalanceAnalysis() {
            const container = document.getElementById('bt-analysis-content');
            
            // 计算同阶级均值
            const tiers = { '基础': [], '一转': [], '二转': [] };
            this.results.forEach(r => {
                if (tiers[r.classInfo.tier]) {
                    tiers[r.classInfo.tier].push(r.dps);
                }
            });

            const averages = {};
            Object.keys(tiers).forEach(t => {
                const list = tiers[t];
                averages[t] = list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;
            });

            let html = `
                <h4 style="color: #ffd700; margin-top: 0; margin-bottom: 10px;">阶级平均 DPS 参考线</h4>
                <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                    <div style="flex: 1; background: rgba(255,255,255,0.03); border: 1px solid #333; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 12px; color: #888;">基础职业均值</div>
                        <div style="font-size: 18px; font-weight: bold; color: #4af; font-family: monospace;">${Math.floor(averages['基础']).toLocaleString()}</div>
                    </div>
                    <div style="flex: 1; background: rgba(255,255,255,0.03); border: 1px solid #333; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 12px; color: #888;">一转职业均值</div>
                        <div style="font-size: 18px; font-weight: bold; color: #ff9944; font-family: monospace;">${Math.floor(averages['一转']).toLocaleString()}</div>
                    </div>
                    <div style="flex: 1; background: rgba(255,255,255,0.03); border: 1px solid #333; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 12px; color: #888;">二转职业均值</div>
                        <div style="font-size: 18px; font-weight: bold; color: #ff4466; font-family: monospace;">${Math.floor(averages['二转']).toLocaleString()}</div>
                    </div>
                </div>
                <h4 style="color: #ffd700; margin-bottom: 10px;">机制与数值缺陷诊断</h4>
            `;

            const alerts = [];

            // 1. 检查是否存在 0 伤害的职业 (严重机制Bug)
            const zeroDmgClasses = this.results.filter(r => r.totalDamage <= 0);
            if (zeroDmgClasses.length > 0) {
                const names = zeroDmgClasses.map(r => r.classInfo.name).join('、');
                alerts.push({
                    type: 'danger',
                    title: '🚨 严重机制故障: 零伤害输出',
                    desc: `职业 [${names}] 在测试期间未造成任何伤害！这极有可能是由于以下原因导致：<br>
                           1. 技能配置中存在空引用或未定义的技能ID。<br>
                           2. 技能释放距离(Range)过短，且AI未能成功接近木桩。<br>
                           3. 技能实体(Entity)在技能试验场中无法正常对木桩产生碰撞或伤害判定。`
                });
            }

            // 2. 检查是否存在技能零伤害 (部分技能失效Bug)
            this.results.forEach(r => {
                if (r.totalDamage > 0) {
                    // 检查是否有装配了的主动技能但是伤害为0
                    const activeSkills = r.skills.filter(s => s.name !== '基础普攻' && !s.name.includes('持续伤害'));
                    if (activeSkills.length === 0) {
                        alerts.push({
                            type: 'warning',
                            title: `⚠️ 技能循环缺陷: ${r.classInfo.name}`,
                            desc: `职业 [${r.classInfo.name}] 的总伤害100%来自于普通攻击，没有任何主动技能造成伤害。请检查该职业的主动技能是否正确配置、是否消耗过高导致无法释放，或技能冷却时间过长。`
                        });
                    }
                }
            });

            // 3. 数值超标诊断 (DPS > 1.5倍均值)
            const overperforming = [];
            this.results.forEach(r => {
                const avg = averages[r.classInfo.tier];
                if (avg > 0 && r.dps > avg * 1.4) {
                    overperforming.push(`${r.classInfo.name} (超出均值 ${(r.dps / avg * 100 - 100).toFixed(0)}%)`);
                }
            });
            if (overperforming.length > 0) {
                alerts.push({
                    type: 'warning',
                    title: '⚡ 数值超标警告 (建议削弱)',
                    desc: `以下职业的输出大幅超越同阶级平均水平，可能存在技能倍率过高、冷却过短或协同反应叠加异常的问题：<br>
                           <strong>${overperforming.join('<br>')}</strong>`
                });
            }

            // 4. 数值疲软诊断 (DPS < 0.6倍均值)
            const underperforming = [];
            this.results.forEach(r => {
                const avg = averages[r.classInfo.tier];
                if (avg > 0 && r.dps > 0 && r.dps < avg * 0.6) {
                    underperforming.push(`${r.classInfo.name} (低于均值 ${(100 - r.dps / avg * 100).toFixed(0)}%)`);
                }
            });
            if (underperforming.length > 0) {
                alerts.push({
                    type: 'warning',
                    title: '📉 数值疲软警告 (建议加强)',
                    desc: `以下职业的输出大幅低于同阶级平均水平，可能存在技能基础倍率过低、资源消耗过大导致卡手，或技能范围太窄打空的问题：<br>
                           <strong>${underperforming.join('<br>')}</strong>`
                });
            }

            if (alerts.length === 0) {
                html += `
                    <div style="background: rgba(40, 167, 69, 0.15); border-left: 4px solid #28a745; padding: 15px; border-radius: 4px; text-align: center;">
                        <h4 style="color: #28a745; margin: 0 0 5px 0;">🎉 数值平衡性极佳</h4>
                        <p style="margin: 0; font-size: 13px; color: #ccc;">未检测到任何明显的职业机制故障或数值严重失衡现象！所有职业表现均在合理区间内。</p>
                    </div>
                `;
            } else {
                alerts.forEach(a => {
                    html += `
                        <div class="bt-alert-card ${a.type === 'danger' ? 'danger' : ''}">
                            <h4>${a.title}</h4>
                            <p style="margin: 0; color: #ddd;">${a.desc}</p>
                        </div>
                    `;
                });
            }

            container.innerHTML = html;
        }

        getTierColor(tier) {
            if (tier === '基础') return '#4a9eff';
            if (tier === '一转') return '#ff9944';
            return '#ff4466';
        }

        /**
         * 生成完整的 Markdown 格式测试报告
         */
        generateMarkdownReport() {
            let md = `# Pixel Eternal 职业数值与机制平衡性测试报告\n\n`;
            md += `* **测试日期**: ${new Date().toLocaleString()}\n`;
            md += `* **单职业测试时长**: ${this.testDurationMs / 1000} 秒\n`;
            md += `* **测试角色等级**: Lv.${this.testLevel}\n`;
            md += `* **测试资源模式**: ${this.infiniteResource ? '无限资源 (不限循环)' : '常规资源 (测试资源经济)'}\n\n`;
            md += `* **测试场景**: ${this.scenario}\n\n`;
            md += `* **装备预设**: ${this.equipmentPreset}\n\n`;

            md += `## 一、 全职业 DPS 排行榜\n\n`;
            md += `| 排名 | 职业名称 | 阶级 | 总伤害 | 平均 DPS | 相对均值占比 |\n`;
            md += `| :---: | :--- | :---: | :---: | :---: | :---: |\n`;

            const tiers = { '基础': [], '一转': [], '二转': [] };
            this.results.forEach(r => {
                if (tiers[r.classInfo.tier]) tiers[r.classInfo.tier].push(r.dps);
            });
            const averages = {};
            Object.keys(tiers).forEach(t => {
                averages[t] = tiers[t].length > 0 ? tiers[t].reduce((a, b) => a + b, 0) / tiers[t].length : 0;
            });

            this.results.forEach((r, idx) => {
                const avg = averages[r.classInfo.tier] || 1;
                const pct = (r.dps / avg * 100).toFixed(0);
                md += `| ${idx + 1} | **${r.classInfo.name}** | ${r.classInfo.tier} | ${Math.floor(r.totalDamage).toLocaleString()} | **${Math.floor(r.dps).toLocaleString()}** | ${pct}% |\n`;
            });

            md += `\n> **阶级平均 DPS 参考线**:\n`;
            md += `> * **基础职业平均 DPS**: ${Math.floor(averages['基础']).toLocaleString()}\n`;
            md += `> * **一转职业平均 DPS**: ${Math.floor(averages['一转']).toLocaleString()}\n`;
            md += `> * **二转职业平均 DPS**: ${Math.floor(averages['二转']).toLocaleString()}\n\n`;

            md += `## 二、 平衡性诊断与优化建议\n\n`;

            // 严重故障
            const zeroDmg = this.results.filter(r => r.totalDamage <= 0);
            if (zeroDmg.length > 0) {
                md += `### 🚨 严重机制故障 (Bug 待修复)\n`;
                zeroDmg.forEach(r => {
                    md += `* **${r.classInfo.name}** (${r.classInfo.tier}): 测试期间输出为 **0**。可能存在技能配置缺失、技能实体碰撞丢失，或技能射程过短且AI未贴脸的问题。请开发人员优先排查该职业的技能代码！\n`;
                });
                md += `\n`;
            }

            // 数值超标
            const over = this.results.filter(r => r.dps > averages[r.classInfo.tier] * 1.4);
            if (over.length > 0) {
                md += `### ⚡ 数值超标职业 (建议削弱)\n`;
                over.forEach(r => {
                    const diff = (r.dps / averages[r.classInfo.tier] * 100 - 100).toFixed(0);
                    md += `* **${r.classInfo.name}** (${r.classInfo.tier}): DPS 达 **${Math.floor(r.dps).toLocaleString()}**，超出同阶级均值 **${diff}%**。建议适当调低技能倍率，或微调核心技能的冷却时间。\n`;
                });
                md += `\n`;
            }

            // 数值疲软
            const under = this.results.filter(r => r.dps > 0 && r.dps < averages[r.classInfo.tier] * 0.6);
            if (under.length > 0) {
                md += `### 📉 数值疲软职业 (建议加强)\n`;
                under.forEach(r => {
                    const diff = (100 - r.dps / averages[r.classInfo.tier] * 100).toFixed(0);
                    md += `* **${r.classInfo.name}** (${r.classInfo.tier}): DPS 仅 **${Math.floor(r.dps).toLocaleString()}**，低于同阶级均值 **${diff}%**。建议适当提升技能基础伤害倍率，或优化其资源获取效率，防止战斗中频繁卡手。\n`;
                });
                md += `\n`;
            }

            md += `## 三、 各职业技能伤害占比明细\n\n`;
            this.results.forEach(r => {
                md += `### 📊 ${r.classInfo.name} (${r.classInfo.tier}) - 详细输出\n`;
                md += `* **总伤害**: ${Math.floor(r.totalDamage).toLocaleString()} | **平均 DPS**: ${Math.floor(r.dps).toLocaleString()}\n\n`;
                md += `| 伤害来源 | 命中次数 | 总伤害 | 伤害占比 |\n`;
                md += `| :--- | :---: | :---: | :---: |\n`;
                if (r.skills.length === 0) {
                    md += `| *无伤害数据* | - | - | - |\n`;
                } else {
                    r.skills.forEach(s => {
                        const pct = r.totalDamage > 0 ? (s.damage / r.totalDamage * 100).toFixed(1) : 0;
                        md += `| ${s.name} | ${s.hits} | ${Math.floor(s.damage).toLocaleString()} | **${pct}%** |\n`;
                    });
                }
                md += `\n---\n\n`;
            });

            md += `## 四、 多维战斗指标\n\n`;
            md += `> 以下指标来自测试事件采集器；综合职业判断必须结合职业定位与场景，不能只看 DPS。\n\n`;
            md += `| 职业 | 承伤 | 最低生命 | 有效治疗 | 治疗 HPS | 资源空窗 | 施法阻塞率 | 普攻兜底率 | 状态次数 | 协同次数 | VFX覆盖 |\n`;
            md += `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
            this.results.forEach(r => {
                const m = r.metrics || {};
                const p = m.player || {};
                const resource = m.resources || {};
                const feel = m.feel || {};
                const statuses = Object.values(m.statuses || {}).reduce((sum, s) => sum + (s.applications || 0), 0);
                const synergies = Object.values(m.synergies || {}).reduce((sum, s) => sum + (s.triggers || 0), 0);
                const vfx = m.vfx || {};
                md += `| ${r.classInfo.name} | ${Math.floor(p.damageTaken || 0).toLocaleString()} | ${((p.lowestHpPct || 0) * 100).toFixed(1)}% | ${Math.floor(p.effectiveHealing || 0).toLocaleString()} | ${Math.floor(p.healingPerSecond || 0).toLocaleString()} | ${((resource.emptyRatio || 0) * 100).toFixed(1)}% | ${((feel.blockedRatio || 0) * 100).toFixed(1)}% | ${((feel.basicFallbackRatio || 0) * 100).toFixed(1)}% | ${statuses} | ${synergies} | ${((vfx.coverage || 0) * 100).toFixed(1)}% |\n`;
            });
            md += `\n## 五、 可解释性诊断\n\n`;
            this.results.forEach(r => {
                const m = r.metrics || {};
                const feel = m.feel || {};
                const p = m.player || {};
                const resource = m.resources || {};
                const notes = [];
                if ((feel.blockedRatio || 0) > 0.25) notes.push('技能阻塞率较高');
                if ((resource.emptyRatio || 0) > 0.35) notes.push('资源空窗较长');
                if ((feel.basicFallbackRatio || 0) > 0.7) notes.push('输出高度依赖普攻或技能未命中');
                if ((p.lowestHpPct || 1) < 0.25) notes.push('生存场景最低生命过低');
                if (!notes.length) notes.push('未发现明显的测试层面异常');
                md += `* **${r.classInfo.name}**：${notes.join('；')}。\n`;
            });

            return md;
        }

        copyMarkdownReport() {
            const md = this.generateMarkdownReport();
            navigator.clipboard.writeText(md).then(() => {
                alert('Markdown 报告已成功复制到剪贴板！');
            }).catch(err => {
                console.error('复制失败:', err);
                alert('复制失败，请在控制台查看报告。');
                console.log(md);
            });
        }

        downloadMarkdownReport() {
            const md = this.generateMarkdownReport();
            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pixel_eternal_balance_report_${Date.now()}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    // 挂载到全局
    window.AutomatedBalanceTester = new AutomatedBalanceTester();
})();
