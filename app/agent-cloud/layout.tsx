"use client"

import { useState, useEffect, createContext, useContext, useCallback, Suspense, useRef } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Square,
  Trash2,
  Bot,
  MoreVertical,
  Plus,
  PanelLeft,
  Menu,
  X,
  Globe,
  GitBranch,
  ExternalLink,
  Settings,
} from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createClient } from "@/lib/supabase/client"
import { getDeploymentTokens } from "@/lib/cloud-sync"
import { agentCloudStorage } from "@/lib/agent-cloud-storage"

// Storage key for localStorage (used for migration only)
const STORAGE_KEY = 'pipilot_agent_cloud_v3'

export interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'system' | 'file' | 'diff' | 'tool'
  content: string
  timestamp: Date
  images?: Array<{ data: string; type: string }> // Attached images (base64 data URLs)
  meta?: {
    toolName?: string
    toolId?: string
    fileName?: string
    additions?: number
    deletions?: number
    diffLines?: string[]
    // Rich tool data
    command?: string          // Bash command
    description?: string      // Tool description
    input?: Record<string, any>  // Full tool input
    result?: string           // Tool result content
    oldString?: string        // Edit old_string
    newString?: string        // Edit new_string
    fileContent?: string      // Write content (truncated)
    pattern?: string          // Glob/Grep pattern
    url?: string              // WebFetch URL
    query?: string            // WebSearch query
    isComplete?: boolean      // Whether tool has completed
  }
}

export interface Session {
  id: string
  sandboxId: string
  createdAt: Date
  status: 'active' | 'terminated'
  lines: TerminalLine[]
  model?: string
  gateway?: string
  title?: string
  repo?: {
    name: string
    full_name: string
    branch: string
  }
  workingBranch?: string // The branch created for this session (e.g., pipilot-agent/fix-login-bug-a1b2)
  stats?: {
    additions: number
    deletions: number
  }
  messageCount?: number
  pendingPrompt?: string // Initial prompt to auto-send when session page loads
  pendingImages?: Array<{ data: string; type: string; name: string }> // Images to attach when auto-sending
  isNewProject?: boolean // Whether this is a new project (built from scratch)
  newProjectName?: string // The repo name for new project mode
}

export interface Repository {
  id: number
  name: string
  full_name: string
  private: boolean
  description: string | null
  language: string | null
  updated_at: string
  default_branch: string
}

// Connector configuration
export type ConnectorType = 'mcp' | 'cli'

export interface ConnectorConfig {
  id: string
  name: string
  description: string
  type: ConnectorType
  enabled: boolean
  // MCP-specific
  mcpUrl?: string
  // Config fields that user fills in
  fields: Array<{
    key: string
    label: string
    placeholder: string
    value: string
    type?: 'text' | 'password'
  }>
}

