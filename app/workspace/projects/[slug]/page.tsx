"use client"

import React, { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Github,
  Rocket,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Activity,
  Code,
  GitBranch,
  Clock,
  Database,
  Pencil,
  ExternalLink,
  Globe,
  Key,
  Lock,
  Plus,
  Trash2,
  Download,
  Settings,
  Server,
  Plug,
  Wifi,
  WifiOff,
  Terminal,
  Copy,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  RotateCw,
  FileCode,
  Box,
  AlertTriangle,
  Upload,
  Info,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { storageManager, type Workspace as Project, type Deployment, type EnvironmentVariable } from "@/lib/storage-manager"
import { createClient } from "@/lib/supabase/client"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { SupabaseConnectionManager } from "@/components/supabase-connection-manager"
import { usePageTitle } from '@/hooks/use-page-title'

// MCP Server config type
interface MCPServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  enabled: boolean
}

interface ProjectDetails extends Project {
  deployments: Deployment[]
  environmentVariables: EnvironmentVariable[]
  recentActivity?: Array<{
    type: string
    message: string
    timestamp: string
    status?: string
  }>
}

export default function ProjectPage() {
  usePageTitle('Project')
  const { slug } = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>("")
  const [previewSite, setPreviewSite] = useState<any>(null)
  const [productionSite, setProductionSite] = useState<any>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deploymentType, setDeploymentType] = useState<'preview' | 'production'>('preview')
  const [activeTab, setActiveTab] = useState("overview")

  // Edit project state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  // Environment variables state
  const [newEnvVar, setNewEnvVar] = useState({ key: "", value: "", environment: "production", isSecret: false })

  // MCP Servers state
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([])
  const [isAddMCPOpen, setIsAddMCPOpen] = useState(false)
  const [newMCPServer, setNewMCPServer] = useState<Partial<MCPServerConfig>>({
    name: '',
    transport: 'http',
    command: '',
    args: [],
    url: '',
    headers: {},
    env: {},
    enabled: true,
  })
  const [newMCPArgs, setNewMCPArgs] = useState('')
  const [newMCPEnvKey, setNewMCPEnvKey] = useState('')
  const [newMCPEnvValue, setNewMCPEnvValue] = useState('')
  const [newMCPHeaderKey, setNewMCPHeaderKey] = useState('')
  const [newMCPHeaderValue, setNewMCPHeaderValue] = useState('')
  const [expandedMCP, setExpandedMCP] = useState<string | null>(null)
  const [isImportConfigOpen, setIsImportConfigOpen] = useState(false)
  const [importConfigText, setImportConfigText] = useState('')
  const [globalMcpServers, setGlobalMcpServers] = useState<MCPServerConfig[]>([])
  const [addServerScope, setAddServerScope] = useState<'project' | 'global'>('project')

  useEffect(() => {
    getCurrentUser()
  }, [])

  useEffect(() => {
    if (currentUserId && slug) {
      loadProject()
    }
  }, [currentUserId, slug])

  // Load MCP servers from localStorage (project-specific + global)
  useEffect(() => {
    if (project?.id) {
      const stored = localStorage.getItem(`pipilot-mcp-servers-${project.id}`)
      if (stored) {
        try { setMcpServers(JSON.parse(stored)) } catch {}
      }
    }
    const globalStored = localStorage.getItem('pipilot-mcp-servers-global')
    if (globalStored) {
      try { setGlobalMcpServers(JSON.parse(globalStored)) } catch {}
    }
  }, [project?.id])

  // Save MCP servers to localStorage
  const saveMCPServers = (servers: MCPServerConfig[]) => {
    setMcpServers(servers)
    if (project?.id) {
      localStorage.setItem(`pipilot-mcp-servers-${project.id}`, JSON.stringify(servers))
    }
  }

  const saveGlobalMCPServers = (servers: MCPServerConfig[]) => {
    setGlobalMcpServers(servers)
    localStorage.setItem('pipilot-mcp-servers-global', JSON.stringify(servers))
  }

  const getCurrentUser = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      } else {
        router.push('/auth/login')
      }
    } catch (error) {
      console.error('Error getting current user:', error)
      router.push('/auth/login')
    }
  }

  const loadProject = async () => {
    if (!slug || typeof slug !== 'string') return
    setIsLoading(true)
    try {
      await storageManager.init()
      const projects = await storageManager.getWorkspaces(currentUserId)
      const foundProject = projects.find(p => p.slug === slug)

      if (!foundProject) {
        toast({ title: "Project Not Found", description: "The project doesn't exist or you don't have access.", variant: "destructive" })
        router.push('/workspace/management')
        return
      }

      const [deployments, envVars] = await Promise.all([
        storageManager.getDeployments(foundProject.id),
        storageManager.getEnvironmentVariables(foundProject.id)
      ])

      const sortedDeployments = deployments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      const recentActivity = sortedDeployments.slice(0, 5).map(deployment => ({
        type: 'deployment',
        message: `Deployed to ${deployment.provider}`,
        timestamp: deployment.createdAt,
        status: deployment.status
      }))

      setProject({ ...foundProject, deployments: sortedDeployments, environmentVariables: envVars, recentActivity })
      await loadSites(foundProject.id)
    } catch (error) {
      console.error('Error loading project:', error)
      toast({ title: "Error", description: "Failed to load project details", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const loadSites = async (projectId: string) => {
    try {
      const supabase = createClient()
      const { data: previewData } = await supabase
        .from('sites').select('*').eq('project_id', projectId).eq('site_type', 'preview').eq('user_id', currentUserId).order('deployed_at', { ascending: false }).limit(1).single()
      setPreviewSite(previewData)

      const { data: productionData } = await supabase
        .from('sites').select('*, custom_domains(domain, verified)').eq('project_id', projectId).eq('site_type', 'production').eq('user_id', currentUserId).single()
      setProductionSite(productionData)
    } catch (error) {
      console.error('Error loading sites:', error)
    }
  }

  const deployProject = async (isProduction: boolean) => {
    if (!project?.id) return
    setIsDeploying(true)
    setDeploymentType(isProduction ? 'production' : 'preview')
    try {
      const files = await storageManager.getFiles(project.id)
      if (!files || files.length === 0) {
        toast({ title: "No Files", description: "Project has no files to deploy", variant: "destructive" })
        return
      }
      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id, projectSlug: project.slug, files, authUserId: currentUserId,
          authUsername: project.name || 'user', isProduction,
          customDomainId: isProduction && productionSite?.custom_domain_id ? productionSite.custom_domain_id : undefined
        })
      })
      const data = await response.json()
      if (data.url) {
        toast({ title: isProduction ? "Production Deployed!" : "Preview Deployed!", description: `Site is live at ${data.url}` })
        await loadSites(project.id)
      } else { throw new Error(data.error || 'Deployment failed') }
    } catch (error) {
      console.error('Deployment error:', error)
      toast({ title: "Deployment Failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" })
    } finally { setIsDeploying(false) }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const openEditDialog = () => {
    if (project) {
      setEditName(project.name || "")
      setEditDescription(project.description || "")
      setIsEditDialogOpen(true)
    }
  }

  const saveProjectDetails = async () => {
    if (!project || !editName.trim()) {
      toast({ title: "Error", description: "Project name is required", variant: "destructive" })
      return
    }
    setIsSaving(true)
    try {
      await storageManager.init()
      const newSlug = editName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      await storageManager.updateWorkspace(project.id, { name: editName.trim(), description: editDescription.trim(), slug: newSlug, updatedAt: new Date().toISOString() })
      setProject(prev => prev ? { ...prev, name: editName.trim(), description: editDescription.trim(), slug: newSlug } : null)
      setIsEditDialogOpen(false)
      toast({ title: "Project Updated", description: "Project details saved" })
      if (newSlug !== slug) router.push(`/workspace/projects/${newSlug}`)
    } catch (error) {
      console.error('Error saving project:', error)
      toast({ title: "Error", description: "Failed to save project details", variant: "destructive" })
    } finally { setIsSaving(false) }
  }

  // Env var handlers
  const addEnvironmentVariable = async () => {
    if (!project?.id || !newEnvVar.key || !newEnvVar.value) {
      toast({ title: "Missing Fields", description: "Key and value are required", variant: "destructive" })
      return
    }
    try {
      await storageManager.init()
      const existing = project.environmentVariables.find(ev => ev.key === newEnvVar.key && ev.environment === newEnvVar.environment)
      if (existing) {
        await storageManager.updateEnvironmentVariable(existing.id, { value: newEnvVar.value, isSecret: newEnvVar.isSecret })
        toast({ title: "Updated", description: `${newEnvVar.key} updated` })
      } else {
        await storageManager.createEnvironmentVariable({ workspaceId: project.id, ...newEnvVar })
        toast({ title: "Added", description: `${newEnvVar.key} created` })
      }
      setNewEnvVar({ key: "", value: "", environment: "production", isSecret: false })
      loadProject()
    } catch (error) {
      toast({ title: "Error", description: "Failed to add variable", variant: "destructive" })
    }
  }

  const deleteEnvironmentVariable = async (key: string, environment: string) => {
    if (!project?.id) return
    try {
      const envVar = project.environmentVariables.find(ev => ev.key === key && ev.environment === environment)
      if (envVar) {
        await storageManager.deleteEnvironmentVariable(envVar.id)
        toast({ title: "Deleted", description: `${key} removed` })
        loadProject()
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete variable", variant: "destructive" })
    }
  }

  const handlePasteEnv = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text').trim()
    const envPairs = pastedText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => l.startsWith('export ') ? l.substring(7).trim() : l)

    if (envPairs.length === 0) return
    e.preventDefault()

    if (envPairs.length === 1) {
      const [key, ...vp] = envPairs[0].split('=')
      const value = vp.join('=').replace(/^["']|["']$/g, '')
      setNewEnvVar(prev => ({ ...prev, key: key.trim(), value: value.trim() }))
      toast({ title: "Detected", description: `Auto-filled: ${key.trim()}` })
    } else if (project?.id) {
      let count = 0
      for (const pair of envPairs) {
        const [key, ...vp] = pair.split('=')
        const value = vp.join('=').replace(/^["']|["']$/g, '')
        if (!key.trim()) continue
        try {
          await storageManager.createEnvironmentVariable({
            workspaceId: project.id, key: key.trim(), value: value.trim(), environment: newEnvVar.environment,
            isSecret: key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')
          })
          count++
        } catch {}
      }
      toast({ title: "Imported", description: `Added ${count} variables` })
      loadProject()
    }
  }

  // MCP Server handlers
  const addMCPServer = () => {
    if (!newMCPServer.name) {
      toast({ title: "Name required", description: "Please provide a server name", variant: "destructive" })
      return
    }
    if (newMCPServer.transport === 'http' && !newMCPServer.url) {
      toast({ title: "URL required", description: "Please provide a server URL for HTTP transport", variant: "destructive" })
      return
    }
    if (newMCPServer.transport === 'http' && newMCPServer.url && !newMCPServer.url.startsWith('http')) {
      toast({ title: "Invalid URL", description: "URL must start with http:// or https://", variant: "destructive" })
      return
    }
    if (newMCPServer.transport === 'stdio' && !newMCPServer.command) {
      toast({ title: "Command required", description: "Please provide a command for stdio transport", variant: "destructive" })
      return
    }
    // Auto-capture any pending header/env inputs the user typed but didn't click "+"
    const finalHeaders = { ...(newMCPServer.headers || {}) }
    if (newMCPHeaderKey && newMCPHeaderValue) {
      finalHeaders[newMCPHeaderKey] = newMCPHeaderValue
    }
    const finalEnv = { ...(newMCPServer.env || {}) }
    if (newMCPEnvKey && newMCPEnvValue) {
      finalEnv[newMCPEnvKey] = newMCPEnvValue
    }
    // Merge headers into env for HTTP servers (env is the unified storage, headers is the UI concept)
    const mergedEnv = newMCPServer.transport === 'http'
      ? { ...finalEnv, ...finalHeaders }
      : finalEnv
    const server: MCPServerConfig = {
      id: crypto.randomUUID(),
      name: newMCPServer.name!,
      transport: newMCPServer.transport || 'http',
      command: newMCPServer.command,
      args: newMCPArgs ? newMCPArgs.split('\n').map(a => a.trim()).filter(Boolean) : [],
      url: newMCPServer.url,
      headers: newMCPServer.transport === 'http' ? finalHeaders : undefined,
      env: mergedEnv,
      enabled: true,
    }
    if (addServerScope === 'global') {
      saveGlobalMCPServers([...globalMcpServers, server])
    } else {
      saveMCPServers([...mcpServers, server])
    }
    setIsAddMCPOpen(false)
    resetMCPForm()
    toast({ title: "Server Added", description: `${server.name} added to ${addServerScope === 'global' ? 'all projects' : 'this project'}` })
  }

  const resetMCPForm = () => {
    setNewMCPServer({ name: '', transport: 'http', command: '', args: [], url: '', headers: {}, env: {}, enabled: true })
    setNewMCPArgs('')
    setNewMCPEnvKey('')
    setNewMCPEnvValue('')
    setNewMCPHeaderKey('')
    setNewMCPHeaderValue('')
  }

  const removeMCPServer = (id: string, scope: 'project' | 'global') => {
    if (scope === 'global') {
      saveGlobalMCPServers(globalMcpServers.filter(s => s.id !== id))
    } else {
      saveMCPServers(mcpServers.filter(s => s.id !== id))
    }
    toast({ title: "Server Removed" })
  }

  const toggleMCPServer = (id: string, scope: 'project' | 'global') => {
    if (scope === 'global') {
      saveGlobalMCPServers(globalMcpServers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
    } else {
      saveMCPServers(mcpServers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
    }
  }

  const addMCPEnvVar = () => {
    if (newMCPEnvKey && newMCPEnvValue) {
      setNewMCPServer(prev => ({ ...prev, env: { ...prev.env, [newMCPEnvKey]: newMCPEnvValue } }))
      setNewMCPEnvKey('')
      setNewMCPEnvValue('')
    }
  }

  const removeMCPEnvVar = (key: string) => {
    setNewMCPServer(prev => {
      const env = { ...prev.env }
      delete env[key]
      return { ...prev, env }
    })
  }

  const addMCPHeader = () => {
    if (newMCPHeaderKey && newMCPHeaderValue) {
      setNewMCPServer(prev => ({ ...prev, headers: { ...prev.headers, [newMCPHeaderKey]: newMCPHeaderValue } }))
      setNewMCPHeaderKey('')
      setNewMCPHeaderValue('')
    }
  }

  const removeMCPHeader = (key: string) => {
    setNewMCPServer(prev => {
      const headers = { ...prev.headers }
      delete headers[key]
      return { ...prev, headers }
    })
  }

  const importMCPConfig = () => {
    try {
      const parsed = JSON.parse(importConfigText)
      const servers = parsed.mcpServers || parsed
      let count = 0
      const newServers: MCPServerConfig[] = [...mcpServers]

      for (const [name, config] of Object.entries(servers) as [string, any][]) {
        const isHttp = config.url || config.type === 'http' || config.type === 'sse'
        const server: MCPServerConfig = {
          id: crypto.randomUUID(),
          name,
          transport: isHttp ? 'http' : 'stdio',
          command: config.command,
          args: config.args || [],
          url: config.url,
          headers: config.headers || {},
          env: isHttp ? (config.headers || {}) : (config.env || {}),
          enabled: true,
        }
        // Skip duplicates
        if (!newServers.find(s => s.name === name)) {
          newServers.push(server)
          count++
        }
      }

      saveMCPServers(newServers)
      setIsImportConfigOpen(false)
      setImportConfigText('')
      toast({ title: "Imported", description: `Added ${count} server${count !== 1 ? 's' : ''} from config` })
    } catch {
      toast({ title: "Invalid JSON", description: "Could not parse the configuration. Please check the format.", variant: "destructive" })
    }
  }

  const copyMCPConfig = () => {
    const config: Record<string, any> = {}
    mcpServers.forEach(s => {
      if (s.transport === 'stdio') {
        config[s.name] = { command: s.command, args: s.args, ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}) }
      } else {
        config[s.name] = { url: s.url, ...(s.env && Object.keys(s.env).length > 0 ? { headers: s.env } : {}) }
      }
    })
    navigator.clipboard.writeText(JSON.stringify({ mcpServers: config }, null, 2))
    toast({ title: "Copied", description: "MCP config copied to clipboard" })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <p className="text-gray-400 text-sm">Loading project...</p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navigation />
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <div className="p-4 rounded-2xl bg-gray-900/50 border border-gray-800/50 mb-4">
            <AlertCircle className="h-10 w-10 text-gray-600" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Project Not Found</h1>
          <p className="text-gray-400 mb-6 text-sm">The project doesn't exist or you don't have access.</p>
          <Button onClick={() => router.push('/workspace/management')} className="bg-indigo-600 hover:bg-indigo-500">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navigation />

      {/* Project Header */}
      <div className="relative border-b border-gray-800/50">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-6">
          {/* Back button */}
          <button
            onClick={() => router.push('/workspace/management')}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Projects
          </button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-gray-900 border border-gray-800 shrink-0">
                <Globe className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">{project.name}</h1>
                  <button onClick={openEditDialog} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <Badge variant="outline" className={`text-xs ${project.deploymentStatus === 'deployed' ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-gray-700 text-gray-400'}`}>
                    <div className={`h-1.5 w-1.5 rounded-full mr-1.5 ${project.deploymentStatus === 'deployed' ? 'bg-green-500' : 'bg-gray-500'}`} />
                    {project.deploymentStatus === 'deployed' ? 'Live' : 'Draft'}
                  </Badge>
                </div>
                <p className="text-gray-400 text-sm mt-1">{project.description || 'No description'}</p>
                {(project.vercelDeploymentUrl || project.netlifyDeploymentUrl) && (
                  <a
                    href={project.vercelDeploymentUrl || project.netlifyDeploymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mt-2 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {(project.vercelDeploymentUrl || project.netlifyDeploymentUrl || '').replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => deployProject(false)}
                disabled={isDeploying}
                className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white h-9 text-sm"
              >
                {isDeploying && deploymentType === 'preview' ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                Preview
              </Button>
              <Button
                onClick={() => deployProject(true)}
                disabled={isDeploying}
                className="bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 h-9 text-sm"
              >
                {isDeploying && deploymentType === 'production' ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                Deploy
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: 'Deployments', value: project.deployments.length, icon: Rocket, color: 'text-blue-400' },
              { label: 'Env Variables', value: project.environmentVariables.length, icon: Key, color: 'text-amber-400' },
              { label: 'MCP Servers', value: mcpServers.length, icon: Server, color: 'text-purple-400' },
              { label: 'Last Activity', value: new Date(project.lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), icon: Clock, color: 'text-gray-400' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-900/50 border border-gray-800/50">
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
                <div>
                  <p className="text-sm font-semibold text-white">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-900 border border-gray-800 p-1 h-auto mb-6 flex-wrap">
            <TabsTrigger value="overview" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
              <Activity className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="env" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
              <Key className="h-4 w-4 mr-2" />
              Variables
            </TabsTrigger>
            <TabsTrigger value="mcp" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
              <Server className="h-4 w-4 mr-2" />
              MCP Servers
            </TabsTrigger>
            <TabsTrigger value="integrations" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
              <Plug className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Deployment Status */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="px-5 py-4 border-b border-gray-800/50 flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-gray-400" />
                    Deployment
                  </h3>
                  <Badge variant="outline" className={`text-[10px] ${project.deploymentStatus === 'deployed' ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-gray-700 text-gray-400'}`}>
                    {project.deploymentStatus === 'deployed' ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Status</span>
                    <span className="text-sm text-white capitalize">{project.deploymentStatus.replace('_', ' ')}</span>
                  </div>
                  <Separator className="bg-gray-800" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Created</span>
                    <span className="text-sm text-white">{formatDate(project.createdAt)}</span>
                  </div>
                  <Separator className="bg-gray-800" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Last Activity</span>
                    <span className="text-sm text-white">{formatDate(project.lastActivity)}</span>
                  </div>
                  {(project.vercelDeploymentUrl || project.netlifyDeploymentUrl) && (
                    <>
                      <Separator className="bg-gray-800" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">URL</span>
                        <a href={project.vercelDeploymentUrl || project.netlifyDeploymentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                          Visit <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Repository */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="px-5 py-4 border-b border-gray-800/50">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Code className="h-4 w-4 text-gray-400" />
                    Repository
                  </h3>
                </div>
                <div className="p-5">
                  {project.githubRepoUrl ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-800">
                        <Github className="h-5 w-5 text-white" />
                        <div className="min-w-0 flex-1">
                          <a href={project.githubRepoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:text-indigo-300 truncate block">
                            {project.githubRepoUrl.replace('https://github.com/', '')}
                          </a>
                        </div>
                        <ExternalLink className="h-4 w-4 text-gray-500 shrink-0" />
                      </div>
                      {project.githubRepoName && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-400">Repo Name</span>
                          <span className="text-sm text-white">{project.githubRepoName}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <Github className="h-8 w-8 text-gray-700 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 mb-3">No repository connected</p>
                      <Button variant="outline" size="sm" className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                        Connect GitHub
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Deployments */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="px-5 py-4 border-b border-gray-800/50">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    Recent Deployments
                    <Badge variant="outline" className="text-[10px] h-5 border-gray-700 text-gray-500 ml-auto">{project.deployments.length}</Badge>
                  </h3>
                </div>
                {project.deployments.length > 0 ? (
                  <div className="divide-y divide-gray-800/30">
                    {project.deployments.slice(0, 5).map((deployment, index) => (
                      <div key={index} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          {deployment.status === 'ready' || deployment.status === 'deployed' ? (
                            <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                          ) : deployment.status === 'in_progress' ? (
                            <RefreshCw className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                          )}
                          <div>
                            <p className="text-sm text-gray-200 capitalize">{deployment.provider}</p>
                            <p className="text-xs text-gray-500">{formatDate(deployment.createdAt)}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] h-5 border-gray-700 text-gray-400">{deployment.environment}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 text-center">
                    <p className="text-sm text-gray-500">No deployments yet</p>
                  </div>
                )}
              </div>

              {/* Database */}
              <div
                className="bg-gray-900 border border-gray-800 rounded-xl cursor-pointer hover:border-gray-700 transition-colors"
                onClick={() => router.push(`/workspace/${project.id}/database`)}
              >
                <div className="px-5 py-4 border-b border-gray-800/50 flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-400" />
                    Database
                  </h3>
                  <Badge variant="outline" className="text-[10px] h-5 border-purple-500/30 text-purple-400">Manage</Badge>
                </div>
                <div className="p-5">
                  <p className="text-sm text-gray-400 mb-4">Create and manage databases for this project</p>
                  <Button className="w-full bg-purple-600 hover:bg-purple-500 h-9 text-sm" onClick={(e) => { e.stopPropagation(); router.push(`/workspace/${project.id}/database`) }}>
                    <Database className="h-4 w-4 mr-2" />
                    Open Database Manager
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Environment Variables Tab */}
          <TabsContent value="env" className="mt-0 space-y-6">
            {/* Add Variable Form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Key className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Add Variable</h3>
                  <p className="text-xs text-gray-500">Paste .env content or add variables individually</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Key</Label>
                  <Input
                    placeholder="API_KEY"
                    value={newEnvVar.key}
                    onChange={(e) => setNewEnvVar(prev => ({ ...prev, key: e.target.value }))}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 h-9 text-sm font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Value</Label>
                  <Input
                    placeholder="sk-..."
                    type={newEnvVar.isSecret ? "password" : "text"}
                    value={newEnvVar.value}
                    onChange={(e) => setNewEnvVar(prev => ({ ...prev, value: e.target.value }))}
                    onPaste={handlePasteEnv}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 h-9 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Environment</Label>
                  <select
                    value={newEnvVar.environment}
                    onChange={(e) => setNewEnvVar(prev => ({ ...prev, environment: e.target.value }))}
                    className="h-9 px-3 bg-gray-800 border border-gray-700 rounded-md text-sm text-white"
                  >
                    <option value="production">Production</option>
                    <option value="preview">Preview</option>
                    <option value="development">Development</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer h-9">
                  <Switch checked={newEnvVar.isSecret} onCheckedChange={(checked) => setNewEnvVar(prev => ({ ...prev, isSecret: checked }))} />
                  <span className="text-xs text-gray-400">Secret</span>
                </label>
                <Button onClick={addEnvironmentVariable} className="bg-indigo-600 hover:bg-indigo-500 h-9 text-sm ml-auto">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add
                </Button>
              </div>
            </div>

            {/* Variables List */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800/50 flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm">
                  Variables
                  <Badge variant="outline" className="text-[10px] h-5 border-gray-700 text-gray-500 ml-2">{project.environmentVariables.length}</Badge>
                </h3>
              </div>
              {project.environmentVariables.length > 0 ? (
                <div className="divide-y divide-gray-800/30">
                  {project.environmentVariables.map((envVar, idx) => (
                    <div key={idx} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors group">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <code className="text-sm text-indigo-400 font-mono">{envVar.key}</code>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-gray-700 text-gray-500 shrink-0">{envVar.environment}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {envVar.isSecret ? (
                          <span className="text-xs text-gray-600 font-mono">{'*'.repeat(16)}</span>
                        ) : (
                          <span className="text-xs text-gray-400 font-mono truncate max-w-[200px]">{envVar.value}</span>
                        )}
                        {envVar.isSecret && <Lock className="h-3 w-3 text-amber-500/50" />}
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => deleteEnvironmentVariable(envVar.key, envVar.environment)}
                          className="h-7 w-7 p-0 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Key className="h-8 w-8 text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No environment variables configured</p>
                  <p className="text-xs text-gray-600 mt-1">Variables are included in deployments automatically</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* MCP Servers Tab */}
          <TabsContent value="mcp" className="mt-0 space-y-6">
            {/* MCP Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">MCP Servers</h3>
                <p className="text-sm text-gray-400 mt-0.5">Configure Model Context Protocol servers to extend AI capabilities</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsImportConfigOpen(true)} className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 h-8 text-xs">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Import
                </Button>
                {mcpServers.length > 0 && (
                  <Button variant="outline" size="sm" onClick={copyMCPConfig} className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800 h-8 text-xs">
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Export
                  </Button>
                )}
                <Button onClick={() => setIsAddMCPOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 h-8 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Server
                </Button>
              </div>
            </div>

            {/* Server List */}
            {(() => {
              const renderServerCard = (server: MCPServerConfig, scope: 'project' | 'global') => (
                <div key={server.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${server.enabled ? 'bg-green-500/10' : 'bg-gray-800'}`}>
                        {server.transport === 'stdio' ? (
                          <Terminal className={`h-4 w-4 ${server.enabled ? 'text-green-400' : 'text-gray-500'}`} />
                        ) : (
                          <Wifi className={`h-4 w-4 ${server.enabled ? 'text-green-400' : 'text-gray-500'}`} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white text-sm">{server.name}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-gray-700 text-gray-500">
                            {server.transport}
                          </Badge>
                          {scope === 'global' && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-purple-500/30 text-purple-400 bg-purple-500/5">
                              Global
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {server.transport === 'stdio'
                            ? `${server.command} ${(server.args || []).join(' ')}`.trim()
                            : server.url}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={server.enabled} onCheckedChange={() => toggleMCPServer(server.id, scope)} />
                      <button
                        onClick={() => setExpandedMCP(expandedMCP === server.id ? null : server.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
                      >
                        {expandedMCP === server.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => removeMCPServer(server.id, scope)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {expandedMCP === server.id && (
                    <div className="px-5 pb-4 pt-1 border-t border-gray-800/50 space-y-3">
                      {server.transport === 'stdio' ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Command</span>
                            <code className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded font-mono">{server.command}</code>
                          </div>
                          {server.args && server.args.length > 0 && (
                            <div>
                              <span className="text-xs text-gray-500 block mb-1.5">Arguments</span>
                              <div className="flex flex-wrap gap-1.5">
                                {server.args.map((arg, i) => (
                                  <code key={i} className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded font-mono">{arg}</code>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">URL</span>
                          <code className="text-xs text-gray-300 bg-gray-800 px-2 py-0.5 rounded font-mono truncate max-w-[300px]">{server.url}</code>
                        </div>
                      )}
                      {server.headers && Object.keys(server.headers).length > 0 && server.transport === 'http' && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-1.5">Headers</span>
                          <div className="space-y-1">
                            {Object.entries(server.headers).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-800/50">
                                <code className="text-xs text-indigo-400 font-mono">{k}</code>
                                <code className="text-xs text-gray-500 font-mono">
                                  {k.toLowerCase() === 'authorization' ? `${v.slice(0, 10)}${'*'.repeat(Math.max(0, Math.min(v.length - 10, 15)))}` : '*'.repeat(Math.max(0, Math.min(v.length, 20)))}
                                </code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {server.env && Object.keys(server.env).length > 0 && server.transport === 'stdio' && (
                        <div>
                          <span className="text-xs text-gray-500 block mb-1.5">Environment Variables</span>
                          <div className="space-y-1">
                            {Object.entries(server.env).map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-800/50">
                                <code className="text-xs text-indigo-400 font-mono">{k}</code>
                                <code className="text-xs text-gray-500 font-mono">{'*'.repeat(Math.max(0, Math.min(v.length, 20)))}</code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )

              const hasAny = mcpServers.length > 0 || globalMcpServers.length > 0
              return hasAny ? (
                <div className="space-y-4">
                  {globalMcpServers.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-purple-400" />
                        <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">Global Servers (All Projects)</span>
                      </div>
                      {globalMcpServers.map(s => renderServerCard(s, 'global'))}
                    </div>
                  )}
                  {mcpServers.length > 0 && (
                    <div className="space-y-3">
                      {globalMcpServers.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Box className="h-3.5 w-3.5 text-indigo-400" />
                          <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider">Project Servers</span>
                        </div>
                      )}
                      {mcpServers.map(s => renderServerCard(s, 'project'))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-10 text-center">
                  <Server className="h-10 w-10 text-gray-700 mx-auto mb-3" />
                  <h4 className="text-white font-medium mb-1">No MCP servers configured</h4>
                  <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
                    Add MCP servers to give your AI assistant access to external tools like file systems, databases, web search, and more.
                  </p>
                  <Button onClick={() => setIsAddMCPOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 h-9 text-sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Server
                  </Button>
              </div>
              )
            })()}

            {/* Popular Servers Suggestions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="px-5 py-4 border-b border-gray-800/50">
                <h4 className="font-semibold text-white text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Popular MCP Servers
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
                {[
                  { name: 'Supabase', desc: 'Database, auth & storage', transport: 'http' as const, url: 'https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF', headerKey: 'Authorization', headerValue: 'Bearer ' },
                  { name: 'Context7', desc: 'Up-to-date library docs', transport: 'http' as const, url: 'https://mcp.context7.com/mcp', headerKey: '', headerValue: '' },
                  { name: 'Brave Search', desc: 'Web search with privacy', transport: 'stdio' as const, command: 'npx', args: '-y @anthropic/brave-search-mcp', env: 'BRAVE_API_KEY' },
                  { name: 'GitHub', desc: 'Repository & issue management', transport: 'stdio' as const, command: 'npx', args: '-y @modelcontextprotocol/server-github', env: 'GITHUB_PERSONAL_ACCESS_TOKEN' },
                  { name: 'Filesystem', desc: 'Read/write local files', transport: 'stdio' as const, command: 'npx', args: '-y @modelcontextprotocol/server-filesystem /path', env: '' },
                  { name: 'PostgreSQL', desc: 'Database queries & schema', transport: 'stdio' as const, command: 'npx', args: '-y @modelcontextprotocol/server-postgres', env: 'DATABASE_URL' },
                ].map((s) => (
                  <button
                    key={s.name}
                    onClick={() => {
                      if (s.transport === 'http') {
                        setNewMCPServer({
                          name: s.name.toLowerCase().replace(/\s+/g, '-'),
                          transport: 'http',
                          url: s.url,
                          headers: {},
                          env: {},
                          enabled: true,
                        })
                        // Pre-fill header input fields so user just completes the token
                        if (s.headerKey) {
                          setNewMCPHeaderKey(s.headerKey)
                          setNewMCPHeaderValue(s.headerValue || '')
                        }
                        setNewMCPArgs('')
                      } else {
                        setNewMCPServer({
                          name: s.name.toLowerCase().replace(/\s+/g, '-'),
                          transport: 'stdio',
                          command: s.command,
                          env: s.env ? { [s.env]: '' } : {},
                          headers: {},
                          enabled: true,
                        })
                        setNewMCPArgs(s.args || '')
                      }
                      setIsAddMCPOpen(true)
                    }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/30 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/50 transition-all text-left"
                  >
                    {s.transport === 'http' ? (
                      <Wifi className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                    ) : (
                      <Terminal className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-white">{s.name}</p>
                        {s.transport === 'http' && (
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-indigo-500/30 text-indigo-400 bg-indigo-500/5">HTTP</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Supabase */}
              <SupabaseConnectionManager pixelpilotProjectId={project.id} userId={currentUserId} />

              {/* GitHub */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="px-5 py-4 border-b border-gray-800/50 flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Github className="h-4 w-4" />
                    GitHub
                  </h3>
                  <Badge variant="outline" className={`text-[10px] h-5 ${project.githubRepoUrl ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-gray-700 text-gray-400'}`}>
                    {project.githubRepoUrl ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>
                <div className="p-5">
                  {project.githubRepoUrl ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-800">
                        <Github className="h-5 w-5 text-white shrink-0" />
                        <a href={project.githubRepoUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-400 hover:text-indigo-300 truncate">
                          {project.githubRepoUrl.replace('https://github.com/', '')}
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500 mb-3">Connect a GitHub repository to enable version control</p>
                      <Button variant="outline" size="sm" className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                        <Github className="h-4 w-4 mr-2" />
                        Connect Repository
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Vercel */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="px-5 py-4 border-b border-gray-800/50 flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Vercel
                  </h3>
                  <Badge variant="outline" className={`text-[10px] h-5 ${project.vercelDeploymentUrl ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-gray-700 text-gray-400'}`}>
                    {project.vercelDeploymentUrl ? 'Deployed' : 'Not Deployed'}
                  </Badge>
                </div>
                <div className="p-5">
                  {project.vercelDeploymentUrl ? (
                    <a href={project.vercelDeploymentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-800 hover:border-gray-700 transition-colors">
                      <span className="text-sm text-gray-300 truncate">{project.vercelDeploymentUrl.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="h-4 w-4 text-gray-500 shrink-0 ml-auto" />
                    </a>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500 mb-3">Deploy to Vercel for instant global hosting</p>
                      <Button variant="outline" size="sm" onClick={() => deployProject(true)} className="bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                        <Rocket className="h-4 w-4 mr-2" />
                        Deploy to Vercel
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Netlify */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl">
                <div className="px-5 py-4 border-b border-gray-800/50 flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Netlify
                  </h3>
                  <Badge variant="outline" className={`text-[10px] h-5 ${project.netlifyDeploymentUrl ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-gray-700 text-gray-400'}`}>
                    {project.netlifyDeploymentUrl ? 'Deployed' : 'Not Deployed'}
                  </Badge>
                </div>
                <div className="p-5">
                  {project.netlifyDeploymentUrl ? (
                    <a href={project.netlifyDeploymentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-800 hover:border-gray-700 transition-colors">
                      <span className="text-sm text-gray-300 truncate">{project.netlifyDeploymentUrl.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="h-4 w-4 text-gray-500 shrink-0 ml-auto" />
                    </a>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">Not deployed to Netlify</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-0 space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="px-5 py-4 border-b border-gray-800/50">
                <h3 className="font-semibold text-white text-sm">Project Details</h3>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Name</Label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white">{project.name}</span>
                    <button onClick={openEditDialog} className="text-xs text-indigo-400 hover:text-indigo-300">Edit</button>
                  </div>
                </div>
                <Separator className="bg-gray-800" />
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Description</Label>
                  <span className="text-sm text-gray-300">{project.description || 'No description'}</span>
                </div>
                <Separator className="bg-gray-800" />
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Slug</Label>
                  <code className="text-sm text-gray-300 font-mono">{project.slug}</code>
                </div>
                <Separator className="bg-gray-800" />
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Project ID</Label>
                  <code className="text-xs text-gray-500 font-mono">{project.id}</code>
                </div>
                <Separator className="bg-gray-800" />
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Created</Label>
                  <span className="text-sm text-gray-300">{formatDate(project.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-gray-900 border border-red-500/20 rounded-xl">
              <div className="px-5 py-4 border-b border-red-500/10">
                <h3 className="font-semibold text-red-400 text-sm">Danger Zone</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-200">Delete this project</p>
                    <p className="text-xs text-gray-500">Once deleted, this cannot be undone</p>
                  </div>
                  <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300">
                    Delete Project
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">Edit Project</DialogTitle>
            <DialogDescription className="text-gray-400">Update your project name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-xs text-gray-400 mb-1.5 block">Project Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="My Awesome Project" className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div>
              <Label className="text-xs text-gray-400 mb-1.5 block">Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Describe your project..." rows={3} className="bg-gray-800 border-gray-700 text-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSaving} className="bg-transparent border-gray-700 text-gray-300">Cancel</Button>
            <Button onClick={saveProjectDetails} disabled={isSaving || !editName.trim()} className="bg-indigo-600 hover:bg-indigo-500">{isSaving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add MCP Server Dialog */}
      <Dialog open={isAddMCPOpen} onOpenChange={(open) => { setIsAddMCPOpen(open); if (!open) resetMCPForm() }}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-800 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-indigo-400" />
              Add MCP Server
            </DialogTitle>
            <DialogDescription className="text-gray-400">Configure a new Model Context Protocol server</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* Scope Toggle */}
            <div>
              <Label className="text-xs text-gray-400 mb-1.5 block">Availability</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAddServerScope('project')}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors text-left ${addServerScope === 'project' ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'}`}
                >
                  <Box className="h-3.5 w-3.5" />
                  <div>
                    <p className="text-xs font-medium">This Project</p>
                  </div>
                </button>
                <button
                  onClick={() => setAddServerScope('global')}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors text-left ${addServerScope === 'global' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'}`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  <div>
                    <p className="text-xs font-medium">All Projects</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Server Name */}
            <div>
              <Label className="text-xs text-gray-400 mb-1.5 block">Server Name</Label>
              <Input
                value={newMCPServer.name}
                onChange={(e) => setNewMCPServer(prev => ({ ...prev, name: e.target.value }))}
                placeholder="supabase"
                className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
              />
            </div>

            {/* Transport Type */}
            <div>
              <Label className="text-xs text-gray-400 mb-1.5 block">Transport</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewMCPServer(prev => ({ ...prev, transport: 'http' }))}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${newMCPServer.transport === 'http' ? 'border-indigo-500 bg-indigo-500/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'}`}
                >
                  <Wifi className="h-4 w-4" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Remote (HTTP)</p>
                    <p className="text-xs text-gray-500">Connect via URL</p>
                  </div>
                </button>
                <button
                  onClick={() => setNewMCPServer(prev => ({ ...prev, transport: 'stdio' }))}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${newMCPServer.transport === 'stdio' ? 'border-amber-500 bg-amber-500/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'}`}
                >
                  <Terminal className="h-4 w-4" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Local (stdio)</p>
                    <p className="text-xs text-gray-500">Run as child process</p>
                  </div>
                </button>
              </div>
              {newMCPServer.transport === 'stdio' && (
                <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-400/80">
                    stdio servers require a local runtime and won't work in PiPilot's cloud environment. Use HTTP transport for cloud-hosted MCP servers.
                  </p>
                </div>
              )}
            </div>

            {/* Conditional Fields */}
            {newMCPServer.transport === 'stdio' ? (
              <>
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Command</Label>
                  <Input
                    value={newMCPServer.command}
                    onChange={(e) => setNewMCPServer(prev => ({ ...prev, command: e.target.value }))}
                    placeholder="npx"
                    className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Arguments (one per line)</Label>
                  <Textarea
                    value={newMCPArgs}
                    onChange={(e) => setNewMCPArgs(e.target.value)}
                    placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/directory"}
                    rows={3}
                    className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
                  />
                </div>
                {/* Environment Variables for stdio */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Environment Variables</Label>
                  {newMCPServer.env && Object.keys(newMCPServer.env).length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {Object.entries(newMCPServer.env).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-800">
                          <code className="text-xs text-indigo-400 font-mono flex-1">{k}</code>
                          <code className="text-xs text-gray-500 font-mono">{v ? '***' : '(empty)'}</code>
                          <button onClick={() => removeMCPEnvVar(k)} className="text-gray-600 hover:text-red-400">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newMCPEnvKey}
                      onChange={(e) => setNewMCPEnvKey(e.target.value)}
                      placeholder="KEY"
                      className="bg-gray-800 border-gray-700 text-white font-mono text-xs h-8 flex-1"
                    />
                    <Input
                      value={newMCPEnvValue}
                      onChange={(e) => setNewMCPEnvValue(e.target.value)}
                      placeholder="Value"
                      type="password"
                      className="bg-gray-800 border-gray-700 text-white font-mono text-xs h-8 flex-1"
                    />
                    <Button variant="outline" size="sm" onClick={addMCPEnvVar} className="h-8 px-3 bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Server URL</Label>
                  <Input
                    value={newMCPServer.url}
                    onChange={(e) => setNewMCPServer(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://mcp.supabase.com/mcp?project_ref=..."
                    className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
                  />
                </div>

                {/* Authorization / Headers for HTTP */}
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block flex items-center gap-1.5">
                    Headers
                    <span className="text-gray-600 font-normal">(Authentication & custom headers)</span>
                  </Label>

                  {/* Quick auth helper */}
                  {!newMCPServer.headers?.['Authorization'] && (
                    <button
                      onClick={() => {
                        setNewMCPHeaderKey('Authorization')
                        setNewMCPHeaderValue('Bearer ')
                      }}
                      className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-md bg-indigo-500/5 border border-indigo-500/20 text-xs text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                    >
                      <Key className="h-3 w-3" />
                      Add Bearer Token
                    </button>
                  )}

                  {/* Existing headers list */}
                  {newMCPServer.headers && Object.keys(newMCPServer.headers).length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {Object.entries(newMCPServer.headers).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-800">
                          <code className="text-xs text-indigo-400 font-mono shrink-0">{k}</code>
                          <code className="text-xs text-gray-500 font-mono truncate flex-1">
                            {k.toLowerCase() === 'authorization' ? `${v.slice(0, 10)}${'*'.repeat(Math.max(0, Math.min(v.length - 10, 20)))}` : (v ? '***' : '(empty)')}
                          </code>
                          <button onClick={() => removeMCPHeader(k)} className="text-gray-600 hover:text-red-400 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add header inputs */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newMCPHeaderKey}
                      onChange={(e) => setNewMCPHeaderKey(e.target.value)}
                      placeholder="Header name"
                      className="bg-gray-800 border-gray-700 text-white font-mono text-xs h-8 flex-[0.8]"
                    />
                    <Input
                      value={newMCPHeaderValue}
                      onChange={(e) => setNewMCPHeaderValue(e.target.value)}
                      placeholder={newMCPHeaderKey === 'Authorization' ? 'Bearer your-token-here' : 'Value'}
                      type={newMCPHeaderKey.toLowerCase() === 'authorization' ? 'text' : 'password'}
                      className="bg-gray-800 border-gray-700 text-white font-mono text-xs h-8 flex-1"
                    />
                    <Button variant="outline" size="sm" onClick={addMCPHeader} className="h-8 px-3 bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1.5">
                    Most MCP servers need an Authorization header: <code className="text-gray-500">Bearer your-token</code>
                  </p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddMCPOpen(false); resetMCPForm() }} className="bg-transparent border-gray-700 text-gray-300">Cancel</Button>
            <Button onClick={addMCPServer} className="bg-indigo-600 hover:bg-indigo-500">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import MCP Config Dialog */}
      <Dialog open={isImportConfigOpen} onOpenChange={setIsImportConfigOpen}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Upload className="h-5 w-5 text-indigo-400" />
              Import MCP Config
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Paste your MCP configuration JSON from VS Code, Claude Desktop, or Cursor
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={importConfigText}
              onChange={(e) => setImportConfigText(e.target.value)}
              placeholder={`{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=...",
      "headers": {
        "Authorization": "Bearer sbp_..."
      }
    }
  }
}`}
              rows={10}
              className="bg-gray-800 border-gray-700 text-white font-mono text-xs"
            />
            <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-gray-800/50 border border-gray-800">
              <Info className="h-3.5 w-3.5 text-gray-500 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-500">
                Supports standard MCP config format. HTTP servers with <code className="text-gray-400">url</code> and <code className="text-gray-400">headers</code> fields, or stdio servers with <code className="text-gray-400">command</code> and <code className="text-gray-400">args</code>.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsImportConfigOpen(false); setImportConfigText('') }} className="bg-transparent border-gray-700 text-gray-300">Cancel</Button>
            <Button onClick={importMCPConfig} disabled={!importConfigText.trim()} className="bg-indigo-600 hover:bg-indigo-500">
              <Upload className="h-4 w-4 mr-1.5" />
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
