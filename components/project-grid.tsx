"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Trash2, Upload, Share2, Copy } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { storageManager, Workspace } from "@/lib/storage-manager"
import { timeAgo } from "@/lib/utils"
import { PublishTemplateDialog } from "./workspace/publish-template-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

interface Project {
  id: string
  name: string
  thumbnail: string
  description: string
  category: string
  createdAt: string
}

interface ProjectGridProps {
  filterBy?: 'all' | 'recent' | 'week' | 'month'
  sortBy?: 'name' | 'date' | 'activity'
  sortOrder?: 'asc' | 'desc'
  userProfile?: { full_name?: string } | null
}

// Helper function to generate thumbnail URLs
const generateThumbnailUrl = (projectName: string, description: string, seed: string) => {
  // Create a descriptive prompt based on project name and description
  const prompt = `${projectName}: ${description}. Modern web application interface, clean design, professional UI, technology focused`
  return `https://api.a0.dev/assets/image?text=${encodeURIComponent(prompt)}&aspect=16:9&seed=${seed}`
}

export function ProjectGrid({ filterBy = 'all', sortBy = 'activity', sortOrder = 'desc', userProfile = null }: ProjectGridProps = {}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 6
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [projectToPublish, setProjectToPublish] = useState<Project | null>(null)
  const [publishName, setPublishName] = useState('')
  const [publishDescription, setPublishDescription] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishPreviewUrl, setPublishPreviewUrl] = useState('')
  const [publishThumbnailUrl, setPublishThumbnailUrl] = useState('')
  const [publishCategory, setPublishCategory] = useState('')
  const [templateType, setTemplateType] = useState<'free' | 'paid'>('free')
  const [templatePrice, setTemplatePrice] = useState('')
  const [cloneProject, setCloneProject] = useState<Project | null>(null)
  const [cloneName, setCloneName] = useState('')

  // Get current user on component mount
  useEffect(() => {
    const getCurrentUser = async () => {
      const supabase = createClient()
      const { data: { user }, error } = await supabase.auth.getUser()
      
      if (error) {
        console.error('Error getting current user:', error)
        return
      }
      
      setUser(user)
    }

    getCurrentUser()
  }, [])

  // Helper function to format user's name with possessive
  const getUserProjectsTitle = () => {
    if (userProfile?.full_name) {
      const fullName = userProfile.full_name.trim()
      // Get just the first word (first name)
      const firstName = fullName.split(' ')[0]
      // Handle names ending with s, x, z, etc. (add ' instead of 's)
      if (firstName.toLowerCase().endsWith('s') || firstName.toLowerCase().endsWith('x') || firstName.toLowerCase().endsWith('z')) {
        return `${firstName}' Projects`
      }
      return `${firstName}'s Projects`
    }
    return "Your Projects"
  }

  const handleDeleteProject = async (projectId: string, event: React.MouseEvent) => {
    event.preventDefault() // Prevent navigation to project
    event.stopPropagation() // Prevent event bubbling

    // Find the project to delete
    const project = projects.find(p => p.id === projectId)
    if (project) {
      setProjectToDelete(project)
      setDeleteDialogOpen(true)
    }
  }

  const handlePublishTemplate = async (projectId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const project = projects.find(p => p.id === projectId)
    if (project) {
      setProjectToPublish(project)
      setPublishName(project.name)
      setPublishDescription(project.description)
      setPublishPreviewUrl('')
      setPublishThumbnailUrl('')
      setPublishCategory(project.category || 'other')
      setTemplateType('free')
      setTemplatePrice('')
      setPublishDialogOpen(true)
    }
  }

  const confirmDeleteProject = async () => {
    if (!projectToDelete || !user) return

    try {
      // Delete the project from storage
      await storageManager.deleteWorkspace(projectToDelete.id)

      // Remove from local state
      setProjects(prev => prev.filter(p => p.id !== projectToDelete.id))

      // Adjust current page if necessary
      const remainingProjects = projects.filter(p => p.id !== projectToDelete.id)
      const maxPage = Math.ceil(remainingProjects.length / itemsPerPage)
      if (currentPage > maxPage && maxPage > 0) {
        setCurrentPage(maxPage)
      }
    } catch (error) {
      console.error("Error deleting project:", error)
      // You could add a toast notification here
    } finally {
      setDeleteDialogOpen(false)
      setProjectToDelete(null)
    }
  }

  const confirmPublishTemplate = async () => {
    if (!projectToPublish || !user) {
      alert('You must be signed in to publish templates.')
      return
    }
    
    // Validate price for paid templates
    if (templateType === 'paid') {
      const price = parseFloat(templatePrice)
      if (isNaN(price) || price < 0.99 || price > 999.99) {
        alert('Please enter a valid price between $0.99 and $999.99')
        return
      }
    }

    setIsPublishing(true)

    try {
      const supabase = createClient()

      // Get user's profile name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

      // Get project files - use same pattern as file explorer
      console.log(`📂 Template Publisher: Fetching files for project: ${projectToPublish.id} (${projectToPublish.name}) - Timestamp: ${new Date().toISOString()}`);

      // Import and initialize storage manager (same as file explorer)
      const { storageManager } = await import('@/lib/storage-manager');
      await storageManager.init();

      // Get files directly from IndexedDB (same as file explorer)
      const files = await storageManager.getFiles(projectToPublish.id);
      console.log(`✅ Template Publisher: Found ${files.length} files for project: ${projectToPublish.id}`);

      // Verify all files belong to correct workspace (same validation as file explorer)
      const incorrectFiles = files.filter(f => f.workspaceId !== projectToPublish.id);
      if (incorrectFiles.length > 0) {
        console.error(`🚨 CONTAMINATION DETECTED in Template Publisher: ${incorrectFiles.length} files belong to wrong workspace!`, incorrectFiles.map(f => ({ name: f.name, path: f.path, actualWorkspaceId: f.workspaceId, expectedWorkspaceId: projectToPublish.id })));
      } else {
        console.log(`✅ All ${files.length} files verified to belong to workspace: ${projectToPublish.id}`);
      }

      if (files.length === 0) {
        console.log('⚠️ Template Publisher: No files found for project, cannot publish empty template')
        alert('Cannot publish template: No files found in the project. Please add some files first.')
        return
      } else {
        console.log('📄 Template Publisher: Sample files:', files.slice(0, 5).map(f => ({ name: f.name, path: f.path, workspaceId: f.workspaceId, contentLength: f.content?.length })))
      }

      // Filter out large binary files that would make the JSON too big
      const MAX_FILE_SIZE = 50 * 1024 // 50KB per file
      const BINARY_EXTENSIONS = ['.woff', '.woff2', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.mp4', '.mp3', '.wav', '.pdf']

      let filteredFiles = files.filter(file => {
        const isBinary = BINARY_EXTENSIONS.some(ext => file.path.toLowerCase().endsWith(ext))
        const isTooLarge = file.content.length > MAX_FILE_SIZE

        if (isBinary || isTooLarge) {
          console.warn(`Excluding file from template: ${file.path} (${isBinary ? 'binary' : 'large'} file, ${file.content.length} bytes)`)
          return false
        }
        return true
      })

      console.log(`Filtered ${files.length - filteredFiles.length} large/binary files, keeping ${filteredFiles.length} files`)

      // If we filtered too many files, warn the user
      if (filteredFiles.length < files.length * 0.5) {
        alert(`Warning: ${files.length - filteredFiles.length} large or binary files were excluded from the template. Only ${filteredFiles.length} files will be included.`)
      }

      // Prepare files for JSONB storage
      const filesData = filteredFiles.map(file => ({
        name: file.name,
        content: file.content, // Already validated as string
        path: file.path,
        type: file.fileType || file.type || 'unknown' // Use fileType first, fallback to type
      }))

      // Validate that the JSON can be serialized
      let serializedFilesData: string
      try {
        serializedFilesData = JSON.stringify(filesData)
        // Test that it can be parsed back
        JSON.parse(serializedFilesData)
      } catch (jsonError) {
        console.error('JSON serialization error:', jsonError, { filesData })
        alert('Cannot publish template: File data cannot be properly serialized.')
        return
      }

      // Check if the data is too large for Supabase (limit is around 1MB for REST API)
      const dataSizeMB = serializedFilesData.length / (1024 * 1024)
      if (dataSizeMB > 1) {
        console.warn(`Template data is ${dataSizeMB.toFixed(2)}MB, which exceeds Supabase's 1MB limit for JSONB columns`)
        alert(`Cannot publish template: File data is too large (${dataSizeMB.toFixed(2)}MB) even after filtering. Consider creating a smaller template with fewer files.`)
        return
      }

      // Create template data object
      const templateJsonData = {
        name: publishName,
        description: publishDescription,
        files: filesData,
        metadata: {
          totalFiles: filteredFiles.length,
          createdAt: new Date().toISOString(),
          version: '1.0'
        }
      }

      // Convert to JSON string
      const jsonContent = JSON.stringify(templateJsonData, null, 2)
      const jsonBlob = new Blob([jsonContent], { type: 'application/json' })

      // Create unique filename for the template
      const templateFileName = `template-${projectToPublish.id}-${Date.now()}.json`

      // Upload to Supabase Storage
      console.log('Uploading template to Supabase Storage...')
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('templates')
        .upload(templateFileName, jsonBlob, {
          contentType: 'application/json',
          upsert: false
        })

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
        alert('Failed to upload template files to storage. Please try again.')
        return
      }

      // Get the public URL for the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from('templates')
        .getPublicUrl(templateFileName)

      // Determine thumbnail URL: use custom if provided, otherwise auto-generate
      let finalThumbnailUrl: string
      if (publishThumbnailUrl.trim()) {
        // Use custom thumbnail URL
        finalThumbnailUrl = publishThumbnailUrl.trim()
      } else {
        // Auto-generate thumbnail using AI image API
        finalThumbnailUrl = generateThumbnailUrl(
          publishName,
          publishDescription || 'Template project',
          projectToPublish.id
        )
      }

      // Insert into public_templates table with storage URL
      const { data: insertedTemplate, error: templateError } = await supabase
        .from('public_templates')
        .insert({
          user_id: user.id,
          name: publishName,
          description: publishDescription,
          thumbnail_url: finalThumbnailUrl,
          author_name: profile?.full_name || null,
          files: {
            storageUrl: publicUrl,
            fileCount: filteredFiles.length,
            totalSize: jsonContent.length,
            uploadedAt: new Date().toISOString()
          }, // Store metadata instead of raw files
          usage_count: 0,
          preview_url: publishPreviewUrl || null
        })
        .select('id')
        .single()

      if (templateError) throw templateError

      // Create pricing entry
      const price = templateType === 'paid' ? parseFloat(templatePrice) : 0
      const { error: pricingError } = await supabase
        .from('template_pricing')
        .insert({
          template_id: insertedTemplate.id,
          price: price,
          currency: 'USD',
          pricing_type: templateType === 'paid' ? 'one-time' : 'freemium',
          is_paid: templateType === 'paid'
        })

      if (pricingError) throw pricingError

      // Create metadata entry with category
      const { error: metadataError } = await supabase
        .from('template_metadata')
        .insert({
          template_id: insertedTemplate.id,
          category: publishCategory || 'other',
          tags: [],
          total_sales: 0,
          total_revenue: 0,
          total_downloads: 0,
          rating: 0,
          review_count: 0,
          is_featured: false,
          is_verified: false,
          marketplace_visible: true
        })

      if (metadataError) throw metadataError

      alert(`Template published successfully${templateType === 'paid' ? ` - Price: $${price.toFixed(2)}` : ' (Free)'}!`)
    } catch (error) {
      console.error('Error publishing template:', error)
      alert('Failed to publish template. Please try again.')
    } finally {
      setIsPublishing(false)
      setPublishDialogOpen(false)
      setProjectToPublish(null)
      setPublishName('')
      setPublishDescription('')
      setPublishPreviewUrl('')
      setPublishCategory('')
      setTemplateType('free')
      setTemplatePrice('')
    }
  }

  const handleCloneProject = async (projectId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const project = projects.find(p => p.id === projectId)
    if (project) {
      setCloneProject(project)
      setCloneName(`${project.name} Copy`)
    }
  }

  const confirmCloneProject = async () => {
    if (!cloneProject || !cloneName.trim() || !user) return

    try {
      await storageManager.init()

      // Create new project
      const slug = cloneName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const newProject = await storageManager.createWorkspace({
        name: cloneName.trim(),
        description: `Cloned from ${cloneProject.name}`,
        slug,
        userId: user.id,
        isPublic: false,
        isTemplate: false,
        lastActivity: new Date().toISOString(),
        deploymentStatus: 'not_deployed'
      })

      // Copy all files from original project
      const originalFiles = await storageManager.getFiles(cloneProject.id)
      for (const file of originalFiles) {
        await storageManager.createFile({
          workspaceId: newProject.id,
          name: file.name,
          path: file.path,
          content: file.content,
          fileType: file.fileType,
          type: file.type,
          size: file.size,
          isDirectory: file.isDirectory
        })
      }

      // Add the new project to the local state
      // Convert Workspace to Project format
      const newProjectData: Project = {
        id: newProject.id,
        name: newProject.name,
        thumbnail: generateThumbnailUrl(newProject.name, newProject.description || 'Cloned project', newProject.id),
        description: newProject.description || 'Cloned project',
        category: 'Cloned',
        createdAt: newProject.createdAt
      }
      setProjects(prev => [newProjectData, ...prev])

      setCloneProject(null)
      setCloneName('')
    } catch (error) {
      console.error('Error cloning project:', error)
      alert('Failed to clone project. Please try again.')
    }
  }

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        // Get current user
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)

        if (!user) {
          setLoading(false)
          return
        }

        // Initialize storage manager and fetch workspaces
        await storageManager.init()
        const workspaces = await storageManager.getWorkspaces(user.id)

        // Convert workspaces to Project format
        let projectData: Project[] = workspaces
          .filter(workspace => !workspace.isTemplate) // Only show user projects, not templates
          .map((workspace: Workspace) => {
            const seed = workspace.id.slice(-3) // Use last 3 chars of ID as seed for consistency
            const thumbnailUrl = generateThumbnailUrl(
              workspace.name,
              workspace.description || "A project created with PiPilot",
              seed
            )

            return {
              id: workspace.id,
              name: workspace.name,
              thumbnail: thumbnailUrl,
              description: workspace.description || "A project created with PiPilot",
              category: workspace.isPublic ? "Public" : "Private",
              createdAt: workspace.createdAt
            }
          })

        // Apply filtering
        if (filterBy !== 'all') {
          const now = new Date()
          const filterDate = new Date()

          switch (filterBy) {
            case 'recent':
              filterDate.setHours(now.getHours() - 24) // Last 24 hours
              break
            case 'week':
              filterDate.setDate(now.getDate() - 7) // Last 7 days
              break
            case 'month':
              filterDate.setMonth(now.getMonth() - 1) // Last 30 days
              break
          }

          projectData = projectData.filter(project =>
            new Date(project.createdAt) >= filterDate
          )
        }

        // Apply sorting
        projectData.sort((a, b) => {
          let aValue: string | Date
          let bValue: string | Date

          switch (sortBy) {
            case 'name':
              aValue = a.name.toLowerCase()
              bValue = b.name.toLowerCase()
              break
            case 'date':
              aValue = new Date(a.createdAt)
              bValue = new Date(b.createdAt)
              break
            case 'activity':
            default:
              aValue = new Date(a.createdAt) // Using createdAt as activity for now
              bValue = new Date(b.createdAt)
              break
          }

          if (sortOrder === 'asc') {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
          } else {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
          }
        })

        setProjects(projectData)
        setCurrentPage(1)
      } catch (error) {
        console.error("Error fetching projects:", error)
        // Fallback to sample data if there's an error
        setProjects([
          {
            id: "sample-1",
            name: "E-commerce Dashboard",
            thumbnail: generateThumbnailUrl("E-commerce Dashboard", "Modern dashboard for managing online store with real-time analytics", "123"),
            description: "Modern dashboard for managing online store with real-time analytics",
            category: "Business",
            createdAt: new Date().toISOString()
          },
          {
            id: "sample-2",
            name: "Task Management App",
            thumbnail: generateThumbnailUrl("Task Management App", "Collaborative project management tool with real-time updates", "456"),
            description: "Collaborative project management tool with real-time updates",
            category: "Productivity",
            createdAt: new Date().toISOString()
          },
          {
            id: "sample-3",
            name: "Portfolio Website",
            thumbnail: generateThumbnailUrl("Portfolio Website", "Personal portfolio with modern design and smooth animations", "789"),
            description: "Personal portfolio with modern design and smooth animations",
            category: "Personal",
            createdAt: new Date().toISOString()
          }
        ])
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [filterBy, sortBy, sortOrder])

  if (loading) {
    return (
      <section className="w-full max-w-7xl mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white mb-4">
            Featured Projects
          </h2>
          <p className="text-white/70 text-lg">
            Loading your projects...
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="bg-white/5 border-white/10 animate-pulse">
              <div className="aspect-video bg-white/10 rounded-t-lg"></div>
              <CardContent className="p-4">
                <div className="h-4 bg-white/10 rounded mb-2"></div>
                <div className="h-3 bg-white/10 rounded mb-1"></div>
                <div className="h-3 bg-white/10 rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="w-full max-w-7xl mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white mb-4">
            {getUserProjectsTitle()}
          </h2>
          <p className="text-white/70 text-lg mb-8">
            Sign in to view and manage your projects
          </p>
          <Link
            href="/auth/login"
            className="inline-flex items-center px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors duration-200"
          >
            Sign In to Continue
          </Link>
        </div>
      </section>
    )
  }

  if (projects.length === 0) {
    return (
      <section className="w-full max-w-7xl mx-auto px-4 py-6">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white mb-4">
            {getUserProjectsTitle()}
          </h2>
          <p className="text-white/70 text-lg">
            No projects yet. Start building something amazing!
          </p>
          <Link
            href="/pc-workspace"
            className="inline-flex items-center px-6 py-3 mt-4 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors duration-200"
          >
            Create Your First Project
          </Link>
        </div>
      </section>
    )
  }

  const totalPages = Math.ceil(projects.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const displayedProjects = projects.slice(startIndex, startIndex + itemsPerPage)

  return (
    <section className="w-full max-w-7xl mx-auto px-4 py-6">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-white mb-4">
          {getUserProjectsTitle()}
        </h2>
        <p className="text-white/70 text-lg">
          Continue working on your amazing projects
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedProjects.map((project) => (
          <div key={project.id} className="relative group">
            <Link href={`/workspace?projectId=${project.id}`} className="group">
              <Card className="bg-white/5 border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl cursor-pointer overflow-hidden">
                <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-orange-950/30 via-gray-900/50 to-gray-950/50">
                  <Image
                    src={project.thumbnail}
                    alt={project.name}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <div className="absolute top-3 right-3">
                    <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-gray-900 border-white/30 font-medium shadow-lg">
                      {project.category}
                    </Badge>
                  </div>
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                    <div className="p-2 bg-orange-600 rounded-full shadow-lg">
                      <ExternalLink className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
                <CardContent className="p-5 bg-gradient-to-b from-white/5 to-transparent">
                  <h3 className="text-white font-bold text-lg mb-2 group-hover:text-orange-400 transition-colors line-clamp-1">
                    {project.name}
                  </h3>
                  <p className="text-white/60 text-sm line-clamp-2 mb-3">
                    {project.description}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div className="text-xs text-white/50 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {timeAgo(project.createdAt)}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs text-orange-400 font-medium">Open →</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <button
              onClick={(e) => handleDeleteProject(project.id, e)}
              className="absolute top-3 left-3 p-2 bg-red-500/90 hover:bg-red-600 backdrop-blur-sm text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-10 shadow-lg hover:scale-110"
              title="Delete project"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => handleCloneProject(project.id, e)}
              className="absolute top-3 left-16 p-2 bg-orange-500/90 hover:bg-orange-600 backdrop-blur-sm text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-10 shadow-lg hover:scale-110"
              title="Clone project"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => handlePublishTemplate(project.id, e)}
              className="absolute top-3 left-24 p-2 bg-green-500/90 hover:bg-green-600 backdrop-blur-sm text-white rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-10 shadow-lg hover:scale-110"
              title="Publish as template"
            >
              <Upload className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    onClick={() => setCurrentPage(page)}
                    isActive={currentPage === page}
                    className="cursor-pointer"
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        project={projectToDelete}
        onConfirm={confirmDeleteProject}
      />

      {/* Publish Template Dialog */}
      <PublishTemplateDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        project={projectToPublish}
        name={publishName}
        description={publishDescription}
        previewUrl={publishPreviewUrl}
        thumbnailUrl={publishThumbnailUrl}
        category={publishCategory}
        templateType={templateType}
        templatePrice={templatePrice}
        onNameChange={setPublishName}
        onDescriptionChange={setPublishDescription}
        onPreviewUrlChange={setPublishPreviewUrl}
        onThumbnailUrlChange={setPublishThumbnailUrl}
        onCategoryChange={setPublishCategory}
        onTemplateTypeChange={setTemplateType}
        onTemplatePriceChange={setTemplatePrice}
        onConfirm={confirmPublishTemplate}
        isPublishing={isPublishing}
      />

      {/* Clone Project Dialog */}
      <Dialog open={!!cloneProject} onOpenChange={(open) => {
        if (!open) {
          setCloneProject(null)
          setCloneName('')
        }
      }}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-orange-400">Clone Project</DialogTitle>
            <DialogDescription className="text-gray-300">
              Create a copy of <span className="font-semibold text-white">"{cloneProject?.name}"</span> with all its files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="clone-name" className="text-gray-200">New Project Name</Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                placeholder="Enter name for cloned project"
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-400"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCloneProject(null)
                setCloneName('')
              }}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmCloneProject}
              disabled={!cloneName.trim()}
              className="bg-orange-600 hover:bg-orange-500"
            >
              Clone Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// Confirmation Dialog for Project Deletion
function DeleteConfirmationDialog({ 
  open, 
  onOpenChange, 
  project, 
  onConfirm 
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project | null
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-red-400">Delete Project</DialogTitle>
          <DialogDescription className="text-gray-300">
            Are you sure you want to delete <span className="font-semibold text-white">"{project?.name}"</span>? 
            This action cannot be undone and will permanently remove the project and all its data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
          >
            Delete Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
