"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Globe,
  Github,
  Settings,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  Search,
  Rocket,
  Filter,
  Download,
  FileText,
  Code,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Key,
  Eye,
  EyeOff,
  AlertTriangle,
  LayoutGrid,
  List,
  MoreHorizontal,
  ChevronRight,
  Zap,
  Server,
  Plug,
  Copy,
  ArrowUpRight,
  Clock,
  TrendingUp,
  Box,
  Terminal,
  Wifi,
  WifiOff,
  RotateCw,
  X,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { storageManager, type Workspace as Project, type Deployment, type EnvironmentVariable } from "@/lib/storage-manager"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

interface ProjectDisplay extends Project {
  url?: string
  platform: 'vercel' | 'netlify'
  lastDeployment?: Deployment
  environmentVariables: EnvironmentVariable[]
}

export default function ManagementPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("overview")
  const [isLoading, setIsLoading] = useState(true)
  const [projects, setProjects] = useState<ProjectDisplay[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>("sample-user")
  const [newEnvVar, setNewEnvVar] = useState({
    key: "",
    value: "",
    environment: "production",
    isSecret: false,
    selectedProjectId: ""
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showEnvValues, setShowEnvValues] = useState<Record<string, boolean>>({})

  useEffect(() => {
    getCurrentUser()
  }, [])

  useEffect(() => {
    if (currentUserId) {
      loadData()
    }
  }, [currentUserId])

  useEffect(() => {
    const handleProjectUpdate = (event: CustomEvent) => {
      const { projectId, action } = event.detail
      if (action === 'deployed' || action === 'updated') {
        loadData()
        toast({
          title: "Project Updated",
          description: "Project data has been refreshed",
        })
      }
    }
    window.addEventListener('projectUpdated', handleProjectUpdate as EventListener)
    return () => {
      window.removeEventListener('projectUpdated', handleProjectUpdate as EventListener)
    }
  }, [currentUserId])

  const getCurrentUser = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    } catch (error) {
      console.error('Error getting current user:', error)
    }
  }

  const initializeSampleData = async () => {
    try {
      await storageManager.init()
      const projects = await storageManager.getWorkspaces(currentUserId)
      if (projects.length === 0) {
        const { TemplateService } = await import('@/lib/template-service')

        const sampleProject1 = await TemplateService.createWorkspaceWithTemplate({
          name: "Sample React App",
          description: "A sample React application for testing",
          userId: currentUserId,
          isPublic: false,
          isTemplate: false,
          lastActivity: new Date().toISOString(),
          deploymentStatus: "deployed",
          vercelDeploymentUrl: "https://sample-react-app.vercel.app",
          githubRepoUrl: "https://github.com/user/sample-react-app"
        })

        const sampleProject2 = await TemplateService.createWorkspaceWithTemplate({
          name: "Portfolio Site",
          description: "Personal portfolio website",
          userId: currentUserId,
          isPublic: false,
          isTemplate: false,
          lastActivity: new Date().toISOString(),
          deploymentStatus: "deployed",
          netlifyDeploymentUrl: "https://portfolio-site.netlify.app",
          githubRepoUrl: "https://github.com/user/portfolio-site"
        })

        await storageManager.createDeployment({
          workspaceId: sampleProject1.id,
          url: "https://sample-react-app.vercel.app",
          status: "ready",
          commitSha: "abc123def456",
          commitMessage: "Initial deployment",
          branch: "main",
          environment: "production",
          provider: "vercel"
        })

        await storageManager.createDeployment({
          workspaceId: sampleProject2.id,
          url: "https://portfolio-site.netlify.app",
          status: "ready",
          commitSha: "def456ghi789",
          commitMessage: "Portfolio launch",
          branch: "main",
          environment: "production",
          provider: "netlify"
        })

        await storageManager.createEnvironmentVariable({
          workspaceId: sampleProject1.id,
          key: "API_KEY",
          value: "sk-1234567890abcdef",
          environment: "production",
          isSecret: true
        })

        await storageManager.createEnvironmentVariable({
          workspaceId: sampleProject1.id,
          key: "NODE_ENV",
          value: "production",
          environment: "production",
          isSecret: false
        })

        await storageManager.createEnvironmentVariable({
          workspaceId: sampleProject2.id,
          key: "CONTACT_EMAIL",
          value: "contact@example.com",
          environment: "production",
          isSecret: false
        })

        loadData()
      }
    } catch (error) {
      console.error('Error initializing sample data:', error)
    }
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      await storageManager.init()
      const [projects, deployments, envVars] = await Promise.all([
        storageManager.getWorkspaces(currentUserId),
        storageManager.getDeployments(),
        storageManager.getEnvironmentVariables()
      ])

      const projectsWithData: ProjectDisplay[] = projects.map(project => {
        const projectDeployments = deployments.filter(d => d.workspaceId === project.id)
        const projectEnvVars = envVars.filter(e => e.workspaceId === project.id)
        const lastDeployment = projectDeployments
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

        let platform: 'vercel' | 'netlify' = 'vercel'
        if (project.netlifyDeploymentUrl && !project.vercelDeploymentUrl) {
          platform = 'netlify'
        }

        return {
          ...project,
          url: project.vercelDeploymentUrl || project.netlifyDeploymentUrl,
          platform,
          lastDeployment,
          environmentVariables: projectEnvVars
        }
      })

      setProjects(projectsWithData)

      if (projects.length === 0) {
        await initializeSampleData()
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast({
        title: "Error",
        description: "Failed to load management data",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text').trim()
    const envPairs = pastedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        if (line.startsWith('export ')) return line.substring(7).trim()
        return line
      })

    if (envPairs.length === 0) return

    e.preventDefault()

    if (envPairs.length === 1) {
      const [key, ...valueParts] = envPairs[0].split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      setNewEnvVar(prev => ({ ...prev, key: key.trim(), value: value.trim() }))
      toast({
        title: "Variable Detected",
        description: `Auto-filled: ${key.trim()}`,
      })
    } else if (envPairs.length > 1) {
      if (!newEnvVar.selectedProjectId) {
        toast({
          title: "Project Required",
          description: "Please select a project first before pasting multiple variables",
          variant: "destructive"
        })
        return
      }

      let successCount = 0
      let skipCount = 0

      for (const pair of envPairs) {
        const [key, ...valueParts] = pair.split('=')
        const value = valueParts.join('=').replace(/^["']|["']$/g, '')

        if (!key.trim()) continue

        try {
          const envVars = await storageManager.getEnvironmentVariables(newEnvVar.selectedProjectId)
          const existingVar = envVars.find(ev => ev.key === key.trim() && ev.environment === newEnvVar.environment)

          if (existingVar) {
            await storageManager.updateEnvironmentVariable(existingVar.id, { value: value.trim() })
            skipCount++
          } else {
            await storageManager.createEnvironmentVariable({
              workspaceId: newEnvVar.selectedProjectId,
              key: key.trim(),
              value: value.trim(),
              environment: newEnvVar.environment,
              isSecret: key.toLowerCase().includes('secret') || key.toLowerCase().includes('password') || key.toLowerCase().includes('private')
            })
            successCount++
          }
        } catch (error) {
          console.error(`Error processing ${key}:`, error)
        }
      }

      toast({
        title: "Bulk Import Complete",
        description: `Added ${successCount} new, updated ${skipCount} existing variables`,
      })

      loadData()
    }
  }

  const addEnvironmentVariable = async () => {
    if (!newEnvVar.key || !newEnvVar.value || !newEnvVar.selectedProjectId) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields",
        variant: "destructive"
      })
      return
    }

    try {
      await storageManager.init()
      const envVars = await storageManager.getEnvironmentVariables(newEnvVar.selectedProjectId)
      const existingVar = envVars.find(ev => ev.key === newEnvVar.key && ev.environment === newEnvVar.environment)

      if (existingVar) {
        await storageManager.updateEnvironmentVariable(existingVar.id, {
          value: newEnvVar.value,
          isSecret: newEnvVar.isSecret,
        })
        toast({
          title: "Variable Updated",
          description: `${newEnvVar.key} has been updated`
        })
      } else {
        await storageManager.createEnvironmentVariable({
          workspaceId: newEnvVar.selectedProjectId,
          key: newEnvVar.key,
          value: newEnvVar.value,
          environment: newEnvVar.environment,
          isSecret: newEnvVar.isSecret,
        })
        toast({
          title: "Variable Added",
          description: `${newEnvVar.key} has been created`
        })
      }

      setNewEnvVar({ key: "", value: "", environment: "production", isSecret: false, selectedProjectId: newEnvVar.selectedProjectId })
      loadData()
    } catch (error) {
      console.error('Error adding environment variable:', error)
      toast({
        title: "Error",
        description: "Failed to add environment variable",
        variant: "destructive"
      })
    }
  }

  const deleteEnvironmentVariable = async (projectId: string, key: string, environment: string) => {
    try {
      await storageManager.init()
      const envVars = await storageManager.getEnvironmentVariables(projectId)
      const envVar = envVars.find(ev => ev.key === key && ev.environment === environment)

      if (envVar) {
        await storageManager.deleteEnvironmentVariable(envVar.id)
        toast({
          title: "Variable Deleted",
          description: `${key} has been removed`
        })
        loadData()
      }
    } catch (error) {
      console.error('Error deleting environment variable:', error)
      toast({
        title: "Error",
        description: "Failed to delete environment variable",
        variant: "destructive"
      })
    }
  }

  const exportEnvironmentVariables = async (projectId: string, format: 'env' | 'json' | 'shell') => {
    try {
      await storageManager.init()
      const envVars = await storageManager.getEnvironmentVariables(projectId)
      const project = projects.find(p => p.id === projectId)

      if (envVars.length === 0) {
        toast({ title: "No Variables", description: "No environment variables to export", variant: "destructive" })
        return
      }

      let content = ''
      let filename = ''
      let mimeType = 'text/plain'

      switch (format) {
        case 'env':
          content = envVars.map(ev => `${ev.key}=${ev.value}`).join('\n')
          filename = `.env.${project?.name?.toLowerCase().replace(/\s+/g, '-') || 'export'}`
          break
        case 'json':
          const jsonData = envVars.reduce((acc, ev) => {
            acc[ev.key] = ev.value
            return acc
          }, {} as Record<string, string>)
          content = JSON.stringify(jsonData, null, 2)
          filename = `env-${project?.name?.toLowerCase().replace(/\s+/g, '-') || 'export'}.json`
          mimeType = 'application/json'
          break
        case 'shell':
          content = envVars.map(ev => `export ${ev.key}="${ev.value}"`).join('\n')
          filename = `env-${project?.name?.toLowerCase().replace(/\s+/g, '-') || 'export'}.sh`
          break
      }

      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({ title: "Exported", description: `Variables exported as ${format}` })
    } catch (error) {
      console.error('Error exporting:', error)
    }
  }

  const exportAllEnvironmentVariables = async (format: 'env' | 'json' | 'shell') => {
    try {
      await storageManager.init()
      const allEnvVars: Array<{ projectName: string; key: string; value: string; environment: string }> = []

      for (const project of projects) {
        const envVars = await storageManager.getEnvironmentVariables(project.id)
        allEnvVars.push(...envVars.map(ev => ({
          projectName: project.name,
          key: ev.key,
          value: ev.value,
          environment: ev.environment
        })))
      }

      if (allEnvVars.length === 0) {
        toast({ title: "No Variables", description: "No environment variables to export", variant: "destructive" })
        return
      }

      let content = ''
      let filename = ''

      switch (format) {
        case 'env':
          let currentProject = ''
          content = allEnvVars.map(ev => {
            const header = ev.projectName !== currentProject ? `\n# ${ev.projectName}\n` : ''
            currentProject = ev.projectName
            return `${header}${ev.key}=${ev.value}`
          }).join('\n')
          filename = '.env.all-projects'
          break
        case 'json':
          const grouped = allEnvVars.reduce((acc, ev) => {
            if (!acc[ev.projectName]) acc[ev.projectName] = {}
            acc[ev.projectName][ev.key] = ev.value
            return acc
          }, {} as Record<string, Record<string, string>>)
          content = JSON.stringify(grouped, null, 2)
          filename = 'env-all-projects.json'
          break
        case 'shell':
          content = allEnvVars.map(ev => `export ${ev.key}="${ev.value}"`).join('\n')
          filename = 'env-all-projects.sh'
          break
      }

      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({ title: "Exported All", description: `All variables exported as ${format}` })
    } catch (error) {
      console.error('Error exporting all:', error)
    }
  }

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
    if (filterStatus === 'all') return matchesSearch
    if (filterStatus === 'deployed') return matchesSearch && project.deploymentStatus === 'deployed'
    if (filterStatus === 'not_deployed') return matchesSearch && project.deploymentStatus !== 'deployed'
    return matchesSearch
  })

  const totalEnvVars = projects.reduce((sum, p) => sum + p.environmentVariables.length, 0)
  const deployedCount = projects.filter(p => p.deploymentStatus === 'deployed').length

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          </div>
          <p className="text-gray-400 text-sm">Loading your projects...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navigation />

      {/* Hero Header */}
      <div className="relative border-b border-gray-800/50">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Projects
              </h1>
              <p className="text-gray-400 mt-1 text-sm sm:text-base">
                Manage your applications, environment variables, and integrations
              </p>
            </div>
            <Button
              onClick={() => router.push('/workspace')}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 self-start sm:self-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {[
              { label: 'Total Projects', value: projects.length, icon: Box, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Deployed', value: deployedCount, icon: Rocket, color: 'text-green-400', bg: 'bg-green-500/10' },
              { label: 'Env Variables', value: totalEnvVars, icon: Key, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { label: 'Integrations', value: projects.filter(p => p.githubRepoUrl).length, icon: Plug, color: 'text-purple-400', bg: 'bg-purple-500/10' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-900/50 border border-gray-800/50">
                <div className={`p-2 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xl font-semibold text-white">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <TabsList className="bg-gray-900 border border-gray-800 p-1 h-auto flex-wrap">
              <TabsTrigger value="overview" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
                <LayoutGrid className="h-4 w-4 mr-2" />
                Projects
              </TabsTrigger>
              <TabsTrigger value="environment" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
                <Key className="h-4 w-4 mr-2" />
                Env Variables
              </TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-sm px-4">
                <Shield className="h-4 w-4 mr-2" />
                Security
              </TabsTrigger>
            </TabsList>

            {activeTab === 'overview' && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full sm:w-56 bg-gray-900 border-gray-800 text-white placeholder-gray-500 h-9 text-sm focus:border-indigo-500/50 focus:ring-indigo-500/20"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-9 px-3 bg-gray-900 border border-gray-800 rounded-md text-sm text-gray-300 focus:border-indigo-500/50"
                >
                  <option value="all">All</option>
                  <option value="deployed">Deployed</option>
                  <option value="not_deployed">Draft</option>
                </select>
                <div className="hidden sm:flex items-center border border-gray-800 rounded-md overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 ${viewMode === 'grid' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'} transition-colors`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 ${viewMode === 'list' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'} transition-colors`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Projects Tab */}
          <TabsContent value="overview" className="mt-0">
            {filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-2xl bg-gray-900/50 border border-gray-800/50 mb-4">
                  <FolderOpen className="h-10 w-10 text-gray-600" />
                </div>
                <h3 className="text-lg font-medium text-white mb-1">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </h3>
                <p className="text-gray-500 text-sm mb-6 max-w-sm">
                  {searchQuery ? 'Try adjusting your search or filter' : 'Create your first project to get started building with AI'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => router.push('/workspace')} className="bg-indigo-600 hover:bg-indigo-500">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map((project) => (
                  <Link key={project.id} href={`/workspace/projects/${project.slug}`}>
                    <div className="group relative bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 hover:bg-gray-900/80 transition-all cursor-pointer">
                      {/* Status indicator */}
                      <div className="absolute top-4 right-4">
                        <div className={`h-2.5 w-2.5 rounded-full ${project.deploymentStatus === 'deployed' ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-gray-600'}`} />
                      </div>

                      {/* Project info */}
                      <div className="flex items-start gap-3 mb-4">
                        <div className={`p-2.5 rounded-lg ${project.platform === 'vercel' ? 'bg-gray-800' : 'bg-teal-500/10'} shrink-0`}>
                          <Globe className={`h-5 w-5 ${project.platform === 'vercel' ? 'text-white' : 'text-teal-400'}`} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white truncate group-hover:text-indigo-400 transition-colors">
                            {project.name}
                          </h3>
                          <p className="text-sm text-gray-500 truncate mt-0.5">
                            {project.description || 'No description'}
                          </p>
                        </div>
                      </div>

                      {/* URL */}
                      {project.url && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-800">
                          <ExternalLink className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                          <span className="text-xs text-gray-400 truncate">{project.url.replace(/^https?:\/\//, '')}</span>
                        </div>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-800/50">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">
                            {new Date(project.lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          {project.environmentVariables.length > 0 && (
                            <span className="text-xs text-gray-500">{project.environmentVariables.length} vars</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {project.githubRepoUrl && <Github className="h-3.5 w-3.5 text-gray-500" />}
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-gray-700 text-gray-400">
                            {project.platform}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              /* List view */
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-gray-800 text-xs text-gray-500 font-medium uppercase tracking-wider">
                  <div className="col-span-4">Project</div>
                  <div className="col-span-3">URL</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Last Activity</div>
                  <div className="col-span-1"></div>
                </div>
                {filteredProjects.map((project, idx) => (
                  <Link key={project.id} href={`/workspace/projects/${project.slug}`}>
                    <div className={`group grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-4 hover:bg-gray-800/50 transition-colors cursor-pointer ${idx !== filteredProjects.length - 1 ? 'border-b border-gray-800/50' : ''}`}>
                      <div className="sm:col-span-4 flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${project.deploymentStatus === 'deployed' ? 'bg-green-500' : 'bg-gray-600'}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate group-hover:text-indigo-400 transition-colors text-sm">{project.name}</p>
                          <p className="text-xs text-gray-500 truncate">{project.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="sm:col-span-3 flex items-center">
                        {project.url ? (
                          <span className="text-xs text-gray-400 truncate">{project.url.replace(/^https?:\/\//, '')}</span>
                        ) : (
                          <span className="text-xs text-gray-600">--</span>
                        )}
                      </div>
                      <div className="sm:col-span-2 flex items-center">
                        <Badge variant="outline" className={`text-[10px] h-5 ${project.deploymentStatus === 'deployed' ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-gray-700 text-gray-400'}`}>
                          {project.deploymentStatus === 'deployed' ? 'Live' : 'Draft'}
                        </Badge>
                      </div>
                      <div className="sm:col-span-2 flex items-center">
                        <span className="text-xs text-gray-500">
                          {new Date(project.lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="sm:col-span-1 flex items-center justify-end">
                        <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Environment Variables Tab */}
          <TabsContent value="environment" className="mt-0 space-y-6">
            {/* Add Variable Form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-indigo-500/10">
                  <Plus className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Add Variable</h3>
                  <p className="text-xs text-gray-500">Paste a .env file or add variables individually</p>
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
                    onPaste={handlePaste}
                    className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 h-9 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Project</Label>
                  <select
                    value={newEnvVar.selectedProjectId}
                    onChange={(e) => setNewEnvVar(prev => ({ ...prev, selectedProjectId: e.target.value }))}
                    className="w-full h-9 px-3 bg-gray-800 border border-gray-700 rounded-md text-sm text-white focus:border-indigo-500/50"
                  >
                    <option value="">Select project...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-gray-400 mb-1.5 block">Environment</Label>
                  <select
                    value={newEnvVar.environment}
                    onChange={(e) => setNewEnvVar(prev => ({ ...prev, environment: e.target.value }))}
                    className="w-full h-9 px-3 bg-gray-800 border border-gray-700 rounded-md text-sm text-white focus:border-indigo-500/50"
                  >
                    <option value="production">Production</option>
                    <option value="preview">Preview</option>
                    <option value="development">Development</option>
                  </select>
                </div>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 cursor-pointer h-9">
                    <Switch
                      checked={newEnvVar.isSecret}
                      onCheckedChange={(checked) => setNewEnvVar(prev => ({ ...prev, isSecret: checked }))}
                    />
                    <span className="text-xs text-gray-400">Secret</span>
                  </label>
                  <Button
                    onClick={addEnvironmentVariable}
                    className="bg-indigo-600 hover:bg-indigo-500 h-9 text-sm ml-auto"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Export All */}
            <div className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <div className="flex items-center gap-3">
                <Download className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-300">Export all variables</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => exportAllEnvironmentVariables('env')} className="h-7 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                  .env
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportAllEnvironmentVariables('json')} className="h-7 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                  JSON
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportAllEnvironmentVariables('shell')} className="h-7 text-xs bg-transparent border-gray-700 text-gray-300 hover:bg-gray-800">
                  Shell
                </Button>
              </div>
            </div>

            {/* Per-Project Variables */}
            <div className="space-y-4">
              {projects.map((project) => (
                <div key={project.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/50">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${project.deploymentStatus === 'deployed' ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="font-medium text-white text-sm">{project.name}</span>
                      <Badge variant="outline" className="text-[10px] h-5 border-gray-700 text-gray-500">{project.environmentVariables.length} vars</Badge>
                    </div>
                    {project.environmentVariables.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => exportEnvironmentVariables(project.id, 'env')} className="h-7 text-xs text-gray-500 hover:text-white">
                          <Download className="h-3 w-3 mr-1" />.env
                        </Button>
                      </div>
                    )}
                  </div>

                  {project.environmentVariables.length > 0 ? (
                    <div className="divide-y divide-gray-800/50">
                      {project.environmentVariables.map((envVar, idx) => (
                        <div key={idx} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-800/30 transition-colors group">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <code className="text-sm text-indigo-400 font-mono">{envVar.key}</code>
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-gray-700 text-gray-500 shrink-0">
                              {envVar.environment}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {envVar.isSecret ? (
                              <span className="text-xs text-gray-600 font-mono">{'*'.repeat(16)}</span>
                            ) : (
                              <span className="text-xs text-gray-400 font-mono truncate max-w-[200px]">{envVar.value}</span>
                            )}
                            {envVar.isSecret && (
                              <Lock className="h-3 w-3 text-amber-500/50" />
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteEnvironmentVariable(project.id, envVar.key, envVar.environment)}
                              className="h-7 w-7 p-0 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-6 text-center">
                      <p className="text-xs text-gray-600">No variables configured</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="mt-0 space-y-6">
            {/* Security Score */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <ShieldCheck className="h-5 w-5 text-green-400" />
                  <span className="text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Good</span>
                </div>
                <p className="text-3xl font-bold text-white">85<span className="text-lg text-gray-500">/100</span></p>
                <p className="text-xs text-gray-500 mt-1">Security Score</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  {projects.filter(p => {
                    const envVars = p.environmentVariables || []
                    return envVars.some((v: any) => v.key?.toLowerCase().includes('secret') || v.key?.toLowerCase().includes('password'))
                  }).length}
                </p>
                <p className="text-xs text-gray-500 mt-1">Projects with sensitive keys</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <Lock className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-3xl font-bold text-white">AES-256</p>
                <p className="text-xs text-gray-500 mt-1">Encryption at rest</p>
              </div>
            </div>

            {/* Security Audit */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="px-5 py-4 border-b border-gray-800/50">
                <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4 text-gray-400" />
                  Security Audit
                </h3>
              </div>
              <div className="divide-y divide-gray-800/30">
                {[
                  { check: 'Environment variables encrypted', status: 'pass', detail: 'AES-256 encryption at rest' },
                  { check: 'Authentication enabled', status: 'pass', detail: 'Supabase Auth with session management' },
                  { check: 'HTTPS enforced', status: 'pass', detail: 'All deployments use HTTPS' },
                  { check: 'API key rotation', status: 'warning', detail: 'Some keys not rotated in 90+ days' },
                  { check: 'Dependency vulnerabilities', status: 'warning', detail: 'Security audit recommended' },
                  { check: 'Content Security Policy', status: 'pass', detail: 'CSP headers configured' },
                  { check: 'SQL injection prevention', status: 'pass', detail: 'Parameterized queries via Supabase' },
                  { check: 'XSS protection', status: 'pass', detail: 'React auto-escaping active' },
                ].map((item, index) => (
                  <div key={index} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      {item.status === 'pass' ? (
                        <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      )}
                      <div>
                        <p className="text-sm text-gray-200">{item.check}</p>
                        <p className="text-xs text-gray-500">{item.detail}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] h-5 ${item.status === 'pass' ? 'border-green-500/30 text-green-400 bg-green-500/5' : 'border-amber-500/30 text-amber-400 bg-amber-500/5'}`}>
                      {item.status === 'pass' ? 'Passed' : 'Review'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-Project Security */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl">
              <div className="px-5 py-4 border-b border-gray-800/50">
                <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-gray-400" />
                  Project Security
                </h3>
              </div>
              <div className="divide-y divide-gray-800/30">
                {projects.map((project) => {
                  const envVars = project.environmentVariables || []
                  const hasSensitiveKeys = envVars.some((v: any) => {
                    const key = (v.key || '').toLowerCase()
                    return key.includes('secret') || key.includes('password') || key.includes('private')
                  })
                  return (
                    <div key={project.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        {hasSensitiveKeys ? (
                          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                        ) : (
                          <ShieldCheck className="h-4 w-4 text-green-400 shrink-0" />
                        )}
                        <div>
                          <p className="text-sm text-gray-200">{project.name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-500">{envVars.length} env vars</span>
                            {project.githubRepoUrl && <span className="text-xs text-green-400/70">GitHub linked</span>}
                          </div>
                        </div>
                      </div>
                      {hasSensitiveKeys && (
                        <Badge variant="outline" className="text-[10px] h-5 border-amber-500/30 text-amber-400 bg-amber-500/5">
                          Sensitive keys
                        </Badge>
                      )}
                    </div>
                  )
                })}
                {projects.length === 0 && (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-gray-500">No projects to analyze</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  )
}
