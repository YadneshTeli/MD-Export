/**
 * gemini.js – Gemini conversation scraper
 * DOM confirmed from actual page HTML:
 * - Full history: div#chat-history > infinite-scroller
 * - Each Q&A pair: div.conversation-container
 *   └── user-query → div.query-text.gds-body-l → p.query-text-line
 *   └── model-response → structured-content-container → div.markdown.markdown-main-panel
 *
 * NOTE: Use querySelector (NOT querySelectorAll) for the markdown panel to
 * avoid picking up hidden draft panels when Gemini shows multiple responses.
 */

import { cleanHtml, htmlToMarkdown, getPageTitle } from './base_scraper.js';

export function scrapeConversation() {
    const pairs = document.querySelectorAll('div.conversation-container');

    if (!pairs || pairs.length === 0) {
        return null;
    }

    const messages = [];

    pairs.forEach((pair) => {
        // --- User message ---
        // Collect all query-text-line paragraphs (multi-line prompts have multiple <p>s)
        const userQueryLines = pair.querySelectorAll('p.query-text-line');
        let userText = '';
        userQueryLines.forEach(el => { userText += el.textContent.trim() + '\n'; });
        userText = userText.trim();

        if (userText) {
            // Build a simple HTML string so htmlToMarkdown can produce proper markdown.
            // Providing `markdown` directly avoids the service-worker DOMParser fallback.
            const userHtml = userText.split('\n').map(l => `<p>${l}</p>`).join('');
            messages.push({
                role: 'user',
                html: userHtml,
                markdown: userText,   // plain text is valid markdown for user prompts
                text: userText,
            });
        }

        // --- Model response ---
        // Use querySelector (first match only) to avoid scraping hidden draft panels.
        // Gemini renders multiple drafts as siblings but only one is visible at a time.
        const panel = pair.querySelector(
            'div.markdown.markdown-main-panel, div[class*="markdown-main-panel"]'
        );

        if (panel) {
            const cleaned = cleanHtml(panel);
            const text = panel.textContent.trim();
            if (text) {
                messages.push({ role: 'assistant', markdown: htmlToMarkdown(cleaned), html: cleaned, text });
            }
        }
    });

    return {
        title: getPageTitle() || 'Gemini Conversation',
        site: 'Gemini',
        messages,
    };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'scrape') {
        try {
            const data = scrapeConversation();
            if (!data || data.messages.length === 0) {
                sendResponse({ success: false, error: 'No conversation found on this page.' });
            } else {
                sendResponse({ success: true, data });
            }
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
    }
    return true;
});
