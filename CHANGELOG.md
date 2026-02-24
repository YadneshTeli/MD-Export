# Changelog

All notable changes to MD-Export will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
