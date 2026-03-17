import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// File extensions and patterns to filter out during compression/bundling
const FILTERED_EXTENSIONS = new Set([
  // Images
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'heic', 'heif',
  // Videos
  'mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', '3gp', 'mpg', 'mpeg',
  // PDFs
  'pdf',
  // Other unwanted files
  'lock', 'log', 'tmp', 'temp', 'cache', 'DS_Store'
])

// Folders to filter out (case-insensitive)
const FILTERED_FOLDERS = new Set([
  'scripts',
  'tests',
  '_tests',
  '_tests_',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',
  '.vscode',
  '.idea',
  'target', // Java/Maven
  'bin',    // .NET/Java
  'obj',    // .NET
  'out',    // Various build outputs
  'tmp',
  'temp',
  'cache',
  '.cache'
])

/**
 * Filter out unwanted files and folders from a file array for large codebase handling
 * Filters out: media files, scripts folders, test folders, build artifacts, and all MD files except README.md
 * Used during compression, bundling, and import operations to reduce payload size and improve performance
 */
export function filterUnwantedFiles(files: any[]): any[] {
  return files.filter(file => {
    if (!file.path) return true // Keep files without path

    const path = file.path.toLowerCase()
    const fileName = file.path.split('/').pop()?.toLowerCase() || ''

    // Filter out entire folders
    for (const folder of FILTERED_FOLDERS) {
      if (path.includes(`/${folder}/`) || path.startsWith(`${folder}/`)) {
        return false
      }
    }

    // Filter out specific file extensions
    const extension = file.path.split('.').pop()?.toLowerCase()
    if (extension && FILTERED_EXTENSIONS.has(extension)) {
      return false
    }

    // Filter out all .md files except specific important documentation files and files starting with "pipilot"
    const importantMdFiles = [
      'readme.md',
      'external_app_integration_guide.md',
      'storage_system_implementation.md',
      'user_authentication_readme.md'
    ]
    if (extension === 'md' && !importantMdFiles.includes(fileName) && !fileName.startsWith('pipilot')) {
      return false
    }

    // Filter out common unwanted files
    const unwantedFiles = [
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'composer.lock',
      'gemfile.lock',
      '.gitignore',
      '.dockerignore',
      'dockerfile',
      'docker-compose.yml',
      'docker-compose.yaml',
      'makefile',
      'rakefile'
    ]

    if (unwantedFiles.some(unwanted => fileName === unwanted)) {
      return false
    }

    return true
  })
}

/**
 * Legacy function - kept for backward compatibility
 * @deprecated Use filterUnwantedFiles instead for more comprehensive filtering
 */
export function filterMediaFiles(files: any[]): any[] {
  return filterUnwantedFiles(files)
}

/**
 * Auto-patch vite.config.js/ts for E2B sandbox compatibility.
 * Imported projects often have a vanilla vite config without the server
 * settings required for E2B (host, port, allowedHosts). This function
 * detects and patches the config in-place so the dev server binds to
 * 0.0.0.0:3000 and accepts connections from E2B domains.
 */
export function patchViteConfigForSandbox(files: any[]): void {
  const viteConfigFile = files.find((f: any) =>
    f.path === 'vite.config.js' || f.path === 'vite.config.ts' || f.path === 'vite.config.mjs'
  )
  if (!viteConfigFile || !viteConfigFile.content) return

  const content = viteConfigFile.content as string

  // Already has sandbox-compatible server settings — skip
  if (content.includes("host: '0.0.0.0'") && content.includes('port: 3000')) {
    console.log('[ViteConfigPatch] Config already has sandbox-compatible server settings, skipping')
    return
  }

  // Check if there's already a `server` block
  if (/server\s*:\s*\{/.test(content)) {
    let patched = content
    if (!content.includes("host:")) {
      patched = patched.replace(/server\s*:\s*\{/, "server: {\n    host: '0.0.0.0',")
    }
    if (!content.includes("port:")) {
      patched = patched.replace(/server\s*:\s*\{/, "server: {\n    port: 3000,\n    strictPort: true,")
    }
    if (!content.includes("allowedHosts")) {
      patched = patched.replace(/server\s*:\s*\{/, "server: {\n    allowedHosts: ['localhost', '127.0.0.1', '.e2b.app'],")
    }
    viteConfigFile.content = patched
    console.log(`[ViteConfigPatch] Patched existing server block in ${viteConfigFile.path}`)
  } else {
    // No server block — inject one before the closing of defineConfig
    const serverBlock = `  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    cors: true,
    allowedHosts: ['localhost', '127.0.0.1', '.e2b.app', '3000-*.e2b.app'],
  },`

    const lastClosingIndex = content.lastIndexOf('})')
    if (lastClosingIndex !== -1) {
      viteConfigFile.content = content.slice(0, lastClosingIndex) + serverBlock + '\n' + content.slice(lastClosingIndex)
      console.log(`[ViteConfigPatch] Injected server block into ${viteConfigFile.path}`)
    } else {
      console.warn('[ViteConfigPatch] Could not find closing }) of defineConfig, skipping patch')
    }
  }
}

/**
 * Convert a date to a "time ago" string (e.g., "2 days ago", "1 week ago")
 */
export function timeAgo(date: Date | string): string {
  const now = new Date()
  const past = new Date(date)
  const diffInMs = now.getTime() - past.getTime()

  const diffInSeconds = Math.floor(diffInMs / 1000)
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  const diffInHours = Math.floor(diffInMinutes / 60)
  const diffInDays = Math.floor(diffInHours / 24)
  const diffInWeeks = Math.floor(diffInDays / 7)
  const diffInMonths = Math.floor(diffInDays / 30)
  const diffInYears = Math.floor(diffInDays / 365)

  if (diffInSeconds < 60) {
    return 'just now'
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
  } else if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
  } else if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`
  } else if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`
  } else {
    return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`
  }
}
