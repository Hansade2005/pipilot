"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import Link from "next/link"
import {
  Search,
  HelpCircle,
  BookOpen,
  CreditCard,
  Settings,
  Code,
  Rocket,
  Mail,
  Send,
  Bot,
  Loader2,
  Sparkles,
  Users,
  Shield,
  FileQuestion,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  Image as ImageIcon,
  Paperclip,
  Monitor,
  FileText,
  Camera,
} from "lucide-react"
import { toast } from "sonner"
import { Response } from "@/components/ai-elements/response"
import { usePageTitle } from '@/hooks/use-page-title'

// Storage key for chat persistence
const STORAGE_KEY = 'pipilot_support_chat'

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

// Attachment type for UI display
interface Attachment {
  type: 'image' | 'document' | 'screenshot'
  name: string
  data: string // base64 data URL
  preview?: string
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

// FAQ Data organized by category
const faqCategories = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    color: "text-green-400",
    faqs: [
      {
        question: "What is PiPilot?",
        answer: "PiPilot is Canada's first Agentic Vibe Coding Platform - an AI-powered application builder that helps you create web applications through natural conversation. Simply describe what you want to build, and our AI will generate the code, design, and structure for you."
      },
      {
        question: "How do I create my first project?",
        answer: "After signing in, click 'New Project' in your workspace. Give your project a name and description, then start chatting with the AI. Describe what you want to build - whether it's a landing page, dashboard, or full application - and watch as PiPilot brings your vision to life."
      },
      {
        question: "Do I need coding experience to use PiPilot?",
        answer: "No! PiPilot is designed for everyone - from complete beginners to experienced developers. Our AI understands natural language, so you can describe what you want in plain English. However, if you do know how to code, you can also directly edit the generated code."
      },
      {
        question: "What types of applications can I build?",
        answer: "You can build virtually any web application including: landing pages, portfolios, dashboards, e-commerce sites, blogs, SaaS applications, admin panels, and more. PiPilot supports React, Next.js, and modern web technologies."
      },
    ]
  },
  {
    id: "features",
    title: "Features & Capabilities",
    icon: Sparkles,
    color: "text-purple-400",
    faqs: [
      {
        question: "What AI models does PiPilot use?",
        answer: "PiPilot uses cutting-edge AI models including Claude by Anthropic, GPT-4, Gemini, and Mistral Pixtral. You can switch between models based on your needs - some excel at complex logic while others are great for creative designs."
      },
      {
        question: "What is AI Memory?",
        answer: "AI Memory allows PiPilot to remember context about your project, preferences, and past conversations. This means the AI gets smarter about your specific project over time and can provide more relevant suggestions."
      },
      {
        question: "Can I use slash commands?",
        answer: "Yes! PiPilot supports powerful slash commands like /help, /settings, /clear, /export, and more. Type '/' in the chat to see all available commands and their descriptions."
      },
      {
        question: "Does PiPilot support real-time preview?",
        answer: "Absolutely! As you chat and the AI generates code, you'll see a live preview of your application update in real-time. You can switch between desktop, tablet, and mobile views."
      },
      {
        question: "Can I search and replace across my codebase?",
        answer: "Yes! Use the search feature (Ctrl/Cmd + Shift + F) to search across all files in your project. You can also use the Search & Replace feature to make bulk changes with preview before applying."
      },
    ]
  },
  {
    id: "billing",
    title: "Billing & Pricing",
    icon: CreditCard,
    color: "text-blue-400",
    faqs: [
      {
        question: "Is PiPilot free to use?",
        answer: "PiPilot offers a free tier with limited AI messages per month. For more usage and advanced features, we offer Pro and Enterprise plans. Check our pricing page for detailed information."
      },
      {
        question: "How do I upgrade my plan?",
        answer: "Go to Settings > Billing in your workspace, or visit the Pricing page. Select the plan that fits your needs and complete the checkout process. Your upgrade takes effect immediately."
      },
      {
        question: "Can I cancel my subscription anytime?",
        answer: "Yes, you can cancel your subscription at any time. Your access will continue until the end of your current billing period. We don't offer refunds for partial months, but you won't be charged again."
      },
      {
        question: "What payment methods do you accept?",
        answer: "We accept all major credit cards (Visa, Mastercard, American Express) and debit cards through our secure payment processor, Stripe. We also support Apple Pay and Google Pay."
      },
    ]
  },
  {
    id: "technical",
    title: "Technical & Troubleshooting",
    icon: Settings,
    color: "text-orange-400",
    faqs: [
      {
        question: "My preview isn't loading. What should I do?",
        answer: "Try these steps: 1) Refresh the page, 2) Clear your browser cache, 3) Check if there are any JavaScript errors in the console, 4) Try a different browser. If the issue persists, contact our support team."
      },
      {
        question: "How do I export my project?",
        answer: "Click the Export button in your workspace or use the /export command. You can download your project as a ZIP file containing all source code, assets, and configuration files ready for deployment."
      },
      {
        question: "Can I connect my own domain?",
        answer: "Yes! Pro and Enterprise users can connect custom domains to their deployed projects. Go to Project Settings > Domain to configure your custom domain with our provided DNS settings."
      },
      {
        question: "How do I report a bug?",
        answer: "You can report bugs through our live chat support, by emailing hello@pipilot.dev, or by creating an issue on our GitHub repository. Please include steps to reproduce the issue and any error messages."
      },
      {
        question: "Is my code and data secure?",
        answer: "Absolutely. We use industry-standard encryption for all data in transit and at rest. Your code is stored securely and is only accessible to you. We never share or sell your data to third parties."
      },
    ]
  },
  {
    id: "account",
    title: "Account & Privacy",
    icon: Shield,
    color: "text-cyan-400",
    faqs: [
      {
        question: "How do I reset my password?",
        answer: "Click 'Forgot Password' on the login page and enter your email address. We'll send you a secure link to reset your password. The link expires after 24 hours for security."
      },
      {
        question: "Can I delete my account?",
        answer: "Yes, you can delete your account from Settings > Account > Delete Account. This action is permanent and will remove all your projects, data, and subscription. Please export any projects you want to keep first."
      },
      {
        question: "How do I change my email address?",
        answer: "Go to Settings > Account > Email. Enter your new email address and we'll send a verification link. Once verified, your email will be updated across all PiPilot services."
      },
      {
        question: "Does PiPilot comply with GDPR?",
        answer: "Yes, PiPilot is fully GDPR compliant. You have the right to access, modify, and delete your personal data at any time. Contact us at hello@pipilot.dev for any privacy-related requests."
      },
    ]
  },
]

