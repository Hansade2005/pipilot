"use client"

import { useState, useRef, useEffect } from "react"
import {
  ArrowUp,
  Plus,
  Image as ImageIcon,
  Zap,
  Square,
  Sparkles,
  Link as LinkIcon,
  X,
  Github,
  Gitlab,
  RefreshCw
} from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { filterUnwantedFiles } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion"

// Load JSZip from CDN (same as file explorer)
if (typeof window !== 'undefined' && !window.JSZip) {
  const script = document.createElement('script')
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  script.async = true
  document.head.appendChild(script)
}

// Type declaration for JSZip
declare global {
  interface Window {
    JSZip?: any
  }
}

interface ChatInputProps {
  onAuthRequired: () => void
  onProjectCreated?: (project: any) => void
}

interface PromptSuggestion {
  display: string
  prompt: string
}

export function ChatInput({ onAuthRequired, onProjectCreated }: ChatInputProps) {
  // Initialize prompt from localStorage if available
  const [prompt, setPrompt] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chat-input-prompt') || ''
    }
    return ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Typing placeholder state
  const [typingPlaceholder, setTypingPlaceholder] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  const placeholderSuggestions = [
    "Build an Expo language learning app with speech recognition, flashcards, and progress tracking",
    "Create a modern portfolio website with dark mode and animations",
    "Design a restaurant ordering app with real-time order tracking",
    "Build a fitness tracker with workout plans and progress charts",
    "Create an AI-powered note-taking app with smart organization",
    "Design a social media dashboard with analytics and scheduling",
    "Build a recipe finder app with ingredient-based search",
    "Create a project management tool with kanban boards",
    "Design an e-commerce store with cart and checkout flow",
    "Build a weather app with location-based forecasts"
  ]

  // Typing effect for placeholder
  useEffect(() => {
    if (isGenerating || prompt) return // Don't animate when generating or when user has typed

    let charIndex = 0
    let isDeleting = false
    let currentText = ''
    const currentSuggestion = placeholderSuggestions[placeholderIndex]

    const typeInterval = setInterval(() => {
      if (!isDeleting) {
        // Typing
        currentText = currentSuggestion.slice(0, charIndex + 1)
        setTypingPlaceholder(currentText)
        charIndex++

        if (charIndex === currentSuggestion.length) {
          // Pause at end before deleting
          setTimeout(() => {
            isDeleting = true
          }, 2000)
        }
      } else {
        // Deleting
        currentText = currentSuggestion.slice(0, charIndex - 1)
        setTypingPlaceholder(currentText)
        charIndex--

        if (charIndex === 0) {
          isDeleting = false
          setPlaceholderIndex((prev) => (prev + 1) % placeholderSuggestions.length)
          clearInterval(typeInterval)
        }
      }
    }, isDeleting ? 30 : 50) // Faster deletion, slower typing

    return () => clearInterval(typeInterval)
  }, [placeholderIndex, isGenerating, prompt])

  // User state
  const [user, setUser] = useState<any>(null)

  // Speech-to-text state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Template selection state
  const [selectedTemplate, setSelectedTemplate] = useState<'vite-react' | 'nextjs' | 'expo' | 'html'>('vite-react')
  const [hasUserSelectedTemplate, setHasUserSelectedTemplate] = useState(false)

  // URL attachment state
  const [attachedUrl, setAttachedUrl] = useState("")
  const [showUrlPopover, setShowUrlPopover] = useState(false)
  const [urlInput, setUrlInput] = useState("")

  // GitHub import state
  const [githubRepoUrl, setGithubRepoUrl] = useState("")
  const [showGithubPopover, setShowGithubPopover] = useState(false)
  const [githubInput, setGithubInput] = useState("")
  const [isImportingGithub, setIsImportingGithub] = useState(false)

  // GitLab import state
  const [gitlabRepoUrl, setGitlabRepoUrl] = useState("")
  const [showGitlabPopover, setShowGitlabPopover] = useState(false)
  const [gitlabInput, setGitlabInput] = useState("")
  const [isImportingGitlab, setIsImportingGitlab] = useState(false)

  // Fetch user on mount
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        console.error("Error checking user:", error)
        setUser(null)
      }
    }
    checkUser()
  }, [supabase.auth])

  // Save prompt to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (prompt.trim()) {
          localStorage.setItem('chat-input-prompt', prompt)
        } else {
          localStorage.removeItem('chat-input-prompt')
        }
      } catch (error) {
        // Handle QuotaExceededError - localStorage is full
        // Silently fail as this is just for convenience/persistence
        console.warn('Failed to save prompt to localStorage:', error)
      }
    }
  }, [prompt])

  // Check if Web Speech API is supported
  const isWebSpeechSupported = typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  // Fetch prompt suggestions on component mount
  useEffect(() => {
    fetchPromptSuggestions()
  }, [])

  const fetchPromptSuggestions = async () => {
    try {
      const response = await fetch('/api/prompt-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ count: 15 }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.suggestions) {
          setSuggestions(data.suggestions)
        }
      }
    } catch (error) {
      console.error('Failed to fetch prompt suggestions:', error)
      // Fallback suggestions
      setSuggestions([
        { display: "Landing page", prompt: "Create a modern landing page for my startup" },
        { display: "Portfolio site", prompt: "Build a portfolio website to showcase my work" },
        { display: "Restaurant menu", prompt: "Design a restaurant website with menu" },
        { display: "E-commerce store", prompt: "Make an e-commerce store for clothing" },
        { display: "Blog with dark mode", prompt: "Create a blog website with dark mode" },
        { display: "Business website", prompt: "Build a business website with contact forms" }
      ])
    }
  }

  // Prompt enhancement using Pixtral AI
  const handlePromptEnhancement = async () => {
    if (!prompt.trim() || isEnhancing || isGenerating) return

    setIsEnhancing(true)
    try {
      const response = await fetch('/api/prompt-enhancement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.enhancedPrompt) {
          setPrompt(data.enhancedPrompt)
          inputRef.current?.focus()
        }
      }
    } catch (error) {
      console.error('Failed to enhance prompt:', error)
    } finally {
      setIsEnhancing(false)
    }
  }

  // Speech-to-text handlers using Web Speech API (with Deepgram fallback)
  const startWebSpeechRecognition = () => {
    try {
      // @ts-ignore - Web Speech API types
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      // Enhanced settings for real-time typing
      recognition.continuous = true
      recognition.interimResults = true // Enable instant real-time results
      recognition.lang = 'en-US'
      // @ts-ignore - maxAlternatives
      recognition.maxAlternatives = 1
      
      // Store the initial prompt value when starting
      const initialPrompt = prompt
      let lastFinalTranscript = ''
      let silenceTimer: NodeJS.Timeout | null = null
      
      recognition.onstart = () => {
        setIsRecording(true)
        lastFinalTranscript = ''
        toast.success("🎤 Listening...", {
          description: "Speak now. I'll stop automatically when you're done."
        })
      }
      
      recognition.onresult = (event: any) => {
        // Clear any existing silence timer
        if (silenceTimer) {
          clearTimeout(silenceTimer)
        }
        
        let interimTranscript = ''
        let finalTranscript = ''
        
        // Process all results for instant typing effect
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }
        
        // Combine final and interim for instant real-time typing
        const combinedText = (finalTranscript || lastFinalTranscript) + interimTranscript
        
        // Update final transcript tracker
        if (finalTranscript) {
          lastFinalTranscript = finalTranscript
        }
        
        // Instantly update the input field with real-time text
        if (combinedText.trim()) {
          const updatedPrompt = initialPrompt 
            ? `${initialPrompt} ${combinedText.trim()}` 
            : combinedText.trim()
          setPrompt(updatedPrompt)
        }
        
        // Auto-stop detection: Set timer to stop after 2 seconds of silence
        silenceTimer = setTimeout(() => {
          if (recognition && recognitionRef.current) {
            recognition.stop()
            toast.info("Recording stopped", {
              description: "Stopped due to silence detected"
            })
          }
        }, 2000) // 2 seconds of silence triggers auto-stop
      }
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        
        // Clear silence timer on error
        if (silenceTimer) {
          clearTimeout(silenceTimer)
        }
        
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          toast.error("❌ Microphone access denied", {
            description: "Please allow microphone access to use voice input"
          })
        } else if (event.error === 'no-speech') {
          toast.warning("⚠️ No speech detected", {
            description: "Please try speaking louder or closer to the microphone"
          })
        } else if (event.error === 'aborted') {
          // User manually stopped, don't show error
          console.log('Recognition aborted by user')
        } else {
          toast.error("Recognition error", {
            description: `Error: ${event.error}. Please try again.`
          })
        }
        setIsRecording(false)
      }
      
      recognition.onend = () => {
        // Clear any pending silence timer
        if (silenceTimer) {
          clearTimeout(silenceTimer)
        }
        
        // Only show success if we actually captured text
        if (lastFinalTranscript.trim()) {
          toast.success("✅ Speech recognized successfully", {
            description: "Your speech has been converted to text"
          })
        }
        
        setIsRecording(false)
        recognitionRef.current = null
      }
      
      recognitionRef.current = recognition
      recognition.start()
    } catch (error) {
      console.error('Error starting Web Speech Recognition:', error)
      toast.error("Speech recognition not available", {
        description: "Your browser doesn't support speech recognition"
      })
    }
  }

  const startDeepgramRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        await transcribeWithDeepgram(audioBlob)
        
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)

      toast.success("Recording started", {
        description: "Speak now... Click again to stop"
      })
    } catch (error) {
      console.error('Error starting recording:', error)
      toast.error("Recording failed", {
        description: "Could not access microphone. Please check permissions."
      })
    }
  }

  const stopDeepgramRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsTranscribing(true)
    }
  }

  const transcribeWithDeepgram = async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const reader = new FileReader()
      reader.readAsDataURL(audioBlob)
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1]

        // Send to Deepgram API
        const response = await fetch('/api/speech-to-text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audio: base64Audio }),
        })

        if (!response.ok) {
          throw new Error('Failed to transcribe audio')
        }

        const data = await response.json()

        if (data.success && data.text) {
          // Append transcribed text to input
          setPrompt(prev => prev ? `${prev} ${data.text}` : data.text)
          
          toast.success("Transcription complete", {
            description: "Your speech has been converted to text"
          })
        } else {
          throw new Error('No transcription received')
        }
      }

      reader.onerror = () => {
        throw new Error('Failed to read audio file')
      }
    } catch (error) {
      console.error('Error transcribing audio:', error)
      toast.error("Transcription failed", {
        description: "Could not convert speech to text"
      })
    } finally {
      setIsTranscribing(false)
    }
  }

  const handleMicrophoneClick = () => {
    if (isRecording) {
      // Stop recording
      if (isWebSpeechSupported && recognitionRef.current) {
        recognitionRef.current.stop()
        setIsRecording(false) // Immediately update state
        recognitionRef.current = null
      } else {
        stopDeepgramRecording()
      }
    } else {
      // Start recording - use Web Speech API if available, otherwise use Deepgram
      if (isWebSpeechSupported) {
        startWebSpeechRecognition()
      } else {
        // Fallback to Deepgram for browsers without Web Speech API (like Firefox)
        console.log('Web Speech API not supported, using Deepgram fallback')
        toast.info("Using Deepgram", {
          description: "Your browser doesn't support Web Speech API"
        })
        startDeepgramRecording()
      }
    }
  }

  const applyGithubFiles = async (workspaceId: string, zipData: string, repoName: string) => {
    try {
      console.log('📦 Extracting GitHub repository files...')

      // Convert base64 to blob
      const zipBlob = new Blob([Uint8Array.from(atob(zipData), c => c.charCodeAt(0))], {
        type: 'application/zip'
      })

      // Wait for JSZip to load if it's not ready yet (same as file explorer)
      if (typeof window !== 'undefined' && !window.JSZip) {
        await new Promise((resolve) => {
          const checkJSZip = () => {
            if (window.JSZip) {
              resolve(void 0)
            } else {
              setTimeout(checkJSZip, 100)
            }
          }
          checkJSZip()
        })
      }

      if (!window.JSZip) {
        throw new Error('JSZip library not loaded')
      }

      // Load ZIP using window.JSZip (same as file explorer)
      const zip = await window.JSZip.loadAsync(zipBlob)

      const { storageManager } = await import('@/lib/storage-manager')
      const filesToCreate: Array<{ path: string; content: string }> = []

      // Process each file in the zip
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        const entry = zipEntry as any
        if (entry.dir) continue // Skip directories

        // Remove the repo name prefix from path (e.g., "repo-name-main/" -> "")
        const cleanPath = path.replace(`${repoName}-main/`, '').replace(`${repoName}-master/`, '')

        if (!cleanPath || cleanPath.startsWith('.') || cleanPath.includes('/.git/')) continue

        try {
          const content = await entry.async('text')
          filesToCreate.push({
            path: cleanPath,
            content: content
          })
        } catch (error) {
          console.warn(`⚠️ Could not extract text content for ${cleanPath}:`, error)
        }
      }

      console.log(`📝 Creating ${filesToCreate.length} files in workspace ${workspaceId}`)

      // Filter out images, videos, PDF files, scripts folders, test folders, and unwanted files to reduce storage and processing load
      const filteredFiles = filterUnwantedFiles(filesToCreate)
      console.log(`📝 Filtered to ${filteredFiles.length} files (removed ${filesToCreate.length - filteredFiles.length} unwanted files)`)

      // Create files in storage manager
      for (const file of filteredFiles) {
        await storageManager.createFile({
          workspaceId,
          name: file.path.split('/').pop() || file.path,
          path: file.path,
          content: file.content,
          fileType: file.path.split('.').pop() || 'text',
          type: file.path.split('.').pop() || 'text',
          size: file.content.length,
          isDirectory: false,
          folderId: undefined,
          metadata: {}
        })
      }

      console.log('✅ GitHub files applied successfully')

    } catch (error) {
      console.error('❌ Error applying GitHub files:', error)
      throw new Error('Failed to extract repository files')
    }
  }

  const handleGithubImport = async (user: any) => {
    try {
      setIsImportingGithub(true)
      toast.loading('Importing GitHub repository...', { id: 'github-import' })

      // Import the repository
      const response = await fetch('/api/github/import-repo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repoUrl: githubRepoUrl.trim(),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to import repository')
      }

      // Get metadata from headers
      const repoName = response.headers.get('X-Repo-Name') || ''
      const repoOwner = response.headers.get('X-Owner') || ''
      const branch = response.headers.get('X-Branch') || 'main'
      
      // Get binary data and convert to base64 for processing
      const arrayBuffer = await response.arrayBuffer()
      const zipData = Buffer.from(arrayBuffer).toString('base64')
      
      console.log('✅ GitHub repo imported:', { repoName, repoOwner, branch, size: arrayBuffer.byteLength })

      // Create project with repo details
      const projectName = repoName
      const projectDescription = `Imported from GitHub: ${repoOwner}/${repoName}`

      // Generate unique slug
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

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

      // Extract and apply GitHub files
      await applyGithubFiles(workspace.id, zipData, repoName)

      // Create initial checkpoint
      try {
        const { createCheckpoint } = await import('@/lib/checkpoint-utils')
        const initialCheckpointMessageId = `github-import-${workspace.id}`
        await createCheckpoint(workspace.id, initialCheckpointMessageId)
        console.log(`✅ Created initial GitHub import checkpoint for workspace ${workspace.id}`)

        // Store the checkpoint message ID
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`initial-checkpoint-${workspace.id}`, initialCheckpointMessageId)
        }
      } catch (checkpointError) {
        console.error('Failed to create initial checkpoint:', checkpointError)
      }

      // Store import info in sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`initial-prompt-${workspace.id}`, `Imported from GitHub: ${githubRepoUrl}`)
        sessionStorage.removeItem('lastSelectedProject')
        sessionStorage.removeItem('cachedFiles')
      }

      toast.success('GitHub repository imported successfully!', { id: 'github-import' })

      // Clear the input and redirect
      setPrompt("")
      setGithubRepoUrl("")
      router.push(`/workspace?newProject=${workspace.id}`)

    } catch (error) {
      console.error('❌ Error importing GitHub repo:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to import repository', { id: 'github-import' })
    } finally {
      setIsImportingGithub(false)
      setIsGenerating(false)
    }
  }

  const handleGitlabImport = async (user: any) => {
    try {
      setIsImportingGitlab(true)
      toast.loading('Importing GitLab repository...', { id: 'gitlab-import' })

      // Parse GitLab URL to extract owner and repo
      const urlMatch = gitlabRepoUrl.match(/(?:https?:\/\/)?([^\/]+)\/([^\/]+)\/([^\/]+)(?:\/|$)/i)
      if (!urlMatch) {
        throw new Error('Invalid GitLab repository URL')
      }

      const [, domain, owner, repo] = urlMatch
      const cleanRepo = repo.replace(/\.git$/, '') // Remove .git suffix if present

      console.log(`Importing GitLab repo: ${domain}/${owner}/${cleanRepo}`)

      // GitLab uses different URL structure for downloads - try main branch first
      const baseUrl = domain.includes('gitlab.com') ? 'https://gitlab.com' : `https://${domain}`
      const originalZipUrl = `${baseUrl}/${owner}/${cleanRepo}/-/archive/main/${cleanRepo}-main.zip`
      
      // Use CORS proxy to bypass GitLab CORS restrictions
      const zipUrl = `https://corsproxy.io/?${encodeURIComponent(originalZipUrl)}`
      console.log(`Downloading from: ${zipUrl}`)

      // Download via CORS proxy
      let response = await fetch(zipUrl, {
        headers: {
          'Accept': 'application/zip, application/octet-stream, */*'
        }
      })
      let branch = 'main'

      if (!response.ok) {
        if (response.status === 404) {
          // Try master branch if main doesn't exist
          const originalMasterZipUrl = `${baseUrl}/${owner}/${cleanRepo}/-/archive/master/${cleanRepo}-master.zip`
          const masterZipUrl = `https://corsproxy.io/?${encodeURIComponent(originalMasterZipUrl)}`
          console.log(`Main branch not found, trying master: ${masterZipUrl}`)
          response = await fetch(masterZipUrl, {
            headers: {
              'Accept': 'application/zip, application/octet-stream, */*'
            }
          })
          branch = 'master'

          if (!response.ok) {
            throw new Error('Repository not found or not accessible. Make sure it\'s a public repository.')
          }
        } else {
          throw new Error('Failed to download repository. Make sure it\'s a public repository.')
        }
      }

      // Get binary data and convert to base64 for processing
      const arrayBuffer = await response.arrayBuffer()
      const zipData = Buffer.from(arrayBuffer).toString('base64')
      
      console.log('✅ GitLab repo downloaded:', { repoName: cleanRepo, repoOwner: owner, domain, branch, size: arrayBuffer.byteLength })

      // Create project with repo details
      const projectName = cleanRepo
      const projectDescription = `Imported from GitLab: ${domain}/${owner}/${cleanRepo}`

      // Generate unique slug
      const { storageManager } = await import('@/lib/storage-manager')
      await storageManager.init()

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

      // Extract and apply GitLab files
      await applyGithubFiles(workspace.id, zipData, cleanRepo)

      // Create initial checkpoint
      try {
        const { createCheckpoint } = await import('@/lib/checkpoint-utils')
        const initialCheckpointMessageId = `gitlab-import-${workspace.id}`
        await createCheckpoint(workspace.id, initialCheckpointMessageId)
        console.log(`✅ Created initial GitLab import checkpoint for workspace ${workspace.id}`)

        // Store the checkpoint message ID
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`initial-checkpoint-${workspace.id}`, initialCheckpointMessageId)
        }
      } catch (checkpointError) {
        console.error('Failed to create initial checkpoint:', checkpointError)
      }

      // Store import info in sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(`initial-prompt-${workspace.id}`, `Imported from GitLab: ${gitlabRepoUrl}`)
        sessionStorage.removeItem('lastSelectedProject')
        sessionStorage.removeItem('cachedFiles')
      }

      toast.success('GitLab repository imported successfully!', { id: 'gitlab-import' })

      // Clear the input and redirect
      setPrompt("")
      setGitlabRepoUrl("")
      router.push(`/workspace?newProject=${workspace.id}`)

    } catch (error) {
      console.error('❌ Error importing GitLab repo:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to import repository', { id: 'gitlab-import' })
    } finally {
      setIsImportingGitlab(false)
      setIsGenerating(false)
    }
  }

  // Smart template selection based on prompt content
  const detectFrameworkFromPrompt = (promptText: string): 'vite-react' | 'nextjs' | 'expo' | 'html' | null => {
    const lowerPrompt = promptText.toLowerCase()

    // Framework detection patterns - ONLY match explicit framework mentions
    const frameworkPatterns = [
      // Next.js - only when explicitly mentioned
      { regex: /\bnext\.?js\b/i, template: 'nextjs' as const },
      { regex: /\bnextjs\b/i, template: 'nextjs' as const },

      // Expo/React Native - only when explicitly mentioned
      { regex: /\bexpo\b/i, template: 'expo' as const },
      { regex: /\breact\s+native\b/i, template: 'expo' as const },
      { regex: /\bmobile\s+app\b/i, template: 'expo' as const },

      // HTML - only when explicitly mentioned
      { regex: /\bhtml\b/i, template: 'html' as const },
      { regex: /\bvanilla\s+js\b/i, template: 'html' as const },
    ]

    // Check patterns - only return if explicit framework is mentioned
    for (const { regex, template } of frameworkPatterns) {
      if (regex.test(lowerPrompt)) {
        console.log(`🎯 Framework explicitly detected: "${template}" from pattern: ${regex}`)
        return template
      }
    }

    // No explicit framework mentioned - return null to not auto-select
    console.log('🎯 No explicit framework mentioned, no auto-selection')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!prompt.trim() && !githubRepoUrl.trim() && !gitlabRepoUrl.trim()) return

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      onAuthRequired()
      return
    }

    setIsGenerating(true)

    try {
      // Handle GitHub import
      if (githubRepoUrl.trim()) {
        console.log('🚀 ChatInput: Importing GitHub repository:', githubRepoUrl)
        await handleGithubImport(user)
        return
      }

      // Handle GitLab import
      if (gitlabRepoUrl.trim()) {
        console.log('🚀 ChatInput: Importing GitLab repository:', gitlabRepoUrl)
        await handleGitlabImport(user)
        return
      }

      // Smart template selection based on prompt (excluding GitHub/GitLab imports)
      // Only auto-detect if user hasn't manually selected a template
      let detectedTemplate = selectedTemplate
      if (!hasUserSelectedTemplate) {
        const frameworkDetection = detectFrameworkFromPrompt(prompt)
        if (frameworkDetection !== null) {
          detectedTemplate = frameworkDetection
          console.log(`🎯 Smart template selection: Explicitly detected "${detectedTemplate}" from prompt, auto-selecting`)
          setSelectedTemplate(detectedTemplate)
          toast.info(`🎯 Auto-selected ${detectedTemplate === 'nextjs' ? 'Next.js' : detectedTemplate === 'expo' ? 'Expo' : detectedTemplate === 'html' ? 'HTML' : 'Vite React'} template based on your prompt`)
        } else {
          console.log('🎯 No explicit framework detected, using current selection')
          detectedTemplate = selectedTemplate
        }
      } else {
        console.log(`👤 User manually selected template: "${selectedTemplate}", skipping auto-detection`)
        detectedTemplate = selectedTemplate
      }

      console.log('🚀 ChatInput: Generating project details with Pixtral for prompt:', prompt)
      
      // Generate project name and description using Pixtral
      const response = await fetch('/api/project-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          userId: user.id,
          template: detectedTemplate, // Use detected template instead of selectedTemplate
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate project suggestion')
      }

      const data = await response.json()

      if (data.success && data.suggestion) {
        console.log('🤖 Pixtral generated suggestion:', data.suggestion)
        
        // Create project immediately with generated details
        const projectName = data.suggestion.name
        const projectDescription = data.suggestion.description
        
        // Generate unique slug
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()
        
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
        
        // Apply files based on GitHub import or template selection
        if (githubRepoUrl.trim()) {
          // Import from GitHub repository
          console.log('🚀 Importing from GitHub:', githubRepoUrl)
          toast.loading('Importing GitHub repository...', { id: 'github-import' })

          try {
            const importResponse = await fetch('/api/github/import-repo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ repoUrl: githubRepoUrl.trim() })
            })

            if (!importResponse.ok) {
              throw new Error('Failed to import GitHub repository')
            }

            // Get metadata from headers
            const repoName = importResponse.headers.get('X-Repo-Name') || ''
            
            // Get binary data and convert to base64 for processing
            const arrayBuffer = await importResponse.arrayBuffer()
            const zipData = Buffer.from(arrayBuffer).toString('base64')

            await applyGithubFiles(workspace.id, zipData, repoName)
            toast.success('GitHub repository imported!', { id: 'github-import' })
          } catch (githubError) {
            console.error('GitHub import error:', githubError)
            toast.error('Failed to import GitHub repository', { id: 'github-import' })
            throw githubError
          }
        } else {
          // Apply template files based on detected framework
          const { TemplateService } = await import('@/lib/template-service')
          if (detectedTemplate === 'nextjs') {
            console.log('🎯 Applying Next.js template')
            await TemplateService.applyNextJSTemplate(workspace.id)
          } else if (detectedTemplate === 'expo') {
            console.log('🎯 Applying Expo template')
            await TemplateService.applyExpoTemplate(workspace.id)
          } else if (detectedTemplate === 'html') {
            console.log('🎯 Applying HTML template')
            await TemplateService.applyHtmlTemplate(workspace.id)
          } else {
            console.log('🎯 Applying Vite React template')
            await TemplateService.applyViteReactTemplate(workspace.id)
          }
        }
        
        // CRITICAL FIX: Wait for IndexedDB transactions to complete
        // This prevents file contamination from other projects
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Verify files were created correctly for this specific workspace
        const files = await storageManager.getFiles(workspace.id)
        console.log(`✅ Verified ${files.length} files created for workspace ${workspace.id}`)
        
        if (files.length === 0) {
          throw new Error('Template files were not created properly. Please try again.')
        }
        
        // ✅ CRITICAL: Create initial checkpoint RIGHT AFTER template application
        // This captures the CLEAN template state before any contamination can occur
        try {
          const { createCheckpoint } = await import('@/lib/checkpoint-utils')
          // Create a dummy message ID for the initial template checkpoint
          const initialCheckpointMessageId = `template-init-${workspace.id}`
          await createCheckpoint(workspace.id, initialCheckpointMessageId)
          console.log(`✅ Created initial template checkpoint for workspace ${workspace.id}`)
          
          // Store the checkpoint message ID so we can reference it later
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(`initial-checkpoint-${workspace.id}`, initialCheckpointMessageId)
          }
        } catch (checkpointError) {
          console.error('Failed to create initial checkpoint:', checkpointError)
          // Don't fail the project creation if checkpoint fails
        }
        
        toast.success('Project created and saved!')
        
        // 🌐 CRITICAL FIX: Fetch URL content BEFORE storing prompt
        // This ensures the full prompt with website context is ready for auto-send
        let fullPrompt = prompt.trim()
        
        if (attachedUrl.trim()) {
          console.log('🌐 Fetching URL content before storing prompt:', attachedUrl)
          toast.loading('Fetching website content...', { id: 'url-fetch' })
          
          try {
            const response = await fetch('/api/redesign', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: attachedUrl.trim() })
            })
            
            if (response.ok) {
              const data = await response.json()
              
              if (data.ok && data.markdown) {
                console.log('✅ URL content fetched:', {
                  url: attachedUrl,
                  contentLength: data.markdown.length
                })
                
                // Append URL content to prompt
                fullPrompt = `${fullPrompt}\n\n=== WEBSITE CONTEXT ===\nURL: ${attachedUrl}\n\n${data.markdown}\n=== END WEBSITE CONTEXT ===`
                
                toast.success('Website content loaded!', { id: 'url-fetch' })
              } else {
                toast.error('Failed to fetch website content', { id: 'url-fetch' })
              }
            } else {
              toast.error('Failed to fetch website content', { id: 'url-fetch' })
            }
          } catch (error) {
            console.error('❌ Error fetching URL:', error)
            toast.error('Error loading website content', { id: 'url-fetch' })
          }
        }
        
        // Store the FULL prompt (with URL content if attached) in sessionStorage
        // This ensures the complete prompt is sent to the chat panel
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`initial-prompt-${workspace.id}`, fullPrompt)
          
          // CRITICAL FIX: Clear any cached project/file state to prevent contamination
          // This ensures the workspace loads with a clean slate
          sessionStorage.removeItem('lastSelectedProject')
          sessionStorage.removeItem('cachedFiles')
        }
        
        // Clear the input and redirect to workspace with the new project
        // No need to pass prompt in URL anymore - it's in sessionStorage
        setPrompt("")
        setAttachedUrl("") // Clear URL attachment
        router.push(`/workspace?newProject=${workspace.id}`)
      } else {
        throw new Error('Failed to generate project suggestion')
      }

    } catch (error) {
      console.error('❌ Error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create project')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUrlAttachment = () => {
    if (urlInput.trim()) {
      setAttachedUrl(urlInput.trim())
      setUrlInput("")
      setShowUrlPopover(false)
      toast.success("URL attached successfully!")
    }
  }

  const handleRemoveUrl = () => {
    setAttachedUrl("")
    toast.success("URL removed")
  }

  const handleGithubAttachment = () => {
    if (githubInput.trim()) {
      setGithubRepoUrl(githubInput.trim())
      setGithubInput("")
      setShowGithubPopover(false)
      toast.success("GitHub repository attached successfully!")
    }
  }

  const handleRemoveGithub = () => {
    setGithubRepoUrl("")
    toast.success("GitHub repository removed")
  }

  const handleGitlabAttachment = () => {
    if (gitlabInput.trim()) {
      setGitlabRepoUrl(gitlabInput.trim())
      setGitlabInput("")
      setShowGitlabPopover(false)
      toast.success("GitLab repository attached successfully!")
    }
  }

  const handleRemoveGitlab = () => {
    setGitlabRepoUrl("")
    toast.success("GitLab repository removed")
  }


  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Main Chat Input */}
      <div className="relative">
        <div className="rounded-2xl border border-gray-700/60 bg-gray-900/80 focus-within:border-gray-600 transition-colors shadow-2xl">
          {/* Loading Overlay */}
          {isGenerating && (
            <div className="absolute inset-0 bg-gray-900/96 backdrop-blur-sm rounded-2xl flex items-center justify-center z-20 border border-gray-700/60">
              <div className="flex items-center gap-3 text-white">
                <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm font-medium text-gray-300">PiPilot is working...</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Input Field - Auto-expanding textarea */}
            <div className="relative">
              <textarea
                ref={inputRef}
                placeholder={isGenerating ? "PiPilot is working..." : typingPlaceholder || "Describe your app idea..."}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value)
                  // Auto-resize textarea
                  const textarea = e.target as HTMLTextAreaElement
                  textarea.style.height = 'auto'
                  textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px'
                }}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                className="w-full min-h-[44px] max-h-[140px] resize-none border-0 bg-transparent text-gray-100 placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none px-3.5 pt-3 pb-2 text-sm"
                disabled={isGenerating}
                rows={1}
              />
            </div>

            {/* URL Attachment Pills */}
            {attachedUrl && (
              <div className="flex items-center gap-2 px-3.5 pb-1">
                <div className="flex items-center gap-1 bg-orange-900/20 border border-orange-700/30 px-2.5 py-1 rounded-full text-xs text-orange-300">
                  <LinkIcon className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{attachedUrl}</span>
                  <button
                    onClick={handleRemoveUrl}
                    className="ml-1 text-orange-400 hover:text-orange-200 transition-colors"
                    title="Remove URL"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* GitHub Repository Attachment Pills */}
            {githubRepoUrl && (
              <div className="flex items-center gap-2 px-3.5 pb-1">
                <div className="flex items-center gap-1 bg-gray-800/50 border border-gray-700/30 px-2.5 py-1 rounded-full text-xs text-gray-300">
                  <Github className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{githubRepoUrl}</span>
                  <button
                    onClick={handleRemoveGithub}
                    className="ml-1 text-gray-400 hover:text-gray-200 transition-colors"
                    title="Remove GitHub repository"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* GitLab Repository Attachment Pills */}
            {gitlabRepoUrl && (
              <div className="flex items-center gap-2 px-3.5 pb-1">
                <div className="flex items-center gap-1 bg-orange-900/20 border border-orange-700/30 px-2.5 py-1 rounded-full text-xs text-orange-300">
                  <Gitlab className="w-3 h-3" />
                  <span className="truncate max-w-[200px]">{gitlabRepoUrl}</span>
                  <button
                    onClick={handleRemoveGitlab}
                    className="ml-1 text-orange-400 hover:text-orange-200 transition-colors"
                    title="Remove GitLab repository"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Bar with Buttons */}
            <div className="flex items-center justify-between px-2 pb-2">
              {/* Left Side - URL Attachment, Mic and Template Selector */}
              <div className="flex items-center gap-1">
                {/* URL Attachment Popover */}
                <Popover open={showUrlPopover} onOpenChange={setShowUrlPopover}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isGenerating}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Attach website URL"
                    >
                      <LinkIcon className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4 z-[70]" side="top" align="start">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-medium text-gray-200">Attach Website URL</h4>
                        <p className="text-xs text-gray-400 mt-1">
                          Enter a website URL to include its content in your prompt.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          placeholder="https://example.com"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                          autoFocus
                        />
                        <button
                          onClick={handleUrlAttachment}
                          disabled={!urlInput.trim()}
                          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                        >
                          Attach
                        </button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Voice Button - Waveform icon */}
                <button
                  type="button"
                  onClick={handleMicrophoneClick}
                  disabled={isTranscribing || isGenerating}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${
                    isRecording
                      ? 'text-red-400 animate-pulse'
                      : isTranscribing
                      ? 'opacity-30 cursor-wait'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                  title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing..." : "Start voice input"}
                >
                  {isTranscribing ? (
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  ) : isRecording ? (
                    <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="0" y="7.5" height="6" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                      <rect x="4" y="5.5" height="10" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                      <rect x="8" y="2.5" height="16" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                      <rect x="12" y="5.5" height="10" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                      <rect x="16" y="2.5" height="16" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                      <rect x="20" y="7.5" height="6" fill="currentColor" width="1" rx="0.5" ry="0.5" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="0" y="7.5" height="6" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                      <rect x="4" y="5.5" height="10" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                      <rect x="8" y="2.5" height="16" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                      <rect x="12" y="5.5" height="10" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                      <rect x="16" y="2.5" height="16" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                      <rect x="20" y="7.5" height="6" fill="currentColor" fillOpacity="0.5" width="1" rx="0.5" ry="0.5" />
                    </svg>
                  )}
                </button>

                {/* Template Selector */}
                <Select
                  value={selectedTemplate}
                  onValueChange={(value: 'vite-react' | 'nextjs' | 'expo' | 'html') => {
                    setSelectedTemplate(value)
                    setHasUserSelectedTemplate(true)
                  }}
                  disabled={isGenerating}
                >
                  <SelectTrigger className="w-[100px] h-8 bg-transparent border-0 text-gray-400 text-xs hover:text-gray-200 hover:bg-gray-800 rounded-lg focus:ring-0">
                    <SelectValue placeholder="Template" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="vite-react" className="text-gray-300 focus:bg-gray-700 focus:text-white">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-purple-400" />
                        <span>Vite</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="nextjs" className="text-gray-300 focus:bg-gray-700 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">▲</span>
                        <span>Next.js</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="expo" className="text-gray-300 focus:bg-gray-700 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📱</span>
                        <span>Expo</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="html" className="text-gray-300 focus:bg-gray-700 focus:text-white">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🌐</span>
                        <span>HTML</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Right Side - Enhance and Send Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePromptEnhancement}
                  disabled={!prompt.trim() || isEnhancing || isGenerating}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    isEnhancing
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                  title="Enhance prompt with AI"
                >
                  {isEnhancing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>

                {/* Send/Stop Button */}
                {isGenerating ? (
                  <button
                    type="button"
                    className="h-7 w-7 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 text-white fill-white" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!prompt.trim() && !githubRepoUrl.trim() && !gitlabRepoUrl.trim()}
                    className="h-7 w-7 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <ArrowUp className="size-4 text-white" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Import Badge Buttons */}
      <div className="flex justify-center gap-2 mt-4">
        <Popover open={showGithubPopover} onOpenChange={setShowGithubPopover}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={isGenerating || isImportingGithub}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-orange-700/50 border border-orange-600/50
              rounded-full text-gray-400 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              title="Import from GitHub"
            >Import from
              <Github className="w-3.5 h-3.5" />
              <span className="font-medium">GitHub</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 z-[70]" side="top" align="center">
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium text-gray-200">Import from GitHub</h4>
                <p className="text-xs text-gray-400 mt-1">
                  Enter a GitHub repository URL to import and start building from it.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://github.com/owner/repo"
                  value={githubInput}
                  onChange={(e) => setGithubInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  autoFocus
                />
                <button
                  onClick={handleGithubAttachment}
                  disabled={!githubInput.trim()}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  Import
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={showGitlabPopover} onOpenChange={setShowGitlabPopover}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={isGenerating || isImportingGitlab}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-orange-700/50 border border-orange-600/50 rounded-full text-orange-400 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
              title="Import from GitLab"
            >Import from
              <Gitlab className="w-3.5 h-3.5" />
              <span className="font-medium">GitLab</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4 z-[70]" side="top" align="center">
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium text-orange-200">Import from GitLab</h4>
                <p className="text-xs text-orange-400 mt-1">
                  Enter a GitLab repository URL to import and start building from it.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://gitlab.com/owner/repo"
                  value={gitlabInput}
                  onChange={(e) => setGitlabInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleGitlabAttachment()
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  autoFocus
                />
                <button
                  onClick={handleGitlabAttachment}
                  disabled={!gitlabInput.trim()}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  Import
                </button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Suggestion Pills */}
      {suggestions.length > 0 && (
        <div className="mt-6">
          <Suggestions>
            {suggestions.map((suggestion, index) => (
              <Suggestion
                key={index}
                suggestion={suggestion.display}
                onClick={(displayText) => setPrompt(suggestion.prompt)}
                disabled={isGenerating}
                title={suggestion.prompt}
              >
                {suggestion.display}
              </Suggestion>
            ))}
            <Suggestion
              suggestion="Refresh Suggestions"
              onClick={() => fetchPromptSuggestions()}
              disabled={isGenerating}
              title="Generate new prompt suggestions"
            >
              <RefreshCw className="w-4 h-4" />
            </Suggestion>
          </Suggestions>
        </div>
      )}
    </div>
  )
}


 