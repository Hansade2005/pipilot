"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { createClient } from '@/lib/supabase/client'
import { getDeploymentTokens } from '@/lib/cloud-sync'
import { useToast } from '@/hooks/use-toast'
import { useRepoAgent } from "@/hooks/use-repo-agent"
import { storageManager } from '@/lib/storage-manager'
import { Response } from '@/components/ai-elements/response'
import { ChainOfThought, ChainOfThoughtHeader, ChainOfThoughtContent, ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought'
import { Actions, Action } from '@/components/ai-elements/actions'
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueItemDescription,
  QueueItemIndicator,
  QueueList,
  type QueueTodo,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue"
import {
  Send,
  Paperclip,
  FileText,
  Settings,
  ChevronLeft,
  Github,
  GitBranch,
  Loader2,
  CheckCircle2,
  XCircle,
  File,
  Plus,
  Minus,
  Code,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Lock,
  Globe,
  Star,
  GitFork,
  Calendar,
  User,
  MessageSquare,
  Zap,
  HelpCircle,
  History,
  Image as ImageIcon,
  Link as LinkIcon,
  X,
  StopCircle,
  ChevronDown,
  ChevronUp,
  BrainIcon,
  Timer,
  ArrowUp,
  Trash2,
  Copy,
  RotateCcw,
  ArrowLeft,
  Square
} from 'lucide-react'

// Helper for user-friendly tool labels (past tense for completed actions)
const getToolLabel = (tool: string, args?: any) => {
  switch (tool) {
    case 'github_write_file':
      return `Created/Updated ${args?.path ? args.path.split('/').pop() : 'file'}`
    case 'github_read_file':
      return `Read ${args?.path ? args.path.split('/').pop() : 'file'}`
    case 'github_list_files':
      return `Listed files in ${args?.path || 'root'}`
    case 'github_create_branch':
      return `Created branch ${args?.branch || 'unknown'}`
    case 'github_delete_branch':
      return `Deleted branch ${args?.branch || 'unknown'}`
    case 'github_stage_change':
      return `Staged ${args?.operation || 'change'} for ${args?.path ? args.path.split('/').pop() : 'file'}`
    case 'github_commit_changes':
      return `Committed changes: "${args?.message || 'Update'}"`
    case 'github_edit_file':
      return `Edited ${args?.path ? args.path.split('/').pop() : 'file'}`
    case 'github_replace_string':
      return `Replaced text in ${args?.path ? args.path.split('/').pop() : 'file'}`
    case 'github_delete_file':
      return `Deleted ${args?.path ? args.path.split('/').pop() : 'file'}`
    case 'github_search_code':
      return `Searched code for "${args?.query || ''}"`
    case 'github_list_repos':
      return 'Listed repositories'
    case 'github_get_commit_statuses':
      return `Checked status for ${args?.ref?.slice(0, 7) || 'commit'}`
    case 'github_get_repo_info':
      return `Got info for ${args?.repo || 'repository'}`
    case 'github_create_todo':
      return `Created todo: "${args?.title || 'Task'}"`
    case 'github_update_todo':
      return `Updated todo: "${args?.title || args?.id || 'Task'}"`
    case 'github_delete_todo':
      return `Deleted todo ${args?.id || 'item'}`
    case 'github_get_repo_info':
      return 'Retrieved repository info'
    case 'github_create_repo':
      return `Created repository ${args?.name || 'unknown'}`
    case 'github_create_tag':
      return `Created tag ${args?.tag || 'unknown'}`
    case 'github_list_tags':
      return `Listed tags for ${args?.repo || 'current repo'}`
    case 'github_delete_tag':
      return `Deleted tag ${args?.tag || 'unknown'}`
    default:
      // Fallback to cleaner text if possible
      return tool.replace('github_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }
}

// Helper function to parse edit file diffs
function parseEditFileDiff(searchReplaceBlock: string): { additions: number; deletions: number; diffLines: string[] } {
  if (!searchReplaceBlock) return { additions: 0, deletions: 0, diffLines: [] }
  
  const diffLines: string[] = []
  let additions = 0
  let deletions = 0
  
  const searchMatch = searchReplaceBlock.match(/<<<<<<< SEARCH\n([\s\S]*?)\n=======/)
  const replaceMatch = searchReplaceBlock.match(/=======\n([\s\S]*?)\n>>>>>>> REPLACE/)
  
  if (searchMatch) {
    const searchLines = searchMatch[1].split('\n').filter(line => line.trim())
    deletions = searchLines.length
    searchLines.forEach(line => {
      diffLines.push(`- ${line}`)
    })
  }
  
  if (replaceMatch) {
    const replaceLines = replaceMatch[1].split('\n').filter(line => line.trim())
    additions = replaceLines.length
    replaceLines.forEach(line => {
      diffLines.push(`+ ${line}`)
    })
  }
  
  return { additions, deletions, diffLines }
}

// Helper function to parse string replacement diffs
function parseReplacementDiff(oldString: string, newString: string): { additions: number; deletions: number; diffLines: string[] } {
  if (!oldString || !newString) return { additions: 0, deletions: 0, diffLines: [] }
  
  const diffLines: string[] = []
  const oldLines = oldString.split('\n').filter(line => line.trim())
  const newLines = newString.split('\n').filter(line => line.trim())
  
  oldLines.forEach(line => {
    diffLines.push(`- ${line}`)
  })
  newLines.forEach(line => {
    diffLines.push(`+ ${line}`)
  })
  
  return {
    additions: newLines.length,
    deletions: oldLines.length,
    diffLines
  }
}

// Helper function to count file creation diffs
function parseFileCreationDiff(content: string): { additions: number; deletions: number; diffLines: string[] } {
  if (!content) return { additions: 0, deletions: 0, diffLines: [] }
  
  const lines = content.split('\n')
  const diffLines = lines.slice(0, 20).map(line => `+ ${line}`) // Show first 20 lines
  
  return {
    additions: lines.length,
    deletions: 0,
    diffLines: diffLines.length < lines.length ? [...diffLines, `... and ${lines.length - 20} more lines`] : diffLines
  }
}

// Helper function to parse file deletion diffs
function parseFileDeletionDiff(fileLength: number = 0): { additions: number; deletions: number; diffLines: string[] } {
  return {
    additions: 0,
    deletions: fileLength || 1,
    diffLines: ['File deleted']
  }
}

// Helper function to parse staging change diffs
function parseStagingChangeDiff(operation: string, content?: string, edit_operations?: any[], edit_mode?: string): { additions: number; deletions: number; diffLines: string[] } {
  if (operation === 'delete') {
    return parseFileDeletionDiff()
  }

  if (operation === 'create' && content) {
    return parseFileCreationDiff(content)
  }

  if (operation === 'update') {
    if (edit_mode === 'incremental' && edit_operations && edit_operations.length > 0) {
      // Parse incremental edits
      let totalAdditions = 0
      let totalDeletions = 0
      const allDiffLines: string[] = []

      edit_operations.forEach((edit: any) => {
        const { old_string, new_string } = edit
        const diffStats = parseReplacementDiff(old_string, new_string)
        totalAdditions += diffStats.additions
        totalDeletions += diffStats.deletions
        allDiffLines.push(...diffStats.diffLines)
      })

      return {
        additions: totalAdditions,
        deletions: totalDeletions,
        diffLines: allDiffLines
      }
    } else if (edit_mode === 'rewrite' && content) {
      // For rewrite mode, show full content as additions
      return parseFileCreationDiff(content)
    }
  }

  // Fallback
  return { additions: 0, deletions: 0, diffLines: [`${operation} operation`] }
}

interface RepoAgentViewProps {
  userId?: string
}

interface RepoInfo {
  id: number
  name: string
  full_name: string
  owner: string
  private: boolean
  html_url: string
  description: string | null
  language: string | null
  updated_at: string
  default_branch: string
  permissions: {
    admin: boolean
    push: boolean
    pull: boolean
  }
  archived: boolean
  disabled: boolean
}

interface Message {
  id: string
  content: string
  isUser: boolean
  timestamp: Date
  reasoning?: string
  toolInvocations?: any[]
  role?: 'user' | 'assistant'
}


interface ActionLog {
  id: string
  type: 'file_operation' | 'api_call' | 'commit' | 'error'
  description: string
  timestamp: Date
}

interface Attachment {
  id: string
  type: 'file' | 'image' | 'url'
  name: string
  content?: string
  url?: string
  size?: number
}

export function RepoAgentView({ userId }: RepoAgentViewProps) {
  // Landing page state
  const [currentView, setCurrentView] = useState<'landing' | 'workspace'>('landing')
  const [selectedRepo, setSelectedRepo] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('main')
  const [landingInput, setLandingInput] = useState('')
  const [isLandingLoading, setIsLandingLoading] = useState(false)

  // Workspace state
  const [messages, setMessages] = useState<Message[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Sidebar state
  const [activeTab, setActiveTab] = useState<'changes' | 'diffs' | 'actions' | 'todos'>('changes')
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([])
  const [showDiffs, setShowDiffs] = useState<Record<string, boolean>>({})

  // Tool call argument accumulation (for streaming tool calls)
  const [accumulatedToolArgs, setAccumulatedToolArgs] = useState<Map<string, any>>(new Map())

  // Tool invocations tracking - following chat-panel-v2.tsx pattern
  // Maps message ID to array of tool calls with their status
  const [activeToolCalls, setActiveToolCalls] = useState<Map<string, Array<{
    toolName: string
    toolCallId: string
    args?: any
    status: 'executing' | 'completed' | 'failed'
  }>>>(new Map())

  // UI state
  const [chatWidth, setChatWidth] = useState(50)
  const [isResizing, setIsResizing] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoadingConversation, setIsLoadingConversation] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<any[]>([])
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatBodyRef = useRef<HTMLDivElement>(null)

  // Attachment state
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showFileDialog, setShowFileDialog] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [showUrlDialog, setShowUrlDialog] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Streaming control
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamController, setStreamController] = useState<AbortController | null>(null)

  // Message expansion state
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({})

  // Todo state
  const [todos, setTodos] = useState<QueueTodo[]>([])

  // Debug todos state changes
  useEffect(() => {
    console.log('[RepoAgent] Todos state changed:', todos, 'Length:', todos.length)
  }, [todos])

  // GitHub tokens state (following deployment client pattern)
  const [storedTokens, setStoredTokens] = useState<{
    github: string | undefined
    vercel: string | undefined
    netlify: string | undefined
  }>({
    github: undefined,
    vercel: undefined,
    netlify: undefined
  })

  const { toast } = useToast()
  const supabase = createClient()

  // State for loading and repos/branches
  const [repositories, setRepositories] = useState<RepoInfo[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)
  const [isLoadingBranches, setIsLoadingBranches] = useState(false)

  // Use the repo agent hook for GitHub connection check only
  const {
    connectionStatus,
    isLoadingConnection,
    isConnected,
    checkConnection
  } = useRepoAgent()

  // Check connection on mount
  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  // Fetch repositories when we have a stored GitHub token
  useEffect(() => {
    if (storedTokens.github && repositories.length === 0 && currentView === 'landing') {
      fetchUserGitHubRepos()
    }
  }, [storedTokens.github, currentView])

  // Fetch branches when repository is selected
  useEffect(() => {
    if (selectedRepo && storedTokens.github) {
      fetchRepoGitHubBranches(selectedRepo)
    }
  }, [selectedRepo, storedTokens.github])

  // Set default branch when branches are loaded
  useEffect(() => {
    if (branches.length > 0 && selectedBranch === 'main' && !branches.includes('main')) {
      setSelectedBranch(branches[0])
    } else if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0])
    }
  }, [branches, selectedBranch])

  // Load all conversations for current user
  const loadConversationsList = async () => {
    if (!userId) return

    try {
      await storageManager.init()
      const allConversations = await storageManager.getAllRepoConversations(userId)
      // Sort by lastActivity descending
      const sorted = allConversations.sort((a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      )
      setConversationHistory(sorted)
    } catch (error) {
      console.error('[RepoAgent] Error loading conversations list:', error)
    }
  }

  // Load conversation history when repo and branch are selected
  useEffect(() => {
    const loadConversationHistory = async () => {
      if (!selectedRepo || !selectedBranch || !userId || currentView !== 'workspace') return

      setIsLoadingConversation(true)
      try {
        await storageManager.init()
        const conversation = await storageManager.getRepoConversation(selectedRepo, selectedBranch, userId)

        if (conversation) {
          console.log('[RepoAgent] Loaded conversation history:', conversation.messages.length, 'messages')
          setConversationId(conversation.id)
          // Convert stored messages to component Message format
          const loadedMessages: Message[] = conversation.messages.map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            isUser: msg.role === 'user',
            timestamp: new Date(msg.timestamp),
            reasoning: msg.reasoning,
            toolInvocations: msg.toolInvocations
          }))
          setMessages(loadedMessages)

          // Load todos if they exist in the conversation
          if (conversation.todos && Array.isArray(conversation.todos)) {
            setTodos(conversation.todos)
          } else {
            // Reconstruct todos from toolInvocations (same as action logs)
            const reconstructedTodos: QueueTodo[] = []
            loadedMessages.forEach((msg: Message) => {
              if (msg.toolInvocations) {
                msg.toolInvocations.forEach((tool: any) => {
                  if (tool.state === 'call' && tool.toolName === 'github_create_todo' && tool.args?.title) {
                    const todoId = `todo-${msg.timestamp?.getTime() || Date.now()}-${tool.toolCallId?.slice(-9) || Math.random().toString(36).substr(2, 9)}`
                    const todo: QueueTodo = {
                      id: todoId,
                      title: tool.args.title,
                      description: tool.args.description,
                      status: tool.args.status || 'pending'
                    }
                    reconstructedTodos.push(todo)
                  }
                })
              }
            })
            setTodos(reconstructedTodos)
          }

          // Reconstruct actionLogs from toolInvocations
          const reconstructedActionLogs: ActionLog[] = []
          loadedMessages.forEach((msg: Message) => {
            if (msg.toolInvocations) {
              msg.toolInvocations.forEach((tool: any) => {
                if (tool.state === 'call' || tool.state === 'result') {
                  const actionLog: ActionLog = {
                    id: tool.toolCallId || Date.now().toString(),
                    type: tool.toolName?.includes('file') || tool.toolName?.includes('folder') ? 'file_operation' : 'api_call',
                    description: getToolLabel(tool.toolName, tool.args),
                    timestamp: msg.timestamp
                  }
                  reconstructedActionLogs.push(actionLog)
                }
              })
            }
          })
          setActionLogs(reconstructedActionLogs)

          // Reset diff expansion state
          setShowDiffs({})
        } else {
          console.log('[RepoAgent] No conversation history found for', selectedRepo, selectedBranch)
          setConversationId(null)
        }
      } catch (error) {
        console.error('[RepoAgent] Error loading conversation history:', error)
        // If IndexedDB store doesn't exist yet, user needs to refresh browser to trigger upgrade
        if (error instanceof Error && error.message.includes('object stores was not found')) {
          console.warn('[RepoAgent] ⚠️ IndexedDB schema outdated. Please refresh the browser to upgrade.')
          toast({
            title: "Database Upgrade Required",
            description: "Please refresh your browser to enable conversation history.",
            variant: "default"
          })
        }
        // Continue without conversation history
        setConversationId(null)
      } finally {
        setIsLoadingConversation(false)
      }
    }

    loadConversationHistory()
  }, [selectedRepo, selectedBranch, userId, currentView])

  // Load conversations list on mount
  useEffect(() => {
    loadConversationsList()
  }, [userId])

  // Load conversations list on mount
  useEffect(() => {
    if (userId) {
      loadConversationsList()
    }
  }, [userId])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [currentInput, landingInput])

  // Load stored tokens on mount (following deployment client pattern)
  const loadStoredTokens = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.log('loadStoredTokens: No user found')
        return
      }

      console.log('loadStoredTokens: Loading tokens for user:', user.id)
      const tokens = await getDeploymentTokens(user.id)
      console.log('loadStoredTokens: Retrieved tokens:', tokens)

      if (tokens) {
        const newTokens = {
          github: tokens.github || undefined,
          vercel: tokens.vercel || undefined,
          netlify: tokens.netlify || undefined
        }
        console.log('loadStoredTokens: Setting stored tokens:', newTokens)
        setStoredTokens(newTokens)
      } else {
        console.log('loadStoredTokens: No tokens found, clearing stored tokens')
        setStoredTokens({
          github: undefined,
          vercel: undefined,
          netlify: undefined
        })
      }
    } catch (error) {
      console.error('loadStoredTokens: Error loading tokens:', error)
      setStoredTokens({
        github: undefined,
        vercel: undefined,
        netlify: undefined
      })
    }
  }

  // Fetch user's GitHub repositories (following deployment-client pattern)
  const fetchUserGitHubRepos = async () => {
    if (!storedTokens.github) {
      toast({
        title: "GitHub Not Connected",
        description: "Please connect your GitHub account in Account Settings first.",
        variant: "destructive"
      })
      return
    }

    setIsLoadingRepos(true)
    try {
      const response = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=100`, {
        headers: {
          'Authorization': `Bearer ${storedTokens.github}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch repositories')
      }

      const repos = await response.json()
      const formattedRepos: RepoInfo[] = repos.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        html_url: repo.html_url,
        description: repo.description,
        language: repo.language,
        updated_at: repo.updated_at,
        default_branch: repo.default_branch,
        permissions: {
          admin: repo.permissions?.admin || false,
          push: repo.permissions?.push || false,
          pull: repo.permissions?.pull || false
        },
        archived: repo.archived,
        disabled: repo.disabled
      }))

      setRepositories(formattedRepos)
    } catch (error) {
      console.error('Error fetching GitHub repositories:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch repositories. Please check your connection.',
        variant: 'destructive'
      })
    } finally {
      setIsLoadingRepos(false)
    }
  }

  // Fetch branches for a repository (following deployment-client pattern)
  const fetchRepoGitHubBranches = async (repoFullName: string) => {
    if (!storedTokens.github) return

    setIsLoadingBranches(true)
    try {
      const response = await fetch(`https://api.github.com/repos/${repoFullName}/branches?per_page=100`, {
        headers: {
          'Authorization': `Bearer ${storedTokens.github}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch branches')
      }

      const branchesData = await response.json()
      const branchNames = branchesData.map((branch: any) => branch.name)
      setBranches(branchNames)

      // Set default branch if not set
      if (branchNames.length > 0 && !selectedBranch) {
        setSelectedBranch(branchNames[0])
      }
    } catch (error) {
      console.error('Error fetching branches:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch branches.',
        variant: 'destructive'
      })
    } finally {
      setIsLoadingBranches(false)
    }
  }

  // Load tokens on mount
  useEffect(() => {
    loadStoredTokens()
  }, [])

  // Auto-scroll to bottom of chat

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight
    }
  }, [messages])

  const handleLandingSubmit = async () => {
    if (!landingInput.trim() || !selectedRepo) {
      toast({
        title: "Missing Information",
        description: "Please select a repository and enter a prompt.",
        variant: "destructive"
      })
      return
    }

    if (!storedTokens.github) {
      toast({
        title: "GitHub Not Connected",
        description: "Please connect your GitHub account first.",
        variant: "destructive"
      })
      return
    }

    setIsLandingLoading(false)

    try {
      // Add initial message
      const initialMessage: Message = {
        id: Date.now().toString(),
        content: landingInput,
        isUser: true,
        timestamp: new Date()
      }

      setMessages([initialMessage])
      setCurrentView('workspace')

      // Call the repo agent API
      const response = await fetch('/api/repo-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: landingInput
          }],
          repo: selectedRepo,
          branch: selectedBranch,
          githubToken: storedTokens.github,
          todos: todos
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start repo agent session')
      }

      // Handle streaming response (following chat-panel-v2 pattern)
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream available')
      }

      const decoder = new TextDecoder()
      let lineBuffer = ''
      let accumulatedContent = ''
      const agentMessageId = (Date.now() + 1).toString()

      // Create placeholder assistant message
      const assistantMessage: Message = {
        id: agentMessageId,
        content: '',
        isUser: false,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])

      let accumulatedReasoning = ''
      let accumulatedToolInvocations: any[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[RepoAgent] Stream complete')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        const completeLines = lines.filter(line => line.trim())

        for (const line of completeLines) {
          try {
            const jsonString = line.startsWith('data: ') ? line.slice(6) : line
            if (!jsonString || jsonString.startsWith(':')) continue

            const parsed = JSON.parse(jsonString)
            console.log('[RepoAgent] Parsed event:', parsed.type, parsed.toolName || 'N/A', parsed.toolCallId || 'N/A')

            // Handle text deltas
            if (parsed.type === 'text-delta' && parsed.text) {
              accumulatedContent += parsed.text

              // Check for todo creation messages in the text
              const todoMatch = parsed.text.match(/Created todo: "([^"]+)"/)
              if (todoMatch) {
                const todoTitle = todoMatch[1]
                console.log('[RepoAgent] Detected todo creation in text:', todoTitle)
                // The actual todo object will be created from the tool result
                // For now, we'll rely on the tool-result event
              }
              setMessages(prev => prev.map(msg =>
                msg.id === agentMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))
            }
            else if (parsed.type === 'reasoning-delta' && parsed.text) {
              accumulatedReasoning += parsed.text
              setMessages(prev => prev.map(msg =>
                msg.id === agentMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))
            }
            // Handle tool calls
            else if (parsed.type === 'tool-call') {
              console.log('[RepoAgent] 🔧 TOOL-CALL EVENT RECEIVED:', {
                type: parsed.type,
                toolName: parsed.toolName,
                toolCallId: parsed.toolCallId,
                args: parsed.args,
                input: parsed.input,
                argsType: typeof parsed.args,
                inputType: typeof parsed.input,
                argsKeys: parsed.args ? Object.keys(parsed.args) : 'no args',
                inputKeys: parsed.input ? Object.keys(parsed.input) : 'no input',
                allKeys: Object.keys(parsed)
              })

              // Accumulate tool arguments (for streaming tool calls)
              const toolCallId = parsed.toolCallId || Date.now().toString()
              const currentArgs = accumulatedToolArgs.get(toolCallId) || {}
              const newArgs = { ...currentArgs, ...(parsed.args || parsed.input || {}) }
              setAccumulatedToolArgs(prev => new Map(prev).set(toolCallId, newArgs))

              accumulatedToolInvocations.push({
                toolCallId: toolCallId,
                toolName: parsed.toolName,
                args: newArgs, // Use accumulated args
                state: 'call'
              })

              // Track in activeToolCalls for status management
              const toolEntry = {
                toolName: parsed.toolName,
                toolCallId: toolCallId,
                args: newArgs, // Use accumulated args
                status: 'executing' as const
              }

              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(agentMessageId) || []
                messageCalls.push(toolEntry)
                newMap.set(agentMessageId, messageCalls)
                return newMap
              })

              const actionLog: ActionLog = {
                id: toolCallId,
                type: parsed.toolName?.includes('file') || parsed.toolName?.includes('stage') ? 'file_operation' : 'api_call',
                description: getToolLabel(parsed.toolName, newArgs), // Use accumulated args
                timestamp: new Date()
              }
              setActionLogs(prev => [...prev, actionLog])

              // Handle todo creation from tool calls (same as action logs)
              // MOVED TO TOOL-RESULT: if (parsed.toolName === 'github_create_todo') {
              //   console.log('[RepoAgent] 🎯 CREATE TODO TOOL DETECTED with accumulated args:', newArgs)
              //   if (newArgs.title) {  // Only create if we have the essential data
              //     const todoId = `todo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
              //     const todo: QueueTodo = {
              //       id: todoId,
              //       title: newArgs.title,
              //       description: newArgs.description,
              //       status: newArgs.status || 'pending'
              //     }
              //     console.log('[RepoAgent] Creating todo from tool call:', todo)
              //     setTodos(prev => {
              //       const newTodos = [...prev, todo]
              //       console.log('[RepoAgent] Todos after creation from tool call:', newTodos.length, 'todos')
              //       return newTodos
              //     })
              //   } else {
              //     console.log('[RepoAgent] Waiting for complete args, current args:', newArgs)
              //   }
              // } else if (parsed.toolName === 'github_update_todo') {
              //   console.log('[RepoAgent] 🎯 UPDATE TODO TOOL DETECTED with args:', newArgs)
              //   if (newArgs.id) {
              //     setTodos(prev => prev.map(todo =>
              //       todo.id === newArgs.id ? { ...todo, ...(newArgs.title && { title: newArgs.title }), ...(newArgs.description !== undefined && { description: newArgs.description }), ...(newArgs.status && { status: newArgs.status }) } : todo
              //     ))
              //   }
              // } else if (parsed.toolName === 'github_delete_todo') {
              //   console.log('[RepoAgent] 🎯 DELETE TODO TOOL DETECTED with args:', newArgs)
              //   if (newArgs.id) {
              //     setTodos(prev => prev.filter(todo => todo.id !== newArgs.id))
              //   }
              // }

              // TEMP: Create a test todo for ANY tool call to verify UI works
              if (parsed.toolName && parsed.toolName.includes('todo')) {
                console.log('[RepoAgent] TODO TOOL DETECTED - should create todo')
              }

              setMessages(prev => prev.map(msg =>
                msg.id === agentMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))
            }
            // Handle tool results
            else if (parsed.type === 'tool-result') {
              console.log('[RepoAgent] 🔄 TOOL-RESULT EVENT RECEIVED:', {
                type: parsed.type,
                toolName: parsed.toolName,
                toolCallId: parsed.toolCallId,
                result: parsed.result,
                resultType: typeof parsed.result,
                hasTodo: !!parsed.result?.todo,
                todoType: typeof parsed.result?.todo,
                resultKeys: parsed.result ? Object.keys(parsed.result) : 'no result'
              })

              // Update toolInvocations to mark as completed
              const toolIndex = accumulatedToolInvocations.findIndex(t => t.toolCallId === parsed.toolCallId)
              if (toolIndex !== -1) {
                accumulatedToolInvocations[toolIndex] = {
                  ...accumulatedToolInvocations[toolIndex],
                  state: 'result',
                  result: parsed.result
                }
              }

              // Update tool status in activeToolCalls
              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(agentMessageId) || []
                const updatedCalls = messageCalls.map(call =>
                  call.toolCallId === parsed.toolCallId
                    ? { ...call, status: (parsed.result?.success || !parsed.result?.error) ? 'completed' as const : 'failed' as const }
                    : call
                )
                newMap.set(agentMessageId, updatedCalls)
                return newMap
              })

              setMessages(prev => prev.map(msg =>
                msg.id === agentMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))

              // Actions are tracked on tool-call, no need to update on result

              // File changes are tracked in toolInvocations instead of separate state
              // This follows the chat-panel-v2.tsx pattern of using tool execution data directly

              // Handle todo operations in tool-result events (creation, updates, and deletes)
              if (parsed.type === 'tool-result' && parsed.toolName?.includes('todo')) {
                console.log('[RepoAgent] 🎯 TODO TOOL RESULT DETECTED:', {
                  toolName: parsed.toolName,
                  toolCallId: parsed.toolCallId,
                  hasResult: !!parsed.result,
                  resultKeys: parsed.result ? Object.keys(parsed.result) : [],
                  resultValue: parsed.result
                })

                // Find the corresponding tool invocation args (like file operations do)
                const toolInvocation = accumulatedToolInvocations.find(t => t.toolCallId === parsed.toolCallId)
                const toolCallArgs = toolInvocation?.args
                console.log('[RepoAgent] 🎯 TOOL INVOCATION ARGS FOR RESULT:', toolCallArgs, 'from invocation:', toolInvocation)

                // Handle todo creation from tool results (using args like file operations do)
                if (parsed.toolName === 'github_create_todo' && toolCallArgs?.title) {
                  console.log('[RepoAgent] 🎯 CREATING TODO FROM ARGS:', toolCallArgs)
                  const todo: QueueTodo = {
                    id: toolCallArgs.id,
                    title: toolCallArgs.title,
                    description: toolCallArgs.description,
                    status: toolCallArgs.status || 'pending'
                  }
                  console.log('[RepoAgent] 🎯 CREATED TODO OBJECT:', todo)
                  setTodos(prev => {
                    const newTodos = [...prev, todo]
                    console.log('[RepoAgent] 🎯 TODOS AFTER AI CREATION:', newTodos.length, 'todos')
                    return newTodos
                  })
                } else if (parsed.toolName === 'github_update_todo' && toolCallArgs?.id) {
                  console.log('[RepoAgent] 🎯 UPDATING TODO FROM ARGS:', toolCallArgs)
                  setTodos(prev => prev.map(todo =>
                    todo.id === toolCallArgs.id ? {
                      ...todo,
                      ...(toolCallArgs.title && { title: toolCallArgs.title }),
                      ...(toolCallArgs.description !== undefined && { description: toolCallArgs.description }),
                      ...(toolCallArgs.status && { status: toolCallArgs.status })
                    } : todo
                  ))
                } else if (parsed.toolName === 'github_delete_todo' && toolCallArgs?.id) {
                  console.log('[RepoAgent] 🎯 DELETING TODO:', toolCallArgs.id)
                  setTodos(prev => prev.filter(todo => todo.id !== toolCallArgs.id))
                }
              }
            }
          } catch (parseError) {
            console.warn('[RepoAgent] Parse error:', parseError)
          }
        }
      }

      // Final update: ensure the complete accumulated content is in the message
      console.log('[RepoAgent] Landing stream complete, final content length:', accumulatedContent.length)
      setMessages(prev => prev.map(msg =>
        msg.id === agentMessageId
          ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
          : msg
      ))

      // Set streaming to true for the view transition
      setIsStreaming(false)

      // Save initial conversation after first stream completes
      await saveConversationToStorage()
    } catch (error) {
      console.error('Error starting repo agent:', error)
      toast({
        title: "Error",
        description: "Failed to start repo agent session. Please try again.",
        variant: "destructive"
      })
      setCurrentView('landing')
      setMessages([])
    } finally {
      setIsLandingLoading(false)
    }
  }

  const sendMessage = async (content: string) => {
    if (!content.trim() && attachments.length === 0) return

    // Build message content with attachments
    let messageContent = content
    if (attachments.length > 0) {
      messageContent += '\n\n**Attachments:**\n'
      attachments.forEach(att => {
        if (att.type === 'file') {
          messageContent += `\n### File: ${att.name}\n\`\`\`\n${att.content}\n\`\`\`\n`
        } else if (att.type === 'image') {
          messageContent += `\n![${att.name}](${att.content})\n`
        } else if (att.type === 'url') {
          messageContent += `\n- [${att.url}](${att.url})\n`
        }
      })
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      isUser: true,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setCurrentInput('')
    setAttachments([]) // Clear attachments after sending
    setIsLoading(true)
    setIsStreaming(true)

    // Create abort controller for stream cancellation
    const controller = new AbortController()
    setStreamController(controller)

    try {
      // Create placeholder assistant message
      const assistantMessageId = (Date.now() + 1).toString()
      const assistantMessage: Message = {
        id: assistantMessageId,
        content: '',
        isUser: false,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, assistantMessage])

      // Continue the conversation with the repo agent (send full history as context)
      const conversationHistory = messages.concat(userMessage).map(msg => ({
        role: msg.isUser ? 'user' : 'assistant',
        content: msg.content
      }))

      console.log('[RepoAgent] Sending conversation history:', conversationHistory.length, 'messages')

      const response = await fetch('/api/repo-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          repo: selectedRepo,
          branch: selectedBranch,
          githubToken: storedTokens.github,
          todos: todos
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      // Handle streaming response (following chat-panel-v2 pattern)
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream available')
      }

      const decoder = new TextDecoder()
      let lineBuffer = ''
      let accumulatedContent = ''
      let accumulatedReasoning = ''
      let accumulatedToolInvocations: any[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[RepoAgent] Stream complete')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        lineBuffer += chunk
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || ''

        const completeLines = lines.filter(line => line.trim())

        for (const line of completeLines) {
          try {
            const jsonString = line.startsWith('data: ') ? line.slice(6) : line
            if (!jsonString || jsonString.startsWith(':')) continue

            const parsed = JSON.parse(jsonString)

            if (parsed.type === 'text-delta' && parsed.text) {
              accumulatedContent += parsed.text
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))
            }
            else if (parsed.type === 'reasoning-delta' && parsed.text) {
              accumulatedReasoning += parsed.text
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))
            }
            else if (parsed.type === 'tool-call') {
              // Accumulate tool arguments (for streaming tool calls)
              const toolCallId = parsed.toolCallId || Date.now().toString()
              const currentArgs = accumulatedToolArgs.get(toolCallId) || {}
              const newArgs = { ...currentArgs, ...(parsed.args || parsed.input || {}) }
              setAccumulatedToolArgs(prev => new Map(prev).set(toolCallId, newArgs))

              // Add to tool invocations for the message (AI SDK format)
              accumulatedToolInvocations.push({
                toolCallId: toolCallId,
                toolName: parsed.toolName,
                args: newArgs, // Use accumulated args
                state: 'call'
              })

              // Track in activeToolCalls for status management
              const toolEntry = {
                toolName: parsed.toolName,
                toolCallId: toolCallId,
                args: newArgs, // Use accumulated args
                status: 'executing' as const
              }

              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(assistantMessageId) || []
                messageCalls.push(toolEntry)
                newMap.set(assistantMessageId, messageCalls)
                return newMap
              })

              // Update sidebar log
              const actionLog: ActionLog = {
                id: toolCallId,
                type: parsed.toolName?.includes('file') || parsed.toolName?.includes('folder') ? 'file_operation' : 'api_call',
                description: getToolLabel(parsed.toolName, newArgs), // Use accumulated args
                timestamp: new Date()
              }
              setActionLogs(prev => [...prev, actionLog])

              // Update message with new tool invocation
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))
            }
            else if (parsed.type === 'tool-result') {
              console.log('[RepoAgent] Tool result:', parsed.toolName, parsed.result)

              // Update tool invocation state
              const toolIndex = accumulatedToolInvocations.findIndex(t => t.toolCallId === parsed.toolCallId)
              if (toolIndex !== -1) {
                accumulatedToolInvocations[toolIndex] = {
                  ...accumulatedToolInvocations[toolIndex],
                  state: 'result',
                  result: parsed.result
                }
              }

              // Update tool status in activeToolCalls
              setActiveToolCalls(prev => {
                const newMap = new Map(prev)
                const messageCalls = newMap.get(assistantMessageId) || []
                const updatedCalls = messageCalls.map(call =>
                  call.toolCallId === parsed.toolCallId
                    ? { ...call, status: (parsed.result?.success || !parsed.result?.error) ? 'completed' as const : 'failed' as const }
                    : call
                )
                newMap.set(assistantMessageId, updatedCalls)
                return newMap
              })

              // Actions are tracked on tool-call, no need to update on result

              // Update message
              setMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId
                  ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
                  : msg
              ))

              // Handle todo operations in tool-result events (creation, updates, and deletes)
              if (parsed.toolName?.includes('todo')) {
                console.log('[RepoAgent] 🎯 TODO TOOL RESULT DETECTED:', {
                  toolName: parsed.toolName,
                  toolCallId: parsed.toolCallId,
                  hasResult: !!parsed.result,
                  resultKeys: parsed.result ? Object.keys(parsed.result) : [],
                  resultValue: parsed.result
                })

                // Find the corresponding tool invocation args (like file operations do)
                const toolInvocation = accumulatedToolInvocations.find(t => t.toolCallId === parsed.toolCallId)
                const toolCallArgs = toolInvocation?.args
                console.log('[RepoAgent] 🎯 TOOL INVOCATION ARGS FOR RESULT:', toolCallArgs, 'from invocation:', toolInvocation)

                // Handle todo creation from tool results (using args like file operations do)
                if (parsed.toolName === 'github_create_todo' && toolCallArgs?.title) {
                  console.log('[RepoAgent] 🎯 CREATING TODO FROM ARGS:', toolCallArgs)
                  const todo: QueueTodo = {
                    id: toolCallArgs.id,
                    title: toolCallArgs.title,
                    description: toolCallArgs.description,
                    status: toolCallArgs.status || 'pending'
                  }
                  console.log('[RepoAgent] 🎯 CREATED TODO OBJECT:', todo)
                  setTodos(prev => {
                    const newTodos = [...prev, todo]
                    console.log('[RepoAgent] 🎯 TODOS AFTER AI CREATION:', newTodos.length, 'todos')
                    return newTodos
                  })
                } else if (parsed.toolName === 'github_update_todo' && toolCallArgs?.id) {
                  console.log('[RepoAgent] 🎯 UPDATING TODO FROM ARGS:', toolCallArgs)
                  setTodos(prev => prev.map(todo =>
                    todo.id === toolCallArgs.id ? {
                      ...todo,
                      ...(toolCallArgs.title && { title: toolCallArgs.title }),
                      ...(toolCallArgs.description !== undefined && { description: toolCallArgs.description }),
                      ...(toolCallArgs.status && { status: toolCallArgs.status })
                    } : todo
                  ))
                } else if (parsed.toolName === 'github_delete_todo' && toolCallArgs?.id) {
                  console.log('[RepoAgent] 🎯 DELETING TODO:', toolCallArgs.id)
                  setTodos(prev => prev.filter(todo => todo.id !== toolCallArgs.id))
                }
              }

              // File changes are tracked in toolInvocations instead of separate state
              // This follows the chat-panel-v2.tsx pattern of using tool execution data directly
            }
          } catch (parseError) {
            console.warn('[RepoAgent] Parse error:', parseError)
          }
        }
      }

      // Final update
      console.log('[RepoAgent] Stream complete, final content length:', accumulatedContent.length)
      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? { ...msg, content: accumulatedContent, reasoning: accumulatedReasoning, toolInvocations: accumulatedToolInvocations }
          : msg
      ))

      // Save conversation after stream completes
      await saveConversationToStorage()
    } catch (error) {
      // Handle abort separately - don't show error toast for user-initiated stops
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[RepoAgent] Stream aborted by user')
        // Save partial message when aborted
        await saveConversationToStorage()
      } else {
        console.error('Error sending message:', error)
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive"
        })
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      setStreamController(null)
    }
  }

  // Save conversation to IndexedDB
  const saveConversationToStorage = async () => {
    if (!selectedRepo || !selectedBranch || !userId || messages.length === 0) return

    try {
      await storageManager.init()

      // Convert messages to storage format
      const storageMessages = messages.map(msg => ({
        id: msg.id,
        role: msg.isUser ? 'user' as const : 'assistant' as const,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        reasoning: msg.reasoning,
        toolInvocations: msg.toolInvocations
      }))

      if (conversationId) {
        // Update existing conversation
        await storageManager.updateRepoConversation(conversationId, {
          messages: storageMessages,
          todos: todos,
          lastActivity: new Date().toISOString()
        })
        console.log('[RepoAgent] Updated conversation:', conversationId)
      } else {
        // Create new conversation
        const newConversation = await storageManager.createRepoConversation({
          userId,
          repo: selectedRepo,
          branch: selectedBranch,
          messages: storageMessages,
          todos: todos
        })
        setConversationId(newConversation.id)
        console.log('[RepoAgent] Created new conversation:', newConversation.id)
      }
    } catch (error) {
      console.error('[RepoAgent] Error saving conversation:', error)
    }
  }

  const handleBackToLanding = () => {
    setCurrentView('landing')
    setMessages([])
    setActionLogs([])
    setTodos([])
    setLandingInput('')
    setAttachments([])
  }

  // Attachment handlers
  const handleFileAttach = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Check file size (max 1MB)
      if (file.size > 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 1MB limit`,
          variant: "destructive"
        })
        continue
      }

      const reader = new FileReader()

      reader.onload = (e) => {
        const content = e.target?.result as string
        setAttachments(prev => [...prev, {
          id: Date.now().toString() + i,
          type: 'file',
          name: file.name,
          content,
          size: file.size
        }])
      }

      reader.readAsText(file)
    }

    setShowFileDialog(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImageAttach = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Check file size (max 5MB for images)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Image too large",
          description: `${file.name} exceeds 5MB limit`,
          variant: "destructive"
        })
        continue
      }

      const reader = new FileReader()

      reader.onload = (e) => {
        const content = e.target?.result as string
        setAttachments(prev => [...prev, {
          id: Date.now().toString() + i,
          type: 'image',
          name: file.name,
          content,
          size: file.size
        }])
      }

      reader.readAsDataURL(file)
    }

    setShowImageDialog(false)
    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  const handleUrlAttach = () => {
    if (!urlInput.trim()) return

    setAttachments(prev => [...prev, {
      id: Date.now().toString(),
      type: 'url',
      name: urlInput,
      url: urlInput
    }])

    setUrlInput('')
    setShowUrlDialog(false)
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id))
  }

  // Stop streaming handler
  const handleStopStream = async () => {
    if (streamController) {
      streamController.abort()
      setStreamController(null)
    }
    setIsStreaming(false)
    setIsLoading(false)
    setIsLandingLoading(false)

    // Save the partial message that was already streamed
    await saveConversationToStorage()

    toast({
      title: "Stream stopped",
      description: "Partial response has been saved",
      variant: "default"
    })
  }

  // Toggle message expansion
  const toggleMessageExpansion = (messageId: string) => {
    setExpandedMessages(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }))
  }

  const toggleDiff = (filePath: string) => {
    setShowDiffs(prev => ({
      ...prev,
      [filePath]: !prev[filePath]
    }))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true)
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return

    const container = document.querySelector('.repo-agent-container') as HTMLElement
    if (!container) return

    const rect = container.getBoundingClientRect()
    const newWidth = ((e.clientX - rect.left) / rect.width) * 100

    if (newWidth >= 20 && newWidth <= 70) {
      setChatWidth(newWidth)
    }
  }

  const handleMouseUp = () => {
    setIsResizing(false)
  }

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
    } else {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Message Action Handlers
  const handleCopyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      toast({ title: 'Copied', description: 'Message copied to clipboard' })
    } catch (err) {
      toast({ title: 'Copy failed', variant: 'destructive' })
    }
  }

  const handleDeleteMessage = (messageId: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== messageId))
  }

  // Todo handler
  const handleRemoveTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id))
  }

  const handleTodoToggle = async (id: string) => {
    const todo = todos.find(t => t.id === id)
    if (!todo) return

    const newStatus: 'pending' | 'completed' = todo.status === 'completed' ? 'pending' : 'completed'

    const updatedTodo: QueueTodo = {
      ...todo,
      status: newStatus
    }

    // Update local state
    setTodos(prev => prev.map(t => t.id === id ? updatedTodo : t))

    // Update in storage if we have a conversation
    if (conversationId) {
      try {
        await storageManager.init()
        const updatedTodos = todos.map(t => t.id === id ? updatedTodo : t)
        await storageManager.updateRepoConversation(conversationId, {
          todos: updatedTodos,
          lastActivity: new Date().toISOString()
        })
      } catch (error) {
        console.error('Failed to update todo in storage', error)
      }
    }
  }

  const handleClearMessages = async () => {
    if (confirm('Are you sure you want to clear the entire conversation history? This cannot be undone.')) {
      setMessages([])
      setActionLogs([])
      setAttachments([])
      setTodos([])

      if (conversationId) {
        try {
          await storageManager.init()
          await storageManager.updateRepoConversation(conversationId, {
            messages: [],
            todos: [],
            lastActivity: new Date().toISOString()
          })
          toast({ title: 'Conversation cleared' })
        } catch (error) {
          console.error('Failed to clear conversation in storage', error)
          toast({ title: 'Error clearing conversation', variant: 'destructive' })
        }
      }
    }
  }

  const handleRetryMessage = (messageId: string, content: string) => {
    // Delete this message and all subsequent ones
    const messageIndex = messages.findIndex(msg => msg.id === messageId)
    if (messageIndex !== -1) {
      setMessages(prev => prev.slice(0, messageIndex)) // Remove the user message too
    }
    // Set input and focus
    if (currentView === 'landing') {
      setLandingInput(content)
    } else {
      setCurrentInput(content)
    }
    // Focus happens automatically via autofocus or effect if we set input?
  }


  if (currentView === 'landing') {
    return (
      <TooltipProvider>
        <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            {/* Hero Section */}
            <div className="text-center mb-8 max-w-3xl">
              <h1 className="text-5xl sm:text-6xl font-bold mb-3">
                <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-amber-500 bg-clip-text text-transparent">
                  PiPilot SWE Agent
                </span>
              </h1>
              <p className="text-lg text-gray-400">
               Your SWE companion for complex projects.
              </p>
            </div>

            {/* Clean Input Card - Matching chat-panel-v2 design */}
            <div className="w-full max-w-4xl">
              <div className="rounded-2xl border border-gray-700/60 bg-gray-900/80 focus-within:border-gray-600 transition-colors shadow-2xl overflow-hidden">
                {/* Header Bar with Repo/Branch Info */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700/60">
                  {/* GitHub Icon + Connection */}
                  <div className="flex items-center gap-2">
                    {storedTokens.github ? (
                      <div className="flex items-center gap-1.5 text-sm text-gray-400">
                        <Github className="h-4 w-4" />
                        <span className="text-xs">@</span>
                        <span className="font-medium text-gray-200">github</span>
                      </div>
                    ) : (
                      <a
                        href="/workspace/account"
                        className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        <Github className="h-4 w-4" />
                        <span>Connect GitHub</span>
                      </a>
                    )}
                  </div>

                  <div className="h-4 w-px bg-gray-700/60" />

                  {/* Repository Dropdown */}
                  <Select
                    value={selectedRepo}
                    onValueChange={setSelectedRepo}
                    disabled={!storedTokens.github || isLoadingRepos}
                  >
                    <SelectTrigger className="h-7 bg-transparent border-0 text-gray-200 text-sm font-medium hover:bg-gray-800/60 focus:ring-0 w-auto min-w-[200px]">
                      <SelectValue placeholder="Select repository" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700/60">
                      {repositories.map((repo) => (
                        <SelectItem
                          key={repo.full_name}
                          value={repo.full_name}
                          className="text-gray-200 hover:bg-gray-800"
                        >
                          <div className="flex items-center gap-2">
                            <span>{repo.full_name}</span>
                            {repo.private && <Lock className="h-3 w-3 text-gray-500" />}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Branch Icon */}
                  {selectedRepo && (
                    <>
                      <GitBranch className="h-3.5 w-3.5 text-gray-500" />

                      {/* Branch Dropdown */}
                      <Select
                        value={selectedBranch}
                        onValueChange={setSelectedBranch}
                        disabled={!selectedRepo || isLoadingBranches || !storedTokens.github}
                      >
                        <SelectTrigger className="h-7 bg-transparent border-0 text-gray-200 text-sm hover:bg-gray-800/60 focus:ring-0 w-auto min-w-[100px]">
                          <SelectValue placeholder="Branch" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700/60">
                          {branches.map((branch) => (
                            <SelectItem key={branch} value={branch} className="text-gray-200 hover:bg-gray-800">
                              {branch}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}

                  <div className="flex-1" />

                  {/* Refresh Icon */}
                  <button
                    type="button"
                    onClick={fetchUserGitHubRepos}
                    disabled={isLoadingRepos || !storedTokens.github}
                    className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-30"
                  >
                    {isLoadingRepos ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {/* History Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowHistoryDropdown(!showHistoryDropdown)
                        if (!showHistoryDropdown) loadConversationsList()
                      }}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                    >
                      <History className="h-3.5 w-3.5" />
                    </button>

                    {showHistoryDropdown && (
                      <div className="absolute top-full mt-2 right-0 w-72 rounded-xl overflow-hidden z-50 bg-gray-900/95 backdrop-blur-xl border border-gray-700/60 shadow-2xl max-h-[300px]">
                        <div className="p-3 border-b border-gray-700/60">
                          <p className="text-xs text-gray-400 font-medium">Conversation History</p>
                        </div>
                        <div className="overflow-y-auto max-h-64">
                          {conversationHistory.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              No conversation history
                            </div>
                          ) : (
                            conversationHistory.map((conv) => {
                              const firstUserMsg = conv.messages?.find((m: any) => m.role === 'user')
                              const title = firstUserMsg?.content?.substring(0, 15) + (firstUserMsg?.content?.length > 15 ? '...' : '') || 'Untitled'
                              const isCurrent = conv.id === conversationId

                              return (
                                <button
                                  key={conv.id}
                                  onClick={() => {
                                    setSelectedRepo(conv.repo)
                                    setSelectedBranch(conv.branch)
                                    setCurrentView('workspace')
                                    setShowHistoryDropdown(false)
                                  }}
                                  className={`w-full text-left p-3 transition-colors cursor-pointer hover:bg-gray-800/60 border-b border-gray-800/40 ${isCurrent ? 'bg-orange-600/10' : ''}`}
                                >
                                  <div className="flex items-start gap-2">
                                    <Github className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-gray-200 font-medium truncate">{title}</p>
                                      <p className="text-xs text-gray-400 truncate">{conv.repo} • {conv.branch}</p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        {new Date(conv.lastActivity).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Input Area */}
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={landingInput}
                    onChange={(e) => {
                      setLandingInput(e.target.value)
                      const textarea = e.target as HTMLTextAreaElement
                      textarea.style.height = 'auto'
                      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
                    }}
                    placeholder="Describe your coding task or ask a question..."
                    className="w-full min-h-[100px] max-h-[200px] resize-none border-0 bg-transparent text-sm text-gray-100 placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none px-4 pt-3 pb-2"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleLandingSubmit()
                      }
                    }}
                  />
                </div>

                {/* Bottom Action Bar */}
                <div className="flex items-center justify-end px-3 pb-2.5">
                  {/* Send/Loading Button */}
                  {isLandingLoading ? (
                    <button
                      type="button"
                      className="h-7 w-7 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                    >
                      <Square className="w-3.5 h-3.5 text-white fill-white" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLandingSubmit}
                      disabled={!landingInput.trim() || !selectedRepo || !storedTokens.github}
                      className="h-7 w-7 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    >
                      <ArrowUp className="size-4 text-white" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <div className="repo-agent-container h-screen flex overflow-hidden bg-gray-950 text-gray-200">
      {/* Chat Panel */}
      <div
        className="chat-panel flex flex-col relative overflow-hidden"
        style={{
          flex: `0 0 ${chatWidth}%`,
          minWidth: '320px'
        }}
      >
        {/* Chat Header */}
        <div className="chat-header px-4 py-3 flex items-center justify-between gap-3 border-b border-gray-700/60 bg-gray-900/80 backdrop-blur-sm font-semibold text-sm">
          <div className="header-left flex items-center gap-3">
            <button
              onClick={handleBackToLanding}
              className="w-6 h-6 cursor-pointer text-gray-400 transition-all hover:text-gray-200 hover:translate-x-[-2px]"
            >
              <ChevronLeft className="w-full h-full" />
            </button>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-1.5 text-gray-200 text-sm cursor-pointer outline-none transition-all hover:border-gray-600 focus:border-gray-600 appearance-none pr-7"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M6 8.5l-4-4h8l-4 4z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center'
              }}
            >
              <option value="">Select repository</option>
              {repositories.map(repo => (
                <option key={repo.full_name} value={repo.full_name}>
                  {repo.full_name}
                </option>
              ))}
            </select>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-1.5 text-gray-200 text-sm cursor-pointer outline-none transition-all hover:border-gray-600 focus:border-gray-600 appearance-none pr-7"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239ca3af' d='M6 8.5l-4-4h8l-4 4z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center'
              }}
              disabled={isLoadingBranches}
            >
              {branches.map(branch => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={chatBodyRef}
          className="chat-body flex-1 overflow-y-auto p-8 flex flex-col gap-5 bg-gray-950 pb-40"
        >
          {messages.map((message, index) => {
            const isLongMessage = message.isUser && message.content.length > 200
            const isExpanded = expandedMessages[message.id]
            const displayContent = isLongMessage && !isExpanded
              ? message.content.substring(0, 200) + '...'
              : message.content

            return (
              <div
                key={message.id}
                className={`message max-w-[80%] p-4 rounded-2xl leading-relaxed text-sm transition-all relative ${
                  message.isUser
                    ? 'self-end bg-orange-600 text-white rounded-br-sm'
                    : 'self-start bg-transparent text-white rounded-bl-sm'
                }`}
              >
                {message.isUser ? (
                  <div className="group">
                    <div className="whitespace-pre-wrap">{displayContent}</div>
                    {isLongMessage && (
                      <button
                        onClick={() => toggleMessageExpansion(message.id)}
                        className="mt-2 text-xs text-orange-200 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            Show more
                          </>
                        )}
                      </button>
                    )}

                    {/* User Action Buttons */}
                    <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Actions>
                        <Action tooltip="Retry message" onClick={() => handleRetryMessage(message.id, message.content)}>
                          <ArrowUp className="w-4 h-4" />
                        </Action>
                        <Action tooltip="Copy message" onClick={() => handleCopyMessage(message.content)}>
                          <Copy className="w-4 h-4" />
                        </Action>
                        <Action tooltip="Delete message" onClick={() => handleDeleteMessage(message.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Action>
                      </Actions>
                    </div>
                  </div>
                ) : (
                  <div className="group w-full max-w-full overflow-hidden">
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:text-foreground prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                      {message.reasoning && (
                        <div className="mb-4 not-prose">
                          <ChainOfThought defaultOpen={false}>
                            <ChainOfThoughtHeader>
                              {isStreaming && index === messages.length - 1
                                ? "PiPilot is working"
                                : "PiPilot thought for a moment"
                              }
                            </ChainOfThoughtHeader>
                            <ChainOfThoughtContent>
                              <ChainOfThoughtStep
                                icon={BrainIcon}
                                label="Thinking Process"
                                status={isStreaming && index === messages.length - 1 && !message.content ? "active" : "complete"}
                              >
                                <div className="prose prose-sm dark:prose-invert max-w-none mt-2 text-muted-foreground">
                                  <Response>{message.reasoning}</Response>
                                </div>
                              </ChainOfThoughtStep>
                            </ChainOfThoughtContent>
                          </ChainOfThought>
                        </div>
                      )}
                      <Response>{message.content}</Response>

                    </div>

                    {/* Assistant Action Buttons */}
                    <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Actions>
                        <Action tooltip="Copy message" onClick={() => handleCopyMessage(message.content)}>
                          <Copy className="w-4 h-4" />
                        </Action>
                        <Action tooltip="Delete message" onClick={() => handleDeleteMessage(message.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Action>
                      </Actions>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Input Area */}
        <div className="p-3 absolute bottom-0 left-0 right-0 z-10 bg-gray-950/95 backdrop-blur-sm border-t border-gray-800/60">
          {/* Attachment Badges */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 px-1">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group"
                >
                  {attachment.type === 'file' && <FileText className="w-3 h-3 text-gray-500" />}
                  {attachment.type === 'image' && <ImageIcon className="w-3 h-3 text-gray-500" />}
                  {attachment.type === 'url' && <LinkIcon className="w-3 h-3 text-gray-500" />}
                  <span className="truncate max-w-[120px]">
                    {attachment.name}
                  </span>
                  {attachment.size && (
                    <span className="text-gray-500 text-[10px]">
                      ({(attachment.size / 1024).toFixed(1)}KB)
                    </span>
                  )}
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Card - matching chat-panel-v2 style */}
          <div className="relative rounded-2xl border border-gray-700/60 bg-gray-900/80 focus-within:border-gray-600 transition-colors">
            <Textarea
              ref={textareaRef}
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              placeholder="Describe what you want to build..."
              className="min-h-[44px] max-h-[140px] resize-none border-0 bg-transparent text-sm text-gray-100 placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 px-3.5 pt-3 pb-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                  e.preventDefault()
                  sendMessage(currentInput)
                }
              }}
            />

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-3 pb-2.5">
              <div className="flex items-center gap-1">
                <Popover open={showAttachmentMenu} onOpenChange={setShowAttachmentMenu}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                      disabled={isLoading}
                    >
                      <Plus className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-2 z-[70] bg-gray-900 border-gray-700" side="top" align="start">
                    <div className="flex flex-col gap-1">
                      <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">Attach to message</div>

                      <button
                        onClick={() => {
                          setShowFileDialog(true)
                          setShowAttachmentMenu(false)
                        }}
                        className="w-full justify-start text-sm px-2 py-2 text-gray-300 hover:bg-gray-700/50 rounded transition-colors flex items-center gap-2"
                      >
                        <FileText className="size-4 text-gray-500" /> Upload File
                      </button>

                      <button
                        onClick={() => {
                          setShowImageDialog(true)
                          setShowAttachmentMenu(false)
                        }}
                        className="w-full justify-start text-sm px-2 py-2 text-gray-300 hover:bg-gray-700/50 rounded transition-colors flex items-center gap-2"
                      >
                        <ImageIcon className="size-4 text-gray-500" /> Upload Image
                      </button>

                      <button
                        onClick={() => {
                          setShowUrlDialog(true)
                          setShowAttachmentMenu(false)
                        }}
                        className="w-full justify-start text-sm px-2 py-2 text-gray-300 hover:bg-gray-700/50 rounded transition-colors flex items-center gap-2"
                      >
                        <LinkIcon className="size-4 text-gray-500" /> Attach URL
                      </button>

                      <div className="border-t border-gray-700/50 my-1"></div>

                      <button
                        onClick={() => {
                          setCurrentInput(prev => prev + '\n\n```\n// Code snippet\n```')
                          setShowAttachmentMenu(false)
                        }}
                        className="w-full justify-start text-sm px-2 py-2 text-gray-300 hover:bg-gray-700/50 rounded transition-colors flex items-center gap-2"
                      >
                        <Code className="size-4 text-gray-500" /> Code Block
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>

                {attachments.length > 0 && (
                  <span className="text-[11px] text-gray-500">{attachments.length} file{attachments.length > 1 ? 's' : ''}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleClearMessages}
                        className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
                        disabled={isLoading || messages.length === 0}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-gray-800 border-gray-700 text-gray-300 text-xs">
                      <p>Clear chat</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Send / Stop Button */}
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={handleStopStream}
                    className="h-7 w-7 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                    title="Stop generating"
                  >
                    <Square className="w-3.5 h-3.5 text-white fill-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendMessage(currentInput)}
                    disabled={(!currentInput.trim() && attachments.length === 0) || isLoading}
                    className="h-7 w-7 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <ArrowUp className="size-4 text-white" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resizer */}
      <div
        className="resizer w-[6px] cursor-col-resize transition-all relative bg-gray-800/60 hover:bg-gray-700/60"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-0.5 h-10 bg-gray-600 rounded-sm opacity-0 transition-opacity hover:opacity-100"></div>
      </div>

      {/* Sidebar */}
      <div className="sidebar flex-1 flex flex-col overflow-hidden bg-gray-950 border-l border-gray-700/60">
        {/* Sidebar Tabs */}
        <div className="sidebar-tabs px-4 py-3 flex items-center bg-gray-900/80 backdrop-blur-sm border-b border-gray-700/60">
          <div className="tab-buttons flex gap-1 p-1 rounded-xl bg-gray-800/60 border border-gray-700/60">
            <button
              onClick={() => setActiveTab('changes')}
              className={`px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-all ${activeTab === 'changes'
                ? 'bg-orange-600/15 text-orange-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
            >
              File Changes
            </button>
            <button
              onClick={() => setActiveTab('diffs')}
              className={`px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-all ${activeTab === 'diffs'
                ? 'bg-orange-600/15 text-orange-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
            >
              Code Diffs
            </button>
            <button
              onClick={() => setActiveTab('actions')}
              className={`px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-all ${activeTab === 'actions'
                ? 'bg-orange-600/15 text-orange-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
            >
              Actions
            </button>
            <button
              onClick={() => setActiveTab('todos')}
              className={`px-4 py-2 text-xs font-medium rounded-lg cursor-pointer transition-all ${activeTab === 'todos'
                ? 'bg-orange-600/15 text-orange-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`}
            >
              Todos
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="tab-content-wrapper flex-1 overflow-y-auto p-6 bg-gray-950">
          {activeTab === 'changes' && (
            <div className="tab-content">
              <h3 className="text-sm font-semibold mb-4 text-gray-200 flex items-center gap-2">
                <span className="w-1 h-5 bg-orange-500 rounded-sm inline-block"></span>
                Files Modified
              </h3>

              {messages.flatMap((msg: Message) => msg.toolInvocations?.filter((t: any) => t.state === 'result' && ['github_write_file', 'github_edit_file', 'github_replace_string', 'github_delete_file', 'github_stage_change'].includes(t.toolName)) || []).length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <File className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No file changes yet</p>
                </div>
              ) : (
                messages.flatMap((msg: Message) => msg.toolInvocations?.filter((t: any) => t.state === 'result' && ['github_write_file', 'github_edit_file', 'github_replace_string', 'github_delete_file', 'github_stage_change'].includes(t.toolName)) || []).map((tool: any, index: number) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 mb-2 rounded-xl cursor-pointer transition-all bg-gray-900/60 border border-gray-700/60 hover:bg-gray-800/60 hover:border-gray-600/60"
                  >
                    <div className="flex items-center">
                      <div className="mr-3">
                        {tool.toolName === 'github_delete_file' && (
                          <Minus className="w-4 h-4 text-red-400" />
                        )}
                        {tool.toolName === 'github_write_file' && (
                          <Plus className="w-4 h-4 text-green-400" />
                        )}
                        {['github_edit_file', 'github_replace_string'].includes(tool.toolName) && (
                          <File className="w-4 h-4 text-orange-400" />
                        )}
                        {tool.toolName === 'github_stage_change' && (
                          <GitBranch className="w-4 h-4 text-yellow-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-200">{tool.args?.path || tool.args?.filePath || 'unknown'}</div>
                        <div className="text-green-400 text-xs mt-0.5">
                          {tool.toolName === 'github_write_file' && 'created'}
                          {['github_edit_file', 'github_replace_string'].includes(tool.toolName) && 'modified'}
                          {tool.toolName === 'github_delete_file' && 'deleted'}
                          {tool.toolName === 'github_stage_change' && `staged ${tool.args?.operation || 'change'}`}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'diffs' && (
            <div className="tab-content">
              <h3 className="text-sm font-semibold mb-4 text-gray-200 flex items-center gap-2">
                <span className="w-1 h-5 bg-orange-500 rounded-sm inline-block"></span>
                Review Changes
              </h3>

              {messages.flatMap((msg: Message) => msg.toolInvocations?.filter((t: any) => t.state === 'result' && ['github_write_file', 'github_edit_file', 'github_replace_string', 'github_delete_file', 'github_stage_change'].includes(t.toolName)) || []).length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Code className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No diffs to review</p>
                </div>
              ) : (
                messages.flatMap((msg: Message) => msg.toolInvocations?.filter((t: any) => t.state === 'result' && ['github_write_file', 'github_edit_file', 'github_replace_string', 'github_delete_file', 'github_stage_change'].includes(t.toolName)) || []).map((change: any, index: number) => {
                  const filePath = change.args?.path || change.args?.filePath || 'unknown'
                  let diffStats = { additions: 0, deletions: 0, diffLines: [] as string[] }
                  
                  if (change.toolName === 'github_edit_file' && change.args?.searchReplaceBlock) {
                    diffStats = parseEditFileDiff(change.args.searchReplaceBlock)
                  } else if (change.toolName === 'github_replace_string' && change.args?.oldString && change.args?.newString) {
                    diffStats = parseReplacementDiff(change.args.oldString, change.args.newString)
                  } else if (change.toolName === 'github_write_file' && change.args?.content) {
                    diffStats = parseFileCreationDiff(change.args.content)
                  } else if (change.toolName === 'github_delete_file') {
                    diffStats = parseFileDeletionDiff()
                  } else if (change.toolName === 'github_stage_change') {
                    diffStats = parseStagingChangeDiff(
                      change.args?.operation,
                      change.args?.content,
                      change.args?.edit_operations,
                      change.args?.edit_mode
                    )
                  }
                  
                  return (
                    <div
                      key={index}
                      className="overflow-hidden mb-3 rounded-xl bg-gray-900/60 border border-gray-700/60"
                    >
                      <button
                        onClick={() => toggleDiff(filePath)}
                        className="w-full p-3 text-sm font-medium text-gray-200 flex items-center justify-between gap-2.5 cursor-pointer transition-all bg-gray-800/60 hover:bg-gray-800"
                      >
                        <div className="file-info flex items-center gap-2.5 flex-1">
                          <File className="w-4 h-4" />
                          <div className="flex flex-col items-start">
                            <span>{filePath}</span>
                            <span className="text-xs text-gray-400 mt-1">
                              {diffStats.additions > 0 && <span className="text-green-400">+{diffStats.additions}</span>}
                              {diffStats.additions > 0 && diffStats.deletions > 0 && <span className="mx-1">•</span>}
                              {diffStats.deletions > 0 && <span className="text-red-400">-{diffStats.deletions}</span>}
                            </span>
                          </div>
                        </div>
                        <div className="diff-indicator text-xs">
                          {showDiffs[filePath] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </div>
                      </button>
                      <div
                        className={`accordion-content overflow-hidden transition-all ${showDiffs[filePath] ? 'active' : ''
                          }`}
                        style={{
                          maxHeight: showDiffs[filePath] ? `${Math.min(diffStats.diffLines.length * 24 + 100, 1000)}px` : '0'
                        }}
                      >
                        <ScrollArea 
                          className="h-full" 
                          style={{ 
                            maxHeight: showDiffs[filePath] ? `${Math.min(diffStats.diffLines.length * 24 + 100, 1000)}px` : '0px' 
                          }}
                        >
                          <div className="flex">
                            {/* Line Numbers Column */}
                            <div className="bg-gray-800 border-r border-gray-600 px-2 py-4 text-xs text-gray-400 font-mono select-none min-w-[4rem] text-right">
                              {diffStats.diffLines.map((_, lineIndex) => (
                                <div key={lineIndex} className="h-6 flex items-center justify-end pr-2">
                                  {lineIndex + 1}
                                </div>
                              ))}
                            </div>
                            {/* Code Content */}
                            <div className="flex-1 p-4 space-y-1">
                              {diffStats.diffLines.map((line: string, lineIndex: number) => (
                                <div
                                  key={lineIndex}
                                  className="diff-line text-xs font-mono whitespace-pre-wrap break-all transition-all p-2 rounded"
                                  style={{
                                    background: line.startsWith('+') ? 'rgba(34, 197, 94, 0.1)' : line.startsWith('-') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.05)',
                                    borderLeft: line.startsWith('+') ? '3px solid #22c55e' : line.startsWith('-') ? '3px solid #ef4444' : 'transparent',
                                    color: line.startsWith('+') ? '#86efac' : line.startsWith('-') ? '#fca5a5' : '#9ca3af'
                                  }}
                                >
                                  {line}
                                </div>
                              ))}
                            </div>
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="tab-content">
              <h3 className="text-sm font-semibold mb-4 text-gray-200 flex items-center gap-2">
                <span className="w-1 h-5 bg-orange-500 rounded-sm inline-block"></span>
                Actions Performed
              </h3>

              {actionLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No actions performed yet</p>
                </div>
              ) : (
                actionLogs.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-3 p-3 mb-2 rounded-xl transition-all bg-gray-900/60 border border-gray-700/60 hover:bg-gray-800/60 hover:border-gray-600/60"
                  >
                    <div className="text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-200">{action.description}</div>
                      <div className="text-gray-500 text-xs mt-0.5 flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-400 text-[10px]">
                          {action.type === 'file_operation' && 'File'}
                          {action.type === 'api_call' && 'API'}
                          {action.type === 'commit' && 'Commit'}
                          {action.type === 'error' && 'Error'}
                        </span>
                        <span>{new Date(action.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'todos' && (
            <div className="tab-content">
              <h3 className="text-sm font-semibold mb-4 text-gray-200 flex items-center gap-2">
                <span className="w-1 h-5 bg-orange-500 rounded-sm inline-block"></span>
                Todo List
              </h3>

              {todos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No todos yet</p>
                  <p className="text-xs mt-1.5 text-gray-600">Ask me to create a todo and I'll add it here!</p>
                </div>
              ) : (
                <Queue>
                  <QueueSection>
                    <QueueSectionTrigger>
                      <QueueSectionLabel count={todos.length} label="Todo" />
                    </QueueSectionTrigger>
                    <QueueSectionContent>
                      <QueueList>
                        {todos.map((todo) => {
                          const isCompleted = todo.status === "completed";

                          return (
                            <QueueItem key={todo.id}>
                              <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleTodoToggle(todo.id)}>
                                <QueueItemIndicator completed={isCompleted} />
                                <QueueItemContent completed={isCompleted}>
                                  {todo.title}
                                </QueueItemContent>
                                <QueueItemActions>
                                  <QueueItemAction
                                    aria-label="Remove todo"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleRemoveTodo(todo.id)
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </QueueItemAction>
                                </QueueItemActions>
                              </div>
                              {todo.description && (
                                <QueueItemDescription completed={isCompleted}>
                                  {todo.description}
                                </QueueItemDescription>
                              )}
                            </QueueItem>
                          );
                        })}
                      </QueueList>
                    </QueueSectionContent>
                  </QueueSection>
                </Queue>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Animations handled via Tailwind */}

      {/* File Upload Dialog */}
      <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
            <DialogDescription className="text-gray-400">
              Select code files to attach to your message. Max 1MB per file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => handleFileAttach(e.target.files)}
              className="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-orange-600 file:text-white hover:file:bg-orange-500 file:cursor-pointer"
              accept=".txt,.md,.json,.js,.ts,.tsx,.jsx,.css,.html,.py,.java,.cpp,.c,.go,.rs,.yaml,.yml,.xml,.sh,.bat,.ps1,.sql"
            />
            <p className="text-xs text-gray-500">
              Supported: .txt, .md, .json, .js, .ts, .tsx, .jsx, .css, .html, .py, .java, .cpp, .go, .rs, .yaml, .xml, .sql, etc.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFileDialog(false)} className="border-gray-600 text-gray-300 hover:bg-gray-800">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Upload Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Upload Images</DialogTitle>
            <DialogDescription className="text-gray-400">
              Select images to attach to your message. Max 5MB per image.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <input
              ref={imageInputRef}
              type="file"
              multiple
              onChange={(e) => handleImageAttach(e.target.files)}
              className="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-600 file:text-white hover:file:bg-green-700 file:cursor-pointer"
              accept="image/*"
            />
            <p className="text-xs text-gray-500">
              Supported: PNG, JPG, GIF, WebP, SVG
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageDialog(false)} className="border-gray-600 text-gray-300 hover:bg-gray-800">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* URL Attachment Dialog */}
      <Dialog open={showUrlDialog} onOpenChange={setShowUrlDialog}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Attach URL</DialogTitle>
            <DialogDescription className="text-gray-400">
              Enter a URL to attach to your message as a reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/docs"
              className="bg-gray-800 border-gray-600 text-white placeholder:text-gray-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleUrlAttach()
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowUrlDialog(false)} className="border-gray-600 text-gray-300 hover:bg-gray-800">
              Cancel
            </Button>
            <Button onClick={handleUrlAttach} disabled={!urlInput.trim()} className="bg-purple-600 hover:bg-purple-700">
              Attach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}