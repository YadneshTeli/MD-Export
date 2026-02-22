/**
 * service_worker.js – Background service worker for MD-Export extension
 * Handles: injecting content scripts, receiving scraped data, running exporters, triggering downloads
 */

import { toMarkdown, downloadMarkdown } from '../exporters/markdown.js';
import { toDocx, downloadDocx } from '../exporters/docx.js';
import { toPdf, downloadPdf } from '../exporters/pdf.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'export') {
        handleExport(request).then(result => sendResponse(result)).catch(err => sendResponse({ success: false, error: err.message }));
        return true; // async
    }
});

async function handleExport({ format, conversationData }) {
    const { title, site } = conversationData;
    const safeTitle = title.replace(/[^a-z0-9\s-]/gi, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'chat_export';
    const date = new Date().toISOString().slice(0, 10);
    const baseFilename = `${site}_${safeTitle}_${date}`;

    try {
        if (format === 'md') {
            const markdown = toMarkdown(conversationData);
            downloadMarkdown(markdown, `${baseFilename}.md`);
            return { success: true, filename: `${baseFilename}.md` };
        }

        if (format === 'docx') {
            const blob = await toDocx(conversationData);
            downloadDocx(blob, `${baseFilename}.docx`);
            return { success: true, filename: `${baseFilename}.docx` };
        }

        if (format === 'pdf') {
            // PDF must be rendered in the content page context; handled there
            return { success: true, pending: true };
        }

        return { success: false, error: 'Unknown format: ' + format };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
