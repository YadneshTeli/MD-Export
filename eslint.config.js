import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        location: "readonly",
        URL: "readonly",
        Blob: "readonly",
        DOMParser: "readonly",
        MutationObserver: "readonly",
        performance: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        btoa: "readonly",
        console: "readonly",
        HTMLElement: "readonly",
        // Chrome Extension APIs
        chrome: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "*.config.js"],
  },
];
