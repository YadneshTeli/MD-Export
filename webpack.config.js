const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

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

// Content scripts bundle
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

// Background worker bundle
const backgroundConfig = {
  name: 'background',
  entry: { background: './src/background/service_worker.js' },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
  resolve,
  optimization: { minimize: false },
};

// Popup bundle (includes docx + jspdf)
const popupConfig = {
  name: 'popup',
  entry: { popup: './src/popup/popup.js' },
  output: { path: path.resolve(__dirname, 'dist'), filename: '[name].js' },
  resolve,
  optimization: { minimize: false },
  ...pluginOptions,
};

module.exports = [contentConfig, backgroundConfig, popupConfig];