// Default connectors available
export const DEFAULT_CONNECTORS: ConnectorConfig[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Database, auth, and storage via Supabase MCP',
    type: 'mcp',
    enabled: false,
    mcpUrl: 'https://mcp.supabase.com/mcp',
    fields: [
      { key: 'project_ref', label: 'Project Ref', placeholder: 'your-project-ref', value: '', type: 'text' },
      { key: 'access_token', label: 'Access Token', placeholder: 'sbp_...', value: '', type: 'password' },
    ]
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deploy and manage apps via Vercel CLI',
    type: 'cli',
    enabled: false,
    fields: [
      { key: 'token', label: 'Vercel Token', placeholder: 'your-vercel-token', value: '', type: 'password' },
    ]
  },
  {
    id: 'netlify',
    name: 'Netlify',
    description: 'Deploy static sites via Netlify CLI',
    type: 'cli',
    enabled: false,
    fields: [
      { key: 'token', label: 'Netlify Auth Token', placeholder: 'your-netlify-token', value: '', type: 'password' },
    ]
  },
  {
    id: 'npm',
    name: 'npm',
    description: 'Publish and manage npm packages',
    type: 'cli',
    enabled: false,
    fields: [
      { key: 'token', label: 'npm Auth Token', placeholder: 'npm_...', value: '', type: 'password' },
    ]
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Serverless Postgres via Neon CLI (neonctl)',
    type: 'cli',
    enabled: false,
    fields: [
      { key: 'api_key', label: 'Neon API Key', placeholder: 'your-neon-api-key', value: '', type: 'password' },
    ]
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Deploy Workers and Pages via Wrangler CLI',
    type: 'cli',
    enabled: false,
    fields: [
      { key: 'api_token', label: 'Cloudflare API Token', placeholder: 'your-cf-token', value: '', type: 'password' },
    ]
  },
  {
    id: 'railway',
    name: 'Railway',
    description: 'Deploy apps and services via Railway CLI',
    type: 'cli',
    enabled: false,
    fields: [
      { key: 'token', label: 'Railway Token', placeholder: 'your-railway-token', value: '', type: 'password' },
    ]
  },
  {
    id: 'turso',
    name: 'Turso',
    description: 'SQLite edge databases via Turso CLI',
    type: 'cli',
    enabled: false,
    fields: [
      { key: 'token', label: 'Turso Auth Token', placeholder: 'your-turso-token', value: '', type: 'password' },
    ]
  },
]

// Default MCPs (always enabled, cannot be disabled)
export const DEFAULT_MCPS = [
  { id: 'tavily', name: 'Tavily', description: 'Web search' },
  { id: 'playwright', name: 'Playwright', description: 'Browser automation' },
  { id: 'github', name: 'GitHub', description: 'Repository operations' },
  { id: 'context7', name: 'Context7', description: 'Documentation search' },
  { id: 'sequential-thinking', name: 'Sequential Thinking', description: 'Structured reasoning' },
]

// Available models (powered by Bonsai AI Gateway)
export const MODELS = [
  { id: 'sonnet', name: 'Claude Sonnet 4.5', provider: 'Anthropic', description: 'Fast code generation via Bonsai' },
  { id: 'opus', name: 'Claude Opus 4', provider: 'Anthropic', description: 'High quality responses via Bonsai' },
  { id: 'haiku', name: 'GPT-5.1 Codex', provider: 'OpenAI', description: 'OpenAI Codex via Bonsai' },
  { id: 'flash', name: 'GLM 4.6', provider: 'ZAI', description: 'Fast inference via Bonsai' },
] as const

// Context for sharing state across pages
interface AgentCloudContextType {
  sessions: Session[]
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  repos: Repository[]
  selectedRepo: Repository | null
  setSelectedRepo: (repo: Repository | null) => void
  branches: string[]
  selectedBranch: string
  setSelectedBranch: (branch: string) => void
  selectedModel: 'sonnet' | 'opus' | 'haiku' | 'flash'
  setSelectedModel: (model: 'sonnet' | 'opus' | 'haiku' | 'flash') => void
  storedTokens: { github?: string; vercel?: string; netlify?: string }
  isConnected: boolean
  isLoadingTokens: boolean
  isLoadingRepos: boolean
  isLoadingBranches: boolean
  loadBranches: (repoFullName: string) => Promise<void>
  connectors: ConnectorConfig[]
  setConnectors: React.Dispatch<React.SetStateAction<ConnectorConfig[]>>
  createSession: (initialPrompt: string, images?: Array<{ data: string; type: string; name: string }>, newProject?: { name: string }) => Promise<Session | null>
  terminateSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  isCreating: boolean
}

const AgentCloudContext = createContext<AgentCloudContextType | null>(null)

export function useAgentCloud() {
  const context = useContext(AgentCloudContext)
  if (!context) {
    throw new Error('useAgentCloud must be used within AgentCloudLayout')
  }
  return context
}