// Quick help topics
const quickHelp = [
  {
    title: "Quick Start Guide",
    description: "Learn the basics in 5 minutes",
    icon: Rocket,
    href: "/docs/quickstart",
    color: "from-green-500 to-emerald-600"
  },
  {
    title: "Video Tutorials",
    description: "Watch step-by-step guides",
    icon: BookOpen,
    href: "/docs/tutorials",
    color: "from-purple-500 to-pink-600"
  },
  {
    title: "API Documentation",
    description: "For developers and integrations",
    icon: Code,
    href: "/docs/api",
    color: "from-blue-500 to-cyan-600"
  },
  {
    title: "Community Discord",
    description: "Join our community",
    icon: Users,
    href: "https://discord.gg/pipilot",
    color: "from-indigo-500 to-purple-600"
  },
]

export default function SupportPage() {
  usePageTitle('Support')
  const [searchQuery, setSearchQuery] = useState("")
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMinimized, setChatMinimized] = useState(false)
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const toolTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Persistent screen sharing state
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenVideoRef = useRef<HTMLVideoElement | null>(null)

  // Filter FAQs based on search query
  const filteredCategories = faqCategories.map(category => ({
    ...category,
    faqs: category.faqs.filter(
      faq =>
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.faqs.length > 0)

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

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
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

    // Reset input
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

      if (file.size > 5 * 1024 * 1024) { // 5MB limit
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

    // Reset input
    if (docInputRef.current) docInputRef.current.value = ''
  }, [])

  // Start persistent screen sharing
  const startScreenSharing = useCallback(async () => {
    try {
      setIsCapturing(true)

      // Request screen sharing
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser'
        } as MediaTrackConstraints,
        audio: false
      })

      // Create video element and keep it alive
      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()

      // Store references
      screenStreamRef.current = stream
      screenVideoRef.current = video

      // Listen for when user stops sharing via browser UI
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

    // Build message content
    let messageContent: string | ContentPart[]

    if (currentAttachments.length > 0) {
      const contentParts: ContentPart[] = []

      // Add text if present
      if (userText) {
        contentParts.push({ type: 'text', text: userText })
      }

      // Add images and documents
      for (const att of currentAttachments) {
        if (att.type === 'image' || att.type === 'screenshot') {
          contentParts.push({ type: 'image', image: att.data })
        } else if (att.type === 'document') {
          // For documents, include content as text
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

      // Add empty assistant message that we'll update
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

  // Open chat with a question
  const openChatWithQuestion = (question: string) => {
    setChatOpen(true)
    setChatMinimized(false)
    setChatInput(question)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
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

      {/* Enhanced Gradient Background */}
      <div className="absolute inset-0 lovable-gradient" />

      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Navigation */}
      <Navigation />

      {/* Main Content */}
      <main className="relative z-10 pt-16 pb-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-12 max-w-4xl mx-auto">
            <Badge className="mb-4 bg-blue-500/20 text-blue-300 border-blue-500/30">
              <HelpCircle className="h-3 w-3 mr-1" />
              Support Center
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
              How Can We
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"> Help You?</span>
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
              Find answers to common questions, get help from our AI assistant, or reach out to our support team.
            </p>

            {/* Search Bar with Ask AI Button */}
            <div className="relative max-w-2xl mx-auto mb-8">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search for answers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-32 py-6 text-lg bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-400 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
              <Button
                onClick={() => {
                  if (searchQuery.trim()) {
                    openChatWithQuestion(searchQuery)
                  } else {
                    setChatOpen(true)
                    setChatMinimized(false)
                  }
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Ask AI</span>
              </Button>
            </div>
          </div>

          {/* Quick Help Cards */}
          <div className="max-w-6xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">Quick Help</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickHelp.map((item, idx) => (
                <Link key={idx} href={item.href}>
                  <Card className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-all hover:scale-105 cursor-pointer h-full">
                    <CardContent className="p-6">
                      <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center mb-4`}>
                        <item.icon className="h-6 w-6 text-white" />
                      </div>
                      <h3 className="text-white font-semibold mb-1">{item.title}</h3>
                      <p className="text-gray-400 text-sm">{item.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          {/* FAQ Section */}
          <div className="max-w-4xl mx-auto mb-16">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">
              {searchQuery ? `Search Results for "${searchQuery}"` : "Frequently Asked Questions"}
            </h2>

            {filteredCategories.length === 0 ? (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-8 text-center">
                  <FileQuestion className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-white font-semibold mb-2">No results found</h3>
                  <p className="text-gray-400 mb-4">
                    We couldn't find any FAQs matching "{searchQuery}". Try different keywords or ask our AI assistant.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Button variant="outline" onClick={() => setSearchQuery("")}>
                      Clear Search
                    </Button>
                    <Button
                      onClick={() => openChatWithQuestion(searchQuery)}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Ask AI Instead
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {filteredCategories.map((category) => (
                  <Card key={category.id} className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <category.icon className={`h-5 w-5 ${category.color}`} />
                        <CardTitle className="text-white text-lg">{category.title}</CardTitle>
                        <Badge variant="outline" className="text-gray-400 border-gray-600 ml-auto">
                          {category.faqs.length} {category.faqs.length === 1 ? 'question' : 'questions'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible className="w-full">
                        {category.faqs.map((faq, idx) => (
                          <AccordionItem key={idx} value={`${category.id}-${idx}`} className="border-gray-700">
                            <AccordionTrigger className="text-white hover:text-purple-400 text-left">
                              {faq.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-gray-300 leading-relaxed">
                              {faq.answer}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Contact Section */}
          <div className="max-w-4xl mx-auto">
            <Card className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border-gray-700">
              <CardContent className="p-8">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-white mb-2">Still Need Help?</h2>
                  <p className="text-gray-400">Our support team is here to assist you</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div
                    className="text-center p-6 bg-gray-800/50 rounded-xl cursor-pointer hover:bg-gray-800/70 transition-colors"
                    onClick={() => {
                      setChatOpen(true)
                      setChatMinimized(false)
                    }}
                  >
                    <div className="w-14 h-14 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                      <Bot className="h-7 w-7 text-purple-400" />
                    </div>
                    <h3 className="text-white font-semibold mb-2">AI Assistant</h3>
                    <p className="text-gray-400 text-sm mb-4">
                      Chat with our AI assistant for instant answers powered by Claude Opus 4.5
                    </p>
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Powered by AI
                    </Badge>
                  </div>

                  <div className="text-center p-6 bg-gray-800/50 rounded-xl">
                    <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                      <Mail className="h-7 w-7 text-blue-400" />
                    </div>
                    <h3 className="text-white font-semibold mb-2">Email Support</h3>
                    <p className="text-gray-400 text-sm mb-4">
                      Send us an email and we'll respond within 24 hours
                    </p>
                    <Link href="mailto:hello@pipilot.dev">
                      <Button variant="outline" className="text-blue-400 border-blue-500/50 hover:bg-blue-500/10">
                        <Mail className="h-4 w-4 mr-2" />
                        hello@pipilot.dev
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
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
                {/* Clear Chat */}
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
                        I'm here to help you with anything about PiPilot. You can also share screenshots!
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {["How do I get started?", "What can I build?", "Pricing plans"].map((q, i) => (
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
                          {/* Display images if any */}
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
                  {/* Attachment Buttons */}
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

                  {/* Text Input */}
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      type="text"
                      placeholder="Ask anything about PiPilot..."
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
