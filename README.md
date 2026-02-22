# MD-Export – AI Chat Exporter

A powerful Chrome extension that exports conversations from popular AI chat platforms to Markdown, DOCX, or PDF formats with full formatting preservation.

## 🌟 Features

- **Multi-Platform Support**: Works with ChatGPT, Claude, Gemini, and Grok
- **Multiple Export Formats**: 
  - Markdown (.md) - Clean, readable text format
  - DOCX (.docx) - Microsoft Word compatible
  - PDF (.pdf) - Universal document format
- **Formatting Preservation**: Maintains code blocks, lists, tables, and text styling
- **One-Click Export**: Simple popup interface for quick exports
- **Smart Scraping**: Automatically detects and extracts conversation content

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
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `MD-Export` folder

### From Chrome Web Store

*(Coming soon)*

## 🚀 Usage

1. Navigate to any supported AI chat platform
2. Open a conversation you want to export
3. Click the MD-Export extension icon in your browser toolbar
4. Select your preferred export format:
   - **Markdown** - For developers and note-taking apps
   - **DOCX** - For Word, Google Docs, or professional documents
   - **PDF** - For sharing or archiving
5. The file will automatically download to your default downloads folder

## 🛠️ Development

### Prerequisites

- Node.js 14+ and npm
- Chrome browser

### Build Commands

```bash
# Development mode with watch
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
└── webpack.config.js        # Build configuration
```

## 🔧 Tech Stack

- **Core**: JavaScript (ES6+)
- **Build Tool**: Webpack 5
- **Export Libraries**:
  - [Turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown conversion
  - [docx](https://github.com/dolanmiu/docx) - DOCX generation
  - [jsPDF](https://github.com/parallax/jsPDF) - PDF generation
  - [html2canvas](https://github.com/niklasvh/html2canvas) - Screenshot rendering

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🐛 Known Issues

- None currently reported

## 💡 Future Enhancements

- Support for additional AI platforms
- Custom export templates
- Batch export multiple conversations
- Cloud sync for exported files
- Advanced formatting options

## 📧 Contact

Project Link: [https://github.com/YadneshTeli/MD-Export](https://github.com/YadneshTeli/MD-Export)

---

⭐ If you find this extension helpful, please consider giving it a star on GitHub!
