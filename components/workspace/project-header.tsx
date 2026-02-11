"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, GitBranch, Share2, Settings, Plus, Rocket, Upload, Database, Zap, Cloud } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import React, { useState, useEffect } from 'react'
import type { Workspace as Project } from "@/lib/storage-manager"
import { ChatSessionSelector } from "@/components/ui/chat-session-selector"
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
import { useToast } from "@/hooks/use-toast"

interface ProjectHeaderProps {
  project: Project | null
  // onShare will be called after a successful copy with the share URL
  onShare?: (shareUrl?: string) => void
  onSettings?: () => void
  onDeploy?: () => void
  onDatabase?: () => void
  selectedModel?: string
  onModelChange?: (modelId: string) => void
  userPlan?: string
  subscriptionStatus?: string
  user?: any
  onProjectCreated?: (newProject: Project) => Promise<void>
  openDialog?: boolean
  initialName?: string
  initialDescription?: string
  onDialogOpenChange?: (open: boolean) => void
  // Chat session props
  currentChatSessionId?: string | null
  onChatSessionChange?: (sessionId: string) => void
  onNewChatSession?: () => void
}

export function ProjectHeader({
  project,
  onShare,
  onSettings,
  onDeploy,
  onDatabase,
  selectedModel,
  onModelChange,
  userPlan,
  subscriptionStatus,
  user,
  onProjectCreated,
  openDialog,
  initialName,
  initialDescription,
  onDialogOpenChange,
  currentChatSessionId,
  onChatSessionChange,
  onNewChatSession,
}: ProjectHeaderProps) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(project?.name || "")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDescription, setNewProjectDescription] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<'vite-react' | 'nextjs' | 'expo' | 'html'>('vite-react')
  const [isCreating, setIsCreating] = useState(false)
  const [gitHubConnected, setGitHubConnected] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)

  // GitHub push functionality
  const { pushToGitHub, checkGitHubConnection, isPushing } = useGitHubPush()

  React.useEffect(() => {
    setNameInput(project?.name || "")
  }, [project?.name])

  // Check GitHub connection status when project changes
  useEffect(() => {
    const checkConnection = async () => {
      if (!project) {
        setGitHubConnected(false)
        return
      }

      const connectionStatus = await checkGitHubConnection(project)
      setGitHubConnected(connectionStatus.connected)
    }

    checkConnection()
  }, [project, checkGitHubConnection])

  // Handle external dialog open control
  React.useEffect(() => {
    if (openDialog !== undefined) {
      setIsCreateDialogOpen(openDialog)
    }
  }, [openDialog])

  // Handle initial name and description from external control
  React.useEffect(() => {
    if (openDialog) {
      if (initialName) {
        setNewProjectName(initialName)
      }
      if (initialDescription) {
        setNewProjectDescription(initialDescription)
      }
    } else {
      // Reset form when dialog closes
      setNewProjectName("")
      setNewProjectDescription("")
      setSelectedTemplate('vite-react')
    }
  }, [initialName, initialDescription, openDialog])

  const handleShareClick = async () => {
    if (!project) return
    const shareUrl = `${window.location.origin}/workspace?projectId=${project.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      onShare?.(shareUrl)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy share link', err)
      // Still call onShare so parent can show fallback
      onShare?.(shareUrl)
    }
  }

  const handleNameSave = async () => {
    if (!project || !nameInput.trim() || nameInput === project.name) {
      setEditing(false)
      return
    }
    try {
      const { storageManager } = await import("@/lib/storage-manager")
      await storageManager.init()
      await storageManager.updateWorkspace(project.id, { name: nameInput.trim() })
      setEditing(false)
    } catch (err) {
      console.error("Failed to update project name", err)
      setEditing(false)
    }
  }

  const handlePushToGitHub = async () => {
    if (!project) return
    
    await pushToGitHub(project, {
      onSuccess: (data) => {
        // Optionally refresh or update UI state
      },
      onError: (error) => {
        console.error('Push failed:', error)
      }
    })
  }

  const handleBackupToCloud = async () => {
    if (!project || !user?.id) return

    setIsBackingUp(true)
    
    try {
      const { uploadBackupToCloud } = await import('@/lib/cloud-sync')
      const success = await uploadBackupToCloud(user.id)
      
      if (!success) throw new Error("Backup failed")
      
      // Show success message
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

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !user) return

    setIsCreating(true)

    try {
      console.log('Creating new project:', newProjectName)
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
      onDialogOpenChange?.(false)
      setNewProjectName("")
      setNewProjectDescription("")
      // Notify parent to refresh projects
      if (onProjectCreated && workspace) {
        await onProjectCreated(workspace)
      }
    } catch (error) {
      console.error("Error creating project:", error)
    } finally {
      setIsCreating(false)
    }
  }
  if (!project) {
    return (
      <div className="h-16 border-b border-gray-800/60 bg-gray-900/80 px-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Logo variant="icon" size="sm" />
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Time to Ship something new?</h1>
            <p className="text-sm text-gray-500">Ask PiPilot to build your next app</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Create project button */}
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            setIsCreateDialogOpen(open)
            onDialogOpenChange?.(open)
          }}>
            <Button size="sm" className="bg-orange-600 hover:bg-orange-500 text-white border-0" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Manually
            </Button>
            <DialogContent className="sm:max-w-[425px] bg-gray-900 border-gray-800 text-white">
              <DialogHeader>
                <DialogTitle className="text-gray-100">Create New Project</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Start building your next app with PiPilot.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name" className="text-gray-200">Project Name</Label>
                  <Input
                    id="name"
                    placeholder="My Awesome App"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
                <div>
                  <Label htmlFor="description" className="text-gray-200">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="A brief description of your project"
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                  />
                </div>
                <div>
                  <Label htmlFor="template" className="text-gray-200">Template</Label>
                  <Select value={selectedTemplate} onValueChange={(value: 'vite-react' | 'nextjs' | 'expo' | 'html') => setSelectedTemplate(value)}>
                    <SelectTrigger id="template" className="bg-gray-800 border-gray-700 text-white">
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent className="z-[110] bg-gray-800 border-gray-700">
                      <SelectItem value="vite-react" className="text-gray-200">Vite</SelectItem>
                      <SelectItem value="nextjs" className="text-gray-200">Next.js</SelectItem>
                      <SelectItem value="expo" className="text-gray-200">Expo (Mobile)</SelectItem>
                      <SelectItem value="html" className="text-gray-200">HTML</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button className="bg-orange-600 hover:bg-orange-500 text-white" onClick={handleCreateProject} disabled={!newProjectName.trim() || isCreating}>
                  {isCreating ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    )
  }

  return (
    <div className="h-16 border-b border-gray-800/60 bg-gray-900/80 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Logo variant="icon" size="md" />
        <div>
          {editing ? (
            <input
              type="text"
              className="text-lg font-semibold text-gray-100 bg-gray-800 border border-gray-700 rounded px-2 py-1 w-40 focus:outline-none focus:ring-2 focus:ring-orange-500"
              value={nameInput}
              autoFocus
              onChange={e => setNameInput(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={e => {
                if (e.key === "Enter") handleNameSave()
                if (e.key === "Escape") setEditing(false)
              }}
            />
          ) : (
            <h1
              className="text-lg font-semibold text-gray-100 cursor-pointer hover:underline"
              title="Click to edit project name"
              onClick={() => setEditing(true)}
            >
              {project.name}
            </h1>
          )}
        </div>
       
        {/* Chat Session Selector */}
        {project && user && (
          <ChatSessionSelector
            workspaceId={project.id}
            userId={user.id}
            currentSessionId={currentChatSessionId}
            onSessionChange={onChatSessionChange}
            onNewSession={onNewChatSession}
            compact={true}
          />
        )}
      </div>

      <div className="flex items-center space-x-2">
           {/* Create project button */}
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            setIsCreateDialogOpen(open)
            onDialogOpenChange?.(open)
          }}>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 px-3"
                    onClick={() => window.location.href = '/workspace'}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="ml-2">New</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Create New Project</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          <DialogContent className="z-50">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>Start building your next app with AI assistance.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  placeholder="My Awesome App"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
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
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleShareClick}
                disabled={!project}
                className="h-8 w-8 p-0 sm:w-auto sm:px-3"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">
                  {copied ? 'Copied!' : 'Share'}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{copied ? 'Link copied to clipboard!' : 'Share project'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline"
                size="sm" 
                onClick={handleBackupToCloud}
                disabled={!project || isBackingUp}
                className="h-8 w-8 p-0 sm:w-auto sm:px-3 bg-orange-600/10 border-orange-500/50 hover:bg-orange-600/20"
              >
                <Cloud className={`h-4 w-4 text-orange-400 ${isBackingUp ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline ml-2 text-orange-400">
                  {isBackingUp ? "Backing up..." : "Backup"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isBackingUp ? "Creating cloud backup..." : "Backup project to cloud"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        {/* GitHub Push Button - only show when connected */}
        {gitHubConnected && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handlePushToGitHub}
                  disabled={!project || isPushing}
                  className="h-8 w-8 p-0 sm:w-auto sm:px-3 transition-all"
                >
                  <Upload className={`h-4 w-4 ${isPushing ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline ml-2">
                    {isPushing ? "Pushing..." : "Push"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p>{isPushing ? "Pushing changes to GitHub..." : "Push latest changes to GitHub repository"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        
        {/* Database Button - Mobile shows icon only */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline"
                size="sm" 
                onClick={onDatabase}
                disabled={!project}
                className="h-8 w-8 p-0 sm:w-auto sm:px-3 bg-orange-600/10 border-orange-500/50 hover:bg-orange-600/20"
              >
                <Database className="h-4 w-4 text-orange-400" />
                <span className="hidden sm:inline ml-2 text-orange-400">Database</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Manage Database</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={onDeploy}
                disabled={!project}
                className="h-8 px-3 bg-orange-600 hover:bg-orange-500 text-white border-0"
              >
                <Rocket className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Deploy</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Deploy Project</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}