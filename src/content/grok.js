/**
 * grok.js – Grok (grok.com / x.com/i/grok) scraper
 * Uses multiple attribute/class fallbacks since Grok's DOM is less documented.
 */

import { cleanHtml, htmlToMarkdown, getPageTitle } from './base_scraper.js';

export function scrapeConversation() {
    const messages = [];

    // Strategy 1: data-testid based
    const turns = document.querySelectorAll('[data-testid*="message"], [data-testid*="turn"]');

    if (turns.length > 0) {
        turns.forEach(turn => {
            const roleAttr = turn.getAttribute('data-testid') || '';
            const role = roleAttr.toLowerCase().includes('human') || roleAttr.toLowerCase().includes('user')
                ? 'user'
                : 'assistant';

            const contentEl = turn.querySelector('div[class*="message-content"], div[class*="MessageContent"], .prose, div[class*="markdown"]');
            if (contentEl) {
                const html = cleanHtml(contentEl);
                messages.push({
                    role,
                    markdown: htmlToMarkdown(html),
                    html,
                    text: contentEl.textContent.trim(),
                });
            }
        });
    }

    // Strategy 2: class-name pattern fallback
    if (messages.length === 0) {
        const msgBlocks = document.querySelectorAll('[class*="message-bubble"], [class*="MessageBubble"], [class*="chat-message"]');
        msgBlocks.forEach(block => {
            const isUser = block.classList.toString().toLowerCase().includes('user') ||
                block.querySelector('[class*="user"]') !== null;
            const html = cleanHtml(block);
            messages.push({
                role: isUser ? 'user' : 'assistant',
                markdown: htmlToMarkdown(html),
                html,
                text: block.textContent.trim(),
            });
        });
    }

    // Strategy 3: aria-label / role attributes
    if (messages.length === 0) {
        const humanMsgs = document.querySelectorAll('[aria-label*="Human message"], [aria-label*="user message"]');
        const aiMsgs = document.querySelectorAll('[aria-label*="AI message"], [aria-label*="Grok"]');
        humanMsgs.forEach(el => { const html = cleanHtml(el); messages.push({ role: 'user', markdown: htmlToMarkdown(html), html, text: el.textContent.trim() }); });
        aiMsgs.forEach(el => { const html = cleanHtml(el); messages.push({ role: 'assistant', markdown: htmlToMarkdown(html), html, text: el.textContent.trim() }); });
    }

    if (messages.length === 0) return null;

    return {
        title: getPageTitle() || 'Grok Conversation',
        site: 'Grok',
        messages,
    };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'scrape') {
        try {
            const data = scrapeConversation();
            if (!data || data.messages.length === 0) {
                sendResponse({ success: false, error: 'No conversation found. Make sure a chat is open.' });
            } else {
                sendResponse({ success: true, data });
            }
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
    }
    return true;
});
