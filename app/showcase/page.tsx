"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Logo } from "@/components/ui/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Star, ExternalLink, Heart, MessageCircle, Eye, Code, Globe, Zap, Users, TrendingUp, Download } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { AuthModal } from "@/components/auth-modal"
import { TemplateManager } from "@/lib/template-manager"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { usePageTitle } from '@/hooks/use-page-title'

export default function ShowcasePage() {
  usePageTitle('Showcase')
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isForking, setIsForking] = useState<string | null>(null)
  const [templateData, setTemplateData] = useState<any[]>([])
  const [sortBy, setSortBy] = useState<string>('popular')
  const [filterBy, setFilterBy] = useState<string>('all')

  // Check user authentication and load template data
  useEffect(() => {
    const supabase = createClient()
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    checkUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    // Load template data for thumbnails and author info
    const templateData = TemplateManager.getAllTemplates()
    setTemplateData(templateData)

    return () => subscription.unsubscribe()
  }, [])

  // Helper function to get template info by templateId
  const getTemplateInfo = (templateId: string) => {
    return templateData.find(template => template.id === templateId)
  }

  const handleDownloadTemplate = async (templateId: string) => {
    try {
      const { TemplateDownloader } = await import('@/lib/template-manager')
      await TemplateDownloader.downloadTemplateAsZip(templateId)
      toast.success('Template ZIP download started!')
    } catch (error) {
      console.error('Error downloading template:', error)
      toast.error('Failed to download template. Please try again.')
    }
  }


  const featuredProjects = [
    {
      id: "ecommerce-platform",
      title: "AI-Powered E-commerce Platform",
      description: "A complete e-commerce solution built in just 2 hours using PiPilot's AI capabilities. Features include product management, shopping cart, and payment integration.",
      author: "Sarah Chen",
      avatar: "SC",
      tech: ["React", "React Router", "Lucide Icons", "Tailwind"],
      image: "bg-gradient-to-br from-blue-500 to-purple-600",
      featured: true,
      templateId: "ecommerce-platform" // Now using dedicated e-commerce template
    },
    {
      id: "chat-application",
      title: "Real-time Chat Application",
      description: "Modern chat app with real-time messaging, user authentication, and file sharing. Built entirely with AI assistance in under an hour.",
      author: "Mike Johnson",
      avatar: "MJ",
      tech: ["React", "React Router", "Lucide Icons", "Tailwind"],
      image: "bg-gradient-to-br from-green-500 to-blue-600",
      featured: true,
      templateId: "chat-application"
    },
    {
      id: "project-dashboard",
      title: "Project Management Dashboard",
      description: "Comprehensive project management tool with task tracking, team collaboration, and progress analytics. Perfect for agile development teams.",
      author: "Alex Rodriguez",
      avatar: "AR",
      tech: ["Vue.js", "Firebase", "Chart.js", "Material-UI"],
      image: "bg-gradient-to-br from-purple-500 to-pink-600",
      featured: true,
      templateId: "cortex-second-brain"
    }
  ]

  const recentProjects = [
    {
      id: "weather-app",
      title: "Weather App with AI Predictions",
      author: "Emma Davis",
      avatar: "ED",
      tech: ["React", "OpenWeather API", "AI"],
      image: "bg-gradient-to-br from-cyan-500 to-blue-600",
      templateId: "characterforge-imagix"
    },
    {
      id: "finance-tracker",
      title: "Personal Finance Tracker",
      description: "Comprehensive personal finance management tool with budgeting, goals, and expense tracking.",
      author: "David Wilson",
      avatar: "DW",
      tech: ["React", "React Router", "Lucide Icons", "Tailwind"],
      image: "bg-gradient-to-br from-emerald-500 to-teal-600",
      templateId: "finance-tracker"
    },
    {
      id: "recipe-platform",
      title: "Recipe Sharing Platform",
      description: "Social platform for sharing and discovering recipes with community features.",
      author: "Lisa Brown",
      avatar: "LB",
      tech: ["React", "Express", "MongoDB"],
      image: "bg-gradient-to-br from-orange-500 to-red-600",
      templateId: "saas-template"
    },
    {
      id: "fitness-app",
      title: "Fitness Tracking App",
      description: "Comprehensive fitness tracking with workout plans and progress monitoring.",
      author: "Tom Anderson",
      avatar: "TA",
      tech: ["React Native", "Firebase", "AI"],
      image: "bg-gradient-to-br from-pink-500 to-rose-600",
      templateId: "saas-template"
    }
  ]

  const stats = [
    { label: "Projects Shared", value: "Coming Soon", icon: Code },
    { label: "Active Developers", value: "Launching", icon: Users },
    { label: "Total Views", value: "Growing", icon: Eye },
    { label: "Stars Given", value: "Exciting", icon: Star }
  ]

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
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center mb-4">
              <div className="w-6 h-6 rounded-full heart-gradient flex items-center justify-center">
                <Star className="w-3 h-3 text-white" />
              </div>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Project Showcase
            </h1>
            <p className="text-xl text-white/80 max-w-3xl mx-auto mb-8">
              Discover amazing applications built with PiPilot. Get inspired by what our community has created.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => toast.info("Coming soon!")}
              >
                Share Your Project
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-gray-600 text-white hover:bg-gray-700"
                onClick={() => toast.info("Coming soon!")}
              >
                Submit Your Project
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-gray-600 text-white hover:bg-gray-700"
                onClick={() => router.push('/docs')}
              >
                Learn More
              </Button>
            </div>
          </div>

          {/* Sorting and Filtering */}
          <div className="mb-8">
            <div className="flex flex-wrap gap-4 items-center justify-center">
              {/* Sort By */}
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-sm">Sort by:</span>
                <div className="flex bg-gray-800/50 rounded-lg p-1">
                  {[
                    { key: 'popular', label: 'Popular' },
                    { key: 'recent', label: 'Recent' },
                    { key: 'trending', label: 'Trending' }
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setSortBy(option.key)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        sortBy === option.key
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter By */}
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 text-sm">Filter:</span>
                <div className="flex bg-gray-800/50 rounded-lg p-1">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'website', label: 'Website' },
                    { key: 'personal', label: 'Personal' },
                    { key: 'consumer', label: 'Consumer App' },
                    { key: 'b2b', label: 'B2B App' },
                    { key: 'prototype', label: 'Prototype' }
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setFilterBy(option.key)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        filterBy === option.key
                          ? 'bg-purple-600 text-white'
                          : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
            {stats.map((stat, index) => (
              <Card key={index} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center mx-auto mb-4">
                    <stat.icon className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="text-3xl font-bold text-white mb-2">{stat.value}</div>
                  <div className="text-gray-300">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Featured Projects */}
          <div className="mb-16">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-white">Featured Projects</h2>
              <Badge className="bg-yellow-600 text-white">
                <Star className="w-3 h-3 mr-1" />
                Editor's Choice
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredProjects.map((project, index) => (
                <Card key={index} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors overflow-hidden">
                  <div className="h-32 relative overflow-hidden">
                    {(() => {
                      const templateInfo = getTemplateInfo(project.templateId)
                      return templateInfo ? (
                        <img
                          src={templateInfo.thumbnailUrl}
                          alt={project.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // Fallback to gradient if image fails to load
                            e.currentTarget.style.display = 'none'
                            e.currentTarget.parentElement!.style.background = project.image || 'linear-gradient(to right, #667eea 0%, #764ba2 100%)'
                          }}
                        />
                      ) : (
                        <div className={`w-full h-full ${project.image} flex items-center justify-center`}>
                          <Code className="w-8 h-8 text-white" />
                        </div>
                      )
                    })()}
                  </div>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-white text-lg">{project.title}</CardTitle>
                      {project.featured && (
                        <Badge className="bg-yellow-600 text-white text-xs">
                          <Star className="w-3 h-3 mr-1" />
                          Featured
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-gray-300">
                      {project.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-3 mb-4">
                      {(() => {
                        const templateInfo = getTemplateInfo(project.templateId)
                        return (
                          <div className="w-8 h-8 rounded-full overflow-hidden">
                            <img
                              src={templateInfo?.authorAvatar || "/hans.png"}
                              alt={templateInfo?.author || "Hans Ade"}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder-user.jpg"
                              }}
                            />
                          </div>
                        )
                      })()}
                      <div>
                        {(() => {
                          const templateInfo = getTemplateInfo(project.templateId)
                          return (
                            <>
                              <p className="text-white text-sm font-medium">{templateInfo?.author || "Hans Ade"}</p>
                              <p className="text-xs text-gray-400">Featured Project</p>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {project.tech.map((tech, techIndex) => (
                        <Badge key={techIndex} variant="secondary" className="bg-gray-700 text-gray-300 text-xs">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-gray-600"
                        onClick={() => router.push(`/templates/${project.templateId}`)}
                      >
                        <ExternalLink className="w-3 h-3 mr-2" />
                        View Template
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                        onClick={() => handleDownloadTemplate(project.templateId)}
                      >
                        <Download className="w-3 h-3 mr-2" />
                        Download ZIP
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Recent Projects */}
          <div className="mb-16">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white">Recent Projects</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {recentProjects.map((project, index) => (
                <Card key={index} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                        {(() => {
                          const templateInfo = getTemplateInfo(project.templateId)
                          return templateInfo ? (
                            <img
                              src={templateInfo.thumbnailUrl}
                              alt={project.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Fallback to gradient if image fails to load
                                e.currentTarget.style.display = 'none'
                                e.currentTarget.parentElement!.style.background = project.image || 'linear-gradient(to right, #667eea 0%, #764ba2 100%)'
                                e.currentTarget.parentElement!.innerHTML = '<div class="w-6 h-6 text-white"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg></div>'
                              }}
                            />
                          ) : (
                            <div className={`w-full h-full ${project.image} rounded-lg flex items-center justify-center`}>
                              <Code className="w-6 h-6 text-white" />
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-2">{project.title}</h3>
                        <div className="flex items-center space-x-3 mb-3">
                          {(() => {
                            const templateInfo = getTemplateInfo(project.templateId)
                            return (
                              <div className="w-6 h-6 rounded-full overflow-hidden">
                                <img
                                  src={templateInfo?.authorAvatar || "/hans.png"}
                                  alt={templateInfo?.author || "Hans Ade"}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.currentTarget.src = "/placeholder-user.jpg"
                                  }}
                                />
                              </div>
                            )
                          })()}
                          <span className="text-gray-300 text-sm">
                            {(() => {
                              const templateInfo = getTemplateInfo(project.templateId)
                              return templateInfo?.author || "Hans Ade"
                            })()}
                          </span>
                          <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                            Recent
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {project.tech.map((tech, techIndex) => (
                            <Badge key={techIndex} variant="secondary" className="bg-gray-700 text-gray-300 text-xs">
                              {tech}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-gray-600"
                            onClick={() => router.push(`/templates/${project.templateId}`)}
                          >
                            <ExternalLink className="w-3 h-3 mr-2" />
                            View Template
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-purple-600 hover:bg-purple-700"
                            onClick={() => handleDownloadTemplate(project.templateId)}
                          >
                            <Download className="w-3 h-3 mr-2" />
                            Download ZIP
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div className="mb-16">
            <h2 className="text-3xl font-bold text-white mb-8 text-center">Explore by Category</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: "Web Apps", icon: Globe },
                { name: "Mobile Apps", icon: Zap },
                { name: "APIs", icon: Code },
                { name: "AI/ML", icon: TrendingUp }
              ].map((category, index) => (
                <Card key={index} className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm hover:bg-gray-700/50 transition-colors cursor-pointer">
                  <CardContent className="p-6 text-center">
                    <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center mx-auto mb-4">
                      <category.icon className="w-6 h-6 text-purple-400" />
                    </div>
                    <h3 className="text-white font-semibold mb-2">{category.name}</h3>
                    <p className="text-gray-400 text-sm">Coming Soon</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-gray-800/50 rounded-xl p-8 backdrop-blur-sm text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-lg bg-green-600/20 flex items-center justify-center">
                <Code className="w-6 h-6 text-green-400" />
              </div>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Share Your Project?</h2>
            <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
              Join thousands of developers sharing their AI-powered creations. Showcase your work and inspire others in the community.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white">
                Submit Your Project
              </Button>
              <Button size="lg" variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => setShowAuthModal(false)}
      />
    </div>
  )
}
