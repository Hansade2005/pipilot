"use client"

import { Button } from "@/components/ui/button"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import React, { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import type { Workspace, File } from "@/lib/storage-manager"
import { Sidebar } from "./sidebar"
import { ModernSidebar } from "./modern-sidebar"
import { EmptyWorkspaceView } from "./empty-workspace-view"
import { TemplatesView } from "./templates-view"
import { TemplateEarningsView } from "./template-earnings-view"
import { RepoAgentView } from "./repo-agent-view"
import { ChatPanel } from "./chat-panel"
import { ChatPanelV2 } from "./chat-panel-v2"
import { CodePreviewPanel } from "./code-preview-panel"
import { ProjectHeader } from "./project-header"
import { FileExplorer } from "./file-explorer"
import { CodeEditor, defaultEditorSettings, type EditorSettings } from "./code-editor"
import { DatabaseTab } from "./database-tab"
import { AIPplatformTab } from "./ai-platform-tab"
import { CloudTab } from "./cloud-tab"
import { AuditTab } from "./audit-tab"
import { ActivitySearchPanel } from "./activity-search-panel"
import { ActivityChatPanel } from "./activity-chat-panel"
import { Github, Globe, Rocket, Settings, PanelLeft, PanelLeftClose, PanelLeftOpen, Code, FileText, Eye, Trash2, Copy, ArrowUp, ChevronDown, ChevronUp, Edit3, FolderOpen, X, Wrench, Check, AlertTriangle, Zap, Undo2, Redo2, MessageSquare, Plus, ExternalLink, RotateCcw, Play, DatabaseBackup, Square, Monitor, Smartphone, Database, Cloud, Shield, Search, Folder } from "lucide-react"
import { storageManager } from "@/lib/storage-manager"
import { useToast } from '@/hooks/use-toast'
import { useIsMobile } from "@/hooks/use-mobile"
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useAutoCloudBackup } from '@/hooks/use-auto-cloud-backup'
import { useRealtimeSync } from '@/hooks/use-realtime-sync'
import { useSubscriptionCache } from '@/hooks/use-subscription-cache'
import { restoreBackupFromCloud, isCloudSyncEnabled } from '@/lib/cloud-sync'
import { generateFileUpdate, type StyleChange } from '@/lib/visual-editor'

import { ChatSessionSelector } from "@/components/ui/chat-session-selector"
import { AiModeSelector, type AIMode } from "@/components/ui/ai-mode-selector"
import { DEFAULT_CHAT_MODEL } from "@/lib/ai-models"
import { useGitHubPush } from "@/hooks/use-github-push"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Module-level flag: resets on full page refresh (module reloads), but persists
// across in-session re-renders and client-side navigations. This ensures we only
// auto-restore once per page load — not while the user is actively working.
let hasAutoRestoredThisSession = false

interface WorkspaceLayoutProps {
  user: User
  projects: Workspace[]
  newProjectId?: string
  initialPrompt?: string
}

