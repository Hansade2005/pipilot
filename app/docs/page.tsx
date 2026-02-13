"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Response } from "@/components/ai-elements/response"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookOpen,
  Search,
  Menu,
  Zap,
  Code,
  Rocket,
  FileText,
  Server,
  Terminal,
  Layers,
  Brain,
  Workflow,
  Bot,
  Send,
  Loader2,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  Image as ImageIcon,
  Paperclip,
  Monitor,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Command,
  MessageSquare,
  Puzzle,
  GitBranch,
  HeadphonesIcon,
  ListTree,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { usePageTitle } from '@/hooks/use-page-title'

// Storage key for chat persistence
const STORAGE_KEY = 'pipilot_docs_chat'

// Types for multimodal messages
interface TextContent {
  type: 'text'
  text: string
}

interface ImageContent {
  type: 'image'
  image: string
}

type ContentPart = TextContent | ImageContent

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ContentPart[]
}

interface Attachment {
  type: 'image' | 'document' | 'screenshot'
  name: string
  data: string
  preview?: string
}

interface DocSection {
  title: string
  content: string
  search_keywords: string[]
  overview: string
}

interface DocsData {
  sections: DocSection[]
}

interface SectionGroup {
  label: string
  items: string[]
}

interface TocHeading {
  id: string
  text: string
  level: number
}

// Section groups for sidebar navigation
const sectionGroups: SectionGroup[] = [
  {
    label: "Getting Started",
    items: ["Introduction"]
  },
  {
    label: "Core Features",
    items: ["PiPilot Features", "Supported Frameworks", "Core PiPilot Capabilities"]
  },
  {
    label: "AI Agents",
    items: ["SWE Agent Capabilities", "PiPilot SWE Agent"]
  },
  {
    label: "Developer Tools",
    items: ["PiPilot MCP Server", "PiPilot SDK"]
  },
  {
    label: "Integrations",
    items: ["Integration System"]
  },
  {
    label: "Platform Features",
    items: ["Slash Commands System", "Conversation Branching", "AI Memory System", "Multi-Chat Session Support", "Codebase Search & Replace"]
  },
  {
    label: "Support",
    items: ["AI Support System"]
  }
]

// Icon mapping for sections
const sectionIcons: Record<string, any> = {
  'Introduction': BookOpen,
  'PiPilot Features': Zap,
  'Supported Frameworks': Layers,
  'Core PiPilot Capabilities': Rocket,
  'SWE Agent Capabilities': GitBranch,
  'PiPilot SWE Agent': Bot,
  'PiPilot MCP Server': Server,
  'PiPilot SDK': Code,
  'Integration System': Puzzle,
  'Slash Commands System': Terminal,
  'Conversation Branching': Workflow,
  'AI Memory System': Brain,
  'Multi-Chat Session Support': Layers,
  'Codebase Search & Replace': Search,
  'AI Support System': HeadphonesIcon,
}

// Extract headings from markdown content for TOC
function extractHeadings(content: string): TocHeading[] {
  const headings: TocHeading[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
      // Remove emoji at start
      const cleanText = text.replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]\s*/u, '')
      const id = cleanText.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-')
      headings.push({ id, text: cleanText, level })
    }
  }
  return headings
}

// Prepare messages for AI context
function prepareMessagesForAI(messages: ChatMessage[], currentMessage: ChatMessage): ChatMessage[] {
  const previousMessages = messages.map(msg => {
    if (typeof msg.content === 'string') return msg
    const textParts = msg.content.filter((p): p is TextContent => p.type === 'text')
    if (textParts.length === 0) {
      return { role: msg.role, content: '[User shared an image/screenshot]' }
    }
    const hadImages = msg.content.some(p => p.type === 'image')
    if (hadImages && textParts.length === 1) {
      return { role: msg.role, content: `${textParts[0].text}\n\n[Image/Screenshot was shared]` }
    }
    return { role: msg.role, content: textParts.length === 1 ? textParts[0].text : textParts }
  })
  return [...previousMessages, currentMessage]
}

