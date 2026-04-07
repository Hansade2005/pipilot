import { NextRequest, NextResponse } from 'next/server'
import {
  createEnhancedSandbox,
  type SandboxFile,
} from '@/lib/e2b-enhanced'

// ─── Config ──────────────────────────────────────────────────────────────────
const PIPILOT_PREVIEW_API_KEY = process.env.PIPILOT_PREVIEW_API_KEY || 'ppk_live_pipilot_preview_2026'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
}

function json(body: any, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ─── Auth helper ─────────────────────────────────────────────────────────────
function authenticate(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')
  if (!auth) return false
  const token = auth.replace(/^Bearer\s+/i, '')
  return token === PIPILOT_PREVIEW_API_KEY
}

// ─── In-memory session tracking ──────────────────────────────────────────────
interface PreviewSession {
  sandboxId: string
  sandbox: any
  previewUrl: string | null
  port: number | null
  framework: string
  status: 'creating' | 'installing' | 'building' | 'running' | 'error' | 'stopped'
  createdAt: Date
  lastActivity: Date
  error?: string
}

const sessions = new Map<string, PreviewSession>()

// Cleanup sessions older than 30 minutes
function cleanupSessions() {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, session] of sessions) {
    if (session.lastActivity.getTime() < cutoff) {
      try { session.sandbox?.kill?.() } catch {}
      sessions.delete(id)
    }
  }
}

