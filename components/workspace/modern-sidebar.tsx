"use client"

import React, { useState, useEffect } from "react"
import type { User } from "@supabase/supabase-js"
import type { Workspace as Project } from "@/lib/storage-manager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Home,
  Search,
  Folder,
  Database,
  BookOpen,
  Settings,
  LogOut,
  X,
  Coins,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Layout,
  Github
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { timeAgo } from "@/lib/utils"

interface ModernSidebarProps {
  user: User
  projects?: Project[]
  selectedProject?: Project | null
  onSelectProject?: (project: Project) => void
  isExpanded?: boolean
  onToggleExpanded?: () => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
  isMobile?: boolean
}

export function ModernSidebar({
  user,
  projects = [],
  selectedProject,
  onSelectProject,
  isExpanded = false,
  onToggleExpanded,
  isMobileOpen = false,
  onMobileClose,
  isMobile = false
}: ModernSidebarProps) {
  const router = useRouter()
  const [isHovered, setIsHovered] = useState(false)
  const shouldExpand = isMobile ? isMobileOpen : (isExpanded || isHovered)
  
  // Search state
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  
  // Credits state
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [estimatedMessages, setEstimatedMessages] = useState<number>(0)
  const [loadingCredits, setLoadingCredits] = useState(true)

  // Fetch credit balance
  useEffect(() => {
    const fetchCreditBalance = async () => {
      if (!user?.id) return

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('wallet')
          .select('credits_balance, current_plan, credits_used_this_month')
          .eq('user_id', user.id)
          .single()

        if (error) {
          console.error('Error fetching credit balance:', error)
          return
        }

        if (data) {
          setCreditBalance(data.credits_balance)
          setCurrentPlan(data.current_plan)
          setEstimatedMessages(Math.floor(data.credits_balance / 0.25))
        }
      } catch (error) {
        console.error('Exception fetching credit balance:', error)
      } finally {
        setLoadingCredits(false)
      }
    }

    fetchCreditBalance()
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchCreditBalance, 5000)
    return () => clearInterval(interval)
  }, [user?.id])

  // Filter projects based on search
  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (project.description && project.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
  }

  const handleNavigation = (href: string) => {
    router.push(href)
    
    // Close mobile sidebar after navigation
    if (isMobile && onMobileClose) {
      onMobileClose()
    }
  }

  const handleProjectSelect = (project: Project) => {
    // Navigate to project URL instead of handling internally
    router.push(`/workspace?projectId=${project.id}`)
    setShowSearchModal(false)
    
    // Close mobile sidebar after selection
    if (isMobile && onMobileClose) {
      onMobileClose()
    }
  }

  const SidebarContent = () => (
    <>
      <div className="flex flex-col flex-1 w-full">
        {/* Header with Logo and Close Button */}
        <div className={`flex items-center w-full h-14 px-3 border-b border-gray-800/60 ${shouldExpand ? 'justify-between' : 'justify-center'}`}>
          <div className="flex items-center cursor-pointer" onClick={() => window.location.href = '/'}>
            <div className="w-10 h-10 bg-gradient-to-br rounded-lg flex-shrink-0 flex items-center justify-center">
              <img src="https://pipilot.dev/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
            </div>
            {shouldExpand && (
              <span className="ml-3 text-sm font-semibold text-white"></span>
            )}
          </div>

          {/* Close Button - only shown on mobile sidebar */}
          {isMobile && isMobileOpen && onMobileClose && (
            <button
              onClick={onMobileClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              aria-label="Close sidebar"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex flex-col space-y-1 px-2 py-3">
          {/* Home */}
          <button
            onClick={() => window.location.href = '/workspace'}
            className={`flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors ${
              shouldExpand ? 'justify-start' : 'justify-center'
            }`}
          >
            <Home size={18} />
            {shouldExpand && <span className="ml-3 text-sm">Dashoard</span>}
          </button>

          {/* Credits Accordion */}
          {shouldExpand && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="credits" className="border-0">
                <AccordionTrigger className="py-2 px-2 hover:no-underline hover:bg-gray-800 rounded-md transition-colors">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-orange-400" />
                      <span className="text-sm text-gray-400">Credits</span>
                    </div>
                    {!loadingCredits && creditBalance !== null && (
                      <span className="text-xs font-bold text-orange-400 mr-2">
                        {creditBalance.toFixed(2)}
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2">
                  <div className="bg-gray-800/50 rounded-md p-3 space-y-2">
                    {!loadingCredits && creditBalance !== null && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400">~{estimatedMessages} messages</span>
                          <span className="text-orange-400 capitalize">{currentPlan}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {creditBalance > 10 ? (
                            <div className="flex items-center gap-1 text-orange-400">
                              <TrendingUp className="h-3 w-3" />
                              <span className="text-xs">Good balance</span>
                            </div>
                          ) : creditBalance > 2 ? (
                            <div className="flex items-center gap-1 text-yellow-400">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="text-xs">Low balance</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-400">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="text-xs">Very low</span>
                            </div>
                          )}
                        </div>

                        <Button
                          size="sm"
                          className="w-full h-8 text-xs bg-orange-600 hover:bg-orange-500"
                          onClick={() => handleNavigation('/pricing')}
                        >
                          <CreditCard className="h-3 w-3 mr-1" />
                          {currentPlan === 'free' ? 'Upgrade' : 'Top Up'}
                        </Button>
                      </>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Credits Icon Only (when collapsed) */}
          {!shouldExpand && (
            <button
              onClick={() => handleNavigation('/pricing')}
              className="flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors justify-center"
            >
              <Coins size={18} />
            </button>
          )}

          {/* Search */}
          <button
            onClick={() => setShowSearchModal(true)}
            className={`flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors ${
              shouldExpand ? 'justify-start' : 'justify-center'
            }`}
          >
            <Search size={18} />
            {shouldExpand && <span className="ml-3 text-sm">Search</span>}
          </button>

          {/* Templates */}
          <button
            onClick={() => router.push('/workspace?view=templates')}
            className={`flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors ${
              shouldExpand ? 'justify-start' : 'justify-center'
            }`}
          >
            <Layout size={18} />
            {shouldExpand && <span className="ml-3 text-sm">Templates</span>}
          </button>

          {/* SWE Agent */}
          <button
            onClick={() => router.push('/workspace?view=repo-agent')}
            className={`flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors ${
              shouldExpand ? 'justify-start' : 'justify-center'
            }`}
          >
            <Github size={18} />
            {shouldExpand && <span className="ml-3 text-sm">SWE Agent</span>}
          </button>

          {/* All Works Accordion */}
          {shouldExpand && projects.length > 0 && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="projects" className="border-0">
                <AccordionTrigger className="py-2 px-2 hover:no-underline hover:bg-gray-800 rounded-md transition-colors">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-400">All Works</span>
                    <span className="text-xs text-gray-500 ml-auto mr-2">{projects.length}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-2 pb-2">
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() => handleProjectSelect(project)}
                        className={`w-full flex items-start gap-2 p-2 rounded-md transition-colors ${
                          selectedProject?.id === project.id
                            ? 'bg-orange-600/20 text-orange-400'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                      >
                        <Folder className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 text-left">
                          <div className="text-xs font-medium truncate">{project.name}</div>
                          <div className="text-xs text-gray-500">{timeAgo(project.lastActivity)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* All Works Icon Only (when collapsed) */}
          {!shouldExpand && projects.length > 0 && (
            <button
              onClick={() => setShowSearchModal(true)}
              className="flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors justify-center relative"
            >
              <Folder size={18} />
              {projects.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {projects.length > 9 ? '9+' : projects.length}
                </span>
              )}
            </button>
          )}
        </nav>
      </div>

      {/* Bottom Navigation */}
      <div className="flex flex-col space-y-1 px-2 pb-3 border-t border-gray-800/60 pt-3">
        {/* Database */}
        <button
          onClick={() => handleNavigation('/database')}
          className={`flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors ${
            shouldExpand ? 'justify-start' : 'justify-center'
          }`}
        >
          <Database size={18} />
          {shouldExpand && <span className="ml-3 text-sm">PiPilot DB</span>}
        </button>

        {/* AI Platform */}
        <button
          onClick={() => handleNavigation('/ai/platform')}
          className={`flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors ${
            shouldExpand ? 'justify-start' : 'justify-center'
          }`}
        >
          <Sparkles size={18} />
          {shouldExpand && <span className="ml-3 text-sm">PiPilot AI</span>}
        </button>

        {/* Docs */}
        <button
          onClick={() => window.open('https://pipilot.dev/docs', '_blank')}
          className={`flex items-center w-full h-10 px-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors ${
            shouldExpand ? 'justify-start' : 'justify-center'
          }`}
        >
          <BookOpen size={18} />
          {shouldExpand && <span className="ml-3 text-sm">Docs</span>}
        </button>

        {/* User Profile */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button 
              className={`flex items-center w-full h-10 px-2 ${shouldExpand ? 'justify-start' : 'justify-center'} hover:bg-gray-800 rounded-md transition-colors`}
            >
              <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {user.email?.charAt(0).toUpperCase() || 'A'}
                </span>
              </div>
              {shouldExpand && <span className="ml-3 text-sm text-gray-400">Profile</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-800 z-[100]">
            <DropdownMenuItem 
              onClick={() => {
                handleNavigation('/workspace/account')
              }}
              className="text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <Settings className="mr-2 h-4 w-4" />
              Account
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-800" />
            <DropdownMenuItem 
              onClick={handleSignOut}
              className="text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )

  // Mobile Sidebar
  if (isMobile) {
    return (
      <>
        {/* Mobile Overlay */}
        {isMobileOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-[60]"
            onClick={onMobileClose}
            aria-hidden="true"
          />
        )}

        {/* Mobile Sidebar - only renders when open */}
        {isMobileOpen && (
          <aside
            className="lg:hidden fixed inset-y-0 left-0 z-[70] w-64 bg-gray-950 flex flex-col border-r border-gray-800/60"
            role="dialog"
            aria-modal="true"
          >
            <SidebarContent />
          </aside>
        )}

        {/* Search Modal */}
        <Dialog open={showSearchModal} onOpenChange={setShowSearchModal}>
          <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl z-[80]">
            <DialogHeader>
              <DialogTitle className="text-white">Search Projects</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Type to search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                  autoFocus
                />
              </div>
              
              <div className="max-h-96 overflow-y-auto space-y-2">
                {filteredProjects.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No projects found</p>
                  </div>
                ) : (
                  filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectSelect(project)}
                      className="w-full flex items-start gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-left"
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex-shrink-0 flex items-center justify-center">
                        <Folder className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{project.name}</div>
                        {project.description && (
                          <div className="text-xs text-gray-400 line-clamp-1">{project.description}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">{timeAgo(project.lastActivity)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // Mobile/Tablet Sidebar
  if (isMobile) {
    return (
      <>
        {/* Mobile/Tablet Sidebar Overlay */}
        <div
          className={`fixed inset-0 z-50 lg:hidden ${
            isMobileOpen ? 'block' : 'hidden'
          }`}
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onMobileClose}
          />

          {/* Sidebar */}
          <aside className="fixed left-0 top-0 h-full w-64 bg-black border-r border-gray-800 z-50">
            <SidebarContent />
          </aside>
        </div>
      </>
    )
  }

  // Desktop Sidebar
  return (
    <>
      <aside
        className={`hidden lg:flex bg-gray-950 flex-col border-r border-gray-800/60 transition-all duration-300 relative ${
          shouldExpand ? 'w-64' : 'w-14'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <SidebarContent />
      </aside>

      {/* Search Modal for Desktop */}
      <Dialog open={showSearchModal} onOpenChange={setShowSearchModal}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Search Projects</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Type to search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                autoFocus
              />
            </div>
            
            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No projects found</p>
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-left"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex-shrink-0 flex items-center justify-center">
                      <Folder className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{project.name}</div>
                      {project.description && (
                        <div className="text-xs text-gray-400 line-clamp-1">{project.description}</div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">{timeAgo(project.lastActivity)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
