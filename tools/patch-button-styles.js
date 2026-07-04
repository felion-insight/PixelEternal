#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const stripStyle = (idOrPattern, classes) => {
    const re = new RegExp(
        `(<button[^>]*(?:id="${idOrPattern}"|${idOrPattern})[^>]*) style="[^"]*"`,
        'g'
    );
    html = html.replace(re, `$1 class="${classes}"`);
};

const pairs = [
    ['id="shop-refresh-btn"', 'pe-btn pe-btn--info pe-btn--sm'],
    ['buy-target-slot-btn" data-quality="legendary"', 'pe-btn pe-btn--xs buy-target-slot-btn" data-quality="legendary'],
    ['buy-target-slot-btn" data-quality="epic"', 'pe-btn pe-btn--xs buy-target-slot-btn" data-quality="epic'],
    ['buy-target-slot-btn" data-quality="fine"', 'pe-btn pe-btn--xs buy-target-slot-btn" data-quality="fine'],
    ['id="gap-shop-continue-btn"', 'pe-btn pe-btn--purple pe-btn--lg'],
    ['id="gap-shop-close-btn"', 'pe-btn pe-btn--secondary pe-btn--lg'],
    ['id="keybind-reset-btn"', 'pe-btn pe-btn--ghost pe-btn--sm pe-btn--keybind-reset'],
    ['id="esc-menu-guide-btn"', 'pe-btn pe-btn--block pe-btn--warning'],
    ['id="esc-menu-export-btn"', 'pe-btn pe-btn--block pe-btn--export'],
    ['id="esc-menu-save-browser-btn"', 'pe-btn pe-btn--block pe-btn--success'],
    ['id="esc-menu-import-btn"', 'pe-btn pe-btn--block pe-btn--import'],
    ['id="esc-menu-clear-save-btn"', 'pe-btn pe-btn--block pe-btn--danger'],
    ['id="esc-menu-exit-tower-btn"', 'pe-btn pe-btn--block pe-btn--tower'],
    ['id="esc-menu-close-btn"', 'pe-btn pe-btn--block pe-btn--secondary'],
    ['id="tower-exit-confirm-btn"', 'pe-btn pe-btn--lg pe-btn--danger-strong'],
    ['id="tower-exit-cancel-btn"', 'pe-btn pe-btn--lg pe-btn--secondary'],
    ['id="add-dummy-btn"', 'pe-btn pe-btn--info'],
    ['id="clear-dummies-btn"', 'pe-btn pe-btn--danger'],
    ['id="spawn-dummy-btn"', 'pe-btn pe-btn--flex pe-btn--info'],
    ['id="cancel-dummy-spawn-btn"', 'pe-btn pe-btn--flex pe-btn--secondary'],
    ['id="reset-monster-filters"', 'pe-btn pe-btn--filter'],
    ['id="reset-filters"', 'pe-btn pe-btn--filter'],
    ['id="reset-base-filters"', 'pe-btn pe-btn--filter'],
    ['id="copy-save-code-btn"', 'pe-btn pe-btn--lg pe-btn--info'],
    ['id="close-save-code-modal"', 'pe-btn pe-btn--lg pe-btn--secondary'],
    ['id="confirm-import-save-btn"', 'pe-btn pe-btn--lg pe-btn--accent'],
    ['id="close-import-save-modal"', 'pe-btn pe-btn--lg pe-btn--secondary'],
    ['id="close-death-penalty"', 'pe-btn pe-btn--lg pe-btn--danger'],
];

for (const [needle, cls] of pairs) {
    html = html.replace(
        new RegExp(`(<button[^>]*${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*) style="[^"]*"`, 'g'),
        (match, prefix) => {
            if (prefix.includes('class="')) {
                return prefix.replace(/class="([^"]*)"/, `class="${cls} $1"`);
            }
            return `${prefix} class="${cls}"`;
        }
    );
}

html = html.replace(
    /id="blacksmith-reroll-all-btn" type="button" style="display:none;"/g,
    'id="blacksmith-reroll-all-btn" type="button" class="pe-btn pe-btn--sm pe-btn--accent" style="display:none;"'
);
html = html.replace(
    /id="blacksmith-reroll-prefix-btn" type="button" style="display:none;"/g,
    'id="blacksmith-reroll-prefix-btn" type="button" class="pe-btn pe-btn--sm pe-btn--accent" style="display:none;"'
);
html = html.replace(
    /id="blacksmith-reroll-suffix-btn" type="button" style="display:none;"/g,
    'id="blacksmith-reroll-suffix-btn" type="button" class="pe-btn pe-btn--sm pe-btn--accent" style="display:none;"'
);
html = html.replace(
    /id="blacksmith-upgrade-btn" style="display: none;"/g,
    'id="blacksmith-upgrade-btn" class="pe-btn pe-btn--info" style="display: none;"'
);
html = html.replace(
    /id="blacksmith-refine-btn" style="display: none; margin-top: 10px;"/g,
    'id="blacksmith-refine-btn" class="pe-btn pe-btn--info pe-btn--row-top" style="display: none;"'
);

html = html.replace(
    /<button onclick="game\.devAddAllCraftedEquipments\(\)" style="[^"]*">/g,
    '<button class="pe-btn pe-btn--sm pe-btn--dev-gold" onclick="game.devAddAllCraftedEquipments()">'
);
html = html.replace(
    /<button type="button" onclick="game\.dev/g,
    '<button type="button" class="pe-btn pe-btn--sm" onclick="game.dev'
);
html = html.replace(
    /<button onclick="game\.dev/g,
    '<button class="pe-btn pe-btn--sm" onclick="game.dev'
);
html = html.replace(
    /class="pe-btn pe-btn--sm" class="pe-btn pe-btn--sm pe-btn--dev-gold"/g,
    'class="pe-btn pe-btn--sm pe-btn--dev-gold"'
);

html = html.replace(
    '<div style="display: flex; flex-direction: column; gap: 15px;">',
    '<div class="esc-menu-actions">'
);
html = html.replace(
    '<div id="save-code-footer" style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">',
    '<div id="save-code-footer" class="save-modal-footer">'
);
html = html.replace(
    '<div id="import-save-footer" style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">',
    '<div id="import-save-footer" class="import-modal-footer">'
);
html = html.replace(
    '<div style="display: flex; gap: 15px; justify-content: center;">\n                    <button id="tower-exit-confirm-btn"',
    '<div class="tower-exit-actions">\n                    <button id="tower-exit-confirm-btn"'
);
html = html.replace(
    '<div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">\n                    <button type="button" id="gap-shop-continue-btn"',
    '<div class="gap-shop-actions">\n                    <button type="button" id="gap-shop-continue-btn"'
);

if (!html.includes('dummy-spawn-actions')) {
    html = html.replace(
        /(\s*)<button id="spawn-dummy-btn"/,
        '$1<div class="dummy-spawn-actions">\n$1    <button id="spawn-dummy-btn"'
    );
    html = html.replace(
        /(<button id="cancel-dummy-spawn-btn"[^>]*>取消<\/button>)/,
        '$1\n                </div>'
    );
}

fs.writeFileSync(htmlPath, html);
console.log('Patched', htmlPath);
