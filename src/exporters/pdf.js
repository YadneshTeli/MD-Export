/**
 * pdf.js – AI Chat PDF Exporter
 * Consumes ProcessedConversation from the preprocessing pipeline.
 * Architecture modelled after Repo-Gist/lib/pdf-export.ts
 *
 * Page-break fix: uses a shared `yRef = { value }` object so y-coordinate
 * stays in sync between renderSegments and the outer loop even after page breaks.
 */

import { jsPDF } from 'jspdf';
import { stripInline } from '../pipeline/preprocess.js';

// ─── Colour Palette ──────────────────────────────────────────────────────────

const colors = {
  pageBg: { r: 250, g: 250, b: 252 },
  headerBg: { r: 15, g: 17, b: 23 },
  userCardBg: { r: 235, g: 245, b: 251 },
  botCardBg: { r: 248, g: 248, b: 252 },
  userBar: { r: 52, g: 152, b: 219 },
  botBar: { r: 108, g: 99, b: 255 },
  textPrimary: { r: 26, g: 26, b: 30 },
  textMuted: { r: 110, g: 115, b: 135 },
  textAccent: { r: 108, g: 99, b: 255 },
  white: { r: 255, g: 255, b: 255 },
  divider: { r: 220, g: 220, b: 228 },
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_GUARD = 20; // mm of footer reserved

/**
 * Strip emoji and characters outside the Latin Extended-B block (U+0000–U+024F).
 * jsPDF's built-in Helvetica/Courier fonts are Latin-only – any character
 * outside that range will either be skipped silently or corrupt the text line.
 * Replace emoji with a plain-text fallback so the surrounding sentence still renders.
 */
function sanitizePdfText(text) {
  return (text || '')
    // Replace emoji with nothing (they are decoration; the text still makes sense)
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{1F300}-\u{1F9FF}]/gu, '')
    // Strip any remaining characters above Latin Extended-B (U+024F)
    .replace(/[^\u0000-\u024F\u2010-\u2027\u2030-\u206F]/g, '')
    // Collapse any double-spaces left behind
    .replace(/ {2,}/g, ' ')
    .trim();
}

// ─── Inline Markdown Helpers ─────────────────────────────────────────────────

/**
 * Parse text containing **bold**, *italic*, ***bolditalic***, and `code` markers
 * into typed run objects. Unmatched text becomes \{ style: 'normal' \}.
 */
function parseInlineRuns(text) {
  const result = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) result.push({ style: 'normal', text: text.slice(last, m.index) });
    if (m[1]) result.push({ style: 'bolditalic', text: m[1] });
    else if (m[2]) result.push({ style: 'bold', text: m[2] });
    else if (m[3]) result.push({ style: 'italic', text: m[3] });
    else if (m[4]) result.push({ style: 'code', text: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) result.push({ style: 'normal', text: text.slice(last) });
  return result.filter(r => r.text);
}

function fontForStyle(style) {
  switch (style) {
    case 'bold': return ['helvetica', 'bold'];
    case 'italic': return ['helvetica', 'italic'];
    case 'bolditalic': return ['helvetica', 'bolditalic'];
    case 'code': return ['courier', 'normal'];
    default: return ['helvetica', 'normal'];
  }
}

/**
 * Render text with inline markdown styling (bold/italic/code), word-wrapping
 * within maxW. Advances Y.value by total consumed height.
 * Handles oversized atoms (e.g., long URLs without spaces) by force-breaking
 * them character by character if they exceed maxW.
 */
