"use client"

import * as React from "react"
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  Bug,
  Code,
  FileText,
  TestTube,
  Rocket,
  Undo2,
  GitBranch,
  Brain,
  Sparkles,
  Zap,
  Search,
  MessageSquare,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Settings,
  HelpCircle,
  Share2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: LucideIcon
  category: "actions" | "code" | "project" | "chat" | "help"
  action: () => void
  shortcut?: string
}

interface SlashCommandsProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (command: SlashCommand) => void
  query: string
  position: { top: number; left: number }
  commands: SlashCommand[]
}

// Default commands that can be customized
export function getDefaultSlashCommands(handlers: {
  onFix?: () => void
  onExplain?: () => void
  onRefactor?: () => void
  onTest?: () => void
  onDeploy?: () => void
  onRollback?: () => void
  onBranch?: () => void
  onMemory?: () => void
  onOptimize?: () => void
  onSearch?: () => void
  onNewChat?: () => void
  onClearChat?: () => void
  onExportChat?: () => void
  onShareToTeam?: () => void
  onImportContext?: () => void
  onRegenerate?: () => void
  onSettings?: () => void
  onHelp?: () => void
}): SlashCommand[] {
  return [
    // Actions
    {
      id: "fix",
      label: "Fix",
      description: "Fix the last error or issue",
      icon: Bug,
      category: "actions",
      action: handlers.onFix || (() => {}),
      shortcut: "⌘F",
    },
    {
      id: "explain",
      label: "Explain",
      description: "Explain selected code or concept",
      icon: MessageSquare,
      category: "actions",
      action: handlers.onExplain || (() => {}),
      shortcut: "⌘E",
    },
    {
      id: "optimize",
      label: "Optimize",
      description: "Optimize code for performance",
      icon: Zap,
      category: "actions",
      action: handlers.onOptimize || (() => {}),
    },

    // Code
    {
      id: "refactor",
      label: "Refactor",
      description: "Refactor with best practices",
      icon: Sparkles,
      category: "code",
      action: handlers.onRefactor || (() => {}),
      shortcut: "⌘R",
    },
    {
      id: "test",
      label: "Test",
      description: "Generate tests for current file",
      icon: TestTube,
      category: "code",
      action: handlers.onTest || (() => {}),
      shortcut: "⌘T",
    },
    {
      id: "search",
      label: "Search",
      description: "Search codebase semantically",
      icon: Search,
      category: "code",
      action: handlers.onSearch || (() => {}),
      shortcut: "⌘K",
    },

    // Project
    {
      id: "deploy",
      label: "Deploy",
      description: "Deploy to Vercel",
      icon: Rocket,
      category: "project",
      action: handlers.onDeploy || (() => {}),
      shortcut: "⌘D",
    },
    {
      id: "rollback",
      label: "Rollback",
      description: "Revert last AI changes",
      icon: Undo2,
      category: "project",
      action: handlers.onRollback || (() => {}),
      shortcut: "⌘Z",
    },
    {
      id: "branch",
      label: "Branch",
      description: "Create conversation branch",
      icon: GitBranch,
      category: "project",
      action: handlers.onBranch || (() => {}),
    },

    // Chat
    {
      id: "memory",
      label: "Memory",
      description: "Show what AI remembers",
      icon: Brain,
      category: "chat",
      action: handlers.onMemory || (() => {}),
    },
    {
      id: "new",
      label: "New Chat",
      description: "Start a new conversation",
      icon: MessageSquare,
      category: "chat",
      action: handlers.onNewChat || (() => {}),
      shortcut: "⌘N",
    },
    {
      id: "clear",
      label: "Clear",
      description: "Clear current chat history",
      icon: Trash2,
      category: "chat",
      action: handlers.onClearChat || (() => {}),
    },
    {
      id: "export",
      label: "Export",
      description: "Export chat as markdown",
      icon: Download,
      category: "chat",
      action: handlers.onExportChat || (() => {}),
    },
    {
      id: "share",
      label: "Share to Team",
      description: "Share this chat with your team",
      icon: Share2,
      category: "chat",
      action: handlers.onShareToTeam || (() => {}),
    },
    {
      id: "context",
      label: "Import Context",
      description: "Import external context or docs",
      icon: Upload,
      category: "chat",
      action: handlers.onImportContext || (() => {}),
    },
    {
      id: "regenerate",
      label: "Regenerate",
      description: "Regenerate last response",
      icon: RefreshCw,
      category: "chat",
      action: handlers.onRegenerate || (() => {}),
      shortcut: "⌘⇧R",
    },

    // Help
    {
      id: "settings",
      label: "Settings",
      description: "Open settings panel",
      icon: Settings,
      category: "help",
      action: handlers.onSettings || (() => {}),
      shortcut: "⌘,",
    },
    {
      id: "help",
      label: "Help",
      description: "Show available commands",
      icon: HelpCircle,
      category: "help",
      action: handlers.onHelp || (() => {}),
      shortcut: "⌘/",
    },
  ]
}

