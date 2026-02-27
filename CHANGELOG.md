# Changelog

All notable changes to MD-Export will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] – 2026-02-27

### Fixed

- **Gemini code block exports** – Fixed missing language identifiers in Gemini markdown exports by extracting the language label from Gemini's custom DOM structure and injecting `class="language-X"` into the `<code>` container before Markdown conversion.
- **PDF character encoding** – Fixed an issue where unsupported emojis (e.g. 💻) in markdown headings resulted in garbage characters (`Ø=ßê`) in the PDF by strictly enforcing `sanitizePdfText` down to the `jsPDF` draw layer.
- **Duplicate PDF language labels** – Prevented Claude and Gemini from rendering their language tag twice in Markdown/PDF outputs by automatically stripping the redundant plain-text paragraph label generated immediately prior to the code fence.

---

## [1.0.1] – 2026-02-24

### Fixed

- **Claude scraper** – Updated DOM selectors for current Claude UI (Feb 2026):
  replaced deprecated `data-testid="human-turn"` / `data-testid="ai-turn"` with
  `[data-test-render-count]` turn containers, `[data-testid="user-message"]` for
  user messages, and `[data-is-streaming]` + `.standard-markdown` for AI responses
- **Claude multi-block AI messages** – AI responses split across multiple
  `.standard-markdown` blocks (e.g. intro sentence + full response after a tool-use
  widget) are now fully captured by cloning all blocks into a single wrapper `<div>`
  before conversion — prevents Tailwind class names being Turndown-escaped
- **Claude overlay** – Updated `claude.ai` `SITE_CONFIG` in `overlay.js` with
  correct selectors; added `isClaude` branch in `collectMessages` (matching Gemini
  pattern) so the FAB panel correctly lists all Claude messages
- **Markdown export** – Rewrote `markdown.js` to use pure GFM (no inline HTML);
  replaced `<div>`, `<table>`, `<sub>`, `&nbsp;` with blockquotes, GFM pipe tables,
  and plain text — exports now render correctly in VS Code, GitHub, Obsidian, Typora
- **PDF overflow** – Fixed long URLs / unbreakable strings escaping the page boundary
  in `pdf.js`; oversized atoms are now force-broken character by character
  (equivalent to CSS `word-break: break-all`)

---

## [1.0.0] – 2026-02-24

### Added

- **Multi-platform scraping** – ChatGPT, Claude, Gemini, and Grok (grok.com + x.com)
- **Three export formats** – Markdown (`.md`), DOCX (`.docx`), and PDF (`.pdf`)
- **Popup UI** – One-click export via the extension toolbar icon
- **In-page overlay panel** – Floating "Export Chat" FAB button injects into every supported page
  - Slide-in panel with message checklist (select all / none / you only / AI only / first & last 10)
  - Per-message export buttons for exporting from a specific point onwards
  - Format picker (Markdown / DOCX / PDF) inside the panel
- **Formatting preservation** – Code blocks, lists, tables, bold/italic across all export formats
- **MutationObserver** – Overlay stays alive across SPA navigation (no page reload needed)
- **Webpack 5 build pipeline** – Separate bundles for each content script + overlay + background worker
