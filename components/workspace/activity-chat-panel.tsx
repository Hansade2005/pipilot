"use client"

import React, { useState, useRef, useEffect, useCallback } from "react"
import {
  ArrowUp,
  Square,
  RotateCcw,
  MessageSquare,
  FileText,
  FolderTree,
  Database,
  X,
  Loader2,
  Paperclip,
  AtSign,
  ChevronDown,
  Code,
  Wrench,
  Check,
  File as FileIcon,
  Folder,
  Image,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Response } from "@/components/ai-elements/response"
import type { File as ProjectFile } from "@/lib/storage-manager"

// Types
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  fileContexts?: FileContext[]
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

interface FileContext {
  type: 'file' | 'folder' | 'codebase'
  path: string
  name: string
  content?: string
  tree?: string
}

interface ToolCall {
  id: string
  name: string
  args: any
  result?: any
  status: 'pending' | 'done' | 'error'
}

interface AtMentionOption {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  type: 'file' | 'folder' | 'codebase'
}

interface ActivityChatPanelProps {
  projectId: string | null
  projectFiles: ProjectFile[]
  selectedFile: ProjectFile | null
  selectedModel: string
  onOpenFile?: (filePath: string, lineNumber?: number) => void
}

// File icon helper
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (!ext) return <FileIcon className="size-3 text-gray-500" />
  if (['tsx', 'ts', 'jsx', 'js'].includes(ext)) return <Code className="size-3 text-blue-400" />
  if (['css', 'scss'].includes(ext)) return <FileText className="size-3 text-pink-400" />
  if (['json'].includes(ext)) return <FileText className="size-3 text-yellow-400" />
  if (['md', 'mdx'].includes(ext)) return <FileText className="size-3 text-gray-400" />
  if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext)) return <Image className="size-3 text-green-400" />
  return <FileIcon className="size-3 text-gray-500" />
}

