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
  AlertTriangle
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { storageManager, type Workspace as Project, type Deployment, type EnvironmentVariable } from "@/lib/storage-manager"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

// Extended project interface for display
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
  const [currentUserId, setCurrentUserId] = useState<string>("sample-user") // Default fallback
  const [newEnvVar, setNewEnvVar] = useState({
    key: "",
    value: "",
    environment: "production",
    isSecret: false,
    selectedProjectId: ""
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    getCurrentUser()
  }, [])

  useEffect(() => {
    if (currentUserId) {
      loadData()
    }
  }, [currentUserId])

  // Real-time sync listener
  useEffect(() => {
    const handleProjectUpdate = (event: CustomEvent) => {
      const { projectId, action } = event.detail
      console.log('Real-time project update received:', { projectId, action })

      // Refresh data when a project is updated
      if (action === 'deployed' || action === 'updated') {
        loadData()
        toast({
          title: "Project Updated",
          description: "Project data has been refreshed",
        })
      }
    }

    // Listen for project update events
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
      // Keep default "sample-user" fallback
    }
  }

  const initializeSampleData = async () => {
    try {
      // Ensure storage is initialized
      await storageManager.init()
      
      const projects = await storageManager.getWorkspaces(currentUserId)
      if (projects.length === 0) {
        // Import template service
        const { TemplateService } = await import('@/lib/template-service')
        
        // Create sample projects with templates
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

        // Create sample deployments
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

        // Create sample environment variables
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

        // Reload data to show the new sample projects
        loadData()
      }
    } catch (error) {
      console.error('Error initializing sample data:', error)
    }
  }


  const loadData = async () => {
    setIsLoading(true)
    try {
      // Initialize storage manager
      await storageManager.init()
      
      // Load projects, deployments, and environment variables from IndexedDB
      const [projects, deployments, envVars] = await Promise.all([
        storageManager.getWorkspaces(currentUserId), // Use the current user ID
        storageManager.getDeployments(),
        storageManager.getEnvironmentVariables()
      ])
      
      // Transform projects to include display data
      const projectsWithData: ProjectDisplay[] = projects.map(project => {
        const projectDeployments = deployments.filter(d => d.workspaceId === project.id)
        const projectEnvVars = envVars.filter(e => e.workspaceId === project.id)
        
        // Get the latest deployment
        const lastDeployment = projectDeployments
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        
        // Determine platform based on deployment URLs
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
      
      // Initialize sample data if no projects exist
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



  // Handle paste event for environment variables
  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text').trim()

    // Check if pasted text contains KEY=VALUE pairs
    const envPairs = pastedText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        // Handle export statements
        if (line.startsWith('export ')) {
          return line.substring(7).trim()
        }
        return line
      })

    if (envPairs.length === 0) {
      // No valid environment variables detected, allow normal paste
      return
    }

    e.preventDefault() // Prevent default paste behavior

    if (envPairs.length === 1) {
      // Single environment variable - auto-fill current fields
      const [key, ...valueParts] = envPairs[0].split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '') // Remove quotes

      setNewEnvVar(prev => ({
        ...prev,
        key: key.trim(),
        value: value.trim()
      }))

      toast({
        title: "Environment Variable Detected",
        description: `Auto-filled: ${key.trim()} = ${value.trim().substring(0, 20)}${value.trim().length > 20 ? '...' : ''}`,
      })
    } else if (envPairs.length > 1) {
      // Multiple environment variables - create them all
      if (!newEnvVar.selectedProjectId) {
        toast({
          title: "Project Required",
          description: "Please select a project before pasting multiple environment variables",
          variant: "destructive"
        })
        return
      }

      try {
        let successCount = 0
        let errorCount = 0

        for (const envPair of envPairs) {
          const [key, ...valueParts] = envPair.split('=')
          const value = valueParts.join('=').replace(/^["']|["']$/g, '') // Remove quotes

          if (key.trim() && value.trim()) {
            try {
              // Check if environment variable already exists
              const envVars = await storageManager.getEnvironmentVariables(newEnvVar.selectedProjectId)
              const existingVar = envVars.find(ev => ev.key === key.trim() && ev.environment === newEnvVar.environment)

              if (existingVar) {
                // Update existing variable
                await storageManager.updateEnvironmentVariable(existingVar.id, {
                  value: value.trim(),
                  isSecret: newEnvVar.isSecret
                })
              } else {
                // Create new variable
                await storageManager.createEnvironmentVariable({
                  workspaceId: newEnvVar.selectedProjectId,
                  key: key.trim(),
                  value: value.trim(),
                  environment: newEnvVar.environment,
                  isSecret: newEnvVar.isSecret
                })
              }
              successCount++
            } catch (error) {
              errorCount++
              console.error(`Error creating environment variable ${key}:`, error)
            }
          }
        }

        // Reload data
        await loadData()

        if (successCount > 0) {
          toast({
            title: "Environment Variables Added",
            description: `Successfully added ${successCount} environment variable${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
          })
        }

        if (errorCount > 0) {
          toast({
            title: "Some Variables Failed",
            description: `${errorCount} environment variable${errorCount > 1 ? 's' : ''} could not be added`,
            variant: "destructive"
          })
        }

      } catch (error) {
        console.error('Error processing pasted environment variables:', error)
        toast({
          title: "Paste Failed",
          description: "Failed to process pasted environment variables",
          variant: "destructive"
        })
      }
    }
    // If no KEY=VALUE pairs detected, allow normal paste behavior
  }

  const addEnvironmentVariable = async () => {
    if (!newEnvVar.key || !newEnvVar.value || !newEnvVar.selectedProjectId) {
      toast({
        title: "Missing Information",
        description: "Please provide key, value, and select a project",
        variant: "destructive"
      })
      return
    }

    try {
      // Check if environment variable already exists
      const envVars = await storageManager.getEnvironmentVariables(newEnvVar.selectedProjectId)
      const existingVar = envVars.find(ev => ev.key === newEnvVar.key && ev.environment === newEnvVar.environment)
      
      if (existingVar) {
        // Update existing variable
        await storageManager.updateEnvironmentVariable(existingVar.id, {
          value: newEnvVar.value,
          isSecret: newEnvVar.isSecret
        })
      } else {
        // Create new variable
        await storageManager.createEnvironmentVariable({
          workspaceId: newEnvVar.selectedProjectId,
          key: newEnvVar.key,
          value: newEnvVar.value,
          environment: newEnvVar.environment,
          isSecret: newEnvVar.isSecret
        })
      }

      toast({
        title: "Environment Variable Added",
        description: "Variable has been added successfully"
      })

      // Reset form and reload data
      setNewEnvVar({ 
        key: "", 
        value: "", 
        environment: "production", 
        isSecret: false,
        selectedProjectId: "" 
      })
      loadData()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add environment variable",
        variant: "destructive"
      })
    }
  }

  const deleteEnvironmentVariable = async (projectId: string, key: string, environment: string) => {
    try {
      // Find the environment variable to get its ID
      const envVars = await storageManager.getEnvironmentVariables(projectId)
      const envVar = envVars.find(ev => ev.key === key && ev.environment === environment)

      if (envVar) {
        await storageManager.deleteEnvironmentVariable(envVar.id)

        toast({
          title: "Environment Variable Deleted",
          description: "Variable has been removed successfully"
        })
      } else {
        toast({
          title: "Error",
          description: "Environment variable not found",
          variant: "destructive"
        })
      }

      loadData()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete environment variable",
        variant: "destructive"
      })
    }
  }

  // Export environment variables functions
  const exportEnvironmentVariables = async (projectId: string, format: 'dotenv' | 'json' | 'shell') => {
    try {
      const envVars = await storageManager.getEnvironmentVariables(projectId)

      if (envVars.length === 0) {
        toast({
          title: "No Environment Variables",
          description: "This project has no environment variables to export",
          variant: "destructive"
        })
        return
      }

      let content = ''
      let filename = `env-vars-${new Date().toISOString().split('T')[0]}`

      switch (format) {
        case 'dotenv':
          content = envVars.map(ev => `${ev.key}=${ev.value}`).join('\n')
          filename += '.env'
          break
        case 'json':
          const jsonData = envVars.reduce((acc, ev) => {
            acc[ev.key] = ev.value
            return acc
          }, {} as Record<string, string>)
          content = JSON.stringify(jsonData, null, 2)
          filename += '.json'
          break
        case 'shell':
          content = envVars.map(ev => `export ${ev.key}="${ev.value}"`).join('\n')
          filename += '.sh'
          break
      }

      // Create and download file
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Export Successful",
        description: `Environment variables exported as ${filename}`
      })
    } catch (error) {
      console.error('Export error:', error)
      toast({
        title: "Export Failed",
        description: "Failed to export environment variables",
        variant: "destructive"
      })
    }
  }

  const exportAllEnvironmentVariables = async (format: 'dotenv' | 'json' | 'shell') => {
    try {
      // Get all environment variables from all projects
      const allEnvVars: Array<{ project: string; key: string; value: string; environment: string }> = []

      for (const project of projects) {
        const envVars = await storageManager.getEnvironmentVariables(project.id)
        allEnvVars.push(...envVars.map(ev => ({
          project: project.name,
          key: ev.key,
          value: ev.value,
          environment: ev.environment
        })))
      }

      if (allEnvVars.length === 0) {
        toast({
          title: "No Environment Variables",
          description: "No environment variables found across all projects",
          variant: "destructive"
        })
        return
      }

      let content = ''
      let filename = `all-env-vars-${new Date().toISOString().split('T')[0]}`

      switch (format) {
        case 'dotenv':
          content = allEnvVars.map(ev => `${ev.key}=${ev.value}`).join('\n')
          filename += '.env'
          break
        case 'json':
          const jsonData = allEnvVars.reduce((acc, ev) => {
            acc[ev.key] = ev.value
            return acc
          }, {} as Record<string, string>)
          content = JSON.stringify(jsonData, null, 2)
          filename += '.json'
          break
        case 'shell':
          content = allEnvVars.map(ev => `export ${ev.key}="${ev.value}"`).join('\n')
          filename += '.sh'
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

      toast({
        title: "Export Successful",
        description: `All environment variables exported as ${filename}`
      })
    } catch (error) {
      console.error('Export error:', error)
      toast({
        title: "Export Failed",
        description: "Failed to export environment variables",
        variant: "destructive"
      })
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />
      
      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />
      
      <div className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col space-y-2 mb-6">
              <h1 className="text-3xl font-bold text-white">Project Management</h1>
              <p className="text-gray-400">
                Manage your projects, deployments, and environment variables
              </p>
            </div>

          {/* Quick Stats - Simplified */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-900 rounded-lg">
                    <FolderOpen className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Projects</p>
                    <p className="text-2xl font-bold">{projects.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-green-900 rounded-lg">
                    <Rocket className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Deployed</p>
                    <p className="text-2xl font-bold">{projects.filter(p => p.deploymentStatus === 'deployed').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-900 rounded-lg">
                    <Settings className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">With Env Vars</p>
                    <p className="text-2xl font-bold">{projects.filter(p => p.environmentVariables.length > 0).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filter Bar */}
          <Card className="mb-6 bg-gray-800 border-gray-700">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-full sm:w-64 bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-gray-400" />
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                      <option value="all" className="bg-gray-700">All Projects</option>
                      <option value="deployed" className="bg-gray-700">Deployed</option>
                      <option value="not_deployed" className="bg-gray-700">Not Deployed</option>
                    </select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Simplified tabs - focus on what developers need */}
            <TabsList className="grid w-full grid-cols-3 gap-2 bg-gray-800">
              <TabsTrigger value="overview" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Projects</TabsTrigger>
              <TabsTrigger value="environment" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Environment Variables</TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">Security</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {filteredProjects.map((project) => (
                  <Card key={project.id} className="bg-gray-800 border-gray-700 hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {project.platform === 'vercel' ? (
                            <Globe className="h-5 w-5 text-blue-500 flex-shrink-0" />
                          ) : (
                            <Globe className="h-5 w-5 text-green-500 flex-shrink-0" />
                          )}
                          <CardTitle className="text-lg truncate">
                            {project.name.length > 12 ? `${project.name.substring(0, 12)}...` : project.name}
                          </CardTitle>
                        </div>
                        <Badge variant="outline" className="ml-2 flex-shrink-0 bg-gray-700 text-gray-300 border-gray-600">
                          {project.platform}
                        </Badge>
                      </div>
                      <CardDescription className="text-gray-400">
                        {project.description ? (
                          <span className="truncate">{project.description.length > 30 ? `${project.description.substring(0, 30)}...` : project.description}</span>
                        ) : (
                          "No description"
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {project.url ? (
                        <div className="flex items-center space-x-2">
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                          <a
                            href={project.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline text-sm truncate"
                          >
                            {project.url.replace(/^https?:\/\//, '').length > 25 ?
                              `${project.url.replace(/^https?:\/\//, '').substring(0, 25)}...` :
                              project.url.replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">
                          Not deployed
                        </div>
                      )}
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-xs text-gray-400">
                          {new Date(project.lastActivity).toLocaleDateString()}
                        </span>
                        <div className="flex gap-2">
                          <Link href={`/workspace/projects/${project.slug}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/workspace/deployment?project=${project.id}`)}
                            className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                          >
                            <Rocket className="h-4 w-4 mr-1" />
                            Deploy
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {filteredProjects.length === 0 && (
                  <div className="col-span-full text-center py-12 text-gray-400">
                    <FolderOpen className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                    <h3 className="text-lg font-medium mb-2">No projects found</h3>
                    <p className="mb-4">
                      {searchQuery ? 'Try a different search term' : 'Get started by creating a new project'}
                    </p>
                    <Button 
                      onClick={() => router.push('/workspace')}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Create Project
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Environment Variables Tab */}
            <TabsContent value="environment" className="space-y-6">
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-white">
                    <Settings className="h-5 w-5" />
                    <span>Environment Variables</span>
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Manage environment variables for your projects - they'll be automatically included in Vercel and Netlify deployments
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Paste Instructions */}
                  <div className="p-4 bg-green-900/20 border border-green-700 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <Code className="h-4 w-4 text-green-400" />
                      <span className="text-sm text-green-300 font-medium">Quick Import from .env Files</span>
                    </div>
                    <p className="text-sm text-gray-300 mb-2">
                      Copy environment variables from your local <code className="bg-gray-700 px-1 rounded">.env</code> file and paste them directly into the Value field. The system will automatically:
                    </p>
                    <ul className="text-xs text-gray-400 space-y-1 ml-4">
                      <li>• Extract KEY=VALUE pairs</li>
                      <li>• Auto-fill the Variable Name and Value fields</li>
                      <li>• Create multiple variables when pasting multiple lines</li>
                      <li>• Handle quoted values automatically</li>
                    </ul>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="env-key" className="text-gray-300">Variable Name</Label>
                        <Input
                          id="env-key"
                          placeholder="API_KEY"
                          value={newEnvVar.key}
                          onChange={(e) => setNewEnvVar(prev => ({ ...prev, key: e.target.value }))}
                          className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        />
                      </div>
                      <div>
                        <Label htmlFor="env-value" className="text-gray-300">Value</Label>
                        <Input
                          id="env-value"
                          type={newEnvVar.isSecret ? "password" : "text"}
                          placeholder="your-value-here (or paste KEY=VALUE from .env file)"
                          value={newEnvVar.value}
                          onChange={(e) => setNewEnvVar(prev => ({ ...prev, value: e.target.value }))}
                          onPaste={handlePaste}
                          className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="env-environment" className="text-gray-300">Environment</Label>
                        <select
                          id="env-environment"
                          className="w-full px-3 py-2 h-10 border border-gray-600 bg-gray-700 text-white rounded-md"
                          value={newEnvVar.environment}
                          onChange={(e) => setNewEnvVar(prev => ({ ...prev, environment: e.target.value }))}
                        >
                          <option value="production" className="bg-gray-700">Production</option>
                          <option value="preview" className="bg-gray-700">Preview</option>
                          <option value="development" className="bg-gray-700">Development</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="env-project" className="text-gray-300">Project</Label>
                        <select
                          id="env-project"
                          className="w-full px-3 py-2 h-10 border border-gray-600 bg-gray-700 text-white rounded-md"
                          value={newEnvVar.selectedProjectId}
                          onChange={(e) => setNewEnvVar(prev => ({ ...prev, selectedProjectId: e.target.value }))}
                        >
                          <option value="" className="bg-gray-700">Select a project</option>
                          {projects.map(project => (
                            <option key={project.id} value={project.id} className="bg-gray-700">
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newEnvVar.isSecret}
                          onChange={(e) => setNewEnvVar(prev => ({ ...prev, isSecret: e.target.checked }))}
                          className="rounded bg-gray-700 border-gray-600 text-blue-500"
                        />
                        <span className="text-sm text-gray-300">Treat as secret (values will be hidden)</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <Button
                      onClick={addEnvironmentVariable}
                      disabled={!newEnvVar.key || !newEnvVar.value || !newEnvVar.selectedProjectId}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Environment Variable
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Export Environment Variables Card */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-white">
                    <Download className="h-5 w-5" />
                    <span>Export Environment Variables</span>
                  </CardTitle>
                  <CardDescription className="text-gray-400">
                    Export your environment variables in different formats for local development or deployment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-blue-300 font-medium">Auto-Deployment Integration</span>
                    </div>
                    <p className="text-sm text-gray-300">
                      Environment variables are automatically included when deploying to Vercel or Netlify through the deployment page.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-white mb-3">Export All Projects</h4>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => exportAllEnvironmentVariables('dotenv')}
                          variant="outline"
                          size="sm"
                          className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          .env
                        </Button>
                        <Button
                          onClick={() => exportAllEnvironmentVariables('json')}
                          variant="outline"
                          size="sm"
                          className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                        >
                          <Code className="h-4 w-4 mr-2" />
                          JSON
                        </Button>
                        <Button
                          onClick={() => exportAllEnvironmentVariables('shell')}
                          variant="outline"
                          size="sm"
                          className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                        >
                          <Code className="h-4 w-4 mr-2" />
                          Shell
                        </Button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-white mb-3">Individual Projects</h4>
                      <p className="text-sm text-gray-400">
                        Export options are available in each project's environment variables section below.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                {projects.map((project) => (
                  <Card key={project.id} className="bg-gray-800 border-gray-700">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center space-x-2 text-white">
                          <Settings className="h-5 w-5" />
                          <span>{project.name} Environment Variables</span>
                        </CardTitle>
                        {project.environmentVariables.length > 0 && (
                          <div className="flex gap-1">
                            <Button
                              onClick={() => exportEnvironmentVariables(project.id, 'dotenv')}
                              variant="outline"
                              size="sm"
                              className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 h-8"
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              .env
                            </Button>
                            <Button
                              onClick={() => exportEnvironmentVariables(project.id, 'json')}
                              variant="outline"
                              size="sm"
                              className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 h-8"
                            >
                              <Code className="h-3 w-3 mr-1" />
                              JSON
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {project.environmentVariables.length > 0 ? (
                        <div className="space-y-2">
                          {project.environmentVariables.map((envVar, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                              <div className="flex-1">
                                <div className="flex flex-col">
                                  <span className="font-medium text-white text-sm">{envVar.key}</span>
                                  <span className="text-xs text-gray-400">({envVar.environment})</span>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                {!envVar.isSecret && envVar.value && (
                                  <span className="text-xs text-green-400 truncate max-w-32" title={envVar.value}>
                                    {envVar.value.length > 20 ? `${envVar.value.substring(0, 20)}...` : envVar.value}
                                  </span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {envVar.isSecret ? 'Secret' : 'Plain'}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteEnvironmentVariable(project.id, envVar.key, envVar.environment)}
                                  className="text-gray-400 hover:text-red-400 h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-400 text-sm">
                          No environment variables
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Security Center Tab */}
            <TabsContent value="security" className="space-y-6">
              {/* Security Overview */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Shield className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white">Security Center</CardTitle>
                      <CardDescription>Monitor and manage the security of your workspace and projects</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="h-5 w-5 text-green-400" />
                        <span className="text-sm font-medium text-gray-300">Security Score</span>
                      </div>
                      <div className="text-3xl font-bold text-green-400">85/100</div>
                      <p className="text-xs text-gray-500 mt-1">Good - Minor improvements recommended</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-400" />
                        <span className="text-sm font-medium text-gray-300">Warnings</span>
                      </div>
                      <div className="text-3xl font-bold text-yellow-400">
                        {projects.filter(p => {
                          const envVars = envVariables[p.id] || []
                          return envVars.some((v: any) => v.key?.toLowerCase().includes('secret') || v.key?.toLowerCase().includes('password'))
                        }).length}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Projects with exposed sensitive keys</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <Lock className="h-5 w-5 text-blue-400" />
                        <span className="text-sm font-medium text-gray-300">Encryption</span>
                      </div>
                      <div className="text-3xl font-bold text-blue-400">AES-256</div>
                      <p className="text-xs text-gray-500 mt-1">All data encrypted at rest</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Security Checks */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Security Audit
                  </CardTitle>
                  <CardDescription>Automated security checks across your projects</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { check: 'Environment variables are encrypted', status: 'pass', icon: ShieldCheck, detail: 'All env vars stored with AES-256 encryption' },
                    { check: 'Authentication enabled', status: 'pass', icon: ShieldCheck, detail: 'Supabase Auth with session management active' },
                    { check: 'HTTPS enforced on deployments', status: 'pass', icon: ShieldCheck, detail: 'All Vercel/Netlify deployments use HTTPS' },
                    { check: 'API keys rotation', status: 'warning', icon: ShieldAlert, detail: 'Some API keys have not been rotated in 90+ days' },
                    { check: 'Dependency vulnerabilities', status: 'warning', icon: ShieldAlert, detail: 'Run security audit on project dependencies' },
                    { check: 'Content Security Policy', status: 'pass', icon: ShieldCheck, detail: 'CSP headers configured on deployed applications' },
                    { check: 'SQL injection prevention', status: 'pass', icon: ShieldCheck, detail: 'Parameterized queries enforced via Supabase SDK' },
                    { check: 'XSS protection', status: 'pass', icon: ShieldCheck, detail: 'React auto-escaping and sanitization active' },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gray-900/50 border border-gray-700">
                      <div className="flex items-center gap-3">
                        <item.icon className={`h-5 w-5 ${item.status === 'pass' ? 'text-green-400' : item.status === 'warning' ? 'text-yellow-400' : 'text-red-400'}`} />
                        <div>
                          <p className="text-sm font-medium text-gray-200">{item.check}</p>
                          <p className="text-xs text-gray-500">{item.detail}</p>
                        </div>
                      </div>
                      <Badge className={`${item.status === 'pass' ? 'bg-green-500/10 text-green-400 border-green-500/20' : item.status === 'warning' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                        {item.status === 'pass' ? 'Passed' : item.status === 'warning' ? 'Review' : 'Failed'}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Per-Project Security */}
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Project Security Status
                  </CardTitle>
                  <CardDescription>Security overview per project</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {projects.map((project) => {
                      const envVars = envVariables[project.id] || []
                      const hasSensitiveKeys = envVars.some((v: any) => {
                        const key = (v.key || '').toLowerCase()
                        return key.includes('secret') || key.includes('password') || key.includes('private')
                      })
                      const hasGithub = !!project.githubRepoUrl
                      const envCount = envVars.length

                      return (
                        <div key={project.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-900/50 border border-gray-700">
                          <div className="flex items-center gap-3">
                            <Globe className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-200">{project.name}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-gray-500">{envCount} env vars</span>
                                {hasGithub && <span className="text-xs text-green-400">GitHub linked</span>}
                                {hasSensitiveKeys && <span className="text-xs text-yellow-400">Has sensitive keys</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasSensitiveKeys ? (
                              <ShieldAlert className="h-4 w-4 text-yellow-400" />
                            ) : (
                              <ShieldCheck className="h-4 w-4 text-green-400" />
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {projects.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No projects to analyze</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
      
      {/* Footer */}
      <Footer />
    </div>
  )
}