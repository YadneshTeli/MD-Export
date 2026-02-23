# MD-Export – AI Chat Exporter

A powerful Chrome extension to export conversations from ChatGPT, Claude, Gemini, and Grok to Markdown, DOCX, or PDF with full formatting preservation.

## 🌟 Features

- **Multi-Platform Support**: ChatGPT, Claude, Gemini, Grok
- **Multiple Export Formats**:
  - Markdown (.md) – Clean, readable text
  - DOCX (.docx) – Microsoft Word compatible
  - PDF (.pdf) – Universal document format
- **Formatting Preservation**: Code blocks, lists, tables, and text styling
- **One-Click Export**: Popup interface for quick exports
- **Smart Scraping**: Auto-detects and extracts conversation content

## 🎯 Supported Platforms

- **ChatGPT** (chat.openai.com, chatgpt.com)
- **Claude** (claude.ai)
- **Gemini** (gemini.google.com)
- **Grok** (grok.com, x.com)

## 📦 Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/YadneshTeli/MD-Export.git
   cd MD-Export
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `MD-Export` folder

### From Chrome Web Store

*Coming soon*

## 🚀 Usage

1. Open a supported AI chat platform
2. Open the conversation you want to export
3. Click the MD-Export extension icon
4. Choose your export format:
   - **Markdown** – For developers and note-taking
   - **DOCX** – For Word, Google Docs, professional docs
   - **PDF** – For sharing or archiving
5. The file downloads automatically

## 🛠️ Development

### Prerequisites

- Node.js 14+ and npm
- Chrome browser

### Build Commands

```bash
# Development mode (watch)
npm run dev
# Production build
npm run build
```

### Project Structure

```
MD-Export/
├── src/
│   ├── background/          # Service worker
│   ├── content/             # Platform-specific scrapers
│   │   ├── base_scraper.js
│   │   ├── chatgpt.js
│   │   ├── claude.js
│   │   ├── gemini.js
│   │   └── grok.js
│   ├── exporters/           # Export format handlers
│   │   ├── markdown.js
│   │   ├── docx.js
│   │   └── pdf.js
│   ├── pipeline/            # Content preprocessing
│   └── popup/               # Extension UI
├── popup/                   # HTML/CSS for popup
├── icons/                   # Extension icons
├── manifest.json            # Extension manifest
└── webpack.config.js        # Build config
```

## 🔧 Tech Stack

- **Core**: JavaScript (ES6+)
- **Build Tool**: Webpack 5
- **Export Libraries**:
  - [Turndown](https://github.com/mixmark-io/turndown) – HTML to Markdown
  - [docx](https://github.com/dolanmiu/docx) – DOCX generation
  - [jsPDF](https://github.com/parallax/jsPDF) – PDF generation
  - [html2canvas](https://github.com/niklasvh/html2canvas) – Screenshot rendering

## 🤝 Contributing

Contributions welcome! Please submit a Pull Request.

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

MIT License

## 🐛 Known Issues

- None currently reported

## 💡 Future Enhancements

- Support for more AI platforms
- Custom export templates
- Batch export multiple conversations
- Cloud sync for exported files
- Advanced formatting options

## 📧 Contact

Project Link: [https://github.com/YadneshTeli/MD-Export](https://github.com/YadneshTeli/MD-Export)

---

⭐ If you find this extension helpful, please give it a star on GitHub!