// Inner component that uses useSearchParams
function AgentCloudLayoutInner({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null)

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Settings
  const [selectedModel, setSelectedModel] = useState<'sonnet' | 'opus' | 'haiku' | 'flash'>('sonnet')

  // Connectors state (persisted to localStorage)
  const [connectors, setConnectors] = useState<ConnectorConfig[]>(DEFAULT_CONNECTORS)

  // Repository selection
  const [repos, setRepos] = useState<Repository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('main')
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)

  // GitHub connection state
  const [storedTokens, setStoredTokens] = useState<{
    github?: string
    vercel?: string
    netlify?: string
  }>({})
  const [isLoadingTokens, setIsLoadingTokens] = useState(true)
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)

  const isConnected = !!storedTokens.github

  // Set active session and update URL
  const setActiveSessionId = useCallback((id: string | null) => {
    setActiveSessionIdState(id)
    if (id) {
      router.push(`/agent-cloud/session?id=${id}`)
    } else {
      router.push('/agent-cloud/new')
    }
    setMobileMenuOpen(false)
  }, [router])

  // Track if initial load is complete
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  const [lastSavedLinesCount, setLastSavedLinesCount] = useState<Map<string, number>>(new Map())

  // Load sessions from Supabase (with localStorage migration)
  useEffect(() => {
    const loadData = async () => {
      try {
        // First, try to migrate any existing localStorage data
        const hasLocalStorageData = localStorage.getItem(STORAGE_KEY)
        if (hasLocalStorageData) {
          console.log('[AgentCloud] Found localStorage data, migrating to Supabase...')
          await agentCloudStorage.migrateFromLocalStorage(STORAGE_KEY)
        }

        // Load sessions from Supabase
        const loadedSessions = await agentCloudStorage.loadSessions()
        if (loadedSessions.length > 0) {
          setSessions(loadedSessions)
          // Initialize lines count tracking
          const countsMap = new Map<string, number>()
          loadedSessions.forEach(s => countsMap.set(s.id, s.lines.length))
          setLastSavedLinesCount(countsMap)
        }

        // Load connectors from Supabase
        const savedConnectors = await agentCloudStorage.loadConnectors()
        if (savedConnectors.size > 0) {
          const merged = DEFAULT_CONNECTORS.map(dc => {
            const saved = savedConnectors.get(dc.id)
            if (saved) {
              return {
                ...dc,
                enabled: saved.enabled,
                fields: dc.fields.map(f => ({
                  ...f,
                  value: saved.fields[f.key] || f.value
                }))
              }
            }
            return dc
          })
          setConnectors(merged)
        }

        // Load model preference from localStorage (small, keep local)
        try {
          const storedSettings = localStorage.getItem('pipilot_agent_cloud_settings')
          if (storedSettings) {
            const settings = JSON.parse(storedSettings)
            if (settings.selectedModel) {
              setSelectedModel(settings.selectedModel)
            }
          }
        } catch (e) {
          // Ignore settings load error
        }
      } catch (error) {
        console.error('[AgentCloud] Failed to load data:', error)
      } finally {
        setIsInitialLoadComplete(true)
      }
    }

    loadData()
  }, [])

  // Sync activeSessionId with URL on mount
  useEffect(() => {
    const sessionId = searchParams.get('id')
    if (pathname === '/agent-cloud/session' && sessionId) {
      setActiveSessionIdState(sessionId)
    } else if (pathname === '/agent-cloud/new' || pathname === '/agent-cloud') {
      setActiveSessionIdState(null)
    }
  }, [pathname, searchParams])

  // Save model preference to localStorage (small data, keep local for quick access)
  useEffect(() => {
    try {
      localStorage.setItem('pipilot_agent_cloud_settings', JSON.stringify({
        selectedModel
      }))
    } catch (error) {
      // Ignore settings save error
    }
  }, [selectedModel])

  // Debounced save to Supabase for session updates
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSessionUpdates = useRef<Set<string>>(new Set())

  // Save sessions to Supabase (debounced, only saves changed sessions)
  useEffect(() => {
    if (!isInitialLoadComplete) return

    // Mark sessions that need updating
    sessions.forEach(session => {
      const lastCount = lastSavedLinesCount.get(session.id) || 0
      if (session.lines.length > lastCount) {
        pendingSessionUpdates.current.add(session.id)
      }
    })

    // Debounce saves to avoid too many DB calls
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const sessionsToUpdate = Array.from(pendingSessionUpdates.current)
      pendingSessionUpdates.current.clear()

      for (const sessionId of sessionsToUpdate) {
        const session = sessions.find(s => s.id === sessionId)
        if (!session) continue

        const lastCount = lastSavedLinesCount.get(sessionId) || 0
        const newLines = session.lines.slice(lastCount)

        if (newLines.length > 0) {
          // Save new messages
          const success = await agentCloudStorage.saveMessages(sessionId, session.lines, lastCount)
          if (success) {
            setLastSavedLinesCount(prev => {
              const updated = new Map(prev)
              updated.set(sessionId, session.lines.length)
              return updated
            })
          }
        }

        // Also update session metadata
        await agentCloudStorage.updateSession(session)
      }
    }, 1000) // 1 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [sessions, isInitialLoadComplete])

  // Save connectors to Supabase when they change
  const connectorsInitialized = useRef(false)
  useEffect(() => {
    if (!isInitialLoadComplete) return

    // Skip the first run (initial load)
    if (!connectorsInitialized.current) {
      connectorsInitialized.current = true
      return
    }

    // Debounce connector saves
    const timeoutId = setTimeout(async () => {
      await agentCloudStorage.saveAllConnectors(connectors)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [connectors, isInitialLoadComplete])

  // Load stored deployment tokens
  const loadStoredTokens = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setIsLoadingTokens(false)
        return
      }

      const tokens = await getDeploymentTokens(user.id)

      if (tokens) {
        const newTokens = {
          github: tokens.github || undefined,
          vercel: tokens.vercel || undefined,
          netlify: tokens.netlify || undefined
        }
        setStoredTokens(newTokens)

        if (newTokens.github) {
          await fetchUserRepos(newTokens.github)
        }
      }
    } catch (error) {
      console.error('loadStoredTokens: Error:', error)
    } finally {
      setIsLoadingTokens(false)
    }
  }

  // Fetch user's GitHub repositories
  const fetchUserRepos = async (githubToken: string) => {
    setIsLoadingRepos(true)
    try {
      const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&type=all', {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PiPilot-Agent-Cloud'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setRepos(data.map((repo: Repository) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          description: repo.description,
          language: repo.language,
          updated_at: repo.updated_at,
          default_branch: repo.default_branch
        })))
      }
    } catch (error) {
      console.error('fetchUserRepos: Error:', error)
    } finally {
      setIsLoadingRepos(false)
    }
  }

  // Fetch branches
  const fetchBranches = async (repoFullName: string): Promise<string[]> => {
    if (!storedTokens.github) return []

    try {
      const response = await fetch(`https://api.github.com/repos/${repoFullName}/branches?per_page=100`, {
        headers: {
          'Authorization': `Bearer ${storedTokens.github}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PiPilot-Agent-Cloud'
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.map((branch: { name: string }) => branch.name)
      }
    } catch (error) {
      console.error('fetchBranches: Error:', error)
    }
    return []
  }

  const loadBranches = async (repoFullName: string) => {
    setIsLoadingBranches(true)
    try {
      const fetchedBranches = await fetchBranches(repoFullName)
      setBranches(fetchedBranches)
      if (fetchedBranches.includes('main')) {
        setSelectedBranch('main')
      } else if (fetchedBranches.includes('master')) {
        setSelectedBranch('master')
      } else if (fetchedBranches.length > 0) {
        setSelectedBranch(fetchedBranches[0])
      }
    } finally {
      setIsLoadingBranches(false)
    }
  }

  // Initialize on mount
  useEffect(() => {
    loadStoredTokens()
  }, [])

  // Create session
  const createSession = async (initialPrompt: string, images?: Array<{ data: string; type: string; name: string }>, newProject?: { name: string }): Promise<Session | null> => {
    if (!newProject && !selectedRepo) {
      toast.error('Please select a repository first')
      return null
    }

    if (newProject && !storedTokens.github) {
      toast.error('GitHub connection required for new projects')
      return null
    }

    setIsCreating(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (storedTokens.github) {
        headers['X-GitHub-Token'] = storedTokens.github
      }

      // Gather enabled connectors with their config values
      const enabledConnectors = connectors
        .filter(c => c.enabled && c.fields.every(f => f.value.trim()))
        .map(c => ({
          id: c.id,
          type: c.type,
          mcpUrl: c.mcpUrl,
          fields: Object.fromEntries(c.fields.map(f => [f.key, f.value]))
        }))

      const response = await fetch('/api/agent-cloud', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'create',
          config: {
            model: selectedModel,
            ...(newProject ? {
              newProject: { name: newProject.name },
            } : {
              repo: {
                full_name: selectedRepo!.full_name,
                branch: selectedBranch
              },
            }),
            initialPrompt, // Pass the initial prompt for branch naming (first 4 words)
            connectors: enabledConnectors.length > 0 ? enabledConnectors : undefined,
          }
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create sandbox')
      }

      const modelInfo = MODELS.find(m => m.id === selectedModel)
      const repoCloned = data.repoCloned === true
      const reconnected = data.reconnected === true
      const workingBranch = data.workingBranch // The branch created for this session

      const sessionTitle = initialPrompt.slice(0, 50) + (initialPrompt.length > 50 ? '...' : '')

      const newSession: Session = {
        id: crypto.randomUUID(),
        sandboxId: data.sandboxId,
        createdAt: new Date(),
        status: 'active',
        model: data.model,
        gateway: data.gateway,
        title: sessionTitle,
        ...(newProject ? {} : {
          repo: {
            name: selectedRepo!.name,
            full_name: selectedRepo!.full_name,
            branch: selectedBranch,
          },
        }),
        workingBranch,
        stats: { additions: 0, deletions: 0 },
        messageCount: data.messageCount || 0,
        pendingPrompt: initialPrompt,
        pendingImages: images && images.length > 0 ? images : undefined,
        isNewProject: !!newProject,
        newProjectName: newProject?.name,
        lines: newProject ? [
          { type: 'system', content: `New project: ${newProject.name}`, timestamp: new Date() },
          { type: 'system', content: `Model: ${modelInfo?.name || data.model}`, timestamp: new Date() },
          { type: 'system', content: `MCP Tools: Tavily, Playwright, GitHub, Context7, Sequential Thinking`, timestamp: new Date() },
        ] : reconnected ? [
          { type: 'system', content: `Reconnected to existing sandbox`, timestamp: new Date() },
          { type: 'system', content: `Repository: ${selectedRepo!.full_name} (${selectedBranch})`, timestamp: new Date() },
          ...(workingBranch ? [{ type: 'system' as const, content: `Working branch: ${workingBranch}`, timestamp: new Date() }] : []),
          { type: 'system', content: `Model: ${modelInfo?.name || data.model}`, timestamp: new Date() },
          { type: 'system', content: `MCP Tools: Tavily, Playwright, GitHub, Context7, Sequential Thinking`, timestamp: new Date() },
        ] : repoCloned ? [
          { type: 'system', content: `Cloned ${selectedRepo!.full_name} (${selectedBranch})`, timestamp: new Date() },
          { type: 'system', content: `Working branch: ${workingBranch || 'main'}`, timestamp: new Date() },
          { type: 'system', content: `Model: ${modelInfo?.name || data.model}`, timestamp: new Date() },
          { type: 'system', content: `MCP Tools: Tavily, Playwright, GitHub, Context7, Sequential Thinking`, timestamp: new Date() },
        ] : [
          { type: 'system', content: `Failed to clone ${selectedRepo!.full_name}`, timestamp: new Date() },
        ]
      }

      // Save to Supabase - only proceed if save succeeds
      const saved = await agentCloudStorage.createSession(newSession)
      if (!saved) {
        console.error('[AgentCloud] Failed to save session to Supabase')
        // Still add to local state but warn user
        toast.warning('Session created locally but cloud sync failed')
      } else {
        // Track lines count for this session
        setLastSavedLinesCount(prev => {
          const updated = new Map(prev)
          updated.set(newSession.id, newSession.lines.length)
          return updated
        })
      }

      setSessions(prev => [newSession, ...prev])
      toast.success(newProject ? 'New project session created' : reconnected ? `Reconnected` : repoCloned ? `Session created` : 'Session created')

      return newSession
    } catch (error) {
      console.error('Failed to create session:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create session')
      return null
    } finally {
      setIsCreating(false)
    }
  }

  // Terminate session
  const terminateSession = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return

    try {
      await fetch('/api/agent-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'terminate',
          sandboxId: session.sandboxId
        })
      })

      // Update local state
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, status: 'terminated' } : s
      ))

      // Update in Supabase
      const updatedSession = { ...session, status: 'terminated' as const }
      await agentCloudStorage.updateSession(updatedSession)

      toast.success('Session terminated')
    } catch (error) {
      console.error('Failed to terminate session:', error)
      toast.error('Failed to terminate session')
    }
  }

  // Delete session
  const deleteSession = async (sessionId: string) => {
    // Check if we're deleting the active session BEFORE updating state
    const isDeletingActive = activeSessionId === sessionId

    // Delete from Supabase
    await agentCloudStorage.deleteSession(sessionId)

    // Remove from lines count tracking
    setLastSavedLinesCount(prev => {
      const updated = new Map(prev)
      updated.delete(sessionId)
      return updated
    })

    // Update sessions state
    setSessions(prev => prev.filter(s => s.id !== sessionId))

    // If deleting the active session, always navigate to new page
    if (isDeletingActive) {
      setActiveSessionIdState(null)
      router.push('/agent-cloud/new')
      setMobileMenuOpen(false)
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
  }

  // Sidebar content - sessions list only
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 font-medium tracking-wide uppercase">Sessions</span>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="h-10 w-10 mx-auto mb-3 text-zinc-800" />
              <p className="text-sm text-zinc-600">No sessions yet</p>
              <p className="text-xs text-zinc-700 mt-1">Create a new session to start</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full text-left px-3 py-3 rounded-xl transition-all group ${
                    activeSessionId === session.id
                      ? 'bg-zinc-800/80'
                      : 'hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                      session.status === 'active'
                        ? 'bg-gradient-to-br from-purple-500 to-violet-600'
                        : 'bg-zinc-700'
                    }`}>
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate leading-tight">
                        {session.title || session.repo?.name || 'Untitled'}
                      </div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1.5 mt-1 font-mono">
                        <span>{session.isNewProject ? session.newProjectName : session.repo?.name}</span>
                        <span className="text-zinc-700">·</span>
                        <span>{formatTime(session.createdAt)}</span>
                        {session.stats && (session.stats.additions > 0 || session.stats.deletions > 0) && (
                          <>
                            <span className="text-zinc-700">·</span>
                            <span className="text-green-500">+{session.stats.additions}</span>
                            <span className="text-red-500">-{session.stats.deletions}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded-md transition-all"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-zinc-900 border-zinc-800">
                        {session.status === 'active' && (
                          <DropdownMenuItem
                            onClick={() => terminateSession(session.id)}
                            className="cursor-pointer text-yellow-500"
                          >
                            <Square className="h-3 w-3 mr-2" />
                            Stop
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => deleteSession(session.id)}
                          className="cursor-pointer text-red-500"
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New session + Settings buttons */}
      <div className="p-4 border-t border-zinc-800/50 space-y-2">
        <Button
          onClick={() => router.push('/agent-cloud/new')}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl h-10 font-medium"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Session
        </Button>
        <Button
          onClick={() => router.push('/agent-cloud/settings')}
          variant="ghost"
          className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-xl h-9 font-medium text-sm"
        >
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>
    </div>
  )

  const contextValue: AgentCloudContextType = {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    repos,
    selectedRepo,
    setSelectedRepo,
    branches,
    selectedBranch,
    setSelectedBranch,
    selectedModel,
    setSelectedModel,
    storedTokens,
    isConnected,
    isLoadingTokens,
    isLoadingRepos,
    isLoadingBranches,
    connectors,
    setConnectors,
    loadBranches,
    createSession,
    terminateSession,
    deleteSession,
    isCreating,
  }

  return (
    <AgentCloudContext.Provider value={contextValue}>
      <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-950/95 backdrop-blur-sm sticky top-0 z-50">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors md:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5 text-zinc-400" />
              ) : (
                <Menu className="h-5 w-5 text-zinc-400" />
              )}
            </button>

            {/* Desktop sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors hidden md:block"
            >
              <PanelLeft className="h-5 w-5 text-zinc-400" />
            </button>

            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-lg tracking-tight">PiPilot Code</span>
              <Badge className="text-[10px] bg-zinc-800 text-zinc-400 font-normal border-0 px-2">
                Research preview
              </Badge>
            </div>
          </div>

          {/* Right - Branch, View PR, MCP indicator */}
          <div className="flex items-center gap-3">
            {/* Branch name - clickable to open in GitHub */}
            {activeSessionId && sessions.find(s => s.id === activeSessionId)?.workingBranch && (
              <a
                href={`https://github.com/${sessions.find(s => s.id === activeSessionId)?.repo?.full_name}/tree/${sessions.find(s => s.id === activeSessionId)?.workingBranch}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                title={sessions.find(s => s.id === activeSessionId)?.workingBranch}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span className="font-mono hidden sm:inline">
                  {(sessions.find(s => s.id === activeSessionId)?.workingBranch || '').length > 25
                    ? (sessions.find(s => s.id === activeSessionId)?.workingBranch || '').slice(0, 25) + '...'
                    : sessions.find(s => s.id === activeSessionId)?.workingBranch}
                </span>
              </a>
            )}

            {/* View PR button */}
            {activeSessionId && sessions.find(s => s.id === activeSessionId)?.workingBranch && (
              <a
                href={`https://github.com/${sessions.find(s => s.id === activeSessionId)?.repo?.full_name}/pulls?q=head:${sessions.find(s => s.id === activeSessionId)?.workingBranch}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="outline" className="h-7 text-xs bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800 rounded-lg">
                  View PR
                  <ExternalLink className="h-3 w-3 ml-1.5" />
                </Button>
              </a>
            )}

            {/* MCP indicator */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Globe className="h-3.5 w-3.5 text-emerald-500" />
              <span className="hidden sm:inline">MCP Enabled</span>
            </div>
          </div>
        </header>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        <div className="flex-1 flex overflow-hidden relative">
          {/* Mobile sidebar */}
          <div className={`
            fixed inset-y-0 left-0 w-72 bg-zinc-950 border-r border-zinc-800/50 z-50
            transform transition-transform duration-300 ease-out md:hidden
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          `}>
            {/* Mobile sidebar header with close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
              <span className="font-semibold text-sm">Sessions</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>
            <SidebarContent />
          </div>

          {/* Desktop sidebar */}
          {sidebarOpen && (
            <div className="w-72 min-w-[288px] border-r border-zinc-800/50 flex-col bg-zinc-950 hidden md:flex">
              <SidebarContent />
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            {children}
          </div>
        </div>
      </div>
    </AgentCloudContext.Provider>
  )
}

// Wrapper with Suspense for useSearchParams
export default function AgentCloudLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    }>
      <AgentCloudLayoutInner>{children}</AgentCloudLayoutInner>
    </Suspense>
  )
}
