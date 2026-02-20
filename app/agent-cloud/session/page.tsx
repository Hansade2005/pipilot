"use client"

import React, { useState, useRef, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Copy,
  Check,
  Bot,
  Sparkles,
  ArrowUp,
  Terminal,
  FileEdit,
  FileText,
  FileUp,
  FolderSearch,
  Search,
  Globe,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Server,
  Plug,
  ListTodo,
  CircleCheck,
  CircleDot,
  Circle,
  FileCode,
  Eye,
  Plus,
  Minus,
  Square,
  RotateCw,
  ImageIcon,
  Monitor,
  X,
} from "lucide-react"
import { useAgentCloud, MODELS, DEFAULT_MCPS, DEFAULT_CONNECTORS, type TerminalLine } from "../layout"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Response } from "@/components/ai-elements/response"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import { usePageTitle } from '@/hooks/use-page-title'

// SSE message types - includes SDK messages plus streaming-specific event types
interface SSEMessage {
  type: 'start' | 'log' | 'heartbeat' | 'text' | 'stdout' | 'tool_use' | 'tool_result' | 'result' | 'stderr' | 'complete' | 'error' | 'user' | 'system' | 'assistant' | 'content_block_delta' | 'content_block_start'
  // SDK message fields
  message?: any
  session_id?: string
  parent_tool_use_id?: string | null
  total_cost_usd?: number
  usage?: any
  duration_ms?: number
  duration_api_ms?: number
  is_error?: boolean
  num_turns?: number
  // Streaming-specific fields
  data?: string
  name?: string
  input?: any
  result?: any
  subtype?: 'success' | 'error' | 'error_max_turns' | 'error_during_execution' | 'init'
  cost?: number
  timestamp?: number
  diffStats?: {
    additions: number
    deletions: number
  }
  messageCount?: number
  delta?: {
    text?: string
  }
  content_block?: {
    type?: string
    name?: string
  }
}

// Rotating thinking phrases - fun, entertaining sentences shown while AI streams
const SPINNER_PHRASES = [
  // Claude/AI specific
  'Teaching Claude a new trick',
  'Claude is in the zone right now',
  'Warming up the neural networks',
  'Untangling the attention layers',
  'Asking Claude politely for the answer',
  'Claude is reading the docs so you don\'t have to',
  'Consulting the transformer spirits',
  'Running through a few billion parameters',
  'Claude is thinking really hard about this',
  'Tokenizing your brilliance',
  'Feeding tokens to the model',
  'Claude is having a eureka moment',
  'Navigating the latent space',
  'Processing at the speed of thought',
  'Claude just said "hold my tokens"',
  // Coding/developer humor
  'Converting caffeine into code',
  'Debugging the universe, one line at a time',
  'Looking for that missing semicolon',
  'Compiling your dreams into reality',
  'Refactoring the space-time continuum',
  'Resolving dependencies... and existential crises',
  'git commit -m "making magic happen"',
  'npm install awesome-features',
  'Pushing pixels into place',
  'Writing code that writes code',
  'Turning your words into working software',
  'Deploying brilliance to production',
  'Squashing bugs before they hatch',
  'Crafting components with care',
  'Optimizing for maximum awesomeness',
  'Building something beautiful',
  'Spinning up the dev server in my mind',
  'Running prettier on the universe',
  'Linting reality for errors',
  'Hot-reloading your ideas',
  // PiPilot/app building themed
  'Your app is taking shape',
  'Vibe coding in progress',
  'Architecting your next big thing',
  'Turning conversation into creation',
  'From chat to code in seconds',
  'Building at the speed of imagination',
  'Making your app dreams come true',
  'Shipping features, not excuses',
  'Your personal dev team is on it',
  'Crafting pixel-perfect solutions',
  // Fun and witty
  'Brewing fresh bytes just for you',
  'Polishing the algorithms until they shine',
  'Summoning the cloud wizards',
  'Engaging the improbability drive',
  'Channeling the Force... of good code',
  'Calibrating the flux capacitor',
  'Loading wit.exe... please stand by',
  'Assembling the Avengers of code',
  'Performing digital sorcery',
  'Reticulating splines, as is tradition',
  'Hold tight, genius at work',
  'Cooking up something special',
  'Mixing the secret sauce',
  'Charging the creativity laser',
  'Aligning the stars for your project',
  'Making the hamsters run faster',
  'This is where the magic happens',
  'Working harder than a git merge on a Monday',
  'Almost there... probably',
  'Doing science, please wait',
  'Training the code monkeys',
  'Generating something you\'ll love',
  'Sprinkling some AI magic dust',
  'One moment, crafting perfection',
  'Good things come to those who wait',
  'The best code is worth waiting for',
  'Patience... greatness is loading',
  'Hang tight, this is gonna be good',
  'Thinking outside the sandbox',
  'Making bits and bytes dance',
  'Orchestrating a symphony of code',
  'Weaving logic into elegance',
  'Conjuring solutions from thin air',
  'Transmuting ideas into features',
  'Distilling your vision into code',
]

