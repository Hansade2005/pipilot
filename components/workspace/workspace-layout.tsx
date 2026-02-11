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
import { CodeEditor } from "./code-editor"
import { DatabaseTab } from "./database-tab"
import { AIPplatformTab } from "./ai-platform-tab"
import { CloudTab } from "./cloud-tab"
import { AuditTab } from "./audit-tab"
import { Github, Globe, Rocket, Settings, PanelLeft, Code, FileText, Eye, Trash2, Copy, ArrowUp, ChevronDown, ChevronUp, Edit3, FolderOpen, X, Wrench, Check, AlertTriangle, Zap, Undo2, Redo2, MessageSquare, Plus, ExternalLink, RotateCcw, Play, DatabaseBackup, Square, Monitor, Smartphone, Database, Cloud, Shield } from "lucide-react"
import { storageManager } from "@/lib/storage-manager"
import { useToast } from '@/hooks/use-toast'
import { useIsMobile } from "@/hooks/use-mobile"
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useAutoCloudBackup } from '@/hooks/use-auto-cloud-backup'
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

  // GitHub push functionality
  const { pushToGitHub, checkGitHubConnection, isPushing } = useGitHubPush()

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

      if (shouldSwitchToPreview) {
        // Switch to preview tab
        setActiveTab('preview')
        // Also switch mobile tab to preview on mobile devices
        if (isMobile) {
          setMobileTab('preview')
        }
      }

      if (shouldCreatePreview) {
        // Trigger preview creation with a small delay to ensure tab switch is complete
        setTimeout(() => {
          if (codePreviewRef.current) {
            codePreviewRef.current.createPreview()
          }
        }, 100)
      }
    }

    // Auto-switch to preview tab when AI starts streaming so the user
    // sees the AI responding view (rocket + witty messages) immediately.
    // Skip if a live preview is already loaded to avoid hiding it.
    const handleAiStreamingState = (event: CustomEvent) => {
      const { isStreaming } = event.detail
      setIsAIStreaming(isStreaming)
      if (isStreaming && !codePreviewRef.current?.preview?.url) {
        setActiveTab('preview')
        if (isMobile) {
          setMobileTab('preview')
        }
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
  useEffect(() => {
    const loadClientProjects = async () => {
      try {
        setIsLoadingProjects(true)

        await storageManager.init()

        // Check if we're in a specific project workspace (has projectId in URL)
        const projectId = searchParams.get('projectId')
        const isDeletingProject = searchParams.get('deleting') === 'true'
        const isNewProject = searchParams.get('newProject') !== null

        // Only auto-restore when in a project workspace and not during deletion or creation
        if (projectId && !isDeletingProject && !justCreatedProject && !isNewProject) {
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
              // Clean up sessionStorage after retrieving
              sessionStorage.removeItem(`initial-prompt-${projectId}`)
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
              <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
                {/* Left Panel - Chat (Resizable) */}
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
                      taggedComponent={taggedComponent}
                      onClearTaggedComponent={() => setTaggedComponent(null)}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Panel - Code/Preview Area */}
                <ResizablePanel defaultSize={60} minSize={30}>
                  <div className="h-full flex flex-col overflow-hidden">
                    {/* Tab Switcher with Preview Controls - Hidden when in preview mode */}
                    {activeTab !== "preview" && (
                      <div className="border-b border-gray-800/60 bg-gray-900/80 p-2 flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex space-x-1">
                            <Button
                              variant={activeTab === "code" ? "secondary" : "ghost"}
                              size="sm"
                              onClick={() => setActiveTab("code")}
                              title="Code Editor"
                            >
                              <Code className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActiveTab("preview")}
                              title="Live Preview"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={activeTab === "cloud" ? "secondary" : "ghost"}
                              size="sm"
                              onClick={() => setActiveTab("cloud")}
                              title="Cloud Services"
                            >
                              <Cloud className="h-4 w-4" />
                            </Button>
                            <Button
                              variant={activeTab === "audit" ? "secondary" : "ghost"}
                              size="sm"
                              onClick={() => setActiveTab("audit")}
                              title="Code Audit & Quality"
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                          </div>


                        </div>
                      </div>
                    )}

                    {/* Content Area */}
                    {activeTab === "code" ? (
                      /* Code Tab: File Explorer + Code Editor */
                      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
                        {/* File Explorer Panel */}
                        <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
                          <div className="h-full flex flex-col border-r border-gray-800/60">
                            <FileExplorer
                              key={fileExplorerKey}
                              project={selectedProject}
                              onFileSelect={setSelectedFile}
                              selectedFile={selectedFile}
                            />
                          </div>
                        </ResizablePanel>

                        <ResizableHandle withHandle />

                        {/* Code Editor Panel */}
                        <ResizablePanel defaultSize={75} minSize={40}>
                          <div className="h-full flex flex-col">
                            <CodeEditor
                              file={selectedFile}
                              projectFiles={projectFiles}
                              onSave={(file, content) => {
                                // Update the file content in state if needed
                                
                                // Refresh project files to update Monaco's extra libraries
                                if (selectedProject) {
                                  storageManager.getFiles(selectedProject.id).then(files => {
                                    setProjectFiles(files || [])
                                                                      }).catch(error => {
                                    // Error refreshing project files - silently fail
                                  })
                                }

                                // Trigger instant cloud backup after file save
                                triggerInstantBackup(`Saved file: ${file.name}`)

                                // Force file explorer refresh to show updated content
                                setFileExplorerKey(prev => prev + 1)
                                                              }}
                            />
                          </div>
                        </ResizablePanel>
                      </ResizablePanelGroup>
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
                      <CloudTab user={user} selectedProject={selectedProject} />
                    ) : activeTab === "audit" ? (
                      /* Audit Tab */
                      <AuditTab user={user} selectedProject={selectedProject} />
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
                          return <span className="text-blue-600 dark:text-blue-400">Account Connected</span>
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
                    mobileTab === "chat" ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <MessageSquare className={`h-5 w-5 ${mobileTab === "chat" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "chat" ? "text-blue-400" : ""}`}>Chat</span>
                </button>
                <button
                  onClick={() => setMobileTab("files")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "files" ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <FileText className={`h-5 w-5 ${mobileTab === "files" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "files" ? "text-blue-400" : ""}`}>Files</span>
                </button>
                <button
                  onClick={() => setMobileTab("editor")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "editor" ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Code className={`h-5 w-5 ${mobileTab === "editor" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "editor" ? "text-blue-400" : ""}`}>Editor</span>
                </button>
                <button
                  onClick={() => setMobileTab("preview")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "preview" ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Eye className={`h-5 w-5 ${mobileTab === "preview" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "preview" ? "text-blue-400" : ""}`}>Preview</span>
                </button>
                <button
                  onClick={() => setMobileTab("audit")}
                  className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                    mobileTab === "audit" ? "text-blue-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Shield className={`h-5 w-5 ${mobileTab === "audit" ? "stroke-[2.5]" : ""}`} />
                  <span className={`text-[10px] font-medium ${mobileTab === "audit" ? "text-blue-400" : ""}`}>Audit</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Project Dialog - available for both desktop and mobile */}
      <Dialog open={isCreateDialogOpen} onOpenChange={handleModalClose}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>Start building your next app with AI assistance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="My Awesome App"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="project-description">Description (Optional)</Label>
              <Textarea
                id="project-description"
                placeholder="Describe what your app will do..."
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="template">Template</Label>
              <Select value={selectedTemplate} onValueChange={(value: 'vite-react' | 'nextjs' | 'expo' | 'html') => setSelectedTemplate(value)}>
                <SelectTrigger id="template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  <SelectItem value="vite-react">Vite</SelectItem>
                  <SelectItem value="nextjs">Next.js</SelectItem>
                  <SelectItem value="expo">Expo (Mobile)</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateProject} disabled={!newProjectName.trim() || isCreating}>
              {isCreating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