// Category labels
const categoryLabels: Record<string, string> = {
  actions: "Actions",
  code: "Code",
  project: "Project",
  chat: "Chat",
  help: "Help",
}

export function SlashCommands({
  isOpen,
  onClose,
  onSelect,
  query,
  position,
  commands,
}: SlashCommandsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query) return commands

    const lowerQuery = query.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lowerQuery) ||
        cmd.description.toLowerCase().includes(lowerQuery) ||
        cmd.id.toLowerCase().includes(lowerQuery)
    )
  }, [commands, query])

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, SlashCommand[]> = {}
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => {
    return Object.values(groupedCommands).flat()
  }, [groupedCommands])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev < flatCommands.length - 1 ? prev + 1 : 0
          )
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : flatCommands.length - 1
          )
          break
        case "Enter":
          e.preventDefault()
          if (flatCommands[selectedIndex]) {
            onSelect(flatCommands[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          onClose()
          break
        case "Tab":
          e.preventDefault()
          if (e.shiftKey) {
            setSelectedIndex((prev) =>
              prev > 0 ? prev - 1 : flatCommands.length - 1
            )
          } else {
            setSelectedIndex((prev) =>
              prev < flatCommands.length - 1 ? prev + 1 : 0
            )
          }
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, flatCommands, selectedIndex, onSelect, onClose])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && flatCommands[selectedIndex]) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      )
      selectedElement?.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex, flatCommands])

  if (!isOpen || flatCommands.length === 0) return null

  let globalIndex = 0

  return (
    <div
      className="fixed z-50 w-72 max-h-80 overflow-hidden rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateY(-100%)",
      }}
    >
      <div ref={listRef} className="overflow-y-auto max-h-72 py-1">
        {Object.entries(groupedCommands).map(([category, cmds]) => (
          <div key={category}>
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              {categoryLabels[category] || category}
            </div>
            {cmds.map((cmd) => {
              const currentIndex = globalIndex++
              const Icon = cmd.icon
              return (
                <div
                  key={cmd.id}
                  data-index={currentIndex}
                  className={cn(
                    "flex items-center gap-3 px-2 py-1.5 mx-1 rounded-md cursor-pointer transition-colors",
                    currentIndex === selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted"
                  )}
                  onClick={() => onSelect(cmd)}
                  onMouseEnter={() => setSelectedIndex(currentIndex)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">/{cmd.label.toLowerCase()}</span>
                      {cmd.shortcut && (
                        <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                          {cmd.shortcut}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {cmd.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between bg-muted/30">
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
        <span>Esc Close</span>
      </div>
    </div>
  )
}

// Hook to manage slash commands state
export function useSlashCommands() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const open = useCallback((pos: { top: number; left: number }) => {
    setPosition(pos)
    setIsOpen(true)
    setQuery("")
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery("")
  }, [])

  const updateQuery = useCallback((newQuery: string) => {
    setQuery(newQuery)
  }, [])

  return {
    isOpen,
    query,
    position,
    open,
    close,
    updateQuery,
    setIsOpen,
  }
}
