const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

class StripPdfObjectPlugin {
  apply(compiler) {
    compiler.hooks.emit.tapAsync('StripPdfObjectPlugin', (compilation, callback) => {
      const targetStr = 'https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js';
      const replacementStr = '';

      for (const assetName in compilation.assets) {
        if (assetName.endsWith('.js')) {
          const asset = compilation.assets[assetName];
          const originalSource = asset.source().toString();
          if (originalSource.includes(targetStr)) {
            const newSource = originalSource.replaceAll(targetStr, replacementStr);
            compilation.assets[assetName] = {
              source: () => newSource,
              size: () => newSource.length
            };
          }
        }
      }
      callback();
    });
  }
}

const pluginOptions = {};

// Shared resolve config
const resolve = {
  fallback: {
    fs: false,
    path: false,
    crypto: false,
    buffer: require.resolve('buffer/'),
    stream: require.resolve('stream-browserify'),
    util: require.resolve('util/'),
    process: require.resolve('process/browser.js'),
  },
};

// Content scripts bundle (per-site scrapers)
const contentConfig = {
  name: 'content',
  entry: {
    content_chatgpt: './src/content/chatgpt.js',
    content_gemini: './src/content/gemini.js',
    content_grok: './src/content/grok.js',
    content_claude: './src/content/claude.js',
  },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js', clean: false },
  resolve,
  optimization: { minimize: false },
};

// Overlay bundle (in-page selection UI, imports all scrapers)
const overlayConfig = {
  name: 'overlay',
  entry: { overlay: './src/content/overlay.js' },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js', clean: false },
  resolve,
  optimization: { minimize: false },
};

// Background worker bundle
const backgroundConfig = {
  name: 'background',
  entry: { background: './src/background/service_worker.js' },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
  resolve,
  optimization: { minimize: false },
  plugins: [new StripPdfObjectPlugin()],
};

// Popup bundle (includes docx + jspdf)
const popupConfig = {
  name: 'popup',
  entry: { popup: './src/popup/popup.js' },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
  resolve,
  optimization: { minimize: false },
  plugins: [new StripPdfObjectPlugin()],
  ...pluginOptions,
};

module.exports = [contentConfig, overlayConfig, backgroundConfig, popupConfig];
