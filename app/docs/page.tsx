"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Response } from "@/components/ai-elements/response"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  BookOpen,
  Search,
  ArrowRight,
  Menu,
  Zap,
  Database,
  Cloud,
  Lock,
  Code,
  Rocket,
  FileText,
  Server,
  Terminal,
  Layers,
  Shield,
  Brain,
  Settings,
  Workflow,
  CheckCircle,
  AlertCircle,
  Info,
  Clock,
  Bot,
  Send,
  Loader2,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  Image as ImageIcon,
  Paperclip,
  Camera,
  Monitor,
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

// Prepare messages for AI context - strip images from OLD messages, keep current message intact
// This prevents sending old images as context while allowing current images to be analyzed
function prepareMessagesForAI(messages: ChatMessage[], currentMessage: ChatMessage): ChatMessage[] {
  const previousMessages = messages.map(msg => {
    if (typeof msg.content === 'string') return msg
    // For old messages, only keep text content (no images)
    const textParts = msg.content.filter((p): p is TextContent => p.type === 'text')
    if (textParts.length === 0) {
      return { role: msg.role, content: '[User shared an image/screenshot]' }
    }
    // If there were images, note that images were shared but don't include them
    const hadImages = msg.content.some(p => p.type === 'image')
    if (hadImages && textParts.length === 1) {
      return { role: msg.role, content: `${textParts[0].text}\n\n[Image/Screenshot was shared]` }
    }
    return { role: msg.role, content: textParts.length === 1 ? textParts[0].text : textParts }
  })
  // Add current message with full content (including images)
  return [...previousMessages, currentMessage]
}

