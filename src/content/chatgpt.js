/**
 * chatgpt.js – ChatGPT conversation scraper
 * DOM: section[data-testid^="conversation-turn-"] (or article) with data-turn="user"|"assistant"
 * User text: div.whitespace-pre-wrap
 * Assistant: div.markdown.prose
 */

import { cleanHtml, htmlToMarkdown, getPageTitle } from './base_scraper.js';

export function scrapeConversation() {
    // ChatGPT changed from <article> to <section> in mid-2025.
    // Match both for forward/backward compatibility.
    const articles = document.querySelectorAll(
        'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"]'
    );

    if (!articles || articles.length === 0) {
        return null;
    }

    const messages = [];

    articles.forEach((article) => {
        // Prefer data-turn; fall back to data-message-author-role inside the article
        const role = article.getAttribute('data-turn')
            || article.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role')
            || null;
        if (!role) return;

        let contentHtml = '';
        let contentText = '';

        if (role === 'user') {
            // User bubble — whitespace-pre-wrap contains the typed text
            const bubble = article.querySelector('.whitespace-pre-wrap');
            if (bubble) {
                contentText = bubble.textContent.trim();
                contentHtml = `<p>${bubble.innerHTML}</p>`;
            }
        } else {
            // Assistant markdown div — try increasingly broad selectors
            const markdownEl =
                article.querySelector('div.markdown.prose') ||
                article.querySelector('div[class*="markdown prose"]') ||
                article.querySelector('div[class*="markdown"]');

            if (markdownEl) {
                contentHtml = cleanHtml(markdownEl);
                contentText = markdownEl.textContent.trim();
            } else {
                const msgEl = article.querySelector('[data-message-author-role="assistant"]');
                if (msgEl) {
                    // Clone and strip the role label heading before extracting
                    const clone = msgEl.cloneNode(true);
                    clone.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="author"],[class*="role-label"]')
                        .forEach(el => el.remove());
                    contentHtml = cleanHtml(clone);
                    contentText = clone.textContent.trim();
                }
            }
        }

        if (contentHtml || contentText) {
            messages.push({
                role,
                markdown: contentHtml ? htmlToMarkdown(contentHtml) : '',
                html: contentHtml,
                text: contentText,
            });
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
