/**
 * grok.js – Grok (grok.com / x.com/i/grok) scraper
 *
 * DOM structure (observed Feb 2026):
 *   Each turn is a div with id="response-{uuid}" and class containing:
 *     - "items-end"  → user message
 *     - "items-start" → assistant message
 *   The actual text lives in: div.response-content-markdown
 */

import { cleanHtml, htmlToMarkdown, getPageTitle } from './base_scraper.js';

export function scrapeConversation() {
    const messages = [];

    // Strategy 1: id="response-*" containers (current Grok DOM, Feb 2026)
    // Each turn has id starting with "response-" and class items-end (user) or items-start (assistant)
    const turns = document.querySelectorAll('[id^="response-"]');

    if (turns.length > 0) {
        turns.forEach(turn => {
            const classList = turn.className || '';
            // items-end = user message bubble (aligned right), items-start = assistant (aligned left)
            const role = classList.includes('items-end') ? 'user' : 'assistant';

            // Content lives in .response-content-markdown; fall back to .message-bubble prose container
            const contentEl =
                turn.querySelector('.response-content-markdown') ||
                turn.querySelector('[class*="response-content"]') ||
                turn.querySelector('.message-bubble .prose') ||
                turn.querySelector('[class*="message-bubble"]');

            if (contentEl) {
                const html = cleanHtml(contentEl);
                const text = contentEl.textContent.trim();
                if (text) {
                    messages.push({
                        role,
                        markdown: htmlToMarkdown(html),
                        html,
                        text,
                    });
                }
            }
        });
    }

    // Strategy 2: data-testid based (older Grok / x.com/i/grok)
    if (messages.length === 0) {
        const testIdTurns = document.querySelectorAll('[data-testid*="message"], [data-testid*="turn"]');
        testIdTurns.forEach(turn => {
            const roleAttr = turn.getAttribute('data-testid') || '';
            const role = roleAttr.toLowerCase().includes('human') || roleAttr.toLowerCase().includes('user')
                ? 'user'
                : 'assistant';
            const contentEl =
                turn.querySelector('.response-content-markdown') ||
                turn.querySelector('[class*="message-content"]') ||
                turn.querySelector('.prose');
            if (contentEl) {
                const html = cleanHtml(contentEl);
                const text = contentEl.textContent.trim();
                if (text) messages.push({ role, markdown: htmlToMarkdown(html), html, text });
            }
        });
    }

    // Strategy 3: message-bubble class fallback — role via parent alignment class
    if (messages.length === 0) {
        const msgBlocks = document.querySelectorAll('[class*="message-bubble"]');
        msgBlocks.forEach(block => {
            // Walk up to find a container with items-end / items-start
            let el = block;
            let role = 'assistant';
            for (let i = 0; i < 6; i++) {
                el = el.parentElement;
                if (!el) break;
                if (el.className && el.className.includes('items-end')) { role = 'user'; break; }
                if (el.className && el.className.includes('items-start')) { role = 'assistant'; break; }
            }
            const contentEl = block.querySelector('.response-content-markdown') || block;
            const html = cleanHtml(contentEl);
            const text = contentEl.textContent.trim();
            if (text) messages.push({ role, markdown: htmlToMarkdown(html), html, text });
        });
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
