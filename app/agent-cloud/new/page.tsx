"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Github,
  GitBranch,
  ChevronDown,
  FolderGit2,
  Search,
  ArrowUp,
  Sparkles,
  ImageIcon,
  FileText,
  FileUp,
  Monitor,
  Globe,
  X,
  Plus,
  Check,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAgentCloud, MODELS, DEFAULT_MCPS } from "../layout"
import { usePageTitle } from '@/hooks/use-page-title'

export default function NewSessionPage() {
  usePageTitle('New Agent')
  const router = useRouter()
  const {
    repos,
    selectedRepo,
    setSelectedRepo,
    branches,
    selectedBranch,
    setSelectedBranch,
    selectedModel,
    setSelectedModel,
    isConnected,
    isLoadingTokens,
    isLoadingRepos,
    isLoadingBranches,
    loadBranches,
    createSession,
    setActiveSessionId,
    isCreating,
  } = useAgentCloud()

  // Claude and GPT models support image input via Bonsai
  const supportsImages = selectedModel === 'sonnet' || selectedModel === 'opus' || selectedModel === 'haiku'

  const [prompt, setPrompt] = useState('')
  const [repoSearchQuery, setRepoSearchQuery] = useState('')
  const [attachedImages, setAttachedImages] = useState<Array<{ data: string; type: string; name: string }>>([])
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string; content: string; size: number }>>([])
  const [isNewProject, setIsNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [playwrightEnabled, setPlaywrightEnabled] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const combinedFileInputRef = useRef<HTMLInputElement>(null)
  const commandMenuRef = useRef<HTMLDivElement>(null)

  // Filter repos by search
  const filteredRepos = repoSearchQuery
    ? repos.filter(repo =>
        repo.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase())
      )
    : repos

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 56), 200)
    textarea.style.height = `${newHeight}px`
  }, [prompt])

  // Handle repo selection
  const selectRepo = (repo: typeof repos[0]) => {
    setSelectedRepo(repo)
    loadBranches(repo.full_name)
    setRepoSearchQuery('')
  }

  // Handle image file selection (only for models that support images)
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!supportsImages) return
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: file.name }])
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  // Close command menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (commandMenuRef.current && !commandMenuRef.current.contains(e.target as Node)) {
        setShowCommandMenu(false)
      }
    }
    if (showCommandMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCommandMenu])

  const removeFile = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id))
  }

  // Combined file handler - routes images and text files appropriately
  const handleCombinedUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setShowCommandMenu(false)
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: file.name }])
        }
        reader.readAsDataURL(file)
      } else {
        const reader = new FileReader()
        reader.onload = () => {
          setAttachedFiles(prev => [...prev, {
            id: Date.now().toString() + Math.random(),
            name: file.name,
            content: reader.result as string,
            size: file.size
          }])
        }
        reader.readAsText(file)
      }
    }
    e.target.value = ''
  }

  // Handle paste for images (only for models that support images)
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!supportsImages) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1]
          setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: `pasted-${Date.now()}.${file.type.split('/')[1]}` }])
        }
        reader.readAsDataURL(file)
      }
    }
  }

  // Remove attached image
  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index))
  }

  // Drag-and-drop handlers (only for models that support images)
  const [isDragging, setIsDragging] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const handleDragOver = (e: React.DragEvent) => {
    if (!supportsImages) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (!supportsImages) return
    const files = e.dataTransfer?.files
    if (!files) return
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        setAttachedImages(prev => [...prev, { data: base64, type: file.type, name: file.name }])
      }
      reader.readAsDataURL(file)
    }
  }

  // Screen recording
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  const handleScreenToggle = async () => {
    if (isScreenSharing) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }
      setIsScreenSharing(false)
      return
    }

    try {
      setIsCapturing(true)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      mediaStreamRef.current = stream

      const video = document.createElement('video')
      video.srcObject = stream
      await video.play()
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      const base64 = canvas.toDataURL('image/png').split(',')[1]
      setAttachedImages(prev => [...prev, { data: base64, type: 'image/png', name: `screenshot-${Date.now()}.png` }])

      setIsScreenSharing(true)

      stream.getVideoTracks()[0].onended = () => {
        mediaStreamRef.current = null
        setIsScreenSharing(false)
      }
    } catch {
      // User cancelled screen selection
    } finally {
      setIsCapturing(false)
    }
  }

  // Handle submit
  const handleSubmit = async () => {
    if ((!prompt.trim() && attachedImages.length === 0 && attachedFiles.length === 0) || isCreating) return

    // If screen sharing is active, store flag so session page can resume it
    if (isScreenSharing && mediaStreamRef.current) {
      sessionStorage.setItem('agent-cloud-resume-sharing', 'true')
      // Stop the stream before navigating (browser will require new permission anyway)
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Build enhanced prompt with file context and Playwright instructions
    let enhancedPrompt = prompt.trim()

    if (attachedFiles.length > 0) {
      const fileContext = attachedFiles.map(f => `[Attached File: ${f.name} (${(f.size / 1024).toFixed(1)}KB)]\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')
      enhancedPrompt = `${fileContext}\n\n${enhancedPrompt}`
      setAttachedFiles([])
    }

    if (playwrightEnabled) {
      enhancedPrompt += `\n\n[Playwright Browser Testing - ENABLED]
The user has enabled Playwright for browser testing. When setting up browser testing:
1. Install Playwright as a dev dependency: pnpm add -D @playwright/test
2. Install Playwright Chromium browser from the project directory: pnpm exec playwright install chromium
3. Create playwright.config.ts in the project root with proper configuration (testDir: "./tests", baseURL: "http://localhost:3000", Chromium project, webServer config)
4. Create a tests/ directory and write test files as needed
5. Run tests with: pnpm exec playwright test
Use the Playwright MCP server for browser automation, interaction, and visual testing.`
    }

    if (isNewProject) {
      // New project mode - requires GitHub connection and project name
      if (!isConnected) return
      if (!projectName.trim()) return
      const session = await createSession(
        enhancedPrompt,
        attachedImages.length > 0 ? attachedImages : undefined,
        { name: projectName.trim() }
      )
      if (session) {
        setAttachedImages([])
        router.push(`/agent-cloud/session?id=${session.id}`)
      }
    } else {
      // Existing repo mode
      if (!selectedRepo) return
      const session = await createSession(enhancedPrompt, attachedImages.length > 0 ? attachedImages : undefined)
      if (session) {
        setAttachedImages([])
        router.push(`/agent-cloud/session?id=${session.id}`)
      }
    }
  }

  // Handle keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const currentModelInfo = MODELS.find(m => m.id === selectedModel)

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[720px]">
        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-100 tracking-tight">
            {getGreeting()}.
          </h1>
          <p className="text-gray-500 mt-2 text-base">
            What would you like to build today?
          </p>
        </div>

        {/* New Project Toggle */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setIsNewProject(!isNewProject)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              isNewProject ? 'bg-orange-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                isNewProject ? 'translate-x-[18px]' : 'translate-x-[3px]'
              }`}
            />
          </button>
          <span className="text-sm text-gray-400 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New project
          </span>
          {isNewProject && !isConnected && (
            <span className="text-xs text-red-400 ml-2">GitHub connection required</span>
          )}
        </div>

        {/* Project name input (shown in new project mode) */}
        {isNewProject && (
          <div className="mb-4">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
              placeholder="my-new-app"
              className="w-full bg-transparent border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 transition-colors"
            />
            <p className="text-[11px] text-gray-600 mt-1.5 px-1">
              This will be the GitHub repository name
            </p>
          </div>
        )}

        {/* Input card */}
        <div
          className={`relative rounded-2xl border transition-all ${
            isDragging
              ? 'border-orange-500/50 bg-orange-500/5'
              : 'border-gray-700/60 bg-gray-900/50 focus-within:border-gray-600'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10 pointer-events-none rounded-2xl">
              <div className="text-orange-400 text-sm font-medium">Drop images here</div>
            </div>
          )}

          {/* Attachment pills */}
          {(attachedImages.length > 0 || attachedFiles.length > 0) && (
            <div className="px-4 pt-3 flex flex-wrap gap-1.5">
              {attachedImages.map((img, i) => (
                <div
                  key={`img-${i}`}
                  className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group cursor-pointer"
                  onClick={() => setPreviewImage(`data:${img.type};base64,${img.data}`)}
                >
                  <ImageIcon className="size-3 text-gray-500" />
                  <span className="truncate max-w-[120px]">{img.name}</span>
                  <button
                    className="md:opacity-0 md:group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all"
                    onClick={(e) => { e.stopPropagation(); removeImage(i) }}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {attachedFiles.map(file => (
                <div key={file.id} className="flex items-center gap-1.5 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300 group">
                  <FileText className="size-3 text-gray-500" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button
                    className="md:opacity-0 md:group-hover:opacity-100 hover:text-red-400 text-gray-500 transition-all"
                    onClick={() => removeFile(file.id)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isNewProject ? "Describe the app you want to build..." : "What do you want to work on?"}
            disabled={isNewProject ? (!isConnected || !projectName.trim() || isCreating) : (!selectedRepo || isCreating)}
            className="w-full bg-transparent resize-none outline-none text-sm text-gray-100 placeholder:text-gray-500 min-h-[56px] max-h-[200px] leading-relaxed px-4 pt-4 pb-2"
            rows={2}
          />

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <input
            ref={combinedFileInputRef}
            type="file"
            multiple
            onChange={handleCombinedUpload}
            className="hidden"
          />

          {/* Bottom toolbar */}
          <div className="px-3 pb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Plus context menu */}
              <div className="relative" ref={commandMenuRef}>
                <button
                  type="button"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                  onClick={() => setShowCommandMenu(!showCommandMenu)}
                >
                  <Plus className={`size-4 transition-transform ${showCommandMenu ? 'rotate-45' : ''}`} />
                </button>

                {showCommandMenu && (
                  <div className="absolute bottom-10 left-0 w-[260px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[80] overflow-hidden">
                    <div className="py-1.5">
                      {/* Add images or files */}
                      <button
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                        onClick={() => {
                          setShowCommandMenu(false)
                          combinedFileInputRef.current?.click()
                        }}
                      >
                        <FileUp className="size-4 text-gray-400" />
                        <span>Add images or files</span>
                      </button>

                      {/* Capture screen */}
                      <button
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                        onClick={() => {
                          setShowCommandMenu(false)
                          handleScreenToggle()
                        }}
                      >
                        <Monitor className={`size-4 ${isScreenSharing ? 'text-red-400' : 'text-gray-400'}`} />
                        <span>{isScreenSharing ? 'Stop screen sharing' : 'Capture screen'}</span>
                        {isScreenSharing && <div className="ml-auto w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
                      </button>

                      <div className="my-1.5 border-t border-gray-700/50" />

                      {/* Playwright toggle */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                        onClick={() => setPlaywrightEnabled(!playwrightEnabled)}
                      >
                        <div className="flex items-center gap-3">
                          <Globe className="size-4 text-gray-400" />
                          <span>Playwright</span>
                        </div>
                        {playwrightEnabled && <Check className="size-4 text-green-400" />}
                      </button>

                      <div className="my-1.5 border-t border-gray-700/50" />

                      {/* MCP Tools info */}
                      <div className="px-4 py-2 text-[11px] text-gray-500">
                        <span className="font-medium text-gray-400">MCP Tools</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {DEFAULT_MCPS.map(mcp => (
                            <span key={mcp.id} className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-500">{mcp.name}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="w-px h-4 bg-gray-800 mx-0.5" />

              {/* Repo selector */}
              {!isNewProject && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-800/60">
                      <Github className="h-3.5 w-3.5" />
                      <span className="max-w-[80px] truncate">
                        {selectedRepo ? selectedRepo.name : 'Repo'}
                      </span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-72 bg-gray-900 border-gray-700 max-h-80 overflow-hidden">
                    {isLoadingTokens || isLoadingRepos ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                        <span>Loading...</span>
                      </div>
                    ) : !isConnected ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        <Github className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p className="mb-2">GitHub not connected</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.location.href = '/workspace/deployment'}
                          className="text-xs"
                        >
                          Connect GitHub
                        </Button>
                      </div>
                    ) : repos.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No repositories found
                      </div>
                    ) : (
                      <>
                        <div className="p-2 border-b border-gray-800">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                            <input
                              type="text"
                              placeholder="Search..."
                              value={repoSearchQuery}
                              onChange={(e) => setRepoSearchQuery(e.target.value)}
                              className="w-full bg-gray-800/50 border border-gray-700 rounded-md pl-8 pr-3 py-1.5 text-sm placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto max-h-60">
                          {filteredRepos.map(repo => (
                            <DropdownMenuItem
                              key={repo.id}
                              onClick={() => selectRepo(repo)}
                              className="flex items-center gap-2 cursor-pointer py-2.5"
                            >
                              <FolderGit2 className="h-4 w-4 text-gray-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-medium">{repo.name}</span>
                                  {repo.private && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                      private
                                    </Badge>
                                  )}
                                </div>
                                {repo.description && (
                                  <div className="text-xs text-gray-500 truncate">{repo.description}</div>
                                )}
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Branch selector */}
              {!isNewProject && selectedRepo && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-800/60">
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>{selectedBranch}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-gray-900 border-gray-700 max-h-60 overflow-y-auto">
                    {isLoadingBranches ? (
                      <div className="p-2 text-center">
                        <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                      </div>
                    ) : branches.length === 0 ? (
                      <div className="p-2 text-center text-gray-500 text-xs">
                        No branches
                      </div>
                    ) : (
                      branches.map(branch => (
                        <DropdownMenuItem
                          key={branch}
                          onClick={() => setSelectedBranch(branch)}
                          className="cursor-pointer font-mono text-sm"
                        >
                          {branch}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Model selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-800/60">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{currentModelInfo?.name || selectedModel}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="bg-gray-900 border-gray-700 w-[240px]">
                  {MODELS.map(model => (
                    <DropdownMenuItem
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`cursor-pointer ${model.id === selectedModel ? 'bg-gray-800/50' : ''}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div>
                          <div className="font-medium text-sm">{model.name}</div>
                          <div className="text-xs text-gray-500">{model.description}</div>
                        </div>
                        {model.id === selectedModel && (
                          <Check className="h-4 w-4 text-orange-400 shrink-0 ml-2" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={
                (!prompt.trim() && attachedImages.length === 0 && attachedFiles.length === 0) ||
                (isNewProject ? (!isConnected || !projectName.trim()) : !selectedRepo) ||
                isCreating
              }
              className="h-8 w-8 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 text-white animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4 text-white" />
              )}
            </button>
          </div>
        </div>

        {/* Helper text */}
        <p className="text-center mt-3 text-[11px] text-gray-600">
          Press <kbd className="mx-0.5 px-1 py-0.5 rounded bg-gray-800/60 text-gray-500 font-mono text-[10px]">Enter</kbd> to send, <kbd className="mx-0.5 px-1 py-0.5 rounded bg-gray-800/60 text-gray-500 font-mono text-[10px]">Shift+Enter</kbd> for new line
        </p>
      </div>

      {/* Image preview dialog */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 p-2 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
          <img
            src={previewImage}
            alt="Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