function drawInlineRuns(doc, Y, text, x, maxW, size, setColor, baseColor, needsPage) {
  const LINE_H = size * 0.45;
  const runs = parseInlineRuns(text);
  if (!runs.length) { Y.value += LINE_H; return; }

  // Measure a space in the base font
  doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
  const spW = doc.getTextWidth(' ');

  // Break runs into word atoms preserving style
  const atoms = [];
  for (const run of runs) {
    for (const w of run.text.split(/\s+/).filter(Boolean)) {
      const clean = sanitizePdfText(w);
      if (clean) atoms.push({ style: run.style, text: clean });
    }
  }
  if (!atoms.length) { Y.value += LINE_H; return; }

  let lineAtoms = [], lineW = 0;

  const flushLine = () => {
    let cx = x;
    lineAtoms.forEach((a, i) => {
      const [ff, fs] = fontForStyle(a.style);
      doc.setFont(ff, fs); doc.setFontSize(size);
      setColor(a.style === 'code' ? { r: 108, g: 99, b: 255 } : baseColor);
      doc.text(a.text, cx, Y.value);
      cx += doc.getTextWidth(a.text) + (i < lineAtoms.length - 1 ? spW : 0);
    });
  };

  for (const atom of atoms) {
    const [ff, fs] = fontForStyle(atom.style);
    doc.setFont(ff, fs); doc.setFontSize(size);
    const aw = doc.getTextWidth(atom.text);

    // Handle oversized atoms (e.g., long URLs) by breaking them character by character
    if (aw > maxW) {
      // If there's anything in the current line, flush it first
      if (lineAtoms.length) {
        flushLine();
        Y.value += LINE_H;
        needsPage(LINE_H + 2);
        lineAtoms = []; lineW = 0;
      }

      // Now break the oversized atom
      let remainingText = atom.text;
      while (remainingText.length > 0) {
        let subAtomText = '';
        let subAtomWidth = 0;
        for (let i = 0; i < remainingText.length; i++) {
          const char = remainingText[i];
          const charWidth = doc.getTextWidth(char);
          if (subAtomWidth + charWidth > maxW && i > 0) {
            // Current char would exceed maxW, and we have at least one char already
            break;
          }
          subAtomText += char;
          subAtomWidth += charWidth;
        }

        if (subAtomText.length > 0) {
          // Render this sub-atom on its own line
          doc.setFont(ff, fs); doc.setFontSize(size);
          setColor(atom.style === 'code' ? { r: 108, g: 99, b: 255 } : baseColor);
          doc.text(subAtomText, x, Y.value);
          Y.value += LINE_H;
          needsPage(LINE_H + 2);
          remainingText = remainingText.substring(subAtomText.length);
        } else {
          // This should ideally not happen if maxW > 0, but as a safeguard
          // If a single character is wider than maxW, it will be rendered anyway
          doc.setFont(ff, fs); doc.setFontSize(size);
          setColor(atom.style === 'code' ? { r: 108, g: 99, b: 255 } : baseColor);
          doc.text(remainingText[0], x, Y.value);
          Y.value += LINE_H;
          needsPage(LINE_H + 2);
          remainingText = remainingText.substring(1);
        }
      }
      continue; // Move to the next original atom
    }

    // Normal word wrapping logic for atoms that fit or are smaller than maxW
    const gap = lineAtoms.length ? spW : 0;
    if (lineAtoms.length && lineW + gap + aw > maxW) {
      flushLine();
      Y.value += LINE_H;
      needsPage(LINE_H + 2);
      lineAtoms = []; lineW = 0;
    }
    lineAtoms.push(atom);
    lineW += (lineAtoms.length > 1 ? spW : 0) + aw;
  }
  if (lineAtoms.length) flushLine();
  Y.value += LINE_H;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export async function toPdf(processed) {
  const { title, site, exportedAt, stats, messages } = processed;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Shared mutable y-ref — MUST be mutated via .value everywhere
  const Y = { value: MARGIN };

  // ── Helpers using shared Y ────────────────────────────────────────────────

  const setColor = (color, type = 'text') => {
    if (type === 'fill') doc.setFillColor(color.r, color.g, color.b);
    else if (type === 'draw') doc.setDrawColor(color.r, color.g, color.b);
    else doc.setTextColor(color.r, color.g, color.b);
  };

  const addPageBg = () => {
    setColor(colors.pageBg, 'fill');
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  };

  // Returns true if a new page was added; always updates Y.value if so
  const needsPage = (space = 20) => {
    if (Y.value + space > PAGE_H - BOTTOM_GUARD) {
      doc.addPage();
      Y.value = MARGIN;
      addPageBg();
      return true;
    }
    return false;
  };

  const wrapText = (text, maxW, size) => {
    doc.setFontSize(size);
    return doc.splitTextToSize(text, maxW);
  };

  // ── Cover Header ──────────────────────────────────────────────────────────

  addPageBg(); // draw page background FIRST, then layer header graphics on top
  setColor(colors.headerBg, 'fill');
  doc.rect(0, 0, PAGE_W, 54, 'F');
  setColor(colors.userBar, 'fill'); doc.rect(0, 54, PAGE_W / 2, 2, 'F');
  setColor(colors.botBar, 'fill'); doc.rect(PAGE_W / 2, 54, PAGE_W / 2, 2, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
  setColor(colors.textMuted);
  doc.text('MD-EXPORT  ·  AI CHAT EXPORTER', MARGIN, 12);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  setColor(colors.white);
  const titleLines = doc.splitTextToSize(title || `${site} Conversation`, CONTENT_W - 10);
  let ty = 25;
  titleLines.slice(0, 2).forEach(l => { doc.text(l, MARGIN, ty); ty += 8; });

  // Metadata dots
  const date = new Date(exportedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  let mx = MARGIN;
  const drawDot = (value, label) => {
    setColor(colors.botBar, 'fill');
    doc.circle(mx + 1.5, 48.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setColor(colors.white);
    doc.text(value, mx + 5, 49.5);
    const vw = doc.getTextWidth(value);
    doc.setFont('helvetica', 'normal'); setColor(colors.textMuted);
    if (label) doc.text(label, mx + 6 + vw, 49.5);
    mx += 6 + vw + (label ? doc.getTextWidth(label) : 0) + 10;
  };
  drawDot(site, 'platform');
  drawDot(String(stats.messageCount), 'messages');
  drawDot(stats.totalWords.toLocaleString(), 'words');
  if (stats.codeLanguages.length > 0) drawDot(stats.codeLanguages.join(', '), 'code');

  Y.value = 66;

  // ── Stats Card ────────────────────────────────────────────────────────────

  drawStatsCard(doc, Y, stats, site, setColor, MARGIN, CONTENT_W);
  Y.value += 6;

  // ── Messages ──────────────────────────────────────────────────────────────

  for (let i = 0; i < messages.length; i++) {
    const { role, segments, wordCount, hasCode, codeLanguages } = messages[i];
    const isUser = role === 'user';
    const barColor = isUser ? colors.userBar : colors.botBar;
    const bgColor = isUser ? colors.userCardBg : colors.botCardBg;
    const speaker = isUser ? 'You' : site;

    // Render header bar + content with the shared Y ref
    needsPage(20);

    const headerY = Y.value;

    // Speaker header strip
    setColor(bgColor, 'fill');
    doc.roundedRect(MARGIN, headerY, CONTENT_W, 10, 2, 2, 'F');
    setColor(barColor, 'fill');
    doc.rect(MARGIN, headerY, 3, 10, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setColor(barColor);
    doc.text(speaker, MARGIN + 6, headerY + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setColor(colors.textMuted);
    doc.text(`${wordCount} words${hasCode ? '  ·  ' + codeLanguages.join(', ') : ''}`,
      PAGE_W - MARGIN - 2, headerY + 7, { align: 'right' });

    Y.value = headerY + 16;

    // Render body segments — Y is mutated in-place through the shared ref
    renderSegments(doc, Y, segments, MARGIN + 5, CONTENT_W - 10,
      setColor, wrapText, needsPage);

    // Closing gap + thin bottom border
    setColor(colors.divider, 'draw');
    doc.setLineWidth(0.2);
    doc.line(MARGIN, Y.value, PAGE_W - MARGIN, Y.value);
    Y.value += 12;
  }

  // ── Footer on every page ──────────────────────────────────────────────────

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setColor(colors.headerBg, 'fill');
    doc.rect(0, PAGE_H - 9, PAGE_W, 9, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(colors.textMuted);
    doc.text(`MD-Export  ·  ${(title || site).slice(0, 60)}  ·  Page ${p} of ${totalPages}`,
      PAGE_W / 2, PAGE_H - 3, { align: 'center' });
  }

  return doc.output('blob');
}

// ─── Stats Card ──────────────────────────────────────────────────────────────

function drawStatsCard(doc, Y, stats, site, setColor, margin, contentW) {
  const cardH = 22;
  setColor({ r: 255, g: 255, b: 255 }, 'fill');
  doc.roundedRect(margin, Y.value, contentW, cardH, 2, 2, 'F');
  setColor({ r: 108, g: 99, b: 255 }, 'draw');
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, Y.value, contentW, cardH, 2, 2, 'S');
  setColor({ r: 108, g: 99, b: 255 }, 'fill');
  doc.rect(margin, Y.value, 3, cardH, 'F');

  const items = [
    { label: 'Messages', value: String(stats.messageCount) },
    { label: 'Your turns', value: String(stats.userMessages) },
    { label: `${site} turns`, value: String(stats.assistantMessages) },
    { label: 'Total words', value: stats.totalWords.toLocaleString() },
    { label: 'Avg words', value: String(stats.avgWordsPerMessage) },
    { label: 'Code snippets', value: String(stats.messagesWithCode) },
  ];
  const colW = contentW / items.length;
  items.forEach((item, i) => {
    const ix = margin + 5 + i * colW;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    setColor({ r: 15, g: 17, b: 23 });
    doc.text(item.value, ix, Y.value + 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    setColor({ r: 110, g: 115, b: 135 });
    doc.text(item.label, ix, Y.value + 16);
  });
  Y.value += cardH;
}

// ─── Segment Renderer ─────────────────────────────────────────────────────────
//
// Uses shared Y ref object { value } so page breaks (which reset Y.value = MARGIN)
// are immediately visible to all subsequent drawing commands.
//

function renderSegments(doc, Y, segments, x, maxW, setColor, wrapText, needsPage) {

  for (const seg of segments) {
    switch (seg.type) {

      case 'heading1': {
        needsPage(10);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        setColor({ r: 15, g: 17, b: 23 });
        wrapText(stripInline(seg.text), maxW, 13).forEach(l => {
          doc.text(l, x, Y.value); Y.value += 6.5;
        });
        Y.value += 1;
        break;
      }

      case 'heading2': {
        needsPage(9);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        setColor({ r: 15, g: 17, b: 23 });
        wrapText(stripInline(seg.text), maxW, 11).forEach(l => {
          doc.text(l, x, Y.value); Y.value += 5.5;
        });
        Y.value += 1;
        break;
      }

      case 'heading3': {
        needsPage(8);
        doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(9.5);
        setColor({ r: 108, g: 99, b: 255 });
        wrapText(stripInline(seg.text), maxW, 9.5).forEach(l => {
          doc.text(l, x, Y.value); Y.value += 5;
        });
        break;
      }

      case 'blockquote': {
        needsPage(7);
        setColor(colors.botBar, 'fill');
        doc.rect(x, Y.value - 1, 2, 6, 'F');
        drawInlineRuns(doc, Y, seg.text, x + 5, maxW - 5, 8.5, setColor,
          { r: 80, g: 80, b: 90 }, needsPage);
        break;
      }

      case 'hr': {
        setColor({ r: 210, g: 210, b: 220 }, 'draw');
        doc.setLineWidth(0.2);
        doc.line(x, Y.value, x + maxW, Y.value);
        Y.value += 4;
        break;
      }

      case 'break': {
        Y.value += 2;
        break;
      }

      case 'bullet': {
        needsPage(6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        setColor(colors.botBar);
        doc.text('•', x, Y.value);
        drawInlineRuns(doc, Y, seg.text, x + 4, maxW - 4, 8.5, setColor,
          colors.textPrimary, needsPage);
        break;
      }

      case 'numbered': {
        needsPage(6);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        setColor(colors.botBar);
        doc.text(`${seg.n}.`, x, Y.value);
        drawInlineRuns(doc, Y, seg.text, x + 6, maxW - 6, 8.5, setColor,
          colors.textPrimary, needsPage);
        break;
      }

      case 'paragraph': {
        needsPage(6);
        drawInlineRuns(doc, Y, seg.text, x, maxW, 8.5, setColor,
          colors.textPrimary, needsPage);
        Y.value += 2; // bottom spacing between consecutive paragraphs
        break;
      }

      case 'code': {
        // Expand each source line into visually-wrapped sub-lines
        doc.setFont('courier', 'normal'); doc.setFontSize(7.5);
        const rawLines = seg.content.split('\n');
        const allLines = rawLines.flatMap(l =>
          l ? doc.splitTextToSize(l, maxW - 8) : ['']);

        const lineH = 4;
        const hdrH = seg.lang ? 8 : 0;
        const pad = 5;
        const blockH = allLines.length * lineH + hdrH + pad;

        if (blockH <= PAGE_H * 0.45) {
          // ── Small block: draw as a single rounded unit ─────────────────────
          needsPage(blockH + 4);
          setColor({ r: 30, g: 30, b: 30 }, 'fill');
          doc.roundedRect(x, Y.value - 1, maxW, blockH, 2, 2, 'F');

          if (seg.lang) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
            setColor({ r: 108, g: 99, b: 255 });
            doc.text(seg.lang.toUpperCase(), x + 3, Y.value + 4);
            Y.value += hdrH;
          }

          doc.setFont('courier', 'normal'); doc.setFontSize(7.5);
          setColor({ r: 212, g: 212, b: 212 });
          allLines.forEach(cl => {
            doc.text(cl || ' ', x + 3, Y.value + 4);
            Y.value += lineH;
          });
          Y.value += pad;

        } else {
          // ── Large block: paginate line by line ─────────────────────────────
          if (seg.lang) {
            needsPage(hdrH + lineH + 4);
            setColor({ r: 30, g: 30, b: 30 }, 'fill');
            doc.roundedRect(x, Y.value - 1, maxW, hdrH + 2, 2, 2, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
            setColor({ r: 108, g: 99, b: 255 });
            doc.text(seg.lang.toUpperCase(), x + 3, Y.value + 4);
            Y.value += hdrH;
          }

          doc.setFont('courier', 'normal'); doc.setFontSize(7.5);
          allLines.forEach(cl => {
            needsPage(lineH + 3);
            setColor({ r: 30, g: 30, b: 30 }, 'fill');
            doc.rect(x, Y.value - 1, maxW, lineH + 1, 'F');
            setColor({ r: 212, g: 212, b: 212 });
            doc.text(cl || ' ', x + 3, Y.value + 3);
            Y.value += lineH;
          });
          Y.value += pad;
        }
        break;
      }

      case 'table': {
        if (!seg.header || !seg.rows) break;
        const cols = seg.header.length;
        const colW = maxW / cols;           // distribute evenly, no hard cap
        const rowH = 6;
        const hdrBg = { r: 108, g: 99, b: 255 };
        const rowBgA = { r: 255, g: 255, b: 255 };
        const rowBgB = { r: 240, g: 240, b: 248 };
        const divider = { r: 200, g: 200, b: 215 };

        // ── Helper: truncate a single cell string so it fits inside colW ──
        const fitCell = (text) => {
          doc.setFontSize(6.5);
          let t = String(text);
          if (doc.getTextWidth(t) <= colW - 4) return t;
          while (t.length > 0 && doc.getTextWidth(t + '…') > colW - 4)
            t = t.slice(0, -1);
          return t + '…';
        };

        // ── Helper: draw the header row at current Y ──────────────────────
        const drawTblHeader = () => {
          setColor(hdrBg, 'fill');
          doc.rect(x, Y.value, maxW, rowH, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
          setColor({ r: 255, g: 255, b: 255 });
          seg.header.forEach((h, i) => {
            doc.text(fitCell(h), x + 2 + i * colW, Y.value + 4);
          });
          Y.value += rowH;
        };

        needsPage(rowH + 4);
        drawTblHeader();

        // ── Data rows ─────────────────────────────────────────────────────
        seg.rows.forEach((row, ri) => {
          if (needsPage(rowH + 2)) {
            // Re-draw header on the new page so columns stay legible
            drawTblHeader();
          }
          setColor(ri % 2 === 0 ? rowBgA : rowBgB, 'fill');
          doc.rect(x, Y.value, maxW, rowH, 'F');
          setColor(divider, 'draw');
          doc.setLineWidth(0.15);
          doc.line(x, Y.value + rowH, x + maxW, Y.value + rowH);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
          setColor({ r: 26, g: 26, b: 30 });
          row.forEach((cell, ci) => {
            doc.text(fitCell(cell), x + 2 + ci * colW, Y.value + 4);
          });
          Y.value += rowH;
        });
        Y.value += 4;
        break;
      }
    }
  }
}

export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    URL.revokeObjectURL(url);
  });
}
