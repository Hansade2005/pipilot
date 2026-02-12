"use client"

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import {
  ExternalLink,
  GitFork,
  Heart,
  Share2,
  Loader2,
  Play,
  Code,
  Eye,
  Star,
  User,
  Terminal,
  Trash2,
  RotateCcw,
  Package,
  Download
} from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { AuthModal } from "@/components/auth-modal"
import { TemplateManager } from "@/lib/template-manager"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { usePageTitle } from '@/hooks/use-page-title'

export default function ProjectViewPage() {
  usePageTitle('Project Showcase')
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const isMobile = useIsMobile()

  const [user, setUser] = useState<any>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isPreviewLoading, setIsPreviewLoading] = useState(true)
  const [isForking, setIsForking] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [project, setProject] = useState<any>(null)

  // Console and preview state (similar to code preview panel)
  const [isConsoleOpen, setIsConsoleOpen] = useState(false) // Start closed by default
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [currentLog, setCurrentLog] = useState("Initializing preview...")
  const [consoleHeight, setConsoleHeight] = useState(300)
  const [isResizing, setIsResizing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [customUrl, setCustomUrl] = useState("")

  // Refs for console management
  const consoleRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Unified console logging function - combines all log types
  const addConsoleLog = (message: string, type: 'terminal' | 'browser' | 'process' | 'server' = 'terminal') => {
    const timestamp = new Date().toLocaleTimeString()
    const typeIcon = {
      terminal: '💻',
      browser: '🌐',
      process: '⚙️',
      server: '🚀'
    }[type]
    const typeLabel = {
      terminal: 'TERMINAL',
      browser: 'BROWSER',
      process: 'PROCESS',
      server: 'SERVER'
    }[type]

    setConsoleOutput(prev => [...prev, `[${timestamp}] ${typeIcon} [${typeLabel}] ${message}`])
  }

  // Handle console resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return

    const newHeight = window.innerHeight - e.clientY
    const minHeight = 150
    const maxHeight = window.innerHeight * 0.8

    if (newHeight >= minHeight && newHeight <= maxHeight) {
      setConsoleHeight(newHeight)
    }
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  // Clear console logs
  const clearConsole = () => {
    setConsoleOutput([])
  }

  // Refresh preview
  const refreshPreview = () => {
    if (previewUrl) {
      // Force iframe reload
      const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement
      if (iframe) {
        iframe.src = iframe.src
      }
    }
  }

  // Mock project data - in a real app this would come from a database
  const projects = [
    {
      id: "ecommerce-platform",
      title: "AI-Powered E-commerce Platform",
      description: "A complete e-commerce solution built in just 2 hours using PiPilot's AI capabilities. Features include product management, shopping cart, and payment integration.",
      author: "Sarah Chen",
      avatar: "SC",
      tech: ["React", "Next.js", "Stripe", "Tailwind"],
      templateId: "saas-template",
      longDescription: "This comprehensive e-commerce platform showcases the power of AI-driven development. Built entirely with PiPilot, it includes modern features like product catalog management, shopping cart functionality, secure payment processing with Stripe, and a beautiful responsive design. The platform demonstrates how AI can accelerate development while maintaining high code quality and user experience standards.",
      features: [
        "Product catalog with search and filters",
        "Shopping cart with persistent storage",
        "Secure Stripe payment integration",
        "User authentication and profiles",
        "Responsive design for all devices",
        "Admin dashboard for inventory management",
        "Order tracking and history",
        "Email notifications for orders"
      ]
    },
    {
      id: "chat-application",
      title: "Real-time Chat Application",
      description: "Modern chat app with real-time messaging, user authentication, and file sharing. Built entirely with AI assistance in under an hour.",
      author: "Mike Johnson",
      avatar: "MJ",
      tech: ["React", "Socket.io", "Node.js", "MongoDB"],
      templateId: "saas-template",
      longDescription: "Experience the future of communication with this real-time chat application. Powered by AI development, this app features instant messaging, user presence indicators, file sharing capabilities, and a modern interface that rivals commercial chat applications.",
      features: [
        "Real-time messaging with WebSocket",
        "User authentication and profiles",
        "File sharing with drag & drop",
        "Message history and search",
        "Online/offline status indicators",
        "Group chat functionality",
        "Message reactions and replies",
        "Mobile-responsive design"
      ]
    },
    {
      id: "project-dashboard",
      title: "Project Management Dashboard",
      description: "Comprehensive project management tool with task tracking, team collaboration, and progress analytics. Perfect for agile development teams.",
      author: "Alex Rodriguez",
      avatar: "AR",
      tech: ["Vue.js", "Firebase", "Chart.js", "Material-UI"],
      templateId: "crypto-trading-dashboard",
      longDescription: "Transform your project management workflow with this comprehensive dashboard. Built with AI assistance, it provides powerful tools for task tracking, team collaboration, progress visualization, and performance analytics.",
      features: [
        "Interactive Kanban boards",
        "Team member assignment",
        "Progress tracking with charts",
        "Time tracking and estimates",
        "File attachments and comments",
        "Project templates and workflows",
        "Real-time collaboration",
        "Custom reporting and analytics"
      ]
    },
    {
      id: "weather-app",
      title: "Weather App with AI Predictions",
      description: "Smart weather application with AI-powered predictions and beautiful visualizations.",
      author: "Emma Davis",
      avatar: "ED",
      tech: ["React", "OpenWeather API", "AI"],
      templateId: "crypto-trading-dashboard",
      longDescription: "Stay ahead of the weather with this intelligent weather application. Features AI-powered weather predictions, beautiful data visualizations, and comprehensive weather information.",
      features: [
        "Current weather conditions",
        "7-day weather forecast",
        "AI-powered weather predictions",
        "Interactive weather maps",
        "Weather alerts and notifications",
        "Historical weather data",
        "Multiple location support",
        "Beautiful data visualizations"
      ]
    },
    {
      id: "finance-tracker",
      title: "Personal Finance Tracker",
      description: "Comprehensive personal finance management tool with budgeting and expense tracking.",
      author: "David Wilson",
      avatar: "DW",
      tech: ["Next.js", "Prisma", "PostgreSQL"],
      templateId: "market-mosaic-online",
      longDescription: "Take control of your finances with this comprehensive personal finance tracker. Built with modern web technologies, it provides powerful tools for budgeting, expense tracking, and financial goal setting.",
      features: [
        "Expense tracking and categorization",
        "Budget creation and monitoring",
        "Financial goal setting",
        "Income and expense reports",
        "Transaction import from banks",
        "Multi-currency support",
        "Data visualization and charts",
        "Export financial reports"
      ]
    },
    {
      id: "recipe-platform",
      title: "Recipe Sharing Platform",
      description: "Community-driven recipe sharing platform with ratings and reviews.",
      author: "Lisa Brown",
      avatar: "LB",
      tech: ["React", "Express", "MongoDB"],
      templateId: "saas-template",
      longDescription: "Share your culinary creations with this vibrant recipe sharing platform. Built for food enthusiasts, it combines social features with practical cooking tools.",
      features: [
        "Recipe creation and sharing",
        "User ratings and reviews",
        "Ingredient substitution suggestions",
        "Cooking timer and instructions",
        "Recipe collections and favorites",
        "Search and filtering",
        "Social sharing features",
        "Community forums and discussions"
      ]
    },
    {
      id: "fitness-app",
      title: "Fitness Tracking App",
      description: "Comprehensive fitness tracking with workout plans and progress monitoring.",
      author: "Tom Anderson",
      avatar: "TA",
      tech: ["React Native", "Firebase", "AI"],
      templateId: "forklift-navigator",
      longDescription: "Achieve your fitness goals with this comprehensive tracking application. Features AI-powered workout recommendations, progress tracking, and personalized fitness plans.",
      features: [
        "Workout plan creation",
        "Exercise tracking and logging",
        "Progress visualization",
        "AI-powered workout recommendations",
        "Nutrition tracking integration",
        "Goal setting and milestones",
        "Social fitness community",
        "Integration with wearables"
      ]
    }
  ]

  useEffect(() => {
    const foundProject = projects.find(p => p.id === projectId)
    if (foundProject) {
      setProject(foundProject)
      // Auto-generate preview when project is loaded with a small delay
      setTimeout(() => {
        generatePreview(foundProject)
      }, 1000) // Small delay to ensure UI is ready
    } else {
      router.push('/showcase')
    }
    checkUser()
  }, [projectId])

  const generatePreview = async (projectData: any) => {
    setIsPreviewLoading(true)
    setCurrentLog("Booting sandbox...")
    setConsoleOutput([])

    try {
      addConsoleLog("Loading showcase project...", 'server')

      // Call the showcase preview API
      const response = await fetch('/api/preview/showcase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: projectData.templateId,
          projectId: projectData.id
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setPreviewUrl(data.url)
        setCurrentLog("Preview ready!")
        addConsoleLog("✅ Preview server ready", 'server')
        setCustomUrl(data.url)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setCurrentLog("Failed to generate preview")
        addConsoleLog(`❌ ${errorData.error || 'Failed to generate preview'}`, 'server')
        console.error('Failed to generate preview, API returned error:', errorData)
      }
    } catch (error) {
      console.error('Error generating preview:', error)
      setCurrentLog("Preview generation failed")
      addConsoleLog(`❌ ${error instanceof Error ? error.message : 'Unknown error'}`, 'server')
      setPreviewUrl(null)
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const checkUser = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    } catch (error) {
      console.error("Error checking user:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForkProject = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    if (!project) return

    setIsForking(true)
    try {
      // Import the required services
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

      const template = TemplateManager.getTemplateById(project.templateId)
      if (!template) {
        throw new Error('Template not found')
      }

      // Create workspace with project name
      const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const workspace = await storageManager.createWorkspace({
        name: project.title,
        description: project.description,
        userId: user.id,
        isPublic: false,
        isTemplate: false,
        lastActivity: new Date().toISOString(),
        deploymentStatus: 'not_deployed',
        slug
      })

      // Apply template files
      await TemplateManager.applyTemplate(project.templateId, workspace.id)

      toast.success(`Successfully forked "${project.title}"!`)

      // Redirect to the workspace with correct format
      router.push(`/workspace?newProject=${workspace.id}&template=${encodeURIComponent(project.title)}`)

    } catch (error) {
      console.error('Error forking project:', error)
      toast.error('Failed to fork project. Please try again.')
    } finally {
      setIsForking(false)
    }
  }

  const handleAuthRequired = () => {
    setShowAuthModal(true)
  }

  const handleAuthSuccess = () => {
    setShowAuthModal(false)
    checkUser()
  }

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    } else {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  // Auto-scroll console to bottom when new output arrives
  useEffect(() => {
    if (consoleRef.current && isConsoleOpen) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleOutput, isConsoleOpen])

  // Update custom URL when preview URL changes
  useEffect(() => {
    if (previewUrl) {
      setCustomUrl(previewUrl)
    }
  }, [previewUrl])

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-purple-600/20 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Loading Project...</h2>
          <p className="text-gray-400">Please wait while we load the project details.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Professional Header - Similar to Code Editor */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Eye className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">{project.title}</span>
            <Badge variant="outline" className="text-xs">
              Preview
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            by {project.author}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Preview URL Input */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">URL:</span>
            <Input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="w-80 h-8 text-sm"
              placeholder="Preview URL"
            />
          </div>

          {/* Action Buttons */}
          <Button
            size="sm"
            onClick={refreshPreview}
            disabled={!previewUrl}
            variant="outline"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={handleForkProject}
            disabled={isForking}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isForking ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Forking...
              </>
            ) : (
              <>
                <GitFork className="h-4 w-4 mr-2" />
                Fork Project
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(previewUrl || '#', '_blank')}
            disabled={!previewUrl}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open External
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Preview Content */}
        <div className={`flex-1 min-h-0 ${isMobile && isConsoleOpen ? 'pb-48' : ''}`}>
          {isPreviewLoading ? (
            <div className="h-full flex items-center justify-center">
              {/* Interactive Preview Loader */}
              <div className="relative w-24 h-24 mx-auto mb-6">
                {/* Outer ring */}
                <div className="absolute inset-0 rounded-full border-4 border-muted animate-ping"></div>
                {/* Middle ring */}
                <div className="absolute inset-2 rounded-full border-4 border-primary animate-pulse"></div>
                {/* Inner ring with rotation */}
                <div className="absolute inset-4 rounded-full border-t-4 border-accent animate-spin"></div>
                {/* Center dot */}
                <div className="absolute inset-8 rounded-full bg-accent animate-pulse"></div>
              </div>

              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">
                  {currentLog}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  This may take a few moments
                </p>
                <p className="text-muted-foreground text-xs">
                  Installing dependencies and starting dev server
                </p>
              </div>
            </div>
          ) : previewUrl ? (
            <div className={`w-full relative ${isConsoleOpen ? 'h-[calc(100%-300px)]' : 'h-full'}`}>
              <iframe
                id="preview-iframe"
                src={previewUrl}
                className="w-full h-full border-none"
                title={`${project.title} Preview`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Live Preview</h3>
                <p className="text-muted-foreground mb-4">Click "Start Preview" to see your app running</p>
                <Button
                  onClick={() => generatePreview(project)}
                  disabled={!project}
                  className="rounded-full px-6"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Preview
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Console Output Accordion - Fixed at Bottom */}
        <div className={`border-t border-border ${isMobile ? 'fixed bottom-12 left-0 right-0 z-40 bg-background shadow-lg' : 'mt-auto'}`}>
          <Accordion
            type="single"
            collapsible
            value={isConsoleOpen ? "console" : undefined}
            onValueChange={(value) => setIsConsoleOpen(value === "console")}
          >
            <AccordionItem value="console" className="border-none">
              <AccordionTrigger className={`px-4 py-2 hover:no-underline ${isMobile ? 'py-3' : 'py-2'}`}>
                <div className="flex items-center space-x-2">
                  <Terminal className={`${isMobile ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  <span className={`font-medium ${isMobile ? 'text-sm' : 'text-base'}`}>Console</span>
                  {/* Total count badge */}
                  {consoleOutput.length > 0 && (
                    <span className={`ml-2 px-2 py-1 text-xs bg-primary text-primary-foreground rounded-full font-medium ${
                      isMobile ? 'px-2.5 py-1.5' : 'px-2 py-1'
                    }`}>
                      {consoleOutput.length}
                    </span>
                  )}
                  {/* Connection status indicator */}
                  {previewUrl && (
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      <span className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-xs'}`}>
                        Live
                      </span>
                    </div>
                  )}
                  {/* Clear console button */}
                  {consoleOutput.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        clearConsole()
                      }}
                      className={`h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground ${
                        isMobile ? 'h-7 w-7' : 'h-6 w-6'
                      }`}
                    >
                      <Trash2 className={`${isMobile ? 'h-4 w-4' : 'h-3 w-3'}`} />
                    </Button>
                  )}
                </div>
                {/* Show latest output when collapsed - mobile optimized */}
                {!isConsoleOpen && consoleOutput.length > 0 && (
                  <div className={`ml-auto text-muted-foreground truncate ${
                    isMobile ? 'text-xs max-w-32' : 'text-xs max-w-48'
                  }`}>
                    {consoleOutput[consoleOutput.length - 1]}
                  </div>
                )}
              </AccordionTrigger>
              <AccordionContent
                className={`px-4 pb-4 ${isMobile ? 'px-3 pb-3' : 'px-4 pb-4'}`}
                style={{ height: isConsoleOpen ? `${consoleHeight}px` : 'auto' }}
              >
                {/* Resize Handle */}
                {isConsoleOpen && !isMobile && (
                  <div
                    ref={resizeRef}
                    className={`w-full h-2 bg-border hover:bg-primary/30 cursor-ns-resize transition-colors flex items-center justify-center ${
                      isResizing ? 'bg-primary/40' : ''
                    }`}
                    onMouseDown={handleMouseDown}
                  >
                    <div className="w-8 h-0.5 bg-muted-foreground/40 rounded-full" />
                  </div>
                )}
                {/* Console Content */}
                <div
                  ref={consoleRef}
                  className={`bg-muted rounded-lg overflow-y-auto ${
                    isMobile ? 'max-h-32 p-2' : 'p-3'
                  }`}
                  style={{
                    height: isConsoleOpen && !isMobile ? `${consoleHeight - 60}px` : undefined,
                    maxHeight: isMobile ? '8rem' : undefined
                  }}
                >
                  {consoleOutput.length === 0 ? (
                    <div className={`text-center ${isMobile ? 'py-4' : 'py-8'}`}>
                      <p className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>
                        {isMobile ? 'Console output will appear here...' : 'Console output will appear here when the dev server starts...'}
                      </p>
                      {previewUrl && (
                        <p className={`text-muted-foreground mt-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                          Logs from the preview server will appear here
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {consoleOutput.map((output, index) => {
                        const isError = output.includes('ERROR:') || output.includes('❌') || output.includes('stderr')
                        const isSuccess = output.includes('✅') || output.includes('Server ready') || output.includes('successfully')
                        const isWarning = output.includes('Warning:') || output.includes('⚠️')

                        return (
                          <div
                            key={index}
                            className={`font-mono ${
                              isError ? 'text-red-500' :
                              isSuccess ? 'text-green-500' :
                              isWarning ? 'text-yellow-500' :
                              'text-muted-foreground'
                            } ${isMobile ? 'text-xs leading-tight' : 'text-xs'}`}
                          >
                            {output}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {consoleOutput.length > 0 && (
                  <div className={`flex justify-between items-center mt-2 ${isMobile ? 'mt-2' : 'mt-2'}`}>
                    <div className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-xs'}`}>
                      {previewUrl ? 'Streaming live from preview server...' : 'Console output captured'}
                    </div>
                    <div className={`flex space-x-2 ${isMobile ? 'space-x-1' : 'space-x-2'}`}>
                      <Button
                        variant="outline"
                        size={isMobile ? "sm" : "sm"}
                        onClick={clearConsole}
                        className={`${isMobile ? 'text-xs px-2 py-1 touch-manipulation' : 'text-xs'}`}
                      >
                        Clear Console
                      </Button>
                      {!isMobile && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConsoleHeight(300)}
                          className="text-xs"
                          title="Reset console height"
                        >
                          Reset Height
                        </Button>
                      )}
                      {previewUrl && (
                        <Button
                          variant="outline"
                          size={isMobile ? "sm" : "sm"}
                          onClick={() => setIsConsoleOpen(false)}
                          className={`${isMobile ? 'text-xs px-2 py-1 touch-manipulation' : 'text-xs'}`}
                        >
                          Close Console
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  )
}
