# Chrome Web Store Listing Copy & Submission Guide

This document contains the copy and submission metadata required when uploading MD-Export to the Chrome Web Developer Console.

---

## 1. Store Metadata

### Product Name
`MD-Export – AI Chat Exporter`
*(28 characters. Max limit: 45 characters)*

### Summary / Short Description
`Export ChatGPT, Claude, Gemini, and Grok conversations as Markdown, DOCX (Word), or PDF with all formatting preserved.`
*(118 characters. Max limit: 150 characters)*

### Detailed Description (Long Copy)
```markdown
Export your AI chat conversations instantly with full formatting preserved! MD-Export supports ChatGPT, Claude, Gemini, and Grok, converting your turns into clean Markdown (.md), Microsoft Word (.docx), or print-ready PDF (.pdf) files.

Whether you are saving prompts for documentation, creating offline backups, or compiling research, MD-Export makes it effortless.

✨ CORE FEATURES:
• Multi-Platform Support: Seamlessly scrapes ChatGPT (chatgpt.com), Claude (claude.ai), Gemini (gemini.google.com), and Grok (grok.com & x.com).
• Three Export Formats: Convert conversations to standard GFM Markdown, formatted Microsoft Word documents, or beautifully structured PDF files.
• In-Page Control Panel: Floating "Export Chat" button gives you a message checklist. Export the whole chat, you-only prompts, AI-only responses, or specify a custom message range.
• Partial Exports: Export from a specific message onwards or quick-select sections (e.g., first 10, last 10, or first/second half).
• Formatting Preservation: Correctly handles code fencings, syntax highlighting labels, bulleted/numbered lists, bold/italic runs, blockquotes, and tables.
• Copy to Clipboard: Instantly copy the formatted GFM Markdown of selected turns in one click.
• Privacy First: 100% local processing. Your conversation data never leaves your browser. No external API calls, tracking, or analytics.

🚀 QUICK START:
1. Open any supported AI conversation (ChatGPT, Claude, Gemini, or Grok).
2. Click the floating "Export Chat" panel button in the bottom-right corner (or click the toolbar popup icon).
3. Select which messages to include (or keep all selected).
4. Choose your desired output format (Markdown, Word DOCX, or PDF).
5. Click "Export" to download your file instantly!

🔒 PRIVACY & SAFETY:
All scraping, formatting, and file generation are executed entirely within your browser. MD-Export does not communicate with external servers and has zero analytics or trackers. Your chats remain completely private.
```

---

## 2. Store Console Developer Declarations

When publishing the extension, Google requires justifications for permissions and privacy declarations in the **Developer Console**.

### Single Purpose Declaration
`A browser tool to export AI conversation history from ChatGPT, Gemini, Grok, and Claude into Markdown, Word, or PDF files locally.`

### Permission Justifications
Provide these exact descriptions in the console's permission justification textareas:

*   **`activeTab`**:
    *   *Justification:* "Needed to scrape the DOM elements of the active conversation tab when the user clicks 'Export' in the popup or overlay."
*   **`downloads`**:
    *   *Justification:* "Needed to download the finalized Markdown, Word DOCX, or PDF file directly to the user's local downloads directory."
*   **`scripting`**:
    *   *Justification:* "Needed to inject scraper scripts dynamically into the active AI chat page to capture the chat history contents."
*   **`storage`**:
    *   *Justification:* "Needed to store the user's preferred default export settings (such as default format) locally on the device."
*   **`clipboardWrite`**:
    *   *Justification:* "Needed to write the generated Markdown string directly to the system clipboard when the user clicks 'Copy as Markdown'."

### Privacy Declarations / User Data
*   **Data Usage**: Select **"No"** to "Does this extension collect or transmit user data?"
*   **Privacy Policy URL**: Host the `PRIVACY.md` file contents on your website or use the GitHub raw link:
    `https://github.com/YadneshTeli/MD-Export/blob/main/PRIVACY.md`

---

## 3. Required Graphic Assets Checklist

Ensure the following image assets are prepared before starting the submission:

*   [ ] **Store Icon** (128x128 pixels, PNG format). Use `icons/icon128.png`.
*   [ ] **Screenshots** (At least 1 required, up to 5 allowed).
    *   *Dimensions:* 1280x800 or 640x400 pixels.
    *   *Recommendation:* Screenshot of the floating overlay panel on ChatGPT and Grok, showing selected checklist items.
*   [ ] **Promotional Tiles** (Used for Web Store homepage/search features).
    *   *Small Tile:* 440x280 pixels (PNG/JPG).
    *   *Large Tile (Optional):* 920x680 pixels.
    *   *Marquee Tile (Optional):* 1400x560 pixels.