export function ActivityChatPanel({
  projectId,
  projectFiles,
  selectedFile,
  selectedModel,
  onOpenFile,
}: ActivityChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [attachedContexts, setAttachedContexts] = useState<FileContext[]>([])

  // @ mention state
  const [showAtMenu, setShowAtMenu] = useState(false)
  const [atQuery, setAtQuery] = useState('')
  const [atMenuType, setAtMenuType] = useState<'main' | 'files' | 'folders'>('main')
  const [selectedAtIndex, setSelectedAtIndex] = useState(0)

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px'
    }
  }, [input])

  // Detect @ mentions
  const handleInputChange = useCallback((value: string) => {
    setInput(value)

    const cursorPos = textareaRef.current?.selectionStart || value.length
    const textBefore = value.substring(0, cursorPos)

    // Check for @ at word boundary
    const atMatch = textBefore.match(/(?:^|\s)@(\S*)$/)

    if (atMatch) {
      const query = atMatch[1].toLowerCase()
      setAtQuery(query)
      setSelectedAtIndex(0)

      if (query === '' || ['file', 'folder', 'codebase'].some(c => c.startsWith(query))) {
        setAtMenuType('main')
        setShowAtMenu(true)
      } else if (query.startsWith('file:') || query.startsWith('file ')) {
        setAtMenuType('files')
        setAtQuery(query.replace(/^file[: ]/, ''))
        setShowAtMenu(true)
      } else if (query.startsWith('folder:') || query.startsWith('folder ')) {
        setAtMenuType('folders')
        setAtQuery(query.replace(/^folder[: ]/, ''))
        setShowAtMenu(true)
      } else {
        // Search files by name
        setAtMenuType('files')
        setShowAtMenu(true)
      }
    } else {
      setShowAtMenu(false)
    }
  }, [])

  // Get filtered file list for @ menu
  const getFilteredFiles = useCallback(() => {
    if (!projectFiles) return []
    return projectFiles
      .filter(f => !f.isDirectory)
      .filter(f => {
        if (!atQuery) return true
        return f.name.toLowerCase().includes(atQuery) || f.path.toLowerCase().includes(atQuery)
      })
      .slice(0, 8)
  }, [projectFiles, atQuery])

  // Get filtered folders
  const getFilteredFolders = useCallback(() => {
    if (!projectFiles) return []
    const dirs = new Set<string>()
    projectFiles.forEach(f => {
      const parts = f.path.split('/')
      if (parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
          dirs.add(parts.slice(0, i).join('/'))
        }
      }
    })
    return Array.from(dirs)
      .filter(d => {
        if (!atQuery) return true
        return d.toLowerCase().includes(atQuery)
      })
      .sort()
      .slice(0, 8)
  }, [projectFiles, atQuery])

  // Handle @ menu selection
  const handleAtSelect = useCallback(async (type: string, value?: string) => {
    setShowAtMenu(false)

    // Remove the @ text from input
    const cursorPos = textareaRef.current?.selectionStart || input.length
    const textBefore = input.substring(0, cursorPos)
    const textAfter = input.substring(cursorPos)
    const atMatch = textBefore.match(/(?:^|\s)@\S*$/)

    let newInput = input
    if (atMatch) {
      const beforeAt = textBefore.substring(0, textBefore.length - atMatch[0].length + (atMatch[0].startsWith(' ') ? 1 : 0))
      newInput = beforeAt + textAfter
    }
    setInput(newInput.trim() ? newInput : '')

    if (type === 'file' && value) {
      const file = projectFiles.find(f => f.path === value)
      if (file) {
        // Get file content
        let content = file.content || ''
        if (!content && projectId) {
          try {
            const { storageManager } = await import('@/lib/storage-manager')
            await storageManager.init()
            const files = await storageManager.getFiles(projectId)
            const found = files.find(f => f.path === value)
            if (found) content = found.content || ''
          } catch {}
        }
        setAttachedContexts(prev => [...prev, {
          type: 'file',
          path: file.path,
          name: file.name,
          content,
        }])
      }
    } else if (type === 'folder' && value) {
      // Get folder tree
      const folderFiles = projectFiles
        .filter(f => f.path.startsWith(value + '/'))
        .map(f => f.path)
        .join('\n')
      setAttachedContexts(prev => [...prev, {
        type: 'folder',
        path: value,
        name: value.split('/').pop() || value,
        tree: folderFiles,
      }])
    } else if (type === 'codebase') {
      setAttachedContexts(prev => [...prev, {
        type: 'codebase',
        path: '/',
        name: 'Full Codebase',
      }])
    }

    textareaRef.current?.focus()
  }, [input, projectFiles, projectId])

  // Handle file import via button
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        setAttachedContexts(prev => [...prev, {
          type: 'file',
          path: file.name,
          name: file.name,
          content,
        }])
      }
      reader.readAsText(file)
    })

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Remove attached context
  const removeContext = (index: number) => {
    setAttachedContexts(prev => prev.filter((_, i) => i !== index))
  }

  // Send message
  const handleSend = useCallback(async () => {
    if ((!input.trim() && attachedContexts.length === 0) || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      fileContexts: attachedContexts.length > 0 ? [...attachedContexts] : undefined,
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setAttachedContexts([])
    setIsLoading(true)

    // Create assistant message placeholder
    const assistantId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      isStreaming: true,
    }])

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      // Prepare client files for session storage (send all project files)
      let clientFiles: any[] = []
      if (projectId && projectFiles.length > 0) {
        // Send file content for context
        const { storageManager } = await import('@/lib/storage-manager')
        await storageManager.init()
        const allFiles = await storageManager.getFiles(projectId)
        clientFiles = allFiles
          .filter(f => !f.isDirectory && f.content)
          .filter(f => {
            const p = f.path.toLowerCase()
            return !p.includes('node_modules') && !p.includes('.git/')
          })
          .map(f => ({
            name: f.name,
            path: f.path,
            content: f.content,
            type: f.type || f.path.split('.').pop(),
            size: f.content?.length || 0,
          }))
      }

      // Build messages history
      const chatHistory = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content,
      }))

      chatHistory.push({
        role: 'user',
        content: userMessage.content,
      })

      const response = await fetch('/api/activity-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          projectId,
          modelId: selectedModel,
          clientFiles,
          clientFileTree: projectFiles.map(f => f.path),
          fileContexts: userMessage.fileContexts || [],
          codebaseContext: userMessage.fileContexts?.some(c => c.type === 'codebase'),
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulatedText = ''
      let currentToolCalls: ToolCall[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)

            if (data.type === 'text-delta') {
              accumulatedText += data.textDelta
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: accumulatedText }
                  : m
              ))
            } else if (data.type === 'tool-call') {
              const toolCall: ToolCall = {
                id: data.toolCallId,
                name: data.toolName,
                args: data.args,
                status: 'pending',
              }
              currentToolCalls = [...currentToolCalls, toolCall]
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolCalls: currentToolCalls }
                  : m
              ))
            } else if (data.type === 'tool-result') {
              currentToolCalls = currentToolCalls.map(tc =>
                tc.id === data.toolCallId
                  ? { ...tc, result: data.result, status: data.result?.success ? 'done' : 'error' }
                  : tc
              )
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, toolCalls: currentToolCalls }
                  : m
              ))

              // If file was written/edited, trigger refresh
              if (data.toolName === 'write_file' || data.toolName === 'edit_file' || data.toolName === 'delete_file') {
                window.dispatchEvent(new CustomEvent('files-changed', {
                  detail: { projectId, forceRefresh: true }
                }))
              }
            }
          } catch {}
        }
      }

      // Mark as done
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, isStreaming: false }
          : m
      ))
    } catch (error: any) {
      if (error.name === 'AbortError') return
      console.error('Chat error:', error)
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: m.content || 'Sorry, an error occurred. Please try again.', isStreaming: false }
          : m
      ))
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [input, attachedContexts, isLoading, messages, projectId, projectFiles, selectedModel])

  // Stop streaming
  const handleStop = () => {
    abortRef.current?.abort()
    setIsLoading(false)
  }

  // Clear chat
  const handleClear = () => {
    setMessages([])
    setInput('')
    setAttachedContexts([])
  }

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAtMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedAtIndex(prev => prev + 1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedAtIndex(prev => Math.max(0, prev - 1))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        // Select current item
        if (atMenuType === 'main') {
          const options = getMainAtOptions()
          const opt = options[selectedAtIndex % options.length]
          if (opt) {
            if (opt.type === 'codebase') handleAtSelect('codebase')
            else if (opt.type === 'file') setAtMenuType('files')
            else if (opt.type === 'folder') setAtMenuType('folders')
          }
        } else if (atMenuType === 'files') {
          const files = getFilteredFiles()
          const file = files[selectedAtIndex % files.length]
          if (file) handleAtSelect('file', file.path)
        } else if (atMenuType === 'folders') {
          const folders = getFilteredFolders()
          const folder = folders[selectedAtIndex % folders.length]
          if (folder) handleAtSelect('folder', folder)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowAtMenu(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Main @ menu options
  const getMainAtOptions = (): AtMentionOption[] => [
    { id: 'file', label: 'File', description: 'Attach a file as context', icon: <FileText className="size-3.5 text-blue-400" />, type: 'file' },
    { id: 'folder', label: 'Folder', description: 'Attach folder tree', icon: <FolderTree className="size-3.5 text-yellow-400" />, type: 'folder' },
    { id: 'codebase', label: 'Codebase', description: 'Attach full codebase context', icon: <Database className="size-3.5 text-orange-400" />, type: 'codebase' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Chat</h3>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors rounded"
              title="Clear chat"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageSquare className="size-8 text-gray-700 mb-3" />
            <p className="text-xs text-gray-500 mb-1">Ask questions about your code</p>
            <p className="text-[10px] text-gray-600">Use @ to attach files, folders, or codebase context</p>
            {selectedFile && (
              <p className="text-[10px] text-orange-400/70 mt-2">Active: {selectedFile.name}</p>
            )}
          </div>
        )}

        <div className="p-3 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                /* User Message */
                <div className="flex justify-end">
                  <div className="max-w-[90%] min-w-0">
                    {/* Attached Contexts */}
                    {msg.fileContexts && msg.fileContexts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5 justify-end">
                        {msg.fileContexts.map((ctx, i) => (
                          <span key={i} className="inline-flex items-center gap-1 bg-gray-800 px-1.5 py-0.5 rounded text-[10px] text-gray-400">
                            {ctx.type === 'file' && <FileText className="size-2.5 text-blue-400" />}
                            {ctx.type === 'folder' && <Folder className="size-2.5 text-yellow-400" />}
                            {ctx.type === 'codebase' && <Database className="size-2.5 text-orange-400" />}
                            <span className="truncate max-w-[80px]">{ctx.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="bg-gray-800/70 rounded-2xl rounded-br-sm px-3.5 py-2.5">
                      <p className="text-gray-100 text-xs leading-relaxed whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>
                        {msg.content}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Assistant Message */
                <div className="w-full min-w-0">
                  {/* Tool Calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {msg.toolCalls.map((tc) => (
                        <div key={tc.id} className="flex items-center gap-1.5 text-[10px] text-gray-500 px-1">
                          {tc.status === 'pending' ? (
                            <Loader2 className="size-3 animate-spin text-orange-400" />
                          ) : tc.status === 'done' ? (
                            <Check className="size-3 text-green-400" />
                          ) : (
                            <X className="size-3 text-red-400" />
                          )}
                          <Wrench className="size-3 text-gray-600" />
                          <span className="text-gray-400 font-mono">{tc.name}</span>
                          {tc.name === 'write_file' && tc.args?.path && (
                            <button
                              onClick={() => onOpenFile?.(tc.args.path)}
                              className="text-blue-400 hover:text-blue-300 hover:underline truncate max-w-[120px]"
                            >
                              {tc.args.path}
                            </button>
                          )}
                          {tc.name === 'read_file' && tc.args?.path && (
                            <span className="text-gray-500 truncate max-w-[120px]">{tc.args.path}</span>
                          )}
                          {tc.name === 'edit_file' && tc.args?.filePath && (
                            <button
                              onClick={() => onOpenFile?.(tc.args.filePath)}
                              className="text-blue-400 hover:text-blue-300 hover:underline truncate max-w-[120px]"
                            >
                              {tc.args.filePath}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Message Content */}
                  {msg.content && (
                    <div className="text-xs text-gray-200 leading-relaxed overflow-hidden min-w-0" style={{ overflowWrap: 'anywhere' }}>
                      <Response className="text-xs [&>pre]:text-[10px] [&>pre]:rounded-lg [&>pre]:bg-gray-900/80 [&>pre]:border [&>pre]:border-gray-800/60 [&>p]:text-xs [&>p]:mb-2 [&>h1]:text-sm [&>h2]:text-xs [&>h3]:text-xs [&>ul]:text-xs [&>ol]:text-xs [&>li]:text-xs [&>blockquote]:text-xs">
                        {msg.content}
                      </Response>
                    </div>
                  )}
                  {/* Loading dots */}
                  {msg.isStreaming && !msg.content && (!msg.toolCalls || msg.toolCalls.length === 0) && (
                    <div className="flex gap-1 px-1 py-2">
                      <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Input Area - Fixed at bottom */}
      <div className="flex-shrink-0 p-3 border-t border-gray-800/60">
        {/* @ Mention Dropdown */}
        {showAtMenu && (
          <div className="mb-2 rounded-lg border border-gray-700/60 bg-gray-900/95 backdrop-blur-sm overflow-hidden shadow-xl">
            {atMenuType === 'main' && (
              <div className="py-1">
                <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-medium">Attach Context</div>
                {getMainAtOptions().map((opt, i) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (opt.type === 'codebase') handleAtSelect('codebase')
                      else if (opt.type === 'file') setAtMenuType('files')
                      else if (opt.type === 'folder') setAtMenuType('folders')
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                      selectedAtIndex % 3 === i ? "bg-orange-500/10 text-orange-300" : "text-gray-300 hover:bg-gray-800/60"
                    )}
                  >
                    {opt.icon}
                    <div>
                      <div className="text-xs font-medium">{opt.label}</div>
                      <div className="text-[10px] text-gray-500">{opt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {atMenuType === 'files' && (
              <div className="py-1 max-h-48 overflow-y-auto">
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Select File</span>
                  <button onClick={() => setAtMenuType('main')} className="text-[10px] text-gray-500 hover:text-gray-300">Back</button>
                </div>
                {getFilteredFiles().length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-gray-600">No files found</div>
                ) : (
                  getFilteredFiles().map((file, i) => (
                    <button
                      key={file.path}
                      onClick={() => handleAtSelect('file', file.path)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1 text-left transition-colors",
                        selectedAtIndex % getFilteredFiles().length === i ? "bg-orange-500/10 text-orange-300" : "text-gray-300 hover:bg-gray-800/60"
                      )}
                    >
                      {getFileIcon(file.name)}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] truncate">{file.name}</div>
                        <div className="text-[9px] text-gray-600 truncate">{file.path}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {atMenuType === 'folders' && (
              <div className="py-1 max-h-48 overflow-y-auto">
                <div className="px-3 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Select Folder</span>
                  <button onClick={() => setAtMenuType('main')} className="text-[10px] text-gray-500 hover:text-gray-300">Back</button>
                </div>
                {getFilteredFolders().length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-gray-600">No folders found</div>
                ) : (
                  getFilteredFolders().map((folder, i) => (
                    <button
                      key={folder}
                      onClick={() => handleAtSelect('folder', folder)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1 text-left transition-colors",
                        selectedAtIndex % getFilteredFolders().length === i ? "bg-orange-500/10 text-orange-300" : "text-gray-300 hover:bg-gray-800/60"
                      )}
                    >
                      <Folder className="size-3.5 text-yellow-400 flex-shrink-0" />
                      <span className="text-[11px] truncate">{folder}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Attached Contexts */}
        {attachedContexts.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {attachedContexts.map((ctx, i) => (
              <div key={i} className="flex items-center gap-1 bg-gray-800 px-2 py-0.5 rounded-lg text-[10px] text-gray-300 group">
                {ctx.type === 'file' && <FileText className="size-2.5 text-blue-400" />}
                {ctx.type === 'folder' && <Folder className="size-2.5 text-yellow-400" />}
                {ctx.type === 'codebase' && <Database className="size-2.5 text-orange-400" />}
                <span className="truncate max-w-[80px]">{ctx.name}</span>
                <button
                  onClick={() => removeContext(i)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Container - Same style as chat-panel-v2 */}
        <div className="relative rounded-2xl border border-gray-700/60 bg-gray-900/80 focus-within:border-gray-600 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type, @ for context..."
            className="w-full min-h-[36px] max-h-[140px] resize-none border-0 bg-transparent text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-0 px-3 pt-2 pb-1 text-xs leading-relaxed"
            disabled={isLoading}
            rows={1}
          />

          {/* Bottom Bar */}
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-0.5">
              {/* @ Button */}
              <button
                onClick={() => {
                  setShowAtMenu(!showAtMenu)
                  setAtMenuType('main')
                  textareaRef.current?.focus()
                }}
                className="h-6 w-6 flex items-center justify-center rounded text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                title="Attach context (@)"
              >
                <AtSign className="size-3.5" />
              </button>

              {/* File Import */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-6 w-6 flex items-center justify-center rounded text-gray-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                title="Import file"
              >
                <Paperclip className="size-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".ts,.tsx,.js,.jsx,.css,.html,.json,.md,.py,.txt,.yaml,.yml,.toml,.xml,.svg,.sql,.sh,.env"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>

            {/* Send / Stop Button */}
            {isLoading ? (
              <button
                onClick={handleStop}
                className="h-6 w-6 rounded-lg bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
              >
                <Square className="size-3 text-white fill-white" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && attachedContexts.length === 0}
                className="h-6 w-6 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                <ArrowUp className="size-3.5 text-white" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
