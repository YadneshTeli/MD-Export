/**
 * chatgpt.js – ChatGPT conversation scraper
 * DOM: article[data-testid^="conversation-turn-"] with data-turn="user"|"assistant"
 * User text: div.whitespace-pre-wrap
 * Assistant: div.markdown.prose
 */

import { cleanHtml, htmlToMarkdown, getPageTitle } from './base_scraper.js';

function scrapeConversation() {
    const articles = document.querySelectorAll(
        'article[data-testid^="conversation-turn-"]'
    );

    if (!articles || articles.length === 0) {
        return null;
    }

    const messages = [];

    articles.forEach((article) => {
        const role = article.getAttribute('data-turn'); // "user" or "assistant"
        if (!role) return;

        let contentHtml = '';
        let contentText = '';

        if (role === 'user') {
            // User bubble
            const bubble = article.querySelector('.whitespace-pre-wrap');
            if (bubble) {
                contentText = bubble.textContent.trim();
                contentHtml = `<p>${bubble.innerHTML}</p>`;
            }
        } else {
            // Assistant markdown div
            const markdownEl = article.querySelector('div.markdown.prose, div[class*="markdown prose"]');
            if (markdownEl) {
                contentHtml = cleanHtml(markdownEl);
                contentText = markdownEl.textContent.trim();
            } else {
                // fallback: data-message-author-role
                const msgEl = article.querySelector('[data-message-author-role="assistant"]');
                if (msgEl) {
                    contentHtml = cleanHtml(msgEl);
                    contentText = msgEl.textContent.trim();
                }
            }
        }

        if (contentHtml || contentText) {
            messages.push({ role, html: contentHtml, text: contentText });
        }
    });

    return {
        title: getPageTitle() || 'ChatGPT Conversation',
        site: 'ChatGPT',
        messages,
    };
}

// Listen for messages from popup/background
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
    return true; // keep channel open for async
});
