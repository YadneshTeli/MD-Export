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
        // Run preprocessing pipeline on raw scraped data
        const processed = preprocess(conversationData);
        const { stats } = processed;
        setStatus('loading', `Processed ${stats.messageCount} messages (${stats.totalWords.toLocaleString()} words)… exporting`);

        const safe = safeFilename(processed);

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
        const md = toMarkdown(conversationData);
        await navigator.clipboard.writeText(md);
        copyLabel.textContent = '✓ Copied!';
        setStatus('success', 'Markdown copied to clipboard');
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
