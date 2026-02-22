/**
 * base_scraper.js – shared utilities for all site scrapers
 */

export function htmlToMarkdown(html) {
    // Use turndown if available (bundled), else fallback to plain text
    try {
        const TurndownService = require('turndown');
        const { gfm } = require('turndown-plugin-gfm');
        const td = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            bulletListMarker: '-',
            hr: '---',
        });
        td.use(gfm);

        // Remove citation buttons and source-footnote elements
        td.remove([
            'source-footnote',
            'sources-carousel-inline',
            'source-inline-chip',
            'grammarly-extension',
            '.citation-15', // keep text, handled inline
        ]);

        // Handle code blocks with language classes
        td.addRule('fencedCodeBlock', {
            filter: (node) =>
                node.nodeName === 'PRE' && node.querySelector('code'),
            replacement: (_, node) => {
                const code = node.querySelector('code');
                const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
                return `\n\`\`\`${lang}\n${code.textContent.trim()}\n\`\`\`\n`;
            },
        });

        return td.turndown(html).trim();
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
    // Remove noisy elements
    const noisy = [
        'button', 'grammarly-extension', 'source-footnote',
        'sources-carousel-inline', 'source-inline-chip',
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
