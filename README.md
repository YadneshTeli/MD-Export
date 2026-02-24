# MD-Export – AI Chat Exporter

[![Version](https://img.shields.io/badge/version-1.0.0-6C63FF?style=flat-square)](https://github.com/YadneshTeli/MD-Export/releases)
[![License](https://img.shields.io/badge/license-MIT-3B82F6?style=flat-square)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-yellow?style=flat-square&logo=google-chrome)](https://github.com/YadneshTeli/MD-Export/releases/latest)
[![Platforms](https://img.shields.io/badge/supports-ChatGPT%20%7C%20Claude%20%7C%20Gemini%20%7C%20Grok-52C77E?style=flat-square)](#-supported-platforms)

Export conversations from **ChatGPT, Claude, Gemini, and Grok** to Markdown, DOCX, or PDF — with full formatting preserved.

---

## ✨ Features

- 🗂 **Multi-Platform** – ChatGPT, Claude, Gemini, Grok (grok.com + x.com)
- 📄 **Three Export Formats** – Markdown, DOCX (Word), and PDF
- 🎛 **In-Page Overlay Panel** – Floating "Export Chat" button on every supported page
  - Check/uncheck individual messages before exporting
  - Quick-select chips: All · None · You only · AI only · First 10 · Last 10
  - Per-message export button (export from that point onwards)
- 🔤 **Formatting Preserved** – Code blocks, lists, tables, bold/italic carry over to all formats
- ⚡ **One-Click Popup** – Quick export via the extension toolbar icon
- 🔄 **SPA-Aware** – MutationObserver keeps the overlay alive through navigation without page reloads

---

## 🎯 Supported Platforms

| Platform | URL | Status |
|---|---|---|
| ChatGPT | chatgpt.com · chat.openai.com | ✅ Supported |
| Claude | claude.ai | ✅ Supported |
| Gemini | gemini.google.com | ✅ Supported |
| Grok | grok.com · x.com | ✅ Supported |

---

## 📦 Installation

### Option A — Download Release (No build needed)

1. Go to the [**Releases page**](https://github.com/YadneshTeli/MD-Export/releases/latest)
2. Download `md-export-vX.X.X.zip`
3. Unzip it anywhere on your computer
4. Open Chrome → `chrome://extensions/`
5. Enable **Developer mode** (top-right toggle)
6. Click **Load unpacked** → select the unzipped folder

### Option B — Build from Source

```bash
git clone https://github.com/YadneshTeli/MD-Export.git
cd MD-Export
npm install
npm run build
```
Then follow steps 4–6 from Option A.

### From Chrome Web Store

*Coming soon*

---

## 🚀 Usage

### Overlay Panel (recommended)
1. Open any supported AI chat
2. Click the **"Export Chat"** button (bottom-right corner)
3. Select the messages you want
4. Pick a format (Markdown / DOCX / PDF)
5. Click **Export** — file downloads automatically

### Toolbar Popup
1. Click the MD-Export icon in your Chrome toolbar
2. Choose a format and click Export

---

## 🛠️ Development

### Prerequisites
- Node.js 18+ and npm
- Chrome browser

### Commands

```bash
npm run dev       # Development build with file watching
npm run build     # Production build
npm run package   # Build + create distributable .zip
```

### Project Structure

```
MD-Export/
├── .github/workflows/   # GitHub Actions (automated release)
├── src/
│   ├── background/      # Service worker (handles export requests)
│   ├── content/         # Per-site scrapers + in-page overlay
│   │   ├── base_scraper.js
│   │   ├── chatgpt.js
│   │   ├── claude.js
│   │   ├── gemini.js
│   │   ├── grok.js
│   │   └── overlay.js   # Floating panel + per-message buttons
│   ├── exporters/       # markdown.js · docx.js · pdf.js
│   ├── pipeline/        # Content pre-processing
│   └── popup/           # Toolbar popup UI
├── popup/               # popup.html + popup.css
├── icons/               # Extension icons (16 · 48 · 128px)
├── manifest.json        # Chrome Extension Manifest v3
└── webpack.config.js    # Build configuration
```

### Tech Stack

| Purpose | Library |
|---|---|
| HTML → Markdown | [Turndown](https://github.com/mixmark-io/turndown) + GFM plugin |
| DOCX generation | [docx](https://github.com/dolanmiu/docx) |
| PDF generation | [jsPDF](https://github.com/parallax/jsPDF) |
| Build | Webpack 5 + Babel |

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for full setup instructions.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'feat: add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md).

---

## 📄 License

[MIT](LICENSE) © 2026 Yadnesh Teli

---

⭐ If MD-Export saves you time, give it a star on GitHub!
