/**
 * preprocess.js – Conversation Data Preprocessing Pipeline
 *
 * Stages:
 *   1. Normalize  – fix roles, strip truly-empty messages, dedupe consecutive blanks
 *   2. CleanHtml  – remove UI noise (buttons, SVGs, tooltips, Grammarly)
 *   3. Convert    – HTML → GFM Markdown via Turndown
 *   4. SanitizeMd – strip exporter artifacts, fix spacing, normalize fences
 *   5. Parse      – detect content segments (heading, code, bullet, paragraph…)
 *   6. Enrich     – add per-message metadata (wordCount, hasCode, languages)
 *   7. Aggregate  – build conversation-level stats
 *
 * Input:  raw ConversationData from content scripts
 * Output: ProcessedConversation (clean, structured, ready for any exporter)
 */

import { htmlToMarkdown, cleanHtml } from '../content/base_scraper.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full preprocessing pipeline.
 * @param {object} raw  Raw conversation object from content script
 * @param {{ from?: number, to?: number }} [range]  Optional 1-indexed inclusive message range
 * @returns {ProcessedConversation}
 */
export function preprocess(raw, range = null) {
    const t0 = performance.now();

    // Stage 1: Normalize
    let normalized = stageNormalize(raw);

    // Apply optional range filter (1-indexed, inclusive)
    if (range) {
        const from = Math.max(1, range.from || 1) - 1;          // convert to 0-indexed
        const to = Math.min(normalized.length, range.to || normalized.length);
        normalized = normalized.slice(from, to);
    }

    // Stage 2-4: Per-message HTML cleaning + conversion + sanitize
    const converted = normalized.map(stageConvertMessage);

    // Stage 5: Parse segments
    const parsed = converted.map(stageParseSegments);

    // Stage 6: Enrich per-message metadata
    const enriched = parsed.map(stageEnrich);

    // Stage 7: Aggregate stats
    const stats = stageAggregate(enriched, raw);

    const elapsed = Math.round(performance.now() - t0);

    return {
        // Metadata
        title: raw.title || `${raw.site} Conversation`,
        site: raw.site || 'Unknown',
        exportedAt: new Date().toISOString(),
        processingMs: elapsed,
        rangeApplied: range ? `msgs ${range.from}–${range.to}` : null,

        // Stats
        stats,

        // Processed messages
        messages: enriched,
    };
}

// ─── Stage 1: Normalize ───────────────────────────────────────────────────────

function stageNormalize(raw) {
    const messages = (raw.messages || [])
        // Normalise role names
        .map((msg, idx) => ({
            ...msg,
            index: idx,
            role: normalizeRole(msg.role),
        }))
        // Drop messages with no content at all
        .filter(msg => (msg.html || '').trim() || (msg.text || '').trim());

    return messages;
}

/** Accept any role variant → 'user' | 'assistant' */
function normalizeRole(role) {
    if (!role) return 'assistant';
    const r = role.toLowerCase();
    if (r === 'user' || r === 'human') return 'user';
    return 'assistant';
}

// ─── Stage 2-4: Clean HTML → Markdown → Sanitize ─────────────────────────────

// DOMParser only exists in page/popup contexts, NOT in service workers.
const hasDOMParser = typeof DOMParser !== 'undefined';

function stageConvertMessage(msg) {
    let cleanedHtml = '';
    let markdown = '';

    if (msg.markdown) {
        // Pre-converted markdown from content script (live DOM, citation-cleaned, Turndown-processed).
        // This is the preferred path — use it directly.
        markdown = msg.markdown;
    } else if (msg.html && hasDOMParser) {
        // Fallback: HTML string available and DOMParser exists (popup context).
        // Stage 2: Clean HTML (remove UI noise)
        try {
            const parser = new DOMParser();
            const dom = parser.parseFromString(msg.html, 'text/html');
            removeNoiseNodes(dom);
            cleanedHtml = dom.body.innerHTML;
        } catch {
            cleanedHtml = msg.html;
        }
        // Stage 3: HTML → GFM Markdown via Turndown
        markdown = htmlToMarkdown(cleanedHtml);
    } else {
        // Last resort: plain text (no structure, no formatting)
        markdown = msg.text || '';
    }

    // Stage 4: Sanitize Markdown
    markdown = sanitizeMarkdown(markdown);

    return { ...msg, cleanedHtml, markdown };
}

/**
 * Remove DOM noise nodes in-place from a parsed document.
 * Targets: buttons, SVGs, tooltips, Grammarly, citation chips, source refs.
 */
