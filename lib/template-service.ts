// Template service for applying default project templates
import { storageManager } from './storage-manager'
import type { Workspace, File } from './storage-manager'





export class TemplateService {
  // Default Vite React + TypeScript + Tailwind CSS template files
  private static readonly VITE_REACT_TEMPLATE_FILES: Omit<File, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'package.json',
      path: 'package.json',
      content: `{
  "name": "vite-react-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit || true && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview --port 3000"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.28.0",
    "lucide-react": "^0.454.0",
    "framer-motion": "^12.23.12",
    "date-fns": "4.1.0",
    "recharts": "2.15.4",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "@dyad-sh/react-vite-component-tagger": "0.8.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@vitejs/plugin-react": "^4.2.1",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.8",
    "@babel/core": "^7.24.0",
    "@babel/preset-react": "^7.23.3",
    "@babel/preset-typescript": "^7.23.3",
    "@babel/types": "^7.24.0",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.18"
  }
}
`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: 'vite.config.ts',
      path: 'vite.config.ts',
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualEditorPlugin } from './vite-plugin-visual-editor'
import dyadTagger from '@dyad-sh/react-vite-component-tagger'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Component Tagger Plugin - enhances visual editor source mapping
    // Set VITE_ENABLE_VISUAL_EDITOR=true to activate
    process.env.VITE_ENABLE_VISUAL_EDITOR === 'true' && dyadTagger(),
    // Visual Editor Plugin - enables source mapping for visual editing
    // Set VITE_ENABLE_VISUAL_EDITOR=true to activate
    process.env.VITE_ENABLE_VISUAL_EDITOR === 'true' && visualEditorPlugin(),
  ].filter(Boolean),
  define: {
    // Make NODE_ENV available in the app for debugging system
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 3000,
    strictPort: true, // Ensure port 3000 is used
    hmr: {
      host: 'localhost', // HMR host for development
    },
    cors: true, // Enable CORS for external access
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.e2b.app', // Allow all E2B sandbox domains
      '3000-*.e2b.app', // Allow E2B preview domains
    ],
  },
})`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'vite-plugin-visual-editor.ts',
      path: 'vite-plugin-visual-editor.ts',
      content: `// Visual Editor Vite Plugin
// Adds source file info (data-ve-id, data-ve-file, data-ve-line) to JSX elements
// This enables the visual editor to map DOM elements back to source code

import { Plugin } from 'vite';
import * as babel from '@babel/core';
import * as t from '@babel/types';

