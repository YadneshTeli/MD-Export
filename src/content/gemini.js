/**
 * gemini.js – Gemini conversation scraper
 * DOM confirmed from actual page HTML:
 * - Full history: div#chat-history > infinite-scroller
 * - Each Q&A pair: div.conversation-container
 * - User query: user-query → .query-text-line (p element)
 * - Model response: structured-content-container → div.markdown.markdown-main-panel
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
        const userQueryLines = pair.querySelectorAll('p.query-text-line, .query-text');
        let userText = '';
        userQueryLines.forEach(el => { userText += el.textContent.trim() + ' '; });
        userText = userText.trim();

        if (userText) {
            messages.push({ role: 'user', html: `<p>${userText}</p>`, text: userText });
        }

        // --- Model response ---
        // Primary: div.markdown.markdown-main-panel (confirmed selector)
        const markdownPanels = pair.querySelectorAll(
            'div.markdown.markdown-main-panel, div[class*="markdown-main-panel"]'
        );

        markdownPanels.forEach(panel => {
            const cleaned = cleanHtml(panel);
            const text = panel.textContent.trim();
            if (text) {
                messages.push({ role: 'assistant', html: cleaned, text });
            }
        });
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
