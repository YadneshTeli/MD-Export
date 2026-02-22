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
  addPageBg();

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

    Y.value = headerY + 12;

    // Render body segments — Y is mutated in-place through the shared ref
    renderSegments(doc, Y, segments, MARGIN + 5, CONTENT_W - 10,
      setColor, wrapText, needsPage);

    // Closing gap + thin bottom border
    setColor(colors.divider, 'draw');
    doc.setLineWidth(0.2);
    doc.line(MARGIN, Y.value, PAGE_W - MARGIN, Y.value);
    Y.value += 6;
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
        const bLines = wrapText(stripInline(seg.text), maxW - 5, 8.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        setColor({ r: 108, g: 99, b: 255 });
        doc.text('•', x, Y.value);
        doc.setFont('helvetica', 'normal');
        setColor({ r: 26, g: 26, b: 30 });
        bLines.forEach((l, i) => { doc.text(l, x + 4, Y.value + i * 4.5); });
        Y.value += bLines.length * 4.5;
        break;
      }

      case 'numbered': {
        needsPage(6);
        const nLines = wrapText(stripInline(seg.text), maxW - 7, 8.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        setColor({ r: 108, g: 99, b: 255 });
        doc.text(`${seg.n}.`, x, Y.value);
        doc.setFont('helvetica', 'normal');
        setColor({ r: 26, g: 26, b: 30 });
        nLines.forEach((l, i) => { doc.text(l, x + 6, Y.value + i * 4.5); });
        Y.value += nLines.length * 4.5;
        break;
      }

      case 'paragraph': {
        needsPage(6);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        setColor({ r: 26, g: 26, b: 30 });
        wrapText(stripInline(seg.text), maxW, 8.5).forEach(l => {
          needsPage(5);
          doc.text(l, x, Y.value);
          Y.value += 4.5;
        });
        break;
      }

      case 'code': {
        const cLines = seg.content.split('\n');
        const cH = cLines.length * 4 + (seg.lang ? 13 : 8);
        needsPage(Math.min(cH, PAGE_H * 0.4));

        setColor({ r: 30, g: 30, b: 30 }, 'fill');
        doc.roundedRect(x, Y.value - 1, maxW, cH, 2, 2, 'F');

        if (seg.lang) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
          setColor({ r: 108, g: 99, b: 255 });
          doc.text(seg.lang.toUpperCase(), x + 3, Y.value + 4);
          Y.value += 6;
        }

        doc.setFont('courier', 'normal'); doc.setFontSize(7.5);
        setColor({ r: 212, g: 212, b: 212 });
        cLines.forEach(cl => {
          needsPage(5);
          doc.text(cl.length > 100 ? cl.slice(0, 100) + '…' : (cl || ' '), x + 3, Y.value + 4);
          Y.value += 4;
        });
        Y.value += 5;
        break;
      }

      case 'table': {
        if (!seg.header || !seg.rows) break;
        const cols = seg.header.length;
        const colW = Math.min(maxW / cols, 45);
        const rowH = 6;

        needsPage(rowH + 4);

        // Header
        setColor({ r: 108, g: 99, b: 255 }, 'fill');
        doc.rect(x, Y.value, maxW, rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
        setColor({ r: 255, g: 255, b: 255 });
        seg.header.forEach((h, i) => {
          doc.text(String(h).slice(0, 20), x + 2 + i * colW, Y.value + 4);
        });
        Y.value += rowH;

        // Rows
        seg.rows.forEach((row, ri) => {
          needsPage(rowH);
          setColor(ri % 2 === 0 ? { r: 255, g: 255, b: 255 } : { r: 240, g: 240, b: 248 }, 'fill');
          doc.rect(x, Y.value, maxW, rowH, 'F');
          setColor({ r: 200, g: 200, b: 215 }, 'draw');
          doc.setLineWidth(0.15);
          doc.line(x, Y.value + rowH, x + maxW, Y.value + rowH);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
          setColor({ r: 26, g: 26, b: 30 });
          row.forEach((cell, ci) => {
            doc.text(String(cell).slice(0, 22), x + 2 + ci * colW, Y.value + 4);
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