function removeNoiseNodes(dom) {
    // ── Step 1: Remove ChatGPT citation pills FIRST (before generic pass).
    // Actual structure from the DOM:
    //   <span data-state="closed">
    //     <span data-testid="webpage-citation-pill"><a>Plesk</a></span>
    //   </span>
    // Remove the outer span[data-state] to take the source name text with it.
    dom.querySelectorAll('[data-testid="webpage-citation-pill"]').forEach(pill => {
        const wrapper = pill.parentElement;
        if (wrapper && wrapper.tagName === 'SPAN' && wrapper.hasAttribute('data-state')) {
            wrapper.remove();
        } else {
            pill.remove();
        }
    });

    // ── Step 2: Generic noise removal
    const noiseSelectors = [
        'button',
        'svg',
        'grammarly-extension',
        'grammarly-desktop-integration',
        '[data-radix-focus-guard]',
        '.sr-only',
        // ChatGPT source/citation elements
        'source-footnote',
        'sources-carousel-inline',
        'source-attribution',
        '[data-testid="source-footnote"]',
        '[data-testid="web-browsing-attribution"]',
        '[class*="browsing-attribution"]',
        '[class*="source-attribution"]',
        'cite',
        // ChatGPT role labels
        '[class*="author-name"]',
        '[class*="role-label"]',
        '[data-testid="conversation-turn-label"]',
        // Other UI noise
        'model-thoughts',
        'tts-control',
        'bard-avatar',
        '[class*="copy-button"]',
        '[class*="thumbs"]',
    ];

    noiseSelectors.forEach(sel => {
        try {
            dom.querySelectorAll(sel).forEach(el => el.remove());
        } catch { /* invalid selector — skip */ }
    });
}

// ─── Stage 4: Sanitize Markdown ──────────────────────────────────────────────

