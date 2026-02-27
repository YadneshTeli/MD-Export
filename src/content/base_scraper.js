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

// Handle code blocks with language classes (standard <pre><code> structure)
_td.addRule('fencedCodeBlock', {
    filter: node => node.nodeName === 'PRE' && node.querySelector('code'),
    replacement: (_, node) => {
        const code = node.querySelector('code');
        const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
        return `\n\`\`\`${lang}\n${code.textContent.trim()}\n\`\`\`\n`;
    },
});

// Fallback: handle any ChatGPT CodeMirror <pre> blocks that weren't pre-processed
// (e.g. when cleanHtml is not called). The language label is stored in data-lang.
_td.addRule('chatgptCodeMirrorBlock', {
    filter: node => node.nodeName === 'PRE' && node.querySelector('.cm-content'),
    replacement: (_, node) => {
        const lang = node.getAttribute('data-lang') || '';
        const content = node.querySelector('.cm-content');
        const code = content ? content.textContent.trim() : node.textContent.trim();
        return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
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

    // ── Step 0: Convert ChatGPT CodeMirror code blocks to standard <pre><code>.
    // ChatGPT's new UI (2025/2026) renders code inside a CodeMirror editor:
    //   <pre>
    //     <div>  ← header bar containing the language label text
    //       <div>Python</div>
    //     </div>
    //     <div class="cm-editor">
    //       <div class="cm-scroller">
    //         <div class="cm-content">  ← actual code as tokenised <span>s
    //           <span>print</span><span>(</span>...
    //         </div>
    //       </div>
    //     </div>
    //   </pre>
    // We convert each such <pre> into <pre><code class="language-X">…</code></pre>
    // so the existing Turndown fencedCodeBlock rule handles them correctly.
    clone.querySelectorAll('pre').forEach(pre => {
        const cmContent = pre.querySelector('.cm-content');
        if (!cmContent) return; // not a CodeMirror block — skip

        // Extract language: the label <div> appears before the cm-editor wrapper.
        // It contains just the language name as text, e.g. "Python", "JavaScript".
        let lang = '';
        const headerLabel = pre.querySelector('.flex.items-center.text-sm.font-medium') || pre.querySelector('.flex.max-w-\\[75\\%\\]');
        if (headerLabel) {
            lang = headerLabel.textContent.trim().toLowerCase().replace(/[^a-z0-9#+.-]/g, '');
        }

        // Extract plain code text from the CodeMirror content.
        // Lines are separated by <br> elements inside .cm-content.
        // Replace each <br> with a newline text node before reading textContent
        // so that multi-line code blocks preserve their line structure.
        const cmClone = cmContent.cloneNode(true);
        cmClone.querySelectorAll('br').forEach(br => {
            br.replaceWith(document.createTextNode('\n'));
        });
        const codeText = cmClone.textContent;

        // Build a replacement <pre><code> node
        const newPre = document.createElement('pre');
        const newCode = document.createElement('code');
        if (lang) newCode.className = `language-${lang}`;
        newCode.textContent = codeText.trim();
        newPre.appendChild(newCode);
        pre.replaceWith(newPre);
    });

    // ── Step 0.5: Fix Gemini code blocks missing language classes.
    // Gemini DOM:
    // <code-block>
    //   <div class="code-block-decoration ..."><span>Python</span></div>
    //   ... <pre><code>...
    clone.querySelectorAll('code-block').forEach(cb => {
        const headerSpan = cb.querySelector('.code-block-decoration span');
        const codeEl = cb.querySelector('pre code');
        if (headerSpan && codeEl) {
            const lang = headerSpan.textContent.trim().toLowerCase().replace(/[^a-z0-9#+.-]/g, '');
            if (lang && !codeEl.className.includes('language-')) {
                codeEl.classList.add(`language-${lang}`);
            }
        }
    });

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
        'svg', '.sr-only', '.cdk-visually-hidden', '[aria-hidden="true"]',
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