export function WorkspaceLayout({ user, projects, newProjectId, initialPrompt }: WorkspaceLayoutProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedProject, setSelectedProject] = useState<Workspace | null>(null)

  // Get user subscription information (cached with Realtime)
  const { subscription } = useSubscriptionCache(user?.id)
  const userPlan = subscription?.plan || 'free'
  const subscriptionStatus = subscription?.status || 'inactive'
  const [activeTab, setActiveTab] = useState<"code" | "preview" | "cloud" | "audit">("code")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true) // Changed from false to true
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const { toast } = useToast()
  const [gitHubConnected, setGitHubConnected] = useState(false)
  const [clientProjects, setClientProjects] = useState<Workspace[]>(projects)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [fileExplorerKey, setFileExplorerKey] = useState<number>(0) // Force file explorer refresh
  
  // Modern sidebar state
  const [useModernSidebar, setUseModernSidebar] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  
  // Mobile-specific state
  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<"chat" | "files" | "editor" | "preview" | "cloud" | "audit">("chat")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const [aiMode, setAiMode] = useState<AIMode>('agent')
  const [projectFiles, setProjectFiles] = useState<File[]>([])

  // Chat panel toggle (desktop)
  const [chatPanelVisible, setChatPanelVisible] = useState(true)

  // Resizable sidebar width for activity panels
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const sidebarResizing = useRef(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // VS Code-like code view state
  const [codeViewPanel, setCodeViewPanel] = useState<'files' | 'search' | 'chat' | 'settings' | null>('files')
  const [openFiles, setOpenFiles] = useState<File[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(defaultEditorSettings)

  // Code chat state
  const [codeChatMessages, setCodeChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([])
  const [codeChatInput, setCodeChatInput] = useState('')
  const [isCodeChatLoading, setIsCodeChatLoading] = useState(false)
  const codeChatScrollRef = useRef<HTMLDivElement>(null)

  // Chat session management
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null)
  const [chatSessionKey, setChatSessionKey] = useState<number>(0) // Force chat panel refresh on session change
  
  // Tagged component from visual editor for chat context
  const [taggedComponent, setTaggedComponent] = useState<{
    id: string;
    tagName: string;
    sourceFile?: string;
    sourceLine?: number;
    className: string;
    textContent?: string;
  } | null>(null)

  // Initialize auto cloud backup when user is available
  const { triggerBackup, getSyncStatus } = useCloudSync(user?.id || null)
  
  // Auto cloud backup for file operations
  const { triggerAutoBackup, triggerInstantBackup } = useAutoCloudBackup({
    debounceMs: 1000, // Reduced to 1 second for faster file backups
    silent: true, // Don't show backup notifications for saves (to avoid spam)
    instantForCritical: true // Enable instant backup for critical operations
  })

  // Real-time cross-device sync: when another device backs up, silently restore here
  useRealtimeSync(user?.id || null, {
    onSyncComplete: async () => {
      try {
        await storageManager.init()
        const workspaces = await storageManager.getWorkspaces(user.id)
        setClientProjects(workspaces || [])

        // Refresh files for the currently selected project
        if (selectedProject) {
          const files = await storageManager.getFiles(selectedProject.id)
          setProjectFiles(files || [])
          setFileExplorerKey(prev => prev + 1)
          setChatSessionKey(prev => prev + 1)
        }
      } catch (error) {
        console.error('Failed to reload workspace after cross-device sync:', error)
      }
    }
  })

  // GitHub push functionality
  const { pushToGitHub, checkGitHubConnection, isPushing } = useGitHubPush()

  // Sidebar resize handlers — update DOM directly during drag to avoid
  // cascading React re-renders (which cause "Maximum update depth exceeded"
  // crashes via react-resizable-panels' ResizeObserver). State is synced once on mouseup.
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    sidebarResizing.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth

    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarResizing.current) return
      const newWidth = Math.max(200, Math.min(600, startWidth + (e.clientX - startX)))
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${newWidth}px`
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      sidebarResizing.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Commit final width to React state (single re-render)
      const finalWidth = Math.max(200, Math.min(600, startWidth + (e.clientX - startX)))
      setSidebarWidth(finalWidth)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // VS Code tab management helpers
  const handleOpenFile = (file: File) => {
    setSelectedFile(file)
    setOpenFiles(prev => {
      if (prev.some(f => f.path === file.path)) return prev
      return [...prev, file]
    })
  }

  const handleCloseFile = (file: File) => {
    setOpenFiles(prev => {
      const next = prev.filter(f => f.path !== file.path)
      if (selectedFile?.path === file.path) {
        setSelectedFile(next.length > 0 ? next[next.length - 1] : null)
      }
      return next
    })
  }

  const handleSelectOpenFile = (file: File) => {
    setSelectedFile(file)
  }

  // Code chat handler
  const handleCodeChatSend = async () => {
    if (!codeChatInput.trim() || isCodeChatLoading) return
    const message = codeChatInput.trim()
    setCodeChatInput('')
    setCodeChatMessages(prev => [...prev, { role: 'user', content: message }])
    setIsCodeChatLoading(true)

    try {
      const response = await fetch('/api/ai-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: null,
          lineNumber: null,
          fileName: selectedFile?.name || '',
          fileContent: selectedFile?.content || '',
          userMessage: message,
          projectFiles: projectFiles?.map(f => ({ name: f.name, path: f.path })) || [],
          modelId: selectedModel,
          mode: 'chat'
        })
      })

      if (!response.ok) throw new Error('Failed')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      setCodeChatMessages(prev => [...prev, { role: 'assistant', content: '' }])

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            accumulated += decoder.decode(value, { stream: true })
            setCodeChatMessages(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = { role: 'assistant', content: accumulated }
              return updated
            })
          }
        } finally {
          reader.releaseLock()
        }
      }
    } catch (error) {
      setCodeChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response' }])
    } finally {
      setIsCodeChatLoading(false)
    }
  }

  // Visual Editor save handler - applies style changes to source files
  const handleVisualEditorSave = async (changes: {
    elementId: string;
    changes: StyleChange[];
    sourceFile?: string;
    sourceLine?: number;
  }): Promise<boolean> => {
    try {
      if (!selectedProject || !changes.sourceFile) {
        return false
      }

      // Get the source file from storage
      const file = await storageManager.getFile(selectedProject.id, changes.sourceFile)
      if (!file) {
        toast({
          title: 'File not found',
          description: `Could not find ${changes.sourceFile}`,
          variant: 'destructive',
        })
        return false
      }

      // Generate the updated code using AI-powered editing
      const result = await generateFileUpdate(
        file.content,
        changes.elementId,
        changes.changes,
        changes.sourceFile,
        changes.sourceLine
      );

      if (!result.success) {
        toast({
          title: 'Update failed',
          description: result.error || 'Failed to apply style changes',
          variant: 'destructive',
        })
        return false
      }

      // Save the updated code to storage
      await storageManager.updateFile(selectedProject.id, changes.sourceFile, {
        content: result.updatedCode,
        updatedAt: new Date().toISOString(),
      })

      // Trigger file explorer refresh
      setFileExplorerKey(prev => prev + 1)

      // Dispatch files-changed event to notify other components
      window.dispatchEvent(new CustomEvent('files-changed', {
        detail: {
          projectId: selectedProject.id,
          action: 'visual-edit',
          path: changes.sourceFile,
        }
      }))

      // Trigger auto backup
      triggerAutoBackup(`Visual editor updated: ${changes.sourceFile}`)

      toast({
        title: 'Styles applied',
        description: `Updated ${changes.changes.length} style(s) in ${changes.sourceFile}`,
      })

      return true
    } catch (error) {
      toast({
        title: 'Save failed',
        description: 'An error occurred while saving changes',
        variant: 'destructive',
      })
      return false
    }
  }

  // Visual Editor theme save handler - applies theme to CSS files
  const handleVisualEditorThemeSave = async (theme: { name: string; id: string }, cssContent: string): Promise<boolean> => {
    try {
      if (!selectedProject) {
        return false
      }

      // Determine the CSS file path based on project type
      const possiblePaths = [
        'src/app/globals.css',
        'app/globals.css',
        'src/index.css',
        'src/globals.css',
        'src/App.css',
        'styles/globals.css',
      ]

      let targetFile = null
      let targetPath = ''

      for (const path of possiblePaths) {
        const file = await storageManager.getFile(selectedProject.id, path)
        if (file) {
          targetFile = file
          targetPath = path
          break
        }
      }

      if (!targetFile || !targetPath) {
        toast({
          title: 'CSS file not found',
          description: 'Could not find globals.css or App.css in your project',
          variant: 'destructive',
        })
        return false
      }

      // Save the CSS content to storage
      await storageManager.updateFile(selectedProject.id, targetPath, {
        content: cssContent,
        updatedAt: new Date().toISOString(),
      })

      // Trigger file explorer refresh
      setFileExplorerKey(prev => prev + 1)

      // Dispatch files-changed event to notify other components
      window.dispatchEvent(new CustomEvent('files-changed', {
        detail: {
          projectId: selectedProject.id,
          action: 'theme-update',
          path: targetPath,
        }
      }))

      // Trigger auto backup
      triggerAutoBackup(`Theme applied: ${theme.name}`)

      toast({
        title: 'Theme applied',
        description: `"${theme.name}" theme saved to ${targetPath}`,
      })

      return true
    } catch (error) {
      toast({
        title: 'Theme save failed',
        description: 'An error occurred while saving the theme',
        variant: 'destructive',
      })
      return false
    }
  }

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDescription, setNewProjectDescription] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<'vite-react' | 'nextjs' | 'expo' | 'html'>('vite-react')
  const [isCreating, setIsCreating] = useState(false)
  const [openProjectHeaderDialog, setOpenProjectHeaderDialog] = useState(false)
  const [projectHeaderInitialName, setProjectHeaderInitialName] = useState("")
  const [projectHeaderInitialDescription, setProjectHeaderInitialDescription] = useState("")
  const [isBackingUp, setIsBackingUp] = useState(false)

  // Initial prompt to auto-send to chat when project is created
  const [initialChatPrompt, setInitialChatPrompt] = useState<string | undefined>(undefined)
  // Initial chat mode from homepage selection
  const [initialChatMode, setInitialChatMode] = useState<'plan' | 'agent' | undefined>(undefined)

  // Auto-restore state
  const [isAutoRestoring, setIsAutoRestoring] = useState(false)
  const [justCreatedProject, setJustCreatedProject] = useState(false)
  const [hasAutoOpenedCreateDialog, setHasAutoOpenedCreateDialog] = useState(false)
  const [hasProcessedInitialPrompt, setHasProcessedInitialPrompt] = useState(false)
  
  // Preview-related state
  const [customUrl, setCustomUrl] = useState("")
  const [preview, setPreview] = useState({
    sandboxId: null as string | null,
    url: null as string | null,
    isLoading: false,
    processId: null as string | null,
  })
  
  // Refs to access CodePreviewPanel methods
  const codePreviewRef = useRef<import('./code-preview-panel').CodePreviewPanelRef | null>(null)
  
  // Sync preview state from CodePreviewPanel
  const [syncedPreview, setSyncedPreview] = useState({
    sandboxId: null as string | null,
    url: null as string | null,
    isLoading: false,
    processId: null as string | null,
  })
  
  // Preview view mode state
  const [previewViewMode, setPreviewViewMode] = useState<'desktop' | 'mobile'>('desktop')

  // Track AI streaming state (always mounted, unlike CodePreviewPanel)
  const [isAIStreaming, setIsAIStreaming] = useState(false)

  // Listen for preview state changes from CodePreviewPanel
  useEffect(() => {
    const handlePreviewStateChange = (event: CustomEvent) => {
      const { preview } = event.detail
      setSyncedPreview(preview)
    }
    
    const handlePreviewUrlChange = (event: CustomEvent) => {
      const { url } = event.detail
      setCustomUrl(url)
    }
    
    const handlePreviewReady = (event: CustomEvent) => {
      const { preview } = event.detail
      setSyncedPreview(preview)
      setCustomUrl(preview.url || '')
    }
    
    const handlePreviewStarting = (event: CustomEvent) => {
      const { preview } = event.detail
      setSyncedPreview(preview)
    }
    
    const handlePreviewStopped = (event: CustomEvent) => {
      const { preview } = event.detail
      setSyncedPreview(preview)
      setCustomUrl('')
    }

    const handleAiStreamComplete = (event: CustomEvent) => {
      const { shouldSwitchToPreview, shouldCreatePreview } = event.detail

      // Stream is complete — clear streaming state immediately so the preview panel
      // doesn't keep showing <AIRespondingView/>. Without this, on mobile there's a
      // timing gap: mobileTab switches to 'preview' here, but isAIStreaming only
      // becomes false later (after setIsLoading(false) → useEffect → ai-streaming-state).
      setIsAIStreaming(false)

      if (shouldSwitchToPreview) {
        setActiveTab('preview')
        if (isMobile) {
          setMobileTab('preview')
        }
      }

      if (shouldCreatePreview) {
        // Trigger preview creation with a longer delay to ensure all file writes
        // to IndexedDB are fully committed before we read them for preview.
        // Users reported that auto-started previews had stale/old file states.
        setTimeout(() => {
          if (codePreviewRef.current) {
            codePreviewRef.current.createPreview()
          }
        }, 1500)
      }
    }

    // Auto-switch to preview tab when AI starts streaming so the user
    // sees the AI responding view (rocket + witty messages) immediately.
    // Only on desktop - no auto-switch on mobile.
    const handleAiStreamingState = (event: CustomEvent) => {
      const { isStreaming } = event.detail
      setIsAIStreaming(isStreaming)
      if (isStreaming && !isMobile) {
        setActiveTab('preview')
      }
    }

    // Handle opening file from search results or other sources
    const handleOpenFileInEditor = async (event: CustomEvent) => {
      const { filePath, lineNumber } = event.detail

      if (!selectedProject || !filePath) return

      try {
        await storageManager.init()
        const files = await storageManager.getFiles(selectedProject.id)
        const file = files.find(f => f.path === filePath)

        if (file) {
          setSelectedFile(file)
          // Switch to code tab on desktop, editor tab on mobile
          if (isMobile) {
            setMobileTab('editor')
          } else {
            setActiveTab('code')
          }

          // Dispatch event for code editor to scroll to line
          if (lineNumber) {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('editor-scroll-to-line', {
                detail: { lineNumber }
              }))
            }, 100)
          }
        } else {
          toast({
            title: 'File not found',
            description: `Could not find ${filePath}`,
            variant: 'destructive'
          })
        }
      } catch (error) {
        // Error opening file - silently fail
      }
    }

    window.addEventListener('preview-state-changed', handlePreviewStateChange as EventListener)
    window.addEventListener('preview-url-changed', handlePreviewUrlChange as EventListener)
    window.addEventListener('preview-ready', handlePreviewReady as EventListener)
    window.addEventListener('preview-starting', handlePreviewStarting as EventListener)
    window.addEventListener('preview-stopped', handlePreviewStopped as EventListener)
    window.addEventListener('ai-stream-complete', handleAiStreamComplete as EventListener)
    window.addEventListener('ai-streaming-state', handleAiStreamingState as EventListener)
    window.addEventListener('openFileInEditor', handleOpenFileInEditor as EventListener)

    return () => {
      window.removeEventListener('preview-state-changed', handlePreviewStateChange as EventListener)
      window.removeEventListener('preview-url-changed', handlePreviewUrlChange as EventListener)
      window.removeEventListener('preview-ready', handlePreviewReady as EventListener)
      window.removeEventListener('preview-starting', handlePreviewStarting as EventListener)
      window.removeEventListener('preview-stopped', handlePreviewStopped as EventListener)
      window.removeEventListener('ai-stream-complete', handleAiStreamComplete as EventListener)
      window.removeEventListener('ai-streaming-state', handleAiStreamingState as EventListener)
      window.removeEventListener('openFileInEditor', handleOpenFileInEditor as EventListener)
    }
  }, [selectedProject, isMobile, toast])

  // Auto-restore from cloud and load projects from IndexedDB on client-side
  // Only runs on fresh page load/refresh (hasAutoRestoredThisSession resets on reload)
  useEffect(() => {
    const loadClientProjects = async () => {
      try {
        setIsLoadingProjects(true)

        await storageManager.init()

        const isDeletingProject = searchParams.get('deleting') === 'true'
        const isNewProject = searchParams.get('newProject') !== null

        // Auto-restore on any page refresh/navigation, but NOT during active session
        // hasAutoRestoredThisSession is module-level: resets on page refresh, persists in-session
        if (!hasAutoRestoredThisSession && !isDeletingProject && !justCreatedProject && !isNewProject) {
          const cloudSyncEnabled = await isCloudSyncEnabled(user.id)

          if (cloudSyncEnabled) {
            setIsAutoRestoring(true)

            try {
              const restoreSuccess = await restoreBackupFromCloud(user.id)

              if (restoreSuccess) {
                toast({
                  title: "Auto-restore completed",
                  description: "Your latest project data has been restored from the cloud.",
                })
              }
            } catch (restoreError) {
              toast({
                title: "Auto-restore failed",
                description: "Could not restore from cloud. Using local data.",
                variant: "destructive"
              })
            } finally {
              setIsAutoRestoring(false)
            }
          }

          // Mark as restored for this session — prevents re-restore on in-session navigation
          hasAutoRestoredThisSession = true
        }

        const workspaces = await storageManager.getWorkspaces(user.id)
        setClientProjects((prevProjects) => [...(prevProjects || []), ...(workspaces || [])])
      } catch (error) {
        setClientProjects([])
      } finally {
        setIsLoadingProjects(false)
      }
    }

    // Only load on client-side
    if (typeof window !== 'undefined') {
      loadClientProjects()
    }
  }, [user.id]) // Only depend on user.id, not projects

  // Handle project selection from URL params (both newProject and projectId)
  useEffect(() => {
    const projectId = searchParams.get('projectId') || searchParams.get('newProject')

    if (projectId && clientProjects.length > 0 && !isLoadingProjects) {
      const project = clientProjects.find(p => p.id === projectId)
      if (project) {
        // CRITICAL FIX: Verify this is a new project from chat-input and load its files explicitly
        const isNewProjectFromChatInput = searchParams.get('newProject') === projectId
        if (isNewProjectFromChatInput) {
          // Set justCreatedProject flag to prevent auto-restore from deleting new files
          setJustCreatedProject(true)

          // Clear the flag after 5 seconds (enough time for initial load)
          setTimeout(() => {
            setJustCreatedProject(false)
          }, 5000)

          // Load files explicitly for this new project to prevent contamination
          import('@/lib/storage-manager').then(({ storageManager }) => {
            storageManager.init().then(() => {
              storageManager.getFiles(projectId)
            })
          })
        }

        setSelectedProject(project)

        // Force file explorer refresh when selecting any project
        setTimeout(() => {
          setFileExplorerKey(prev => prev + 1)
        }, 100)

        // Update URL to ADD projectId alongside newProject (KEEP BOTH for protection)
        // DO NOT delete newProject parameter - it's needed to prevent auto-restore contamination!
        if (searchParams.get('newProject') && !searchParams.get('projectId')) {
          const params = new URLSearchParams(searchParams.toString())
          // ✅ CRITICAL FIX: Keep newProject parameter AND add projectId
          // This ensures auto-restore is skipped during the initial load period
          params.set('projectId', projectId)
          // DO NOT DELETE: params.delete('newProject') - this would cause contamination!
          
          // Retrieve the FULL prompt from sessionStorage (not truncated)
          // This ensures the complete prompt is sent to the chat panel
          if (typeof window !== 'undefined') {
            const storedPrompt = sessionStorage.getItem(`initial-prompt-${projectId}`)
            if (storedPrompt) {
              setInitialChatPrompt(storedPrompt)
              sessionStorage.removeItem(`initial-prompt-${projectId}`)
            }
            const storedMode = sessionStorage.getItem(`initial-chat-mode-${projectId}`)
            if (storedMode === 'plan' || storedMode === 'agent') {
              setInitialChatMode(storedMode)
              sessionStorage.removeItem(`initial-chat-mode-${projectId}`)
            }
            const storedModel = sessionStorage.getItem(`initial-model-${projectId}`)
            if (storedModel) {
              setSelectedModel(storedModel)
              sessionStorage.removeItem(`initial-model-${projectId}`)
            }
          }
          
          // Legacy: Also check URL param for backward compatibility
          const promptParam = searchParams.get('prompt')
          if (promptParam && !sessionStorage.getItem(`initial-prompt-${projectId}`)) {
            setInitialChatPrompt(decodeURIComponent(promptParam))
            params.delete('prompt') // Remove prompt from URL after extracting
          }
          
          router.replace(`/workspace?${params.toString()}`)
        }
        
        // Clear initial chat prompt after a delay to prevent re-sending
        setTimeout(() => {
          setInitialChatPrompt(undefined)
        }, 5000)
      } else {
        // Project not found, might be a newly created project that's not loaded yet
      }
    }
  }, [searchParams, clientProjects, selectedProject, router, isLoadingProjects])

  // Update browser tab title based on selected project
  useEffect(() => {
    if (selectedProject?.name) {
      document.title = `${selectedProject.name} - PiPilot Workspace`
    } else {
      document.title = 'PiPilot Workspace'
    }
    // Restore original title on unmount
    return () => {
      document.title = "PiPilot - Canada's First Agentic Vibe Coding Platform | AI App Builder"
    }
  }, [selectedProject?.name])

  // Also reload when newProjectId changes (in case project was just created)
  useEffect(() => {
    if (newProjectId && typeof window !== 'undefined') {
      const reloadProjects = async () => {
        try {
          await storageManager.init()
          const workspaces = await storageManager.getWorkspaces(user.id)

          // Update client projects
          setClientProjects(workspaces || [])

          // Find and auto-select the new project if it exists
          const newProject = workspaces?.find(w => w.id === newProjectId)
          if (newProject) {
            setSelectedProject(newProject)

            // Force file explorer refresh for newly created projects
            setTimeout(() => {
              setFileExplorerKey(prev => prev + 1)
            }, 100)

            // Only add projectId if not already present
            const params = new URLSearchParams(searchParams.toString())
            if (!params.get('projectId')) {
              params.set('projectId', newProjectId)
              router.replace(`/workspace?${params.toString()}`)
            }
          }
        } catch (error) {
          // Error reloading projects - silently fail
        }
      }
      reloadProjects()
    }
  }, [newProjectId, user.id, searchParams, router])

  useEffect(() => {
    const loadProjectFiles = async () => {
      if (selectedProject && typeof window !== 'undefined') {
        try {
          await storageManager.init()
          const files = await storageManager.getFiles(selectedProject.id)

          // CRITICAL FIX: Verify all files belong to the correct workspace
          const incorrectFiles = files.filter(f => f.workspaceId !== selectedProject.id)
          if (incorrectFiles.length > 0) {
            // Filter out contaminated files
            const cleanFiles = files.filter(f => f.workspaceId === selectedProject.id)
            setProjectFiles(cleanFiles)
          } else {
            setProjectFiles(files || [])
          }
        } catch (error) {
          setProjectFiles([])
        }
      } else {
        setProjectFiles([])
      }
    }

    loadProjectFiles()
  }, [selectedProject])

  // Refresh projectFiles when AI tools write/edit files (same source of truth as chat panel)
  useEffect(() => {
    if (!selectedProject) return

    const handleFilesChanged = async (e: CustomEvent) => {
      const detail = e.detail as { projectId: string; forceRefresh?: boolean }
      if (detail.projectId === selectedProject.id) {
        try {
          const { storageManager } = await import('@/lib/storage-manager')
          await storageManager.init()
          const files = await storageManager.getFiles(selectedProject.id)
          setProjectFiles(files || [])
        } catch (error) {
          console.error('[WorkspaceLayout] Error refreshing files after change:', error)
        }
      }
    }

    window.addEventListener('files-changed', handleFilesChanged as EventListener)
    return () => window.removeEventListener('files-changed', handleFilesChanged as EventListener)
  }, [selectedProject])

  // Handle modal close - reset form fields
  const handleModalClose = (open: boolean) => {
    setIsCreateDialogOpen(open)
    if (!open) {
      // Reset form when closing
      setNewProjectName("")
      setNewProjectDescription("")
      setSelectedTemplate('vite-react')
      setHasProcessedInitialPrompt(false) // Allow re-processing if user re-enters prompt
    }
  }

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return

    setIsCreating(true)

    try {
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      // Auto-generate slug from project name
      const slug = newProjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

      const workspace = await storageManager.createWorkspace({
        name: newProjectName,
        description: newProjectDescription || undefined,
        userId: user.id,
        isPublic: false,
        isTemplate: false,
        lastActivity: new Date().toISOString(),
        deploymentStatus: 'not_deployed',
        slug
      })
      // Apply template files based on selection
      const { TemplateService } = await import('@/lib/template-service')
      if (selectedTemplate === 'nextjs') {
        await TemplateService.applyNextJSTemplate(workspace.id)
      } else if (selectedTemplate === 'expo') {
        await TemplateService.applyExpoTemplate(workspace.id)
      } else if (selectedTemplate === 'html') {
        await TemplateService.applyHtmlTemplate(workspace.id)
      } else {
        await TemplateService.applyViteReactTemplate(workspace.id)
      }
      // Close dialog and reset form
      setIsCreateDialogOpen(false)
      setNewProjectName("")
      setNewProjectDescription("")
      // Navigate to the new project
      if (workspace) {
        setSelectedProject(workspace)
        setSelectedFile(null)

        // Update URL to reflect the new project
        const params = new URLSearchParams(searchParams.toString())
        params.set('projectId', workspace.id)
        router.push(`/workspace?${params.toString()}`)

        // Prevent auto-restore for newly created project
        setJustCreatedProject(true)

        // Trigger backup after project creation
        if (triggerInstantBackup) {
          await triggerInstantBackup('Project created')
        }

        // Reset the flag after a short delay
        setTimeout(() => setJustCreatedProject(false), 2000)
      }

      // Refresh projects list
      try {
        await storageManager.init()
        const workspaces = await storageManager.getWorkspaces(user.id)
        setClientProjects(workspaces || [])
      } catch (error) {
        // Error refreshing projects - silently fail
      }
    } catch (error) {
      // Error creating project - silently fail
    } finally {
      setIsCreating(false)
    }
  }

  // Sync data from server if client has no projects
  useEffect(() => {
    if (clientProjects.length === 0 && newProjectId && typeof window !== 'undefined') {
      const syncFromServer = async () => {
        try {
          // Try to fetch from server API
          const response = await fetch('/api/workspaces')
          if (response.ok) {
            const data = await response.json()
            if (data.workspaces && data.workspaces.length > 0) {
              setClientProjects(data.workspaces)
            }
          }
        } catch (error) {
          // Error syncing from server - silently fail
        }
      }
      syncFromServer()
    }
  }, [clientProjects.length, newProjectId])

  // Handle new project selection and initial prompt
  React.useEffect(() => {
    if (newProjectId && clientProjects.length > 0) {
      const newProject = clientProjects.find(p => p.id === newProjectId)
      if (newProject) {
        setSelectedProject(newProject)
      }
    }
  }, [newProjectId, clientProjects])

  // Reset auto-open flag when projects are loaded
  React.useEffect(() => {
    if (clientProjects.length > 0) {
      setHasAutoOpenedCreateDialog(false)
    }
  }, [clientProjects.length])

  // Check GitHub connection status when project changes
  React.useEffect(() => {
    const checkConnection = async () => {
      if (!selectedProject) {
        setGitHubConnected(false)
        return
      }

      const connectionStatus = await checkGitHubConnection(selectedProject)
      setGitHubConnected(connectionStatus.connected)
    }

    checkConnection()
  }, [selectedProject, checkGitHubConnection])

  // Auto-switch to editor tab when file is selected on mobile
  React.useEffect(() => {
    if (selectedFile && isMobile) {
      setMobileTab("editor")
    }
  }, [selectedFile, isMobile])

  // Listen for AI stream completion to trigger automatic backup
  React.useEffect(() => {
    const handleAIStreamComplete = async (event: Event) => {
      // Only backup if we have a selected project and user
      if (selectedProject && user?.id) {
        try {
          await handleBackupToCloud()
        } catch (error) {
          // Don't show error toast for automatic backups to avoid spam
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('ai-stream-complete', handleAIStreamComplete)

      return () => {
        window.removeEventListener('ai-stream-complete', handleAIStreamComplete)
      }
    }
  }, [selectedProject, user?.id])

  // Clear chat function for mobile header
  const handleClearChat = async () => {
    if (!selectedProject) return

    try {
      await storageManager.init()

      // Find and deactivate current session for this project
      const chatSessions = await storageManager.getChatSessions(selectedProject.userId)
      const activeSession = chatSessions.find((session: any) =>
        session.workspaceId === selectedProject.id && session.isActive
      )

      if (activeSession) {
        // Deactivate the current session instead of deleting (preserves history)
        await storageManager.updateChatSession(activeSession.id, {
          isActive: false,
          endedAt: new Date().toISOString()
        })
      }

      toast({
        title: "Chat Cleared",
        description: `Chat history cleared for ${selectedProject.name}. Start a new conversation!`,
      })

      // Force chat panel refresh by triggering a re-render
      window.dispatchEvent(new CustomEvent('chat-cleared', { detail: { projectId: selectedProject.id } }))
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear chat history. Please try again.",
        variant: "destructive"
      })
    }
  }

  // GitHub push handler for mobile header
  const handlePushToGitHub = async () => {
    if (!selectedProject) return

    try {
      await pushToGitHub(selectedProject)
      toast({
        title: "Success",
        description: "Changes pushed to GitHub successfully!",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to push changes to GitHub. Please try again.",
        variant: "destructive"
      })
    }
  }

  // Cloud backup handler for mobile header
  const handleBackupToCloud = async () => {
    if (!selectedProject || !user?.id) return

    setIsBackingUp(true)

    try {
      const { uploadBackupToCloud } = await import('@/lib/cloud-sync')
      const success = await uploadBackupToCloud(user.id)

      if (!success) throw new Error("Backup failed")

      toast({
        title: "Backup Complete",
        description: "Project backed up to cloud successfully"
      })
    } catch (error: any) {
      toast({
        title: "Backup Failed",
        description: error.message || "Failed to create backup",
        variant: "destructive"
      })
    } finally {
      setIsBackingUp(false)
    }
  }

  // Preview control functions
  const refreshPreview = () => {
    if (codePreviewRef.current) {
      codePreviewRef.current.refreshPreview()
    }
  }

  const openStackBlitz = () => {
    if (selectedProject && codePreviewRef.current) {
      codePreviewRef.current.openStackBlitz()
    }
  }

  const createPreview = () => {
    if (codePreviewRef.current) {
      codePreviewRef.current.createPreview()
    }
  }

  const cleanupSandbox = () => {
    if (codePreviewRef.current) {
      codePreviewRef.current.cleanupSandbox()
    }
  }

  return (
    <div className="h-screen flex bg-gray-950 relative">
      {/* Desktop Layout */}
      {!isMobile && (
        <>
          {/* Always use ModernSidebar for desktop */}
          <ModernSidebar
            user={user}
            projects={clientProjects}
            selectedProject={selectedProject}
            isExpanded={!sidebarCollapsed}
            onToggleExpanded={() => setSidebarCollapsed(!sidebarCollapsed)}
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Project Header */}
            <ProjectHeader
              project={selectedProject}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              userPlan={userPlan}
              subscriptionStatus={subscriptionStatus}
              onShare={(_shareUrl?: string) => {
                toast({ title: 'Link Copied', description: 'Project link copied to clipboard' })
              }}
              onSettings={() => window.open('/workspace/management', '_blank')}
              onDeploy={() => router.push(`/workspace/deployment?project=${selectedProject?.id}`)}
              onDatabase={() => {
                if (isMobile) {
                  // Switch to cloud tab on mobile
                  setMobileTab('cloud')
                } else if (selectedProject) {
                  // Switch to cloud tab on desktop
                  setActiveTab('cloud')
                }
              }}
              user={user}
              openDialog={openProjectHeaderDialog}
              initialName={projectHeaderInitialName}
              initialDescription={projectHeaderInitialDescription}
              onDialogOpenChange={(open) => {
                setOpenProjectHeaderDialog(open)
                if (!open) {
                  setProjectHeaderInitialName("")
                  setProjectHeaderInitialDescription("")
                  setHasProcessedInitialPrompt(false) // Allow re-processing if user re-enters prompt
                }
              }}
              currentChatSessionId={currentChatSessionId}
              onChatSessionChange={(sessionId) => {
                setCurrentChatSessionId(sessionId)
                setChatSessionKey(prev => prev + 1)
              }}
              onNewChatSession={() => {
                setChatSessionKey(prev => prev + 1)
              }}
              onProjectCreated={async (newProject) => {
                // Refresh projects when a new one is created
                try {
                  await storageManager.init()
                  const workspaces = await storageManager.getWorkspaces(user.id)
                  setClientProjects(workspaces || [])
                                    
                  // Automatically select the newly created project
                  if (newProject) {
                    setSelectedProject(newProject)
                    setSelectedFile(null)
                    
                    // Update URL to reflect the new project with BOTH projectId AND newProject params
                    // The newProject param signals to skip auto-restore (prevents file contamination)
                    const params = new URLSearchParams(searchParams.toString())
                    params.set('projectId', newProject.id)
                    params.set('newProject', newProject.id) // ✅ CRITICAL: This prevents auto-restore from running
                    router.push(`/workspace?${params.toString()}`)
                    
                                        
                    // Prevent auto-restore for newly created project
                    setJustCreatedProject(true)
                    
                    // Trigger backup after project creation
                    if (triggerInstantBackup) {
                      await triggerInstantBackup('Project created')
                    }
                    
                    // Reset the flag after a short delay
                    setTimeout(() => setJustCreatedProject(false), 2000)
                    
                                      }
                } catch (error) {
                  // Error refreshing projects - silently fail
                }
              }}
            />

            {/* Loading State */}
            {isLoadingProjects && (
              <div className="flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">
                    {isAutoRestoring ? 'Restoring latest data from cloud...' : 'Loading projects from storage...'}
                  </p>
                  {isAutoRestoring && (
                    <p className="text-sm text-muted-foreground mt-2">
                      This may take a moment depending on your data size
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Main Workspace */}
            {!isLoadingProjects && clientProjects.length > 0 && selectedProject && (
              <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0" key={chatPanelVisible ? 'with-chat' : 'without-chat'}>
                {/* Left Panel - Chat (Resizable) - toggleable */}
                {chatPanelVisible && (
                  <>
                    <ResizablePanel defaultSize={40} minSize={20} maxSize={40}>
                      <div className="h-full flex flex-col overflow-hidden border-r border-gray-800/60">
                        <ChatPanelV2
                          key={`chat-${selectedProject.id}-${chatSessionKey}`}
                          project={selectedProject}
                          selectedModel={selectedModel}
                          onModelChange={setSelectedModel}
                          userPlan={userPlan}
                          subscriptionStatus={subscriptionStatus}
                          aiMode={aiMode}
                          initialPrompt={initialChatPrompt}
                          initialChatMode={initialChatMode}
                          taggedComponent={taggedComponent}
                          onClearTaggedComponent={() => setTaggedComponent(null)}
                        />
                      </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />
                  </>
                )}

                {/* Right Panel - VS Code Layout */}
                <ResizablePanel defaultSize={chatPanelVisible ? 60 : 100} minSize={30}>
                  <div className="h-full flex flex-col overflow-hidden">
                    {/* Content Area */}
                    {activeTab === "code" ? (
                      /* VS Code-like Layout: Activity Bar + Sidebar + Editor */
                      <div className="flex-1 flex min-h-0">
                        {/* Activity Bar - VS Code icon strip */}
                        <div className="w-12 bg-gray-950 border-r border-gray-800/60 flex flex-col items-center py-1 flex-shrink-0">
                          {/* Toggle Chat Panel */}
                          <button
                            onClick={() => setChatPanelVisible(v => !v)}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg mb-1 transition-colors relative ${
                              chatPanelVisible
                                ? 'text-orange-400 bg-orange-600/15'
                                : 'text-gray-500 hover:text-orange-400 hover:bg-orange-500/10'
                            }`}
                            title={chatPanelVisible ? "Hide Chat Panel" : "Show Chat Panel"}
                          >
                            {chatPanelVisible ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
                          </button>

                          <div className="w-6 border-t border-gray-800/60 mb-1" />

                          <button
                            onClick={() => setCodeViewPanel(codeViewPanel === 'files' ? null : 'files')}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors relative ${
                              codeViewPanel === 'files'
                                ? 'text-white bg-gray-800/60'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                            title="Explorer"
                          >
                            <Folder className="size-5" />
                            {codeViewPanel === 'files' && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r" />
                            )}
                          </button>
                          <button
                            onClick={() => setCodeViewPanel(codeViewPanel === 'search' ? null : 'search')}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors relative ${
                              codeViewPanel === 'search'
                                ? 'text-white bg-gray-800/60'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                            title="Search"
                          >
                            <Search className="size-5" />
                            {codeViewPanel === 'search' && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r" />
                            )}
                          </button>
                          <button
                            onClick={() => setCodeViewPanel(codeViewPanel === 'chat' ? null : 'chat')}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors relative ${
                              codeViewPanel === 'chat'
                                ? 'text-white bg-gray-800/60'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                            title="Chat"
                          >
                            <MessageSquare className="size-5" />
                            {codeViewPanel === 'chat' && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r" />
                            )}
                          </button>

                          <div className="flex-1" />

                          {/* Bottom activity bar icons */}
                          <button
                            onClick={() => setActiveTab("preview")}
                            className="w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors text-gray-500 hover:text-gray-300"
                            title="Live Preview"
                          >
                            <Eye className="size-5" />
                          </button>
                          <button
                            onClick={() => setActiveTab("cloud")}
                            className="w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors text-gray-500 hover:text-gray-300"
                            title="Cloud Services"
                          >
                            <Cloud className="size-5" />
                          </button>
                          <button
                            onClick={() => setActiveTab("audit")}
                            className="w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors text-gray-500 hover:text-gray-300"
                            title="Code Audit"
                          >
                            <Shield className="size-5" />
                          </button>
                          <button
                            onClick={() => setCodeViewPanel(codeViewPanel === 'settings' ? null : 'settings')}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors relative ${
                              codeViewPanel === 'settings'
                                ? 'text-white bg-gray-800/60'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                            title="Settings"
                          >
                            <Settings className="size-5" />
                            {codeViewPanel === 'settings' && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r" />
                            )}
                          </button>
                        </div>

                        {/* Sidebar Panel (File Explorer, Search, Chat, or Settings) - Resizable */}
                        {codeViewPanel && (
                          <div ref={sidebarRef} className="relative bg-gray-950 border-r border-gray-800/60 flex flex-col min-h-0 flex-shrink-0" style={{ width: sidebarWidth }}>
                            {/* Drag handle for resizing */}
                            <div
                              onMouseDown={handleSidebarResizeStart}
                              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-orange-500/40 active:bg-orange-500/60 transition-colors"
                            />
                            {codeViewPanel === 'files' && (
                              <FileExplorer
                                key={fileExplorerKey}
                                project={selectedProject}
                                onFileSelect={(file) => {
                                  if (file) handleOpenFile(file)
                                }}
                                selectedFile={selectedFile}
                              />
                            )}
                            {codeViewPanel === 'search' && (
                              <ActivitySearchPanel
                                projectId={selectedProject?.id || null}
                                onOpenFile={(filePath, lineNumber) => {
                                  const file = projectFiles.find(f => f.path === filePath)
                                  if (file) handleOpenFile(file)
                                }}
                              />
                            )}
                            {codeViewPanel === 'chat' && (
                              <ActivityChatPanel
                                projectId={selectedProject?.id || null}
                                projectFiles={projectFiles}
                                selectedFile={selectedFile}
                                openFiles={openFiles}
                                selectedModel={selectedModel}
                                onOpenFile={(filePath) => {
                                  const file = projectFiles.find(f => f.path === filePath)
                                  if (file) handleOpenFile(file)
                                }}
                              />
                            )}
                            {codeViewPanel === 'settings' && (
                              <div className="flex flex-col h-full">
                                <div className="px-4 py-3 border-b border-gray-800/60">
                                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Editor Settings</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-4">

                                  {/* Theme */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Theme</label>
                                    <select
                                      value={editorSettings.theme}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, theme: e.target.value as EditorSettings['theme'] }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value="vs-dark">Dark (Default)</option>
                                      <option value="vs">Light</option>
                                      <option value="hc-black">High Contrast Dark</option>
                                      <option value="hc-light">High Contrast Light</option>
                                    </select>
                                  </div>

                                  {/* Font Size */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Font Size</label>
                                    <div className="mt-1 flex items-center gap-2">
                                      <input
                                        type="range"
                                        min="10"
                                        max="24"
                                        value={editorSettings.fontSize}
                                        onChange={(e) => setEditorSettings(prev => ({ ...prev, fontSize: Number(e.target.value) }))}
                                        className="flex-1 accent-orange-500 h-1"
                                      />
                                      <span className="text-xs text-gray-300 w-8 text-right">{editorSettings.fontSize}px</span>
                                    </div>
                                  </div>

                                  {/* Font Family */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Font Family</label>
                                    <select
                                      value={editorSettings.fontFamily}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, fontFamily: e.target.value }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value="JetBrains Mono, Fira Code, monospace">JetBrains Mono</option>
                                      <option value="Fira Code, monospace">Fira Code</option>
                                      <option value="Cascadia Code, monospace">Cascadia Code</option>
                                      <option value="Source Code Pro, monospace">Source Code Pro</option>
                                      <option value="Consolas, monospace">Consolas</option>
                                      <option value="Monaco, monospace">Monaco</option>
                                      <option value="monospace">System Mono</option>
                                    </select>
                                  </div>

                                  {/* Tab Size */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Tab Size</label>
                                    <select
                                      value={editorSettings.tabSize}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, tabSize: Number(e.target.value) }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value={2}>2 spaces</option>
                                      <option value={4}>4 spaces</option>
                                      <option value={8}>8 spaces</option>
                                    </select>
                                  </div>

                                  {/* Word Wrap */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Word Wrap</label>
                                    <select
                                      value={editorSettings.wordWrap}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, wordWrap: e.target.value as EditorSettings['wordWrap'] }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value="on">On</option>
                                      <option value="off">Off</option>
                                      <option value="wordWrapColumn">Word Wrap Column</option>
                                      <option value="bounded">Bounded</option>
                                    </select>
                                  </div>

                                  {/* Line Numbers */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Line Numbers</label>
                                    <select
                                      value={editorSettings.lineNumbers}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, lineNumbers: e.target.value as EditorSettings['lineNumbers'] }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value="on">On</option>
                                      <option value="off">Off</option>
                                      <option value="relative">Relative</option>
                                      <option value="interval">Interval</option>
                                    </select>
                                  </div>

                                  {/* Cursor Style */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Cursor Style</label>
                                    <select
                                      value={editorSettings.cursorStyle}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, cursorStyle: e.target.value as EditorSettings['cursorStyle'] }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value="line">Line</option>
                                      <option value="block">Block</option>
                                      <option value="underline">Underline</option>
                                      <option value="line-thin">Line Thin</option>
                                      <option value="block-outline">Block Outline</option>
                                      <option value="underline-thin">Underline Thin</option>
                                    </select>
                                  </div>

                                  {/* Cursor Blinking */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Cursor Blinking</label>
                                    <select
                                      value={editorSettings.cursorBlinking}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, cursorBlinking: e.target.value as EditorSettings['cursorBlinking'] }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value="blink">Blink</option>
                                      <option value="smooth">Smooth</option>
                                      <option value="phase">Phase</option>
                                      <option value="expand">Expand</option>
                                      <option value="solid">Solid</option>
                                    </select>
                                  </div>

                                  {/* Render Whitespace */}
                                  <div>
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Render Whitespace</label>
                                    <select
                                      value={editorSettings.renderWhitespace}
                                      onChange={(e) => setEditorSettings(prev => ({ ...prev, renderWhitespace: e.target.value as EditorSettings['renderWhitespace'] }))}
                                      className="mt-1 w-full px-2.5 py-1.5 bg-gray-900/80 border border-gray-700/60 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-600"
                                    >
                                      <option value="none">None</option>
                                      <option value="boundary">Boundary</option>
                                      <option value="selection">Selection</option>
                                      <option value="trailing">Trailing</option>
                                      <option value="all">All</option>
                                    </select>
                                  </div>

                                  {/* Toggle Settings */}
                                  <div className="space-y-2 pt-1">
                                    <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider block">Features</label>
                                    {([
                                      ['minimap', 'Minimap'],
                                      ['bracketPairColorization', 'Bracket Pair Colors'],
                                      ['indentGuides', 'Indent Guides'],
                                      ['smoothScrolling', 'Smooth Scrolling'],
                                      ['scrollBeyondLastLine', 'Scroll Beyond Last Line'],
                                      ['stickyScroll', 'Sticky Scroll'],
                                      ['linkedEditing', 'Linked Editing'],
                                      ['formatOnPaste', 'Format On Paste'],
                                      ['formatOnType', 'Format On Type'],
                                      ['insertSpaces', 'Insert Spaces'],
                                    ] as const).map(([key, label]) => (
                                      <label key={key} className="flex items-center justify-between cursor-pointer group">
                                        <span className="text-xs text-gray-300 group-hover:text-gray-100 transition-colors">{label}</span>
                                        <button
                                          onClick={() => setEditorSettings(prev => ({ ...prev, [key]: !prev[key] }))}
                                          className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${
                                            editorSettings[key] ? 'bg-orange-600' : 'bg-gray-700'
                                          }`}
                                        >
                                          <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${
                                            editorSettings[key] ? 'translate-x-[16px]' : 'translate-x-[2px]'
                                          }`} />
                                        </button>
                                      </label>
                                    ))}
                                  </div>

                                  {/* Reset */}
                                  <button
                                    onClick={() => setEditorSettings(defaultEditorSettings)}
                                    className="w-full mt-2 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-gray-700/60 rounded-lg transition-colors"
                                  >
                                    Reset to Defaults
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Editor Area - fills remaining space */}
                        <div className="flex-1 min-w-0 flex flex-col">
                          <CodeEditor
                            file={selectedFile}
                            projectFiles={projectFiles}
                            openFiles={openFiles}
                            onCloseFile={handleCloseFile}
                            onSelectFile={handleSelectOpenFile}
                            editorSettings={editorSettings}
                            onSave={(file, content) => {
                              if (selectedProject) {
                                storageManager.getFiles(selectedProject.id).then(files => {
                                  setProjectFiles(files || [])
                                }).catch(() => {})
                              }
                              triggerInstantBackup(`Saved file: ${file.name}`)
                              setFileExplorerKey(prev => prev + 1)
                            }}
                          />
                        </div>
                      </div>
                    ) : activeTab === "preview" ? (
                      /* Preview Tab: Full-width Preview */
                      <CodePreviewPanel
                        ref={codePreviewRef}
                        project={selectedProject}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        previewViewMode={previewViewMode}
                        syncedUrl={syncedPreview.url || customUrl}
                        onUrlChange={setCustomUrl}
                        onVisualEditorSave={handleVisualEditorSave}
                        onApplyTheme={handleVisualEditorThemeSave}
                        onTagToChat={(component) => {
                          setTaggedComponent(component)
                          toast({
                            title: 'Component Tagged',
                            description: `<${component.tagName}> added as context for your next message`,
                          })
                        }}
                        onPublish={() => {
                          // Trigger preview creation
                          codePreviewRef.current?.createPreview()
                        }}
                        isAIStreaming={isAIStreaming}
                        projectFiles={projectFiles}
                        selectedModel={selectedModel}
                        onModelChange={setSelectedModel}
                        userPlan={userPlan}
                        subscriptionStatus={subscriptionStatus}
                        userId={user.id}
                        currentSessionId={currentChatSessionId}
                        onSessionChange={(sessionId) => {
                          setCurrentChatSessionId(sessionId)
                          setChatSessionKey(prev => prev + 1)
                        }}
                        onNewSession={() => {
                          setChatSessionKey(prev => prev + 1)
                        }}
                      />
                    ) : activeTab === "cloud" ? (
                      /* Cloud Tab */
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/60 bg-gray-950 flex-shrink-0">
                          <button
                            onClick={() => setActiveTab("code")}
                            className="h-7 px-2 flex items-center gap-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                          >
                            <Code className="size-3.5" />
                            <span>Back to Code</span>
                          </button>
                        </div>
                        <div className="flex-1 min-h-0">
                          <CloudTab user={user} selectedProject={selectedProject} />
                        </div>
                      </div>
                    ) : activeTab === "audit" ? (
                      /* Audit Tab */
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/60 bg-gray-950 flex-shrink-0">
                          <button
                            onClick={() => setActiveTab("code")}
                            className="h-7 px-2 flex items-center gap-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                          >
                            <Code className="size-3.5" />
                            <span>Back to Code</span>
                          </button>
                        </div>
                        <div className="flex-1 min-h-0">
                          <AuditTab user={user} selectedProject={selectedProject} />
                        </div>
                      </div>
                    ) : (
                      /* Database Tab - fallback */
                      <DatabaseTab workspaceId={selectedProject?.id || ""} />
                    )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}

            {/* Empty State - No Projects OR No Project Selected */}
            {!isLoadingProjects && (clientProjects.length === 0 || !selectedProject) && (
              searchParams.get('view') === 'templates' ? (
                <TemplatesView userId={user.id} />
              ) : searchParams.get('view') === 'template-earnings' ? (
                <TemplateEarningsView userId={user.id} />
              ) : searchParams.get('view') === 'repo-agent' ? (
                <RepoAgentView userId={user.id} />
              ) : (
                <EmptyWorkspaceView
                  onAuthRequired={() => router.push('/auth/login')}
                  onProjectCreated={async (newProject) => {
                  // Refresh projects when a new one is created
                  try {
                    await storageManager.init()
                    const workspaces = await storageManager.getWorkspaces(user.id)
                    setClientProjects(workspaces || [])
                                        
                    // Automatically select the newly created project
                    if (newProject) {
                      setSelectedProject(newProject)
                      setSelectedFile(null)
                      
                      // Update URL to reflect the new project with BOTH projectId AND newProject params
                      const params = new URLSearchParams(searchParams.toString())
                      params.set('projectId', newProject.id)
                      params.set('newProject', newProject.id)
                      router.push(`/workspace?${params.toString()}`)
                      
                      // Prevent auto-restore for newly created project
                      setJustCreatedProject(true)
                      
                      // Trigger backup after project creation
                      if (triggerInstantBackup) {
                        await triggerInstantBackup('Project created')
                      }
                      
                      setTimeout(() => setJustCreatedProject(false), 2000)
                    }
                  } catch (error) {
                    // Error refreshing projects - silently fail
                  }
                }}
                  recentProjects={[]}
                />
              )
            )}

            {/* Status Bar */}
            {selectedProject && (
              <div className="h-8 flex-shrink-0 border-t border-gray-800/60 bg-gray-900/60 flex items-center justify-between px-4 text-xs text-gray-400">
                <div className="flex items-center space-x-4">
                  {/* GitHub Status */}
                  <div className="flex items-center space-x-1">
                    <Github className="h-3 w-3" />
                    <span>
                      GitHub: {(() => {
                        if (selectedProject?.githubRepoUrl && gitHubConnected) {
                          return <span className="text-green-600 dark:text-green-400">Connected</span>
                        }
                        if (gitHubConnected) {
                          return <span className="text-orange-400">Account Connected</span>
                        }
                        return <span className="text-gray-500">Not Connected</span>
                      })()}
                    </span>
                  </div>

                  {/* Deployment Status */}
                  <div className="flex items-center space-x-1">
                    <Globe className="h-3 w-3" />
                    <span>
                      Deployment: {(() => {
                        switch (selectedProject?.deploymentStatus) {
                          case 'deployed':
                            return <span className="text-green-400">Live</span>
                          case 'in_progress':
                            return <span className="text-yellow-400">In Progress</span>
                          case 'failed':
                            return <span className="text-red-400">Failed</span>
                          default:
                            return <span className="text-gray-500">Not Deployed</span>
                        }
                      })()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {selectedProject?.vercelDeploymentUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => window.open(selectedProject.vercelDeploymentUrl, '_blank')}
                    >
                      View Live
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => window.open('/workspace/management', '_blank')}
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Manage
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => router.push(`/workspace/deployment?project=${selectedProject?.id}`)}
                    disabled={!selectedProject}
                  >
                    <Rocket className="h-3 w-3 mr-1" />
                    Deploy
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Mobile Layout */}
      {isMobile && (
        <div className="h-full w-full flex flex-col">
          {/* Always use ModernSidebar for mobile */}
          <ModernSidebar
            user={user}
            projects={clientProjects}
            selectedProject={selectedProject}
            isMobileOpen={isMobileSidebarOpen}
            onMobileClose={() => setIsMobileSidebarOpen(false)}
            isMobile={true}
          />

          {/* Fixed Mobile Header */}
          <div className="fixed top-0 left-0 right-0 h-14 border-b border-gray-800/60 bg-gray-900/95 backdrop-blur-sm flex items-center justify-between px-4 z-40">
            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setIsMobileSidebarOpen(true)}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              {false && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} modal={true}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-80">
                    <Sidebar
                      user={user}
                      projects={clientProjects}
                      selectedProject={selectedProject}
                    onSelectProject={(project) => {
                      setSelectedProject(project)
                      setSelectedFile(null)
                      setSidebarOpen(false) // Close sidebar after selection
                      
                      // Update URL to reflect selected project
                      const params = new URLSearchParams(searchParams.toString())
                      params.set('projectId', project.id)
                      router.push(`/workspace?${params.toString()}`)
                    }}
                    onProjectCreated={async (newProject) => {
                      try {
                        await storageManager.init()
                        const workspaces = await storageManager.getWorkspaces(user.id)
                        setClientProjects(workspaces || [])
                        
                        if (newProject) {
                          setSelectedProject(newProject)
                          setSelectedFile(null)
                          setSidebarOpen(false)
                          
                          // Update URL with BOTH projectId AND newProject params
                          // The newProject param signals to skip auto-restore (prevents file contamination)
                          const params = new URLSearchParams(searchParams.toString())
                          params.set('projectId', newProject.id)
                          params.set('newProject', newProject.id) // ✅ CRITICAL: This prevents auto-restore from running
                          router.push(`/workspace?${params.toString()}`)
                          
                                                    
                          // Prevent auto-restore for newly created project
                          setJustCreatedProject(true)
                          
                          // Trigger backup after project creation
                          if (triggerInstantBackup) {
                            await triggerInstantBackup('Project created')
                          }
                          
                          // Reset the flag after a short delay
                          setTimeout(() => setJustCreatedProject(false), 2000)
                        }
                      } catch (error) {
                        // Error refreshing projects - silently fail
                      }
                    }}
                    onProjectDeleted={async (deletedProjectId) => {
                      // Refresh projects when one is deleted
                      try {
                        await storageManager.init()
                        const workspaces = await storageManager.getWorkspaces(user.id)
                        setClientProjects(workspaces || [])
                                                
                        // If the deleted project was selected, navigate away from it
                        if (selectedProject?.id === deletedProjectId) {
                          const params = new URLSearchParams(searchParams.toString())
                          params.delete('projectId')
                          router.push(`/workspace?${params.toString()}`)
                          setSelectedProject(null)
                          setSelectedFile(null)
                          setSidebarOpen(false)
                        }
                      } catch (error) {
                        // Error refreshing projects - silently fail
                      }
                    }}
                    onProjectUpdated={async () => {
                      // Refresh projects when one is updated (renamed, pinned, etc.)
                      try {
                        await storageManager.init()
                        const workspaces = await storageManager.getWorkspaces(user.id)
                        setClientProjects(workspaces || [])
                                              } catch (error) {
                        // Error refreshing projects - silently fail
                      }
                    }}
                    collapsed={false}
                    onToggleCollapse={() => {}}
                    isMobile={true}
                    onTriggerBackup={triggerInstantBackup}
                  />
                </SheetContent>
              </Sheet>
              )}
              
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm font-semibold truncate">
                  {selectedProject?.name ? (selectedProject.name.length > 7 ? `${selectedProject.name.substring(0, 7)}...` : selectedProject.name) : 'New Space'}
                </h1>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedFile.name.length > 12 ? `${selectedFile.name.substring(0, 12)}...` : selectedFile.name}
                  </p>
                )}
              </div>
            </div>
            
            {/* Chat Session Selector for mobile */}
            {selectedProject && (
              <div className="flex-1 max-w-56 mx-2 flex items-center gap-1">
                <ChatSessionSelector
                  workspaceId={selectedProject.id}
                  userId={user.id}
                  currentSessionId={currentChatSessionId}
                  onSessionChange={(sessionId) => {
                    setCurrentChatSessionId(sessionId)
                    setChatSessionKey(prev => prev + 1)
                  }}
                  onNewSession={() => {
                    setChatSessionKey(prev => prev + 1)
                  }}
                  compact={true}
                />
              </div>
            )}
            
            <div className="flex items-center space-x-1">
              {selectedProject ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleBackupToCloud}
                    disabled={!selectedProject || isBackingUp}
                    title={isBackingUp ? "Backing up..." : "Backup to Cloud"}
                  >
                    <DatabaseBackup className={`h-4 w-4 ${isBackingUp ? 'animate-pulse' : ''}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setMobileTab("cloud")}
                    title="Cloud Services"
                  >
                    <Cloud className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => router.push(`/workspace/deployment?project=${selectedProject?.id}`)}
                    disabled={!selectedProject}
                    title="Deploy"
                  >
                    <Rocket className="h-4 w-4" />
                  </Button>
                  {/* GitHub Push Button - only show when connected */}
                  {gitHubConnected && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={handlePushToGitHub}
                      disabled={!selectedProject || isPushing}
                      title={isPushing ? "Pushing to GitHub..." : "Push to GitHub"}
                    >
                      <Github className={`h-4 w-4 ${isPushing ? 'animate-pulse' : ''}`} />
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Mobile Content with top padding for fixed header and bottom padding for fixed tabs */}
          <div className="flex-1 min-h-0 pt-14 pb-14">
            {clientProjects.length === 0 || !selectedProject ? (
              searchParams.get('view') === 'templates' ? (
                <TemplatesView userId={user.id} />
              ) : searchParams.get('view') === 'template-earnings' ? (
                <TemplateEarningsView userId={user.id} />
              ) : searchParams.get('view') === 'repo-agent' ? (
                <RepoAgentView userId={user.id} />
              ) : (
                <EmptyWorkspaceView
                  onAuthRequired={() => router.push('/auth/login')}
                  onProjectCreated={async (newProject) => {
                  // Refresh projects when a new one is created
                  try {
                    await storageManager.init()
                    const workspaces = await storageManager.getWorkspaces(user.id)
                    setClientProjects(workspaces || [])
                    // Automatically select the newly created project
                    if (newProject) {
                      setSelectedProject(newProject)
                      setSelectedFile(null)
                      // Update URL to reflect the new project with BOTH projectId AND newProject params
                      const params = new URLSearchParams(searchParams.toString())
                      params.set('projectId', newProject.id)
                      params.set('newProject', newProject.id)
                      router.push(`/workspace?${params.toString()}`)
                      // Prevent auto-restore for newly created project
                      setJustCreatedProject(true)
                      // Trigger backup after project creation
                      if (triggerInstantBackup) {
                        await triggerInstantBackup('Project created')
                      }
                      setTimeout(() => setJustCreatedProject(false), 2000)
                    }
                  } catch (error) {
                    // Error refreshing projects - silently fail
                  }
                }}
                recentProjects={clientProjects.map(p => ({
                  id: p.id,
                  name: p.name,
                  description: p.description,
                  lastActivity: p.lastActivity
                }))}
              />
              )
            ) : (
              <Tabs value={mobileTab} onValueChange={(value) => setMobileTab(value as any)} className="h-full flex flex-col">
                <TabsContent value="chat" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <ChatPanelV2
                      key={`chat-mobile-${selectedProject.id}-${chatSessionKey}`}
                      project={selectedProject}
                      isMobile={true}
                      selectedModel={selectedModel}
                      onModelChange={setSelectedModel}
                      userPlan={userPlan}
                      subscriptionStatus={subscriptionStatus}
                      onClearChat={handleClearChat}
                      aiMode={aiMode}
                      initialPrompt={initialChatPrompt}
                      initialChatMode={initialChatMode}
                      taggedComponent={taggedComponent}
                      onClearTaggedComponent={() => setTaggedComponent(null)}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="files" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <FileExplorer
                      key={fileExplorerKey}
                      project={selectedProject}
                      onFileSelect={(file) => {
                        setSelectedFile(file)
                        // Auto-switch to editor tab when file is selected
                        setMobileTab("editor")
                      }}
                      selectedFile={selectedFile}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="editor" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <CodeEditor
                      file={selectedFile}
                      onSave={(file, content) => {
                                                
                        // Trigger instant cloud backup after file save
                        triggerInstantBackup(`Saved file: ${file.name}`)
                        
                        setFileExplorerKey(prev => prev + 1)
                      }}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="preview" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <CodePreviewPanel
                      ref={codePreviewRef}
                      project={selectedProject}
                      activeTab="preview"
                      onTabChange={() => {}}
                      previewViewMode={previewViewMode}
                      syncedUrl={syncedPreview.url || customUrl}
                      onUrlChange={setCustomUrl}
                      onVisualEditorSave={handleVisualEditorSave}
                      onApplyTheme={handleVisualEditorThemeSave}
                      isAIStreaming={isAIStreaming}
                      projectFiles={projectFiles}
                      selectedModel={selectedModel}
                      onModelChange={setSelectedModel}
                      userPlan={userPlan}
                      subscriptionStatus={subscriptionStatus}
                      userId={user.id}
                      currentSessionId={currentChatSessionId}
                      onSessionChange={(sessionId) => {
                        setCurrentChatSessionId(sessionId)
                        setChatSessionKey(prev => prev + 1)
                      }}
                      onNewSession={() => {
                        setChatSessionKey(prev => prev + 1)
                      }}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="cloud" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <CloudTab user={user} selectedProject={selectedProject} />
                  </div>
                </TabsContent>

                <TabsContent value="audit" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <AuditTab user={user} selectedProject={selectedProject} />
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Fixed Mobile Bottom Tab Navigation - only show when project is selected */}
          {selectedProject && (
            <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800/60 z-50">
              <div className="flex items-center justify-around h-14 px-2">
                <button
                  onClick={() => setMobileTab("chat")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "chat" ? "text-orange-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <MessageSquare className={`h-5 w-5 ${mobileTab === "chat" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "chat" ? "text-orange-400" : ""}`}>Chat</span>
                </button>
                <button
                  onClick={() => setMobileTab("files")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "files" ? "text-orange-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <FileText className={`h-5 w-5 ${mobileTab === "files" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "files" ? "text-orange-400" : ""}`}>Files</span>
                </button>
                <button
                  onClick={() => setMobileTab("editor")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "editor" ? "text-orange-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Code className={`h-5 w-5 ${mobileTab === "editor" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "editor" ? "text-orange-400" : ""}`}>Editor</span>
                </button>
                <button
                  onClick={() => setMobileTab("preview")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "preview" ? "text-orange-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Eye className={`h-5 w-5 ${mobileTab === "preview" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "preview" ? "text-orange-400" : ""}`}>Preview</span>
                </button>
                <button
                  onClick={() => setMobileTab("audit")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "audit" ? "text-orange-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Shield className={`h-5 w-5 ${mobileTab === "audit" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "audit" ? "text-orange-400" : ""}`}>Audit</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Project Dialog - available for both desktop and mobile */}
      <Dialog open={isCreateDialogOpen} onOpenChange={handleModalClose}>
        <DialogContent className="z-[100] bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Project</DialogTitle>
            <DialogDescription className="text-gray-400">Start building your next app with AI assistance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="project-name" className="text-gray-300">Project Name</Label>
              <Input
                id="project-name"
                placeholder="My Awesome App"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div>
              <Label htmlFor="project-description" className="text-gray-300">Description (Optional)</Label>
              <Textarea
                id="project-description"
                placeholder="Describe what your app will do..."
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div>
              <Label htmlFor="template" className="text-gray-300">Template</Label>
              <Select value={selectedTemplate} onValueChange={(value: 'vite-react' | 'nextjs' | 'expo' | 'html') => setSelectedTemplate(value)}>
                <SelectTrigger id="template" className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent className="z-[110] bg-gray-800 border-gray-700">
                  <SelectItem value="vite-react" className="text-gray-200 hover:bg-gray-700">Vite</SelectItem>
                  <SelectItem value="nextjs" className="text-gray-200 hover:bg-gray-700">Next.js</SelectItem>
                  <SelectItem value="expo" className="text-gray-200 hover:bg-gray-700">Expo (Mobile)</SelectItem>
                  <SelectItem value="html" className="text-gray-200 hover:bg-gray-700">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim() || isCreating} className="bg-orange-600 hover:bg-orange-500 text-white">
              {isCreating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