// ─── POST /api/app-preview — Create a new preview session ────────────────────
//
// Body: {
//   files: [{ path: string, content: string }],     // Project files
//   framework?: 'vite' | 'nextjs' | 'expo' | 'auto',
//   installCommand?: string,                          // e.g. "pnpm install"
//   devCommand?: string,                              // e.g. "pnpm dev"
//   port?: number,                                    // Default: 5173 (Vite) or 3000
//   sessionId?: string,                               // Reuse existing session
// }
//
// Returns: { sessionId, previewUrl, port, status, framework }
//
export async function POST(request: NextRequest) {
  cleanupSessions()

  if (!authenticate(request)) {
    return json({ error: 'Unauthorized. Provide Bearer token in Authorization header.' }, 401)
  }

  const e2bKey = process.env.E2B_API_KEY
  if (!e2bKey) {
    return json({ error: 'E2B sandbox not configured on this server.' }, 503)
  }

  try {
    const body = await request.json()
    const {
      files,
      framework = 'auto',
      installCommand,
      devCommand,
      port: requestedPort,
      sessionId: existingSessionId,
    } = body

    if (!files || !Array.isArray(files) || files.length === 0) {
      return json({ error: 'files array is required (each item: { path, content })' }, 400)
    }

    // ── Detect framework ──────────────────────────────────────────────────
    let detectedFramework = framework
    if (framework === 'auto') {
      const packageJson = files.find((f: any) => f.path === 'package.json')
      if (packageJson) {
        try {
          const pkg = JSON.parse(packageJson.content)
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
          if (allDeps['next']) detectedFramework = 'nextjs'
          else if (allDeps['expo']) detectedFramework = 'expo'
          else if (allDeps['vite']) detectedFramework = 'vite'
          else detectedFramework = 'vite'
        } catch { detectedFramework = 'vite' }
      } else {
        detectedFramework = 'vite'
      }
    }

    const isExpoProject = detectedFramework === 'expo'
    const port = requestedPort || (detectedFramework === 'nextjs' ? 3000 : isExpoProject ? 8081 : 5173)
    const workingDir = isExpoProject ? '/home/user' : '/project'
    const sessionId = existingSessionId || `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // ── Reuse existing sandbox if sessionId provided ──────────────────────
    if (existingSessionId && sessions.has(existingSessionId)) {
      const existing = sessions.get(existingSessionId)!
      existing.lastActivity = new Date()

      try {
        const sandbox = existing.sandbox
        const sandboxFiles: SandboxFile[] = files.map((f: any) => ({
          path: `${workingDir}/${f.path}`,
          content: f.content || '',
        }))
        await sandbox.writeFiles(sandboxFiles)

        existing.status = 'running'
        return json({
          sessionId: existingSessionId,
          previewUrl: existing.previewUrl,
          port: existing.port,
          status: 'running',
          framework: existing.framework,
          reused: true,
        })
      } catch (err) {
        // Sandbox expired, create new
        sessions.delete(existingSessionId)
      }
    }

    // ── Create sandbox ────────────────────────────────────────────────────
    const session: PreviewSession = {
      sandboxId: '',
      sandbox: null,
      previewUrl: null,
      port,
      framework: detectedFramework,
      status: 'creating',
      createdAt: new Date(),
      lastActivity: new Date(),
    }
    sessions.set(sessionId, session)

    const template = isExpoProject ? 'pipilot-expo' : 'pipilot-expo'
    const sandbox = await createEnhancedSandbox({
      template,
      timeoutMs: 600000,
      env: { NODE_ENV: 'development' },
    })

    session.sandboxId = sandbox.id
    session.sandbox = sandbox

    // ── Write files (same as preview API) ─────────────────────────────────
    console.log(`[AppPreview] Writing ${files.length} files...`)
    const sandboxFiles: SandboxFile[] = files.map((f: any) => ({
      path: `${workingDir}/${f.path}`,
      content: f.content || '',
    }))

    const fileResult = await sandbox.writeFiles(sandboxFiles)
    if (!fileResult.success) {
      const failedFiles = fileResult.results.filter(r => !r.success).map(r => `${r.path}: ${r.error}`)
      session.status = 'error'
      session.error = `Failed to write files: ${failedFiles.join(', ')}`
      console.error('[AppPreview] File write errors:', failedFiles)
      return json({ sessionId, status: 'error', error: session.error, framework: detectedFramework }, 500)
    }
    console.log(`[AppPreview] Files written: ${fileResult.successCount}/${fileResult.totalFiles}`)

    // ── Install dependencies (same as preview API) ────────────────────────
    session.status = 'installing'

    const hasPackageJson = files.some((f: any) => f.path === 'package.json')
    if (hasPackageJson) {
      // Detect package manager
      const hasPnpmLock = files.some((f: any) => f.path === 'pnpm-lock.yaml')
      const hasYarnLock = files.some((f: any) => f.path === 'yarn.lock')
      const packageManager = installCommand
        ? undefined // user provided full command, skip auto-detection
        : isExpoProject ? 'yarn' : (hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'pnpm')

      if (installCommand) {
        // User provided a custom install command — run it directly
        console.log(`[AppPreview] Installing deps (custom): ${installCommand}`)
        try {
          const installResult = await sandbox.executeCommand(installCommand, {
            workingDirectory: workingDir,
            timeoutMs: 0,
            onStdout: (data) => console.log(`[AppPreview Install] ${data.trim()}`),
            onStderr: (data) => {
              const msg = data.trim()
              if (msg.includes('ERR!') || msg.includes('ENOENT') || msg.includes('failed')) {
                console.error(`[AppPreview Install Error] ${msg}`)
              }
            },
          })
          if (installResult.exitCode !== 0) {
            session.status = 'error'
            session.error = `Dependency install failed: ${installResult.stderr?.slice(0, 500)}`
            return json({ sessionId, status: 'error', error: session.error, framework: detectedFramework }, 500)
          }
        } catch (err: any) {
          session.status = 'error'
          session.error = `Dependency install failed: ${err.message?.slice(0, 500)}`
          return json({ sessionId, status: 'error', error: session.error, framework: detectedFramework }, 500)
        }
      } else {
        // Use robust install with automatic retry strategies (same as preview API)
        console.log(`[AppPreview] Installing deps with ${packageManager}...`)
        const installResult = await sandbox.installDependenciesRobust(workingDir, {
          timeoutMs: 0,
          packageManager,
          onStdout: (data) => console.log(`[AppPreview Install] ${data.trim()}`),
          onStderr: (data) => {
            const msg = data.trim()
            if (msg.includes('ERR!') || msg.includes('ENOENT') || msg.includes('failed')) {
              console.error(`[AppPreview Install Error] ${msg}`)
            }
          },
        })

        if (installResult.exitCode !== 0) {
          session.status = 'error'
          session.error = `Dependency install failed: ${installResult.stderr?.slice(0, 500)}`
          return json({ sessionId, status: 'error', error: session.error, framework: detectedFramework }, 500)
        }
      }
      console.log('[AppPreview] Dependencies installed successfully')
    }

    // ── Start dev server (same as preview API) ────────────────────────────
    session.status = 'building'

    let dev = devCommand
    if (!dev) {
      if (detectedFramework === 'nextjs') dev = 'npx next dev -p 3000'
      else if (detectedFramework === 'expo') dev = 'npx expo start --web --port 8081'
      else dev = 'npx vite --host 0.0.0.0 --port 5173'
    }

    console.log(`[AppPreview] Starting dev server: ${dev}`)

    try {
      const serverResult = await sandbox.startDevServer({
        command: dev,
        workingDirectory: workingDir,
        port,
        timeoutMs: 60000,
        onStdout: (data) => console.log(`[AppPreview Dev] ${data.trim()}`),
        onStderr: (data) => console.error(`[AppPreview Dev Error] ${data.trim()}`),
      })

      session.previewUrl = serverResult.url
      session.status = 'running'
      session.lastActivity = new Date()

      console.log(`[AppPreview] Preview ready: ${serverResult.url}`)

      return json({
        sessionId,
        sandboxId: sandbox.id,
        previewUrl: serverResult.url,
        port,
        status: 'running',
        framework: detectedFramework,
      })
    } catch (serverErr: any) {
      // Server didn't become ready in time — still return a URL, it may come up shortly
      console.warn(`[AppPreview] Dev server start warning: ${serverErr.message}`)
      let previewUrl: string | null = null
      try {
        const info = await sandbox.getInfo()
        previewUrl = info?.url || null
      } catch {}

      session.previewUrl = previewUrl
      session.status = 'running'
      session.lastActivity = new Date()

      return json({
        sessionId,
        sandboxId: sandbox.id,
        previewUrl,
        port,
        status: 'running',
        framework: detectedFramework,
        warning: 'Dev server may still be starting up',
      })
    }
  } catch (error: any) {
    console.error('[AppPreview] Error:', error)
    return json({ error: error.message || 'Failed to create preview' }, 500)
  }
}

// ─── GET /api/app-preview?sessionId=xxx — Check session status ───────────────
export async function GET(request: NextRequest) {
  if (!authenticate(request)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    const activeSessions = Array.from(sessions.entries()).map(([id, s]) => ({
      sessionId: id,
      previewUrl: s.previewUrl,
      port: s.port,
      framework: s.framework,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    }))
    return json({ sessions: activeSessions })
  }

  const session = sessions.get(sessionId)
  if (!session) {
    return json({ error: 'Session not found' }, 404)
  }

  session.lastActivity = new Date()
  return json({
    sessionId,
    sandboxId: session.sandboxId,
    previewUrl: session.previewUrl,
    port: session.port,
    framework: session.framework,
    status: session.status,
    error: session.error,
    createdAt: session.createdAt.toISOString(),
  })
}

// ─── DELETE /api/app-preview?sessionId=xxx — Stop a session ──────────────────
export async function DELETE(request: NextRequest) {
  if (!authenticate(request)) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId')
  if (!sessionId) {
    return json({ error: 'sessionId query param required' }, 400)
  }

  const session = sessions.get(sessionId)
  if (!session) {
    return json({ error: 'Session not found' }, 404)
  }

  try {
    await session.sandbox?.kill?.()
  } catch {}
  sessions.delete(sessionId)

  return json({ status: 'stopped', sessionId })
}