export default function DocsPage() {
  usePageTitle('Documentation')
  const [searchQuery, setSearchQuery] = useState("")
  const [docsData, setDocsData] = useState<DocsData | null>(null)
  const [filteredSections, setFilteredSections] = useState<DocSection[]>([])
  const [selectedSection, setSelectedSection] = useState<DocSection | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Persistent screen sharing state
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const loadDocsData = async () => {
      try {
        const response = await fetch('/docs.json')
        const data = await response.json()
        setDocsData(data)
        setFilteredSections(data.sections)
        setSelectedSection(data.sections[0] || null) // Select first section by default
      } catch (error) {
        console.error('Failed to load docs data:', error)
      }
    }

    loadDocsData()
  }, [])

  useEffect(() => {
    if (docsData) {
      const filtered = docsData.sections.filter(section =>
        section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        section.overview.toLowerCase().includes(searchQuery.toLowerCase()) ||
        section.search_keywords.some(keyword =>
          keyword.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
      setFilteredSections(filtered)
    }
  }, [searchQuery, docsData])

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Focus input when chat opens
  useEffect(() => {
    if (chatOpen && !chatMinimized) {
      inputRef.current?.focus()
    }
  }, [chatOpen, chatMinimized])

  // Load chat history from localStorage on mount
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

  // Save chat history to localStorage when messages change (includes images for display)
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // Save full messages including images for display purposes
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
      } catch (error) {
        // If storage fails (quota exceeded due to images), try saving without images
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

  // Clear chat history
  const clearChat = useCallback(() => {
    setMessages([])
    setAttachments([])
    setToolStatus(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear chat history from storage:', error)
    }
    toast.success("Chat history cleared")
  }, [])

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        toast.error("Please select an image file")
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image must be less than 10MB")
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        setAttachments(prev => [...prev, {
          type: 'image',
          name: file.name,
          data: dataUrl,
          preview: dataUrl
        }])
      }
      reader.readAsDataURL(file)
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Handle document upload
  const handleDocUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const validTypes = ['text/plain', 'text/markdown', 'application/pdf']
      if (!validTypes.includes(file.type) && !file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
        toast.error("Please select a TXT, MD, or PDF file")
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("Document must be less than 5MB")
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        setAttachments(prev => [...prev, {
          type: 'document',
          name: file.name,
          data: content
        }])
      }

      if (file.type === 'application/pdf') {
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file)
      }
    })

    if (docInputRef.current) docInputRef.current.value = ''
  }, [])

  // Start persistent screen sharing
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

      stream.getVideoTracks()[0].onended = () => {
        stopScreenSharing()
      }

      setIsScreenSharing(true)
      toast.success("Screen sharing started! Screenshots will be auto-attached to your messages.")
    } catch (error) {
      if ((error as Error).name !== 'NotAllowedError') {
        toast.error("Failed to start screen sharing")
        console.error('Screen share error:', error)
      }
    } finally {
      setIsCapturing(false)
    }
  }, [])

  // Stop screen sharing
  const stopScreenSharing = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
      screenStreamRef.current = null
    }
    screenVideoRef.current = null
    setIsScreenSharing(false)
    toast.success("Screen sharing stopped")
  }, [])

  // Capture frame from active screen share
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
    } catch (error) {
      console.error('Failed to capture frame:', error)
      return null
    }
  }, [])

  // Toggle screen sharing
  const handleScreenToggle = useCallback(() => {
    if (isScreenSharing) {
      stopScreenSharing()
    } else {
      startScreenSharing()
    }
  }, [isScreenSharing, startScreenSharing, stopScreenSharing])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Remove attachment
  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  // Helper to get display content from message
  const getMessageText = (content: string | ContentPart[]): string => {
    if (typeof content === 'string') return content
    const textPart = content.find(p => p.type === 'text') as TextContent | undefined
    return textPart?.text || ''
  }

  // Helper to get images from message
  const getMessageImages = (content: string | ContentPart[]): string[] => {
    if (typeof content === 'string') return []
    return content
      .filter((p): p is ImageContent => p.type === 'image')
      .map(p => p.image)
  }

  // Handle AI chat submission with streaming
  const handleSendMessage = async () => {
    if ((!chatInput.trim() && attachments.length === 0 && !isScreenSharing) || isLoading) return

    const userText = chatInput.trim()
    setChatInput("")

    // Auto-capture screen if sharing is active
    let currentAttachments = [...attachments]
    if (isScreenSharing) {
      const screenFrame = captureScreenFrame()
      if (screenFrame) {
        currentAttachments.push({
          type: 'screenshot',
          name: `Screen ${new Date().toLocaleTimeString()}`,
          data: screenFrame,
          preview: screenFrame
        })
      }
    }

    let messageContent: string | ContentPart[]

    if (currentAttachments.length > 0) {
      const contentParts: ContentPart[] = []

      if (userText) {
        contentParts.push({ type: 'text', text: userText })
      }

      for (const att of currentAttachments) {
        if (att.type === 'image' || att.type === 'screenshot') {
          contentParts.push({ type: 'image', image: att.data })
        } else if (att.type === 'document') {
          contentParts.push({
            type: 'text',
            text: `[Document: ${att.name}]\n${att.data}`
          })
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

    // Set a timer to show "Searching docs..." if response takes a while (indicating tool use)
    toolTimerRef.current = setTimeout(() => {
      setToolStatus('Searching documentation...')
    }, 1200)

    try {
      // Prepare messages for AI - strip images from old messages, keep current message images
      const messagesForAI = prepareMessagesForAI(messages, userMessage)

      const response = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesForAI
        })
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

        // Clear tool status when first real content arrives
        if (!firstChunkReceived) {
          firstChunkReceived = true
          if (toolTimerRef.current) {
            clearTimeout(toolTimerRef.current)
            toolTimerRef.current = null
          }
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
      if (toolTimerRef.current) {
        clearTimeout(toolTimerRef.current)
        toolTimerRef.current = null
      }
      setToolStatus(null)
      setIsLoading(false)
    }
  }

  const getIconForSection = (title: string) => {
    const iconMap: { [key: string]: any } = {
      'Introduction': BookOpen,
      'Core PiPilot Capabilities': Zap,
      'AI-Powered Development Assistant': Brain,
      'File System Operations': Settings,
      'Professional Development Standards': CheckCircle,
      'Framework Support': Layers,
      'Professional Design System': FileText,
      'Available Dependencies': Code,
      'Backend Integration (Supabase)': Database,
      'Advanced Features': Rocket,
      'Database as a Service': Server,
      'Deployment & Hosting': Cloud,
      'Communication Standards': Info,
      'Development Workflow': Workflow,
      'Use Cases': Terminal,
      'Security Best Practices': Shield,
      'Performance Optimization': Zap,
      'Troubleshooting Guide': AlertCircle,
      'MCP Server Integration': Server,
      'PiPilot SDK': Code,
      // New feature sections
      'Slash Commands System': Terminal,
      'Conversation Branching': Workflow,
      'AI Memory System': Brain,
      'Multi-Chat Session Support': Layers,
      'Codebase Search & Replace': Search
    }
    return iconMap[title] || BookOpen
  }

  const getColorForSection = (title: string) => {
    const colorMap: { [key: string]: string } = {
      'Introduction': 'purple',
      'Core PiPilot Capabilities': 'blue',
      'AI-Powered Development Assistant': 'green',
      'File System Operations': 'orange',
      'Professional Development Standards': 'red',
      'Framework Support': 'indigo',
      'Professional Design System': 'pink',
      'Available Dependencies': 'yellow',
      'Backend Integration (Supabase)': 'blue',
      'Advanced Features': 'purple',
      'Database as a Service': 'green',
      'Deployment & Hosting': 'orange',
      'Communication Standards': 'indigo',
      'Development Workflow': 'pink',
      'Use Cases': 'yellow',
      'Security Best Practices': 'red',
      'Performance Optimization': 'purple',
      'Troubleshooting Guide': 'gray',
      'MCP Server Integration': 'blue',
      'PiPilot SDK': 'green',
      // New feature sections
      'Slash Commands System': 'orange',
      'Conversation Branching': 'indigo',
      'AI Memory System': 'green',
      'Multi-Chat Session Support': 'blue',
      'Codebase Search & Replace': 'pink'
    }
    return colorMap[title] || 'purple'
  }

  const getReadTime = (content: string) => {
    const wordsPerMinute = 200
    const wordCount = content.split(' ').length
    const minutes = Math.ceil(wordCount / wordsPerMinute)
    return `${minutes} min`
  }

  const navigateToSection = (direction: 'prev' | 'next'): void => {
    if (!docsData || !selectedSection) return

    const currentIndex = docsData.sections.findIndex(section => section.title === selectedSection.title)
    if (currentIndex === -1) return

    let newIndex: number
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : docsData.sections.length - 1
    } else {
      newIndex = currentIndex < docsData.sections.length - 1 ? currentIndex + 1 : 0
    }

    setSelectedSection(docsData.sections[newIndex])
  }

  const createSlug = (title: string): string => {
    return title.toLowerCase().replace(/[^\\w\\s-]/g, '').replace(/\\s+/g, '-').replace(/--+/g, '-')
  }

  const colorClasses = {
    purple: "from-purple-500 to-pink-500",
    blue: "from-blue-500 to-cyan-500",
    green: "from-green-500 to-emerald-500",
    orange: "from-orange-500 to-red-500",
    pink: "from-pink-500 to-rose-500",
    yellow: "from-yellow-500 to-orange-500",
    indigo: "from-indigo-500 to-purple-500",
    red: "from-red-500 to-pink-500",
    gray: "from-gray-500 to-gray-600"
  }

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className={`${isMobile ? '' : 'w-80 border-r border-gray-800'} h-full bg-gray-900/50 flex flex-col max-h-screen`}>
      <div className="p-4 border-b border-gray-800 flex-shrink-0">
        <h2 className="text-lg font-semibold text-white mb-4">Documentation</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search docs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-gray-800/50 border-gray-700 text-white placeholder-gray-400 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4 min-h-0">
        <div className="space-y-2">
          {filteredSections.map((section, index) => {
            const IconComponent = getIconForSection(section.title)
            const color = getColorForSection(section.title)
            const isSelected = selectedSection?.title === section.title

            return (
              <button
                key={index}
                onClick={() => {
                  setSelectedSection(section)
                  if (isMobile) setSidebarOpen(false)
                }}
                className={`w-full text-left p-3 rounded-lg transition-all hover:bg-gray-800/50 ${
                  isSelected ? 'bg-purple-600/20 border border-purple-500/30' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-md bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} flex-shrink-0`}>
                    <IconComponent className="h-4 w-4 text-white" />
                  </div>
                  <h3 className="text-sm font-medium text-white truncate">
                    {section.title}
                  </h3>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )

  const ContentArea = () => {
    if (!selectedSection) {
      return (
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="text-center">
            <BookOpen className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Welcome to PiPilot Documentation</h3>
            <p className="text-gray-400">Select a section from the sidebar to get started</p>
          </div>
        </div>
      )
    }

    const IconComponent = getIconForSection(selectedSection.title)
    const color = getColorForSection(selectedSection.title)
    const slug = createSlug(selectedSection.title)

    return (
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-lg bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]}`}>
                  <IconComponent className="h-8 w-8 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-white mb-2">{selectedSection.title}</h1>
                  <p className="text-lg text-gray-300 mb-4">{selectedSection.overview}</p>
                  <div className="flex items-center gap-4">
                    <Badge variant="outline" className="border-gray-600 text-gray-400">
                      <Clock className="w-4 h-4 mr-1" />
                      {getReadTime(selectedSection.content)} read
                    </Badge>
                    <Link href={`/docs/${slug}`}>
                      <Button variant="outline" size="sm" className="border-gray-700 text-white hover:bg-gray-800">
                        View Full Article
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-2">
                {selectedSection.search_keywords.map((keyword, index) => (
                  <Badge key={index} variant="secondary" className="bg-gray-700/50 text-gray-300">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="prose prose-lg prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({children, ...props}) => (
                    <h1 className="text-3xl font-bold text-white mt-8 mb-4 first:mt-0" {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({children, ...props}) => (
                    <h2 className="text-2xl font-semibold text-white mt-6 mb-3" {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({children, ...props}) => (
                    <h3 className="text-xl font-medium text-white mt-4 mb-2" {...props}>
                      {children}
                    </h3>
                  ),
                  p: ({children, ...props}) => (
                    <p className="text-gray-300 leading-relaxed mb-4" {...props}>
                      {children}
                    </p>
                  ),
                  ul: ({children, ...props}) => (
                    <ul className="text-gray-300 leading-relaxed mb-4 ml-6 list-disc" {...props}>
                      {children}
                    </ul>
                  ),
                  ol: ({children, ...props}) => (
                    <ol className="text-gray-300 leading-relaxed mb-4 ml-6 list-decimal" {...props}>
                      {children}
                    </ol>
                  ),
                  li: ({children, ...props}) => (
                    <li className="mb-1" {...props}>
                      {children}
                    </li>
                  ),
                  code: ({children, ...props}) => (
                    <code className="bg-gray-800 px-2 py-1 rounded text-sm font-mono text-green-400" {...props}>
                      {children}
                    </code>
                  ),
                  pre: ({children, ...props}) => (
                    <pre className="bg-gray-800 p-4 rounded-lg overflow-x-auto mb-4" {...props}>
                      {children}
                    </pre>
                  ),
                  blockquote: ({children, ...props}) => (
                    <blockquote className="border-l-4 border-purple-500 pl-4 italic text-gray-400 mb-4" {...props}>
                      {children}
                    </blockquote>
                  ),
                  strong: ({children, ...props}) => (
                    <strong className="font-semibold text-white" {...props}>
                      {children}
                    </strong>
                  ),
                  em: ({children, ...props}) => (
                    <em className="italic text-gray-300" {...props}>
                      {children}
                    </em>
                  )
                }}
              >
                {selectedSection.content}
              </ReactMarkdown>
            </div>

            {/* Navigation */}
            <div className="mt-12 pt-8 border-t border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button 
                    variant="outline" 
                    className="border-gray-700 text-white hover:bg-gray-800"
                    onClick={() => navigateToSection('prev')}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-gray-700 text-white hover:bg-gray-800"
                    onClick={() => navigateToSection('next')}
                  >
                    Next
                  </Button>
                </div>
                <Link href={`/docs/${slug}`}>
                  <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                    Read Full Article
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageUpload}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
        multiple
        className="hidden"
        onChange={handleDocUpload}
      />

      <Navigation />

      <div className="pt-16 h-screen flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <SidebarContent />
        </div>

        {/* Mobile Sidebar */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden fixed top-20 left-4 z-50 bg-gray-800/80 text-white hover:bg-gray-700"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0 bg-gray-900 border-gray-800">
            <SidebarContent isMobile />
          </SheetContent>
        </Sheet>

        {/* Content Area */}
        <ContentArea />
      </div>

      <Footer />

      {/* Floating AI Chatbot Widget */}
      {!chatOpen && (
        <button
          onClick={() => {
            setChatOpen(true)
            setChatMinimized(false)
          }}
          className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-300 group"
          aria-label="Open AI Chat"
        >
          <Bot className="h-8 w-8 text-white" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900 animate-pulse" />
          <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
            Ask PiPilot AI
          </div>
        </button>
      )}

      {/* Chat Window */}
      {chatOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 ${
            chatMinimized
              ? 'bottom-6 right-6 w-72'
              : 'bottom-6 right-6 w-[420px] max-w-[calc(100vw-48px)]'
          }`}
        >
          <div className={`bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
            chatMinimized ? 'h-auto' : 'h-[650px] max-h-[calc(100vh-100px)]'
          }`}>
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">PiPilot AI</h3>
                  <p className="text-white/70 text-xs">Powered by Claude Opus 4.5</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={clearChat}
                  className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                  title="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setChatMinimized(!chatMinimized)}
                  className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  {chatMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setChatOpen(false)}
                  className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Chat Content */}
            {!chatMinimized && (
              <>
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Bot className="h-8 w-8 text-purple-400" />
                      </div>
                      <h4 className="text-white font-medium mb-2">Hi! I'm PiPilot AI</h4>
                      <p className="text-gray-400 text-sm mb-4">
                        I can help you navigate the docs. Ask me anything!
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {["How do I get started?", "What models are supported?", "How to deploy?"].map((q, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setChatInput(q)
                              setTimeout(() => handleSendMessage(), 100)
                            }}
                            className="text-xs bg-gray-800 text-purple-400 px-3 py-1.5 rounded-full hover:bg-gray-700 transition-colors"
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
                          <div className="w-7 h-7 bg-purple-500/20 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5">
                            <Bot className="h-4 w-4 text-purple-400" />
                          </div>
                        )}
                        <div className={`p-3 rounded-2xl ${
                          msg.role === 'user'
                            ? 'bg-purple-600 text-white rounded-br-md'
                            : 'bg-gray-800 text-gray-200 rounded-bl-md'
                        }`}>
                          {getMessageImages(msg.content).length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {getMessageImages(msg.content).map((img, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={img}
                                  alt="Attached"
                                  className="max-w-[200px] max-h-[150px] rounded-lg object-cover"
                                />
                              ))}
                            </div>
                          )}
                          {msg.role === 'assistant' ? (
                            <Response className="text-sm text-gray-200 prose prose-sm prose-invert max-w-none overflow-hidden break-words [word-break:break-word] [&>p]:text-gray-200 [&>ul]:text-gray-200 [&>ol]:text-gray-200 [&>li]:text-gray-200 [&>h1]:text-gray-100 [&>h2]:text-gray-100 [&>h3]:text-gray-100 [&>h4]:text-gray-100 [&>a]:text-purple-400 [&>a]:hover:text-purple-300 [&>a]:break-all [&>code]:bg-gray-700 [&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded [&>code]:break-all [&>pre]:bg-gray-900 [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre]:max-w-full [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-all [&>blockquote]:border-purple-500">
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
                        <div className="w-7 h-7 bg-purple-500/20 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5">
                          <Bot className="h-4 w-4 text-purple-400" />
                        </div>
                        <div className="bg-gray-800 p-3 rounded-2xl rounded-bl-md">
                          {toolStatus ? (
                            <div className="flex items-center gap-2 text-blue-400">
                              <Search className="h-4 w-4 animate-pulse" />
                              <span className="text-sm">{toolStatus}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-purple-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm">Thinking...</span>
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
                            <img
                              src={att.preview}
                              alt={att.name}
                              className="w-16 h-16 rounded-lg object-cover border border-gray-700"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
                              <FileText className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                          <button
                            onClick={() => removeAttachment(idx)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3 text-white" />
                          </button>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 rounded-b-lg truncate">
                            {att.type === 'screenshot' ? '📷' : att.type === 'image' ? '🖼️' : '📄'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input Area with Attachment Buttons */}
                <div className="p-4 border-t border-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded-lg transition-colors"
                      title="Upload image"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>Image</span>
                    </button>
                    <button
                      onClick={() => docInputRef.current?.click()}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-400 bg-gray-800 hover:bg-gray-700 px-2 py-1.5 rounded-lg transition-colors"
                      title="Attach document"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      <span>Doc</span>
                    </button>
                    <button
                      onClick={handleScreenToggle}
                      disabled={isCapturing}
                      className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        isScreenSharing
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                          : 'text-gray-400 hover:text-purple-400 bg-gray-800 hover:bg-gray-700'
                      }`}
                      title={isScreenSharing ? "Stop screen sharing" : "Start screen sharing"}
                    >
                      {isCapturing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isScreenSharing ? (
                        <>
                          <span className="relative flex h-2 w-2 mr-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          <Monitor className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <Monitor className="h-3.5 w-3.5" />
                      )}
                      <span>{isScreenSharing ? 'Sharing' : 'Screen'}</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="Ask anything about the docs..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                      className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 rounded-xl"
                      disabled={isLoading}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={isLoading || (!chatInput.trim() && attachments.length === 0)}
                      className="bg-purple-600 hover:bg-purple-700 rounded-xl px-4"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
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