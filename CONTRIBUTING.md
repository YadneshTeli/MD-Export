# Contributing to MD-Export

Thanks for taking the time to contribute! 🎉

## Getting Started

1. **Fork** the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/MD-Export.git
   cd MD-Export
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the dev build** (rebuilds on file save):
   ```bash
   npm run dev
   ```

4. **Load the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked** → select the `MD-Export` folder

## Project Layout

```
src/
├── background/     # Service worker (handles export requests)
├── content/        # Per-site scrapers + overlay UI
│   ├── base_scraper.js     # Shared helpers (cleanHtml, htmlToMarkdown)
│   ├── chatgpt.js
│   ├── claude.js
│   ├── gemini.js
│   ├── grok.js
│   └── overlay.js          # In-page FAB + selection panel
├── exporters/      # markdown.js · docx.js · pdf.js
├── pipeline/       # Content pre-processing utilities
└── popup/          # Toolbar popup UI
```

## Adding a New Platform

1. Create `src/content/<platform>.js` — implement and export `scrapeConversation()` (see `chatgpt.js` as a reference).
2. Add the new entry point to **`webpack.config.js`** in the `content` configuration.
3. Add the content script entry to **`manifest.json`** under `content_scripts`.
4. Add the site config block to the `SITE_CONFIG` map in **`src/content/overlay.js`**.

## Pull Request Checklist

- [ ] Runs `npm run build` without errors
- [ ] Tested on the target platform manually
- [ ] PR description explains what changed and why
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`

## Reporting Bugs

Open an issue with:
- The AI platform URL where the bug occurs
- Steps to reproduce
- What you expected vs. what happened
- Browser version and extension version
