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

    if (msg.html && hasDOMParser) {
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
    } else if (msg.markdown) {
        // Pre-converted markdown (overlay sends this)
        markdown = msg.markdown;
    } else {
        // Plain text fallback — overlay text, or service worker context
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
    const noiseSelectors = [
        'button',
        'svg',
        'grammarly-extension',
        'grammarly-desktop-integration',
        '[data-radix-focus-guard]',
        '.sr-only',
        'source-footnote',
        'sources-carousel-inline',
        'source-inline-chip',
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

/**
 * Post-process Turndown output to strip exporter artifacts and normalise spacing.
 */
function sanitizeMarkdown(md) {
    return md
        // Remove ## emoji speaker headers added by our own toMarkdown() formatter
        .replace(/^##\s+[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s+.*$/gmu, '')
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

        // ── Bullet list
        const bullet = line.match(/^([-*+])\s(.+)/);
        if (bullet) { segs.push({ type: 'bullet', text: bullet[2] }); continue; }

        // ── Numbered list
        const numbered = line.match(/^(\d+)\.\s(.+)/);
        if (numbered) { segs.push({ type: 'numbered', n: parseInt(numbered[1], 10), text: numbered[2] }); continue; }

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
