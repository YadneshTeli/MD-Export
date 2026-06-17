# Privacy Policy for MD-Export

**Last Updated:** June 17, 2026

MD-Export ("we", "our", or "the Extension") is committed to protecting your privacy. This Privacy Policy explains how our extension handles user data.

## 1. Zero Data Collection

MD-Export does **not** collect, store, or transmit any personal data, chat history, or browsing activity. 

All core operations of the extension:
- Scraping chat message content from supported platforms (ChatGPT, Claude, Gemini, Grok)
- Converting HTML structure to Markdown, Word (DOCX), or PDF formats
- Generating and triggering file downloads
- Copying data to the user's clipboard

are executed **entirely locally within your web browser**.

## 2. Remote Servers

The Extension does **not** communicate with any remote servers, APIs, or databases. There are no analytics, crash reporting trackers, or advertising SDKs bundled inside MD-Export. 

All your conversation data remains on your machine and never leaves your browser sandbox.

## 3. Permissions Explained

To function correctly, the Extension requests the following browser permissions:
- **`activeTab`**: Allows the extension to read and copy messages from the currently active AI chat page when you click the popup or panel buttons.
- **`downloads`**: Allows the extension to download the generated Markdown, DOCX, or PDF files directly to your local downloads folder.
- **`clipboardWrite`**: Used to support the "Copy as Markdown" function, writing text directly to your system clipboard upon request.

## 4. Contact

If you have any questions or concerns regarding this Privacy Policy, please open an issue on our [GitHub Repository](https://github.com/YadneshTeli/MD-Export).
