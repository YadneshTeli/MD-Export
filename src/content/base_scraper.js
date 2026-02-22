/**
 * base_scraper.js – shared utilities for all site scrapers
 */

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// Build a single shared Turndown instance (avoids re-creating on every message).
const _td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    hr: '---',
});
_td.use(gfm);

// Remove citation noise during Turndown's internal DOM pass.
_td.remove(['source-footnote', 'sources-carousel-inline', 'grammarly-extension']);

// ChatGPT citation pills: <span data-testid="webpage-citation-pill">
// and their outer wrapper <span data-state="closed">.
_td.addRule('citationPill', {
    filter: node =>
        node.nodeName === 'SPAN' &&
        (node.getAttribute('data-testid') === 'webpage-citation-pill' ||
         node.getAttribute('data-state') === 'closed'),
    replacement: () => '',
});

// Handle code blocks with language classes
_td.addRule('fencedCodeBlock', {
    filter: node => node.nodeName === 'PRE' && node.querySelector('code'),
    replacement: (_, node) => {
        const code = node.querySelector('code');
        const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
        return `\n\`\`\`${lang}\n${code.textContent.trim()}\n\`\`\`\n`;
    },
});

export function htmlToMarkdown(html) {
    if (!html) return '';
    try {
        return _td.turndown(html).trim();
    } catch (e) {
        // Fallback: return plain text
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent.trim();
    }
}

/**
 * Sanitize HTML: strip citation chips, buttons, SVGs, grammarly etc.
 * Return cleaned innerHTML string for conversion.
 */
export function cleanHtml(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);

    // ── Step 1: Remove ChatGPT citation pills.
    // Structure: <span data-state="closed">
    //              <span data-testid="webpage-citation-pill"><a>Plesk</a></span>
    //            </span>
    // Target the outer wrapper (data-state="closed") that contains the pill,
    // which removes both the chip and the source-name text in one shot.
    clone.querySelectorAll('[data-testid="webpage-citation-pill"]').forEach(pill => {
        // Walk up one level: the direct parent is typically the outer span[data-state]
        const wrapper = pill.parentElement;
        if (wrapper && wrapper.tagName === 'SPAN' && wrapper.hasAttribute('data-state')) {
            wrapper.remove();
        } else {
            pill.remove();
        }
    });

    // ── Step 2: Remove remaining noisy elements
    const noisy = [
        'button', 'grammarly-extension', 'source-footnote',
        'sources-carousel-inline', 'source-attribution', 'cite',
        '[data-testid="source-footnote"]',
        '[data-testid="web-browsing-attribution"]',
        '[class*="browsing-attribution"]',
        'svg', '.sr-only', '[aria-hidden="true"]',
        'model-thoughts', 'tts-control', 'bard-avatar',
    ];
    noisy.forEach(sel => {
        try { clone.querySelectorAll(sel).forEach(el => el.remove()); } catch { }
    });

    return clone.innerHTML;
}


export function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        const observer = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (found) { observer.disconnect(); resolve(found); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
    });
}

export function getPageTitle() {
    return document.title.replace(' - ChatGPT', '').replace(' - Gemini', '').replace(' - Grok', '').replace(' - Claude', '').trim() || 'Chat Export';
}