function sanitizeMarkdown(md) {
    let out = md;

    // Strip "ChatGPT said:", "You said:", "Claude said:", etc. prefixes
    out = out.replace(/^(?:ChatGPT|You|Claude|Gemini|Grok|Assistant|AI)\s+said:\s*/im, '');

    // Strip trailing "Sources" / "References" section added by ChatGPT web-search
    // responses — everything from the heading/word to end-of-string.
    out = out.replace(/\n+(?:##?\s+)?(?:Sources|References)(?:\s*\n[\s\S]*)?$/i, '');
    // Also catch "Sources" at the very end with no preceding newline (edge case)
    out = out.replace(/\s+(?:Sources|References)\s*$/i, '');

    // Strip ChatGPT citation links that Turndown may have converted to markdown links:
    // e.g. [Plesk](https://plesk.com/...?utm_source=chatgpt.com)
    out = out.replace(/\[([^\]]+)\]\([^)]*utm_source=chatgpt\.com[^)]*\)/g, '');

    // Collapse char-spacing artifacts: sequences like "D N S _ P R O B E" (≥4 single
    // chars each separated by exactly one space) back to the original word.
    // These come from ChatGPT syntax-highlighting spans that wrap each char individually.
    out = out.replace(/(?<![\S])((?:[A-Za-z0-9_!@#%^&*()\-+=,.] ){4,}[A-Za-z0-9_!@#%^&*()\-+=,.])(?![\S])/g,
        m => m.replace(/ /g, ''));

    return out
        // Normalise Windows CRLF → LF
        .replace(/\r\n/g, '\n')
        // Remove HTML comment remnants
        .replace(/<!--[\s\S]*?-->/g, '')
        // Normalise code fence backticks (4+ → 3)
        .replace(/^`{4,}(\w*)/gm, '```$1')
        // Collapse 3+ consecutive blank lines → 2
        .replace(/(\n\s*){3,}/g, '\n\n')
        // Trim leading/trailing whitespace
        .trim();
}

// ─── Stage 5: Parse Segments ──────────────────────────────────────────────────

/**
 * Parse clean markdown into a typed segment array.
 * Each segment has: { type, ...fields }
 * Types: heading1 | heading2 | heading3 | code | bullet | numbered | paragraph | hr | break | table
 */
function stageParseSegments(msg) {
    const segments = parseSegments(msg.markdown);
    return { ...msg, segments };
}

export function parseSegments(md) {
    const segs = [];
    const lines = md.split('\n');
    let codeBlock = null;
    let tableBuffer = [];

    const flushTable = () => {
        if (tableBuffer.length >= 2) {
            // Parse header + rows
            const header = tableBuffer[0].split('|').map(c => c.trim()).filter(Boolean);
            const rows = tableBuffer.slice(2).map(row =>
                row.split('|').map(c => c.trim()).filter(Boolean)
            );
            segs.push({ type: 'table', header, rows });
        }
        tableBuffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // ── Code fence
        if (line.startsWith('```')) {
            if (tableBuffer.length) flushTable();
            if (codeBlock === null) {
                codeBlock = { lang: line.slice(3).trim(), lines: [] };
            } else {
                segs.push({ type: 'code', lang: codeBlock.lang, content: codeBlock.lines.join('\n') });
                codeBlock = null;
            }
            continue;
        }
        if (codeBlock !== null) { codeBlock.lines.push(line); continue; }

        // ── Tables (GFM pipe tables)
        if (line.includes('|') && line.trim().startsWith('|')) {
            tableBuffer.push(line);
            continue;
        } else if (tableBuffer.length) {
            flushTable();
        }

        // ── Headings
        const h3 = line.match(/^### (.+)/);
        const h2 = line.match(/^## (.+)/);
        const h1 = line.match(/^# (.+)/);
        if (h1) { segs.push({ type: 'heading1', text: h1[1].trim() }); continue; }
        if (h2) { segs.push({ type: 'heading2', text: h2[1].trim() }); continue; }
        if (h3) { segs.push({ type: 'heading3', text: h3[1].trim() }); continue; }

        // ── HR
        if (/^---+$/.test(line.trim())) { segs.push({ type: 'hr' }); continue; }

        // ── Bullet list  (handles indented items like "  - text")
        const trimmedLine = line.replace(/^\s+/, '');
        const bullet = trimmedLine.match(/^([-*+])\s(.+)/);
        if (bullet) { segs.push({ type: 'bullet', text: bullet[2] }); continue; }

        // ── Numbered list (handles indented items)
        const numbered = trimmedLine.match(/^(\d+)\.\s(.+)/);
        if (numbered) { segs.push({ type: 'numbered', n: parseInt(numbered[1], 10), text: numbered[2] }); continue; }

        // ── Blockquote
        const bq = line.match(/^>\s?(.+)/);
        if (bq) { segs.push({ type: 'blockquote', text: bq[1] }); continue; }

        // ── Blank line
        if (line.trim() === '') { segs.push({ type: 'break' }); continue; }

        // ── Paragraph
        segs.push({ type: 'paragraph', text: line });
    }

    // Flush any open code block or table
    if (codeBlock) segs.push({ type: 'code', lang: codeBlock.lang, content: codeBlock.lines.join('\n') });
    if (tableBuffer.length) flushTable();

    // Deduplicate consecutive breaks
    return segs.filter((seg, i) =>
        !(seg.type === 'break' && segs[i - 1]?.type === 'break')
    );
}

// ─── Stage 6: Enrich ─────────────────────────────────────────────────────────

function stageEnrich(msg) {
    const codeSegs = msg.segments.filter(s => s.type === 'code');
    const hasCode = codeSegs.length > 0;
    const codeLanguages = [...new Set(
        codeSegs.map(s => s.lang).filter(Boolean)
    )];

    const hasTable = msg.segments.some(s => s.type === 'table');
    const hasBullets = msg.segments.some(s => s.type === 'bullet' || s.type === 'numbered');
    const hasHeadings = msg.segments.some(s => s.type.startsWith('heading'));

    // Word count (from plain text derived from markdown)
    const plainText = msg.markdown
        .replace(/```[\s\S]*?```/g, '')   // strip code blocks
        .replace(/[#*`_~[\]()]/g, '')      // strip markdown chars
        .replace(/\s+/g, ' ')
        .trim();
    const wordCount = plainText ? plainText.split(' ').length : 0;

    return {
        ...msg,
        plainText,
        wordCount,
        hasCode,
        codeLanguages,
        hasTable,
        hasBullets,
        hasHeadings,
    };
}

// ─── Stage 7: Aggregate Stats ─────────────────────────────────────────────────

function stageAggregate(messages, raw) {
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;
    const totalWords = messages.reduce((s, m) => s + m.wordCount, 0);
    const allLangs = [...new Set(messages.flatMap(m => m.codeLanguages))];
    const messagesWithCode = messages.filter(m => m.hasCode).length;
    const messagesWithTable = messages.filter(m => m.hasTable).length;

    return {
        messageCount: messages.length,
        userMessages,
        assistantMessages,
        totalWords,
        avgWordsPerMessage: messages.length ? Math.round(totalWords / messages.length) : 0,
        messagesWithCode,
        messagesWithTable,
        codeLanguages: allLangs,
        hasCode: messagesWithCode > 0,
        hasTable: messagesWithTable > 0,
    };
}

// ─── Utility: strip inline markdown for plain-text rendering ─────────────────

export function stripInline(text) {
    return (text || '')
        .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
        .replace(/\*(.+?)\*/g, '$1')   // *italic*
        .replace(/`(.+?)`/g, '$1')   // `code`
        .replace(/~~(.+?)~~/g, '$1')   // ~~strike~~
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')   // [links](url)
        .replace(/!\[.*?\]\(.+?\)/g, '')     // images
        .trim();
}
