import { NextRequest, NextResponse } from 'next/server'
import {
  createEnhancedSandbox,
  type SandboxFile,
} from '@/lib/e2b-enhanced'

// ─── E2B server config injection ─────────────────────────────────────────────
// Patches vite.config / next.config to bind 0.0.0.0 and allow E2B sandbox domains
// so the dev server port is externally accessible via {port}-{sandboxId}.e2b.app
function injectE2BServerConfig(files: any[], framework: string, port: number) {
  if (framework === 'vite') {
    const viteConfig = files.find((f: any) =>
      /^vite\.config\.(js|ts|mjs|mts)$/.test(f.path)
    )
    if (viteConfig) {
      // Check if server config already exists
      if (!viteConfig.content.includes('server:') && !viteConfig.content.includes("server :")) {
        // Inject server block into defineConfig
        viteConfig.content = viteConfig.content.replace(
          /defineConfig\s*\(\s*\{/,
          `defineConfig({\n  server: {\n    host: '0.0.0.0',\n    port: ${port},\n    strictPort: true,\n    cors: true,\n    allowedHosts: ['localhost', '127.0.0.1', '.e2b.app', '.e2b.dev'],\n    hmr: { host: 'localhost' },\n  },`
        )
        console.log('[AppPreview] Injected E2B server config into vite.config')
      } else {
        // Server block exists — ensure host is 0.0.0.0
        if (!viteConfig.content.includes("host:") || viteConfig.content.includes("host: 'localhost'")) {
          viteConfig.content = viteConfig.content.replace(
            /host:\s*['"][^'"]*['"]/,
            "host: '0.0.0.0'"
          )
          console.log('[AppPreview] Patched vite.config server.host to 0.0.0.0')
        }
        // Ensure allowedHosts includes e2b
        if (!viteConfig.content.includes('.e2b.')) {
          viteConfig.content = viteConfig.content.replace(
            /server:\s*\{/,
            "server: {\n    allowedHosts: ['.e2b.app', '.e2b.dev'],"
          )
          console.log('[AppPreview] Added E2B allowedHosts to vite.config')
        }
      }
    } else {
      // No vite config — create one with E2B settings
      files.push({
        path: 'vite.config.js',
        content: `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  server: {\n    host: '0.0.0.0',\n    port: ${port},\n    strictPort: true,\n    cors: true,\n    allowedHosts: ['localhost', '127.0.0.1', '.e2b.app', '.e2b.dev'],\n    hmr: { host: 'localhost' },\n  },\n})\n`,
      })
      console.log('[AppPreview] Created vite.config.js with E2B server settings')
    }
  }

  if (framework === 'nextjs') {
    const nextConfig = files.find((f: any) =>
      /^next\.config\.(js|ts|mjs|mts)$/.test(f.path)
    )
    if (nextConfig) {
      // Ensure hostname 0.0.0.0 — Next.js uses the CLI flag, but we also set experimental
      if (!nextConfig.content.includes('hostname')) {
        console.log('[AppPreview] Next.js config found — will use --hostname 0.0.0.0 CLI flag')
      }
    }
  }
}

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

function cleanupSessions() {
  const cutoff = Date.now() - 30 * 60 * 1000
  for (const [id, session] of sessions) {
    if (session.lastActivity.getTime() < cutoff) {
      try { session.sandbox?.terminate?.() } catch {}
      sessions.delete(id)
    }
  }
}

// ─── POST /api/app-preview — Create a new preview session ────────────────────
//
// Body: {
//   files: [{ path: string, content: string }],
//   framework?: 'vite' | 'nextjs' | 'expo' | 'auto',
//   installCommand?: string,
//   devCommand?: string,
//   port?: number,
//   sessionId?: string,
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
    const defaultPort = detectedFramework === 'nextjs' ? 3000 : isExpoProject ? 8081 : 5173
    const port = requestedPort || defaultPort
    const workingDir = isExpoProject ? '/home/user' : '/project'
    const sessionId = existingSessionId || `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // ── Detect package manager ────────────────────────────────────────────
    const hasPnpmLock = files.some((f: any) => f.path === 'pnpm-lock.yaml')
    const hasYarnLock = files.some((f: any) => f.path === 'yarn.lock')
    const packageManager = isExpoProject ? 'yarn' : (hasPnpmLock ? 'pnpm' : hasYarnLock ? 'yarn' : 'pnpm')

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
      } catch {
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

    const sandbox = await createEnhancedSandbox({
      template: 'pipilot-expo',
      timeoutMs: 600000,
      env: { NODE_ENV: 'development' },
    })

    session.sandboxId = sandbox.id
    session.sandbox = sandbox

    // ── Inject E2B-compatible server config before writing ──────────────────
    injectE2BServerConfig(files, detectedFramework, port)

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
      return json({ sessionId, status: 'error', error: session.error, framework: detectedFramework }, 500)
    }
    console.log(`[AppPreview] Files written: ${fileResult.successCount}/${fileResult.totalFiles}`)

    // ── Install dependencies (same as preview API) ────────────────────────
    session.status = 'installing'

    const hasPackageJson = files.some((f: any) => f.path === 'package.json')
    if (hasPackageJson) {
      if (installCommand) {
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
        console.log(`[AppPreview] Installing deps with ${packageManager} (robust)...`)
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

    // ── Start dev server ──────────────────────────────────────────────────
    session.status = 'building'

    // Build the dev command — always bind to 0.0.0.0 so E2B can expose the port
    let dev = devCommand
    if (!dev) {
      if (detectedFramework === 'nextjs') {
        dev = `npx next dev --hostname 0.0.0.0 -p ${port}`
      } else if (detectedFramework === 'expo') {
        dev = 'npx expo start --web'
      } else {
        // Vite: run directly via npx, bind 0.0.0.0 so E2B exposes the port
        dev = `npx vite --host 0.0.0.0 --port ${port}`
      }
    }

    // If user provided a custom devCommand, ensure it binds to 0.0.0.0
    if (dev && !dev.includes('--host') && !dev.includes('--hostname')) {
      if (detectedFramework === 'vite') dev = `${dev} --host 0.0.0.0`
      else if (detectedFramework === 'nextjs') dev = `${dev} --hostname 0.0.0.0`
    }

    console.log(`[AppPreview] Starting dev server: ${dev}`)

    try {
      const devServer = await sandbox.startDevServer({
        command: dev,
        workingDirectory: workingDir,
        port,
        timeoutMs: 120000, // 2 min timeout for server readiness
        envVars: {
          PORT: port.toString(),
          HOST: '0.0.0.0',
          ...(isExpoProject ? { EXPO_NO_TELEMETRY: '1', EXPO_NO_REDIRECT: '1' } : {}),
        },
        onStdout: (data) => console.log(`[AppPreview Dev] ${data.trim()}`),
        onStderr: (data) => console.error(`[AppPreview Dev Error] ${data.trim()}`),
      })

      session.previewUrl = devServer.url
      session.status = 'running'
      session.lastActivity = new Date()

      console.log(`[AppPreview] Preview ready: ${devServer.url}`)

      return json({
        sessionId,
        sandboxId: sandbox.id,
        previewUrl: devServer.url,
        port,
        status: 'running',
        framework: detectedFramework,
      })
    } catch (serverErr: any) {
      // Server readiness check timed out — try to find which port IS running
      console.warn(`[AppPreview] Dev server readiness timed out: ${serverErr.message}`)
      console.log(`[AppPreview] Scanning for any running port...`)

      let foundPort: number | null = null
      let previewUrl: string | null = null

      try {
        // Scan common dev server ports to find which one is actually running
        const portsToScan = [port, 3000, 3001, 5173, 5174, 4173, 8080, 8081, 8000]
        const scanResult = await sandbox.executeCommand(
          `netstat -tln 2>/dev/null | grep -oP ':\\K[0-9]+(?=\\s)' | sort -un || ss -tln 2>/dev/null | grep -oP ':\\K[0-9]+(?=\\s)' | sort -un || echo "NO_PORTS"`,
          { timeoutMs: 5000 }
        )

        if (scanResult.stdout && !scanResult.stdout.includes('NO_PORTS')) {
          const listeningPorts = scanResult.stdout.trim().split('\n').map(p => parseInt(p.trim())).filter(p => !isNaN(p))
          console.log(`[AppPreview] Listening ports found: ${listeningPorts.join(', ')}`)

          // Prefer the requested port, then common dev ports
          for (const candidate of portsToScan) {
            if (listeningPorts.includes(candidate)) {
              foundPort = candidate
              break
            }
          }

          // If none of the common ports match, use the first non-system port
          if (!foundPort) {
            foundPort = listeningPorts.find(p => p > 1024) || null
          }
        }
      } catch {
        console.warn('[AppPreview] Port scan failed')
      }

      // Build the URL from whatever port we found (or the original requested port)
      const effectivePort = foundPort || port
      try {
        const info = await sandbox.getInfo()
        if (info?.url) {
          // Replace port in URL if needed
          previewUrl = info.url.replace(/:\d+/, `:${effectivePort}`)
        }
      } catch {}

      // Fallback: construct URL manually using E2B convention
      if (!previewUrl) {
        previewUrl = `https://${effectivePort}-${sandbox.id}.e2b.dev`
      }

      session.previewUrl = previewUrl
      session.port = effectivePort
      session.status = 'running'
      session.lastActivity = new Date()

      console.log(`[AppPreview] Returning URL with ${foundPort ? 'detected' : 'requested'} port ${effectivePort}: ${previewUrl}`)

      return json({
        sessionId,
        sandboxId: sandbox.id,
        previewUrl,
        port: effectivePort,
        status: 'running',
        framework: detectedFramework,
        portDetected: !!foundPort,
        warning: foundPort
          ? `Dev server detected on port ${foundPort} (requested ${port})`
          : 'Dev server may still be starting up',
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

  // If session is running, check for port changes (server may have started on a different port)
  if (session.status === 'running' && session.sandbox) {
    try {
      const scanResult = await session.sandbox.executeCommand(
        `netstat -tln 2>/dev/null | grep -oP ':\\K[0-9]+(?=\\s)' | sort -un || ss -tln 2>/dev/null | grep -oP ':\\K[0-9]+(?=\\s)' | sort -un || echo ""`,
        { timeoutMs: 3000 }
      )
      if (scanResult.stdout?.trim()) {
        const listeningPorts = scanResult.stdout.trim().split('\n').map((p: string) => parseInt(p.trim())).filter((p: number) => !isNaN(p) && p > 1024)
        if (listeningPorts.length > 0) {
          const commonPorts = [session.port, 3000, 5173, 8080, 8081]
          const bestPort = commonPorts.find(p => p && listeningPorts.includes(p)) || listeningPorts[0]
          if (bestPort && bestPort !== session.port) {
            session.port = bestPort
            session.previewUrl = `https://${bestPort}-${session.sandboxId}.e2b.dev`
            console.log(`[AppPreview] Updated session port to ${bestPort}`)
          }
        }
      }
    } catch {}
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
    await session.sandbox?.terminate?.()
  } catch {}
  sessions.delete(sessionId)

  return json({ status: 'stopped', sessionId })
}
