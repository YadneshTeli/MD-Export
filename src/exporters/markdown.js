/**
 * markdown.js – Markdown exporter
 * Consumes ProcessedConversation from the preprocessing pipeline.
 */

import { stripInline } from '../pipeline/preprocess.js';

/**
 * Convert a ProcessedConversation to a GFM Markdown string.
 * @param {ProcessedConversation} processed
 */
export function toMarkdown(processed) {
    const { title, site, exportedAt, stats, messages } = processed;
    const date = new Date(exportedAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });

    let md = '';

    // ── Header ────────────────────────────────────────────────────────────────
    md += `# ${title}\n\n`;
    md += `| | |\n|---|---|\n`;
    md += `| **Platform** | ${site} |\n`;
    md += `| **Exported** | ${date} |\n`;
    md += `| **Messages** | ${stats.messageCount} (${stats.userMessages} from you, ${stats.assistantMessages} from ${site}) |\n`;
    md += `| **Total Words** | ${stats.totalWords.toLocaleString()} |\n`;
    if (stats.codeLanguages.length > 0) {
        md += `| **Code** | ${stats.codeLanguages.join(', ')} |\n`;
    }
    md += `\n---\n\n`;

    // ── Messages ──────────────────────────────────────────────────────────────
    for (const msg of messages) {
        const { role, markdown, index, wordCount, hasCode, codeLanguages } = msg;
        const isUser = role === 'user';
        const speaker = isUser ? `## 🧑 You` : `## 🤖 ${site}`;

        md += `${speaker}\n`;
        if (hasCode && codeLanguages.length > 0) {
            md += `*Contains code: ${codeLanguages.join(', ')}*\n`;
        }
        md += `\n`;

        // Use the clean, sanitized markdown directly from the pipeline
        md += markdown;
        md += `\n\n---\n\n`;
    }

    return md.trim();
}

export function downloadMarkdown(markdown, filename) {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: false }, () => {
        URL.revokeObjectURL(url);
    });
}
