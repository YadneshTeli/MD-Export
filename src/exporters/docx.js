/**
 * docx.js – DOCX Exporter
 * Consumes ProcessedConversation from the preprocessing pipeline.
 * Uses docx.js to build a styled Word document from pre-parsed segments.
 */

import {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    AlignmentType, BorderStyle, ShadingType, TableRow, TableCell,
    Table, WidthType, convertInchesToTwip,
} from 'docx';
import { stripInline } from '../pipeline/preprocess.js';

// ── Colour constants (hex without #) ─────────────────────────────────────────
const C = {
    userBar: '3498DB',
    botBar: '6C63FF',
    userBg: 'EBF5FB',
    botBg: 'F5F5FF',
    codeBg: '1E1E1E',
    codeText: 'D4D4D4',
    text: '1A1A1E',
    muted: '6E7387',
    heading: '0F1117',
    accent: '6C63FF',
};

/**
 * @param {ProcessedConversation} processed
 * @returns {Promise<Blob>}
 */
export async function toDocx(processed) {
    const { title, site, exportedAt, stats, messages } = processed;
    const date = new Date(exportedAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
    });

    const children = [];

    // ── Cover Title ────────────────────────────────────────────────────────────
    children.push(
        new Paragraph({
            text: title || `${site} Conversation`,
            heading: HeadingLevel.TITLE,
            spacing: { after: 120 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: `${site}  ·  ${date}  ·  ${stats.messageCount} messages  ·  ${stats.totalWords.toLocaleString()} words`, color: C.muted, italics: true, size: 18 }),
            ],
            spacing: { after: 100 },
        }),
    );

    // Stats summary row
    const statItems = [
        `You: ${stats.userMessages}`, `${site}: ${stats.assistantMessages}`,
        `Words: ${stats.totalWords.toLocaleString()}`,
        ...(stats.codeLanguages.length ? [`Code: ${stats.codeLanguages.join(', ')}`] : []),
    ];
    children.push(
        new Paragraph({
            children: statItems.map((s, i) => [
                new TextRun({ text: s, bold: true, size: 18, color: C.accent }),
                i < statItems.length - 1 ? new TextRun({ text: '   ·   ', color: C.muted, size: 18 }) : null,
            ].filter(Boolean)).flat(),
            spacing: { after: 300 },
            border: { bottom: { color: 'CCCCCC', style: BorderStyle.SINGLE, size: 4 } },
        })
    );

    // ── Messages ──────────────────────────────────────────────────────────────
    for (const msg of messages) {
        const { role, segments, wordCount, hasCode, codeLanguages } = msg;
        const isUser = role === 'user';
        const speaker = isUser ? '🧑 You' : `🤖 ${site}`;
        const barColor = isUser ? C.userBar : C.botBar;
        const bgColor = isUser ? C.userBg : C.botBg;

        // Speaker heading
        children.push(
            new Paragraph({
                children: [
                    new TextRun({ text: speaker, bold: true, size: 22, color: barColor }),
                    new TextRun({ text: `  ${wordCount} words${hasCode ? '  · ' + codeLanguages.join(', ') : ''}`, size: 16, color: C.muted, italics: true }),
                ],
                shading: { type: ShadingType.CLEAR, fill: bgColor, color: bgColor },
                border: { left: { color: barColor, style: BorderStyle.THICK, size: 12 } },
                spacing: { before: 200, after: 80 },
                indent: { left: 120 },
            })
        );

        // Render each segment
        for (const seg of segments) {
            const segParagraphs = renderDocxSegment(seg, bgColor, C);
            children.push(...segParagraphs);
        }

        // Divider
        children.push(
            new Paragraph({
                text: '',
                border: { bottom: { color: 'E0E0E0', style: BorderStyle.SINGLE, size: 2 } },
                spacing: { before: 120, after: 120 },
            })
        );
    }

    // Footer note
    children.push(
        new Paragraph({
            children: [new TextRun({ text: `Exported by MD-Export Chrome Extension  ·  ${date}`, color: C.muted, italics: true, size: 16 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 300 },
        })
    );

    const doc = new Document({
        creator: 'MD-Export Chrome Extension',
        title,
        sections: [{ properties: {}, children }],
    });

    return await Packer.toBlob(doc);
}

// ── Segment → docx Paragraph(s) ──────────────────────────────────────────────

function renderDocxSegment(seg, bgColor, C) {
    switch (seg.type) {

        case 'heading1':
            return [new Paragraph({ text: stripInline(seg.text), heading: HeadingLevel.HEADING_1, spacing: { before: 160, after: 80 } })];

        case 'heading2':
            return [new Paragraph({ text: stripInline(seg.text), heading: HeadingLevel.HEADING_2, spacing: { before: 140, after: 60 } })];

        case 'heading3':
            return [new Paragraph({ text: stripInline(seg.text), heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 40 } })];

        case 'hr':
            return [new Paragraph({ text: '', border: { bottom: { color: 'DDDDDD', style: BorderStyle.SINGLE, size: 2 } }, spacing: { before: 80, after: 80 } })];

        case 'break':
            return [new Paragraph({ text: '', spacing: { after: 60 } })];

        case 'bullet':
            return [new Paragraph({
                children: [new TextRun({ text: stripInline(seg.text), size: 20, color: C.text })],
                bullet: { level: 0 },
                spacing: { after: 40 },
            })];

        case 'numbered':
            return [new Paragraph({
                children: [new TextRun({ text: `${seg.n}. ${stripInline(seg.text)}`, size: 20, color: C.text })],
                spacing: { after: 40 },
                indent: { left: 360 },
            })];

        case 'paragraph':
            return [new Paragraph({
                children: buildInlineRuns(seg.text, C),
                spacing: { after: 80 },
            })];

        case 'code': {
            const lines = seg.content.split('\n');
            const paragraphs = [];
            if (seg.lang) {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: seg.lang, size: 16, color: C.accent, bold: true })],
                    spacing: { before: 80, after: 20 },
                }));
            }
            lines.forEach(line => {
                paragraphs.push(new Paragraph({
                    children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 17, color: C.codeText })],
                    shading: { type: ShadingType.CLEAR, fill: '1E1E1E' },
                    spacing: { before: 0, after: 0 },
                }));
            });
            paragraphs.push(new Paragraph({ text: '', spacing: { after: 80 } }));
            return paragraphs;
        }

        case 'table': {
            if (!seg.header || !seg.rows || seg.rows.length === 0) return [];
            const colCount = seg.header.length;
            const colWidth = Math.floor(9000 / colCount);

            const headerRow = new TableRow({
                children: seg.header.map(h => new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: String(h), bold: true, color: 'FFFFFF', size: 18 })] })],
                    shading: { type: ShadingType.CLEAR, fill: C.accent },
                    width: { size: colWidth, type: WidthType.DXA },
                })),
                tableHeader: true,
            });

            const dataRows = seg.rows.map((row, ri) => new TableRow({
                children: row.map(cell => new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18, color: C.text })] })],
                    shading: ri % 2 === 0
                        ? undefined
                        : { type: ShadingType.CLEAR, fill: 'F5F5FF' },
                })),
            }));

            return [
                new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } }),
                new Paragraph({ text: '', spacing: { after: 120 } }),
            ];
        }

        default:
            return [];
    }
}

/** Build inline TextRun array from markdown-formatted text */
function buildInlineRuns(text, C) {
    const runs = [];
    // Pattern: **bold**, *italic*, `code`, or plain text
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|([^*`]+))/g;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        if (m[2]) runs.push(new TextRun({ text: m[2], bold: true, size: 20, color: C.text }));
        else if (m[3]) runs.push(new TextRun({ text: m[3], italics: true, size: 20, color: C.text }));
        else if (m[4]) runs.push(new TextRun({ text: m[4], font: 'Courier New', size: 18, color: C.accent }));
        else if (m[5]) runs.push(new TextRun({ text: m[5], size: 20, color: C.text }));
    }
    return runs.length ? runs : [new TextRun({ text: stripInline(text), size: 20, color: C.text })];
}

export function downloadDocx(blob, filename) {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: false }, () => {
        URL.revokeObjectURL(url);
    });
}