export function visualEditorPlugin(): Plugin {
  return {
    name: 'vite-visual-editor',
    enforce: 'pre',
    transform(code: string, id: string) {
      // Only process JSX/TSX files in src directory
      if (!id.match(/\\/src\\/.*\\.[jt]sx?$/)) return null;
      if (id.includes('node_modules')) return null;

      try {
        const result = babel.transformSync(code, {
          filename: id,
          presets: [
            ['@babel/preset-react', { runtime: 'automatic' }],
            '@babel/preset-typescript',
          ],
          plugins: [
            function visualEditorBabelPlugin() {
              let elementIndex = 0;
              
              return {
                visitor: {
                  JSXOpeningElement(path: any) {
                    const { node } = path;
                    const loc = node.loc;
                    
                    if (!loc) return;
                    
                    // Skip if already has data-ve-id
                    const hasVeId = node.attributes.some(
                      (attr: any) => attr.type === 'JSXAttribute' && 
                        attr.name?.name === 'data-ve-id'
                    );
                    if (hasVeId) return;
                    
                    // Create relative path from project root
                    const relativePath = id.replace(/^.*\\/src\\//, 'src/');
                    
                    // Add data-ve-id attribute (unique identifier)
                    const idAttr = t.jsxAttribute(
                      t.jsxIdentifier('data-ve-id'),
                      t.stringLiteral(\`\${relativePath}:\${loc.start.line}:\${elementIndex++}\`)
                    );
                    
                    // Add data-ve-file attribute (source file path)
                    const fileAttr = t.jsxAttribute(
                      t.jsxIdentifier('data-ve-file'),
                      t.stringLiteral(relativePath)
                    );
                    
                    // Add data-ve-line attribute (line number)
                    const lineAttr = t.jsxAttribute(
                      t.jsxIdentifier('data-ve-line'),
                      t.stringLiteral(String(loc.start.line))
                    );
                    
                    node.attributes.push(idAttr, fileAttr, lineAttr);
                  },
                },
              };
            },
          ],
          sourceMaps: true,
        });

        if (result && result.code) {
          return {
            code: result.code,
            map: result.map,
          };
        }
      } catch (error) {
        // Silently fail - visual editor source mapping is optional
        // console.warn('[Visual Editor Plugin] Transform error:', error);
      }

      return null;
    },
  };
}

export default visualEditorPlugin;
`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'tsconfig.json',
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Path aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },

    /* Linting */
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite-plugin-visual-editor.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: 'tsconfig.node.json',
      path: 'tsconfig.node.json',
      content: `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vite-plugin-visual-editor.ts"]
}`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    // Add vercel.json file 
    {
      name: 'vercel.json',
      path: 'vercel.json',
      content: `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
} 
`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: 'index.html',
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
    <!-- PiPilot Console Bridge - Captures console logs for preview panel -->
    <script>
      (function() {
        window.__PIPILOT_EARLY_ERRORS__ = [];
        window.onerror = function(msg, url, line, col, error) {
          var errorData = { __isError: true, name: error?.name || 'Error', message: msg, stack: error?.stack || ('at ' + url + ':' + line + ':' + col) };
          window.__PIPILOT_EARLY_ERRORS__.push(errorData);
          try { window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: 'error', data: [errorData], timestamp: new Date().toISOString(), id: 'error-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*'); } catch(e) {}
          return false;
        };
        window.onunhandledrejection = function(event) {
          var errorData = { __isError: true, name: 'UnhandledPromiseRejection', message: String(event.reason), stack: event.reason?.stack || '' };
          window.__PIPILOT_EARLY_ERRORS__.push(errorData);
          try { window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: 'error', data: [errorData], timestamp: new Date().toISOString(), id: 'rejection-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*'); } catch(e) {}
        };
        var originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
        function sendToParent(method, args) {
          try {
            var serializedArgs = Array.prototype.slice.call(args).map(function(arg) {
              if (arg instanceof Error) return { __isError: true, name: arg.name, message: arg.message, stack: arg.stack };
              try { return JSON.parse(JSON.stringify(arg)); } catch(e) { return String(arg); }
            });
            window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: method, data: serializedArgs, timestamp: new Date().toISOString(), id: method + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*');
          } catch(e) {}
        }
        console.log = function() { originalConsole.log.apply(console, arguments); sendToParent('log', arguments); };
        console.warn = function() { originalConsole.warn.apply(console, arguments); sendToParent('warn', arguments); };
        console.error = function() { originalConsole.error.apply(console, arguments); sendToParent('error', arguments); };
        console.info = function() { originalConsole.info.apply(console, arguments); sendToParent('info', arguments); };
        console.debug = function() { originalConsole.debug.apply(console, arguments); sendToParent('debug', arguments); };
        setTimeout(function() { window.__PIPILOT_EARLY_ERRORS__.forEach(function(err) { sendToParent('error', [err]); }); }, 100);
      })();
    </script>

    <!-- Google Fonts Preconnect -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

    <!-- Google Fonts - Common font families -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@300;400;500;600;700&family=Lora:wght@400;500;600;700&family=Roboto:wght@300;400;500;700&family=Open+Sans:wght@300;400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    <!-- Visual Editor Client - enables visual editing when loaded in pipilot.dev iframe -->
    <script src="/visual-editor-client.js" defer></script>
  </body>
</html>`,
      fileType: 'html',
      type: 'html',
      size: 0,
      isDirectory: false
    },
    {
      name: 'main.tsx',
      path: 'src/main.tsx',
      content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'App.tsx',
      path: 'src/App.tsx',
      content: `import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import NotFound from './components/NotFound'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'App.css',
      path: 'src/App.css',
      content: `/* Additional custom styles can go here if needed */
/* Most styling is handled by Tailwind CSS utility classes */`,
      fileType: 'css',
      type: 'css',
      size: 0,
      isDirectory: false
    },
    {
      name: 'index.css',
      path: 'src/index.css',
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * =============================================================================
 * VITE + REACT + TAILWIND CSS TEMPLATE
 * =============================================================================
 *
 * STYLING GUIDE FOR AI:
 * ---------------------
 * 1. USE TAILWIND CLASSES FIRST: Always prefer Tailwind utility classes in JSX
 *    Example: <div className="flex items-center justify-between p-4 bg-gray-100">
 *
 * 2. CUSTOM CSS HERE: Only add custom styles to this file when:
 *    - You need complex animations not available in Tailwind
 *    - You need CSS variables for theming
 *    - You need styles that can't be expressed with utilities
 *
 * 3. AVAILABLE CUSTOM COLORS (in tailwind.config.js):
 *    - brand-dark: #181818 (dark backgrounds, text)
 *    - brand-light: #fafafa (light backgrounds)
 *    - brand-gray: #6b7280 (secondary text)
 *    - brand-accent: #3b82f6 (primary accent - blue)
 *    - brand-success: #10b981 (success states - green)
 *    - brand-warning: #f59e0b (warning states - amber)
 *    - brand-error: #ef4444 (error states - red)
 *
 * 4. FONTS:
 *    - font-sans: Inter (default body text)
 *    - font-heading: Inter with font-semibold or font-bold
 *
 * =============================================================================
 */

/* Base layer customizations */
@layer base {
  body {
    @apply bg-white text-gray-900 antialiased;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-semibold text-gray-900;
  }

  a {
    @apply text-brand-accent hover:text-blue-700 transition-colors;
  }
}

/* Component layer - reusable component styles */
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-blue-700 transition-colors font-medium;
  }

  .btn-secondary {
    @apply px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors font-medium;
  }

  .card {
    @apply bg-white rounded-xl shadow-sm border border-gray-200 p-6;
  }

  .input-field {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent;
  }
}

/* Utilities layer - custom utilities */
@layer utilities {
  .transition-base {
    @apply transition-all duration-200 ease-in-out;
  }
}

/* Dark mode support */
.dark body {
  @apply bg-brand-dark text-white;
}

.dark h1, .dark h2, .dark h3, .dark h4, .dark h5, .dark h6 {
  @apply text-white;
}`,
      fileType: 'css',
      type: 'css',
      size: 0,
      isDirectory: false
    },
    {
      name: '.eslintrc.cjs',
      path: '.eslintrc.cjs',
      content: `module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'tailwind.config.js',
      path: 'tailwind.config.js',
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-dark': '#181818',
        'brand-light': '#fafafa',
        'brand-gray': '#6b7280',
        'brand-accent': '#3b82f6',
        'brand-success': '#10b981',
        'brand-warning': '#f59e0b',
        'brand-error': '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'postcss.config.js',
      path: 'postcss.config.js',
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'vite.svg',
      path: 'public/vite.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--logos" width="31.88" height="32" preserveAspectRatio="xMidYMid meet" viewBox="0 0 256 257"><defs><linearGradient id="IconifyId1813088fe1fbc01fb466" x1="-.828%" x2="57.636%" y1="7.652%" y2="78.411%"><stop offset="0%" stop-color="#41D1FF"></stop><stop offset="100%" stop-color="#BD34FE"></stop></linearGradient><linearGradient id="IconifyId1813088fe1fbc01fb467" x1="43.376%" x2="50.316%" y1="2.242%" y2="89.03%"><stop offset="0%" stop-color="#FFEA83"></stop><stop offset="8.333%" stop-color="#FFDD35"></stop><stop offset="100%" stop-color="#FFA800"></stop></linearGradient></defs><path fill="url(#IconifyId1813088fe1fbc01fb466)" d="M255.153 37.938L134.897 252.976c-2.483 4.44-8.862 4.466-11.382.048L.875 37.958c-2.746-4.814 1.371-10.646 6.827-9.67l120.385 21.517a6.537 6.537 0 0 0 2.322-.004l117.867-21.483c5.438-.991 9.574 4.796 6.877 9.62Z"></path><path fill="url(#IconifyId1813088fe1fbc01fb467)" d="M185.432.063L96.44 17.501a3.268 3.268 0 0 0-2.634 3.014l-5.474 92.456a3.268 3.268 0 0 0 3.997 3.378l24.777-5.718c2.318-.535 4.413 1.507 3.936 3.922l-7.361 36.047c-.495 2.426 1.782 4.5 4.151 3.78l15.304-4.649c2.372-.72 4.652 1.36 4.15 3.788l-11.698 56.621c-.732 3.542 3.979 5.473 5.943 2.437l1.313-2.028l72.516-144.72c1.215-2.423-.88-5.186-3.54-4.672l-25.505 4.922c-2.396.462-4.435-1.77-3.88-4.114l16.646-57.705c.346-1.207-.07-2.48-1.097-3.079Z"></path></svg>`,
      fileType: 'svg',
      type: 'svg',
      size: 0,
      isDirectory: false
    },
    {
      name: 'react.svg',
      path: 'public/react.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--logos" width="35.93" height="32" preserveAspectRatio="xMidYMid meet" viewBox="0 0 256 228"><path fill="#00D8FF" d="M210.483 73.824a171.49 171.49 0 0 0-8.24-2.597c.465-1.9.893-3.777 1.273-5.621c6.238-30.281 2.16-54.676-10.332-62.708c-12.065-7.7-29.006.329-43.54 19.526a171.23 171.23 0 0 0-6.375 8.05c-18.452-5.098-37.194-8.446-55.904-9.938c-1.621-.133-3.222-.26-4.811-.38c.116-1.098.234-2.194.354-3.287C99.735 3.471 108.873.393 117.31.393c12.575 0 20.323 6.72 22.568 18.442c.198 1.006.29 2.077.354 3.22c.377 6.478.553 13.21.553 20.069c0 6.747-.158 13.378-.5 19.764c-.063 1.089-.152 2.183-.267 3.28c1.609-.12 3.231-.247 4.863-.38c18.887-1.52 37.796-4.914 56.397-10.163a145.788 145.788 0 0 1 6.491-8.207c14.739-19.422 31.946-27.462 44.004-19.764c12.637 8.08 16.777 32.754 10.504 63.025c-.38 1.844-.808 3.721-1.273 5.621a171.49 171.49 0 0 0-8.24 2.597c-19.026 6.15-37.927 15.798-56.263 28.525c18.336 12.727 37.237 22.375 56.263 28.525a171.49 171.49 0 0 0 8.24 2.597c.465 1.9.893 3.777 1.273 5.621c6.273 30.271 2.133 54.945-10.504 63.025c-12.058 7.698-29.265-.342-44.004-19.764a145.788 145.788 0 0 1-6.491-8.207c-18.601-5.249-37.51-8.643-56.397-10.163c-1.632-.133-3.254-.26-4.863-.38c.115-1.097.204-2.191.267-3.28c.342-6.386.5-13.017.5-19.764c0-6.859-.176-13.591-.553-20.069c-.064-1.143-.156-2.214-.354-3.22c-2.245-11.722-9.993-18.442-22.568-18.442c-8.437 0-17.575 3.078-25.297 9.42c-.12 1.093-.238 2.189-.354 3.287c-1.589.12-3.19.247-4.811.38c-18.71 1.492-37.452 4.84-55.904 9.938a171.23 171.23 0 0 0-6.375-8.05c-14.534-19.197-31.475-27.226-43.54-19.526c-12.492 8.032-16.57 32.427-10.332 62.708c.38 1.844.808 3.721 1.273 5.621a171.49 171.49 0 0 0 8.24 2.597c19.026 6.15 37.927 15.798 56.263 28.525C172.556 89.622 191.457 79.974 210.483 73.824zM128.036 163.754c-19.893 0-36.236-16.343-36.236-36.236s16.343-36.236 36.236-36.236s36.236 16.343 36.236 36.236S147.929 163.754 128.036 163.754z"></path></svg>`,
      fileType: 'svg',
      type: 'svg',
      size: 0,
      isDirectory: false
    },
    {
      name: 'visual-editor-client.js',
      path: 'public/visual-editor-client.js',
      content: `/**
 * Visual Editor Client - Embedded in production builds
 * Enables visual editing when the app is loaded in an iframe from pipilot.dev
 * Works with both development (E2B) and production (Supabase hosting) scenarios
 */
(function() {
  'use strict';

  // Only run in iframe context
  if (window === window.parent) {
    console.log('[VE-Client] Not in iframe, skipping initialization');
    return;
  }

  // Allowed parent origins for security
  // Supports: pipilot.dev main site, *.pipilot.dev subdomains, *.e2b.app E2B URLs, localhost
  const ALLOWED_ORIGINS = [
    'https://pipilot.dev',
    'https://www.pipilot.dev',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
  ];

  // Check if origin is allowed (supports wildcards for subdomains)
  function isAllowedOrigin(origin) {
    if (!origin) return false;
    // Exact match
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    // *.pipilot.dev subdomains (e.g., code-lens-stream.pipilot.dev)
    if (origin.endsWith('.pipilot.dev')) return true;
    // *.e2b.app URLs (e.g., 3000-ikmd9ltiykjsfg57q5pf3.e2b.app)
    if (origin.endsWith('.e2b.app')) return true;
    return false;
  }

  // ============================================
  // CONSOLE CAPTURE - Intercept and forward browser console logs
  // Compatible with console-feed library format
  // ============================================
  (function setupConsoleCapture() {
    var originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
      table: console.table,
      clear: console.clear,
      time: console.time,
      timeEnd: console.timeEnd,
      count: console.count,
      assert: console.assert
    };

    // Serialize an argument for cross-origin transfer
    // This creates a format compatible with console-feed
    function serializeArg(arg, depth) {
      if (depth === undefined) depth = 0;
      if (depth > 5) return { type: 'string', value: '[Max depth reached]' };

      if (arg === null) return { type: 'null', value: null };
      if (arg === undefined) return { type: 'undefined', value: undefined };

      var type = typeof arg;

      if (type === 'string') return { type: 'string', value: arg };
      if (type === 'number') {
        if (isNaN(arg)) return { type: 'number', value: 'NaN' };
        if (!isFinite(arg)) return { type: 'number', value: arg > 0 ? 'Infinity' : '-Infinity' };
        return { type: 'number', value: arg };
      }
      if (type === 'boolean') return { type: 'boolean', value: arg };
      if (type === 'symbol') return { type: 'symbol', value: arg.toString() };
      if (type === 'bigint') return { type: 'bigint', value: arg.toString() };
      if (type === 'function') return { type: 'function', value: arg.toString().substring(0, 200) };

      if (arg instanceof Error) {
        return {
          type: 'error',
          value: {
            name: arg.name,
            message: arg.message,
            stack: arg.stack
          }
        };
      }

      if (arg instanceof Date) {
        return { type: 'date', value: arg.toISOString() };
      }

      if (arg instanceof RegExp) {
        return { type: 'regexp', value: arg.toString() };
      }

      if (Array.isArray(arg)) {
        try {
          var arr = [];
          for (var i = 0; i < Math.min(arg.length, 100); i++) {
            arr.push(serializeArg(arg[i], depth + 1));
          }
          if (arg.length > 100) arr.push({ type: 'string', value: '... ' + (arg.length - 100) + ' more items' });
          return { type: 'array', value: arr };
        } catch (e) {
          return { type: 'string', value: '[Array]' };
        }
      }

      if (arg instanceof HTMLElement) {
        return {
          type: 'html',
          value: {
            tagName: arg.tagName.toLowerCase(),
            id: arg.id || undefined,
            className: arg.className || undefined,
            outerHTML: arg.outerHTML.substring(0, 500)
          }
        };
      }

      if (type === 'object') {
        try {
          var obj = {};
          var keys = Object.keys(arg).slice(0, 50);
          for (var j = 0; j < keys.length; j++) {
            var key = keys[j];
            obj[key] = serializeArg(arg[key], depth + 1);
          }
          return { type: 'object', value: obj };
        } catch (e) {
          return { type: 'string', value: '[Object]' };
        }
      }

      return { type: 'string', value: String(arg) };
    }

    function sendConsoleLog(method, args) {
      try {
        var argsArray = Array.prototype.slice.call(args);
        // Skip VE-Client's own logs to avoid noise
        if (argsArray.length > 0 && typeof argsArray[0] === 'string' && argsArray[0].indexOf('[VE-Client]') === 0) {
          return;
        }

        var serializedData = argsArray.map(function(arg) {
          return serializeArg(arg, 0);
        });

        window.parent.postMessage({
          type: 'BROWSER_CONSOLE_LOG',
          payload: {
            method: method,
            data: serializedData,
            timestamp: new Date().toISOString(),
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9)
          }
        }, '*');
      } catch (e) {
        // Silently fail if postMessage fails
      }
    }

    console.log = function() {
      sendConsoleLog('log', arguments);
      originalConsole.log.apply(console, arguments);
    };

    console.warn = function() {
      sendConsoleLog('warn', arguments);
      originalConsole.warn.apply(console, arguments);
    };

    console.error = function() {
      sendConsoleLog('error', arguments);
      originalConsole.error.apply(console, arguments);
    };

    console.info = function() {
      sendConsoleLog('info', arguments);
      originalConsole.info.apply(console, arguments);
    };

    console.debug = function() {
      sendConsoleLog('debug', arguments);
      originalConsole.debug.apply(console, arguments);
    };

    console.table = function() {
      sendConsoleLog('table', arguments);
      originalConsole.table.apply(console, arguments);
    };

    console.clear = function() {
      sendConsoleLog('clear', []);
      originalConsole.clear.apply(console, arguments);
    };

    console.time = function(label) {
      sendConsoleLog('time', [label || 'default']);
      originalConsole.time.apply(console, arguments);
    };

    console.timeEnd = function(label) {
      sendConsoleLog('timeEnd', [label || 'default']);
      originalConsole.timeEnd.apply(console, arguments);
    };

    console.count = function(label) {
      sendConsoleLog('count', [label || 'default']);
      originalConsole.count.apply(console, arguments);
    };

    console.assert = function(assertion) {
      if (!assertion) {
        var args = Array.prototype.slice.call(arguments, 1);
        args.unshift('Assertion failed:');
        sendConsoleLog('assert', args);
      }
      originalConsole.assert.apply(console, arguments);
    };

    // Capture unhandled errors
    window.addEventListener('error', function(event) {
      sendConsoleLog('error', [{
        name: 'UncaughtError',
        message: event.message,
        stack: 'at ' + event.filename + ':' + event.lineno + ':' + event.colno
      }]);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
      var reason = event.reason;
      if (reason instanceof Error) {
        sendConsoleLog('error', [reason]);
      } else {
        sendConsoleLog('error', ['Unhandled Promise Rejection:', reason]);
      }
    });
  })();

  // State
  let isEnabled = false;
  let selectedElements = new Map();
  let hoveredElement = null;
  let hoverOverlay = null;
  let selectionOverlays = new Map();
  let elementIdCounter = 1;
  const elementIdMap = new WeakMap();

  // Generate unique element ID using DOM path
  function generateElementId(element) {
    if (elementIdMap.has(element)) {
      return elementIdMap.get(element);
    }
    
    // Check for existing data-ve-id (from build-time plugin)
    const existingId = element.getAttribute('data-ve-id');
    if (existingId) {
      elementIdMap.set(element, existingId);
      return existingId;
    }
    
    // Generate DOM path-based ID for production
    const path = getDOMPath(element);
    const id = 've-' + path;
    element.setAttribute('data-ve-id', id);
    elementIdMap.set(element, id);
    return id;
  }

  // Get DOM path for element identification
  function getDOMPath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += '#' + current.id;
        path.unshift(selector);
        break;
      }
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\\s+/).slice(0, 2).join('.');
        if (classes) selector += '.' + classes;
      }
      
      // Add index if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current);
          selector += ':nth(' + index + ')';
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join('>');
  }

  // Get computed styles for an element
  function getComputedStyleInfo(element) {
    const computed = window.getComputedStyle(element);
    return {
      display: computed.display,
      position: computed.position,
      flexDirection: computed.flexDirection,
      justifyContent: computed.justifyContent,
      alignItems: computed.alignItems,
      gap: computed.gap,
      marginTop: computed.marginTop,
      marginRight: computed.marginRight,
      marginBottom: computed.marginBottom,
      marginLeft: computed.marginLeft,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,
      width: computed.width,
      height: computed.height,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      borderRadius: computed.borderRadius,
    };
  }

  // Check if element should be ignored
  function shouldIgnoreElement(element) {
    if (!element || element.nodeType !== 1) return true;
    const ignoreTags = ['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'HTML', 'NOSCRIPT'];
    if (ignoreTags.includes(element.tagName)) return true;
    if (element.closest('[data-ve-overlay]')) return true;
    const computed = window.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden') return true;
    return false;
  }

  // Get element info for parent
  function getElementInfo(element) {
    if (shouldIgnoreElement(element)) return null;
    
    const id = generateElementId(element);
    const rect = element.getBoundingClientRect();
    const sourceFile = element.getAttribute('data-ve-file');
    const sourceLine = element.getAttribute('data-ve-line');
    
    // Get only the FIRST direct text node content to prevent duplication
    let textContent = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        textContent = node.textContent.trim();
        break;
      }
    }
    
    return {
      id,
      tagName: element.tagName,
      textContent: textContent,
      className: element.className || '',
      computedStyles: getComputedStyleInfo(element),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      sourceFile: sourceFile || undefined,
      sourceLine: sourceLine ? parseInt(sourceLine, 10) : undefined,
    };
  }

  // Send message to parent with origin check
  function sendToParent(message) {
    try {
      window.parent.postMessage(message, '*');
    } catch (e) {
      console.warn('[VE-Client] Failed to send message:', e);
    }
  }

  // Create overlay element
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-ve-overlay', 'true');
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;box-sizing:border-box;transition:all 0.1s ease;';
    document.body.appendChild(overlay);
    return overlay;
  }

  // Update overlay position and style
  function updateOverlay(overlay, rect, type) {
    if (!overlay) return;
    const isHover = type === 'hover';
    const color = isHover ? 'rgba(59,130,246,0.5)' : 'rgba(37,99,235,0.7)';
    const bg = isHover ? 'rgba(59,130,246,0.05)' : 'rgba(37,99,235,0.05)';
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;box-sizing:border-box;' +
      'top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;' +
      'border:2px solid ' + color + ';background:' + bg + ';transition:all 0.1s ease;';
  }

  // Remove overlay
  function removeOverlay(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  // Find element by ID
  function findElementById(id) {
    return document.querySelector('[data-ve-id=\"' + id + '\"]');
  }

  // Clear all selections
  function clearSelection() {
    selectedElements.clear();
    selectionOverlays.forEach(removeOverlay);
    selectionOverlays.clear();
  }

  // Event Handlers
  function handleMouseMove(e) {
    if (!isEnabled) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || shouldIgnoreElement(element)) {
      if (hoveredElement) {
        hoveredElement = null;
        removeOverlay(hoverOverlay);
        hoverOverlay = null;
        sendToParent({ type: 'ELEMENT_HOVERED', payload: { element: null } });
      }
      return;
    }
    
    const elementId = generateElementId(element);
    if (hoveredElement !== element && !selectedElements.has(elementId)) {
      hoveredElement = element;
      if (!hoverOverlay) hoverOverlay = createOverlay();
      updateOverlay(hoverOverlay, element.getBoundingClientRect(), 'hover');
      sendToParent({ type: 'ELEMENT_HOVERED', payload: { element: getElementInfo(element) } });
    }
  }

  function handleClick(e) {
    if (!isEnabled) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || shouldIgnoreElement(element)) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const elementId = generateElementId(element);
    const isMultiSelect = e.ctrlKey || e.metaKey;
    
    if (isMultiSelect) {
      if (selectedElements.has(elementId)) {
        selectedElements.delete(elementId);
        removeOverlay(selectionOverlays.get(elementId));
        selectionOverlays.delete(elementId);
        sendToParent({ type: 'ELEMENT_DESELECTED', payload: { elementId } });
      } else {
        selectedElements.set(elementId, element);
        const overlay = createOverlay();
        selectionOverlays.set(elementId, overlay);
        updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
        sendToParent({ type: 'ELEMENT_SELECTED', payload: { elements: [getElementInfo(element)], isMultiSelect: true } });
      }
    } else {
      clearSelection();
      selectedElements.set(elementId, element);
      const overlay = createOverlay();
      selectionOverlays.set(elementId, overlay);
      updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
      sendToParent({ type: 'ELEMENT_SELECTED', payload: { elements: [getElementInfo(element)], isMultiSelect: false } });
    }
    
    if (hoverOverlay) { removeOverlay(hoverOverlay); hoverOverlay = null; }
    hoveredElement = null;
  }

  function handleKeyDown(e) {
    if (!isEnabled) return;
    if (e.key === 'Escape') {
      clearSelection();
      sendToParent({ type: 'CLEAR_SELECTION', payload: {} });
    }
  }

  function handleScroll() {
    selectionOverlays.forEach(function(overlay, elementId) {
      const element = findElementById(elementId);
      if (element) updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
    });
    if (hoverOverlay && hoveredElement) {
      updateOverlay(hoverOverlay, hoveredElement.getBoundingClientRect(), 'hover');
    }
  }

  // Load a Google Font dynamically
  function loadGoogleFont(fontFamily) {
    // Skip system fonts
    var systemFonts = ['system-ui', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'sans-serif', 'serif', 'monospace'];
    if (systemFonts.some(function(sf) { return fontFamily.toLowerCase().includes(sf.toLowerCase()); })) {
      return;
    }
    
    // Clean font name (remove fallbacks like "Inter, sans-serif")
    var cleanFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    if (!cleanFont) return;
    
    // Check if already loaded
    var fontId = 'google-font-' + cleanFont.replace(/\\s+/g, '-').toLowerCase();
    if (document.getElementById(fontId)) {
      console.log('[VE-Client] Font already loaded:', cleanFont);
      return;
    }
    
    // Create link element
    var link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(cleanFont) + ':wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
    console.log('[VE-Client] Loaded Google Font:', cleanFont);
  }

  // Apply style changes from parent
  function applyStyleChanges(elementId, changes) {
    const element = findElementById(elementId);
    if (!element) return false;
    changes.forEach(function(change) {
      const prop = change.property.replace(/([A-Z])/g, '-$1').toLowerCase();
      
      // If it's a font-family change, load the Google Font first
      if (prop === 'font-family') {
        loadGoogleFont(change.newValue);
      }
      
      element.style.setProperty(prop, change.newValue);
    });
    const overlay = selectionOverlays.get(elementId);
    if (overlay) updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
    sendToParent({ type: 'STYLE_APPLIED', payload: { elementId, success: true } });
    return true;
  }

  // Update text content from parent
  function updateTextContent(elementId, text) {
    const element = findElementById(elementId);
    if (!element) return false;
    
    // Find and update only the FIRST text node to prevent duplication
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = text;
        sendToParent({ type: 'TEXT_UPDATED', payload: { elementId, success: true } });
        return true;
      }
    }
    
    // If no text node exists, prepend one for elements with children
    if (element.children.length > 0) {
      element.insertBefore(document.createTextNode(text), element.firstChild);
      sendToParent({ type: 'TEXT_UPDATED', payload: { elementId, success: true } });
      return true;
    }
    
    // For simple elements with no children, set textContent directly
    element.textContent = text;
    sendToParent({ type: 'TEXT_UPDATED', payload: { elementId, success: true } });
    return true;
  }

  // Message handler
  function handleMessage(event) {
    // Security: Only allow messages from known origins
    if (!isAllowedOrigin(event.origin)) {
      return;
    }
    
    var message = event.data;
    if (!message || !message.type) return;
    
    switch (message.type) {
      case 'VISUAL_EDITOR_INIT':
      case 'VISUAL_EDITOR_TOGGLE':
        isEnabled = message.payload.enabled;
        if (!isEnabled) {
          clearSelection();
          if (hoverOverlay) { removeOverlay(hoverOverlay); hoverOverlay = null; }
          hoveredElement = null;
        }
        document.body.style.cursor = isEnabled ? 'crosshair' : '';
        sendToParent({ type: 'VISUAL_EDITOR_READY', payload: { enabled: isEnabled } });
        break;
      case 'CLEAR_SELECTION':
        clearSelection();
        break;
      case 'APPLY_STYLE':
        applyStyleChanges(message.payload.elementId, message.payload.changes);
        break;
      case 'UPDATE_TEXT':
        updateTextContent(message.payload.elementId, message.payload.text);
        break;
      case 'REQUEST_ELEMENT_INFO':
        var el = findElementById(message.payload.elementId);
        if (el) sendToParent({ type: 'ELEMENT_INFO_RESPONSE', payload: { element: getElementInfo(el) } });
        break;
      case 'APPLY_THEME_PREVIEW':
        console.log('[VE-Client] Received APPLY_THEME_PREVIEW message');
        applyThemePreview(message.payload.themeVars);
        break;
      case 'CLEAR_THEME_PREVIEW':
        console.log('[VE-Client] Received CLEAR_THEME_PREVIEW message');
        clearThemePreview();
        break;
      case 'DRAG_ELEMENT_START':
        console.log('[VE-Client] Received DRAG_ELEMENT_START message');
        startDragMode(message.payload.elementType, message.payload.content);
        break;
      case 'DRAG_ELEMENT_END':
        console.log('[VE-Client] Received DRAG_ELEMENT_END message');
        endDragMode();
        break;
      case 'INSERT_ELEMENT':
        console.log('[VE-Client] Received INSERT_ELEMENT message');
        insertElement(message.payload.content, message.payload.targetElementId, message.payload.position);
        break;
    }
  }

  // Apply theme preview - set CSS variables directly on :root (like thmeswitcher.html)
  function applyThemePreview(themeVars) {
    console.log('[VE-Client] applyThemePreview called with vars:', themeVars ? Object.keys(themeVars).length + ' variables' : 'null');
    
    if (!themeVars || typeof themeVars !== 'object') {
      console.warn('[VE-Client] No theme variables provided');
      return;
    }
    
    // Apply CSS variables directly to :root using setProperty (same as thmeswitcher.html)
    var root = document.documentElement;
    var appliedCount = 0;
    var backgroundValue = null;
    
    Object.entries(themeVars).forEach(function(entry) {
      var key = entry[0];
      var value = entry[1];
      root.style.setProperty(key, value);
      appliedCount++;
      
      // Track background for direct application
      if (key === '--background') {
        backgroundValue = value;
      }
      
      // Log first few for debugging
      if (appliedCount <= 5) {
        console.log('[VE-Client] Set', key, '=', value);
      }
    });
    
    // Also apply background directly to body as fallback for apps that don't use CSS variables
    if (backgroundValue) {
      document.body.style.backgroundColor = 'hsl(' + backgroundValue + ')';
      console.log('[VE-Client] Also set body background to:', 'hsl(' + backgroundValue + ')');
    }
    
    // Verify the variables were set
    var testVar = root.style.getPropertyValue('--background');
    console.log('[VE-Client] Verification: --background =', testVar);
    console.log('[VE-Client] Root style attribute length:', root.getAttribute('style') ? root.getAttribute('style').length : 0);
    
    console.log('[VE-Client] Theme preview applied via setProperty,', appliedCount, 'CSS variables set');
    sendToParent({ type: 'THEME_PREVIEW_APPLIED', payload: { success: true, varsCount: appliedCount } });
  }

  // Clear theme preview - remove CSS variables from :root
  function clearThemePreview() {
    var root = document.documentElement;
    var computedStyle = window.getComputedStyle(root);
    var propsToRemove = [];
    
    // Collect all CSS custom properties
    for (var i = 0; i < root.style.length; i++) {
      var prop = root.style[i];
      if (prop.startsWith('--')) {
        propsToRemove.push(prop);
      }
    }
    
    // Remove them
    propsToRemove.forEach(function(prop) {
      root.style.removeProperty(prop);
    });
    
    console.log('[VE-Client] Theme preview cleared, removed', propsToRemove.length, 'CSS variables');
    sendToParent({ type: 'THEME_PREVIEW_CLEARED', payload: { success: true } });
  }

  // ============================================
  // DRAG AND DROP FUNCTIONS
  // ============================================
  var isDraggingElement = false;
  var dragElementType = null;
  var dragElementContent = null;
  var dropTargetOverlay = null;
  var currentDropTarget = null;
  var dropPosition = 'inside';

  function startDragMode(elementType, content) {
    isDraggingElement = true;
    dragElementType = elementType;
    dragElementContent = content;
    document.body.style.cursor = 'copy';
    
    // Create drop target overlay
    if (!dropTargetOverlay) {
      dropTargetOverlay = document.createElement('div');
      dropTargetOverlay.setAttribute('data-ve-overlay', 'true');
      dropTargetOverlay.id = 've-drop-overlay';
      dropTargetOverlay.style.cssText = 'position: fixed; pointer-events: none; z-index: 999998; box-sizing: border-box; border: 2px dashed #22c55e; background: rgba(34, 197, 94, 0.1); display: none;';
      document.body.appendChild(dropTargetOverlay);
    }
    
    // Add drag-specific event listeners
    document.addEventListener('mousemove', handleDragMove, true);
    document.addEventListener('click', handleDrop, true);
    document.addEventListener('keydown', handleDragKeyDown, true);
    
    console.log('[VE-Client] Drag mode started:', elementType);
    sendToParent({ type: 'DRAG_MODE_STARTED', payload: { elementType: elementType } });
  }

  function endDragMode() {
    isDraggingElement = false;
    dragElementType = null;
    dragElementContent = null;
    currentDropTarget = null;
    document.body.style.cursor = isEnabled ? 'crosshair' : '';
    
    // Hide drop overlay
    if (dropTargetOverlay) {
      dropTargetOverlay.style.display = 'none';
    }
    
    // Remove drag event listeners
    document.removeEventListener('mousemove', handleDragMove, true);
    document.removeEventListener('click', handleDrop, true);
    document.removeEventListener('keydown', handleDragKeyDown, true);
    
    console.log('[VE-Client] Drag mode ended');
  }

  function handleDragMove(event) {
    if (!isDraggingElement) return;
    
    var target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || shouldIgnoreElement(target)) {
      if (dropTargetOverlay) dropTargetOverlay.style.display = 'none';
      currentDropTarget = null;
      return;
    }
    
    // Find valid drop container
    var foundDropTarget = findDropTarget(target);
    if (!foundDropTarget) {
      if (dropTargetOverlay) dropTargetOverlay.style.display = 'none';
      currentDropTarget = null;
      return;
    }
    
    currentDropTarget = foundDropTarget;
    
    // Determine drop position based on mouse position
    var rect = foundDropTarget.getBoundingClientRect();
    var mouseY = event.clientY;
    var relativeY = (mouseY - rect.top) / rect.height;
    
    if (relativeY < 0.25) {
      dropPosition = 'before';
    } else if (relativeY > 0.75) {
      dropPosition = 'after';
    } else {
      dropPosition = 'inside';
    }
    
    // Update drop overlay
    if (dropTargetOverlay) {
      dropTargetOverlay.style.display = 'block';
      
      if (dropPosition === 'before') {
        dropTargetOverlay.style.left = rect.left + 'px';
        dropTargetOverlay.style.top = (rect.top - 2) + 'px';
        dropTargetOverlay.style.width = rect.width + 'px';
        dropTargetOverlay.style.height = '4px';
        dropTargetOverlay.style.background = '#22c55e';
        dropTargetOverlay.style.border = 'none';
      } else if (dropPosition === 'after') {
        dropTargetOverlay.style.left = rect.left + 'px';
        dropTargetOverlay.style.top = (rect.bottom - 2) + 'px';
        dropTargetOverlay.style.width = rect.width + 'px';
        dropTargetOverlay.style.height = '4px';
        dropTargetOverlay.style.background = '#22c55e';
        dropTargetOverlay.style.border = 'none';
      } else {
        dropTargetOverlay.style.left = rect.left + 'px';
        dropTargetOverlay.style.top = rect.top + 'px';
        dropTargetOverlay.style.width = rect.width + 'px';
        dropTargetOverlay.style.height = rect.height + 'px';
        dropTargetOverlay.style.background = 'rgba(34, 197, 94, 0.1)';
        dropTargetOverlay.style.border = '2px dashed #22c55e';
      }
    }
  }

  function findDropTarget(element) {
    var validContainers = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'FORM', 'UL', 'OL', 'BODY'];
    
    var current = element;
    while (current && current !== document.body) {
      if (validContainers.indexOf(current.tagName) !== -1 && !current.hasAttribute('data-ve-overlay')) {
        return current;
      }
      current = current.parentElement;
    }
    
    return document.body;
  }

  function handleDrop(event) {
    if (!isDraggingElement || !currentDropTarget || !dragElementContent) {
      endDragMode();
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    // Parse the JSX content and create HTML element
    var htmlContent = jsxToHtml(dragElementContent);
    
    // Create a temporary container to parse the HTML
    var temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    var newElement = temp.firstElementChild;
    
    if (!newElement) {
      console.warn('[VE-Client] Failed to create element');
      endDragMode();
      return;
    }
    
    // Generate unique ID for the new element
    var elementId = 've-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    newElement.setAttribute('data-ve-id', elementId);
    
    // Insert element based on position
    if (dropPosition === 'before') {
      currentDropTarget.parentNode.insertBefore(newElement, currentDropTarget);
    } else if (dropPosition === 'after') {
      currentDropTarget.parentNode.insertBefore(newElement, currentDropTarget.nextSibling);
    } else {
      currentDropTarget.appendChild(newElement);
    }
    
    // Notify parent about the insertion
    sendToParent({
      type: 'ELEMENT_INSERTED',
      payload: {
        elementId: elementId,
        content: dragElementContent,
        position: dropPosition,
        parentTag: currentDropTarget.tagName
      }
    });
    
    console.log('[VE-Client] Element inserted:', elementId, 'position:', dropPosition);
    
    endDragMode();
  }

  function handleDragKeyDown(event) {
    if (event.key === 'Escape') {
      endDragMode();
      sendToParent({ type: 'DRAG_CANCELLED', payload: {} });
    }
  }

  function jsxToHtml(jsx) {
    if (!jsx) return '';
    
    return jsx
      .replace(/className=/g, 'class=')
      .replace(/htmlFor=/g, 'for=')
      .replace(/\\{[^}]*\\}/g, '')
      .replace(/<(\\w+)([^>]*)\\/>/g, '<$1$2></$1>')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function insertElement(content, targetElementId, position) {
    var target = targetElementId ? findElementById(targetElementId) : document.body;
    if (!target) {
      target = document.body;
    }
    
    var htmlContent = jsxToHtml(content);
    var temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    var newElement = temp.firstElementChild;
    
    if (!newElement) {
      console.warn('[VE-Client] Failed to create element for insertion');
      return;
    }
    
    var elementId = 've-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    newElement.setAttribute('data-ve-id', elementId);
    
    if (position === 'before') {
      target.parentNode.insertBefore(newElement, target);
    } else if (position === 'after') {
      target.parentNode.insertBefore(newElement, target.nextSibling);
    } else {
      target.appendChild(newElement);
    }
    
    sendToParent({
      type: 'ELEMENT_INSERTED',
      payload: {
        elementId: elementId,
        content: content,
        position: position || 'inside'
      }
    });
    
    console.log('[VE-Client] Element inserted via INSERT_ELEMENT:', elementId);
  }

  // Initialize
  function init() {
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('message', handleMessage);
    
    // Notify parent we're ready
    sendToParent({ type: 'VISUAL_EDITOR_READY', payload: {} });
    console.log('[VE-Client] Initialized - waiting for parent commands');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    {
      name: '.gitignore',
      path: '.gitignore',
      content: `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Environment files
.env.local
.env.development.local
.env.test.local
.env.production.local
`,
      fileType: 'text',
      type: 'text',
      size: 0,
      isDirectory: false
    },
  
    // Add .env.local file for local environment variables
    {
      name: '.env.local',
      path: '.env.local',
      content: `# Local environment variables (not committed to git)
# Add your local environment variables here
# Example:
# VITE_API_KEY=your_local_api_key
# VITE_DATABASE_URL=your_local_database_url

# Visual Editor - Enable source mapping for visual editing
# Set to 'true' to enable (adds data-ve-* attributes to JSX elements)
VITE_ENABLE_VISUAL_EDITOR=true

# This file is typically used for sensitive information
# and should be added to .gitignore
`,
      fileType: 'env',
      type: 'text',
      size: 0,
      isDirectory: false
    },
    {
      name: 'README.md',
      path: 'README.md',
      content: `# Vite + React + TypeScript + Tailwind CSS

This template provides a fast, modern development experience with:

- ⚡️ [Vite](https://vitejs.dev/) - Fast build tool and dev server
- ⚛️ [React 18](https://reactjs.org/) - UI library with React Router v6
- 🔷 [TypeScript](https://www.typescriptlang.org/) - Type safety
- 🎨 [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

## Getting Started

1. **Install dependencies:**
   \`\`\`bash
   pnpm install
   \`\`\`

2. **Start development server:**
   \`\`\`bash
   pnpm dev
   \`\`\`

3. **Build for production:**
   \`\`\`bash
   pnpm build
   \`\`\`

4. **Preview production build:**
   \`\`\`bash
   pnpm preview
   \`\`\`

## Project Structure

\`\`\`
src/
├── App.tsx          # Main application component
├── App.css          # App-specific styles
├── index.css        # Global styles with Tailwind
├── main.tsx         # Application entry point
├── components/      # Reusable UI components
├── hooks/           # Custom React hooks
├── assets/          # Static assets (images, icons)
└── lib/             # Utility functions
\`\`\`

## Features

- 🚀 **Fast Refresh** - Instant updates during development
- 📱 **Responsive Design** - Mobile-first with Tailwind CSS
- 🎯 **Type Safety** - Full TypeScript support
- 🔧 **ESLint** - Code quality and consistency
- 📦 **Modern Build** - ES modules and tree shaking
- 🎣 **Custom Hooks** - Essential React hooks for common patterns
- 🧩 **UI Components** - Complete shadcn/ui component library
- 📊 **Data Tables** - Advanced table with sorting, filtering, pagination

## Available Templates

Choose from these comprehensive templates:

### 🚀 **Vite React Template**
- **Framework**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Features**: 25+ UI components, 10 custom hooks, fast HMR
- **Use Case**: Client-side applications, SPAs, prototypes

### ⚡ **Next.js Template**
- **Framework**: Next.js 14 + App Router + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Features**: SSR/SSG, API routes, 25+ UI components, 10 custom hooks
- **Use Case**: Full-stack applications, production websites

## Available Hooks

The template includes essential custom hooks in \`src/hooks/\`:

- **useLocalStorage** - Persistent state with localStorage
- **useDebounce** - Debounce values to optimize performance
- **useOnClickOutside** - Detect clicks outside elements
- **useMediaQuery** - Responsive design breakpoints
- **useMobile** - Mobile device detection (responsive)
- **useCopyToClipboard** - Copy text to clipboard
- **useInterval** - Custom interval with cleanup
- **usePrevious** - Access previous state values
- **useToggle** - Boolean state with toggle actions
- **useToast** - Easy toast notifications system

## Customization

- Edit \`src/App.tsx\` to modify the main component
- Update \`tailwind.config.js\` to customize Tailwind
- Modify \`vite.config.ts\` for build configuration
- Add new components in the \`src/components/\` directory
- Create custom hooks in the \`src/hooks/\` directory

## AI Development

- Generate code following React and TypeScript best practices
- Apply Tailwind CSS for consistent styling
- Maintain proper component structure and state management
- Ensure responsive design and accessibility
- Follow established patterns for forms, API integration, and state management
- Create responsive, accessible, and performant components
- Implement proper multi-page routing with React Router

## Deployment

This project is ready to deploy to:
- Vercel
- Netlify
- GitHub Pages
- Any static hosting service

Happy coding! 🎉`,
      fileType: 'text',
      type: 'text',
      size: 0,
      isDirectory: false
    },
    {
      name: 'react.svg',
      path: 'src/assets/react.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--logos" width="35.93" height="32" preserveAspectRatio="xMidYMid meet" viewBox="0 0 256 228"><path fill="#00D8FF" d="M210.483 73.824a171.49 171.49 0 0 0-8.24-2.597c.465-1.9.893-3.777 1.273-5.621c6.238-30.281 2.16-54.676-10.332-62.708c-12.065-7.7-29.006.329-43.54 19.526a171.23 171.23 0 0 0-6.375 8.05c-18.452-5.098-37.194-8.446-55.904-9.938c-1.621-.133-3.222-.26-4.811-.38c.116-1.098.234-2.194.354-3.287C99.735 3.471 108.873.393 117.31.393c12.575 0 20.323 6.72 22.568 18.442c.198 1.006.29 2.077.354 3.22c.377 6.478.553 13.21.553 20.069c0 6.747-.158 13.378-.5 19.764c-.063 1.089-.152 2.183-.267 3.28c1.609-.12 3.231-.247 4.863-.38c18.887-1.52 37.796-4.914 56.397-10.163a145.788 145.788 0 0 1 6.491-8.207c14.739-19.422 31.946-27.462 44.004-19.764c12.637 8.08 16.777 32.754 10.504 63.025c-.38 1.844-.808 3.721-1.273 5.621a171.49 171.49 0 0 0-8.24 2.597c-19.026 6.15-37.927 15.798-56.263 28.525c18.336 12.727 37.237 22.375 56.263 28.525a171.49 171.49 0 0 0 8.24 2.597c.465 1.9.893 3.777 1.273 5.621c6.273 30.271 2.133 54.945-10.504 63.025c-12.058 7.698-29.265-.342-44.004-19.764a145.788 145.788 0 0 1-6.491-8.207c-18.601-5.249-37.51-8.643-56.397-10.163c-1.632-.133-3.254-.26-4.863-.38c.115-1.097.204-2.191.267-3.28c.342-6.386.5-13.017.5-19.764c0-6.859-.176-13.591-.553-20.069c-.064-1.143-.156-2.214-.354-3.22c-2.245-11.722-9.993-18.442-22.568-18.442c-8.437 0-17.575 3.078-25.297 9.42c-.12 1.093-.238 2.189-.354 3.287c-1.589.12-3.19.247-4.811.38c-18.71 1.492-37.452 4.84-55.904 9.938a171.23 171.23 0 0 0-6.375-8.05c-14.534-19.197-31.475-27.226-43.54-19.526c-12.492 8.032-16.57 32.427-10.332 62.708c.38 1.844.808 3.721 1.273 5.621a171.49 171.49 0 0 0 8.24 2.597c19.026 6.15 37.927 15.798 56.263 28.525C172.556 89.622 191.457 79.974 210.483 73.824zM128.036 163.754c-19.893 0-36.236-16.343-36.236-36.236s16.343-36.236 36.236-36.236s36.236 16.343 36.236 36.236S147.929 163.754 128.036 163.754z"></path></svg>`,
      fileType: 'svg',
      type: 'svg',
      size: 0,
      isDirectory: false
    },
    // Simple components (no shadcn/ui dependencies)
    {
      name: 'Loading.tsx',
      path: 'src/components/Loading.tsx',
      content: `interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
}

export function Loading({ size = 'md', text }: LoadingProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={\`\${sizeClasses[size]} relative\`}>
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
      </div>
      {text && <p className="text-gray-600 text-sm animate-pulse">{text}</p>}
    </div>
  )
}

export function LoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loading size="lg" text="Loading..." />
    </div>
  )
}

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 shadow-xl">
        <Loading size="lg" text="Please wait..." />
      </div>
    </div>
  )
}`,
      fileType: 'tsx',
      type: 'tsx',
      size: 0,
      isDirectory: false
    },
    {
      name: 'NotFound.tsx',
      path: 'src/components/NotFound.tsx',
      content: `import { useNavigate } from 'react-router-dom'

export function NotFound() {
  const navigate = useNavigate()


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        {/* 404 Number */}
        <div className="relative">
          <h1 className="text-[150px] md:text-[200px] font-bold text-gray-200 select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl animate-bounce">
              🔍
            </div>
          </div>
        </div>

        {/* Message */}
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mt-4">
          Page Not Found
        </h2>
        <p className="text-gray-600 mt-2 max-w-md mx-auto">
          Oops! The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>

        {/* Decorative dots */}
        <div className="flex justify-center gap-2 mt-12">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )
}

export default NotFound`,
      fileType: 'tsx',
      type: 'tsx',
      size: 0,
      isDirectory: false
    },
    {
      name: 'Home.tsx',
      path: 'src/pages/Home.tsx',
      content: `// ┌─────────────────────────────────────────────────────────┐
// │  DEFAULT TEMPLATE — This is NOT the user's app.        │
// │  Replace this ENTIRE file with the user's homepage.     │
// │  Use write_file to overwrite it completely.             │
// └─────────────────────────────────────────────────────────┘

export function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-3">Welcome to PiPilot</h1>
        <p className="text-gray-400 mb-6">
          This is the default template. Tell the AI what you want to build and it will replace this page with your app.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 text-sm text-gray-400 border border-gray-700">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
          Waiting for your first prompt...
        </div>
      </div>
    </div>
  )
}

export default Home`,
      fileType: 'tsx',
      type: 'tsx',
      size: 0,
      isDirectory: false
    },
    {
      name: '.env.development',
      path: '.env.development',
      content: `# Development Environment Variables
VITE_ENABLE_DEBUG=true
NODE_ENV=development`,
      fileType: 'plaintext',
      type: 'plaintext',
      size: 0,
      isDirectory: false
    },
  ]

  // Default Expo React Native + TypeScript template files


  // Default Next.js + TypeScript + Tailwind CSS template files
  private static readonly NEXTJS_TEMPLATE_FILES: Omit<File, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'package.json',
      path: 'package.json',
      content: `{
  "name": "nextjs-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start --port 3000",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.0.4",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.454.0",
    "framer-motion": "^12.23.12",
    "date-fns": "4.1.0",
    "recharts": "2.15.4",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "@dyad-sh/nextjs-webpack-component-tagger": "0.8.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/node": "^25.0.0",
    "typescript": "^5.2.2",
    "eslint": "^8.55.0",
    "eslint-config-next": "14.0.4",
    "@babel/core": "^7.24.0",
    "@babel/preset-react": "^7.23.3",
    "@babel/preset-typescript": "^7.23.3",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.18"
  }
}`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: 'next.config.js',
      path: 'next.config.js',
      content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost','api.a0.dev'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ]
  },
  // Visual Editor: Custom webpack config to inject source location data
  // Only enabled when NEXT_PUBLIC_ENABLE_VISUAL_EDITOR=true
  webpack: (config, { dev }) => {
    if (dev && process.env.NEXT_PUBLIC_ENABLE_VISUAL_EDITOR === 'true') {
      // Add component tagger for enhanced visual editor source mapping
      config.module.rules.push({
        test: /\.(jsx|tsx)$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: '@dyad-sh/nextjs-webpack-component-tagger',
      });

      // Add custom babel plugin for visual editor source mapping
      config.module.rules.push({
        test: /\\.(tsx|jsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve('./visual-editor-loader.js'),
          },
        ],
      });
    }
    return config;
  },
}

module.exports = nextConfig`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'tailwind.config.ts',
      path: 'tailwind.config.ts',
      content: `import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-dark': '#181818',
        'brand-light': '#fafafa',
        'brand-gray': '#6b7280',
        'brand-accent': '#3b82f6',
        'brand-success': '#10b981',
        'brand-warning': '#f59e0b',
        'brand-error': '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'postcss.config.js',
      path: 'postcss.config.js',
      content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'visual-editor-loader.js',
      path: 'visual-editor-loader.js',
      content: `// Visual Editor Webpack Loader for Next.js
// Adds data-ve-id, data-ve-file, data-ve-line attributes to JSX elements
// This enables the visual editor to map DOM elements back to source code

const babel = require('@babel/core');

module.exports = function visualEditorLoader(source) {
  const callback = this.async();
  const filename = this.resourcePath;

  // Only process files in src or app directories
  if (!filename.match(/[\\\\/](src|app|components)[\\\\/]/)) {
    return callback(null, source);
  }

  try {
    let elementIndex = 0;

    const result = babel.transformSync(source, {
      filename,
      presets: [
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript',
      ],
      plugins: [
        function visualEditorBabelPlugin({ types: t }) {
          return {
            visitor: {
              JSXOpeningElement(path) {
                const { node } = path;
                const loc = node.loc;

                if (!loc) return;

                // Skip if already has data-ve-id
                const hasVeId = node.attributes.some(
                  (attr) =>
                    attr.type === 'JSXAttribute' &&
                    attr.name?.name === 'data-ve-id'
                );
                if (hasVeId) return;

                // Create relative path - use non-greedy match to get FIRST occurrence of src/app/components
                // This ensures src/app/page.tsx stays as src/app/page.tsx (not app/page.tsx)
                const relativePath = filename
                  .replace(/^.*?[\\\\/](src|app|components)[\\\\/]/, '$1/')
                  .replace(/\\\\/g, '/');

                // Add data-ve-id attribute
                const idAttr = t.jsxAttribute(
                  t.jsxIdentifier('data-ve-id'),
                  t.stringLiteral(
                    relativePath + ':' + loc.start.line + ':' + elementIndex++
                  )
                );

                // Add data-ve-file attribute
                const fileAttr = t.jsxAttribute(
                  t.jsxIdentifier('data-ve-file'),
                  t.stringLiteral(relativePath)
                );

                // Add data-ve-line attribute
                const lineAttr = t.jsxAttribute(
                  t.jsxIdentifier('data-ve-line'),
                  t.stringLiteral(String(loc.start.line))
                );

                node.attributes.push(idAttr, fileAttr, lineAttr);
              },
            },
          };
        },
      ],
      sourceMaps: true,
      sourceFileName: filename,
    });

    if (result && result.code) {
      callback(null, result.code, result.map);
    } else {
      callback(null, source);
    }
  } catch (error) {
    // Silently fallback to original source if transformation fails
    console.warn('[Visual Editor Loader] Transform skipped:', filename);
    callback(null, source);
  }
};
`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'tsconfig.json',
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: 'globals.css',
      path: 'src/app/globals.css',
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * =============================================================================
 * NEXT.JS + TAILWIND CSS TEMPLATE
 * =============================================================================
 *
 * STYLING GUIDE FOR AI:
 * ---------------------
 * 1. USE TAILWIND CLASSES FIRST: Always prefer Tailwind utility classes in JSX
 *    Example: <div className="flex items-center justify-between p-4 bg-gray-100">
 *
 * 2. CUSTOM CSS HERE: Only add custom styles to this file when:
 *    - You need complex animations not available in Tailwind
 *    - You need CSS variables for theming
 *    - You need styles that can't be expressed with utilities
 *
 * 3. AVAILABLE CUSTOM COLORS (in tailwind.config.ts):
 *    - brand-dark: #181818 (dark backgrounds, text)
 *    - brand-light: #fafafa (light backgrounds)
 *    - brand-gray: #6b7280 (secondary text)
 *    - brand-accent: #3b82f6 (primary accent - blue)
 *    - brand-success: #10b981 (success states - green)
 *    - brand-warning: #f59e0b (warning states - amber)
 *    - brand-error: #ef4444 (error states - red)
 *
 * 4. FONTS:
 *    - font-sans: Inter (default body text)
 *    - font-heading: Inter with font-semibold or font-bold
 *
 * =============================================================================
 */

/* Base layer customizations */
@layer base {
  body {
    @apply bg-white text-gray-900 antialiased;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-semibold text-gray-900;
  }

  a {
    @apply text-brand-accent hover:text-blue-700 transition-colors;
  }
}

/* Component layer - reusable component styles */
@layer components {
  .btn-primary {
    @apply px-4 py-2 bg-brand-accent text-white rounded-lg hover:bg-blue-700 transition-colors font-medium;
  }

  .btn-secondary {
    @apply px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition-colors font-medium;
  }

  .card {
    @apply bg-white rounded-xl shadow-sm border border-gray-200 p-6;
  }

  .input-field {
    @apply w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent;
  }
}

/* Utilities layer - custom utilities */
@layer utilities {
  .transition-base {
    @apply transition-all duration-200 ease-in-out;
  }
}

/* Dark mode support */
.dark body {
  @apply bg-brand-dark text-white;
}

.dark h1, .dark h2, .dark h3, .dark h4, .dark h5, .dark h6 {
  @apply text-white;
}`,
      fileType: 'css',
      type: 'css',
      size: 0,
      isDirectory: false
    },
    {
      name: 'layout.tsx',
      path: 'src/app/layout.tsx',
      content: `import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Next.js App',
  description: 'Built with Next.js and Tailwind CSS',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* PiPilot Console Bridge - Captures console logs for preview panel */}
        <script dangerouslySetInnerHTML={{ __html: \`
          (function() {
            window.__PIPILOT_EARLY_ERRORS__ = [];
            window.onerror = function(msg, url, line, col, error) {
              var errorData = { __isError: true, name: error?.name || 'Error', message: msg, stack: error?.stack || ('at ' + url + ':' + line + ':' + col) };
              window.__PIPILOT_EARLY_ERRORS__.push(errorData);
              try {
                window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: 'error', data: [errorData], timestamp: new Date().toISOString(), id: 'error-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*');
              } catch(e) {}
              return false;
            };
            window.onunhandledrejection = function(event) {
              var errorData = { __isError: true, name: 'UnhandledPromiseRejection', message: String(event.reason), stack: event.reason?.stack || '' };
              window.__PIPILOT_EARLY_ERRORS__.push(errorData);
              try {
                window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: 'error', data: [errorData], timestamp: new Date().toISOString(), id: 'rejection-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*');
              } catch(e) {}
            };
            var originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
            function sendToParent(method, args) {
              try {
                var serializedArgs = Array.prototype.slice.call(args).map(function(arg) {
                  if (arg instanceof Error) return { __isError: true, name: arg.name, message: arg.message, stack: arg.stack };
                  try { return JSON.parse(JSON.stringify(arg)); } catch(e) { return String(arg); }
                });
                window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: method, data: serializedArgs, timestamp: new Date().toISOString(), id: method + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*');
              } catch(e) {}
            }
            console.log = function() { originalConsole.log.apply(console, arguments); sendToParent('log', arguments); };
            console.warn = function() { originalConsole.warn.apply(console, arguments); sendToParent('warn', arguments); };
            console.error = function() { originalConsole.error.apply(console, arguments); sendToParent('error', arguments); };
            console.info = function() { originalConsole.info.apply(console, arguments); sendToParent('info', arguments); };
            console.debug = function() { originalConsole.debug.apply(console, arguments); sendToParent('debug', arguments); };
            setTimeout(function() { window.__PIPILOT_EARLY_ERRORS__.forEach(function(err) { sendToParent('error', [err]); }); }, 100);
          })();
        \` }} />

        {/* Google Fonts Preconnect */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Google Fonts - Common font families */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Open+Sans:wght@300;400;500;600;700&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased">
        {children}
        {/* Visual Editor Client - enables visual editing when loaded in pipilot.dev iframe */}
        <Script src="/visual-editor-client.js" strategy="afterInteractive" />
      </body>
    </html>
  )
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'page.tsx',
      path: 'src/app/page.tsx',
      content: `import Link from 'next/link'

export default function Home() {
  const features = [
    {
      icon: '⚡',
      title: 'Server Components',
      description: 'Next.js 14 with React Server Components for optimal performance and SEO.'
    },
    {
      icon: '🎨',
      title: 'Tailwind CSS',
      description: 'Utility-first CSS framework loaded via CDN for rapid UI development.'
    },
    {
      icon: '📦',
      title: 'App Router',
      description: 'File-based routing with layouts, loading states, and error handling.'
    },
    {
      icon: '📱',
      title: 'Responsive',
      description: 'Mobile-first design that looks great on any device or screen size.'
    },
    {
      icon: '🔧',
      title: 'TypeScript',
      description: 'Full TypeScript support for type-safe development and better DX.'
    },
    {
      icon: '🚀',
      title: 'Production Ready',
      description: 'Optimized build configuration ready for deployment anywhere.'
    }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <header className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
        <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold">MyApp</div>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-blue-200 transition-colors">Home</Link>
            <Link href="/about" className="hover:text-blue-200 transition-colors">About</Link>
            <Link href="/contact" className="hover:text-blue-200 transition-colors">Contact</Link>
          </div>
        </nav>

        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Build Amazing Apps
          </h1>
          <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-2xl mx-auto">
            A modern Next.js starter template with TypeScript and Tailwind CSS.
            Start building your next project in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-4 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors shadow-lg">
              Get Started
            </button>
            <button className="px-8 py-4 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-400 transition-colors border border-blue-400">
              Learn More
            </button>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-800 mb-4">
          Everything You Need
        </h2>
        <p className="text-gray-600 text-center mb-12 max-w-2xl mx-auto">
          This template comes with all the tools and configurations you need to build modern web applications.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {feature.title}
              </h3>
              <p className="text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-800 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-gray-300 mb-8 max-w-xl mx-auto">
            Start building your application today. Edit the files in src/app/ to customize this template.
          </p>
          <button className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Start Building
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="container mx-auto px-4 text-center">
          <p>Built with Next.js + Tailwind CSS</p>
          <p className="mt-2 text-sm">© 2025 MyApp. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'loading.tsx',
      path: 'src/app/loading.tsx',
      content: `export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="w-16 h-16 relative">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
          {/* Spinning ring */}
          <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
        </div>
        <p className="text-gray-600 text-sm animate-pulse">Loading...</p>
      </div>
    </div>
  )
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'not-found.tsx',
      path: 'src/app/not-found.tsx',
      content: `import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        {/* 404 Number */}
        <div className="relative">
          <h1 className="text-[150px] md:text-[200px] font-bold text-gray-200 select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl animate-bounce">
              🔍
            </div>
          </div>
        </div>

        {/* Message */}
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mt-4">
          Page Not Found
        </h2>
        <p className="text-gray-600 mt-2 max-w-md mx-auto">
          Oops! The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go Home
          </Link>
        </div>

        {/* Decorative dots */}
        <div className="flex justify-center gap-2 mt-12">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  )
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'next.svg',
      path: 'public/next.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 394 80"><path fill="#000" d="m262 0h68l-26.5 37.5L262 75V0Z"/><path fill="#000" fill-rule="evenodd" d="M149 0v75h29V0h-29Zm-20 0H80v75h49V0Z" clip-rule="evenodd"/><path fill="#000" d="M0 0h49v75H0V0Zm100 0h49v75h-49V0Z"/><path fill="#000" fill-rule="evenodd" d="M68 0v75h29V0H68Z" clip-rule="evenodd"/><circle cx="225" cy="37" r="15" fill="#fff"/><circle cx="225" cy="37" r="7" fill="#000"/><path fill="#000" d="m262 0h68l-26.5 37.5L262 75V0Z"/><path fill="#000" fill-rule="evenodd" d="M149 0v75h29V0h-29Zm-20 0H80v75h49V0Z" clip-rule="evenodd"/><path fill="#000" d="M0 0h49v75H0V0Zm100 0h49v75h-49V0Z"/><path fill="#000" fill-rule="evenodd" d="M68 0v75h29V0H68Z" clip-rule="evenodd"/><circle cx="225" cy="37" r="15" fill="#fff"/><circle cx="225" cy="37" r="7" fill="#000"/></svg>`,
      fileType: 'svg',
      type: 'svg',
      size: 0,
      isDirectory: false
    },
    {
      name: 'vercel.svg',
      path: 'public/vercel.svg',
      content: `<svg height="18" viewBox="0 0 284 65" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m141.04 16.005c-11.37 11.37-28.5 11.37-39.87 0L16.04 16.005C4.67 27.375 4.67 44.505 16.04 55.875L16.04 55.875C27.41 67.245 44.54 67.245 55.91 55.875L141.04 55.875C152.41 67.245 169.54 67.245 180.91 55.875L267.04 55.875C278.41 67.245 295.54 67.245 306.91 55.875L306.91 55.875C318.28 44.505 318.28 27.375 306.91 16.005L267.04 16.005C255.67 4.635 238.54 4.635 227.17 16.005L141.04 16.005Z" fill="black"/><path d="m141.04 16.005c-11.37 11.37-28.5 11.37-39.87 0L16.04 16.005C4.67 27.375 4.67 44.505 16.04 55.875L16.04 55.875C27.41 67.245 44.54 67.245 55.91 55.875L141.04 55.875C152.41 67.245 169.54 67.245 180.91 55.875L267.04 55.875C278.41 67.245 295.54 67.245 306.91 55.875L306.91 55.875C318.28 44.505 318.28 27.375 306.91 16.005L267.04 16.005C255.67 4.635 238.54 4.635 227.17 16.005L141.04 16.005Z" fill="black"/><path d="m141.04 16.005c-11.37 11.37-28.5 11.37-39.87 0L16.04 16.005C4.67 27.375 4.67 44.505 16.04 55.875L16.04 55.875C27.41 67.245 44.54 67.245 55.91 55.875L141.04 55.875C152.41 67.245 169.54 67.245 180.91 55.875L267.04 55.875C278.41 67.245 295.54 67.245 306.91 55.875L306.91 55.875C318.28 44.505 318.28 27.375 306.91 16.005L267.04 16.005C255.67 4.635 238.54 4.635 227.17 16.005L141.04 16.005Z" fill="black"/></svg>`,
      fileType: 'svg',
      type: 'svg',
      size: 0,
      isDirectory: false
    },
    {
      name: 'visual-editor-client.js',
      path: 'public/visual-editor-client.js',
      content: `/**
 * Visual Editor Client - Embedded in production builds
 * Enables visual editing when the app is loaded in an iframe from pipilot.dev
 * Works with both development (E2B) and production (Supabase/Vercel hosting) scenarios
 */
(function() {
  'use strict';

  // Only run in iframe context
  if (window === window.parent) {
    console.log('[VE-Client] Not in iframe, skipping initialization');
    return;
  }

  // Allowed parent origins for security
  // Supports: pipilot.dev main site, *.pipilot.dev subdomains, *.e2b.app E2B URLs, localhost
  const ALLOWED_ORIGINS = [
    'https://pipilot.dev',
    'https://www.pipilot.dev',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
  ];

  // Check if origin is allowed (supports wildcards for subdomains)
  function isAllowedOrigin(origin) {
    if (!origin) return false;
    // Exact match
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    // *.pipilot.dev subdomains (e.g., code-lens-stream.pipilot.dev)
    if (origin.endsWith('.pipilot.dev')) return true;
    // *.e2b.app URLs (e.g., 3000-ikmd9ltiykjsfg57q5pf3.e2b.app)
    if (origin.endsWith('.e2b.app')) return true;
    return false;
  }

  // ============================================
  // CONSOLE CAPTURE - Intercept and forward browser console logs
  // Compatible with console-feed library format
  // ============================================
  (function setupConsoleCapture() {
    var originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
      table: console.table,
      clear: console.clear,
      time: console.time,
      timeEnd: console.timeEnd,
      count: console.count,
      assert: console.assert
    };

    // Serialize an argument for cross-origin transfer
    // This creates a format compatible with console-feed
    function serializeArg(arg, depth) {
      if (depth === undefined) depth = 0;
      if (depth > 5) return { type: 'string', value: '[Max depth reached]' };

      if (arg === null) return { type: 'null', value: null };
      if (arg === undefined) return { type: 'undefined', value: undefined };

      var type = typeof arg;

      if (type === 'string') return { type: 'string', value: arg };
      if (type === 'number') {
        if (isNaN(arg)) return { type: 'number', value: 'NaN' };
        if (!isFinite(arg)) return { type: 'number', value: arg > 0 ? 'Infinity' : '-Infinity' };
        return { type: 'number', value: arg };
      }
      if (type === 'boolean') return { type: 'boolean', value: arg };
      if (type === 'symbol') return { type: 'symbol', value: arg.toString() };
      if (type === 'bigint') return { type: 'bigint', value: arg.toString() };
      if (type === 'function') return { type: 'function', value: arg.toString().substring(0, 200) };

      if (arg instanceof Error) {
        return {
          type: 'error',
          value: {
            name: arg.name,
            message: arg.message,
            stack: arg.stack
          }
        };
      }

      if (arg instanceof Date) {
        return { type: 'date', value: arg.toISOString() };
      }

      if (arg instanceof RegExp) {
        return { type: 'regexp', value: arg.toString() };
      }

      if (Array.isArray(arg)) {
        try {
          var arr = [];
          for (var i = 0; i < Math.min(arg.length, 100); i++) {
            arr.push(serializeArg(arg[i], depth + 1));
          }
          if (arg.length > 100) arr.push({ type: 'string', value: '... ' + (arg.length - 100) + ' more items' });
          return { type: 'array', value: arr };
        } catch (e) {
          return { type: 'string', value: '[Array]' };
        }
      }

      if (arg instanceof HTMLElement) {
        return {
          type: 'html',
          value: {
            tagName: arg.tagName.toLowerCase(),
            id: arg.id || undefined,
            className: arg.className || undefined,
            outerHTML: arg.outerHTML.substring(0, 500)
          }
        };
      }

      if (type === 'object') {
        try {
          var obj = {};
          var keys = Object.keys(arg).slice(0, 50);
          for (var j = 0; j < keys.length; j++) {
            var key = keys[j];
            obj[key] = serializeArg(arg[key], depth + 1);
          }
          return { type: 'object', value: obj };
        } catch (e) {
          return { type: 'string', value: '[Object]' };
        }
      }

      return { type: 'string', value: String(arg) };
    }

    function sendConsoleLog(method, args) {
      try {
        var argsArray = Array.prototype.slice.call(args);
        // Skip VE-Client's own logs to avoid noise
        if (argsArray.length > 0 && typeof argsArray[0] === 'string' && argsArray[0].indexOf('[VE-Client]') === 0) {
          return;
        }

        var serializedData = argsArray.map(function(arg) {
          return serializeArg(arg, 0);
        });

        window.parent.postMessage({
          type: 'BROWSER_CONSOLE_LOG',
          payload: {
            method: method,
            data: serializedData,
            timestamp: new Date().toISOString(),
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9)
          }
        }, '*');
      } catch (e) {
        // Silently fail if postMessage fails
      }
    }

    console.log = function() {
      sendConsoleLog('log', arguments);
      originalConsole.log.apply(console, arguments);
    };

    console.warn = function() {
      sendConsoleLog('warn', arguments);
      originalConsole.warn.apply(console, arguments);
    };

    console.error = function() {
      sendConsoleLog('error', arguments);
      originalConsole.error.apply(console, arguments);
    };

    console.info = function() {
      sendConsoleLog('info', arguments);
      originalConsole.info.apply(console, arguments);
    };

    console.debug = function() {
      sendConsoleLog('debug', arguments);
      originalConsole.debug.apply(console, arguments);
    };

    console.table = function() {
      sendConsoleLog('table', arguments);
      originalConsole.table.apply(console, arguments);
    };

    console.clear = function() {
      sendConsoleLog('clear', []);
      originalConsole.clear.apply(console, arguments);
    };

    console.time = function(label) {
      sendConsoleLog('time', [label || 'default']);
      originalConsole.time.apply(console, arguments);
    };

    console.timeEnd = function(label) {
      sendConsoleLog('timeEnd', [label || 'default']);
      originalConsole.timeEnd.apply(console, arguments);
    };

    console.count = function(label) {
      sendConsoleLog('count', [label || 'default']);
      originalConsole.count.apply(console, arguments);
    };

    console.assert = function(assertion) {
      if (!assertion) {
        var args = Array.prototype.slice.call(arguments, 1);
        args.unshift('Assertion failed:');
        sendConsoleLog('assert', args);
      }
      originalConsole.assert.apply(console, arguments);
    };

    // Capture unhandled errors
    window.addEventListener('error', function(event) {
      sendConsoleLog('error', [{
        name: 'UncaughtError',
        message: event.message,
        stack: 'at ' + event.filename + ':' + event.lineno + ':' + event.colno
      }]);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
      var reason = event.reason;
      if (reason instanceof Error) {
        sendConsoleLog('error', [reason]);
      } else {
        sendConsoleLog('error', ['Unhandled Promise Rejection:', reason]);
      }
    });
  })();

  // State
  let isEnabled = false;
  let selectedElements = new Map();
  let hoveredElement = null;
  let hoverOverlay = null;
  let selectionOverlays = new Map();
  let elementIdCounter = 1;
  const elementIdMap = new WeakMap();

  // Generate unique element ID using DOM path
  function generateElementId(element) {
    if (elementIdMap.has(element)) {
      return elementIdMap.get(element);
    }
    
    // Check for existing data-ve-id (from build-time plugin)
    const existingId = element.getAttribute('data-ve-id');
    if (existingId) {
      elementIdMap.set(element, existingId);
      return existingId;
    }
    
    // Generate DOM path-based ID for production
    const path = getDOMPath(element);
    const id = 've-' + path;
    element.setAttribute('data-ve-id', id);
    elementIdMap.set(element, id);
    return id;
  }

  // Get DOM path for element identification
  function getDOMPath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += '#' + current.id;
        path.unshift(selector);
        break;
      }
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\\s+/).slice(0, 2).join('.');
        if (classes) selector += '.' + classes;
      }
      
      // Add index if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current);
          selector += ':nth(' + index + ')';
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join('>');
  }

  // Get computed styles for an element
  function getComputedStyleInfo(element) {
    const computed = window.getComputedStyle(element);
    return {
      display: computed.display,
      position: computed.position,
      flexDirection: computed.flexDirection,
      justifyContent: computed.justifyContent,
      alignItems: computed.alignItems,
      gap: computed.gap,
      marginTop: computed.marginTop,
      marginRight: computed.marginRight,
      marginBottom: computed.marginBottom,
      marginLeft: computed.marginLeft,
      paddingTop: computed.paddingTop,
      paddingRight: computed.paddingRight,
      paddingBottom: computed.paddingBottom,
      paddingLeft: computed.paddingLeft,
      width: computed.width,
      height: computed.height,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      borderRadius: computed.borderRadius,
    };
  }

  // Check if element should be ignored
  function shouldIgnoreElement(element) {
    if (!element || element.nodeType !== 1) return true;
    const ignoreTags = ['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'HTML', 'NOSCRIPT'];
    if (ignoreTags.includes(element.tagName)) return true;
    if (element.closest('[data-ve-overlay]')) return true;
    const computed = window.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden') return true;
    return false;
  }

  // Get element info for parent
  function getElementInfo(element) {
    if (shouldIgnoreElement(element)) return null;
    
    const id = generateElementId(element);
    const rect = element.getBoundingClientRect();
    const sourceFile = element.getAttribute('data-ve-file');
    const sourceLine = element.getAttribute('data-ve-line');
    
    // Get only the FIRST direct text node content to prevent duplication
    let textContent = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        textContent = node.textContent.trim();
        break;
      }
    }
    
    return {
      id,
      tagName: element.tagName,
      textContent: textContent,
      className: element.className || '',
      computedStyles: getComputedStyleInfo(element),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      sourceFile: sourceFile || undefined,
      sourceLine: sourceLine ? parseInt(sourceLine, 10) : undefined,
    };
  }

  // Send message to parent with origin check
  function sendToParent(message) {
    try {
      window.parent.postMessage(message, '*');
    } catch (e) {
      console.warn('[VE-Client] Failed to send message:', e);
    }
  }

  // Create overlay element
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-ve-overlay', 'true');
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;box-sizing:border-box;transition:all 0.1s ease;';
    document.body.appendChild(overlay);
    return overlay;
  }

  // Update overlay position and style
  function updateOverlay(overlay, rect, type) {
    if (!overlay) return;
    const isHover = type === 'hover';
    const color = isHover ? 'rgba(59,130,246,0.5)' : 'rgba(37,99,235,0.7)';
    const bg = isHover ? 'rgba(59,130,246,0.05)' : 'rgba(37,99,235,0.05)';
    overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:999999;box-sizing:border-box;' +
      'top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;' +
      'border:2px solid ' + color + ';background:' + bg + ';transition:all 0.1s ease;';
  }

  // Remove overlay
  function removeOverlay(overlay) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  // Find element by ID
  function findElementById(id) {
    return document.querySelector('[data-ve-id="' + id + '"]');
  }

  // Clear all selections
  function clearSelection() {
    selectedElements.clear();
    selectionOverlays.forEach(removeOverlay);
    selectionOverlays.clear();
  }

  // Event Handlers
  function handleMouseMove(e) {
    if (!isEnabled) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || shouldIgnoreElement(element)) {
      if (hoveredElement) {
        hoveredElement = null;
        removeOverlay(hoverOverlay);
        hoverOverlay = null;
        sendToParent({ type: 'ELEMENT_HOVERED', payload: { element: null } });
      }
      return;
    }
    
    const elementId = generateElementId(element);
    if (hoveredElement !== element && !selectedElements.has(elementId)) {
      hoveredElement = element;
      if (!hoverOverlay) hoverOverlay = createOverlay();
      updateOverlay(hoverOverlay, element.getBoundingClientRect(), 'hover');
      sendToParent({ type: 'ELEMENT_HOVERED', payload: { element: getElementInfo(element) } });
    }
  }

  function handleClick(e) {
    if (!isEnabled) return;
    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || shouldIgnoreElement(element)) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const elementId = generateElementId(element);
    const isMultiSelect = e.ctrlKey || e.metaKey;
    
    if (isMultiSelect) {
      if (selectedElements.has(elementId)) {
        selectedElements.delete(elementId);
        removeOverlay(selectionOverlays.get(elementId));
        selectionOverlays.delete(elementId);
        sendToParent({ type: 'ELEMENT_DESELECTED', payload: { elementId } });
      } else {
        selectedElements.set(elementId, element);
        const overlay = createOverlay();
        selectionOverlays.set(elementId, overlay);
        updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
        sendToParent({ type: 'ELEMENT_SELECTED', payload: { elements: [getElementInfo(element)], isMultiSelect: true } });
      }
    } else {
      clearSelection();
      selectedElements.set(elementId, element);
      const overlay = createOverlay();
      selectionOverlays.set(elementId, overlay);
      updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
      sendToParent({ type: 'ELEMENT_SELECTED', payload: { elements: [getElementInfo(element)], isMultiSelect: false } });
    }
    
    if (hoverOverlay) { removeOverlay(hoverOverlay); hoverOverlay = null; }
    hoveredElement = null;
  }

  function handleKeyDown(e) {
    if (!isEnabled) return;
    if (e.key === 'Escape') {
      clearSelection();
      sendToParent({ type: 'CLEAR_SELECTION', payload: {} });
    }
  }

  function handleScroll() {
    selectionOverlays.forEach(function(overlay, elementId) {
      const element = findElementById(elementId);
      if (element) updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
    });
    if (hoverOverlay && hoveredElement) {
      updateOverlay(hoverOverlay, hoveredElement.getBoundingClientRect(), 'hover');
    }
  }

  // Load a Google Font dynamically
  function loadGoogleFont(fontFamily) {
    // Skip system fonts
    var systemFonts = ['system-ui', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'sans-serif', 'serif', 'monospace'];
    if (systemFonts.some(function(sf) { return fontFamily.toLowerCase().includes(sf.toLowerCase()); })) {
      return;
    }
    
    // Clean font name (remove fallbacks like "Inter, sans-serif")
    var cleanFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '');
    if (!cleanFont) return;
    
    // Check if already loaded
    var fontId = 'google-font-' + cleanFont.replace(/\\s+/g, '-').toLowerCase();
    if (document.getElementById(fontId)) {
      console.log('[VE-Client] Font already loaded:', cleanFont);
      return;
    }
    
    // Create link element
    var link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(cleanFont) + ':wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
    console.log('[VE-Client] Loaded Google Font:', cleanFont);
  }

  // Apply style changes from parent
  function applyStyleChanges(elementId, changes) {
    const element = findElementById(elementId);
    if (!element) return false;
    changes.forEach(function(change) {
      const prop = change.property.replace(/([A-Z])/g, '-\$1').toLowerCase();
      
      // If it's a font-family change, load the Google Font first
      if (prop === 'font-family') {
        loadGoogleFont(change.newValue);
      }
      
      element.style.setProperty(prop, change.newValue);
    });
    const overlay = selectionOverlays.get(elementId);
    if (overlay) updateOverlay(overlay, element.getBoundingClientRect(), 'selected');
    sendToParent({ type: 'STYLE_APPLIED', payload: { elementId, success: true } });
    return true;
  }

  // Update text content from parent
  function updateTextContent(elementId, text) {
    const element = findElementById(elementId);
    if (!element) return false;
    
    // Find and update only the FIRST text node to prevent duplication
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent = text;
        sendToParent({ type: 'TEXT_UPDATED', payload: { elementId, success: true } });
        return true;
      }
    }
    
    // If no text node exists, prepend one for elements with children
    if (element.children.length > 0) {
      element.insertBefore(document.createTextNode(text), element.firstChild);
      sendToParent({ type: 'TEXT_UPDATED', payload: { elementId, success: true } });
      return true;
    }
    
    // For simple elements with no children, set textContent directly
    element.textContent = text;
    sendToParent({ type: 'TEXT_UPDATED', payload: { elementId, success: true } });
    return true;
  }

  // Message handler
  function handleMessage(event) {
    // Security: Only allow messages from known origins
    if (!isAllowedOrigin(event.origin)) {
      return;
    }
    
    var message = event.data;
    if (!message || !message.type) return;
    
    switch (message.type) {
      case 'VISUAL_EDITOR_INIT':
      case 'VISUAL_EDITOR_TOGGLE':
        isEnabled = message.payload.enabled;
        if (!isEnabled) {
          clearSelection();
          if (hoverOverlay) { removeOverlay(hoverOverlay); hoverOverlay = null; }
          hoveredElement = null;
        }
        document.body.style.cursor = isEnabled ? 'crosshair' : '';
        sendToParent({ type: 'VISUAL_EDITOR_READY', payload: { enabled: isEnabled } });
        break;
      case 'CLEAR_SELECTION':
        clearSelection();
        break;
      case 'APPLY_STYLE':
        applyStyleChanges(message.payload.elementId, message.payload.changes);
        break;
      case 'UPDATE_TEXT':
        updateTextContent(message.payload.elementId, message.payload.text);
        break;
      case 'REQUEST_ELEMENT_INFO':
        var el = findElementById(message.payload.elementId);
        if (el) sendToParent({ type: 'ELEMENT_INFO_RESPONSE', payload: { element: getElementInfo(el) } });
        break;
      case 'APPLY_THEME_PREVIEW':
        console.log('[VE-Client] Received APPLY_THEME_PREVIEW message');
        applyThemePreview(message.payload.themeVars);
        break;
      case 'CLEAR_THEME_PREVIEW':
        console.log('[VE-Client] Received CLEAR_THEME_PREVIEW message');
        clearThemePreview();
        break;
      case 'DRAG_ELEMENT_START':
        console.log('[VE-Client] Received DRAG_ELEMENT_START message');
        startDragMode(message.payload.elementType, message.payload.content);
        break;
      case 'DRAG_ELEMENT_END':
        console.log('[VE-Client] Received DRAG_ELEMENT_END message');
        endDragMode();
        break;
      case 'INSERT_ELEMENT':
        console.log('[VE-Client] Received INSERT_ELEMENT message');
        insertElement(message.payload.content, message.payload.targetElementId, message.payload.position);
        break;
    }
  }

  // Apply theme preview - set CSS variables directly on :root (like thmeswitcher.html)
  function applyThemePreview(themeVars) {
    console.log('[VE-Client] applyThemePreview called with vars:', themeVars ? Object.keys(themeVars).length + ' variables' : 'null');
    
    if (!themeVars || typeof themeVars !== 'object') {
      console.warn('[VE-Client] No theme variables provided');
      return;
    }
    
    // Apply CSS variables directly to :root using setProperty (same as thmeswitcher.html)
    var root = document.documentElement;
    var appliedCount = 0;
    var backgroundValue = null;
    
    Object.entries(themeVars).forEach(function(entry) {
      var key = entry[0];
      var value = entry[1];
      root.style.setProperty(key, value);
      appliedCount++;
      
      // Track background for direct application
      if (key === '--background') {
        backgroundValue = value;
      }
      
      // Log first few for debugging
      if (appliedCount <= 5) {
        console.log('[VE-Client] Set', key, '=', value);
      }
    });
    
    // Also apply background directly to body as fallback for apps that don't use CSS variables
    if (backgroundValue) {
      document.body.style.backgroundColor = 'hsl(' + backgroundValue + ')';
      console.log('[VE-Client] Also set body background to:', 'hsl(' + backgroundValue + ')');
    }
    
    // Verify the variables were set
    var testVar = root.style.getPropertyValue('--background');
    console.log('[VE-Client] Verification: --background =', testVar);
    console.log('[VE-Client] Root style attribute length:', root.getAttribute('style') ? root.getAttribute('style').length : 0);
    
    console.log('[VE-Client] Theme preview applied via setProperty,', appliedCount, 'CSS variables set');
    sendToParent({ type: 'THEME_PREVIEW_APPLIED', payload: { success: true, varsCount: appliedCount } });
  }

  // Clear theme preview - remove CSS variables from :root
  function clearThemePreview() {
    var root = document.documentElement;
    var computedStyle = window.getComputedStyle(root);
    var propsToRemove = [];
    
    // Collect all CSS custom properties
    for (var i = 0; i < root.style.length; i++) {
      var prop = root.style[i];
      if (prop.startsWith('--')) {
        propsToRemove.push(prop);
      }
    }
    
    // Remove them
    propsToRemove.forEach(function(prop) {
      root.style.removeProperty(prop);
    });
    
    console.log('[VE-Client] Theme preview cleared, removed', propsToRemove.length, 'CSS variables');
    sendToParent({ type: 'THEME_PREVIEW_CLEARED', payload: { success: true } });
  }

  // ============================================
  // DRAG AND DROP FUNCTIONS
  // ============================================
  var isDraggingElement = false;
  var dragElementType = null;
  var dragElementContent = null;
  var dropTargetOverlay = null;
  var currentDropTarget = null;
  var dropPosition = 'inside';

  function startDragMode(elementType, content) {
    isDraggingElement = true;
    dragElementType = elementType;
    dragElementContent = content;
    document.body.style.cursor = 'copy';
    
    // Create drop target overlay
    if (!dropTargetOverlay) {
      dropTargetOverlay = document.createElement('div');
      dropTargetOverlay.setAttribute('data-ve-overlay', 'true');
      dropTargetOverlay.id = 've-drop-overlay';
      dropTargetOverlay.style.cssText = 'position: fixed; pointer-events: none; z-index: 999998; box-sizing: border-box; border: 2px dashed #22c55e; background: rgba(34, 197, 94, 0.1); display: none;';
      document.body.appendChild(dropTargetOverlay);
    }
    
    // Add drag-specific event listeners
    document.addEventListener('mousemove', handleDragMove, true);
    document.addEventListener('click', handleDrop, true);
    document.addEventListener('keydown', handleDragKeyDown, true);
    
    console.log('[VE-Client] Drag mode started:', elementType);
    sendToParent({ type: 'DRAG_MODE_STARTED', payload: { elementType: elementType } });
  }

  function endDragMode() {
    isDraggingElement = false;
    dragElementType = null;
    dragElementContent = null;
    currentDropTarget = null;
    document.body.style.cursor = isEnabled ? 'crosshair' : '';
    
    // Hide drop overlay
    if (dropTargetOverlay) {
      dropTargetOverlay.style.display = 'none';
    }
    
    // Remove drag event listeners
    document.removeEventListener('mousemove', handleDragMove, true);
    document.removeEventListener('click', handleDrop, true);
    document.removeEventListener('keydown', handleDragKeyDown, true);
    
    console.log('[VE-Client] Drag mode ended');
  }

  function handleDragMove(event) {
    if (!isDraggingElement) return;
    
    var target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || shouldIgnoreElement(target)) {
      if (dropTargetOverlay) dropTargetOverlay.style.display = 'none';
      currentDropTarget = null;
      return;
    }
    
    // Find valid drop container
    var foundDropTarget = findDropTarget(target);
    if (!foundDropTarget) {
      if (dropTargetOverlay) dropTargetOverlay.style.display = 'none';
      currentDropTarget = null;
      return;
    }
    
    currentDropTarget = foundDropTarget;
    
    // Determine drop position based on mouse position
    var rect = foundDropTarget.getBoundingClientRect();
    var mouseY = event.clientY;
    var relativeY = (mouseY - rect.top) / rect.height;
    
    if (relativeY < 0.25) {
      dropPosition = 'before';
    } else if (relativeY > 0.75) {
      dropPosition = 'after';
    } else {
      dropPosition = 'inside';
    }
    
    // Update drop overlay
    if (dropTargetOverlay) {
      dropTargetOverlay.style.display = 'block';
      
      if (dropPosition === 'before') {
        dropTargetOverlay.style.left = rect.left + 'px';
        dropTargetOverlay.style.top = (rect.top - 2) + 'px';
        dropTargetOverlay.style.width = rect.width + 'px';
        dropTargetOverlay.style.height = '4px';
        dropTargetOverlay.style.background = '#22c55e';
        dropTargetOverlay.style.border = 'none';
      } else if (dropPosition === 'after') {
        dropTargetOverlay.style.left = rect.left + 'px';
        dropTargetOverlay.style.top = (rect.bottom - 2) + 'px';
        dropTargetOverlay.style.width = rect.width + 'px';
        dropTargetOverlay.style.height = '4px';
        dropTargetOverlay.style.background = '#22c55e';
        dropTargetOverlay.style.border = 'none';
      } else {
        dropTargetOverlay.style.left = rect.left + 'px';
        dropTargetOverlay.style.top = rect.top + 'px';
        dropTargetOverlay.style.width = rect.width + 'px';
        dropTargetOverlay.style.height = rect.height + 'px';
        dropTargetOverlay.style.background = 'rgba(34, 197, 94, 0.1)';
        dropTargetOverlay.style.border = '2px dashed #22c55e';
      }
    }
  }

  function findDropTarget(element) {
    var validContainers = ['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'FORM', 'UL', 'OL', 'BODY'];
    
    var current = element;
    while (current && current !== document.body) {
      if (validContainers.indexOf(current.tagName) !== -1 && !current.hasAttribute('data-ve-overlay')) {
        return current;
      }
      current = current.parentElement;
    }
    
    return document.body;
  }

  function handleDrop(event) {
    if (!isDraggingElement || !currentDropTarget || !dragElementContent) {
      endDragMode();
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    // Parse the JSX content and create HTML element
    var htmlContent = jsxToHtml(dragElementContent);
    
    // Create a temporary container to parse the HTML
    var temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    var newElement = temp.firstElementChild;
    
    if (!newElement) {
      console.warn('[VE-Client] Failed to create element');
      endDragMode();
      return;
    }
    
    // Generate unique ID for the new element
    var elementId = 've-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    newElement.setAttribute('data-ve-id', elementId);
    
    // Insert element based on position
    if (dropPosition === 'before') {
      currentDropTarget.parentNode.insertBefore(newElement, currentDropTarget);
    } else if (dropPosition === 'after') {
      currentDropTarget.parentNode.insertBefore(newElement, currentDropTarget.nextSibling);
    } else {
      currentDropTarget.appendChild(newElement);
    }
    
    // Notify parent about the insertion
    sendToParent({
      type: 'ELEMENT_INSERTED',
      payload: {
        elementId: elementId,
        content: dragElementContent,
        position: dropPosition,
        parentTag: currentDropTarget.tagName
      }
    });
    
    console.log('[VE-Client] Element inserted:', elementId, 'position:', dropPosition);
    
    endDragMode();
  }

  function handleDragKeyDown(event) {
    if (event.key === 'Escape') {
      endDragMode();
      sendToParent({ type: 'DRAG_CANCELLED', payload: {} });
    }
  }

  function jsxToHtml(jsx) {
    if (!jsx) return '';
    
    return jsx
      .replace(/className=/g, 'class=')
      .replace(/htmlFor=/g, 'for=')
      .replace(/\\{[^}]*\\}/g, '')
      .replace(/<(\\w+)([^>]*)\\/>/g, '<$1$2></$1>')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function insertElement(content, targetElementId, position) {
    var target = targetElementId ? findElementById(targetElementId) : document.body;
    if (!target) {
      target = document.body;
    }
    
    var htmlContent = jsxToHtml(content);
    var temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    var newElement = temp.firstElementChild;
    
    if (!newElement) {
      console.warn('[VE-Client] Failed to create element for insertion');
      return;
    }
    
    var elementId = 've-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    newElement.setAttribute('data-ve-id', elementId);
    
    if (position === 'before') {
      target.parentNode.insertBefore(newElement, target);
    } else if (position === 'after') {
      target.parentNode.insertBefore(newElement, target.nextSibling);
    } else {
      target.appendChild(newElement);
    }
    
    sendToParent({
      type: 'ELEMENT_INSERTED',
      payload: {
        elementId: elementId,
        content: content,
        position: position || 'inside'
      }
    });
    
    console.log('[VE-Client] Element inserted via INSERT_ELEMENT:', elementId);
  }

  // Initialize
  function init() {
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('message', handleMessage);
    
    // Notify parent we're ready
    sendToParent({ type: 'VISUAL_EDITOR_READY', payload: {} });
    console.log('[VE-Client] Initialized - waiting for parent commands');
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`,
      fileType: 'javascript',
      type: 'javascript',
      size: 0,
      isDirectory: false
    },
    // Simple components (no shadcn/ui dependencies)
    {
      name: 'Loading.tsx',
      path: 'src/components/Loading.tsx',
      content: `interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
}

export function Loading({ size = 'md', text }: LoadingProps) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16'
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={\`\${sizeClasses[size]} relative\`}>
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
      </div>
      {text && <p className="text-gray-600 text-sm animate-pulse">{text}</p>}
    </div>
  )
}

export function LoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loading size="lg" text="Loading..." />
    </div>
  )
}

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 shadow-xl">
        <Loading size="lg" text="Please wait..." />
      </div>
    </div>
  )
}`,
      fileType: 'tsx',
      type: 'tsx',
      size: 0,
      isDirectory: false
    },
    // Custom Hooks
    {
      name: 'useLocalStorage.ts',
      path: 'src/hooks/useLocalStorage.ts',
      content: `import { useState, useEffect } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Get from local storage then parse stored json or return initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      if (typeof window === 'undefined') {
        return initialValue
      }
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.log(error)
      return initialValue
    }
  })

  // Return a wrapped version of useState's setter function that persists the new value to localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.log(error)
    }
  }

  return [storedValue, setValue] as const
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useDebounce.ts',
      path: 'src/hooks/useDebounce.ts',
      content: `import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useOnClickOutside.ts',
      path: 'src/hooks/useOnClickOutside.ts',
      content: `import { useEffect, RefObject } from 'react'

export function useOnClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return
      }
      handler(event)
    }

    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)

    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler])
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useMediaQuery.ts',
      path: 'src/hooks/useMediaQuery.ts',
      content: `import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    if (media.matches !== matches) {
      setMatches(media.matches)
    }
    const listener = () => setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [matches, query])

  return matches
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useMobile.ts',
      path: 'src/hooks/useMobile.ts',
      content: `import { useState, useEffect } from 'react'

export function useMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false)

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    // Check on mount
    checkIsMobile()

    // Add event listener
    window.addEventListener('resize', checkIsMobile)

    // Cleanup
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [breakpoint])

  return isMobile
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useCopyToClipboard.ts',
      path: 'src/hooks/useCopyToClipboard.ts',
      content: `import { useState } from 'react'

export function useCopyToClipboard() {
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const copy = async (text: string) => {
    if (!navigator?.clipboard) {
      console.warn('Clipboard not supported')
      return false
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
      return true
    } catch (error) {
      console.warn('Copy failed', error)
      setCopiedText(null)
      return false
    }
  }

  return { copiedText, copy }
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useInterval.ts',
      path: 'src/hooks/useInterval.ts',
      content: `import { useEffect, useRef } from 'react'

export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) {
      return
    }

    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'usePrevious.ts',
      path: 'src/hooks/usePrevious.ts',
      content: `import { useRef, useEffect } from 'react'

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>()

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref.current
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useToggle.ts',
      path: 'src/hooks/useToggle.ts',
      content: `import { useState } from 'react'

export function useToggle(initialValue: boolean = false) {
  const [value, setValue] = useState<boolean>(initialValue)

  const toggle = () => setValue((prev) => !prev)
  const setTrue = () => setValue(true)
  const setFalse = () => setValue(false)

  return { value, toggle, setTrue, setFalse, setValue }
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useToast.ts',
      path: 'src/hooks/useToast.ts',
      content: `import { useState, useCallback } from 'react'

export interface ToastOptions {
  title?: string
  description?: string
  duration?: number
  variant?: 'default' | 'destructive' | 'success'
}

export interface ToastState {
  id: string
  title?: string
  description?: string
  variant: 'default' | 'destructive' | 'success'
  duration: number
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastState[]>([])

  const toast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: ToastState = {
      id,
      title: options.title,
      description: options.description,
      variant: options.variant || 'default',
      duration: options.duration || 4000,
    }

    setToasts((prev) => [...prev, newToast])

    // Auto remove after duration
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, newToast.duration)

    return id
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const success = useCallback((options: Omit<ToastOptions, 'variant'>) => {
    return toast({ ...options, variant: 'success' })
  }, [toast])

  const error = useCallback((options: Omit<ToastOptions, 'variant'>) => {
    return toast({ ...options, variant: 'destructive' })
  }, [toast])

  return {
    toasts,
    toast,
    success,
    error,
    dismiss,
  }
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useTheme.ts',
      path: 'src/hooks/useTheme.ts',
      content: `import { useState, useEffect, createContext, useContext } from 'react';

// Define theme types
type Theme = 'light' | 'dark' | 'system';

// Define context type
interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

// Create context with undefined default value
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme provider component (logic only - no JSX)
export function ThemeProviderLogic() {
  // Initialize theme state with localStorage or default to 'system'
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          return stored;
        }
      }
    } catch (error) {
      // Silently handle localStorage errors (non-breaking)
    }
    return 'system';
  });

  // Initialize resolved theme state
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const root = window.document.documentElement;

    const updateTheme = () => {
      try {
        let resolved: 'light' | 'dark' = 'dark';

        // Determine the resolved theme based on current theme setting
        if (theme === 'system') {
          resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } else {
          resolved = theme;
        }

        // Update state and apply theme classes
        setResolvedTheme(resolved);
        root.classList.remove('light', 'dark');
        root.classList.add(resolved);

        // Save theme to localStorage
        localStorage.setItem('theme', theme);
      } catch (error) {
        // Silently handle theme update errors (non-breaking)
      }
    };

    // Initial theme update
    updateTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        updateTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return { theme, setTheme, resolvedTheme };
}

// Custom hook for using theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Export context for provider implementation elsewhere
export { ThemeContext };`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'index.ts',
      path: 'src/hooks/index.ts',
      content: `export { useLocalStorage } from './useLocalStorage'
export { useDebounce } from './useDebounce'
export { useOnClickOutside } from './useOnClickOutside'
export { useMediaQuery } from './useMediaQuery'
export { useCopyToClipboard } from './useCopyToClipboard'
export { useInterval } from './useInterval'
export { usePrevious } from './usePrevious'
export { useToggle } from './useToggle'
export { useMobile } from './useMobile'
export { useToast } from './useToast'
export { useTheme } from './useTheme'`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
   
    // Add .env.local file for local environment variables (Next.js)
    {
      name: '.env.local',
      path: '.env.local',
      content: `# Local environment variables (not committed to git)
# Add your local environment variables here

# Pipilot API Key
# PIPILOT_API_KEY=sk_live_your_api_key_here

# Visual Editor - Enable source mapping for visual editing
# Set to 'true' to enable (adds data-ve-* attributes to JSX elements)
NEXT_PUBLIC_ENABLE_VISUAL_EDITOR=true

# This file is typically used for sensitive information
# and should be added to .gitignore
`,
      fileType: 'env',
      type: 'text',
      size: 0,
      isDirectory: false
    },
    {
      name: '.env.development',
      path: '.env.development',
      content: `# Development Environment Variables
NEXT_PUBLIC_ENABLE_DEBUG=true
NODE_ENV=development`,
      fileType: 'plaintext',
      type: 'plaintext',
      size: 0,
      isDirectory: false
    },
    {
      name: 'error.ts',
      path: 'src/types/error.ts',
      content: `export type ErrorType = 'error' | 'warn' | 'log' | 'info';
export type ErrorSource = 'console' | 'window' | 'unhandledRejection';

export interface CapturedError {
  id: string;
  type: ErrorType;
  message: string;
  stack?: string;
  source: ErrorSource;
  timestamp: number;
  context: ErrorContext;
  formattedForAI?: string;
}

export interface ErrorContext {
  url: string;
  userAgent: string;
  customData?: Record<string, any>;
}

export interface ErrorStore {
  errors: CapturedError[];
  selectedErrorId?: string;
  isOpen: boolean;
}

export interface ErrorStats {
  total: number;
  errors: number;
  warnings: number;
  logs: number;
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'errorService.ts',
      path: 'src/services/errorService.ts',
      content: `import { CapturedError, ErrorType, ErrorSource } from '../types/error';
import { generateErrorId, generateFormattedError } from './errorFormatter';

type ErrorListener = (error: CapturedError) => void;

class ErrorService {
  private errors: CapturedError[] = [];
  private listeners: ErrorListener[] = [];
  private maxErrors = 50;
  private errorIds = new Set<string>();
  private isDev = process.env.NODE_ENV === 'development';

  constructor() {
    if (!this.isDev || typeof window === 'undefined') {
      return;
    }

    this.setupGlobalErrorHandlers();
    this.setupConsoleInterceptors();
    this.setupUnhandledRejectionHandler();
  }

  private setupGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
      this.captureError(
        event.error?.message || 'Unknown error',
        event.error?.stack || '',
        'error',
        'window'
      );
    });
  }

  private setupConsoleInterceptors() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog.apply(console, args);
      this.captureConsoleMessage(args, 'log');
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      this.captureConsoleMessage(args, 'warn');
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      this.captureConsoleMessage(args, 'error');
    };
  }

  private setupUnhandledRejectionHandler() {
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError(
        event.reason?.message || String(event.reason),
        event.reason?.stack || '',
        'error',
        'unhandledRejection'
      );
    });
  }

  private captureConsoleMessage(args: any[], type: ErrorType) {
    const message = args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    this.captureError(message, '', type, 'console');
  }

  public captureError(
    message: string,
    stack: string = '',
    type: ErrorType = 'error',
    source: ErrorSource = 'console'
  ) {
    if (!this.isDev || typeof window === 'undefined') {
      return;
    }

    const errorId = generateErrorId(message, stack);

    if (this.errorIds.has(errorId)) {
      return;
    }

    this.errorIds.add(errorId);

    const error: CapturedError = {
      id: errorId,
      type,
      message,
      stack,
      source,
      timestamp: Date.now(),
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
      },
      formattedForAI: generateFormattedError({
        type,
        message,
        stack,
        url: window.location.href,
        timestamp: new Date().toLocaleString(),
      }),
    };

    this.errors.push(error);

    if (this.errors.length > this.maxErrors) {
      const removed = this.errors.shift();
      if (removed) {
        this.errorIds.delete(removed.id);
      }
    }

    this.listeners.forEach((listener) => listener(error));
  }

  public subscribe(listener: ErrorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public getErrors(): CapturedError[] {
    return [...this.errors];
  }

  public getErrorById(id: string): CapturedError | undefined {
    return this.errors.find((e) => e.id === id);
  }

  public clearErrors() {
    this.errors = [];
    this.errorIds.clear();
  }

  public getStats() {
    return {
      total: this.errors.length,
      errors: this.errors.filter((e) => e.type === 'error').length,
      warnings: this.errors.filter((e) => e.type === 'warn').length,
      logs: this.errors.filter((e) => e.type === 'log').length,
    };
  }
}

export const errorService = new ErrorService();`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'errorFormatter.ts',
      path: 'src/services/errorFormatter.ts',
      content: `export interface ErrorFormatInput {
  type: string;
  message: string;
  stack?: string;
  url?: string;
  timestamp?: string;
}

export function generateErrorId(message: string, stack: string): string {
  const combined = message + (stack || '');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return \`error-\${Math.abs(hash).toString(36)}\`;
}

export function generateFormattedError(input: ErrorFormatInput): string {
  const separator = '═'.repeat(50);

  let formatted = \`
🐛 RUNTIME ERROR REPORT
\${separator}

Type: \${input.type.toUpperCase()}
Message: \${input.message}
\`;

  if (input.stack) {
    formatted += \`
Stack Trace:
\${input.stack
  .split('\\n')
  .slice(0, 5)
  .map((line) => '  ' + line.trim())
  .join('\\n')}
\`;
  }

  if (input.url) {
    formatted += \`
URL: \${input.url}
\`;
  }

  if (input.timestamp) {
    formatted += \`
Time: \${input.timestamp}
\`;
  }

  formatted += \`
\${separator}
[Copy and paste this in ChatGPT for AI to fix]
\`;

  return formatted;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    try {
      textarea.select();
      document.execCommand('copy');
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'errorStore.ts',
      path: 'src/services/errorStore.ts',
      content: `import { CapturedError, ErrorStore } from '../types/error';

type StoreListener = (state: ErrorStore) => void;

class ErrorStoreManager {
  private store: ErrorStore = {
    errors: [],
    isOpen: false,
  };
  private listeners: StoreListener[] = [];

  subscribe(listener: StoreListener): () => void {
    this.listeners.push(listener);
    listener(this.store);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.store));
  }

  addError(error: CapturedError) {
    this.store.errors.push(error);
    if (this.store.errors.length > 50) {
      this.store.errors.shift();
    }
    this.notify();
  }

  setSelectedError(id?: string) {
    this.store.selectedErrorId = id;
    this.notify();
  }

  toggleOpen() {
    this.store.isOpen = !this.store.isOpen;
    this.notify();
  }

  setOpen(isOpen: boolean) {
    this.store.isOpen = isOpen;
    this.notify();
  }

  clearErrors() {
    this.store.errors = [];
    this.store.selectedErrorId = undefined;
    this.notify();
  }

  getState(): ErrorStore {
    return this.store;
  }
}

export const errorStore = new ErrorStoreManager();`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'useDebugger.ts',
      path: 'src/hooks/useDebugger.ts',
      content: `'use client'

import { useState, useEffect } from 'react';
import { CapturedError } from '../types/error';
import { errorService } from '../services/errorService';
import { errorStore } from '../services/errorStore';

export function useDebugger() {
  const [errors, setErrors] = useState<CapturedError[]>([]);
  const [selectedErrorId, setSelectedErrorId] = useState<string | undefined>();
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    const unsubscribeErrors = errorService.subscribe((error) => {
      setErrors((prev) => {
        const updated = [...prev, error];
        return updated.length > 50 ? updated.slice(-50) : updated;
      });
    });

    const unsubscribeStore = errorStore.subscribe((state) => {
      setErrors(state.errors);
      setSelectedErrorId(state.selectedErrorId);
      setIsOpen(state.isOpen);
    });

    setErrors(errorService.getErrors());

    return () => {
      unsubscribeErrors();
      unsubscribeStore();
    };
  }, []);

  const selectedError = errors.find((e) => e.id === selectedErrorId);

  return {
    errors,
    selectedError,
    selectedErrorId,
    isOpen,
    isMounted,
    setSelectedErrorId: (id?: string) => errorStore.setSelectedError(id),
    toggleOpen: () => errorStore.toggleOpen(),
    setOpen: (open: boolean) => errorStore.setOpen(open),
    clearErrors: () => {
      errorService.clearErrors();
      errorStore.clearErrors();
    },
    stats: errorService.getStats(),
  };
}`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'DebugBubble.tsx',
      path: 'src/components/DebugBubble.tsx',
      content: `'use client'

import React from 'react';
import { useDebugger } from '../hooks/useDebugger';

export const DebugBubble = () => {
  const { stats, toggleOpen, isOpen, isMounted } = useDebugger();

  if (!isMounted || (stats.total === 0 && !isOpen)) {
    return null;
  }

  const hasErrors = stats.errors > 0;
  const bgColor = hasErrors
    ? 'bg-red-500 hover:bg-red-600'
    : stats.warnings > 0
      ? 'bg-yellow-500 hover:bg-yellow-600'
      : 'bg-blue-500 hover:bg-blue-600';

  return (
    <button
      onClick={toggleOpen}
      className={\`fixed bottom-6 right-6 w-14 h-14 \${bgColor} text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-50 font-bold text-sm\`}
      aria-label="Open debug panel"
      title={\`Errors: \${stats.errors}, Warnings: \${stats.warnings}, Logs: \${stats.logs}\`}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-lg">🐛</span>
        <span className="text-xs">\${stats.total}</span>
      </div>
    </button>
  );
};`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'ErrorDetails.tsx',
      path: 'src/components/ErrorDetails.tsx',
      content: `'use client'

import React from 'react';
import { CapturedError } from '../types/error';
import { copyToClipboard } from '../services/errorFormatter';

interface ErrorDetailsProps {
  error: CapturedError | undefined;
}

export const ErrorDetails = ({ error }: ErrorDetailsProps) => {
  const [copied, setCopied] = React.useState(false);

  if (!error) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <p>Select an error to view details</p>
      </div>
    );
  }

  const handleCopy = async () => {
    if (error.formattedForAI) {
      try {
        await copyToClipboard(error.formattedForAI);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const typeColors: Record<string, string> = {
    error: 'text-red-600 bg-red-50 dark:bg-red-900/20',
    warn: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',
    log: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    info: 'text-green-600 bg-green-50 dark:bg-green-900/20',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={\`px-2 py-1 rounded text-sm font-semibold \${typeColors[error.type]}\`}>
              {error.type.toUpperCase()}
            </span>
            <span className="text-gray-500 text-xs">
              {new Date(error.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <h3 className="font-mono text-sm font-bold break-words">{error.message}</h3>
        </div>

        {error.stack && (
          <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded font-mono text-xs overflow-x-auto">
            <p className="text-gray-600 dark:text-gray-400 mb-2">Stack Trace:</p>
            <pre className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
              {error.stack}
            </pre>
          </div>
        )}

        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs space-y-1">
          <p className="text-gray-600 dark:text-gray-400 font-semibold mb-2">Context:</p>
          <p className="text-gray-700 dark:text-gray-300 break-all">
            <span className="text-gray-500">URL:</span> {error.context.url}
          </p>
          <p className="text-gray-700 dark:text-gray-300 break-all">
            <span className="text-gray-500">Source:</span> {error.source}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <button
          onClick={handleCopy}
          className={\`w-full px-4 py-2 rounded font-semibold transition-colors \${
            copied
              ? 'bg-green-500 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }\`}
        >
          {copied ? '✓ Copied to Clipboard!' : 'Copy for AI'}
        </button>
      </div>
    </div>
  );
};`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'ErrorHistory.tsx',
      path: 'src/components/ErrorHistory.tsx',
      content: `'use client'

import React from 'react';
import { CapturedError } from '../types/error';

interface ErrorHistoryProps {
  errors: CapturedError[];
  selectedId?: string;
  onSelectError: (id: string) => void;
}

export const ErrorHistory = ({ errors, selectedId, onSelectError }: ErrorHistoryProps) => {
  const typeIcons: Record<string, string> = {
    error: '❌',
    warn: '⚠️',
    log: '📝',
    info: 'ℹ️',
  };

  const typeColors: Record<string, string> = {
    error: 'border-l-4 border-red-500',
    warn: 'border-l-4 border-yellow-500',
    log: 'border-l-4 border-blue-500',
    info: 'border-l-4 border-green-500',
  };

  if (errors.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 p-4 text-center">
        <p>No errors captured yet. Errors will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {[...errors].reverse().map((error) => (
        <button
          key={error.id}
          onClick={() => onSelectError(error.id)}
          className={\`w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 transition-colors \${
            selectedId === error.id ? 'bg-blue-100 dark:bg-blue-900/30' : ''
          } \${typeColors[error.type]}\`}
        >
          <div className="flex items-start gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">{typeIcons[error.type]}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate text-gray-900 dark:text-gray-100">
                {error.message.substring(0, 50)}
                {error.message.length > 50 ? '...' : ''}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(error.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
    {
      name: 'ErrorModal.tsx',
      path: 'src/components/ErrorModal.tsx',
      content: `'use client'

import React from 'react';
import { useDebugger } from '../hooks/useDebugger';
import { ErrorHistory } from './ErrorHistory';
import { ErrorDetails } from './ErrorDetails';

export const ErrorModal = () => {
  const { errors, selectedError, selectedErrorId, isOpen, setSelectedErrorId, setOpen, clearErrors, isMounted } = useDebugger();

  if (!isMounted || !isOpen || errors.length === 0) {
    return null;
  }

  React.useEffect(() => {
    if (!selectedErrorId && errors.length > 0) {
      setSelectedErrorId(errors[errors.length - 1].id);
    }
  }, [errors, selectedErrorId, setSelectedErrorId]);

  return (
    <div className="fixed inset-0 z-40 bg-black/50 dark:bg-black/70" onClick={() => setOpen(false)}>
      <div
        className="fixed bottom-0 right-0 h-[600px] w-full sm:w-[600px] bg-white dark:bg-gray-900 shadow-2xl rounded-t-lg sm:rounded-lg flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐛</span>
            <h2 className="font-bold text-gray-900 dark:text-white">Debug Panel</h2>
            <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-1 rounded">
              {errors.length} error{errors.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearErrors}
              className="px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
            <ErrorHistory
              errors={errors}
              selectedId={selectedErrorId}
              onSelectError={setSelectedErrorId}
            />
          </div>

          <div className="flex-1 bg-white dark:bg-gray-900 overflow-hidden">
            <ErrorDetails error={selectedError} />
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
          <p>Tip: Select an error and click "Copy for AI" to paste the full error report in ChatGPT</p>
        </div>
      </div>
    </div>
  );
};`,
      fileType: 'typescript',
      type: 'typescript',
      size: 0,
      isDirectory: false
    },
  ];

  private static readonly EXPO_TEMPLATE_FILES: Omit<File, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'package.json',
      path: 'package.json',
      content: `{
  "name": "expo-mobile-app",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "dev": "expo start --web --port 8081",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web --port 8081"
  },
  "dependencies": {
    "expo": "~54.0.29",
    "expo-status-bar": "^3.0.9",
    "expo-constants": "^17.0.5",
    "expo-linking": "^7.0.5",
    "expo-router": "^4.0.17",
    "expo-splash-screen": "^0.29.21",
    "expo-updates": "^0.27.3",
    "react": "19.2",
    "react-dom": "19.2",
    "react-native": "0.83",
    "react-native-web": "^0.21.2",
    "@expo/vector-icons": "^15.0.3",
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/bottom-tabs": "^6.6.1",
    "react-native-screens": "^4.4.0",
    "react-native-safe-area-context": "^4.10.8",
    "@react-native-async-storage/async-storage": "^2.2.0",
    "react-native-chart-kit": "^6.12.0",
    "react-native-svg": "^13.9.0",
    "date-fns": "^4.1.0",
    "expo-notifications": "^0.28.0"
  },
  "devDependencies": {
    "@types/react": "~19.1.0",
    "@types/react-native": "~0.73.0",
    "typescript": "~5.9.2"
  },
  "private": true
}`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: 'app.json',
      path: 'app.json',
      content: `{
  "expo": {
    "name": "expo-mobile-app",
    "slug": "expo-mobile-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "https://pipilot.dev/assets/icon.png",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "splash": {
      "image": "https://pipilot.dev/assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.pipilot.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "https://pipilot.dev/assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.pipilot.app",
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "favicon": "https://pipilot.dev/assets/favicon.png",
      "bundler": "metro"
    },
    "plugins": []
  }
}`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: 'App.tsx',
      path: 'App.tsx',
      content: `import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
`,
      fileType: 'tsx',
      type: 'tsx',
      size: 0,
      isDirectory: false
    },
    {
      name: 'index.ts',
      path: 'index.ts',
      content: `import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
`,
      fileType: 'ts',
      type: 'ts',
      size: 0,
      isDirectory: false
    },
    {
      name: 'tsconfig.json',
      path: 'tsconfig.json',
      content: `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
`,
      fileType: 'json',
      type: 'json',
      size: 0,
      isDirectory: false
    },
    {
      name: '.gitignore',
      path: '.gitignore',
      content: `# Learn more https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files

# dependencies
node_modules/

# Expo
.expo/
dist/
web-build/
expo-env.d.ts

# Native
.kotlin/
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision

# Metro
.metro-health-check*

# debug
npm-debug.*
yarn-debug.*
yarn-error.*

# macOS
.DS_Store
*.pem

# local env files
.env*.local

# typescript
*.tsbuildinfo

# generated native folders
/ios
/android
`,
      fileType: 'ignore',
      type: 'text',
      size: 0,
      isDirectory: false
    },
  ]

  /**
   * Apply the default Vite React template to a new workspace
   */
  static async applyViteReactTemplate(workspaceId: string): Promise<void> {
    try {
      console.log(`🎯 Applying Vite React template to workspace: ${workspaceId}`)
      console.log(`📁 Template files to create: ${this.VITE_REACT_TEMPLATE_FILES.length}`)

      // Create all template files
      for (const templateFile of this.VITE_REACT_TEMPLATE_FILES) {
        console.log(`📝 Creating file: ${templateFile.path}`)
        const createdFile = await storageManager.createFile({
          workspaceId,
          name: templateFile.name,
          path: templateFile.path,
          content: templateFile.content,
          fileType: templateFile.fileType,
          type: templateFile.type,
          size: templateFile.content.length,
          isDirectory: false
        })
        console.log(`✅ Created file: ${createdFile.name} with ID: ${createdFile.id}`)
      }

      // Verify files were created
      const createdFiles = await storageManager.getFiles(workspaceId)
      console.log(`🔍 Verification: Found ${createdFiles.length} files in workspace ${workspaceId}`)
      console.log(`📋 Files:`, createdFiles.map(f => ({ name: f.name, path: f.path, size: f.size })))

      console.log(`🎉 Vite React template applied successfully to workspace: ${workspaceId}`)
    } catch (error) {
      console.error(`❌ Error applying Vite React template to workspace ${workspaceId}:`, error)
      throw error
    }
  }

  /**
   * Apply the default Next.js template to a new workspace
   */
  static async applyNextJSTemplate(workspaceId: string): Promise<void> {
    try {
      console.log(`🎯 Applying Next.js template to workspace: ${workspaceId}`)
      console.log(`📁 Template files to create: ${this.NEXTJS_TEMPLATE_FILES.length}`)

      // Create all template files
      for (const templateFile of this.NEXTJS_TEMPLATE_FILES) {
        console.log(`📝 Creating file: ${templateFile.path}`)
        const createdFile = await storageManager.createFile({
          workspaceId,
          name: templateFile.name,
          path: templateFile.path,
          content: templateFile.content,
          fileType: templateFile.fileType,
          type: templateFile.type,
          size: templateFile.content.length,
          isDirectory: false
        })
        console.log(`✅ Created file: ${createdFile.name} with ID: ${createdFile.id}`)
      }

      // Verify files were created
      const createdFiles = await storageManager.getFiles(workspaceId)
      console.log(`🔍 Verification: Found ${createdFiles.length} files in workspace ${workspaceId}`)

      console.log(`🎉 Next.js template applied successfully to workspace: ${workspaceId}`)
    } catch (error) {
      console.error(`❌ Error applying Next.js template to workspace ${workspaceId}:`, error)
      throw error
    }
  }

  /**
   * Apply the default Expo React Native template to a new workspace
   */
  static async applyExpoTemplate(workspaceId: string): Promise<void> {
    try {
      console.log(`🎯 Applying Expo template to workspace: ${workspaceId}`)
      console.log(`📁 Template files to create: ${this.EXPO_TEMPLATE_FILES.length}`)

      // Create all template files
      for (const templateFile of this.EXPO_TEMPLATE_FILES) {
        console.log(`📝 Creating file: ${templateFile.path}`)
        const createdFile = await storageManager.createFile({
          workspaceId,
          name: templateFile.name,
          path: templateFile.path,
          content: templateFile.content,
          fileType: templateFile.fileType,
          type: templateFile.type,
          size: templateFile.content.length,
          isDirectory: false
        })
        console.log(`✅ Created file: ${createdFile.name} with ID: ${createdFile.id}`)
      }

      // Verify files were created
      const createdFiles = await storageManager.getFiles(workspaceId)
      console.log(`🔍 Verification: Found ${createdFiles.length} files in workspace ${workspaceId}`)

      console.log(`🎉 Expo template applied successfully to workspace: ${workspaceId}`)
    } catch (error) {
      console.error(`❌ Error applying Expo template to workspace ${workspaceId}:`, error)
      throw error
    }
  }

  /**
   * Apply the default HTML + CSS + JavaScript template to a new workspace
   */
  static async applyHtmlTemplate(workspaceId: string): Promise<void> {
    try {
      console.log(`🎯 Applying HTML template to workspace: ${workspaceId}`)
      console.log(`📁 Template files to create: ${this.HTML_TEMPLATE_FILES.length}`)

      // Create all template files
      for (const templateFile of this.HTML_TEMPLATE_FILES) {
        console.log(`📝 Creating file: ${templateFile.path}`)
        const createdFile = await storageManager.createFile({
          workspaceId,
          name: templateFile.name,
          path: templateFile.path,
          content: templateFile.content,
          fileType: templateFile.fileType,
          type: templateFile.type,
          size: templateFile.content.length,
          isDirectory: false
        })
        console.log(`✅ Created file: ${createdFile.name} with ID: ${createdFile.id}`)
      }

      // Verify files were created
      const createdFiles = await storageManager.getFiles(workspaceId)
      console.log(`🔍 Verification: Found ${createdFiles.length} files in workspace ${workspaceId}`)

      console.log(`🎉 HTML template applied successfully to workspace: ${workspaceId}`)
    } catch (error) {
      console.error(`❌ Error applying HTML template to workspace ${workspaceId}:`, error)
      throw error
    }
  }

  /**
   * Create a new workspace with the specified template
   */
  static async createWorkspaceWithTemplate(
    workspaceData: Omit<Workspace, 'id' | 'slug' | 'createdAt' | 'updatedAt'>,
    templateId: string = 'vite-react'
  ) {
    try {
      // Generate a slug from the workspace name
      const slug = workspaceData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      console.log(`🔗 Generated slug: ${slug}`)

      // Create the workspace first (local)
      const workspace = await storageManager.createWorkspace({
        ...workspaceData,
        slug
      })
      console.log(`✅ Workspace created with ID: ${workspace.id}`)

      // Apply the selected template (local)
      switch (templateId) {
        case 'nextjs':
          await this.applyNextJSTemplate(workspace.id)
          break
        case 'expo':
          await this.applyExpoTemplate(workspace.id)
          break
        case 'html':
          await this.applyHtmlTemplate(workspace.id)
          break
        case 'vite-react':
        default:
          await this.applyViteReactTemplate(workspace.id)
          break
      }

      // Final verification
      const finalFiles = await storageManager.getFiles(workspace.id)
      console.log(`🎯 Final verification: Workspace ${workspace.id} has ${finalFiles.length} files`)

      // ...local storage only. No Supabase persistence...

      return workspace
    } catch (error) {
      console.error('❌ Error creating workspace with template:', error)
      throw error
    }
  }

  /**
   * Get available templates
   */
  static getAvailableTemplates() {
    return [
      {
        id: 'vite-react',
        name: 'Vite React + TypeScript + Tailwind CSS',
        description: 'A modern React application with Vite, TypeScript, and Tailwind CSS',
        category: 'React',
        tags: ['react', 'typescript', 'vite', 'tailwind'],
        files: this.VITE_REACT_TEMPLATE_FILES.length
      },
      {
        id: 'nextjs',
        name: 'Next.js + TypeScript + Tailwind CSS',
        description: 'A full-stack React framework with App Router, TypeScript, and Tailwind CSS',
        category: 'Next.js',
        tags: ['nextjs', 'react', 'typescript', 'tailwind', 'ssr'],
        files: this.NEXTJS_TEMPLATE_FILES.length
      },
      {
        id: 'expo',
        name: 'Expo React Native + TypeScript',
        description: 'A cross-platform mobile app with Expo, React Native, and TypeScript',
        category: 'Mobile',
        tags: ['expo', 'react-native', 'mobile', 'typescript', 'ios', 'android'],
        files: this.EXPO_TEMPLATE_FILES.length
      },
      {
        id: 'html',
        name: 'HTML + CSS + JavaScript',
        description: 'A pure HTML, CSS, and JavaScript website that can be deployed to Vercel',
        category: 'Static',
        tags: ['html', 'css', 'javascript', 'static', 'vercel'],
        files: this.HTML_TEMPLATE_FILES.length
      }
    ]
  }

  // HTML + CSS + JavaScript template files
  private static readonly HTML_TEMPLATE_FILES: Omit<File, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'index.html',
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My HTML Website</title>
    <!-- PiPilot Console Bridge - Captures console logs for preview panel -->
    <script>
      (function() {
        window.__PIPILOT_EARLY_ERRORS__ = [];
        window.onerror = function(msg, url, line, col, error) {
          var errorData = { __isError: true, name: error?.name || 'Error', message: msg, stack: error?.stack || ('at ' + url + ':' + line + ':' + col) };
          window.__PIPILOT_EARLY_ERRORS__.push(errorData);
          try { window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: 'error', data: [errorData], timestamp: new Date().toISOString(), id: 'error-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*'); } catch(e) {}
          return false;
        };
        window.onunhandledrejection = function(event) {
          var errorData = { __isError: true, name: 'UnhandledPromiseRejection', message: String(event.reason), stack: event.reason?.stack || '' };
          window.__PIPILOT_EARLY_ERRORS__.push(errorData);
          try { window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: 'error', data: [errorData], timestamp: new Date().toISOString(), id: 'rejection-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*'); } catch(e) {}
        };
        var originalConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
        function sendToParent(method, args) {
          try {
            var serializedArgs = Array.prototype.slice.call(args).map(function(arg) {
              if (arg instanceof Error) return { __isError: true, name: arg.name, message: arg.message, stack: arg.stack };
              try { return JSON.parse(JSON.stringify(arg)); } catch(e) { return String(arg); }
            });
            window.parent.postMessage({ type: 'BROWSER_CONSOLE_LOG', payload: { method: method, data: serializedArgs, timestamp: new Date().toISOString(), id: method + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) } }, '*');
          } catch(e) {}
        }
        console.log = function() { originalConsole.log.apply(console, arguments); sendToParent('log', arguments); };
        console.warn = function() { originalConsole.warn.apply(console, arguments); sendToParent('warn', arguments); };
        console.error = function() { originalConsole.error.apply(console, arguments); sendToParent('error', arguments); };
        console.info = function() { originalConsole.info.apply(console, arguments); sendToParent('info', arguments); };
        console.debug = function() { originalConsole.debug.apply(console, arguments); sendToParent('debug', arguments); };
        setTimeout(function() { window.__PIPILOT_EARLY_ERRORS__.forEach(function(err) { sendToParent('error', [err]); }); }, 100);
      })();
    </script>

    <!-- Tailwind CSS via CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        'brand-dark': '#181818',
                        'brand-light': '#fafafa',
                        'brand-gray': '#6b7280',
                        'brand-accent': '#3b82f6',
                        'brand-success': '#10b981',
                        'brand-warning': '#f59e0b',
                        'brand-error': '#ef4444',
                    },
                    fontFamily: {
                        sans: ['Inter', 'system-ui', 'sans-serif'],
                    },
                }
            }
        }
    </script>

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

    <!-- Custom CSS for additional styles -->
    <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-white text-gray-900 font-sans antialiased">
    <!-- Header -->
    <header class="bg-brand-dark text-white py-6">
        <div class="max-w-6xl mx-auto px-4">
            <h1 class="text-3xl font-bold mb-2">Welcome to My Website</h1>
            <nav>
                <ul class="flex flex-wrap gap-6 justify-center">
                    <li><a href="#home" class="hover:text-brand-accent transition-colors">Home</a></li>
                    <li><a href="#about" class="hover:text-brand-accent transition-colors">About</a></li>
                    <li><a href="#contact" class="hover:text-brand-accent transition-colors">Contact</a></li>
                </ul>
            </nav>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-8">
        <!-- Home Section -->
        <section id="home" class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
            <h2 class="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b-2 border-brand-accent">Home Section</h2>
            <p class="text-gray-700 mb-4">This is a modern HTML website built with <strong class="text-brand-accent">Tailwind CSS</strong> and automatic Vercel deployment!</p>
            <p class="text-gray-700 mb-4">Features included:</p>
            <ul class="text-left inline-block bg-gray-50 p-4 rounded-lg mb-4 text-gray-700">
                <li class="mb-2"><code class="bg-gray-200 px-2 py-1 rounded text-sm">Tailwind CSS</code> - Utility-first styling</li>
                <li class="mb-2"><code class="bg-gray-200 px-2 py-1 rounded text-sm">Custom CSS</code> - Additional styles in styles.css</li>
                <li class="mb-2"><code class="bg-gray-200 px-2 py-1 rounded text-sm">Vercel Ready</code> - Zero-config deployment</li>
            </ul>
            <div class="mt-6">
                <button id="clickMe" class="bg-brand-accent text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">Click Me!</button>
                <p id="message" class="mt-4 text-brand-accent font-medium"></p>
            </div>
        </section>

        <!-- About Section -->
        <section id="about" class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
            <h2 class="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b-2 border-brand-accent">About This Template</h2>
            <p class="text-gray-700 mb-6">This is a <strong>Tailwind CSS + HTML</strong> template optimized for quick development and easy deployment.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 hover:-translate-y-1 hover:shadow-lg transition-all">
                    <h3 class="text-brand-accent font-semibold mb-2">Auto-Deployment</h3>
                    <p class="text-gray-600 text-sm">Deploy instantly to Vercel with zero configuration</p>
                </div>
                <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 hover:-translate-y-1 hover:shadow-lg transition-all">
                    <h3 class="text-brand-accent font-semibold mb-2">Tailwind CSS</h3>
                    <p class="text-gray-600 text-sm">Utility-first CSS framework for rapid styling</p>
                </div>
                <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 hover:-translate-y-1 hover:shadow-lg transition-all">
                    <h3 class="text-brand-accent font-semibold mb-2">Responsive</h3>
                    <p class="text-gray-600 text-sm">Works perfectly on desktop, tablet, and mobile</p>
                </div>
                <div class="bg-gray-50 p-6 rounded-lg border border-gray-200 hover:-translate-y-1 hover:shadow-lg transition-all">
                    <h3 class="text-brand-accent font-semibold mb-2">Fast Loading</h3>
                    <p class="text-gray-600 text-sm">Optimized assets with intelligent caching</p>
                </div>
            </div>
        </section>

        <!-- Contact Section -->
        <section id="contact" class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
            <h2 class="text-2xl font-semibold text-gray-900 mb-4 pb-2 border-b-2 border-brand-accent">Contact Section</h2>
            <form id="contactForm" class="max-w-md space-y-4">
                <div>
                    <label for="name" class="block font-medium text-gray-700 mb-1">Name:</label>
                    <input type="text" id="name" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent">
                </div>
                <div>
                    <label for="email" class="block font-medium text-gray-700 mb-1">Email:</label>
                    <input type="email" id="email" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent">
                </div>
                <div>
                    <label for="formMessage" class="block font-medium text-gray-700 mb-1">Message:</label>
                    <textarea id="formMessage" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent min-h-[100px] resize-y"></textarea>
                </div>
                <button type="submit" class="bg-brand-accent text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">Send Message</button>
            </form>
        </section>
    </main>

    <!-- Footer -->
    <footer class="bg-brand-dark text-white text-center py-6">
        <p>&copy; 2024 My HTML Website. Built with <strong class="text-brand-accent">Tailwind CSS</strong></p>
        <p class="text-sm mt-2 opacity-80">
            Built with PiPilot AI - Deploy anywhere!
        </p>
    </footer>

    <script src="script.js"></script>
</body>
</html>`,
      fileType: 'html',
      type: 'text',
      size: 0,
      isDirectory: false
    },
    {
      name: 'styles.css',
      path: 'styles.css',
      content: `/*
 * =============================================================================
 * HTML + TAILWIND CSS TEMPLATE - CUSTOM STYLES
 * =============================================================================
 *
 * STYLING GUIDE FOR AI:
 * ---------------------
 * 1. USE TAILWIND CLASSES FIRST: Always prefer Tailwind utility classes in HTML
 *    Example: <div class="flex items-center justify-between p-4 bg-gray-100">
 *
 * 2. TAILWIND CDN IS LOADED IN index.html: The Tailwind CDN script is included
 *    in the <head> section with a custom configuration.
 *
 * 3. CUSTOM CSS HERE: Only add styles to this file when:
 *    - You need complex animations not available in Tailwind
 *    - You need CSS variables for theming
 *    - You need styles that can't be expressed with Tailwind utilities
 *
 * 4. AVAILABLE CUSTOM COLORS (configured in index.html):
 *    - brand-dark: #181818 (dark backgrounds, text)
 *    - brand-light: #fafafa (light backgrounds)
 *    - brand-gray: #6b7280 (secondary text)
 *    - brand-accent: #3b82f6 (primary accent - blue)
 *    - brand-success: #10b981 (success states - green)
 *    - brand-warning: #f59e0b (warning states - amber)
 *    - brand-error: #ef4444 (error states - red)
 *
 * 5. FONTS: Inter is the default font (loaded via Google Fonts)
 *
 * =============================================================================
 */

/* Custom animations */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

/* Utility classes for animations */
.animate-fade-in {
    animation: fadeIn 0.3s ease-out;
}

.animate-pulse-slow {
    animation: pulse 2s ease-in-out infinite;
}

/* Custom scrollbar styling */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #a1a1a1;
}

/* Focus styles for accessibility */
*:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
}

/* Print styles */
@media print {
    header, footer {
        background: white !important;
        color: black !important;
    }

    .no-print {
        display: none !important;
    }
}`,
      fileType: 'css',
      type: 'text',
      size: 0,
      isDirectory: false
    },
    {
      name: 'script.js',
      path: 'script.js',
      content: `/*
 * =============================================================================
 * HTML + TAILWIND CSS TEMPLATE - JAVASCRIPT
 * =============================================================================
 *
 * JAVASCRIPT GUIDE FOR AI:
 * ------------------------
 * 1. Use modern ES6+ syntax (const, let, arrow functions, template literals)
 * 2. Use querySelector/querySelectorAll for DOM selection
 * 3. Add event listeners instead of inline onclick handlers
 * 4. Use classList.add/remove/toggle for dynamic styling
 * 5. For animations, prefer CSS classes over JS style manipulation
 *
 * =============================================================================
 */

// Button click event
document.getElementById('clickMe').addEventListener('click', function() {
    const messageEl = document.getElementById('message');
    messageEl.textContent = 'Hello! This site is built with Tailwind CSS via CDN. Easy to style, easy to deploy!';
    messageEl.classList.add('animate-fade-in');
});

// Form submission
document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const formMessage = document.getElementById('formMessage').value;

    // Simple validation
    if (name && email && formMessage) {
        alert(\`Thank you \${name}! Your message has been sent. (This is a demo - no actual email was sent)\`);
        this.reset();
    } else {
        alert('Please fill in all fields.');
    }
});

// Smooth scrolling for navigation links
document.querySelectorAll('nav a').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// Add some dynamic content
document.addEventListener('DOMContentLoaded', function() {
    const currentYear = new Date().getFullYear();
    document.querySelector('footer p').innerHTML = \`&copy; \${currentYear} My HTML Website. <strong>Auto-deployed to Vercel</strong> with intelligent rewrites 🚀\`;

    // Clean URL routing - automatically show the right section based on URL path
    const path = window.location.pathname;
    const cleanPath = path.replace(/^\//, '').replace(/\.html$/, ''); // Remove leading slash and .html extension

    if (cleanPath && cleanPath !== '' && cleanPath !== 'index') {
        const targetElement = document.getElementById(cleanPath);
        if (targetElement) {
            // Update page title based on section
            const sectionTitles = {
                'contact': 'Contact Us',
                'about': 'About Us',
                'home': 'Welcome'
            };
            if (sectionTitles[cleanPath]) {
                document.title = \`\${sectionTitles[cleanPath]} - My HTML Website\`;
            }

            // Smooth scroll to the section
            setTimeout(() => {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 100);
        }
    }
});`,
      fileType: 'javascript',
      type: 'text',
      size: 0,
      isDirectory: false
    },
    {
      name: 'README.md',
      path: 'README.md',
      content: `# HTML + Tailwind CSS Template

A modern, responsive HTML website powered by Tailwind CSS via CDN, ready for instant Vercel deployment.

## AI STYLING GUIDE

**IMPORTANT FOR AI: Always prefer Tailwind utility classes over custom CSS.**

### How to Style Elements

1. **USE TAILWIND CLASSES** - Add utility classes directly in HTML:
   \`\`\`html
   <div class="flex items-center justify-between p-4 bg-gray-100 rounded-lg">
   <button class="bg-brand-accent text-white px-4 py-2 rounded hover:bg-blue-700">
   \`\`\`

2. **AVAILABLE CUSTOM COLORS** (configured in index.html):
   - \`brand-dark\`: #181818 - Dark backgrounds, text
   - \`brand-light\`: #fafafa - Light backgrounds
   - \`brand-gray\`: #6b7280 - Secondary text
   - \`brand-accent\`: #3b82f6 - Primary accent (blue)
   - \`brand-success\`: #10b981 - Success states (green)
   - \`brand-warning\`: #f59e0b - Warning states (amber)
   - \`brand-error\`: #ef4444 - Error states (red)

3. **CUSTOM CSS** - Only use styles.css when you need:
   - Complex animations not in Tailwind
   - CSS variables for theming
   - Styles that can't be expressed with utilities

### Common Tailwind Patterns

**Buttons:**
\`\`\`html
<button class="bg-brand-accent text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium">
\`\`\`

**Cards:**
\`\`\`html
<div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
\`\`\`

**Forms:**
\`\`\`html
<input class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-accent">
\`\`\`

**Layout:**
\`\`\`html
<div class="max-w-6xl mx-auto px-4">
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
<div class="flex items-center justify-between">
\`\`\`

## Project Structure

\`\`\`
├── index.html      # Main HTML with Tailwind CDN
├── styles.css      # Custom CSS (animations, scrollbar, etc.)
├── script.js       # Vanilla JavaScript
├── vercel.json     # Vercel deployment config
└── README.md       # This file
\`\`\`

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Deployment

Push to GitHub and connect to Vercel - it auto-deploys!

Or manually:
\`\`\`bash
vercel --prod
\`\`\`

## Responsive Design

Tailwind breakpoints:
- \`sm:\` - 640px+
- \`md:\` - 768px+
- \`lg:\` - 1024px+
- \`xl:\` - 1280px+

Example:
\`\`\`html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
\`\`\`

---

Built with PiPilot AI`,
      fileType: 'markdown',
      type: 'text',
      size: 0,
      isDirectory: false
    },
    {
      name: 'vercel.json',
      path: 'vercel.json',
      content: `{
  "version": 2,
  "name": "html-site",
  "builds": [
    {
      "src": "index.html",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)\\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)",
      "dest": "/$1.$2",
      "headers": {
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "redirects": [
    {
      "source": "/contact.html",
      "destination": "/contact",
      "statusCode": 301
    },
    {
      "source": "/about.html",
      "destination": "/about",
      "statusCode": 301
    },
    {
      "source": "/home.html",
      "destination": "/home",
      "statusCode": 301
    },
    {
      "source": "/(.*)\\.html",
      "destination": "/$1",
      "statusCode": 301
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/((?!api/).*)",
      "destination": "/index.html"
    }
  ]
}`,
      fileType: 'json',
      type: 'text',
      size: 0,
      isDirectory: false
    }
  ]
}

// Export the template service
export const templateService = new TemplateService()