// Lightweight regex-based syntax highlighter for code in tool outputs
// Uses indexed groups to stay compatible with ES2015 target
// Token rules: [regex, colorClass]  — ordered by priority (first match wins)
const SYNTAX_RULES: Array<[RegExp, string]> = [
  // Comments
  [/\/\/.*$/, 'text-gray-500 italic'],
  [/\/\*[\s\S]*?\*\//, 'text-gray-500 italic'],
  // Strings
  [/"(?:[^"\\]|\\.)*"/, 'text-amber-300/90'],
  [/'(?:[^'\\]|\\.)*'/, 'text-amber-300/90'],
  [/`(?:[^`\\]|\\.)*`/, 'text-amber-300/90'],
  // Keywords
  [/\b(?:import|export|from|default|return|const|let|var|function|async|await|class|extends|implements|interface|type|enum|new|this|super|if|else|switch|case|break|continue|for|while|do|try|catch|finally|throw|typeof|instanceof|in|of|void|delete|yield|as|is|readonly|declare|namespace|module|require|static|get|set|public|private|protected|abstract|override)\b/, 'text-purple-400'],
  // Booleans / null / undefined
  [/\b(?:true|false|null|undefined|NaN|Infinity)\b/, 'text-orange-400'],
  // Numbers
  [/\b(?:0[xXoObB][\da-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)\b/, 'text-cyan-300'],
  // JSX / HTML tags
  [/<\/?[A-Z][\w.]*/, 'text-red-400'],
  [/<\/?(?:div|span|button|input|form|img|a|p|h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody|nav|header|footer|section|main|article|aside|pre|code|label|select|option|textarea)(?=[\s/>])/, 'text-red-400'],
  // Decorators
  [/@\w+/, 'text-yellow-400'],
  // Type references (PascalCase followed by space, <, (, .)
  [/\b[A-Z][\w]*(?=[\s<(.])/, 'text-teal-300'],
  // Operators
  [/=>|===|!==|==|!=|<=|>=|&&|\|\||[+\-*/%]=?|\.{3}|[<>?:!&|^~]/, 'text-pink-400/80'],
  // Punctuation
  [/[{}()[\];,]/, 'text-gray-500'],
]

const highlightSyntax = (code: string, baseClass?: string): React.ReactNode => {
  if (!code) return ' '

  const parts: React.ReactNode[] = []
  let remaining = code
  let pos = 0

  while (remaining.length > 0) {
    let bestMatch: { idx: number; len: number; color: string } | null = null

    for (const [pattern, color] of SYNTAX_RULES) {
      // Reset and match from the start of remaining
      const re = new RegExp(pattern.source, 'm')
      const m = re.exec(remaining)
      if (m && (bestMatch === null || m.index < bestMatch.idx || (m.index === bestMatch.idx && m[0].length > bestMatch.len))) {
        bestMatch = { idx: m.index, len: m[0].length, color }
      }
    }

    if (!bestMatch || bestMatch.idx === -1) {
      // No more matches, push rest as plain
      parts.push(<span key={`p${pos}`} className={baseClass}>{remaining}</span>)
      break
    }

    // Push text before the match
    if (bestMatch.idx > 0) {
      parts.push(<span key={`p${pos}`} className={baseClass}>{remaining.slice(0, bestMatch.idx)}</span>)
    }

    // Push the highlighted token
    parts.push(
      <span key={`h${pos + bestMatch.idx}`} className={bestMatch.color}>
        {remaining.slice(bestMatch.idx, bestMatch.idx + bestMatch.len)}
      </span>
    )

    pos += bestMatch.idx + bestMatch.len
    remaining = remaining.slice(bestMatch.idx + bestMatch.len)
  }

  return parts.length > 0 ? <>{parts}</> : <span className={baseClass}>{code}</span>
}

// Max lines before truncation
const MAX_LINES_COLLAPSED = 8

function SessionPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('id')

  const {
    sessions,
    setSessions,
    storedTokens,
    connectors,
    setConnectors,
    selectedModel,
    setSelectedModel,
    loadSessionMessages,
  } = useAgentCloud()

  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRecreating, setIsRecreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set())
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set())
  const [spinnerPhrase, setSpinnerPhrase] = useState(() => SPINNER_PHRASES[Math.floor(Math.random() * SPINNER_PHRASES.length)])
  const [attachedImages, setAttachedImages] = useState<Array<{ data: string; type: string; name: string }>>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [commandMenuView, setCommandMenuView] = useState<'main' | 'mcp'>('main')
  const [mcpToggles, setMcpToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_MCPS.map(mcp => [mcp.id, true]))
  )
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; content: string; size: number }>>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const combinedFileInputRef = useRef<HTMLInputElement>(null)
  const commandMenuRef = useRef<HTMLDivElement>(null)

  // Screen recording state and refs - must be defined before runPrompt which uses them
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)

  // Helper: Capture current frame from active screen share stream
  // Must be defined before runPrompt which uses it
  const captureCurrentFrame = useCallback(async (): Promise<{ data: string; type: string; name: string } | null> => {
    if (!mediaStreamRef.current || !isScreenSharing) return null

    try {
      // Use existing video element or create one
      let video = videoElementRef.current
      if (!video) {
        video = document.createElement('video')
        video.srcObject = mediaStreamRef.current
        video.muted = true
        videoElementRef.current = video
        await video.play()
      }

      // Capture current frame
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      const base64 = canvas.toDataURL('image/png').split(',')[1]

      return {
        data: base64,
        type: 'image/png',
        name: `screen-${Date.now()}.png`
      }
    } catch (error) {
      console.error('[Screen Capture] Failed to capture frame:', error)
      return null
    }
  }, [isScreenSharing])

  // Rotate spinner phrase every 5 seconds while streaming
  useEffect(() => {
    if (!isStreaming || isRecreating) return
    const interval = setInterval(() => {
      setSpinnerPhrase(SPINNER_PHRASES[Math.floor(Math.random() * SPINNER_PHRASES.length)])
    }, 5000)
    return () => clearInterval(interval)
  }, [isStreaming, isRecreating])

  const toggleToolExpanded = (index: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const terminalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Find the active session
  const activeSession = sessions.find(s => s.id === sessionId) || null
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  // Lazy-load messages from Supabase when opening a session
  useEffect(() => {
    if (sessionId && activeSession && activeSession.lines.length === 0 && !activeSession.pendingPrompt) {
      setIsLoadingMessages(true)
      loadSessionMessages(sessionId).finally(() => setIsLoadingMessages(false))
    }
  }, [sessionId, activeSession?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect to new page if session was deleted (sessions loaded but ID not found)
  useEffect(() => {
    // Only check after sessions have been loaded (non-empty array means hydrated from localStorage)
    if (sessionId && sessions.length > 0 && !activeSession) {
      router.push('/agent-cloud/new')
    }
  }, [sessionId, sessions, activeSession, router])

  // Claude, GPT, and Devstral models support image input
  const modelName = activeSession?.model || ''
  const supportsImages = modelName.includes('claude') || modelName.includes('gpt') || modelName.includes('devstral')

  // Resolve current model display from session or context
  const currentModelId = activeSession?.model || selectedModel
  const currentModelInfo = MODELS.find(m => m.id === currentModelId)

  // Handle model change - updates context and session
  const handleModelChange = useCallback((modelId: 'sonnet' | 'opus' | 'haiku' | 'flash') => {
    setSelectedModel(modelId)
    if (sessionId) {
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, model: modelId } : s
      ))
    }
  }, [sessionId, setSessions, setSelectedModel])

  // Recreate sandbox with conversation history
  const recreateSandbox = useCallback(async (pendingPrompt?: string) => {
    if (!activeSession) return null

    setIsRecreating(true)

    // Add system message about recreating
    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, lines: [...s.lines, { type: 'system' as const, content: 'Session expired. Reconnecting...', timestamp: new Date() }] }
        : s
    ))

    try {
      // Create a new sandbox with same repo config
      const recreateHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (storedTokens.github) {
        recreateHeaders['X-GitHub-Token'] = storedTokens.github
      }

      const response = await fetch('/api/agent-cloud', {
        method: 'POST',
        headers: recreateHeaders,
        body: JSON.stringify({
          action: 'create',
          config: {
            model: activeSession.model || 'sonnet',
            ...(activeSession.isNewProject ? {
              newProject: { name: activeSession.newProjectName || 'project' },
            } : {
              repo: activeSession.repo ? {
                full_name: activeSession.repo.full_name,
                branch: activeSession.repo.branch
              } : undefined,
            }),
            initialPrompt: activeSession.title || activeSession.lines.find(l => l.type === 'input')?.content || 'resumed-session',
            connectors: connectors
              .filter(c => c.enabled && c.fields.every(f => f.value.trim()))
              .map(c => ({
                id: c.id,
                type: c.type,
                mcpUrl: c.mcpUrl,
                fields: Object.fromEntries(c.fields.map(f => [f.key, f.value]))
              })),
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to recreate sandbox')
      }

      const data = await response.json()
      const newSandboxId = data.sandboxId

      // Convert frontend lines to conversation history format
      const conversationHistory = activeSession.lines
        .filter(l => l.type === 'input' || l.type === 'output')
        .map(l => ({
          role: l.type === 'input' ? 'user' as const : 'assistant' as const,
          content: l.content,
          timestamp: l.timestamp
        }))

      // Restore conversation history to the new sandbox
      if (conversationHistory.length > 0) {
        await fetch('/api/agent-cloud', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'restore',
            sandboxId: newSandboxId,
            conversationHistory
          })
        })
      }

      // Update session with new sandbox ID
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? {
              ...s,
              sandboxId: newSandboxId,
              lines: [...s.lines, { type: 'system' as const, content: 'Reconnected successfully. You can continue your conversation.', timestamp: new Date() }]
            }
          : s
      ))

      setIsRecreating(false)
      return newSandboxId
    } catch (error) {
      console.error('Failed to recreate sandbox:', error)
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, lines: [...s.lines, { type: 'error' as const, content: 'Failed to reconnect. Please start a new session.', timestamp: new Date() }] }
          : s
      ))
      setIsRecreating(false)
      return null
    }
  }, [activeSession, sessionId, setSessions, storedTokens])

  // Redirect if session not found
  useEffect(() => {
    if (sessionId && sessions.length > 0 && !activeSession) {
      router.push('/agent-cloud/new')
    }
  }, [sessionId, sessions, activeSession, router])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [activeSession?.lines])

  // Ref for tracking processed pending prompts (defined here, used in effect after runPrompt)
  const pendingPromptProcessedRef = useRef<Set<string>>(new Set())

  // Focus input
  useEffect(() => {
    if (activeSession && inputRef.current && !activeSession.pendingPrompt) {
      inputRef.current.focus()
    }
  }, [activeSession])

  // Auto-resize textarea (limited height)
  useEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 44), 120)
    textarea.style.height = `${newHeight}px`
  }, [prompt])

  // Close command menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (commandMenuRef.current && !commandMenuRef.current.contains(e.target as Node)) {
        setShowCommandMenu(false)
        setCommandMenuView('main')
      }
    }
    if (showCommandMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCommandMenu])

  const removeFile = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id))
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // Run prompt with GitHub token passed to AI
  const runPrompt = useCallback(async (overridePrompt?: string, overrideSandboxId?: string, overrideImages?: Array<{ data: string; type: string; name: string }>) => {
    if (!activeSession || isLoading || isRecreating) return

    // If screen sharing is active and no override images, capture fresh frame
    // This ensures we always get the current view (including any scrolling)
    let imagesToUse = overrideImages || attachedImages
    if (!overrideImages && isScreenSharing && mediaStreamRef.current) {
      const freshFrame = await captureCurrentFrame()
      if (freshFrame) {
        // Replace any existing screen captures with the fresh one
        const nonScreenImages = attachedImages.filter(img => !img.name.startsWith('screen-') && !img.name.startsWith('screenshot-'))
        imagesToUse = [...nonScreenImages, freshFrame]
        console.log('[Screen Capture] Captured fresh frame before sending')
      }
    }

    const currentPrompt = overridePrompt || prompt.trim()
    if (!currentPrompt && imagesToUse.length === 0 && attachedFiles.length === 0) return

    const sandboxIdToUse = overrideSandboxId || activeSession.sandboxId

    if (!overridePrompt) {
      setPrompt('')
    }
    setIsLoading(true)
    setIsStreaming(true)

    // Create AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    // Update session title if first message
    if (!overridePrompt && activeSession.lines.filter(l => l.type === 'input').length === 0) {
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, title: currentPrompt.slice(0, 50) + (currentPrompt.length > 50 ? '...' : '') }
          : s
      ))
    }

    // Add input line with images (skip only if this is a retry after sandbox recreation)
    // overrideSandboxId is only provided during recreation retries
    if (!overrideSandboxId) {
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, lines: [...s.lines, {
              type: 'input' as const,
              content: currentPrompt,
              timestamp: new Date(),
              images: imagesToUse.length > 0 ? imagesToUse.map(img => ({ data: img.data, type: img.type })) : undefined,
            }] }
          : s
      ))
    }

    // Clear attached images after storing them in the message
    if (imagesToUse === attachedImages && attachedImages.length > 0) {
      setAttachedImages([])
    }

    try {
      // Build prompt with context for AI operations
      let enhancedPrompt = currentPrompt

      // Build connector context - tell AI what tools/CLIs are available
      const enabledConnectors = connectors.filter(c => c.enabled && c.fields.every(f => f.value.trim()))
      let connectorContext = ''

      if (enabledConnectors.length > 0) {
        const connectorDescriptions = enabledConnectors.map(c => {
          switch (c.id) {
            case 'neon':
              return `- **Neon CLI (neonctl)**: Serverless Postgres database management. Your NEON_API_KEY is configured. Use \`neonctl\` commands to create databases, branches, run SQL, etc. Example: \`neonctl projects list\`, \`neonctl databases create\``
            case 'vercel':
              return `- **Vercel CLI**: Deploy and manage apps on Vercel. Your VERCEL_TOKEN is configured. Use \`vercel\` commands. Example: \`vercel deploy\`, \`vercel env\``
            case 'netlify':
              return `- **Netlify CLI**: Deploy static sites. Your NETLIFY_AUTH_TOKEN is configured. Use \`netlify\` commands. Example: \`netlify deploy\`, \`netlify sites:list\``
            case 'npm':
              return `- **npm**: Publish packages. Your NPM_TOKEN is configured in ~/.npmrc. You can publish packages with \`npm publish\``
            case 'cloudflare':
              return `- **Cloudflare Wrangler**: Deploy Workers and Pages. Your CLOUDFLARE_API_TOKEN is configured. Use \`wrangler\` commands. Example: \`wrangler deploy\`, \`wrangler pages\``
            case 'railway':
              return `- **Railway CLI**: Deploy apps on Railway. Your RAILWAY_TOKEN is configured. Use \`railway\` commands. Example: \`railway deploy\`, \`railway up\``
            case 'turso':
              return `- **Turso CLI**: SQLite edge databases. Your auth token is configured. Use \`turso\` commands. Example: \`turso db create\`, \`turso db shell\``
            case 'supabase':
              return `- **Supabase MCP**: Database, auth, and storage via Supabase. Your project is connected. Use Supabase MCP tools for database operations.`
            default:
              return `- **${c.name}**: Configured and ready to use`
          }
        })

        connectorContext = `

[Available Tools & Services]
The following CLI tools and services are configured and authenticated - you can use them directly:
${connectorDescriptions.join('\n')}

`
      }

      if (activeSession.isNewProject && storedTokens.github) {
        // New project mode: instruct AI to create repo and build from scratch
        enhancedPrompt = `[New Project - Build From Scratch]
You are building a brand new project from scratch. This is NOT an existing codebase.

IMPORTANT SETUP INSTRUCTIONS (do this FIRST before writing any code):
1. Use the GitHub MCP tool to create a new repository named "${activeSession.newProjectName}" on GitHub.
   - Use the create_repository function with name: "${activeSession.newProjectName}"
   - Make it a public repository unless the user specifies otherwise
2. After the repo is created, run these commands to set up the remote:
   git remote add origin https://x-access-token:${storedTokens.github}@github.com/USER/${activeSession.newProjectName}.git
   (Replace USER with the authenticated GitHub username - you can get this from the GitHub MCP whoami or get_me tool)
3. After setting up the remote, make an initial commit and push immediately:
   git add -A && git commit -m "Initial project setup" && git push -u origin main
4. Build the project as requested by the user
5. COMMIT AND PUSH INCREMENTALLY as you build - after each meaningful step (new component, feature, config change), commit and push right away. Do NOT wait until everything is done. This protects against session disconnects or credit exhaustion.

GitHub Token: ${storedTokens.github}
Working Directory: /home/user/
${connectorContext}
User Request: ${currentPrompt}`
      } else if (storedTokens.github && activeSession.repo) {
        // Existing repo mode
        enhancedPrompt = `[GitHub Context - Use this for any GitHub operations if needed]
- Repository: ${activeSession.repo.full_name}
- Branch: ${activeSession.repo.branch}
- GitHub Token: ${storedTokens.github}
- Clone URL: https://${storedTokens.github}@github.com/${activeSession.repo.full_name}.git
${connectorContext}
User Request: ${currentPrompt}`
      } else if (connectorContext) {
        // No GitHub but has connectors
        enhancedPrompt = `${connectorContext}
User Request: ${currentPrompt}`
      }

      // Add Playwright setup instructions if enabled
      if (mcpToggles['playwright']) {
        enhancedPrompt += `\n\n[Playwright Browser Testing - ENABLED]
The user has enabled Playwright for browser testing. When setting up browser testing:
1. Install Playwright as a dev dependency: pnpm add -D @playwright/test
2. Install Playwright Chromium browser from the project directory: pnpm exec playwright install chromium
3. Create playwright.config.ts in the project root:
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI },
});
4. Create a tests/ directory and write test files as needed
5. Run tests with: pnpm exec playwright test
Use the Playwright MCP server for browser automation, interaction, and visual testing.`
      }

      // Add attached file contents as context
      if (attachedFiles.length > 0) {
        const fileContext = attachedFiles.map(f => `[Attached File: ${f.name} (${(f.size / 1024).toFixed(1)}KB)]\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')
        enhancedPrompt = `${fileContext}\n\n${enhancedPrompt}`
        setAttachedFiles([])
      }

      // Pass GitHub token via header as fallback for server-side clone auth
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      }
      if (storedTokens.github) {
        headers['X-GitHub-Token'] = storedTokens.github
      }

      // Try direct E2B streaming first (bypasses Vercel timeout)
      // This allows streams to run indefinitely without 5-minute timeout
      let response: Response
      let usingDirectStream = false

      try {
        // Step 1: Start the stream server in E2B and get the direct URL
        console.log('[Agent Cloud] Starting direct E2B stream server...')
        const streamServerResponse = await fetch('/api/agent-cloud', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start-stream-server',
            sandboxId: sandboxIdToUse,
          }),
        })

        if (streamServerResponse.ok) {
          const { streamUrl } = await streamServerResponse.json()
          console.log('[Agent Cloud] Direct stream URL:', streamUrl)

          // Step 2: Connect directly to E2B for streaming (no Vercel proxy)
          response = await fetch(`${streamUrl}/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
              prompt: enhancedPrompt,
              images: imagesToUse.length > 0 ? imagesToUse : undefined,
            }),
            signal: controller.signal,
          })
          usingDirectStream = true
          console.log('[Agent Cloud] Using direct E2B streaming (no Vercel timeout)')
        } else {
          throw new Error('Failed to start stream server')
        }
      } catch (directStreamError) {
        // Fallback to proxied streaming through Vercel (has 5-min timeout)
        console.log('[Agent Cloud] Direct stream failed, falling back to Vercel proxy:', directStreamError)
        response = await fetch('/api/agent-cloud', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: 'stream',
              sandboxId: sandboxIdToUse,
              prompt: enhancedPrompt,
              images: imagesToUse.length > 0 ? imagesToUse : undefined,
            }),
            signal: controller.signal,
          }
        )
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || 'Failed to connect to agent'

        // Auto-recreate sandbox if expired/not found (404) - only if not already a retry
        if (!overrideSandboxId && response.status === 404 && (errorMsg.includes('not found') || errorMsg.includes('expired'))) {
          console.log('[Agent Cloud] Sandbox expired (404), auto-recreating...')
          const newSandboxId = await recreateSandbox()
          if (newSandboxId) {
            // Build prompt with conversation history context for continuity
            const historyLines = activeSession.lines
              .filter(l => l.type === 'input' || l.type === 'output')
              .slice(-12) // Last 6 pairs (12 messages) for context
            let contextPrompt = currentPrompt
            if (historyLines.length > 0) {
              const historyContext = historyLines
                .map(l => `${l.type === 'input' ? 'User' : 'Assistant'}: ${l.content.length > 800 ? l.content.substring(0, 800) + '...[truncated]' : l.content}`)
                .join('\n\n')
              contextPrompt = `[Conversation History - This is a resumed session after reconnection]\n${historyContext}\n\n[Current Request]\n${currentPrompt}`
            }
            setIsLoading(false)
            setIsStreaming(false)
            runPrompt(contextPrompt, newSandboxId)
            return
          }
        }

        throw new Error(errorMsg)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream available')
      }

      const decoder = new TextDecoder()
      let fullOutput = ''
      let hasReceivedData = false
      let lastEventWasToolResult = false // Track if we need to start a new output message
      let sseBuffer = '' // Buffer for incomplete SSE messages

      // Direct update function - no throttling for real-time streaming
      const updateOutput = (newText: string) => {
        // If last event was a tool_result, start a NEW output message
        // This prevents text from accumulating across turns
        if (lastEventWasToolResult) {
          fullOutput = '' // Reset for new turn
          lastEventWasToolResult = false
        }

        // Append new text to accumulated output for this turn
        fullOutput += newText

        // Update UI immediately
        setSessions(prev => prev.map(s => {
          if (s.id === sessionId) {
            const lines = [...s.lines]
            const lastLine = lines[lines.length - 1]

            // Only append to last output if it exists AND we're continuing the same turn
            // If the last line is a tool, we need to create a new output line
            if (lastLine && lastLine.type === 'output' && fullOutput.length > newText.length) {
              // Update existing output line (same turn, accumulating)
              lines[lines.length - 1] = { ...lastLine, content: fullOutput }
            } else {
              // Create new output line (new turn after tool, or first output)
              lines.push({ type: 'output', content: fullOutput, timestamp: new Date() })
            }
            return { ...s, lines }
          }
          return s
        }))
      }

      // Helper function to process SSE message
      const processMessage = async (data: SSEMessage): Promise<boolean> => {
        // Only log meaningful message types
        if (!['user', 'system', 'heartbeat'].includes(data.type)) {
          console.log('[Agent Cloud] Message received:', data.type, data.data?.substring?.(0, 50) || '')
        }
        
        switch (data.type) {
          case 'start':
            // Stream has started
            break

          case 'log':
            // Status message from server (e.g., "Claude is thinking...")
            console.log('[Agent Cloud]', data.message)
            break

          case 'heartbeat':
          case 'user':
          case 'system':
          case 'assistant':
          case 'content_block_start':
            // Keep-alive, context messages, and block markers - ignore silently
            // 'assistant' contains full message which would duplicate streamed text
            // 'content_block_start' marks the beginning of a block, no content to show
            break

          case 'content_block_delta':
            // Server-side script already converts these to 'text' events
            // This case is here for safety but shouldn't be reached from server
            break

          case 'text':
            // Primary source: Server sends deduplicated text via 'text' events
            // The server script uses hasStreamedText flag to prevent duplicates
            if (data.data) {
              updateOutput(data.data)
            }
            break

          case 'stdout':
            // Terminal output (install logs, non-JSON output)
            // Server only sends this for non-JSON lines after SDK starts
            // Don't display as response text - it's just terminal noise
            break

          case 'tool_use': {
            // Tool being used - show in UI with rich details
            console.log('[Agent Cloud] Tool used:', data.name, data.input)
            const toolName = data.name || 'Unknown'
            const input = data.input || {}
            const hasInput = Object.keys(input).length > 0

            let toolDescription = ''

            // Create user-friendly descriptions for common tools
            if (toolName === 'Bash') {
              toolDescription = input?.description || (input?.command ? `$ ${input.command.substring(0, 100)}` : 'Running command')
            } else if (toolName === 'Write' && input?.file_path) {
              toolDescription = `Creating ${input.file_path}`
            } else if (toolName === 'Edit' && input?.file_path) {
              toolDescription = `Editing ${input.file_path}`
            } else if (toolName === 'Read' && input?.file_path) {
              toolDescription = `Reading ${input.file_path}`
            } else if (toolName === 'Glob' && input?.pattern) {
              toolDescription = `Finding files: ${input.pattern}`
            } else if (toolName === 'Grep' && input?.pattern) {
              toolDescription = `Searching for: ${input.pattern}`
            } else if (toolName === 'WebSearch' && input?.query) {
              toolDescription = `Searching: ${input.query.substring(0, 80)}`
            } else if (toolName === 'WebFetch' && input?.url) {
              toolDescription = `Fetching: ${input.url.substring(0, 80)}`
            } else if (toolName === 'Task' && input?.description) {
              toolDescription = input.description
            } else if (toolName === 'TodoWrite') {
              const todoCount = input?.todos?.length || 0
              const doneCount = input?.todos?.filter((t: any) => t.status === 'completed')?.length || 0
              toolDescription = `${doneCount}/${todoCount} tasks`
            } else {
              toolDescription = `Using ${toolName}`
            }

            const newMeta = {
              toolName,
              toolId: data.name + '_' + Date.now(),
              fileName: input?.file_path,
              description: input?.description,
              command: toolName === 'Bash' ? input?.command : undefined,
              input: input,
              oldString: toolName === 'Edit' ? input?.old_string : undefined,
              newString: toolName === 'Edit' ? input?.new_string : undefined,
              fileContent: toolName === 'Write' ? input?.content?.substring(0, 500) : undefined,
              pattern: (toolName === 'Glob' || toolName === 'Grep') ? input?.pattern : undefined,
              url: toolName === 'WebFetch' ? input?.url : undefined,
              query: toolName === 'WebSearch' ? input?.query : undefined,
              todos: toolName === 'TodoWrite' ? input?.todos : undefined,
              isComplete: false,
            }

            setSessions(prev => prev.map(s => {
              if (s.id !== sessionId) return s

              const lines = [...s.lines]

              // If this tool_use has input, check if there's a recent pending tool line
              // with the same name but no input (from content_block_start). Update it instead.
              if (hasInput) {
                for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
                  if (
                    lines[i].type === 'tool' &&
                    lines[i].meta?.toolName === toolName &&
                    !lines[i].meta?.command &&
                    !lines[i].meta?.fileName &&
                    !lines[i].meta?.isComplete
                  ) {
                    // Update existing tool line with full input details
                    lines[i] = {
                      ...lines[i],
                      content: toolDescription,
                      meta: newMeta,
                    }
                    return { ...s, lines }
                  }
                }
              }

              // Otherwise, add a new tool line
              lines.push({
                type: 'tool' as const,
                content: toolDescription,
                timestamp: new Date(),
                meta: newMeta,
              })
              return { ...s, lines }
            }))
            break
          }

          case 'tool_result': {
            // Tool result - attach to the last tool line
            const resultContent = typeof data.result === 'string'
              ? data.result
              : JSON.stringify(data.result, null, 2)
            console.log('[Agent Cloud] Tool result:', resultContent?.substring?.(0, 100))

            // Find the last tool line and attach the result
            setSessions(prev => prev.map(s => {
              if (s.id === sessionId) {
                const lines = [...s.lines]
                // Find last tool line that hasn't received a result yet
                for (let i = lines.length - 1; i >= 0; i--) {
                  if (lines[i].type === 'tool' && lines[i].meta && !lines[i].meta?.isComplete) {
                    lines[i] = {
                      ...lines[i],
                      meta: {
                        ...lines[i].meta,
                        result: resultContent?.substring(0, 2000), // Cap at 2000 chars
                        isComplete: true,
                      }
                    }
                    break
                  }
                }
                return { ...s, lines }
              }
              return s
            }))

            // Mark that next text should start a NEW output message (new turn)
            lastEventWasToolResult = true
            break
          }

          case 'result':
            // Final SDK result - only log, don't duplicate output
            if (data.subtype === 'success') {
              console.log('[Agent Cloud] Generation complete, cost:', data.cost)
            }
            // Don't append data.result - it duplicates the already-streamed text
            break

          case 'stderr':
            setSessions(prev => prev.map(s =>
              s.id === sessionId
                ? { ...s, lines: [...s.lines, { type: 'error' as const, content: data.data || 'Error occurred', timestamp: new Date() }] }
                : s
            ))
            break

          case 'complete':
            // Ensure final output is rendered
            if (fullOutput) {
              setSessions(prev => prev.map(s => {
                if (s.id === sessionId) {
                  const lines = [...s.lines]
                  const lastLine = lines[lines.length - 1]
                  if (lastLine && lastLine.type === 'output') {
                    lines[lines.length - 1] = { ...lastLine, content: fullOutput }
                  }
                  return { ...s, lines }
                }
                return s
              }))
            }

            if (data.diffStats) {
              setSessions(prev => prev.map(s =>
                s.id === sessionId
                  ? {
                      ...s,
                      stats: {
                        additions: (s.stats?.additions || 0) + (data.diffStats?.additions || 0),
                        deletions: (s.stats?.deletions || 0) + (data.diffStats?.deletions || 0)
                      },
                      messageCount: data.messageCount
                    }
                  : s
              ))
            }
            setIsLoading(false)
            setIsStreaming(false)
            return true // Signal to break out of stream loop

          case 'error': {
            // Check if error is about sandbox expiration
            const errorMsg = data.message || ''
            if (!overrideSandboxId && (errorMsg.includes('not found') || errorMsg.includes('expired'))) {
              console.log('Sandbox expired during stream, recreating...')
              reader.cancel()
              const newSandboxId = await recreateSandbox()
              if (newSandboxId) {
                const historyLines = activeSession.lines
                  .filter(l => l.type === 'input' || l.type === 'output')
                  .slice(-12)
                let contextPrompt = currentPrompt
                if (historyLines.length > 0) {
                  const historyContext = historyLines
                    .map(l => `${l.type === 'input' ? 'User' : 'Assistant'}: ${l.content.length > 800 ? l.content.substring(0, 800) + '...[truncated]' : l.content}`)
                    .join('\n\n')
                  contextPrompt = `[Conversation History - This is a resumed session after reconnection]\n${historyContext}\n\n[Current Request]\n${currentPrompt}`
                }
                setIsLoading(false)
                setIsStreaming(false)
                runPrompt(contextPrompt, newSandboxId)
              } else {
                setIsLoading(false)
                setIsStreaming(false)
              }
              return true // Signal to break out of stream loop
            }

            setSessions(prev => prev.map(s =>
              s.id === sessionId
                ? { ...s, lines: [...s.lines, { type: 'error' as const, content: data.message || 'An error occurred', timestamp: new Date() }] }
                : s
            ))
            setIsLoading(false)
            setIsStreaming(false)
            return true // Signal to break out of stream loop
          }
        }
        return false // Continue processing
      }

      // Stream reading loop with proper SSE buffering
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log('[Agent Cloud] Stream ended')
            break
          }

          hasReceivedData = true
          const chunk = decoder.decode(value, { stream: true })
          
          // Add chunk to buffer for proper SSE parsing
          sseBuffer += chunk

          // SSE messages are separated by double newlines
          const messages = sseBuffer.split('\n\n')
          // Keep the last potentially incomplete message in the buffer
          sseBuffer = messages.pop() || ''

          for (const message of messages) {
            if (!message.trim()) continue

            // Each message can have multiple lines (data:, event:, id:, etc.)
            const lines = message.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6) // Remove "data: " prefix
                if (jsonStr === '[DONE]') continue // Skip done marker

                try {
                  const data = JSON.parse(jsonStr)
                  const shouldBreak = await processMessage(data)
                  if (shouldBreak) {
                    // Stream completed normally - just exit the loop
                    // Don't call reader.cancel() since the stream is done
                    return
                  }
                } catch (e) {
                  console.warn('[Agent Cloud] Failed to parse SSE data:', jsonStr.substring(0, 100))
                }
              }
            }
          }
        }
      } catch (streamError) {
        console.error('[Agent Cloud] Streaming error:', streamError)
        
        // If we haven't received any data, this might be a connection issue - try recreating
        if (!hasReceivedData && !overrideSandboxId) {
          console.log('Connection failed without data, attempting to recreate sandbox...')
          const newSandboxId = await recreateSandbox()
          if (newSandboxId) {
            const historyLines = activeSession.lines
              .filter(l => l.type === 'input' || l.type === 'output')
              .slice(-12)
            let contextPrompt = currentPrompt
            if (historyLines.length > 0) {
              const historyContext = historyLines
                .map(l => `${l.type === 'input' ? 'User' : 'Assistant'}: ${l.content.length > 800 ? l.content.substring(0, 800) + '...[truncated]' : l.content}`)
                .join('\n\n')
              contextPrompt = `[Conversation History - This is a resumed session after reconnection]\n${historyContext}\n\n[Current Request]\n${currentPrompt}`
            }
            setIsLoading(false)
            setIsStreaming(false)
            runPrompt(contextPrompt, newSandboxId)
            return
          }
        }

        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, lines: [...s.lines, { type: 'error' as const, content: 'Connection lost. Please try again.', timestamp: new Date() }] }
            : s
        ))
      } finally {
        try { reader.releaseLock() } catch {}
        setIsLoading(false)
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    } catch (error) {
      // Handle user-initiated abort gracefully
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('[Agent Cloud] Request aborted by user')
        setSessions(prev => prev.map(s =>
          s.id === sessionId
            ? { ...s, lines: [...s.lines, { type: 'system' as const, content: 'Agent stopped by user', timestamp: new Date() }] }
            : s
        ))
        setIsLoading(false)
        setIsStreaming(false)
        abortControllerRef.current = null
        return
      }

      console.error('Failed to run prompt:', error)
      const errMsg = error instanceof Error ? error.message : 'Failed to run prompt'

      // Auto-recreate if sandbox expired (catch-all safety net) - only if not already a retry
      if (!overrideSandboxId && (errMsg.includes('not found') || errMsg.includes('expired') || errMsg.includes('Sandbox'))) {
        console.log('[Agent Cloud] Sandbox error detected, attempting auto-recreation...')
        const newSandboxId = await recreateSandbox()
        if (newSandboxId) {
          const historyLines = activeSession.lines
            .filter(l => l.type === 'input' || l.type === 'output')
            .slice(-12)
          let contextPrompt = currentPrompt
          if (historyLines.length > 0) {
            const historyContext = historyLines
              .map(l => `${l.type === 'input' ? 'User' : 'Assistant'}: ${l.content.length > 800 ? l.content.substring(0, 800) + '...[truncated]' : l.content}`)
              .join('\n\n')
            contextPrompt = `[Conversation History - This is a resumed session after reconnection]\n${historyContext}\n\n[Current Request]\n${currentPrompt}`
          }
          setIsLoading(false)
          setIsStreaming(false)
          abortControllerRef.current = null
          runPrompt(contextPrompt, newSandboxId)
          return
        }
      }

      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, lines: [...s.lines, { type: 'error' as const, content: errMsg, timestamp: new Date() }] }
          : s
      ))
      setIsLoading(false)
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [activeSession, prompt, attachedImages, attachedFiles, isLoading, isRecreating, sessionId, setSessions, storedTokens, recreateSandbox, isScreenSharing, captureCurrentFrame, mcpToggles, connectors])

  // Stop the running agent
  const stopAgent = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Auto-run pending prompt when session loads (must be after runPrompt is defined)
  useEffect(() => {
    if (
      activeSession?.pendingPrompt &&
      activeSession?.id &&
      !isLoading &&
      !isRecreating &&
      !pendingPromptProcessedRef.current.has(activeSession.id)
    ) {
      // Mark this session's pending prompt as processed
      pendingPromptProcessedRef.current.add(activeSession.id)

      // Store the pending prompt and images before clearing
      const promptToRun = activeSession.pendingPrompt
      const imagesToRun = activeSession.pendingImages

      // Clear the pending prompt and images from the session
      setSessions(prev => prev.map(s =>
        s.id === sessionId
          ? { ...s, pendingPrompt: undefined, pendingImages: undefined }
          : s
      ))

      // Run the prompt after a short delay to let the page render
      setTimeout(() => {
        runPrompt(promptToRun, undefined, imagesToRun)
      }, 150)
    }
  }, [activeSession?.pendingPrompt, activeSession?.id, isLoading, isRecreating, sessionId, setSessions, runPrompt])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      runPrompt()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!supportsImages) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: `pasted-${Date.now()}.${file.type.split('/')[1]}` }])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: file.name }])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  // Combined file handler - routes images and text files appropriately
  const handleCombinedUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setShowCommandMenu(false)
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: file.name }])
        }
        reader.readAsDataURL(file)
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          setAttachedFiles(prev => [...prev, {
            id: Date.now().toString() + Math.random(),
            name: file.name,
            content: reader.result as string,
            size: file.size
          }])
        }
        reader.readAsText(file)
      }
    }
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index))
  }

  // Drag-and-drop handlers (only for models that support images)
  const handleDragOver = (e: React.DragEvent) => {
    if (!supportsImages) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (!supportsImages) return
    const files = e.dataTransfer?.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: file.name }])
      }
      reader.readAsDataURL(file)
    }
  }

  // Screen toggle handler (state and captureCurrentFrame are defined earlier)
  const handleScreenToggle = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      if (videoElementRef.current) {
        videoElementRef.current.pause()
        videoElementRef.current.srcObject = null
        videoElementRef.current = null
      }
      setIsScreenSharing(false)
      return
    }

    try {
      setIsCapturing(true)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      mediaStreamRef.current = stream

      // Create persistent video element for continuous capture
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      videoElementRef.current = video
      await video.play()

      // Capture initial screenshot
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      const base64 = canvas.toDataURL('image/png').split(',')[1]
      setAttachedImages(prev => [...prev, { data: base64, type: 'image/png', name: `screenshot-${Date.now()}.png` }])

      setIsScreenSharing(true)

      // Listen for stream end (user clicks "Stop sharing" in browser)
      stream.getVideoTracks()[0].onended = () => {
        if (videoElementRef.current) {
          videoElementRef.current.pause()
          videoElementRef.current.srcObject = null
          videoElementRef.current = null
        }
        mediaStreamRef.current = null
        setIsScreenSharing(false)
      }
    } catch {
      // User cancelled screen selection
    } finally {
      setIsCapturing(false)
    }
  }, [isScreenSharing])

  // Auto-resume screen sharing if coming from new page with sharing active
  useEffect(() => {
    const shouldResume = sessionStorage.getItem('agent-cloud-resume-sharing')
    if (shouldResume === 'true') {
      sessionStorage.removeItem('agent-cloud-resume-sharing')
      // Small delay to let the page settle, then prompt for sharing
      const timer = setTimeout(() => {
        handleScreenToggle()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [handleScreenToggle])

  // Render message line
  const renderLine = (line: TerminalLine, index: number) => {
    switch (line.type) {
      case 'system':
        return (
          <div key={index} className="flex items-start gap-2 text-gray-500 text-sm py-1 font-mono">
            <Sparkles className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
            <span>{line.content}</span>
          </div>
        )

      case 'input': {
        // Strip injected system context from displayed message
        // These markers get appended/prepended to the prompt before sending to the AI
        const cleanContent = line.content
          .replace(/\n*\[Playwright Browser Testing[\s\S]*$/i, '')
          .replace(/\n*\[GitHub Context[\s\S]*?User Request:\s*/i, '')
          .replace(/\n*\[New Project - Build From Scratch\][\s\S]*?User Request:\s*/i, '')
          .replace(/\n*\[Available Tools[\s\S]*?User Request:\s*/i, '')
          .replace(/\n*\[Connector Context[\s\S]*?User Request:\s*/i, '')
          .replace(/\n*\[File Context[\s\S]*?\n\n/i, '')
          .trim()
        const MAX_CHARS = 308
        const MAX_WORDS = 54
        const inputLines = cleanContent.split('\n')
        const wordCount = cleanContent.split(/\s+/).filter(Boolean).length
        const isLong = inputLines.length > MAX_LINES_COLLAPSED || cleanContent.length > MAX_CHARS || wordCount > MAX_WORDS
        const isExpanded = expandedMessages.has(index)
        let displayContent = cleanContent
        if (isLong && !isExpanded) {
          // Truncate by lines first
          let truncated = inputLines.length > MAX_LINES_COLLAPSED
            ? inputLines.slice(0, MAX_LINES_COLLAPSED).join('\n')
            : cleanContent
          // Then enforce char limit
          if (truncated.length > MAX_CHARS) {
            // Cut at the last space before the limit to avoid mid-word breaks
            const cut = truncated.lastIndexOf(' ', MAX_CHARS)
            truncated = truncated.substring(0, cut > 0 ? cut : MAX_CHARS) + '...'
          }
          displayContent = truncated
        }
        return (
          <div key={index} className="flex items-start gap-3 py-4 group min-w-0 justify-end">
            <div className="max-w-[85%] min-w-0 overflow-hidden bg-orange-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5">
              {/* Display attached images */}
              {line.images && line.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {line.images.map((img, imgIdx) => (
                    <img
                      key={imgIdx}
                      src={`data:${img.type};base64,${img.data}`}
                      alt="Attached"
                      className="max-w-[200px] max-h-[150px] rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity border border-white/20"
                      onClick={() => setPreviewImage(`data:${img.type};base64,${img.data}`)}
                    />
                  ))}
                </div>
              )}
              {line.content && (
                <p className="text-white text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{displayContent}</p>
              )}
              {isLong && (
                <button
                  onClick={() => setExpandedMessages(prev => {
                    const next = new Set(prev)
                    if (next.has(index)) { next.delete(index) } else { next.add(index) }
                    return next
                  })}
                  className="text-xs text-white/70 hover:text-white mt-1 font-mono"
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
            <button
              onClick={() => !isLoading && runPrompt(line.content)}
              disabled={isLoading}
              className="p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 rounded-md hover:bg-gray-700 disabled:opacity-30 shrink-0 mt-0.5 self-end"
              title="Retry this prompt"
            >
              <RotateCw className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </div>
        )
      }

      case 'output':
        return (
          <div key={index} className="flex items-start gap-3 py-4 group min-w-0">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5 overflow-hidden">
              <div className="relative">
                <div className="prose prose-invert prose-sm max-w-none break-words [overflow-wrap:anywhere] prose-a:break-all prose-pre:overflow-x-auto prose-code:break-all [&_*]:max-w-full">
                  <Response className="text-gray-300">
                    {line.content}
                  </Response>
                </div>
                <button
                  onClick={() => copyToClipboard(line.content, `output-${index}`)}
                  className="absolute top-0 right-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 rounded-md hover:bg-gray-700"
                >
                  {copied === `output-${index}` ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-gray-500" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )

      case 'error':
        return (
          <div key={index} className="flex items-start gap-3 py-2 min-w-0">
            <div className="h-7 w-7 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs text-red-400 font-bold">!</span>
            </div>
            <div className="flex-1 min-w-0 text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2 font-mono break-words [overflow-wrap:anywhere] overflow-hidden">
              {line.content}
            </div>
          </div>
        )

      case 'tool': {
        const meta = line.meta || {}
        const toolName = meta.toolName || 'Tool'
        const isExpanded = expandedTools.has(index)
        const isComplete = meta.isComplete !== false

        // Tool icon mapping
        const getToolIcon = () => {
          switch (toolName) {
            case 'Bash': return <Terminal className="h-3.5 w-3.5" />
            case 'Edit': return <FileEdit className="h-3.5 w-3.5" />
            case 'Write': return <FileCode className="h-3.5 w-3.5" />
            case 'Read': return <Eye className="h-3.5 w-3.5" />
            case 'Glob': return <FolderSearch className="h-3.5 w-3.5" />
            case 'Grep': return <Search className="h-3.5 w-3.5" />
            case 'WebSearch': return <Globe className="h-3.5 w-3.5" />
            case 'WebFetch': return <Globe className="h-3.5 w-3.5" />
            case 'Task': return <Bot className="h-3.5 w-3.5" />
            case 'TodoWrite': return <ListTodo className="h-3.5 w-3.5" />
            default: return <Sparkles className="h-3.5 w-3.5" />
          }
        }

        // Tool accent color (icon + left border accent)
        const getToolAccent = () => {
          switch (toolName) {
            case 'Bash': return { icon: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-l-emerald-500/60' }
            case 'Edit': return { icon: 'text-amber-400', dot: 'bg-amber-400', border: 'border-l-amber-500/60' }
            case 'Write': return { icon: 'text-blue-400', dot: 'bg-blue-400', border: 'border-l-blue-500/60' }
            case 'Read': return { icon: 'text-purple-400', dot: 'bg-purple-400', border: 'border-l-purple-500/60' }
            case 'Glob': return { icon: 'text-cyan-400', dot: 'bg-cyan-400', border: 'border-l-cyan-500/60' }
            case 'Grep': return { icon: 'text-cyan-400', dot: 'bg-cyan-400', border: 'border-l-cyan-500/60' }
            case 'WebSearch': return { icon: 'text-indigo-400', dot: 'bg-indigo-400', border: 'border-l-indigo-500/60' }
            case 'WebFetch': return { icon: 'text-indigo-400', dot: 'bg-indigo-400', border: 'border-l-indigo-500/60' }
            case 'Task': return { icon: 'text-orange-400', dot: 'bg-orange-400', border: 'border-l-orange-500/60' }
            case 'TodoWrite': return { icon: 'text-violet-400', dot: 'bg-violet-400', border: 'border-l-violet-500/60' }
            default: return { icon: 'text-gray-400', dot: 'bg-gray-400', border: 'border-l-gray-500/60' }
          }
        }

        const accent = getToolAccent()

        // Format description with syntax-highlighted code/paths
        const rawDesc = meta.fileName || meta.description || line.content || ''
        const renderDescription = () => {
          // Highlight file paths (anything like /foo/bar.ts or src/foo.tsx)
          // and inline code/commands (backtick-wrapped or shell-like commands)
          const parts = rawDesc.split(/(`[^`]+`|(?:\/[\w.\-/]+(?:\.\w+)?)|(?:[\w.\-]+\/[\w.\-/]+(?:\.\w+)?))/g)
          return parts.map((part: string, i: number) => {
            if (!part) return null
            // Backtick-wrapped code
            if (part.startsWith('`') && part.endsWith('`')) {
              return <code key={i} className="px-1 py-px rounded bg-gray-800 text-orange-300 text-[11px]">{part.slice(1, -1)}</code>
            }
            // File path (starts with / or contains / with extension)
            if (/^\/[\w.\-/]+|^[\w.\-]+\/[\w.\-/]+/.test(part)) {
              return <span key={i} className="text-blue-300">{part}</span>
            }
            return <span key={i}>{part}</span>
          })
        }

        // Check if this tool has expandable content
        // TodoWrite shows todos inline (always visible), so it's not "expandable" in the click-to-expand sense
        const hasExpandableContent = toolName !== 'TodoWrite' && !!(meta.command || meta.result || meta.oldString || meta.newString || meta.fileContent)

        return (
          <div key={index} className="py-1 ml-10">
            <div
              className={`rounded-lg border border-gray-700/50 bg-gray-900/60 overflow-hidden border-l-2 ${accent.border} backdrop-blur-sm`}
            >
              {/* Tool header */}
              <div
                className={`flex items-center gap-2.5 px-3 py-2 min-w-0 ${hasExpandableContent ? 'cursor-pointer hover:bg-gray-800/40 transition-colors' : ''}`}
                onClick={() => hasExpandableContent && toggleToolExpanded(index)}
              >
                {/* Expand/collapse or status dot */}
                {hasExpandableContent ? (
                  <ChevronRight className={`h-3.5 w-3.5 text-gray-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isComplete ? accent.dot : `${accent.dot} animate-pulse`}`} />
                )}

                {/* Tool icon */}
                <span className={`shrink-0 ${accent.icon}`}>
                  {getToolIcon()}
                </span>

                {/* Tool name */}
                <span className="text-[11px] font-semibold text-gray-300 shrink-0 uppercase tracking-wider">
                  {toolName}
                </span>

                {/* Description with syntax highlighting */}
                <span className="text-xs text-gray-500 truncate flex-1 min-w-0">
                  {renderDescription()}
                </span>

                {/* Status indicator */}
                {!isComplete && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />
                )}
                {isComplete && hasExpandableContent && (
                  <Check className="h-3 w-3 text-gray-600 shrink-0" />
                )}
              </div>

              {/* TodoWrite: Always show todo items inline */}
              {toolName === 'TodoWrite' && meta.todos && meta.todos.length > 0 && (
                <div className="border-t border-gray-700/40 px-3 py-2 space-y-1">
                  {meta.todos.map((todo: { content: string; status: string; activeForm?: string }, tIdx: number) => (
                    <div key={tIdx} className="flex items-start gap-2 py-0.5">
                      {todo.status === 'completed' ? (
                        <CircleCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-px" />
                      ) : todo.status === 'in_progress' ? (
                        <CircleDot className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-px animate-pulse" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-gray-600 shrink-0 mt-px" />
                      )}
                      <span className={`text-xs leading-snug ${
                        todo.status === 'completed' ? 'text-gray-500 line-through' :
                        todo.status === 'in_progress' ? 'text-gray-200' :
                        'text-gray-400'
                      }`}>
                        {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Expanded content */}
              {isExpanded && hasExpandableContent && (
                <div className="border-t border-gray-700/40 overflow-hidden">
                  {/* Bash: Show command and output */}
                  {toolName === 'Bash' && (
                    <div className="text-xs font-mono overflow-hidden">
                      {meta.command && (
                        <div className="px-3 py-2.5 bg-gray-950/60 border-b border-gray-800/40 overflow-hidden">
                          <div className="flex items-start gap-2">
                            <span className="text-emerald-600 shrink-0 select-none font-bold">$</span>
                            <span className="break-all whitespace-pre-wrap [overflow-wrap:anywhere] text-[11px] leading-4">{highlightSyntax(meta.command, 'text-emerald-400/90')}</span>
                          </div>
                        </div>
                      )}
                      {meta.result && (
                        <div className="px-3 py-2 text-gray-400 max-h-60 overflow-y-auto overflow-x-hidden bg-gray-950/30">
                          <pre className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-[11px] leading-4">{meta.result}</pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Edit: Git-style unified diff */}
                  {toolName === 'Edit' && (meta.oldString || meta.newString) && (() => {
                    const oldLines = (meta.oldString || '').split('\n')
                    const newLines = (meta.newString || '').split('\n')

                    // Simple LCS-based diff to produce unified diff lines
                    const buildDiff = () => {
                      const diffResult: Array<{ type: 'remove' | 'add' | 'context'; content: string; oldNum?: number; newNum?: number }> = []

                      // Build LCS table
                      const m = oldLines.length
                      const n = newLines.length
                      const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
                      for (let i = 1; i <= m; i++) {
                        for (let j = 1; j <= n; j++) {
                          dp[i][j] = oldLines[i - 1] === newLines[j - 1]
                            ? dp[i - 1][j - 1] + 1
                            : Math.max(dp[i - 1][j], dp[i][j - 1])
                        }
                      }

                      // Backtrack to produce diff
                      const lines: Array<{ type: 'remove' | 'add' | 'context'; content: string }> = []
                      let i = m, j = n
                      while (i > 0 || j > 0) {
                        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
                          lines.unshift({ type: 'context', content: oldLines[i - 1] })
                          i--; j--
                        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                          lines.unshift({ type: 'add', content: newLines[j - 1] })
                          j--
                        } else {
                          lines.unshift({ type: 'remove', content: oldLines[i - 1] })
                          i--
                        }
                      }

                      // Assign line numbers
                      let oldNum = 1, newNum = 1
                      for (const line of lines) {
                        if (line.type === 'context') {
                          diffResult.push({ ...line, oldNum, newNum })
                          oldNum++; newNum++
                        } else if (line.type === 'remove') {
                          diffResult.push({ ...line, oldNum })
                          oldNum++
                        } else {
                          diffResult.push({ ...line, newNum })
                          newNum++
                        }
                      }

                      return diffResult
                    }

                    const diffLines = buildDiff()
                    const additions = diffLines.filter(l => l.type === 'add').length
                    const removals = diffLines.filter(l => l.type === 'remove').length

                    return (
                      <div className="font-mono overflow-hidden">
                        {/* Diff header */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/40 border-b border-gray-700/40 text-[10px]">
                          {meta.fileName && <span className="text-gray-400">{meta.fileName}</span>}
                          <span className="text-emerald-400">+{additions}</span>
                          <span className="text-red-400">-{removals}</span>
                        </div>
                        {/* Diff lines */}
                        <div className="max-h-60 overflow-y-auto overflow-x-hidden">
                          {diffLines.map((dl, dlIdx) => (
                            <div
                              key={dlIdx}
                              className={`flex text-[11px] leading-[18px] ${
                                dl.type === 'remove'
                                  ? 'bg-red-500/10'
                                  : dl.type === 'add'
                                    ? 'bg-emerald-500/10'
                                    : ''
                              }`}
                            >
                              {/* Old line number */}
                              <span className={`w-8 text-right pr-1 select-none shrink-0 ${
                                dl.type === 'remove' ? 'text-red-400/50' : dl.type === 'add' ? 'text-transparent' : 'text-gray-600'
                              }`}>
                                {dl.oldNum ?? ''}
                              </span>
                              {/* New line number */}
                              <span className={`w-8 text-right pr-1 select-none shrink-0 ${
                                dl.type === 'add' ? 'text-emerald-400/50' : dl.type === 'remove' ? 'text-transparent' : 'text-gray-600'
                              }`}>
                                {dl.newNum ?? ''}
                              </span>
                              {/* +/- indicator */}
                              <span className={`w-4 text-center select-none shrink-0 ${
                                dl.type === 'remove' ? 'text-red-400' : dl.type === 'add' ? 'text-emerald-400' : 'text-transparent'
                              }`}>
                                {dl.type === 'remove' ? '-' : dl.type === 'add' ? '+' : ' '}
                              </span>
                              {/* Content */}
                              <span className="flex-1 whitespace-pre-wrap break-all [overflow-wrap:anywhere] pr-3">
                                {highlightSyntax(dl.content, dl.type === 'remove' ? 'text-red-300/80' : dl.type === 'add' ? 'text-emerald-300/80' : 'text-gray-400')}
                              </span>
                            </div>
                          ))}
                        </div>
                        {/* Status footer */}
                        {meta.result && (
                          <div className="px-3 py-1.5 text-gray-500 text-[10px] border-t border-gray-700/40 break-words">
                            {meta.result.includes('successfully') ? '✓ Applied' : meta.result.substring(0, 100)}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Write: Git-style all-green new file content */}
                  {toolName === 'Write' && meta.fileContent && (() => {
                    const writeLines = meta.fileContent.split('\n')
                    const isTruncated = meta.fileContent.length >= 500
                    return (
                      <div className="font-mono overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/40 border-b border-gray-700/40 text-[10px]">
                          {meta.fileName && <span className="text-gray-400">{meta.fileName}</span>}
                          <span className="text-emerald-400">+{writeLines.length} lines</span>
                          {isTruncated && <span className="text-gray-500">(preview)</span>}
                        </div>
                        <div className="max-h-60 overflow-y-auto overflow-x-hidden">
                          {writeLines.map((wl: string, wlIdx: number) => (
                            <div key={wlIdx} className="flex text-[11px] leading-[18px] bg-emerald-500/10">
                              <span className="w-8 text-right pr-1 select-none shrink-0 text-emerald-400/50">{wlIdx + 1}</span>
                              <span className="w-4 text-center select-none shrink-0 text-emerald-400">+</span>
                              <span className="flex-1 whitespace-pre-wrap break-all [overflow-wrap:anywhere] pr-3">{highlightSyntax(wl, 'text-emerald-300/80')}</span>
                            </div>
                          ))}
                          {isTruncated && (
                            <div className="flex text-[11px] leading-[18px]">
                              <span className="w-8 shrink-0" />
                              <span className="w-4 shrink-0" />
                              <span className="text-gray-500 px-1">...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Read: Show result with line numbers */}
                  {toolName === 'Read' && meta.result && (() => {
                    const readLines = meta.result.split('\n')
                    return (
                      <div className="font-mono overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/40 border-b border-gray-700/40 text-[10px]">
                          {meta.fileName && <span className="text-gray-400">{meta.fileName}</span>}
                          <span className="text-purple-400">{readLines.length} lines</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto overflow-x-hidden">
                          {readLines.map((rl: string, rlIdx: number) => (
                            <div key={rlIdx} className="flex text-[11px] leading-[18px]">
                              <span className="w-10 text-right pr-2 select-none shrink-0 text-gray-600">{rlIdx + 1}</span>
                              <span className="flex-1 whitespace-pre-wrap break-all [overflow-wrap:anywhere] pr-3">{highlightSyntax(rl, 'text-gray-400')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Glob/Grep: Show results */}
                  {(toolName === 'Glob' || toolName === 'Grep') && meta.result && (
                    <div className="text-xs font-mono px-3 py-2 bg-[#1a1a1a]/50 max-h-48 overflow-y-auto overflow-x-hidden">
                      <pre className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-gray-400 text-[11px] leading-4">{meta.result}</pre>
                    </div>
                  )}

                  {/* WebSearch/WebFetch: Show results */}
                  {(toolName === 'WebSearch' || toolName === 'WebFetch') && meta.result && (
                    <div className="text-xs font-mono px-3 py-2 bg-[#1a1a1a]/50 max-h-48 overflow-y-auto overflow-x-hidden">
                      <pre className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-gray-400 text-[11px] leading-4">{meta.result}</pre>
                    </div>
                  )}

                  {/* Generic: Show result for any other tool with a result */}
                  {!['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'].includes(toolName) && meta.result && (
                    <div className="text-xs font-mono px-3 py-2 bg-[#1a1a1a]/50 max-h-48 overflow-y-auto overflow-x-hidden">
                      <pre className="whitespace-pre-wrap break-all [overflow-wrap:anywhere] text-gray-400 text-[11px] leading-4">{meta.result}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  if (!activeSession) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    )
  }

  return (
    <>
      {/* Chat area */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 pb-40 md:pb-6"
      >
        <div className="max-w-3xl mx-auto space-y-2 min-w-0">
          {isLoadingMessages && activeSession.lines.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-mono">Loading messages...</span>
            </div>
          )}
          {activeSession.lines.map((line, index) => renderLine(line, index))}
          {isRecreating && (
            <div className="flex items-center gap-2 py-3 text-amber-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-mono">Reconnecting to session...</span>
            </div>
          )}
          {isStreaming && !isRecreating && (
            <div className="flex items-center gap-2 py-3 text-orange-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-mono">{spinnerPhrase}...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input area */}
      {activeSession.status === 'active' && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] px-3 pb-3 pt-2 md:relative md:z-auto md:px-4 md:pb-4 md:pt-0 md:border-t md:border-gray-800/50 md:bg-transparent" style={{ backgroundColor: 'rgba(17, 24, 39, 0.8)' }}>
          <div className="max-w-3xl mx-auto">
            <div
              className={`relative rounded-2xl border transition-colors ${
                isDragging ? 'border-orange-500 bg-orange-500/5' : 'border-gray-700/60 bg-gray-900/80 focus-within:border-gray-600'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag overlay */}
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10 pointer-events-none">
                  <div className="text-orange-400 text-sm font-medium">Drop images here</div>
                </div>
              )}
              {/* Attachment pills */}
              {(attachedImages.length > 0 || attachedFiles.length > 0) && (
                <div className="px-3 pt-2.5 flex flex-wrap gap-1.5">
                  {attachedImages.map((img, i) => (
                    <div
                      key={`img-${i}`}
                      className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group cursor-pointer"
                      onClick={() => setPreviewImage(`data:${img.type};base64,${img.data}`)}
                    >
                      <ImageIcon className="size-3 text-gray-500" />
                      <span className="truncate max-w-[120px]">{img.name}</span>
                      <button
                        className="md:opacity-0 md:group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all"
                        onClick={(e) => { e.stopPropagation(); removeImage(i) }}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                  {attachedFiles.map(file => (
                    <div key={file.id} className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group">
                      <FileText className="size-3 text-gray-500" />
                      <span className="truncate max-w-[120px]">{file.name}</span>
                      <button
                        className="md:opacity-0 md:group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all"
                        onClick={() => removeFile(file.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={isRecreating ? "Reconnecting..." : "Reply to PiPilot..."}
                disabled={isLoading || isRecreating}
                className="w-full bg-transparent resize-none outline-none text-sm text-gray-100 placeholder:text-gray-500 px-4 pt-3 pb-12 min-h-[44px] max-h-[120px] leading-6 overflow-y-auto"
                rows={1}
              />
              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
              <input
                ref={combinedFileInputRef}
                type="file"
                multiple
                onChange={handleCombinedUpload}
                className="hidden"
              />
              <div className="absolute bottom-2 left-2 flex items-center gap-1">
                {/* Plus context menu */}
                <div className="relative" ref={commandMenuRef}>
                  <button
                    type="button"
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                    onClick={() => { setShowCommandMenu(!showCommandMenu); setCommandMenuView('main') }}
                  >
                    <Plus className={`size-4 transition-transform ${showCommandMenu ? 'rotate-45' : ''}`} />
                  </button>

                  {showCommandMenu && (
                    <div className="absolute bottom-10 left-0 w-[260px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[80] overflow-hidden">
                      <div className="py-1.5">
                        {commandMenuView === 'main' ? (
                          <>
                            {/* Add images or files */}
                            <button
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                              onClick={() => {
                                setShowCommandMenu(false)
                                combinedFileInputRef.current?.click()
                              }}
                            >
                              <FileUp className="size-4 text-gray-400" />
                              <span>Add images or files</span>
                            </button>

                            {/* Capture screen */}
                            <button
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                              onClick={() => {
                                setShowCommandMenu(false)
                                handleScreenToggle()
                              }}
                            >
                              <Monitor className={`size-4 ${isScreenSharing ? 'text-red-400' : 'text-gray-400'}`} />
                              <span>{isScreenSharing ? 'Stop screen sharing' : 'Capture screen'}</span>
                              {isScreenSharing && <div className="ml-auto w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
                            </button>

                            <div className="my-1.5 border-t border-gray-700/50" />

                            {/* MCP & Connectors - drill into submenu */}
                            <button
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                              onClick={() => setCommandMenuView('mcp')}
                            >
                              <Server className="size-4 text-gray-400" />
                              <span>MCP & Connectors</span>
                              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500">
                                {Object.values(mcpToggles).filter(Boolean).length + connectors.filter(c => c.enabled).length}
                                <ChevronRight className="size-3.5" />
                              </span>
                            </button>
                          </>
                        ) : (
                          <>
                            {/* MCP & Connectors submenu */}
                            <button
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors border-b border-gray-700/50"
                              onClick={() => setCommandMenuView('main')}
                            >
                              <ChevronLeft className="size-4" />
                              <span className="font-medium">MCP & Connectors</span>
                            </button>
                            <div className="max-h-[340px] overflow-y-auto">
                              {/* MCP Servers section */}
                              <div className="px-4 pt-2.5 pb-1">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">MCP Servers</span>
                              </div>
                              {DEFAULT_MCPS.map(mcp => {
                                const isOn = mcpToggles[mcp.id] !== false
                                return (
                                  <div
                                    key={mcp.id}
                                    className="flex items-center hover:bg-gray-800 transition-colors"
                                  >
                                    <button
                                      className="flex-1 flex items-center gap-3 px-4 py-2 text-sm text-gray-200 min-w-0"
                                      onClick={() => setMcpToggles(prev => ({ ...prev, [mcp.id]: !isOn }))}
                                    >
                                      <Server className={`size-4 flex-shrink-0 ${isOn ? 'text-green-400' : 'text-gray-500'}`} />
                                      <div className="text-left min-w-0 flex-1">
                                        <span className={`truncate ${isOn ? 'text-gray-200' : 'text-gray-500'}`}>{mcp.name}</span>
                                        <div className="text-[10px] text-gray-600 truncate">{mcp.description}</div>
                                      </div>
                                    </button>
                                    <div className="pr-3">
                                      <Switch
                                        checked={isOn}
                                        onCheckedChange={(checked) => setMcpToggles(prev => ({ ...prev, [mcp.id]: checked }))}
                                        className="h-4 w-7 flex-shrink-0 data-[state=checked]:bg-orange-600"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>
                                  </div>
                                )
                              })}

                              {/* Connectors section */}
                              <div className="px-4 pt-3 pb-1 border-t border-gray-700/40 mt-1">
                                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Connectors</span>
                              </div>
                              {connectors.map(connector => (
                                <div
                                  key={connector.id}
                                  className="flex items-center hover:bg-gray-800 transition-colors"
                                >
                                  <button
                                    className="flex-1 flex items-center gap-3 px-4 py-2 text-sm text-gray-200 min-w-0"
                                    onClick={() => {
                                      setConnectors(prev => prev.map(c =>
                                        c.id === connector.id ? { ...c, enabled: !c.enabled } : c
                                      ))
                                    }}
                                  >
                                    <Plug className={`size-4 flex-shrink-0 ${connector.enabled ? 'text-orange-400' : 'text-gray-500'}`} />
                                    <div className="text-left min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`truncate ${connector.enabled ? 'text-gray-200' : 'text-gray-500'}`}>{connector.name}</span>
                                        <span className="text-[9px] px-1 py-px rounded bg-gray-800 text-gray-500 flex-shrink-0">{connector.type}</span>
                                      </div>
                                      <div className="text-[10px] text-gray-600 truncate">{connector.description}</div>
                                    </div>
                                  </button>
                                  <div className="pr-3">
                                    <Switch
                                      checked={connector.enabled}
                                      onCheckedChange={(checked) => {
                                        setConnectors(prev => prev.map(c =>
                                          c.id === connector.id ? { ...c, enabled: checked } : c
                                        ))
                                      }}
                                      className="h-4 w-7 flex-shrink-0 data-[state=checked]:bg-orange-600"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Model selector */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1.5 rounded-lg bg-gray-800/50 hover:bg-gray-800">
                      <Sparkles className="h-3 w-3" />
                      <span>{currentModelInfo?.name || currentModelId}</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="bg-gray-900 border-gray-700 w-[240px] z-[70]">
                    {MODELS.map(model => (
                      <DropdownMenuItem
                        key={model.id}
                        onClick={() => handleModelChange(model.id)}
                        className={`cursor-pointer ${model.id === currentModelId ? 'bg-gray-800/50' : ''}`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div>
                            <div className="font-medium text-sm">{model.name}</div>
                            <div className="text-xs text-gray-500">{model.description}</div>
                          </div>
                          {model.id === currentModelId && (
                            <Check className="h-4 w-4 text-orange-400 shrink-0 ml-2" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="absolute bottom-2 right-2">
                {isLoading || isRecreating ? (
                  <Button
                    onClick={stopAgent}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-red-500 hover:bg-red-600 text-white relative"
                    title="Stop agent"
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400 absolute" />
                    <Square className="h-2.5 w-2.5 fill-red-500 text-red-500 relative z-10" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => runPrompt()}
                    disabled={!prompt.trim() && attachedImages.length === 0 && attachedFiles.length === 0}
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-40 disabled:bg-gray-700"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image preview dialog */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// Wrapper with Suspense for useSearchParams
export default function SessionPage() {
  usePageTitle('Agent Session')
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    }>
      <SessionPageInner />
    </Suspense>
  )
}
