/**
 * claude.js – Claude (claude.ai) scraper
 * DOM: [data-testid="human-turn"] and [data-testid="ai-turn"]
 */

import { cleanHtml, getPageTitle } from './base_scraper.js';

export function scrapeConversation() {
    const messages = [];

    // Primary selectors confirmed from Claude docs / community
    const humanTurns = document.querySelectorAll('[data-testid="human-turn"]');
    const aiTurns = document.querySelectorAll('[data-testid="ai-turn"]');

    // Interleave by DOM order
    const allTurns = Array.from(document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]'));

    if (allTurns.length > 0) {
        allTurns.forEach(turn => {
            const isHuman = turn.getAttribute('data-testid') === 'human-turn';
            const role = isHuman ? 'user' : 'assistant';

            // Find the prose/markdown content
            const contentEl = turn.querySelector('.prose, div[class*="prose"], div[class*="markdown"]') || turn;
            messages.push({
                role,
                html: cleanHtml(contentEl),
                text: contentEl.textContent.trim(),
            });
        });
    } else {
        // Fallback: aria roles
        const userMsgs = document.querySelectorAll('[class*="HumanMessage"], [class*="humanMessage"]');
        const aiMsgs = document.querySelectorAll('[class*="AIMessage"], [class*="assistantMessage"]');
        userMsgs.forEach(el => messages.push({ role: 'user', html: cleanHtml(el), text: el.textContent.trim() }));
        aiMsgs.forEach(el => messages.push({ role: 'assistant', html: cleanHtml(el), text: el.textContent.trim() }));
    }

    if (messages.length === 0) return null;

    return {
        title: getPageTitle() || 'Claude Conversation',
        site: 'Claude',
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
