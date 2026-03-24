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

    // Filter out all .md files except important docs and .pipilot/ folder files
    const importantMdFiles = [
      'readme.md',
      'external_app_integration_guide.md',
      'storage_system_implementation.md',
      'user_authentication_readme.md'
    ]
    const isInPipilotFolder = path.includes('.pipilot/') || path.includes('pipilot/')
    if (extension === 'md' && !importantMdFiles.includes(fileName) && !fileName.startsWith('pipilot') && !isInPipilotFolder) {
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
 * AI-powered project type detection using a0 LLM API.
 * Analyzes the file tree and package.json to determine the framework.
 * Used as a fallback when callers don't provide an explicit projectType flag.
 * Returns: 'vite-react' | 'nextjs' | 'expo' | 'html'
 */
export async function detectProjectTypeWithAI(files: any[]): Promise<string> {
  // Phase 1: Fast file-based detection (instant, never fails)
  const fileBasedResult = detectProjectTypeFromFiles(files)
  if (fileBasedResult !== 'unknown') {
    console.log(`[AI Detection] File-based detection: ${fileBasedResult}`)
    return fileBasedResult
  }

  // Phase 2: Only call AI if file-based detection couldn't determine type
  try {
    const filePaths = files
      .map((f: any) => f.path)
      .filter(Boolean)
      .slice(0, 80)
      .join('\n')

    const pkgFile = files.find((f: any) => f.path === 'package.json')
    let depsInfo = ''
    if (pkgFile?.content) {
      try {
        const pkg = JSON.parse(pkgFile.content)
        const deps = Object.keys(pkg.dependencies || {}).join(', ')
        const devDeps = Object.keys(pkg.devDependencies || {}).join(', ')
        depsInfo = `\n\npackage.json dependencies: ${deps}\ndevDependencies: ${devDeps}`
      } catch {}
    }

    const response = await fetch('https://api.a0.dev/ai/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a project type classifier. Given a file tree and package.json info, respond with EXACTLY one word: vite-react, nextjs, expo, or html. No explanation.'
          },
          {
            role: 'user',
            content: `Classify this project:\n\nFile tree:\n${filePaths}${depsInfo}`
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      }),
      signal: AbortSignal.timeout(8000) // 8s timeout
    })

    const data = await response.json()
    const answer = (data.completion || '').trim().toLowerCase()

    const validTypes = ['vite-react', 'nextjs', 'expo', 'html']
    if (validTypes.includes(answer)) {
      console.log(`[AI Detection] AI classified project type: ${answer}`)
      return answer
    }

    if (answer.includes('vite') || answer.includes('react')) return 'vite-react'
    if (answer.includes('next')) return 'nextjs'
    if (answer.includes('expo')) return 'expo'

    console.warn(`[AI Detection] Unexpected AI response: "${answer}", defaulting to vite-react`)
    return 'vite-react'
  } catch (error) {
    console.warn('[AI Detection] AI fallback failed, defaulting to vite-react:', error)
    return 'vite-react'
  }
}

/**
 * Fast file-based project type detection. Checks file paths and package.json
 * dependencies to determine the project type without any external API calls.
 */
export function detectProjectTypeFromFiles(files: any[]): string {
  const paths = files.map((f: any) => (f.path || '').toLowerCase()).filter(Boolean)
  const pathSet = new Set(paths)

  // Check for Next.js markers
  const hasNextConfig = paths.some(p => p.includes('next.config'))
  const hasAppDir = paths.some(p => p.startsWith('app/') || p.startsWith('/app/'))
  const hasPagesDir = paths.some(p => p.startsWith('pages/') || p.startsWith('/pages/'))
  if (hasNextConfig || (hasAppDir && paths.some(p => p.includes('layout.tsx') || p.includes('layout.jsx') || p.includes('layout.js')))) {
    return 'nextjs'
  }

  // Check for Expo markers
  const hasAppJson = pathSet.has('app.json') || pathSet.has('/app.json')
  const hasExpoDir = paths.some(p => p.includes('.expo/') || p.includes('expo-'))
  if (hasExpoDir) return 'expo'

  // Check package.json for framework deps
  const pkgFile = files.find((f: any) => {
    const p = (f.path || '').replace(/^\//, '')
    return p === 'package.json'
  })
  if (pkgFile?.content) {
    try {
      const pkg = JSON.parse(pkgFile.content)
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
      const depNames = Object.keys(allDeps)

      if (depNames.includes('next')) return 'nextjs'
      if (depNames.includes('expo') || depNames.includes('expo-router') || depNames.includes('react-native')) return 'expo'
      if (depNames.includes('vite') || depNames.includes('react') || depNames.includes('react-dom')) return 'vite-react'
    } catch {}
  }

  // Check for Vite markers
  const hasViteConfig = paths.some(p => p.includes('vite.config'))
  const hasSrcMain = paths.some(p => p.includes('src/main.') || p.includes('src/index.'))
  if (hasViteConfig) return 'vite-react'

  // Check for HTML markers
  const hasIndexHtml = pathSet.has('index.html') || pathSet.has('/index.html')
  const hasNoPackageJson = !pkgFile
  if (hasIndexHtml && hasNoPackageJson) return 'html'
  if (hasIndexHtml && !hasViteConfig && paths.every(p => !p.includes('src/'))) return 'html'

  // Expo with app.json (check content for expo key)
  if (hasAppJson) {
    try {
      const appJson = files.find((f: any) => (f.path || '').replace(/^\//, '') === 'app.json')
      if (appJson?.content) {
        const parsed = JSON.parse(appJson.content)
        if (parsed.expo) return 'expo'
      }
    } catch {}
  }

  // Default: if we have React deps + index.html, it's vite-react
  if (hasIndexHtml && hasSrcMain) return 'vite-react'

  return 'unknown'
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
