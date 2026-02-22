/**
 * service_worker.js – Background service worker for MD-Export extension
 *
 * Handles 'export' (from popup) and 'overlayExport' (from in-page overlay).
 *
 * Service Worker constraints — these APIs do NOT exist here:
 *   ✗ document, window, DOMParser
 *   ✗ URL.createObjectURL / URL.revokeObjectURL
 *   ✗ FileReader
 *   ✓ Blob, ArrayBuffer, btoa, fetch, chrome.*
 *
 * Downloads use base64 data: URLs instead of object URLs.
 */

import { toMarkdown } from '../exporters/markdown.js';
import { toDocx } from '../exporters/docx.js';
import { toPdf } from '../exporters/pdf.js';
import { preprocess } from '../pipeline/preprocess.js';

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'export' || request.action === 'overlayExport') {
        handleExport(request)
            .then(result => sendResponse(result))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // keep message channel open (async)
    }
});

// ── Core export handler ───────────────────────────────────────────────────────

async function handleExport({ format, conversationData }) {
    // Run the preprocessing pipeline
    const processed = preprocess(conversationData);

    const safeTitle = (processed.title || 'chat')
        .replace(/[^a-z0-9\s\-]/gi, '').trim()
        .replace(/\s+/g, '_').slice(0, 60) || 'chat_export';
    const date = new Date().toISOString().slice(0, 10);
    const base = `${processed.site}_${safeTitle}_${date}`;

    if (format === 'md') {
        const text = toMarkdown(processed);
        const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text);
        await swDownload(dataUrl, `${base}.md`);
        return { success: true, filename: `${base}.md` };
    }

    if (format === 'docx') {
        const blob = await toDocx(processed);
        const dataUrl = await blobToDataUrl(blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        await swDownload(dataUrl, `${base}.docx`);
        return { success: true, filename: `${base}.docx` };
    }

    if (format === 'pdf') {
        const blob = await toPdf(processed);
        const dataUrl = await blobToDataUrl(blob, 'application/pdf');
        await swDownload(dataUrl, `${base}.pdf`);
        return { success: true, filename: `${base}.pdf` };
    }

    return { success: false, error: `Unknown format: ${format}` };
}

// ── Service-worker-safe helpers ───────────────────────────────────────────────

/**
 * Convert a Blob to a base64 data: URL.
 * Cannot use FileReader or URL.createObjectURL in service workers —
 * instead uses arrayBuffer() + Uint8Array + btoa (all available in SW).
 */
async function blobToDataUrl(blob, mimeType) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // btoa only handles strings up to ~50 MB safely by chunking
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);
    return `data:${mimeType};base64,${base64}`;
}

/**
 * Trigger a download via chrome.downloads.download.
 * Returns a promise that resolves once the download is initiated.
 */
function swDownload(url, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({ url, filename, saveAs: false }, downloadId => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(downloadId);
            }
        });
    });
}
