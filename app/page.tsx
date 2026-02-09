"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Plus,
  Image as ImageIcon,
  Gift,
  Bell,
  Eye,
  Heart,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Users,
  Download,
  Database,
  Building2,
  Server,
  Workflow,
  Figma,
  Wand2,
  MousePointer2,
  Gamepad2
} from "lucide-react"
import Link from "next/link"
import { ChatInput } from "@/components/chat-input"
import { AuthModal } from "@/components/auth-modal"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import FeatureShowcase from "@/components/FeatureShowcase"
import { PWAInstallPrompt } from "@/components/pwa-install-prompt"
import { PWAUpdatePrompt } from "@/components/pwa-update-prompt"
import { OfflineIndicator } from "@/components/offline-indicator"
import { ProjectGrid } from "@/components/project-grid"

import { createClient } from "@/lib/supabase/client"
import { TemplateManager } from "@/lib/template-manager"
import { toast } from "sonner"
import { storageManager } from "@/lib/storage-manager"
import { TemplatesView } from "@/components/workspace/templates-view"

export default function LandingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<{ full_name?: string } | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [templates, setTemplates] = useState<any[]>([])
  const [sortBy, setSortBy] = useState<string>('popular')
  const [filterBy, setFilterBy] = useState<string>('all')
  const [currentBadgeIndex, setCurrentBadgeIndex] = useState(0)
  const [currentButtonIndex, setCurrentButtonIndex] = useState(0)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [currentTemplatePage, setCurrentTemplatePage] = useState(1)
  const templatesPerPage = 8

  const badgeItems = [
    { icon: <Gamepad2 className="w-4 h-4 text-emerald-400" />, text: "PiPilot Game Kit Now Available! 🎮" },
    { icon: <Wand2 className="w-4 h-4 text-cyan-400" />, text: "Visual Editor Now Live! 🎨" },
    { icon: <Database className="w-4 h-4 text-blue-400" />, text: "Introducing PiPilot DB 🎉" },
    { icon: <Building2 className="w-4 h-4 text-purple-400" />, text: "PiPilot Enterprise now live 🚀" },
    { icon: <Users className="w-4 h-4 text-green-400" />, text: "PiPilot Teams Coming soon 🎉" },
    { icon: <Server className="w-4 h-4 text-orange-400" />, text: "PiPilot DB MCP Server Now Live! 🚀" },
    { icon: <Workflow className="w-4 h-4 text-indigo-400" />, text: "Teams Workspace Coming soon 🎉" },
    { icon: <Figma className="w-4 h-4 text-pink-400" />, text: "Figma Import Coming soon 🚀" }
  ]

  const buttonItems = [
    {
      icon: <Wand2 className="w-4 h-4 text-white" />,
      title: "Create apps and websites by chatting with AI",
      subtitle: "Start Building",
      action: "chat"
    },
    {
      icon: <Gamepad2 className="w-4 h-4 text-white" />,
      title: "PiPilot Game Kit",
      subtitle: "Explore Templates",
      action: "templates"
    }
  ]

  useEffect(() => {
    checkUser()
    loadTemplates()

    // Badge rotation effect
    const badgeInterval = setInterval(() => {
      setCurrentBadgeIndex((prev) => (prev + 1) % badgeItems.length)
    }, 5000) // Change every 3 seconds

    // Button rotation effect
    const buttonInterval = setInterval(() => {
      setCurrentButtonIndex((prev) => (prev + 1) % buttonItems.length)
    }, 8000) // Change every 8 seconds

    return () => {
      clearInterval(badgeInterval)
      clearInterval(buttonInterval)
    }
  }, [])

  const handleDynamicButtonClick = () => {
    const currentButton = buttonItems[currentButtonIndex]
    
    if (currentButton.action === 'templates') {
      // Scroll to template library section
      const templateSection = document.getElementById('template-library')
      if (templateSection) {
        templateSection.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        })
      }
    } else if (currentButton.action === 'chat') {
      // Focus on chat input
      const chatInput = document.querySelector('textarea[placeholder*="Describe your app"]') as HTMLTextAreaElement
      if (chatInput) {
        chatInput.focus()
        chatInput.scrollIntoView({ 
          behavior: 'smooth',
          block: 'center'
        })
      }
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.relative.group')) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  const loadTemplates = async () => {
    try {
      // Get static templates from TemplateManager
      const staticTemplates = TemplateManager.getAllTemplates()
      
      // Get public templates from Supabase
      const supabase = createClient()
      const { data: publicTemplates, error } = await supabase
        .from('public_templates')
        .select('*')
        .order('usage_count', { ascending: false })
      
      if (error) {
        console.error('Error fetching public templates:', error)
        setTemplates(staticTemplates)
        return
      }
      
      // Transform public templates to match the existing template format
      const transformedPublicTemplates = (publicTemplates || []).map(template => ({
        id: `public-${template.id}`,
        title: template.name,
        description: template.description || 'A community template',
        thumbnailUrl: template.thumbnail_url || 'https://via.placeholder.com/400x300?text=Template',
        category: 'Community',
        remixes: template.usage_count || 0,
        author: template.author_name || 'Anonymous',
        files: template.files,
        isPublicTemplate: true,
        publicTemplateId: template.id
      }))
      
      // Combine both template sources
      const allTemplates = [...staticTemplates, ...transformedPublicTemplates]
      setTemplates(allTemplates)
    } catch (error) {
      console.error('Error loading templates:', error)
      // Fallback to static templates only
      const templateData = TemplateManager.getAllTemplates()
      setTemplates(templateData)
    }
  }

  const handleDownloadTemplate = async (templateId: string) => {
    try {
      const { TemplateDownloader } = await import('@/lib/template-manager')
      await TemplateDownloader.downloadTemplateAsZip(templateId)
      toast.success('Template ZIP download has begun!')
    } catch (error) {
      console.error('Error downloading template:', error)
      toast.error('Failed to download template. Please try again.')
    }
  }

  const handleStartFromTemplate = async (template: any) => {
    try {
      // Check if user is authenticated
      if (!user) {
        setShowAuthModal(true)
        toast.error('Please sign in to create a workspace from template')
        return
      }

      toast.loading('Creating workspace from template...', { id: 'template-import' })

      // Initialize storage manager
      await storageManager.init()

      // Generate project name and description (same pattern as GitHub import)
      const projectName = template.title
      const projectDescription = `Created from template: ${template.title}`

      // Generate unique slug (same pattern as GitHub import)
      const baseSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      let slug = baseSlug
      let counter = 1

      // Check if slug exists and append number if needed
      while (await storageManager.getWorkspaceBySlug(user.id, slug)) {
        slug = `${baseSlug}-${counter}`
        counter++

        // Prevent infinite loop
        if (counter > 100) {
          // Fallback to timestamp-based slug
          slug = `${baseSlug}-${Date.now()}`
          break
        }
      }

      console.log('📝 Creating project with name:', projectName, 'and slug:', slug)

      // Create workspace (same pattern as GitHub import - no id specified)
      const workspace = await storageManager.createWorkspace({
        name: projectName,
        description: projectDescription,
        userId: user.id,
        isPublic: false,
        isTemplate: false,
        lastActivity: new Date().toISOString(),
        deploymentStatus: 'not_deployed',
        slug
      })

      // Check if this is a public template or static template
      if (template.isPublicTemplate && template.files) {
        // Handle public template - copy files directly from JSONB
        const files = Array.isArray(template.files) ? template.files : []
        
        for (const file of files) {
          await storageManager.createFile({
            workspaceId: workspace.id,
            name: file.name,
            content: file.content,
            path: file.path || '/',
            type: file.type || 'file',
            fileType: file.fileType || 'text',
            size: file.content?.length || 0,
            isDirectory: false
          })
        }
        
        // Increment usage count for public template
        if (template.publicTemplateId) {
          const supabase = createClient()
          await supabase.rpc('increment_template_usage', { 
            template_id: template.publicTemplateId 
          })
        }
      } else {
        // Handle static template - use TemplateManager
        const { TemplateManager } = await import('@/lib/template-manager')
        await TemplateManager.applyTemplate(template.id, workspace.id)
      }

      // Create initial checkpoint (same pattern as GitHub import)
      try {
        const { createCheckpoint } = await import('@/lib/checkpoint-utils')
        const initialCheckpointMessageId = `template-import-${workspace.id}`
        await createCheckpoint(workspace.id, initialCheckpointMessageId)
        console.log(`✅ Created initial template import checkpoint for workspace ${workspace.id}`)

        // Store the checkpoint message ID
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`initial-checkpoint-${workspace.id}`, initialCheckpointMessageId)
        }
      } catch (checkpointError) {
        console.error('Failed to create initial checkpoint:', checkpointError)
      }

      // Store import info in sessionStorage (same pattern as GitHub import)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`initial-prompt-${workspace.id}`, `Created from template: ${template.title}`)
        sessionStorage.removeItem('lastSelectedProject')
        sessionStorage.removeItem('cachedFiles')
      }

      toast.success('Workspace created successfully!', { id: 'template-import' })

      // Navigate to the new workspace
      router.push(`/workspace?projectId=${workspace.id}`)
    } catch (error) {
      console.error('Error creating workspace from template:', error)
      toast.error('Failed to create workspace. Please try again.', { id: 'template-import' })
    }
  }


  const checkUser = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      // Also fetch user profile for personalized titles
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        
        setUserProfile(profile)
      } else {
        setUserProfile(null)
      }
    } catch (error) {
      console.error("Error checking user:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAuthRequired = () => {
    setShowAuthModal(true)
  }

  const handleAuthSuccess = () => {
    setShowAuthModal(false)
    checkUser()
  }

  const handleDropdownToggle = () => {
    setIsDropdownOpen(!isDropdownOpen)
  }

  const handleFilterSelect = (filter: string) => {
    setFilterBy(filter)
    setIsDropdownOpen(false)
    setCurrentTemplatePage(1) // Reset to first page when filter changes
  }

  // Function to filter and sort templates
  const getFilteredAndSortedTemplates = () => {
    let filtered = templates

    // Apply category filter
    if (filterBy !== 'all') {
      filtered = filtered.filter(template => {
        const category = template.category?.toLowerCase()
        switch (filterBy) {
          case 'discover':
            return category?.includes('consumer') || category?.includes('website') || category?.includes('personal')
          case 'internal':
            return category?.includes('internal') || category?.includes('tools') || category?.includes('prototype')
          case 'website':
            return category?.includes('website')
          case 'personal':
            return category?.includes('personal') || category?.includes('consumer')
          case 'consumer':
            return category?.includes('consumer')
          case 'b2b':
            return category?.includes('b2b') || category?.includes('saas')
          case 'prototype':
            return category?.includes('prototype')
          default:
            return category === filterBy.toLowerCase()
        }
      })
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'popular':
          return (b.remixes || 0) - (a.remixes || 0)
        case 'recent':
          // Use createdAt if available, otherwise fall back to current date for sorting stability
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : Date.now() - (a.remixes || 0) * 1000
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : Date.now() - (b.remixes || 0) * 1000
          return bDate - aDate
        case 'trending':
          // For trending, sort by combination of recency and popularity
          const aScore = (a.remixes || 0) * 0.7 + (new Date(a.createdAt || Date.now()).getTime() / (1000 * 60 * 60 * 24)) * 0.3
          const bScore = (b.remixes || 0) * 0.7 + (new Date(b.createdAt || Date.now()).getTime() / (1000 * 60 * 60 * 24)) * 0.3
          return bScore - aScore
        default:
          return 0
      }
    })

    return sorted
  }

  // Get paginated templates
  const allFilteredTemplates = getFilteredAndSortedTemplates()
  const totalTemplatePages = Math.ceil(allFilteredTemplates.length / templatesPerPage)
  const templateStartIndex = (currentTemplatePage - 1) * templatesPerPage
  const displayedTemplates = allFilteredTemplates.slice(templateStartIndex, templateStartIndex + templatesPerPage)

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ fontFamily: '"Special Elite", system-ui' }}>
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />
      
      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />
      
      {/* Background Grid Overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-grid opacity-20" />
      
      {/* Decorative Glows */}
      <div className="decorative-glow-purple" />
      <div className="decorative-glow-cyan" />

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 pt-16">
       

        {/* Hero Section */}
        <div className="text-center mb-16">
           {/* Dynamic Badge */}
        <div className="mb-6 animate-fade-in">
          {currentBadgeIndex === 1 ? (
            <Link href="/features/visual-editor">
              <Badge className="bg-transparent backdrop-blur-[32px] text-white border border-white/20 px-6 py-3 text-sm font-semibold rounded-full shadow-lg relative overflow-hidden hover:bg-white/10 transition-all duration-300 cursor-pointer">
                <div className="flex items-center gap-2">
                  {badgeItems[currentBadgeIndex].icon}
                  <span
                    className="inline-block transition-opacity duration-500 ease-in-out opacity-100"
                    key={currentBadgeIndex}
                  >
                    {badgeItems[currentBadgeIndex].text}
                  </span>
                </div>
              </Badge>
            </Link>
          ) : (
            <Badge className="bg-transparent backdrop-blur-[32px] text-white border border-white/20 px-6 py-3 text-sm font-semibold rounded-full shadow-lg relative overflow-hidden hover:bg-white/10 transition-all duration-300">
              <div className="flex items-center gap-2">
                {badgeItems[currentBadgeIndex].icon}
                <span
                  className="inline-block transition-opacity duration-500 ease-in-out opacity-100"
                  key={currentBadgeIndex}
                >
                  {badgeItems[currentBadgeIndex].text}
                </span>
              </div>
            </Badge>
          )}
        </div>
          <h1 className="mb-2 flex items-center justify-center gap-1 text-xl font-medium leading-none text-white sm:text-2xl md:mb-2.5 md:gap-0 md:text-5xl">
            <span className="pt-0.5 tracking-tight md:pt-0">Build something</span>
            <div className="flex flex-col gap-1 ml-1.5 sm:ml-2 md:ml-4 mr-1.5 sm:mr-2 md:mr-4">
              <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-10 md:h-10 rounded-full heart-gradient flex items-center justify-center">
                <Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-5 md:h-5 text-white fill-current" />
              </div>
            </div>
            <span className="pt-0.5 tracking-tight md:pt-0"> Amazing</span>
          </h1>
          <p className="mb-12 text-center text-lg leading-tight text-white/65 md:text-xl">
            Create fullstack apps and websites in minutes
          </p>
        </div>

        {/* Chat Input Section */}
        <div className="w-full max-w-4xl mx-auto">
          <ChatInput onAuthRequired={handleAuthRequired} />
        </div>

        {/* E2B Sponsor Badge */}
        <div className="mt-8 flex items-center justify-center">
          <a href="https://e2b.dev/startups" target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 transition-opacity">
            <img src="/Black-2.png" alt="Sponsored by E2B for Startups" className="h-8 md:h-10 w-auto rounded" />
          </a>
        </div>
      </main>

      {/* Projects Section */}
      <div className="relative z-10 w-full max-w-7xl mx-auto mb-16">
        <ProjectGrid userProfile={userProfile} />
      </div>

      {/* From Pixel Community Section */}
      <section id="template-library" className="relative z-10 py-24 bg-gray-900/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-12">
            <div className="flex items-center space-x-3 mb-6 md:mb-0">
              <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-400" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-white">
               Template Library
              </h2>
            </div>
            
         
          </div>

          {/* Community Template Gallery - Using TemplatesView Component */}
          <TemplatesView userId={user?.id} />

        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* PWA Components */}
      <PWAInstallPrompt />
      <PWAUpdatePrompt />
      <OfflineIndicator />

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        onSuccess={handleAuthSuccess} 
      />
    </div>
  )
}
