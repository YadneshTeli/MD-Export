/**
 * claude.js – Claude (claude.ai) scraper
 *
 * DOM structure (as of early 2026):
 *   User messages:      [data-testid="user-message"]
 *   Assistant messages: [data-is-streaming] contains one or more
 *                       .standard-markdown / .progressive-markdown blocks,
 *                       potentially separated by tool-use UI (e.g. "Searched the web").
 *
 * Key insight: there can be MULTIPLE .standard-markdown blocks per AI turn.
 *   • Block 1 (before tool use): intro sentence, e.g. "I'll fetch that…"
 *   • Tool-use widget:           collapsible "Searched the web" section (ignored)
 *   • Block 2 (after tool use):  the actual full response
 *
 * Pattern: mirrors chatgpt.js / gemini.js / grok.js —
 *   always pass a single DOM element to cleanHtml() → htmlToMarkdown().
 *   Never join raw innerHTML strings, as Tailwind class names like
 *   [&_>_*]:min-w-0 get Turndown-escaped to \[\&_\>_\*\] in the output.
 */

import { cleanHtml, htmlToMarkdown, getPageTitle } from './base_scraper.js';

/**
 * Given a [data-is-streaming] element, collect all .standard-markdown /
 * .progressive-markdown child blocks, clone them into a single wrapper <div>,
 * and return it. This lets cleanHtml + htmlToMarkdown work on a proper DOM
 * node (not a raw HTML string), preventing Turndown from escaping class-name
 * characters as markdown syntax.
 */
function buildAssistantWrapper(streamingEl) {
    const mdBlocks = Array.from(
        streamingEl.querySelectorAll('.standard-markdown, .progressive-markdown')
    ).filter(b => b.textContent.trim().length > 0);

    if (mdBlocks.length === 0) {
        // Fallback: use the whole font-claude-response div
        return streamingEl.querySelector('[class*="font-claude-response"]') || streamingEl;
    }

    if (mdBlocks.length === 1) {
        return mdBlocks[0];
    }

    // Multiple blocks (e.g. intro sentence + full response after tool use):
    // clone each into a single wrapper div so cleanHtml operates on one node.
    const wrapper = document.createElement('div');
    mdBlocks.forEach(block => {
        wrapper.appendChild(block.cloneNode(true));
    });
    return wrapper;
}

export function scrapeConversation() {
    const messages = [];

    // ── Strategy 1: Current Claude DOM (2025/2026) ──────────────────────────
    // Conversation turns are wrapped in [data-test-render-count] siblings.
    const turnContainers = document.querySelectorAll('[data-test-render-count]');

    if (turnContainers.length > 0) {
        turnContainers.forEach(container => {
            // --- User message ---
            const userMsgEl = container.querySelector('[data-testid="user-message"]');
            if (userMsgEl) {
                const html = cleanHtml(userMsgEl);
                messages.push({
                    role: 'user',
                    markdown: htmlToMarkdown(html),
                    html,
                    text: userMsgEl.textContent.trim(),
                });
                return;
            }

            // --- Assistant message ---
            const streamingEl = container.querySelector('[data-is-streaming]');
            if (streamingEl) {
                const contentEl = buildAssistantWrapper(streamingEl);
                const html = cleanHtml(contentEl);
                const text = contentEl.textContent.trim();
                if (text) {
                    messages.push({
                        role: 'assistant',
                        markdown: htmlToMarkdown(html),
                        html,
                        text,
                    });
                }
            }
        });
    }

    // ── Strategy 2: Legacy data-testid selectors (older Claude versions) ────
    if (messages.length === 0) {
        const allTurns = Array.from(
            document.querySelectorAll('[data-testid="human-turn"], [data-testid="ai-turn"]')
        );
        allTurns.forEach(turn => {
            const isHuman = turn.getAttribute('data-testid') === 'human-turn';
            const role = isHuman ? 'user' : 'assistant';
            const contentEl =
                turn.querySelector('.prose, div[class*="prose"], div[class*="markdown"]') || turn;
            const html = cleanHtml(contentEl);
            messages.push({
                role,
                markdown: htmlToMarkdown(html),
                html,
                text: contentEl.textContent.trim(),
            });
        });
    }

    // ── Strategy 3: Class-name heuristics ───────────────────────────────────
    if (messages.length === 0) {
        const fallbackTurns = document.querySelectorAll(
            '[class*="HumanMessage"], [class*="humanMessage"], [class*="AIMessage"], [class*="assistantMessage"]'
        );
        fallbackTurns.forEach(el => {
            const cls = el.className.toString().toLowerCase();
            const role = cls.includes('human') ? 'user' : 'assistant';
            const html = cleanHtml(el);
            messages.push({
                role,
                markdown: htmlToMarkdown(html),
                html,
                text: el.textContent.trim(),
            });
        });
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
