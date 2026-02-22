/**
 * popup.js – MD-Export popup controller
 * Handles site detection, format selection, export triggering, and clipboard copy.
 */

import { toMarkdown } from '../exporters/markdown.js';
import { toDocx } from '../exporters/docx.js';
import { toPdf } from '../exporters/pdf.js';
import { preprocess } from '../pipeline/preprocess.js';

const SUPPORTED_SITES = {
    'chat.openai.com': 'ChatGPT',
    'chatgpt.com': 'ChatGPT',
    'gemini.google.com': 'Gemini',
    'grok.com': 'Grok',
    'x.com': 'Grok',
    'claude.ai': 'Claude',
};

let conversationData = null;
let selectedFormat = 'md';
let rangeFrom = 1;   // 1-indexed, inclusive
let rangeTo = 1;     // 1-indexed, inclusive

// DOM elements
const siteBadge = document.getElementById('site-badge');
const siteName = document.getElementById('site-name');
const unsupportedBanner = document.getElementById('unsupported-banner');
const mainContent = document.getElementById('main-content');
const chatTitle = document.getElementById('chat-title');
const exportBtn = document.getElementById('export-btn');
const exportLabel = document.getElementById('export-label');
const copyBtn = document.getElementById('copy-btn');
const copyLabel = document.getElementById('copy-label');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const fmtBtns = document.querySelectorAll('.fmt-btn');
const rangeFromEl = document.getElementById('range-from');
const rangeToEl = document.getElementById('range-to');
const rangePreview = document.getElementById('range-preview');
const msgCountBadge = document.getElementById('msg-count-badge');
const chips = document.querySelectorAll('.chip');

// ---- Utilities ----
function setStatus(type, msg) {
    statusDot.className = `dot dot-${type}`;
    statusText.textContent = msg;
}

function showMain(site, title) {
    siteBadge.classList.remove('hidden');
    siteName.textContent = site;
    mainContent.classList.remove('hidden');
    chatTitle.textContent = title.length > 55 ? title.slice(0, 55) + '…' : title;
    unsupportedBanner.classList.add('hidden');
}

function showUnsupported() {
    unsupportedBanner.classList.remove('hidden');
    siteBadge.classList.add('hidden');
    mainContent.classList.add('hidden');
    setStatus('error', 'Unsupported page');
}

// ---- Range selector ----
function initRange(total) {
    rangeFrom = 1;
    rangeTo = total;
    rangeFromEl.max = total;
    rangeToEl.max = total;
    rangeFromEl.value = 1;
    rangeToEl.value = total;
    msgCountBadge.textContent = `${total} total`;
    updateRangePreview();
}

function updateRangePreview() {
    const f = parseInt(rangeFromEl.value) || 1;
    const t = parseInt(rangeToEl.value) || rangeTo;
    rangeFrom = Math.max(1, Math.min(f, t));
    rangeTo = Math.max(rangeFrom, t);
    rangeFromEl.value = rangeFrom;
    rangeToEl.value = rangeTo;
    const count = rangeTo - rangeFrom + 1;
    const total = conversationData?.messages?.length || 0;
    rangePreview.textContent = rangeFrom === 1 && rangeTo === total
        ? 'All msgs'
        : `${count} msg${count !== 1 ? 's' : ''}`;
    // Deactivate all chips if manual edit
    chips.forEach(c => c.classList.remove('chip-active'));
    if (rangeFrom === 1 && rangeTo === total) {
        document.querySelector('[data-preset="all"]')?.classList.add('chip-active');
    }
}

rangeFromEl.addEventListener('input', updateRangePreview);
rangeToEl.addEventListener('input', updateRangePreview);

chips.forEach(chip => {
    chip.addEventListener('click', () => {
        const total = conversationData?.messages?.length || 0;
        if (!total) return;
        const preset = chip.dataset.preset;
        chips.forEach(c => c.classList.remove('chip-active'));
        chip.classList.add('chip-active');
        switch (preset) {
            case 'all': rangeFromEl.value = 1; rangeToEl.value = total; break;
            case 'first10': rangeFromEl.value = 1; rangeToEl.value = Math.min(10, total); break;
            case 'last10': rangeFromEl.value = Math.max(1, total - 9); rangeToEl.value = total; break;
            case 'first-half': rangeFromEl.value = 1; rangeToEl.value = Math.ceil(total / 2); break;
            case 'last-half': rangeFromEl.value = Math.floor(total / 2) + 1; rangeToEl.value = total; break;
        }
        rangeFrom = parseInt(rangeFromEl.value);
        rangeTo = parseInt(rangeToEl.value);
        const count = rangeTo - rangeFrom + 1;
        rangePreview.textContent = preset === 'all'
            ? 'All msgs'
            : `${count} msg${count !== 1 ? 's' : ''}`;
    });
});

