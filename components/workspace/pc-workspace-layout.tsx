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
import { ChatPanel } from "./chat-panel"
import { ChatPanelV2 } from "./chat-panel-v2"
import { CodePreviewPanel } from "./code-preview-panel"
import { ProjectHeader } from "./project-header"
import { FileExplorer } from "./file-explorer"
import { CodeEditor } from "./code-editor"
import { DatabaseTab } from "./database-tab"
import { AIPplatformTab } from "./ai-platform-tab"
import { CloudTab } from "./cloud-tab"
import { Github, Globe, Rocket, Settings, PanelLeft, Code, FileText, Eye, Trash2, Copy, ArrowUp, ChevronDown, ChevronUp, Edit3, FolderOpen, X, Wrench, Check, AlertTriangle, Zap, Undo2, Redo2, MessageSquare, Plus, ExternalLink, RotateCcw, Play, Square, Monitor, Smartphone, Database, Cloud } from "lucide-react"
import { storageManager } from "@/lib/storage-manager"
import { useToast } from '@/hooks/use-toast'
import { useIsMobile } from "@/hooks/use-mobile"
import { useCloudSync } from '@/hooks/use-cloud-sync'
import { useAutoCloudBackup } from '@/hooks/use-auto-cloud-backup'
import { useSubscriptionCache } from '@/hooks/use-subscription-cache'
import { restoreBackupFromCloud, isCloudSyncEnabled } from '@/lib/cloud-sync'
import { generateFileUpdate, type StyleChange } from '@/lib/visual-editor'
import { ModelSelector } from "@/components/ui/model-selector"
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
  const [activeTab, setActiveTab] = useState<"code" | "preview" | "cloud">("code")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true) // Changed from false to true
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const { toast } = useToast()
  const [gitHubConnected, setGitHubConnected] = useState(false)
  const [clientProjects, setClientProjects] = useState<Workspace[]>(projects)
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [fileExplorerKey, setFileExplorerKey] = useState<number>(0) // Force file explorer refresh
  
  // Mobile-specific state
  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<"chat" | "files" | "editor" | "preview" | "cloud">("chat")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL)
  const [aiMode, setAiMode] = useState<AIMode>('agent')
  const [projectFiles, setProjectFiles] = useState<File[]>([])

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
        console.warn('[VisualEditor] Cannot save: no project or source file')
        return false
      }

      // Get the source file from storage
      const file = await storageManager.getFile(selectedProject.id, changes.sourceFile)
      if (!file) {
        console.warn('[VisualEditor] Source file not found:', changes.sourceFile)
        toast({
          title: 'File not found',
          description: `Could not find ${changes.sourceFile}`,
          variant: 'destructive',
        })
        return false
      }

      // Generate the updated code
      const result = generateFileUpdate(
        file.content,
        changes.elementId,
        changes.changes,
        changes.sourceFile,
        changes.sourceLine
      )

      if (!result.success) {
        console.error('[VisualEditor] Failed to update code:', result.error)
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

      console.log('[VisualEditor] Successfully saved changes to:', changes.sourceFile)
      return true
    } catch (error) {
      console.error('[VisualEditor] Error saving changes:', error)
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
        console.warn('[VisualEditor] Cannot save theme: no project selected')
        return false
      }

      // Determine the CSS file path based on project type
      // Next.js uses src/app/globals.css, Vite uses src/index.css
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
        console.warn('[VisualEditor] Could not find CSS file to update')
        toast({
          title: 'CSS file not found',
          description: 'Could not find globals.css or App.css in your project',
          variant: 'destructive',
        })
        return false
      }

      console.log('[VisualEditor] Saving theme to:', targetPath)

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

      console.log('[VisualEditor] Successfully saved theme to:', targetPath)
      return true
    } catch (error) {
      console.error('[VisualEditor] Error saving theme:', error)
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
  const [selectedTemplate, setSelectedTemplate] = useState<'vite-react' | 'nextjs'>('vite-react')
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
      console.log('[WorkspaceLayout] AI stream complete event received:', { shouldSwitchToPreview, shouldCreatePreview })

      if (shouldSwitchToPreview) {
        // Switch to preview tab
        setActiveTab('preview')
        // Also switch mobile tab to preview on mobile devices
        if (isMobile) {
          setMobileTab('preview')
        }
        console.log('[WorkspaceLayout] Switched to preview tab after AI streaming', { isMobile })
      }

      if (shouldCreatePreview) {
        // Trigger preview creation with a small delay to ensure tab switch is complete
        setTimeout(() => {
          console.log('[WorkspaceLayout] Auto-creating preview after AI streaming')
          if (codePreviewRef.current) {
            codePreviewRef.current.createPreview()
          }
        }, 100)
      }
    }
    
    window.addEventListener('preview-state-changed', handlePreviewStateChange as EventListener)
    window.addEventListener('preview-url-changed', handlePreviewUrlChange as EventListener)
    window.addEventListener('preview-ready', handlePreviewReady as EventListener)
    window.addEventListener('preview-starting', handlePreviewStarting as EventListener)
    window.addEventListener('preview-stopped', handlePreviewStopped as EventListener)
    window.addEventListener('ai-stream-complete', handleAiStreamComplete as EventListener)
    
    return () => {
      window.removeEventListener('preview-state-changed', handlePreviewStateChange as EventListener)
      window.removeEventListener('preview-url-changed', handlePreviewUrlChange as EventListener)
      window.removeEventListener('preview-ready', handlePreviewReady as EventListener)
      window.removeEventListener('preview-starting', handlePreviewStarting as EventListener)
      window.removeEventListener('preview-stopped', handlePreviewStopped as EventListener)
      window.removeEventListener('ai-stream-complete', handleAiStreamComplete as EventListener)
    }
  }, [])

  // Auto-restore from cloud and load projects from IndexedDB on client-side
  useEffect(() => {
    const loadClientProjects = async () => {
      try {
        setIsLoadingProjects(true)
        console.log('WorkspaceLayout: Starting to load projects from IndexedDB...')

        await storageManager.init()
        console.log('WorkspaceLayout: Storage manager initialized')

        // Check if we're in a specific project workspace (has projectId in URL)
        const projectId = searchParams.get('projectId')
        const isDeletingProject = searchParams.get('deleting') === 'true'
        const isNewProject = searchParams.get('newProject') !== null
        
        // ✅ CRITICAL FIX: Skip auto-restore for newly created projects from chat-input
        // Auto-restore clears ALL data and restores from backup, which would DELETE the new project's files!
        if (isNewProject) {
          console.log('🆕 WorkspaceLayout: NEW PROJECT detected from chat-input - SKIPPING auto-restore to preserve new project files')
        }
        
        // Only auto-restore when in a project workspace and not during deletion or creation
        if (projectId && !isDeletingProject && !justCreatedProject && !isNewProject) {
          console.log('WorkspaceLayout: In project workspace, checking cloud sync for user:', user.id)
          const cloudSyncEnabled = await isCloudSyncEnabled(user.id)
          console.log('WorkspaceLayout: Cloud sync enabled result:', cloudSyncEnabled)

          if (cloudSyncEnabled) {
            setIsAutoRestoring(true)
            console.log('WorkspaceLayout: Auto-restore enabled for project workspace, attempting to restore latest backup...')

            try {
              console.log('WorkspaceLayout: Calling restoreBackupFromCloud...')
              const restoreSuccess = await restoreBackupFromCloud(user.id)
              console.log('WorkspaceLayout: restoreBackupFromCloud returned:', restoreSuccess)

              if (restoreSuccess) {
                console.log('WorkspaceLayout: Successfully restored latest backup from cloud')
                toast({
                  title: "Auto-restore completed",
                  description: "Your latest project data has been restored from the cloud.",
                })
              } else {
                console.log('WorkspaceLayout: No backup found or restore failed, using local data')
              }
            } catch (restoreError) {
              console.error('WorkspaceLayout: Error during auto-restore:', restoreError)
              toast({
                title: "Auto-restore failed",
                description: "Could not restore from cloud. Using local data.",
                variant: "destructive"
              })
            } finally {
              setIsAutoRestoring(false)
            }
          } else {
            console.log('WorkspaceLayout: Cloud sync is disabled, skipping auto-restore')
          }
        } else {
          console.log('WorkspaceLayout: Not in project workspace or project is being deleted, skipping auto-restore')
        }

        const workspaces = await storageManager.getWorkspaces(user.id)
        console.log('WorkspaceLayout: Loaded workspaces from IndexedDB:', workspaces?.length || 0)
        console.log('WorkspaceLayout: Workspace details:', workspaces?.map(w => ({ id: w.id, name: w.name, slug: w.slug })))

        setClientProjects((prevProjects) => [...(prevProjects || []), ...(workspaces || [])])
      } catch (error) {
        console.error('Error loading client projects:', error)
        // Don't fall back to empty server-side projects
        console.log('WorkspaceLayout: Failed to load from IndexedDB, keeping empty array')
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
    console.log('WorkspaceLayout: Project selection effect - projectId:', projectId, 'clientProjects length:', clientProjects.length, 'isLoadingProjects:', isLoadingProjects)

    if (projectId && clientProjects.length > 0 && !isLoadingProjects) {
      const project = clientProjects.find(p => p.id === projectId)
      if (project) {
        console.log('WorkspaceLayout: Setting project from URL params:', project.name, 'Project ID:', project.id)
        
        // CRITICAL FIX: Verify this is a new project from chat-input and load its files explicitly
        const isNewProjectFromChatInput = searchParams.get('newProject') === projectId
        if (isNewProjectFromChatInput) {
          console.log('🆕 New project from chat-input detected, loading files explicitly for:', projectId)
          
          // ✅ Set justCreatedProject flag to prevent auto-restore from deleting new files
          setJustCreatedProject(true)
          
          // Clear the flag after 5 seconds (enough time for initial load)
          setTimeout(() => {
            setJustCreatedProject(false)
            console.log('✅ Cleared justCreatedProject flag - auto-restore can now run on next visit')
          }, 5000)
          
          // Load files explicitly for this new project to prevent contamination
          import('@/lib/storage-manager').then(({ storageManager }) => {
            storageManager.init().then(() => {
              storageManager.getFiles(projectId).then(files => {
                console.log(`✅ Loaded ${files.length} files for new project ${projectId}:`, files.map(f => f.path))
                
                // Verify files belong to correct workspace
                const incorrectFiles = files.filter(f => f.workspaceId !== projectId)
                if (incorrectFiles.length > 0) {
                  console.error(`🚨 CONTAMINATION DETECTED: ${incorrectFiles.length} files belong to wrong workspace!`, incorrectFiles)
                }
              })
            })
          })
        }
        
        setSelectedProject(project)

        // Force file explorer refresh when selecting any project
        console.log('WorkspaceLayout: Forcing file explorer refresh for selected project')
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
        console.log('WorkspaceLayout: Project not found in current projects, might be newly created')
      }
    } else if (clientProjects.length > 0 && !selectedProject && !isLoadingProjects) {
      // If no project is selected but we have projects, select the first one
      console.log('WorkspaceLayout: No project selected, selecting first project:', clientProjects[0].name)
      setSelectedProject(clientProjects[0])

      // Update URL to reflect the first project
      const params = new URLSearchParams(searchParams.toString())
      params.set('projectId', clientProjects[0].id)
      router.push(`/workspace?${params.toString()}`)
    }
  }, [searchParams, clientProjects, selectedProject, router, isLoadingProjects])

  // Also reload when newProjectId changes (in case project was just created)
  useEffect(() => {
    if (newProjectId && typeof window !== 'undefined') {
      console.log('WorkspaceLayout: newProjectId changed, reloading projects...')
      const reloadProjects = async () => {
        try {
          await storageManager.init()
          const workspaces = await storageManager.getWorkspaces(user.id)
          console.log('WorkspaceLayout: Reloaded workspaces after newProjectId change:', workspaces?.length || 0)

          // Update client projects
          setClientProjects(workspaces || [])

          // Find and auto-select the new project if it exists
          const newProject = workspaces?.find(w => w.id === newProjectId)
          if (newProject) {
            console.log('WorkspaceLayout: Auto-selecting newly created project:', newProject.name)
            setSelectedProject(newProject)

        // Force file explorer refresh for newly created projects
        console.log('WorkspaceLayout: Forcing file explorer refresh for new project')
        setTimeout(() => {
          setFileExplorerKey(prev => prev + 1)
        }, 100)

            // ✅ CRITICAL FIX: DO NOT change URL parameters for new projects!
            // Changing from newProject to projectId triggers a page reload which runs auto-restore
            // Keep BOTH parameters to prevent contamination
            const params = new URLSearchParams(searchParams.toString())
            // DO NOT DELETE: params.delete('newProject') - THIS CAUSES CONTAMINATION!
            // Only add projectId if not already present
            if (!params.get('projectId')) {
              params.set('projectId', newProjectId)
              console.log('✅ Added projectId to URL while keeping newProject parameter')
              router.replace(`/workspace?${params.toString()}`)
            } else {
              console.log('✅ URL already has projectId, not changing URL to prevent reload')
            }
          }
        } catch (error) {
          console.error('Error reloading projects:', error)
        }
      }
      reloadProjects()
    }
  }, [newProjectId, user.id, searchParams, router])

  useEffect(() => {
    const loadProjectFiles = async () => {
      if (selectedProject && typeof window !== 'undefined') {
        try {
          console.log('WorkspaceLayout: Loading files for project:', selectedProject.name, 'ID:', selectedProject.id)
          await storageManager.init()
          const files = await storageManager.getFiles(selectedProject.id)
          console.log('WorkspaceLayout: Loaded', files?.length || 0, 'files for project', selectedProject.id)
          
          // CRITICAL FIX: Verify all files belong to the correct workspace
          const incorrectFiles = files.filter(f => f.workspaceId !== selectedProject.id)
          if (incorrectFiles.length > 0) {
            console.error(`🚨 FILE CONTAMINATION DETECTED: ${incorrectFiles.length} files belong to different workspaces!`)
            console.error('Contaminated files:', incorrectFiles.map(f => ({ 
              path: f.path, 
              belongsTo: f.workspaceId, 
              shouldBe: selectedProject.id 
            })))
            
            // Filter out contaminated files
            const cleanFiles = files.filter(f => f.workspaceId === selectedProject.id)
            console.log(`✅ Filtered to ${cleanFiles.length} correct files`)
            setProjectFiles(cleanFiles)
          } else {
            console.log(`✅ All ${files.length} files verified to belong to workspace ${selectedProject.id}`)
            setProjectFiles(files || [])
          }
        } catch (error) {
          console.error('WorkspaceLayout: Error loading project files:', error)
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
      console.log('Creating new project:', newProjectName)
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()
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
        console.log('WorkspaceLayout: Refreshed projects after creation:', workspaces?.length || 0)
      } catch (error) {
        console.error('Error refreshing projects after creation:', error)
      }
    } catch (error) {
      console.error("Error creating project:", error)
    } finally {
      setIsCreating(false)
    }
  }

  // Sync data from server if client has no projects
  useEffect(() => {
    if (clientProjects.length === 0 && newProjectId && typeof window !== 'undefined') {
      console.log('WorkspaceLayout: No projects found, attempting to sync from server...')
      const syncFromServer = async () => {
        try {
          // Try to fetch from server API
          const response = await fetch('/api/workspaces')
          if (response.ok) {
            const data = await response.json()
            if (data.workspaces && data.workspaces.length > 0) {
              console.log('WorkspaceLayout: Synced workspaces from server:', data.workspaces.length)
              setClientProjects(data.workspaces)
            }
          }
        } catch (error) {
          console.error('Error syncing from server:', error)
        }
      }
      syncFromServer()
    }
  }, [clientProjects.length, newProjectId])

  // Handle new project selection and initial prompt
  React.useEffect(() => {
    console.log('WorkspaceLayout useEffect - newProjectId:', newProjectId, 'clientProjects:', clientProjects.map(p => ({ id: p.id, name: p.name })))
    
    if (newProjectId && clientProjects.length > 0) {
      const newProject = clientProjects.find(p => p.id === newProjectId)
      console.log('Found new project:', newProject)
      if (newProject) {
        setSelectedProject(newProject)
      }
    } else if (clientProjects.length > 0) {
      console.log('Setting first project as selected:', clientProjects[0])
      setSelectedProject(clientProjects[0])
    }
  }, [newProjectId, clientProjects])

  // Debug selected project changes
  React.useEffect(() => {
    console.log('Selected project changed:', selectedProject)
  }, [selectedProject])

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
      const customEvent = event as CustomEvent
      console.log('[WorkspaceLayout] AI stream completed, triggering automatic backup')
      
      // Only backup if we have a selected project and user
      if (selectedProject && user?.id) {
        try {
          // Trigger the backup function
          await handleBackupToCloud()
          console.log('[WorkspaceLayout] Automatic backup completed after AI stream')
        } catch (error) {
          console.error('[WorkspaceLayout] Automatic backup failed:', error)
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
      console.log(`[WorkspaceLayout] Clearing chat for project ${selectedProject.id}`)
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
        console.log(`[WorkspaceLayout] Deactivated session ${activeSession.id} for project ${selectedProject.id}`)
      }
      
      toast({
        title: "Chat Cleared",
        description: `Chat history cleared for ${selectedProject.name}. Start a new conversation!`,
      })
      
      // Force chat panel refresh by triggering a re-render
      window.dispatchEvent(new CustomEvent('chat-cleared', { detail: { projectId: selectedProject.id } }))
    } catch (error) {
      console.error(`[WorkspaceLayout] Error clearing chat for project ${selectedProject?.id}:`, error)
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
      console.error('Error pushing to GitHub:', error)
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
      console.error("Error creating backup:", error)
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
    <div className="h-screen flex bg-background relative">
      {/* Desktop Layout */}
      {!isMobile && (
        <>
          {/* Sidebar */}
          <Sidebar
            user={user}
            projects={clientProjects}
            selectedProject={selectedProject}
            onSelectProject={(project) => {
              setSelectedProject(project)
              setSelectedFile(null) // Clear selected file when switching projects
              
              // Update URL to reflect selected project
              const params = new URLSearchParams(searchParams.toString())
              params.set('projectId', project.id)
              router.push(`/workspace?${params.toString()}`)
              
              console.log('WorkspaceLayout: Project selected, URL updated:', project.name, project.id)
            }}
            onProjectCreated={async (newProject) => {
              // Refresh projects when a new one is created
              try {
                await storageManager.init()
                const workspaces = await storageManager.getWorkspaces(user.id)
                setClientProjects(workspaces || [])
                console.log('WorkspaceLayout: Refreshed projects after creation:', workspaces?.length || 0)
                
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
                  
                  console.log('✅ WorkspaceLayout: Navigating to NEW project with newProject flag:', newProject.id)
                  
                  // Prevent auto-restore for newly created project
                  setJustCreatedProject(true)
                  
                  // Trigger backup after project creation
                  if (triggerInstantBackup) {
                    await triggerInstantBackup('Project created')
                  }
                  
                  // Reset the flag after a short delay
                  setTimeout(() => setJustCreatedProject(false), 2000)
                  
                  console.log('WorkspaceLayout: Auto-selected new project:', newProject.name)
                }
              } catch (error) {
                console.error('Error refreshing projects after creation:', error)
              }
            }}
            onProjectDeleted={async (deletedProjectId) => {
              // Refresh projects when one is deleted
              try {
                await storageManager.init()
                const workspaces = await storageManager.getWorkspaces(user.id)
                setClientProjects(workspaces || [])
                console.log('WorkspaceLayout: Refreshed projects after deletion:', workspaces?.length || 0)
                
                // If the deleted project was selected, navigate away from it
                if (selectedProject?.id === deletedProjectId) {
                  const params = new URLSearchParams(searchParams.toString())
                  params.delete('projectId')
                  router.push(`/workspace?${params.toString()}`)
                  setSelectedProject(null)
                  setSelectedFile(null)
                }
              } catch (error) {
                console.error('Error refreshing projects after deletion:', error)
              }
            }}
            onProjectUpdated={async () => {
              // Refresh projects when one is updated (renamed, pinned, etc.)
              try {
                await storageManager.init()
                const workspaces = await storageManager.getWorkspaces(user.id)
                setClientProjects(workspaces || [])
                console.log('WorkspaceLayout: Refreshed projects after update:', workspaces?.length || 0)
              } catch (error) {
                console.error('Error refreshing projects after update:', error)
              }
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onTriggerBackup={triggerBackup}
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
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
              onProjectCreated={async (newProject) => {
                // Refresh projects when a new one is created
                try {
                  await storageManager.init()
                  const workspaces = await storageManager.getWorkspaces(user.id)
                  setClientProjects(workspaces || [])
                  console.log('WorkspaceLayout: Refreshed projects after creation:', workspaces?.length || 0)
                  
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
                    
                    console.log('✅ WorkspaceLayout: Navigating to NEW project with newProject flag:', newProject.id)
                    
                    // Prevent auto-restore for newly created project
                    setJustCreatedProject(true)
                    
                    // Trigger backup after project creation
                    if (triggerInstantBackup) {
                      await triggerInstantBackup('Project created')
                    }
                    
                    // Reset the flag after a short delay
                    setTimeout(() => setJustCreatedProject(false), 2000)
                    
                    console.log('WorkspaceLayout: Auto-selected new project:', newProject.name)
                  }
                } catch (error) {
                  console.error('Error refreshing projects after creation:', error)
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
            {!isLoadingProjects && clientProjects.length > 0 && (
              <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
                {/* Left Panel - Chat (Resizable) */}
                <ResizablePanel defaultSize={40} minSize={20} maxSize={40}>
                  <div className="h-full flex flex-col border-r border-border">
                    <ChatPanelV2
                      project={selectedProject}
                      selectedModel={selectedModel}
                      aiMode={aiMode}

                      initialPrompt={initialChatPrompt}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Panel - Code/Preview Area */}
                <ResizablePanel defaultSize={60} minSize={30}>
                  <div className="h-full flex flex-col">
                    {/* Tab Switcher with Preview Controls - Hidden when in preview mode */}
                    {activeTab !== "preview" && (
                      <div className="border-b border-border bg-card p-2 flex-shrink-0">
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
                          <div className="h-full flex flex-col border-r border-border">
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
                                console.log("File saved:", file.name, content.length, "characters")

                                // Refresh project files to update Monaco's extra libraries
                                if (selectedProject) {
                                  storageManager.getFiles(selectedProject.id).then(files => {
                                    setProjectFiles(files || [])
                                    console.log("Refreshed project files after save:", files?.length || 0, "files")
                                  }).catch(error => {
                                    console.error("Error refreshing project files:", error)
                                  })
                                }

                                // Trigger instant cloud backup after file save
                                triggerInstantBackup(`Saved file: ${file.name}`)

                                // Force file explorer refresh to show updated content
                                setFileExplorerKey(prev => prev + 1)
                                console.log("File saved successfully, triggering file explorer refresh")
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
                      />
                    ) : activeTab === "cloud" ? (
                      /* Cloud Tab */
                      <CloudTab user={user} selectedProject={selectedProject} /> 
                    ) : (
                      /* Database Tab - fallback */
                      <DatabaseTab workspaceId={selectedProject?.id || ""} />
                    )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}

            {/* Empty State - No Projects */}
            {!isLoadingProjects && clientProjects.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto p-8">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                    <Plus className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-2xl font-semibold text-foreground mb-2">No projects yet</h2>
                  <p className="text-muted-foreground mb-6">
                    Create your first project to start building amazing web applications with AI.
                  </p>
                  <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    size="lg"
                    className="px-8"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Project
                  </Button>
                </div>
              </div>
            )}

            {/* Status Bar */}
            <div className="h-8 border-t border-border bg-muted/50 flex items-center justify-between px-4 text-xs">
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
                      return <span className="text-muted-foreground">Not Connected</span>
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
                          return <span className="text-green-600 dark:text-green-400">Live</span>
                        case 'in_progress':
                          return <span className="text-yellow-600 dark:text-yellow-400">In Progress</span>
                        case 'failed':
                          return <span className="text-red-600 dark:text-red-400">Failed</span>
                        default:
                          return <span className="text-muted-foreground">Not Deployed</span>
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
          </div>
        </>
      )}

      {/* Mobile Layout */}
      {isMobile && (
        <div className="h-full w-full flex flex-col">
          {/* Fixed Mobile Header */}
          <div className="fixed top-0 left-0 right-0 h-14 border-b border-border bg-card flex items-center justify-between px-4 z-40">
            <div className="flex items-center space-x-3">
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
                          
                          console.log('✅ WorkspaceLayout: Navigating to NEW project with newProject flag:', newProject.id)
                          
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
                        console.error('Error refreshing projects after creation:', error)
                      }
                    }}
                    onProjectDeleted={async (deletedProjectId) => {
                      // Refresh projects when one is deleted
                      try {
                        await storageManager.init()
                        const workspaces = await storageManager.getWorkspaces(user.id)
                        setClientProjects(workspaces || [])
                        console.log('WorkspaceLayout: Refreshed projects after deletion:', workspaces?.length || 0)
                        
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
                        console.error('Error refreshing projects after deletion:', error)
                      }
                    }}
                    onProjectUpdated={async () => {
                      // Refresh projects when one is updated (renamed, pinned, etc.)
                      try {
                        await storageManager.init()
                        const workspaces = await storageManager.getWorkspaces(user.id)
                        setClientProjects(workspaces || [])
                        console.log('WorkspaceLayout: Refreshed projects after update:', workspaces?.length || 0)
                      } catch (error) {
                        console.error('Error refreshing projects after update:', error)
                      }
                    }}
                    collapsed={false}
                    onToggleCollapse={() => {}}
                    isMobile={true}
                    onTriggerBackup={triggerInstantBackup}
                  />
                </SheetContent>
              </Sheet>
              
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm font-semibold truncate">
                  {selectedProject?.name ? (selectedProject.name.length > 12 ? `${selectedProject.name.substring(0, 12)}...` : selectedProject.name) : 'No Project'}
                </h1>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedFile.name}
                  </p>
                )}
              </div>
            </div>
            
            {/* Model Selector without label for mobile space optimization */}
            <div className="flex-1 max-w-48 mx-2 flex items-center">
              <ModelSelector
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                userPlan={userPlan}
                subscriptionStatus={subscriptionStatus}
                compact={true}
                className="flex-1"
              />
            </div>
            
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleBackupToCloud}
                disabled={!selectedProject || isBackingUp}
                title={isBackingUp ? "Backing up..." : "Backup to Cloud"}
              >
                <Cloud className={`h-4 w-4 ${isBackingUp ? 'animate-pulse' : ''}`} />
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
            </div>
          </div>

          {/* Mobile Content with top padding for fixed header and bottom padding for fixed tabs */}
          <div className="flex-1 min-h-0 pt-14 pb-12">
            {clientProjects.length === 0 ? (
              /* Empty State - No Projects */
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-muted flex items-center justify-center">
                    <Plus className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-2xl font-semibold text-foreground mb-2">No projects yet</h2>
                  <p className="text-muted-foreground mb-6">
                    Create your first project to start building amazing web applications with AI.
                  </p>
                  <Button
                    onClick={() => setIsCreateDialogOpen(true)}
                    size="lg"
                    className="px-8"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Project
                  </Button>
                </div>
              </div>
            ) : (
              <Tabs value={mobileTab} onValueChange={(value) => setMobileTab(value as any)} className="h-full flex flex-col">
                <TabsContent value="chat" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <ChatPanelV2 
                      project={selectedProject} 
                      isMobile={true}
                      selectedModel={selectedModel}
                      onClearChat={handleClearChat}
                      aiMode={aiMode}
                      initialPrompt={initialChatPrompt}
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
                        console.log("File saved:", file.name, content.length, "characters")
                        
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
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="cloud" className="flex-1 m-0 data-[state=active]:flex data-[state=active]:flex-col">
                  <div className="h-full overflow-hidden">
                    <CloudTab user={user} selectedProject={selectedProject} />
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>

          {/* Fixed Mobile Bottom Tab Navigation */}
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
            <div className="grid grid-cols-4 h-12">
              <button
                onClick={() => setMobileTab("chat")}
                className={`flex flex-col items-center justify-center space-y-1 transition-colors ${
                  mobileTab === "chat" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs">Chat</span>
              </button>
              <button
                onClick={() => setMobileTab("files")}
                className={`flex flex-col items-center justify-center space-y-1 transition-colors ${
                  mobileTab === "files" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="h-4 w-4" />
                <span className="text-xs">Files</span>
              </button>
              <button
                onClick={() => setMobileTab("editor")}
                className={`flex flex-col items-center justify-center space-y-1 transition-colors ${
                  mobileTab === "editor" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code className="h-4 w-4" />
                <span className="text-xs">Editor</span>
              </button>
              <button
                onClick={() => setMobileTab("preview")}
                className={`flex flex-col items-center justify-center space-y-1 transition-colors ${
                  mobileTab === "preview" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-4 w-4" />
                <span className="text-xs">Preview</span>
              </button>
              <button
                onClick={() => setMobileTab("cloud")}
                className={`flex flex-col items-center justify-center space-y-1 transition-colors ${
                  mobileTab === "cloud" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Cloud className="h-4 w-4" />
                <span className="text-xs">Cloud</span>
              </button>
            </div>
          </div>
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
              <Select value={selectedTemplate} onValueChange={(value: 'vite-react' | 'nextjs') => setSelectedTemplate(value)}>
                <SelectTrigger id="template" className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent className="z-[110] bg-gray-800 border-gray-700">
                  <SelectItem value="vite-react" className="text-gray-200 hover:bg-gray-700">Vite</SelectItem>
                  <SelectItem value="nextjs" className="text-gray-200 hover:bg-gray-700">Next.js</SelectItem>
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