export default function DocsPage() {
  usePageTitle('Documentation')
  const [searchQuery, setSearchQuery] = useState("")
  const [docsData, setDocsData] = useState<DocsData | null>(null)
  const [selectedSection, setSelectedSection] = useState<DocSection | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<DocSection[]>([])
  const [activeTocId, setActiveTocId] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // AI Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMinimized, setChatMinimized] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isCapturing, setIsCapturing] = useState(false)
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const toolTimerRef = useRef<NodeJS.Timeout | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Persistent screen sharing state
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)

  // Load docs data
  useEffect(() => {
    const loadDocsData = async () => {
      try {
        const response = await fetch('/docs.json')
        const data = await response.json()
        setDocsData(data)
        setSelectedSection(data.sections[0] || null)
      } catch (error) {
        console.error('Failed to load docs data:', error)
      }
    }
    loadDocsData()
  }, [])

  // Keyboard shortcut for search (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Focus search input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    } else {
      setSearchQuery("")
      setSearchResults([])
    }
  }, [searchOpen])

  // Search filtering
  useEffect(() => {
    if (!docsData || !searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const q = searchQuery.toLowerCase()
    const results = docsData.sections.filter(section =>
      section.title.toLowerCase().includes(q) ||
      section.overview.toLowerCase().includes(q) ||
      section.search_keywords.some(kw => kw.toLowerCase().includes(q)) ||
      section.content.toLowerCase().includes(q)
    )
    setSearchResults(results)
  }, [searchQuery, docsData])

  // TOC intersection observer
  useEffect(() => {
    if (!contentRef.current) return
    const headingElements = contentRef.current.querySelectorAll('h2[id], h3[id]')
    if (headingElements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveTocId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    )

    headingElements.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [selectedSection])

  // Extract TOC headings
  const tocHeadings = useMemo(() => {
    if (!selectedSection) return []
    return extractHeadings(selectedSection.content)
  }, [selectedSection])

  // Find current group for breadcrumb
  const currentGroup = useMemo(() => {
    if (!selectedSection) return null
    return sectionGroups.find(g => g.items.includes(selectedSection.title)) || null
  }, [selectedSection])

  // Scroll to heading
  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveTocId(id)
    }
  }

  // Copy page URL
  const handleCopyPage = () => {
    if (!selectedSection) return
    const slug = selectedSection.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
    navigator.clipboard.writeText(`${window.location.origin}/docs/${slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success("Link copied to clipboard")
  }

  // Navigate sections
  const navigateSection = (direction: 'prev' | 'next') => {
    if (!docsData || !selectedSection) return
    const allItems = sectionGroups.flatMap(g => g.items)
    const idx = allItems.indexOf(selectedSection.title)
    if (idx === -1) return
    const newIdx = direction === 'prev'
      ? (idx > 0 ? idx - 1 : allItems.length - 1)
      : (idx < allItems.length - 1 ? idx + 1 : 0)
    const newTitle = allItems[newIdx]
    const section = docsData.sections.find(s => s.title === newTitle)
    if (section) {
      setSelectedSection(section)
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // Get prev/next section info
  const navInfo = useMemo(() => {
    if (!docsData || !selectedSection) return { prev: null, next: null }
    const allItems = sectionGroups.flatMap(g => g.items)
    const idx = allItems.indexOf(selectedSection.title)
    return {
      prev: idx > 0 ? allItems[idx - 1] : null,
      next: idx < allItems.length - 1 ? allItems[idx + 1] : null
    }
  }, [docsData, selectedSection])

  // ==================== AI CHAT LOGIC (preserved) ====================

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (chatOpen && !chatMinimized) {
      chatInputRef.current?.focus()
    }
  }, [chatOpen, chatMinimized])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[]
        setMessages(parsed)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
    }
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
      } catch (error) {
        console.error('Failed to save chat history with images, trying without:', error)
        try {
          const textOnlyMessages = messages.map(msg => {
            if (typeof msg.content === 'string') return msg
            const textParts = msg.content.filter((p): p is TextContent => p.type === 'text')
            const hadImages = msg.content.some(p => p.type === 'image')
            if (textParts.length === 0) {
              return { role: msg.role, content: '[Image/Screenshot was shared]' }
            }
            if (hadImages) {
              return { role: msg.role, content: textParts[0].text + '\n\n[Image/Screenshot was shared]' }
            }
            return { role: msg.role, content: textParts.length === 1 ? textParts[0].text : textParts }
          })
          localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnlyMessages))
        } catch (e) {
          console.error('Failed to save chat history:', e)
        }
      }
    }
  }, [messages])

  const clearChat = useCallback(() => {
    setMessages([])
    setAttachments([])
    setToolStatus(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    toast.success("Chat history cleared")
  }, [])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) { toast.error("Please select an image file"); return }
      if (file.size > 10 * 1024 * 1024) { toast.error("Image must be less than 10MB"); return }
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        setAttachments(prev => [...prev, { type: 'image', name: file.name, data: dataUrl, preview: dataUrl }])
      }
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleDocUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const validTypes = ['text/plain', 'text/markdown', 'application/pdf']
      if (!validTypes.includes(file.type) && !file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
        toast.error("Please select a TXT, MD, or PDF file"); return
      }
      if (file.size > 5 * 1024 * 1024) { toast.error("Document must be less than 5MB"); return }
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        setAttachments(prev => [...prev, { type: 'document', name: file.name, data: content }])
      }
      file.type === 'application/pdf' ? reader.readAsDataURL(file) : reader.readAsText(file)
    })
    if (docInputRef.current) docInputRef.current.value = ''
  }, [])

  const startScreenSharing = useCallback(async () => {
    try {
      setIsCapturing(true)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as MediaTrackConstraints,
        audio: false
      })
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()
      screenStreamRef.current = stream
      screenVideoRef.current = video
      stream.getVideoTracks()[0].onended = () => stopScreenSharing()
      setIsScreenSharing(true)
      toast.success("Screen sharing started!")
    } catch (error) {
      if ((error as Error).name !== 'NotAllowedError') {
        toast.error("Failed to start screen sharing")
      }
    } finally {
      setIsCapturing(false)
    }
  }, [])

  const stopScreenSharing = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      screenStreamRef.current = null
    }
    screenVideoRef.current = null
    setIsScreenSharing(false)
    toast.success("Screen sharing stopped")
  }, [])

  const captureScreenFrame = useCallback((): string | null => {
    if (!screenVideoRef.current || !screenStreamRef.current) return null
    try {
      const video = screenVideoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(video, 0, 0)
      return canvas.toDataURL('image/png')
    } catch { return null }
  }, [])

  const handleScreenToggle = useCallback(() => {
    isScreenSharing ? stopScreenSharing() : startScreenSharing()
  }, [isScreenSharing, startScreenSharing, stopScreenSharing])

  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  const getMessageText = (content: string | ContentPart[]): string => {
    if (typeof content === 'string') return content
    const textPart = content.find(p => p.type === 'text') as TextContent | undefined
    return textPart?.text || ''
  }

  const getMessageImages = (content: string | ContentPart[]): string[] => {
    if (typeof content === 'string') return []
    return content.filter((p): p is ImageContent => p.type === 'image').map(p => p.image)
  }

  const handleSendMessage = async () => {
    if ((!chatInput.trim() && attachments.length === 0 && !isScreenSharing) || isLoading) return
    const userText = chatInput.trim()
    setChatInput("")
    let currentAttachments = [...attachments]
    if (isScreenSharing) {
      const screenFrame = captureScreenFrame()
      if (screenFrame) {
        currentAttachments.push({ type: 'screenshot', name: `Screen ${new Date().toLocaleTimeString()}`, data: screenFrame, preview: screenFrame })
      }
    }
    let messageContent: string | ContentPart[]
    if (currentAttachments.length > 0) {
      const contentParts: ContentPart[] = []
      if (userText) contentParts.push({ type: 'text', text: userText })
      for (const att of currentAttachments) {
        if (att.type === 'image' || att.type === 'screenshot') {
          contentParts.push({ type: 'image', image: att.data })
        } else if (att.type === 'document') {
          contentParts.push({ type: 'text', text: `[Document: ${att.name}]\n${att.data}` })
        }
      }
      messageContent = contentParts
    } else {
      messageContent = userText
    }
    const userMessage: ChatMessage = { role: 'user', content: messageContent }
    setMessages(prev => [...prev, userMessage])
    setAttachments([])
    setIsLoading(true)
    setToolStatus(null)
    toolTimerRef.current = setTimeout(() => setToolStatus('Searching documentation...'), 1200)
    try {
      const messagesForAI = prepareMessagesForAI(messages, userMessage)
      const response = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesForAI })
      })
      if (!response.ok) throw new Error('Failed to get response')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader available')
      const decoder = new TextDecoder()
      let assistantMessage = ''
      let firstChunkReceived = false
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!firstChunkReceived) {
          firstChunkReceived = true
          if (toolTimerRef.current) { clearTimeout(toolTimerRef.current); toolTimerRef.current = null }
          setToolStatus(null)
        }
        const chunk = decoder.decode(value)
        assistantMessage += chunk
        setMessages(prev => {
          const newMessages = [...prev]
          newMessages[newMessages.length - 1] = { role: 'assistant', content: assistantMessage }
          return newMessages
        })
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again or contact support at hello@pipilot.dev"
      }])
    } finally {
      if (toolTimerRef.current) { clearTimeout(toolTimerRef.current); toolTimerRef.current = null }
      setToolStatus(null)
      setIsLoading(false)
    }
  }

  // ==================== RENDER ====================

  const SidebarNav = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={`flex flex-col h-full ${isMobile ? '' : ''}`}>
      {/* Sidebar search (desktop only) */}
      {!isMobile && (
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-gray-900/60 border border-gray-800 rounded-lg hover:border-gray-700 hover:text-gray-400 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search docs...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-800 border border-gray-700 rounded">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        </div>
      )}

      <ScrollArea className="flex-1 px-3 pb-6">
        <nav className="space-y-6 py-3">
          {sectionGroups.map((group) => {
            // Check if any item in this group exists in our data
            const groupHasItems = docsData?.sections.some(s => group.items.includes(s.title))
            if (!groupHasItems) return null

            return (
              <div key={group.label}>
                <h4 className="px-3 mb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group.label}
                </h4>
                <div className="space-y-0.5">
                  {group.items.map(itemTitle => {
                    const section = docsData?.sections.find(s => s.title === itemTitle)
                    if (!section) return null
                    const isActive = selectedSection?.title === itemTitle
                    const Icon = sectionIcons[itemTitle] || BookOpen

                    return (
                      <button
                        key={itemTitle}
                        onClick={() => {
                          setSelectedSection(section)
                          if (isMobile) setSidebarOpen(false)
                          contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className={`relative w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all duration-150 group ${
                          isActive
                            ? 'bg-orange-500/10 text-orange-400 font-medium'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                        }`}
                      >
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r" />
                        )}
                        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-orange-400' : 'text-gray-600 group-hover:text-gray-400'}`} />
                        <span className="truncate">{itemTitle}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>
      </ScrollArea>
    </div>
  )

  return (
    <div className="h-screen flex flex-col bg-[#030305] overflow-hidden">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
      <input ref={docInputRef} type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" multiple className="hidden" onChange={handleDocUpload} />

      {/* ===== TOP NAVIGATION BAR ===== */}
      <header className="flex-shrink-0 h-14 border-b border-gray-800/60 bg-[#030305]/90 backdrop-blur-xl z-40 flex items-center px-4 lg:px-6">
        {/* Left: Logo + Brand */}
        <div className="flex items-center gap-3 mr-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="text-white font-semibold text-sm hidden sm:inline">PiPilot</span>
          </Link>
        </div>

        {/* Center: Search bar */}
        <div className="flex-1 flex justify-center max-w-xl mx-auto">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full max-w-md flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-900/50 border border-gray-800 rounded-lg hover:border-gray-700 hover:text-gray-400 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Search...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-800/80 border border-gray-700 rounded">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Right: Links */}
        <div className="flex items-center gap-2 ml-6">
          <Link href="/support" className="text-sm text-gray-400 hover:text-gray-200 transition-colors hidden sm:inline px-2 py-1">
            Support
          </Link>
          <Link href="/workspace">
            <Button size="sm" className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8 px-3 shadow-lg shadow-orange-500/20">
              Get Started
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </header>

      {/* ===== MAIN LAYOUT (3 columns) ===== */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT SIDEBAR (Desktop) */}
        <aside className="hidden lg:flex flex-col w-64 xl:w-72 border-r border-gray-800/60 bg-[#030305] flex-shrink-0">
          <SidebarNav />
        </aside>

        {/* Mobile Sidebar */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden fixed top-16 left-3 z-50 h-8 w-8 bg-gray-900/80 text-gray-400 hover:text-orange-400 hover:bg-gray-800 border border-gray-800 rounded-lg"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-[#030305] border-gray-800">
            <div className="pt-4">
              <SidebarNav isMobile />
            </div>
          </SheetContent>
        </Sheet>

        {/* MAIN CONTENT AREA */}
        <main
          ref={contentRef}
          className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 scroll-smooth"
        >
          {selectedSection ? (
            <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8 lg:py-10">
              {/* Breadcrumb */}
              {currentGroup && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
                  <span className="text-orange-400/80">{currentGroup.label}</span>
                </div>
              )}

              {/* Page Title + Actions */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
                  {selectedSection.title}
                </h1>
                <button
                  onClick={handleCopyPage}
                  className="flex-shrink-0 mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-300 bg-gray-900/50 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? 'Copied' : 'Copy link'}</span>
                </button>
              </div>

              {/* Overview */}
              <p className="text-gray-400 text-base lg:text-lg leading-relaxed mb-8">
                {selectedSection.overview}
              </p>

              {/* Markdown Content */}
              <article className="prose prose-lg prose-invert max-w-none
                prose-headings:scroll-mt-20
                prose-h1:text-2xl prose-h1:font-bold prose-h1:text-white prose-h1:mt-10 prose-h1:mb-4
                prose-h2:text-xl prose-h2:font-semibold prose-h2:text-white prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-800/60
                prose-h3:text-lg prose-h3:font-medium prose-h3:text-gray-200 prose-h3:mt-6 prose-h3:mb-3
                prose-p:text-gray-400 prose-p:leading-relaxed prose-p:mb-4
                prose-strong:text-gray-200 prose-strong:font-semibold
                prose-a:text-orange-400 prose-a:no-underline hover:prose-a:text-orange-300 hover:prose-a:underline
                prose-code:text-orange-300 prose-code:bg-gray-800/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-gray-900/80 prose-pre:border prose-pre:border-gray-800/60 prose-pre:rounded-xl prose-pre:p-4
                prose-ul:text-gray-400 prose-ol:text-gray-400 prose-li:text-gray-400 prose-li:marker:text-gray-600
                prose-blockquote:border-l-orange-500 prose-blockquote:text-gray-400 prose-blockquote:bg-orange-500/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-4
                prose-table:border-collapse
                prose-th:text-gray-300 prose-th:bg-gray-800/50 prose-th:p-3 prose-th:text-left prose-th:text-sm prose-th:font-medium prose-th:border prose-th:border-gray-800
                prose-td:p-3 prose-td:text-sm prose-td:text-gray-400 prose-td:border prose-td:border-gray-800/60
                prose-hr:border-gray-800/60
              ">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children, ...props }) => {
                      const text = typeof children === 'string' ? children :
                        Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : ''
                      const cleanText = String(text).replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]\s*/u, '')
                      const id = cleanText.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-')
                      return <h2 id={id} {...props}>{children}</h2>
                    },
                    h3: ({ children, ...props }) => {
                      const text = typeof children === 'string' ? children :
                        Array.isArray(children) ? children.map(c => typeof c === 'string' ? c : '').join('') : ''
                      const cleanText = String(text).replace(/^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]\s*/u, '')
                      const id = cleanText.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/--+/g, '-')
                      return <h3 id={id} {...props}>{children}</h3>
                    },
                  }}
                >
                  {selectedSection.content}
                </ReactMarkdown>
              </article>

              {/* Bottom Navigation */}
              <div className="mt-12 pt-8 border-t border-gray-800/60">
                <div className="flex items-center justify-between gap-4">
                  {navInfo.prev ? (
                    <button
                      onClick={() => navigateSection('prev')}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-orange-400 border border-gray-800 hover:border-orange-500/30 rounded-xl transition-all group"
                    >
                      <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                      <div className="text-left">
                        <div className="text-xs text-gray-600">Previous</div>
                        <div className="font-medium">{navInfo.prev}</div>
                      </div>
                    </button>
                  ) : <div />}
                  {navInfo.next ? (
                    <button
                      onClick={() => navigateSection('next')}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-gray-400 hover:text-orange-400 border border-gray-800 hover:border-orange-500/30 rounded-xl transition-all group text-right"
                    >
                      <div>
                        <div className="text-xs text-gray-600">Next</div>
                        <div className="font-medium">{navInfo.next}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ) : <div />}
                </div>
              </div>

              {/* Spacer for bottom */}
              <div className="h-16" />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-full">
              <div className="text-center">
                <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="h-8 w-8 text-orange-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">PiPilot Documentation</h3>
                <p className="text-gray-500">Select a section from the sidebar to get started</p>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR - Table of Contents (Desktop) */}
        {selectedSection && tocHeadings.length > 0 && (
          <aside className="hidden xl:flex flex-col w-56 2xl:w-64 flex-shrink-0 border-l border-gray-800/60">
            <div className="sticky top-0 px-4 py-8">
              <div className="flex items-center gap-2 mb-4">
                <ListTree className="h-3.5 w-3.5 text-gray-500" />
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">On this page</h4>
              </div>
              <nav className="space-y-0.5 max-h-[calc(100vh-180px)] overflow-y-auto pr-2">
                {tocHeadings.map((heading) => (
                  <button
                    key={heading.id}
                    onClick={() => scrollToHeading(heading.id)}
                    className={`block w-full text-left text-[13px] leading-snug py-1.5 transition-colors duration-150 ${
                      heading.level === 3 ? 'pl-3' : ''
                    } ${
                      activeTocId === heading.id
                        ? 'text-orange-400 font-medium'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {heading.text}
                  </button>
                ))}
              </nav>
            </div>
          </aside>
        )}
      </div>

      {/* ===== SEARCH COMMAND PALETTE ===== */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
              <Search className="h-4 w-4 text-gray-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-gray-200 placeholder:text-gray-500 text-sm outline-none"
                onKeyDown={e => {
                  if (e.key === 'Escape') setSearchOpen(false)
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    setSelectedSection(searchResults[0])
                    setSearchOpen(false)
                    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
              />
              <kbd className="px-1.5 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-800 border border-gray-700 rounded">
                ESC
              </kbd>
            </div>
            {searchQuery.trim() && (
              <div className="max-h-80 overflow-y-auto p-2">
                {searchResults.length > 0 ? (
                  searchResults.map((section, idx) => {
                    const Icon = sectionIcons[section.title] || BookOpen
                    const group = sectionGroups.find(g => g.items.includes(section.title))
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedSection(section)
                          setSearchOpen(false)
                          contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 transition-colors text-left group"
                      >
                        <Icon className="h-4 w-4 text-gray-500 group-hover:text-orange-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-gray-200 font-medium truncate">{section.title}</div>
                          <div className="text-xs text-gray-500 truncate">{group?.label} - {section.overview.slice(0, 80)}...</div>
                        </div>
                        <ArrowRight className="h-3 w-3 text-gray-600 group-hover:text-orange-400 flex-shrink-0" />
                      </button>
                    )
                  })
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No results found for "{searchQuery}"
                  </div>
                )}
              </div>
            )}
            {!searchQuery.trim() && (
              <div className="p-4 text-center text-gray-600 text-sm">
                Type to search across all documentation...
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== AI CHATBOT WIDGET ===== */}
      {!chatOpen && (
        <button
          onClick={() => { setChatOpen(true); setChatMinimized(false) }}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full shadow-2xl shadow-orange-500/20 flex items-center justify-center hover:scale-110 transition-all duration-300 group"
          aria-label="Open AI Chat"
        >
          <MessageSquare className="h-6 w-6 text-white" />
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#030305] animate-pulse" />
          <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl border border-gray-700">
            Ask PiPilot AI
          </div>
        </button>
      )}

      {chatOpen && (
        <div className={`fixed z-50 transition-all duration-300 ${
          chatMinimized ? 'bottom-6 right-6 w-72' : 'bottom-6 right-6 w-[400px] max-w-[calc(100vw-48px)]'
        }`}>
          <div className={`bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
            chatMinimized ? 'h-auto' : 'h-[600px] max-h-[calc(100vh-100px)]'
          }`}>
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-orange-600 to-orange-500 p-3.5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">PiPilot AI</h3>
                  <p className="text-white/70 text-[10px]">Documentation assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button onClick={clearChat} className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Clear chat">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setChatMinimized(!chatMinimized)} className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  {chatMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => setChatOpen(false)} className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!chatMinimized && (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                  {messages.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-14 h-14 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Bot className="h-7 w-7 text-orange-400" />
                      </div>
                      <h4 className="text-white font-medium text-sm mb-1">Hi! I'm PiPilot AI</h4>
                      <p className="text-gray-500 text-xs mb-4">Ask me anything about the docs!</p>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {["How do I get started?", "What frameworks are supported?", "How to deploy?"].map((q, i) => (
                          <button
                            key={i}
                            onClick={() => { setChatInput(q); setTimeout(() => handleSendMessage(), 100) }}
                            className="text-[11px] bg-gray-800 text-orange-400 px-2.5 py-1.5 rounded-full hover:bg-gray-700 transition-colors border border-gray-700/50"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex gap-2'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 bg-orange-500/15 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5">
                            <Bot className="h-3.5 w-3.5 text-orange-400" />
                          </div>
                        )}
                        <div className={`p-3 rounded-2xl ${
                          msg.role === 'user'
                            ? 'bg-orange-600 text-white rounded-br-sm'
                            : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                        }`}>
                          {getMessageImages(msg.content).length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {getMessageImages(msg.content).map((img, imgIdx) => (
                                <img key={imgIdx} src={img} alt="Attached" className="max-w-[200px] max-h-[150px] rounded-lg object-cover" />
                              ))}
                            </div>
                          )}
                          {msg.role === 'assistant' ? (
                            <Response className="text-sm text-gray-200 prose prose-sm prose-invert max-w-none overflow-hidden break-words [word-break:break-word] [&>p]:text-gray-200 [&>ul]:text-gray-200 [&>ol]:text-gray-200 [&>li]:text-gray-200 [&>h1]:text-gray-100 [&>h2]:text-gray-100 [&>h3]:text-gray-100 [&>h4]:text-gray-100 [&>a]:text-orange-400 [&>a]:hover:text-orange-300 [&>a]:break-all [&>code]:bg-gray-700 [&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded [&>code]:break-all [&>pre]:bg-gray-900 [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:max-w-full [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-all [&>blockquote]:border-orange-500">
                              {getMessageText(msg.content)}
                            </Response>
                          ) : (
                            <div className="text-sm whitespace-pre-wrap leading-relaxed">
                              {getMessageText(msg.content)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {isLoading && messages[messages.length - 1]?.role === 'user' && (
                    <div className="flex justify-start">
                      <div className="flex gap-2">
                        <div className="w-6 h-6 bg-orange-500/15 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-orange-400" />
                        </div>
                        <div className="bg-gray-800 p-3 rounded-2xl rounded-bl-sm">
                          {toolStatus ? (
                            <div className="flex items-center gap-2 text-orange-400">
                              <Search className="h-3.5 w-3.5 animate-pulse" />
                              <span className="text-xs">{toolStatus}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-orange-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span className="text-xs">Thinking...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Attachments Preview */}
                {attachments.length > 0 && (
                  <div className="px-4 pb-2">
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((att, idx) => (
                        <div key={idx} className="relative group">
                          {att.preview ? (
                            <img src={att.preview} alt={att.name} className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                              <FileText className="h-5 w-5 text-gray-400" />
                            </div>
                          )}
                          <button onClick={() => removeAttachment(idx)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="h-2.5 w-2.5 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input Area */}
                <div className="p-3 border-t border-gray-800 flex-shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-orange-400 bg-gray-800/50 hover:bg-gray-800 px-2 py-1 rounded-md transition-colors" title="Upload image">
                      <ImageIcon className="h-3 w-3" /><span>Image</span>
                    </button>
                    <button onClick={() => docInputRef.current?.click()} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-orange-400 bg-gray-800/50 hover:bg-gray-800 px-2 py-1 rounded-md transition-colors" title="Attach document">
                      <Paperclip className="h-3 w-3" /><span>Doc</span>
                    </button>
                    <button
                      onClick={handleScreenToggle}
                      disabled={isCapturing}
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors disabled:opacity-50 ${
                        isScreenSharing ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30' : 'text-gray-500 hover:text-orange-400 bg-gray-800/50 hover:bg-gray-800'
                      }`}
                      title={isScreenSharing ? "Stop screen sharing" : "Start screen sharing"}
                    >
                      {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Monitor className="h-3 w-3" />}
                      <span>{isScreenSharing ? 'Sharing' : 'Screen'}</span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      ref={chatInputRef}
                      type="text"
                      placeholder="Ask about the docs..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      className="flex-1 h-9 bg-gray-800/50 border-gray-700/60 text-gray-200 placeholder:text-gray-500 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50"
                      disabled={isLoading}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={isLoading || (!chatInput.trim() && attachments.length === 0)}
                      className="h-9 w-9 rounded-xl bg-orange-600 hover:bg-orange-500 p-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
