"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { TemplateManager, TemplateDownloader } from "@/lib/template-manager"
import {
  Download,
  ExternalLink,
  Star,
  Heart,
  MessageCircle,
  Eye,
  Code,
  Globe,
  Zap,
  Users,
  ArrowLeft,
  Loader2
} from "lucide-react"
import { toast } from "sonner"
import { usePageTitle } from '@/hooks/use-page-title'

export default function TemplatePage() {
  usePageTitle('Template')
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [template, setTemplate] = useState<any>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadTemplate = () => {
      try {
        // Find template by converting slug back to ID
        const allTemplates = TemplateManager.getAllTemplates()
        const foundTemplate = allTemplates.find(t =>
          t.title.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') === slug ||
          t.id === slug
        )

        if (!foundTemplate) {
          toast.error("Template not found")
          router.push('/')
          return
        }

        setTemplate(foundTemplate)
      } catch (error) {
        console.error("Error loading template:", error)
        toast.error("Failed to load template")
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }

    loadTemplate()
  }, [slug, router])

  const handleDownloadTemplate = async () => {
    if (!template || !template.id) return

    setIsDownloading(true)
    try {
      await TemplateDownloader.downloadTemplateAsZip(template.id)
      toast.success(`${template.title} downloaded successfully!`)
    } catch (error) {
      console.error("Download error:", error)
      toast.error("Failed to download template. Please try again.")
    } finally {
      setIsDownloading(false)
    }
  }

  // Check if this is an external project
  const isExternalProject = template?.externalUrl


  if (isLoading) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-white" />
            <p className="text-white">Loading template...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0 lovable-gradient" />
        <div className="absolute inset-0 noise-texture" />
        <Navigation />
        <div className="relative z-10 pt-16 flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Template Not Found</h1>
            <Button onClick={() => router.push('/')} variant="outline" className="border-gray-600 text-white hover:bg-gray-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Render external project (iframe)
  if (isExternalProject) {
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
            {/* Back Button */}
            <div className="mb-6">
              <Button
                onClick={() => router.push('/')}
                variant="outline"
                className="border-gray-600 text-white hover:bg-gray-700"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>

            {/* Project Header */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <Badge className="bg-purple-600 text-white">
                  {template.category}
                </Badge>
                <Badge className="bg-green-600 text-white">
                  Live Project
                </Badge>
              </div>

              <h1 className="text-4xl font-bold text-white mb-4">
                {template.title}
              </h1>

              <p className="text-xl text-gray-300 mb-6 max-w-3xl mx-auto">
                {template.description}
              </p>

              {/* Author Info */}
              <div className="flex items-center justify-center space-x-3 mb-8">
                <img
                  src={template.authorAvatar}
                  alt={template.author}
                  className="w-10 h-10 rounded-full"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder-user.jpg'
                  }}
                />
                <div>
                  <p className="text-white font-medium">Built by {template.author}</p>
                  <p className="text-gray-400 text-sm">Using PiPilot</p>
                </div>
              </div>
            </div>

            {/* Live Project Iframe */}
            <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
              <CardContent className="p-0">
                <div className="relative w-full" style={{ height: '80vh' }}>
                  <iframe
                    src={template.externalUrl}
                    className="w-full h-full rounded-lg"
                    title={`${template.title} - Live Preview`}
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    loading="lazy"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Project Info */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="text-2xl font-bold text-white mb-2">{template.remixes.toLocaleString()}</div>
                  <div className="text-gray-400">Community Remixes</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="text-2xl font-bold text-white mb-2">Live</div>
                  <div className="text-gray-400">Status</div>
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
                <CardContent className="p-6 text-center">
                  <div className="text-2xl font-bold text-white mb-2">PiPilot</div>
                  <div className="text-gray-400">Built With</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    )
  }

  // Render regular template
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
          {/* Back Button */}
          <div className="mb-6">
            <Button
              onClick={() => router.push('/')}
              variant="outline"
              className="border-gray-600 text-white hover:bg-gray-700"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Templates
            </Button>
          </div>

          {/* Template Header */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Template Image */}
            <div className="relative">
              <div className="h-80 lg:h-96 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600">
                <img
                  src={template.thumbnailUrl}
                  alt={template.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to gradient if image fails to load
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>
            </div>

            {/* Template Info */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <Badge className="bg-purple-600 text-white">
                    {template.category}
                  </Badge>
                  <div className="flex items-center space-x-1 text-gray-400">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm">Featured</span>
                  </div>
                </div>

                <h1 className="text-4xl font-bold text-white mb-4">
                  {template.title}
                </h1>

                <p className="text-xl text-gray-300 mb-6">
                  {template.description}
                </p>
              </div>

              {/* Author Info */}
              <div className="flex items-center space-x-3">
                <img
                  src={template.authorAvatar}
                  alt={template.author}
                  className="w-10 h-10 rounded-full"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder-user.jpg'
                  }}
                />
                <div>
                  <p className="text-white font-medium">{template.author}</p>
                  <p className="text-gray-400 text-sm">Template Creator</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{template.remixes.toLocaleString()}</div>
                  <div className="text-gray-400 text-sm">Remixes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">4.8</div>
                  <div className="text-gray-400 text-sm">Rating</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">React</div>
                  <div className="text-gray-400 text-sm">Framework</div>
                </div>
              </div>

              {/* Action Buttons - Only show for regular templates */}
              {!isExternalProject && (
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-8"
                    onClick={handleDownloadTemplate}
                    disabled={isDownloading}
                  >
                    {isDownloading ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-5 h-5 mr-2" />
                    )}
                    {isDownloading ? "Downloading..." : "Download ZIP"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Hans Ade Notice */}
          <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm mb-8">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Star className="w-5 h-5 mr-2 text-yellow-400" />
                Generated by Hans Ade using PiPilot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300">
                This template was expertly crafted by Hans Ade using PiPilot's advanced AI capabilities.
                PiPilot combines cutting-edge artificial intelligence with human creativity to deliver
                production-ready web applications that follow best practices and modern design principles.
              </p>
              <div className="mt-4 flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-gray-300 text-sm">AI-Powered</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
                    <Code className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-gray-300 text-sm">Production Ready</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-green-600/20 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-gray-300 text-sm">Community Driven</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Template Features */}
          <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm mb-8">
            <CardHeader>
              <CardTitle className="text-white">What's Included</CardTitle>
              <CardDescription className="text-gray-400">
                This template comes with everything you need to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Code className="w-3 h-3 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">Modern React Components</h4>
                      <p className="text-gray-400 text-sm">Built with TypeScript and Tailwind CSS for optimal performance</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Globe className="w-3 h-3 text-green-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">Responsive Design</h4>
                      <p className="text-gray-400 text-sm">Mobile-first approach with perfect scaling across all devices</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Zap className="w-3 h-3 text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">Best Practices</h4>
                      <p className="text-gray-400 text-sm">Follows industry standards and security best practices</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-orange-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Users className="w-3 h-3 text-orange-400" />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">Community Support</h4>
                      <p className="text-gray-400 text-sm">Active community with regular updates and improvements</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Technology Stack */}
          <Card className="bg-gray-800/50 border-gray-700/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white">Technology Stack</CardTitle>
              <CardDescription className="text-gray-400">
                Built with modern technologies and frameworks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">React 18</Badge>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">TypeScript</Badge>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">Tailwind CSS</Badge>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">Next.js 14</Badge>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">Vite</Badge>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">ESLint</Badge>
                <Badge variant="secondary" className="bg-gray-700 text-gray-300">Prettier</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  )
}
