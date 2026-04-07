import { NextRequest, NextResponse } from 'next/server'
import { Sandbox } from 'e2b'

// ─── Config ──────────────────────────────────────────────────────────────────
// Default API key for PiPilot IDE and public integrations.
// Requests must include this key in the Authorization header.
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
          else detectedFramework = 'vite' // Default to Vite
        } catch { detectedFramework = 'vite' }
      } else {
        detectedFramework = 'vite'
      }
    }

    const port = requestedPort || (detectedFramework === 'nextjs' ? 3000 : detectedFramework === 'expo' ? 8081 : 5173)
    const sessionId = existingSessionId || `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // ── Reuse existing sandbox if sessionId provided ──────────────────────
    if (existingSessionId && sessions.has(existingSessionId)) {
      const existing = sessions.get(existingSessionId)!
      existing.lastActivity = new Date()

      try {
        // Write updated files to existing sandbox
        const sandbox = existing.sandbox
        for (const file of files) {
          const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : null
          if (dir) await sandbox.commands.run(`mkdir -p /project/${dir}`, { timeoutMs: 5000 })
          await sandbox.files.write(`/project/${file.path}`, file.content)
        }

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

    const sandbox = await Sandbox.create({
      timeoutMs: 600000, // 10 min sandbox lifetime
      envs: { NODE_ENV: 'development' },
    })

    session.sandboxId = sandbox.sandboxId
    session.sandbox = sandbox

    // ── Write files ───────────────────────────────────────────────────────
    try {
      await sandbox.commands.run('mkdir -p /project', { timeoutMs: 5000 })
    } catch {}

    for (const file of files) {
      try {
        const dir = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : null
        if (dir) await sandbox.commands.run(`mkdir -p /project/${dir}`, { timeoutMs: 5000 })
        await sandbox.files.write(`/project/${file.path}`, file.content)
      } catch (writeErr: any) {
        console.error(`[AppPreview] Failed to write ${file.path}:`, writeErr.message)
        session.status = 'error'
        session.error = `Failed to write file ${file.path}: ${writeErr.message}`
        return json({ sessionId, status: 'error', error: session.error, framework: detectedFramework }, 500)
      }
    }

    // ── Install dependencies ──────────────────────────────────────────────
    session.status = 'installing'

    const hasPackageJson = files.some((f: any) => f.path === 'package.json')
    if (hasPackageJson) {
      const install = installCommand || 'npm install --legacy-peer-deps'
      console.log(`[AppPreview] Installing deps: ${install}`)
      try {
        const installResult = await sandbox.commands.run(`cd /project && ${install}`, { timeoutMs: 180000 })
        if (installResult.exitCode !== 0) {
          session.status = 'error'
          session.error = `Dependency install failed: ${installResult.stderr?.slice(0, 500)}`
          return json({
            sessionId,
            status: 'error',
            error: session.error,
            framework: detectedFramework,
          }, 500)
        }
      } catch (installErr: any) {
        session.status = 'error'
        session.error = `Dependency install failed: ${installErr.message?.slice(0, 500)}`
        console.error('[AppPreview] Install error:', installErr.message)
        return json({
          sessionId,
          status: 'error',
          error: session.error,
          framework: detectedFramework,
        }, 500)
      }
    }

    // ── Start dev server ──────────────────────────────────────────────────
    session.status = 'building'

    let dev = devCommand
    if (!dev) {
      if (detectedFramework === 'nextjs') dev = 'npx next dev -p 3000'
      else if (detectedFramework === 'expo') dev = 'npx expo start --web --port 8081'
      else dev = 'npx vite --host 0.0.0.0 --port 5173'
    }

    console.log(`[AppPreview] Starting dev server: ${dev}`)

    // Start dev server in background (ignore exit errors — it runs until sandbox dies)
    sandbox.commands.run(`cd /project && ${dev}`, { timeoutMs: 600000 }).catch(() => {})

    // Wait for the port to be ready
    const startTime = Date.now()
    let previewUrl: string | null = null
    while (Date.now() - startTime < 60000) { // 60 second timeout
      await new Promise(r => setTimeout(r, 2000))
      try {
        // Use shell exit code check instead of relying on CommandExitError
        const check = await sandbox.commands.run(
          `curl -sf -o /dev/null http://localhost:${port} && echo OK || echo WAIT`,
          { timeoutMs: 5000 }
        )
        if (check.stdout?.trim() === 'OK') {
          previewUrl = `https://${sandbox.getHost(port)}`
          break
        }
      } catch {
        // Sandbox may not have curl yet or command threw — just keep retrying
      }
    }

    if (!previewUrl) {
      // Try to get the URL anyway (some dev servers need more time)
      previewUrl = `https://${sandbox.getHost(port)}`
    }

    session.previewUrl = previewUrl
    session.status = 'running'
    session.lastActivity = new Date()

    console.log(`[AppPreview] Preview ready: ${previewUrl}`)

    return json({
      sessionId,
      sandboxId: sandbox.sandboxId,
      previewUrl,
      port,
      status: 'running',
      framework: detectedFramework,
    })
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
    // List all active sessions
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
