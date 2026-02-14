"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Image as ImageIcon,
  Gift,
  Bell,
  Eye,
  Heart,
  ChevronDown,
  ExternalLink,
  Users,
  Download,
  Database,
  Building2,
  Server,
  Workflow,
  Figma
} from "lucide-react"
import Link from "next/link"
import { PcChatInput } from "@/components/pc-chat-input"
import { PcAuthModal } from "@/components/pc-auth-modal"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import FeatureShowcase from "@/components/FeatureShowcase"
import { PWAInstallPrompt } from "@/components/pwa-install-prompt"
import { PWAUpdatePrompt } from "@/components/pwa-update-prompt"
import { OfflineIndicator } from "@/components/offline-indicator"
import { ProjectGridPC } from "@/components/project-grid-pc"

import { createClient } from "@/lib/supabase/client"
import { TemplateManager } from "@/lib/template-manager"
import { toast } from "sonner"
import { usePageTitle } from '@/hooks/use-page-title'

export default function LandingPage() {
  usePageTitle('Home')
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [templates, setTemplates] = useState<any[]>([])
  const [sortBy, setSortBy] = useState<string>('popular')
  const [filterBy, setFilterBy] = useState<string>('all')
  const [currentBadgeIndex, setCurrentBadgeIndex] = useState(0)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const badgeItems = [
    { icon: <Database className="w-4 h-4 text-blue-400" />, text: "Introducing PiPilot DB 🎉" },
    { icon: <Building2 className="w-4 h-4 text-purple-400" />, text: "PiPilot Enterprise now live 🚀" },
    { icon: <Users className="w-4 h-4 text-green-400" />, text: "PiPilot Teams Coming soon 🎉" },
    { icon: <Server className="w-4 h-4 text-orange-400" />, text: "PiPilot DB MCP Server Coming soon 🚀" },
    { icon: <Workflow className="w-4 h-4 text-indigo-400" />, text: "Teams Workspace Coming soon 🎉" },
    { icon: <Figma className="w-4 h-4 text-pink-400" />, text: "Figma Import Coming soon 🚀" }
  ]

  useEffect(() => {
    checkUser()
    loadTemplates()

    // Badge rotation effect
    const badgeInterval = setInterval(() => {
      setCurrentBadgeIndex((prev) => (prev + 1) % badgeItems.length)
    }, 5000) // Change every 3 seconds

    return () => clearInterval(badgeInterval)
  }, [])

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

  const loadTemplates = () => {
    const templateData = TemplateManager.getAllTemplates()
    setTemplates(templateData)
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

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />
      
      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Main Content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 pt-16">
       

        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="mb-2 flex items-center justify-center gap-1 text-xl font-medium leading-none text-white sm:text-2xl md:mb-2.5 md:gap-0 md:text-5xl">
            <span className="pt-0.5 tracking-tight md:pt-0">Build something</span>
            <div className="flex flex-col gap-1 ml-1.5 sm:ml-2 md:ml-4 mr-1.5 sm:mr-2 md:mr-4">
              <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-10 md:h-10 rounded-full heart-gradient flex items-center justify-center">
                <Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-5 md:h-5 text-white fill-current" />
              </div>
            </div>
            <span className="pt-0.5 tracking-tight md:pt-0"> Amazing</span>
          </h1>
          <p className="mb-6 text-center text-lg leading-tight text-white/65 md:text-xl">
            Create apps and websites by chatting with AI
          </p>
        </div>

        {/* Chat Input Section */}
        <div className="w-full max-w-4xl mx-auto">
          <PcChatInput onAuthRequired={handleAuthRequired} />
        </div>

        {/* Projects Section */}
        <div className="w-full max-w-7xl mx-auto mt-16">
          <ProjectGridPC />
        </div>
      </main>


      {/* Auth Modal */}
      <PcAuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
        onSuccess={handleAuthSuccess} 
      />
    </div>
  )
}
