/**
 * overlay.js – In-page per-message Export buttons + slide-in selection panel
 *
 * Inspired by Code-Mix NLP extension's content-side injection pattern.
 *
 * Features:
 *   • Injects a small "Export ↓" button on every message bubble
 *   • Click any message button → opens the selection panel with that message pre-selected
 *   • A persistent floating FAB (bottom-right) opens the full selection panel
 *   • MutationObserver keeps the UI alive across SPA navigation
 *   • Export is handled by the background service worker
 */

// ── Safe IIFE wrapper (prevents top-level errors from killing the whole script)

(function mdeOverlayInit() {
  'use strict';

  // ── Site config map ───────────────────────────────────────────────────────

  const SITE_CONFIG = {
    'chat.openai.com': { name: 'ChatGPT', msgSelector: 'article[data-testid^="conversation-turn-"]', roleAttr: 'data-turn' },
    'chatgpt.com': { name: 'ChatGPT', msgSelector: 'article[data-testid^="conversation-turn-"]', roleAttr: 'data-turn' },
    'gemini.google.com': { name: 'Gemini', msgSelector: 'div.conversation-container', roleAttr: null },
    'grok.com': { name: 'Grok', msgSelector: '[data-testid*="message"],[data-testid*="turn"]', roleAttr: 'data-testid' },
    'x.com': { name: 'Grok', msgSelector: '[data-testid*="message"],[data-testid*="turn"]', roleAttr: 'data-testid' },
    'claude.ai': { name: 'Claude', msgSelector: '[data-testid="human-turn"],[data-testid="ai-turn"]', roleAttr: 'data-testid' },
  };

  const site = SITE_CONFIG[location.hostname];
  if (!site) return; // not a supported page

  // ── State ─────────────────────────────────────────────────────────────────

  let panelOpen = false;
  let selectedFormat = 'md';
  let rawMessages = [];     // { role, text, html } from DOM
  let selectedIndices = new Set();

  const MDE_BTN_ATTR = 'data-mde-injected'; // prevent double-injection

  // ── CSS ───────────────────────────────────────────────────────────────────

  const CSS = `
      :root {
        --mde-accent:  #6C63FF;
        --mde-blue:    #3B82F6;
        --mde-bg:      #0F1117;
        --mde-surface: #1A1B2E;
        --mde-border:  #23263A;
        --mde-muted:   #6E7387;
        --mde-ok:      #52C77E;
        --mde-err:     #E05C5C;
      }

      /* ── Per-message inline button ─────────────────────────────── */
      .mde-msg-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
        padding: 3px 9px;
        border-radius: 20px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--mde-muted);
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        vertical-align: middle;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        white-space: nowrap;
        z-index: 9999;
      }
      .mde-msg-btn:hover {
        background: #6C63FF18;
        border-color: var(--mde-accent);
        color: var(--mde-accent);
      }
      .mde-msg-btn svg { flex-shrink: 0; }

      /* Per-message action bar (appended after message content) */
      .mde-msg-bar {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 6px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      article:hover .mde-msg-bar,
      [data-testid]:hover .mde-msg-bar,
      div.conversation-container:hover .mde-msg-bar {
        opacity: 1;
      }

      /* ── Floating FAB ──────────────────────────────────────────── */
      #mde-fab {
        position: fixed !important;
        bottom: 28px !important;
        right: 28px !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center;
        gap: 7px;
        padding: 10px 18px;
        border-radius: 999px;
        background: linear-gradient(135deg, #6C63FF 0%, #3B82F6 100%);
        color: #fff !important;
        font-family: 'Inter', -apple-system, sans-serif !important;
        font-size: 13px;
        font-weight: 700;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 24px #6C63FF66, 0 2px 8px #0006;
        transition: transform 0.15s, box-shadow 0.15s;
        text-decoration: none !important;
        outline: none;
        user-select: none;
        -webkit-user-select: none;
      }
      #mde-fab:hover { transform: translateY(-2px); box-shadow: 0 8px 32px #6C63FF88; }
      #mde-fab:active { transform: scale(0.97); }

      /* ── Scrim ──────────────────────────────────────────────────── */
      #mde-scrim {
        position: fixed !important;
        inset: 0 !important;
        background: #00000055;
        z-index: 2147483644 !important;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
      }
      #mde-scrim.mde-visible { opacity: 1; pointer-events: all; }

      /* ── Slide-in panel ─────────────────────────────────────────── */
      #mde-panel {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        width: 360px !important;
        height: 100dvh !important;
        z-index: 2147483645 !important;
        display: flex !important;
        flex-direction: column;
        background: var(--mde-bg) !important;
        border-left: 1px solid var(--mde-border);
        box-shadow: -8px 0 48px #00000077;
        font-family: 'Inter', -apple-system, sans-serif;
        transform: translateX(100%);
        transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
        overflow: hidden;
      }
      #mde-panel.mde-open { transform: translateX(0) !important; }

      /* Panel header */
      #mde-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 16px 12px;
        background: var(--mde-surface);
        border-bottom: 1px solid var(--mde-border);
        flex-shrink: 0;
      }
      #mde-hdr-left { display: flex; flex-direction: column; gap: 2px; }
      #mde-hdr-title { font-size: 14px; font-weight: 700; color: #fff; letter-spacing: -.2px; }
      #mde-hdr-sub { font-size: 10.5px; color: var(--mde-muted); }
      #mde-close-btn {
        width: 28px; height: 28px;
        border-radius: 7px; border: 1px solid var(--mde-border);
        background: transparent; color: var(--mde-muted);
        font-size: 15px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background .15s, color .15s;
      }
      #mde-close-btn:hover { background: var(--mde-border); color: #fff; }

      /* Chip bar */
      #mde-chips {
        display: flex; flex-wrap: wrap; gap: 5px;
        padding: 9px 14px;
        border-bottom: 1px solid var(--mde-border);
        flex-shrink: 0;
      }
      .mde-chip {
        padding: 3px 10px; border-radius: 20px;
        border: 1px solid var(--mde-border);
        background: #1C1F30; color: var(--mde-muted);
        font-size: 10.5px; font-weight: 500; cursor: pointer;
        font-family: inherit;
        transition: all .15s;
      }
      .mde-chip:hover { border-color: #6C63FF88; color: #fff; }
      .mde-chip.mde-active { border-color: var(--mde-accent); background: #6C63FF22; color: #fff; }

      /* Message list */
      #mde-list {
        flex: 1; overflow-y: auto;
        padding: 4px 0;
        scrollbar-width: thin;
        scrollbar-color: var(--mde-border) transparent;
      }
      #mde-list::-webkit-scrollbar { width: 4px; }
      #mde-list::-webkit-scrollbar-thumb { background: var(--mde-border); border-radius: 4px; }

      .mde-row {
        display: flex; align-items: flex-start; gap: 9px;
        padding: 7px 13px; cursor: pointer;
        border-bottom: 1px solid #12141E;
        transition: background .12s;
      }
      .mde-row:hover { background: #1C1F30; }
      .mde-row.mde-sel { background: #6C63FF10; }

      .mde-cb {
        width: 16px; height: 16px; border-radius: 4px;
        border: 1.5px solid #3B3E52; flex-shrink: 0; margin-top: 2px;
        display: flex; align-items: center; justify-content: center;
        transition: all .12s;
      }
      .mde-row.mde-sel .mde-cb { border-color: var(--mde-accent); background: var(--mde-accent); }
      .mde-cb-tick { display: none; color: #fff; font-size: 9px; font-weight: 800; }
      .mde-row.mde-sel .mde-cb-tick { display: block; }

      .mde-row-info { flex: 1; min-width: 0; }
      .mde-row-meta { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; }
      .mde-badge {
        font-size: 9.5px; font-weight: 700; padding: 1px 5px;
        border-radius: 3px; letter-spacing: .3px;
      }
      .mde-badge-user { background: #3498DB22; color: #3498DB; }
      .mde-badge-ai   { background: #6C63FF22; color: #6C63FF; }
      .mde-row-num { font-size: 9.5px; color: #3B3E52; }
      .mde-row-preview {
        font-size: 11px; color: #8B8FA8; line-height: 1.4;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      /* Panel footer */
      #mde-footer {
        padding: 11px 13px;
        background: #0D0F1A;
        border-top: 1px solid var(--mde-border);
        flex-shrink: 0;
      }
      #mde-fmts { display: flex; gap: 6px; margin-bottom: 9px; }
      .mde-fmt {
        flex: 1; padding: 7px 0; border-radius: 7px;
        border: 1.5px solid var(--mde-border);
        background: #1C1F30; color: var(--mde-muted);
        font-family: inherit; font-size: 11px; font-weight: 600;
        cursor: pointer; text-align: center;
        transition: all .15s;
      }
      .mde-fmt:hover { border-color: #6C63FF55; color: #eee; }
      .mde-fmt.mde-active { border-color: var(--mde-accent); background: #6C63FF22; color: #fff; }

      #mde-export-btn {
        width: 100%; padding: 10px; border-radius: 9px; border: none;
        background: linear-gradient(135deg, var(--mde-accent) 0%, var(--mde-blue) 100%);
        color: #fff; font-family: inherit; font-size: 13px; font-weight: 700;
        cursor: pointer; letter-spacing: .2px;
        display: flex; align-items: center; justify-content: center; gap: 7px;
        transition: opacity .15s, transform .15s;
      }
      #mde-export-btn:hover { opacity: .9; transform: translateY(-1px); }
      #mde-export-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; }

      #mde-status {
        margin-top: 7px; font-size: 10.5px; text-align: center;
        color: var(--mde-muted); min-height: 14px;
      }
      #mde-status.mde-ok  { color: var(--mde-ok); }
      #mde-status.mde-err { color: var(--mde-err); }
    `;

  // ── Inject styles ─────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('mde-css')) return;
    const s = document.createElement('style');
    s.id = 'mde-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Build the slide-in panel once ─────────────────────────────────────────

  function buildPanel() {
    if (document.getElementById('mde-panel')) return;

    const scrim = document.createElement('div');
    scrim.id = 'mde-scrim';
    scrim.onclick = closePanel;

    const panel = document.createElement('div');
    panel.id = 'mde-panel';
    panel.innerHTML = `
          <div id="mde-hdr">
            <div id="mde-hdr-left">
              <div id="mde-hdr-title">↓ MD-Export</div>
              <div id="mde-hdr-sub">Select messages · <span id="mde-total">0</span> total</div>
            </div>
            <button id="mde-close-btn" title="Close">✕</button>
          </div>

          <div id="mde-chips">
            <button class="mde-chip mde-active" data-sel="all">All</button>
            <button class="mde-chip" data-sel="none">None</button>
            <button class="mde-chip" data-sel="user">You only</button>
            <button class="mde-chip" data-sel="ai">AI only</button>
            <button class="mde-chip" data-sel="first10">First 10</button>
            <button class="mde-chip" data-sel="last10">Last 10</button>
          </div>

          <div id="mde-list">
            <div style="padding:24px;text-align:center;color:#3B3E52;font-size:12px">Loading…</div>
          </div>

          <div id="mde-footer">
            <div id="mde-fmts">
              <button class="mde-fmt mde-active" data-fmt="md">Markdown</button>
              <button class="mde-fmt" data-fmt="docx">DOCX</button>
              <button class="mde-fmt" data-fmt="pdf">PDF</button>
            </div>
            <button id="mde-export-btn">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1v10M8 11l-3-3M8 11l3-3M2 14h12" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Export Selected
            </button>
            <div id="mde-status"></div>
          </div>
        `;

    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    // Wire events
    panel.querySelector('#mde-close-btn').onclick = closePanel;

    panel.querySelectorAll('.mde-chip').forEach(c => {
      c.onclick = () => applyChip(c.dataset.sel);
    });
    panel.querySelectorAll('.mde-fmt').forEach(b => {
      b.onclick = () => {
        panel.querySelectorAll('.mde-fmt').forEach(x => x.classList.remove('mde-active'));
        b.classList.add('mde-active');
        selectedFormat = b.dataset.fmt;
      };
    });
    panel.querySelector('#mde-export-btn').onclick = doExport;
  }

  // ── Build or re-inject the FAB ────────────────────────────────────────────

  function ensureFAB() {
    if (document.getElementById('mde-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'mde-fab';
    fab.title = 'MD-Export – select & export messages';
    fab.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 1v10M8 11l-3-3M8 11l3-3M2 14h12"
              stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Export Chat
        `;
    fab.onclick = () => openPanel(null);
    document.body.appendChild(fab);
  }

  // ── Inject per-message export buttons ────────────────────────────────────

  function injectMsgButtons() {
    const nodes = document.querySelectorAll(site.msgSelector);
    nodes.forEach((el, idx) => {
      if (el.hasAttribute(MDE_BTN_ATTR)) return;
      el.setAttribute(MDE_BTN_ATTR, '1');

      const bar = document.createElement('div');
      bar.className = 'mde-msg-bar';
      bar.innerHTML = `
              <button class="mde-msg-btn" title="Export from this message">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1v9M8 10l-3-3M8 10l3-3M2 15h12"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Export
              </button>
            `;

      bar.querySelector('.mde-msg-btn').onclick = (e) => {
        e.stopPropagation();
        openPanel(idx);  // open panel with this message pre-selected
      };

      // Append the bar at the bottom of the message container
      el.appendChild(bar);
    });
  }

  // ── Panel open / close ────────────────────────────────────────────────────

  function openPanel(fromIdx) {
    if (panelOpen) return;
    panelOpen = true;

    buildPanel(); // ensure panel exists
    collectMessages();

    // Pre-select logic
    if (fromIdx !== null && fromIdx >= 0 && fromIdx < rawMessages.length) {
      // Select from this message to end (export "from here onwards")
      selectedIndices = new Set(
        [...Array(rawMessages.length).keys()].filter(i => i >= fromIdx)
      );
      // Deactivate chips since this is a custom range
    } else {
      selectedIndices = new Set([...Array(rawMessages.length).keys()]);
    }

    renderList();
    setStatus('', rawMessages.length + ' messages ready');

    document.getElementById('mde-scrim').classList.add('mde-visible');
    document.getElementById('mde-panel').classList.add('mde-open');
    document.getElementById('mde-fab').style.opacity = '0';
  }

  function closePanel() {
    panelOpen = false;
    document.getElementById('mde-scrim')?.classList.remove('mde-visible');
    document.getElementById('mde-panel')?.classList.remove('mde-open');
    const fab = document.getElementById('mde-fab');
    if (fab) fab.style.opacity = '1';
  }

  // ── Message scraping (from DOM, no import needed) ─────────────────────────

  function collectMessages() {
    rawMessages = [];
    const nodes = document.querySelectorAll(site.msgSelector);
    nodes.forEach(el => {
      const role = detectRole(el);
      const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
      const html = el.innerHTML || '';
      if (text) rawMessages.push({ role, text, html });
    });

    const totalEl = document.getElementById('mde-total');
    if (totalEl) totalEl.textContent = rawMessages.length;
  }

  function detectRole(el) {
    const attr = site.roleAttr ? el.getAttribute(site.roleAttr) || '' : '';
    const cls = el.className || '';
    const text = attr.toLowerCase() + ' ' + cls.toLowerCase();
    if (text.includes('user') || text.includes('human')) return 'user';
    // Gemini: first child in conversation-container is user
    if (location.hostname.includes('gemini')) {
      const idx = Array.from(el.parentElement?.children || []).indexOf(el);
      return idx % 2 === 0 ? 'user' : 'assistant';
    }
    return 'assistant';
  }

  // ── Render message checklist ──────────────────────────────────────────────

  function renderList() {
    const list = document.getElementById('mde-list');
    if (!list) return;
    if (!rawMessages.length) {
      list.innerHTML = '<div style="padding:24px;text-align:center;color:#3B3E52;font-size:12px">No messages found</div>';
      return;
    }

    list.innerHTML = '';
    rawMessages.forEach((msg, i) => {
      const isUser = msg.role === 'user';
      const row = document.createElement('div');
      row.className = `mde-row${selectedIndices.has(i) ? ' mde-sel' : ''}`;
      row.dataset.i = i;

      const preview = msg.text.slice(0, 80) + (msg.text.length > 80 ? '…' : '');
      row.innerHTML = `
              <div class="mde-cb"><span class="mde-cb-tick">✓</span></div>
              <div class="mde-row-info">
                <div class="mde-row-meta">
                  <span class="mde-badge ${isUser ? 'mde-badge-user' : 'mde-badge-ai'}">
                    ${isUser ? 'You' : site.name}
                  </span>
                  <span class="mde-row-num">#${i + 1}</span>
                </div>
                <div class="mde-row-preview">${esc(preview)}</div>
              </div>
            `;

      row.onclick = () => toggleRow(i, row);
      list.appendChild(row);
    });

    refreshExportBtn();
  }

  function toggleRow(i, row) {
    if (selectedIndices.has(i)) { selectedIndices.delete(i); row.classList.remove('mde-sel'); }
    else { selectedIndices.add(i); row.classList.add('mde-sel'); }
    document.querySelectorAll('.mde-chip').forEach(c => c.classList.remove('mde-active'));
    refreshExportBtn();
  }

  function applyChip(preset) {
    const total = rawMessages.length;
    document.querySelectorAll('.mde-chip').forEach(c => c.classList.remove('mde-active'));
    document.querySelector(`.mde-chip[data-sel="${preset}"]`)?.classList.add('mde-active');

    switch (preset) {
      case 'all': selectedIndices = new Set([...Array(total).keys()]); break;
      case 'none': selectedIndices = new Set(); break;
      case 'user': selectedIndices = new Set(rawMessages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0)); break;
      case 'ai': selectedIndices = new Set(rawMessages.map((m, i) => m.role !== 'user' ? i : -1).filter(i => i >= 0)); break;
      case 'first10': selectedIndices = new Set([...Array(Math.min(10, total)).keys()]); break;
      case 'last10': selectedIndices = new Set([...Array(Math.min(10, total)).keys()].map(i => total - Math.min(10, total) + i)); break;
    }

    document.querySelectorAll('.mde-row').forEach(row => {
      const i = parseInt(row.dataset.i);
      row.classList.toggle('mde-sel', selectedIndices.has(i));
    });
    refreshExportBtn();
  }

  function refreshExportBtn() {
    const btn = document.getElementById('mde-export-btn');
    if (!btn) return;
    const n = selectedIndices.size;
    btn.disabled = n === 0;
    btn.lastChild.textContent = ` Export ${n} msg${n !== 1 ? 's' : ''}`;
  }

  // ── Export via background service worker ──────────────────────────────────

  async function doExport() {
    if (!rawMessages.length || !selectedIndices.size) return;
    const btn = document.getElementById('mde-export-btn');
    btn.disabled = true;
    setStatus('', `Processing ${selectedIndices.size} messages…`);

    const sorted = [...selectedIndices].sort((a, b) => a - b);
    const filteredData = {
      title: document.title || `${site.name} Chat`,
      site: site.name,
      messages: sorted.map(i => rawMessages[i]),
    };

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'overlayExport',
        format: selectedFormat,
        conversationData: filteredData,
      });
      if (resp?.success) {
        setStatus('mde-ok', `✓ ${selectedFormat.toUpperCase()} saved! (${selectedIndices.size} msgs)`);
      } else {
        setStatus('mde-err', 'Failed: ' + (resp?.error || 'unknown'));
      }
    } catch (e) {
      setStatus('mde-err', e.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function setStatus(cls, msg) {
    const el = document.getElementById('mde-status');
    if (!el) return;
    el.className = cls ? `mde-status ${cls}` : '';
    el.textContent = msg;
  }
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── MutationObserver: keep UI alive + inject per-msg buttons on new content

  let injectTimer = null;
  const obs = new MutationObserver(() => {
    ensureFAB();
    clearTimeout(injectTimer);
    injectTimer = setTimeout(injectMsgButtons, 600);
  });

  // ── Boot ──────────────────────────────────────────────────────────────────

  function boot() {
    injectStyles();
    buildPanel();
    ensureFAB();
    injectMsgButtons();

    // Watch body for DOM changes (SPA navigation, new messages)
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
  } else {
    setTimeout(boot, 600);
  }

})(); // end IIFE