/** Return null for full export, or { from, to } for partial */
function getRange() {
    const total = conversationData?.messages?.length || 0;
    if (rangeFrom === 1 && rangeTo === total) return null;
    return { from: rangeFrom, to: rangeTo };
}

// ---- Format selection ----
fmtBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        fmtBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedFormat = btn.dataset.format;
        // Show/hide copy button only for MD
        copyBtn.style.display = selectedFormat === 'md' ? 'flex' : 'none';
        exportLabel.textContent = `Export as .${selectedFormat === 'docx' ? 'docx' : selectedFormat.toUpperCase()}`;
    });
});

// ---- Initialization ----
async function init() {
    setStatus('loading', 'Detecting page…');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { showUnsupported(); return; }

    const url = new URL(tab.url);
    const site = SUPPORTED_SITES[url.hostname];

    if (!site) {
        showUnsupported();
        setStatus('error', 'Not a supported AI chat site');
        return;
    }

    // Ask content script to scrape
    setStatus('loading', 'Reading conversation…');
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
        if (response?.success && response.data?.messages?.length > 0) {
            conversationData = response.data;
            showMain(site, conversationData.title || `${site} Chat`);
            initRange(conversationData.messages.length);
            setStatus('success', `${conversationData.messages.length} messages ready`);
        } else {
            showMain(site, tab.title || `${site} Chat`);
            setStatus('error', response?.error || 'Open a conversation with messages first');
            exportBtn.disabled = true;
            copyBtn.disabled = true;
        }
    } catch (e) {
        showMain(site, tab.title || `${site} Chat`);
        setStatus('error', 'Could not read page. Reload and try again.');
        exportBtn.disabled = true;
        copyBtn.disabled = true;
    }
}

// ---- Export ----
exportBtn.addEventListener('click', async () => {
    if (!conversationData) return;

    exportBtn.disabled = true;
    setStatus('loading', 'Processing conversation…');

    try {
        // Build range (null = full conversation)
        const range = getRange();
        const rangeLabel = range ? ` (msgs ${range.from}–${range.to})` : '';

        // Run preprocessing pipeline on raw scraped data
        const processed = preprocess(conversationData, range);
        const { stats } = processed;
        setStatus('loading', `Processed ${stats.messageCount} messages${rangeLabel}… exporting`);

        const safe = safeFilename(processed) + (range ? `_msgs${range.from}-${range.to}` : '');

        if (selectedFormat === 'md') {
            const md = toMarkdown(processed);
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            await chrome.downloads.download({ url, filename: `${safe}.md`, saveAs: false });
            URL.revokeObjectURL(url);
            setStatus('success', `Markdown saved! (${stats.messageCount} msgs · ${stats.totalWords.toLocaleString()} words)`);

        } else if (selectedFormat === 'docx') {
            const blob = await toDocx(processed);
            const url = URL.createObjectURL(blob);
            await chrome.downloads.download({ url, filename: `${safe}.docx`, saveAs: false });
            URL.revokeObjectURL(url);
            setStatus('success', `DOCX saved! (${stats.messageCount} msgs)`);

        } else if (selectedFormat === 'pdf') {
            setStatus('loading', `Rendering PDF… (${stats.messageCount} messages)`);
            const blob = await toPdf(processed);
            const url = URL.createObjectURL(blob);
            await chrome.downloads.download({ url, filename: `${safe}.pdf`, saveAs: false });
            URL.revokeObjectURL(url);
            setStatus('success', `PDF saved! (${stats.messageCount} msgs · ${stats.totalPages || ''} pages)`);
        }

    } catch (e) {
        setStatus('error', 'Export failed: ' + e.message);
    } finally {
        exportBtn.disabled = false;
    }
});

// ---- Copy to clipboard ----
copyBtn.addEventListener('click', async () => {
    if (!conversationData) return;
    try {
        const range = getRange();
        const processed = preprocess(conversationData, range);
        const md = toMarkdown(processed);
        await navigator.clipboard.writeText(md);
        copyLabel.textContent = '✓ Copied!';
        setStatus('success', `Markdown copied (${processed.stats.messageCount} msgs)`);
        setTimeout(() => { copyLabel.textContent = 'Copy as Markdown'; }, 2000);
    } catch (e) {
        setStatus('error', 'Clipboard error: ' + e.message);
    }
});

function safeFilename(data) {
    const title = (data.title || 'chat').replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '_').slice(0, 50);
    const date = new Date().toISOString().slice(0, 10);
    return `${data.site}_${title}_${date}`;
}

init();
